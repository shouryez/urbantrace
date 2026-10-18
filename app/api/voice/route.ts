// POST /api/voice (F9): a voice note of up to 30 s, forwarded to the model service for a transcript.
import { MlServiceError, mlEnabled, transcribe } from "@/lib/ml";

const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(request: Request) {
  if (!mlEnabled()) return Response.json({ error: "Voice notes are not available on this server" }, { status: 503 });
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Expected multipart form data" }, { status: 400 });
  }
  const audio = form.get("audio");
  if (!(audio instanceof File) || !audio.type.startsWith("audio/")) {
    return Response.json({ error: "Send one recording as 'audio'" }, { status: 400 });
  }
  if (audio.size > MAX_BYTES) return Response.json({ error: "Keep the voice note under 30 seconds" }, { status: 413 });

  try {
    const { text, language } = await transcribe(audio, audio.name || "note.webm");
    return Response.json({ text, language });
  } catch (err) {
    console.error("Transcription failed:", err);
    const busy = err instanceof MlServiceError;
    return Response.json({ error: busy ? "Could not transcribe right now. Type it instead." : "Transcription failed" }, { status: 502 });
  }
}
