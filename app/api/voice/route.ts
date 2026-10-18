// POST /api/voice (F9): a voice note of up to 30 s, transcribed by Sarvam AI when SARVAM_API_KEY is set,
// else (or if Sarvam fails) by Whisper on the model service.
import { MlServiceError, mlEnabled, transcribe } from "@/lib/ml";
import { sarvamEnabled, sarvamTranscribe } from "@/lib/sarvam";

const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(request: Request) {
  if (!sarvamEnabled() && !mlEnabled()) return Response.json({ error: "Voice notes are not available on this server" }, { status: 503 });
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
  const name = audio.name || "note.webm";

  if (sarvamEnabled()) {
    try {
      const { text, language } = await sarvamTranscribe(audio, name);
      if (text) return Response.json({ text, language, engine: "sarvam" });
    } catch (err) {
      console.error("Sarvam transcription failed:", err);
      if (!mlEnabled()) return Response.json({ error: "Could not transcribe right now. Type it instead." }, { status: 502 });
    }
  }
  try {
    const { text, language } = await transcribe(audio, name);
    return Response.json({ text, language, engine: "whisper" });
  } catch (err) {
    console.error("Transcription failed:", err);
    const busy = err instanceof MlServiceError;
    return Response.json({ error: busy ? "Could not transcribe right now. Type it instead." : "Transcription failed" }, { status: 502 });
  }
}
