// Server only: speech to text with Sarvam AI (https://docs.sarvam.ai), built for Indian languages and
// code-mixed speech like Kanglish and Hinglish. The language is detected automatically.

export class SarvamError extends Error {}

export function sarvamEnabled(): boolean {
  return !!process.env.SARVAM_API_KEY;
}

/** Transcript and detected language ("kn", "hi", "en", ...) of a short voice note (under 30 s). */
export async function sarvamTranscribe(audio: Blob, filename: string): Promise<{ text: string; language: string }> {
  const key = process.env.SARVAM_API_KEY;
  if (!key) throw new SarvamError("SARVAM_API_KEY is not set");
  const form = new FormData();
  form.set("file", audio, filename);
  form.set("model", process.env.SARVAM_STT_MODEL ?? "saaras:v4");
  form.set("language_code", "unknown");
  const res = await fetch("https://api.sarvam.ai/speech-to-text", {
    method: "POST",
    headers: { "api-subscription-key": key },
    body: form,
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new SarvamError(`Sarvam returned ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { transcript?: unknown; language_code?: unknown };
  const code = typeof data.language_code === "string" ? data.language_code : "";
  return { text: typeof data.transcript === "string" ? data.transcript.trim() : "", language: code.split("-")[0]!.toLowerCase() };
}
