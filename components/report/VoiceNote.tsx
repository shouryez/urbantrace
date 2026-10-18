"use client";

import { Mic, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { TRANSCRIPT_MAX } from "@/lib/reports";

const MAX_SECONDS = 30;

type VoiceNoteProps = {
  value: string;
  onChange: (text: string) => void;
};

type State = { kind: "idle" } | { kind: "recording"; seconds: number } | { kind: "transcribing" } | { kind: "error"; message: string };

function pickMime(): string {
  // Chrome and Firefox record webm; Safari records mp4.
  for (const type of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

/** F9: optional voice note of up to 30 s; the transcript goes to the model with the photo, and can be edited. */
export function VoiceNote({ value, onChange }: VoiceNoteProps) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<number | null>(null);

  const stopTimer = () => {
    if (timer.current !== null) window.clearInterval(timer.current);
    timer.current = null;
  };
  useEffect(
    () => () => {
      stopTimer();
      recorder.current?.stream.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  const send = async (blob: Blob) => {
    setState({ kind: "transcribing" });
    const form = new FormData();
    form.set("audio", blob, blob.type.includes("mp4") ? "note.mp4" : "note.webm");
    try {
      const res = await fetch("/api/voice", { method: "POST", body: form });
      const body = (await res.json()) as { text?: string; error?: string };
      if (!res.ok || typeof body.text !== "string") {
        setState({ kind: "error", message: body.error ?? "Could not transcribe the note." });
        return;
      }
      onChange(body.text.slice(0, TRANSCRIPT_MAX));
      setState({ kind: "idle" });
    } catch {
      setState({ kind: "error", message: "Network error. Type the note instead." });
    }
  };

  const start = async () => {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setState({ kind: "error", message: "Microphone access was blocked. You can type the note instead." });
      return;
    }
    const mime = pickMime();
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
    rec.onstop = () => {
      stopTimer();
      stream.getTracks().forEach((t) => t.stop());
      void send(new Blob(chunks, { type: rec.mimeType || "audio/webm" }));
    };
    recorder.current = rec;
    rec.start();
    setState({ kind: "recording", seconds: 0 });
    const startedAt = Date.now();
    timer.current = window.setInterval(() => {
      const seconds = Math.floor((Date.now() - startedAt) / 1000);
      if (seconds >= MAX_SECONDS) rec.stop();
      else setState({ kind: "recording", seconds });
    }, 250);
  };

  const stop = () => recorder.current?.state === "recording" && recorder.current.stop();

  return (
    <div className="flex flex-col gap-3 rounded-card border border-white/6 bg-asphalt-800 p-4">
      <div className="flex flex-wrap items-center gap-3">
        {state.kind === "recording" ? (
          <Button variant="secondary" onClick={stop}>
            <Square size={14} strokeWidth={1.75} aria-hidden /> Stop
          </Button>
        ) : (
          <Button variant="secondary" onClick={() => void start()} disabled={state.kind === "transcribing"}>
            <Mic size={16} strokeWidth={1.75} aria-hidden /> {value ? "Record again" : "Add a voice note"}
          </Button>
        )}
        <span className="text-sm text-mist-300" aria-live="polite">
          {state.kind === "recording" && (
            <span className="font-mono text-chalk-50">
              0:{String(state.seconds).padStart(2, "0")} / 0:{MAX_SECONDS}
            </span>
          )}
          {state.kind === "transcribing" && "Transcribing…"}
          {state.kind === "idle" && !value && "Optional. Any language, up to 30 seconds."}
        </span>
      </div>
      {state.kind === "error" && (
        <p role="alert" className="text-sm text-chalk-50">
          {state.message}
        </p>
      )}
      {(value || state.kind === "error") && (
        <label className="flex flex-col gap-1">
          <span className="kicker text-mist-300">Voice note</span>
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={3}
            maxLength={TRANSCRIPT_MAX}
            placeholder="What should the city know?"
            className="rounded-[14px] border border-white/6 bg-asphalt-700 p-3 text-sm"
          />
        </label>
      )}
    </div>
  );
}
