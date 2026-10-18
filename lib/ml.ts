// Server only: the stretch model service in services/ml (F9 voice, F11 blurring, F13 depth).
// The service is optional. Without ML_SERVICE_URL these features are off; with it, blurring is
// required, so a photo that could not be blurred is never stored.

import { DEPTH_CLASSES, type DepthClass } from "@/lib/reports";

export class MlServiceError extends Error {}

function baseUrl(): string | null {
  return process.env.ML_SERVICE_URL?.replace(/\/$/, "") || null;
}

export function mlEnabled(): boolean {
  return baseUrl() !== null;
}

async function post(path: string, field: string, blob: Blob, filename: string, timeoutMs: number): Promise<Response> {
  const url = baseUrl();
  if (!url) throw new MlServiceError("ML_SERVICE_URL is not set");
  const form = new FormData();
  form.set(field, blob, filename);
  let res: Response;
  try {
    res = await fetch(`${url}${path}`, { method: "POST", body: form, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    throw new MlServiceError(`ML service unreachable: ${String(err)}`);
  }
  if (!res.ok) throw new MlServiceError(`ML service ${path} returned ${res.status}: ${await res.text()}`);
  return res;
}

const jpeg = (buf: Buffer) => new Blob([new Uint8Array(buf)], { type: "image/jpeg" });

/** F11: faces and number plates blurred. Returns the photo unchanged when the service is off; throws if it fails. */
export async function blurPhoto(buf: Buffer): Promise<Buffer> {
  if (!mlEnabled()) return buf;
  const res = await post("/blur", "image", jpeg(buf), "photo.jpg", 60_000);
  return Buffer.from(await res.arrayBuffer());
}

/** F13: a rough depth class for a pothole photo, or null when the service is off or fails. */
export async function estimateDepth(buf: Buffer): Promise<DepthClass | null> {
  if (!mlEnabled()) return null;
  try {
    const res = await post("/depth", "image", jpeg(buf), "photo.jpg", 30_000);
    const { depth_class } = (await res.json()) as { depth_class?: unknown };
    return DEPTH_CLASSES.includes(depth_class as DepthClass) ? (depth_class as DepthClass) : null;
  } catch (err) {
    console.error("Depth estimate failed:", err);
    return null;
  }
}

/** F9: transcript of a voice note. Throws MlServiceError when the service is off or fails. */
export async function transcribe(audio: Blob, filename: string): Promise<{ text: string; language: string }> {
  const res = await post("/transcribe", "audio", audio, filename, 90_000);
  const data = (await res.json()) as { text?: unknown; language?: unknown };
  return { text: typeof data.text === "string" ? data.text : "", language: typeof data.language === "string" ? data.language : "" };
}
