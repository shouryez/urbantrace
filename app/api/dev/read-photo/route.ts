// Dev only: Phase 0 gate check. GET shows a bare upload form for a phone, POST runs Job 1 on one
// photo and returns the validated JSON. Disabled in production builds.
import { askVision, ModelReplyError } from "@/lib/ai/ollama";
import { PHOTO_READING_SYSTEM, PHOTO_READING_USER } from "@/lib/ai/prompts";
import { photoReadingJsonSchema, photoReadingSchema } from "@/lib/ai/schemas";
import { toModelImage } from "@/lib/images";

const MAX_BYTES = 15 * 1024 * 1024;
const isProd = process.env.NODE_ENV === "production";

const FORM = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>UrbanTrace · read photo test</title>
<style>
  body{margin:0;padding:16px;background:#0E1013;color:#F1F3F2;font:16px/1.6 system-ui,sans-serif}
  button{border:0;border-radius:999px;padding:10px 20px;background:#F5B700;color:#0E1013;font-weight:600}
  pre{white-space:pre-wrap;word-break:break-word;background:#1D2127;border-radius:14px;padding:12px;font-size:14px}
</style></head>
<body>
  <h1>Read photo (Job 1)</h1>
  <form id="f"><input type="file" name="photo" accept="image/*" capture="environment" required>
  <p><button>Send to model</button></p></form>
  <pre id="out">Pick or take a photo.</pre>
  <script>
    const f = document.getElementById('f'), out = document.getElementById('out');
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); out.textContent = 'Model is reading the photo...';
      try {
        const res = await fetch(location.pathname, { method: 'POST', body: new FormData(f) });
        out.textContent = res.status + '\\n' + JSON.stringify(await res.json(), null, 2);
      } catch (err) { out.textContent = String(err); }
    });
  </script>
</body></html>`;

export async function GET() {
  if (isProd) return new Response("Not found", { status: 404 });
  return new Response(FORM, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export async function POST(request: Request) {
  if (isProd) return new Response("Not found", { status: 404 });

  const form = await request.formData();
  const photo = form.get("photo");
  if (!(photo instanceof File) || !photo.type.startsWith("image/")) {
    return Response.json({ ok: false, error: "Send one image in the 'photo' field" }, { status: 400 });
  }
  if (photo.size > MAX_BYTES) {
    return Response.json({ ok: false, error: "Photo is larger than 15 MB" }, { status: 413 });
  }

  let image: string;
  try {
    image = await toModelImage(Buffer.from(await photo.arrayBuffer()));
  } catch {
    return Response.json({ ok: false, error: "Could not read that image format" }, { status: 415 });
  }

  const started = performance.now();
  try {
    const reading = await askVision(
      PHOTO_READING_SYSTEM,
      PHOTO_READING_USER,
      [image],
      photoReadingJsonSchema,
      photoReadingSchema,
    );
    return Response.json({
      ok: true,
      model: process.env.VISION_MODEL,
      seconds: Math.round((performance.now() - started) / 100) / 10,
      reading,
    });
  } catch (err) {
    if (err instanceof ModelReplyError) {
      return Response.json({ ok: false, error: err.message, lastReply: err.lastReply }, { status: 422 });
    }
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : "Model call failed" },
      { status: 502 },
    );
  }
}
