"use client";

// Step one of a report: a photo, a short video (features 1) or just talking (features 11, 12).
import { Camera, Mic, Video } from "lucide-react";
import { useState, type ChangeEvent, type ReactNode } from "react";
import { Button, buttonClasses } from "@/components/ui/Button";
import { extractFrames, MAX_VIDEO_SECONDS, type VideoFrame } from "@/lib/frames";
import type { MediaKind } from "@/lib/reports";
import { Capture } from "./Capture";
import { VoiceNote } from "./VoiceNote";

export type Evidence =
  | { kind: "photo"; file: File; url: string }
  | { kind: "video"; frames: VideoFrame[]; duration: number }
  | { kind: "voice" };

type Props = {
  mode: MediaKind;
  onMode: (m: MediaKind) => void;
  evidence: Evidence | null;
  onEvidence: (e: Evidence | null) => void;
  transcript: string;
  onTranscript: (text: string, language?: string) => void;
  mlOn: boolean;
  onNext: () => void;
};

const TABS: { kind: MediaKind; label: string; Icon: typeof Camera }[] = [
  { kind: "photo", label: "Photo", Icon: Camera },
  { kind: "video", label: "Video", Icon: Video },
  { kind: "voice", label: "Just talk", Icon: Mic },
];

export function EvidencePicker({ mode, onMode, evidence, onEvidence, transcript, onTranscript, mlOn, onNext }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onVideo = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      setError("That file is not a video.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { frames, duration } = await extractFrames(file);
      onEvidence({ kind: "video", frames, duration });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read the video.");
    } finally {
      setBusy(false);
    }
  };

  const voice: ReactNode = mlOn ? <VoiceNote value={transcript} onChange={onTranscript} /> : null;

  return (
    <div className="flex flex-col gap-6">
      <div role="tablist" aria-label="Evidence" className="grid grid-cols-3 gap-2 rounded-full bg-ink-800 p-1">
        {TABS.filter((t) => t.kind !== "voice" || mlOn).map(({ kind, label, Icon }) => (
          <button
            key={kind}
            role="tab"
            type="button"
            aria-selected={mode === kind}
            onClick={() => {
              onMode(kind);
              onEvidence(kind === "voice" ? { kind: "voice" } : null);
              setError(null);
            }}
            className={`flex items-center justify-center gap-2 rounded-full py-2.5 text-sm font-bold transition-colors ${mode === kind ? "bg-signal text-ink-950" : "text-fog-300 hover:text-fog-50"}`}
          >
            <Icon size={16} aria-hidden /> {label}
          </button>
        ))}
      </div>

      {mode === "photo" && (
        <Capture
          photoUrl={evidence?.kind === "photo" ? evidence.url : null}
          error={error}
          onCapture={(file) => {
            if (!file.type.startsWith("image/")) {
              setError("That file is not a photo.");
              return;
            }
            setError(null);
            onEvidence({ kind: "photo", file, url: URL.createObjectURL(file) });
          }}
          onNext={onNext}
          voiceNote={voice}
        />
      )}

      {mode === "video" && (
        <div className="flex flex-col gap-5">
          {evidence?.kind === "video" ? (
            <>
              <div className="grid grid-cols-3 gap-2">
                {evidence.frames.map((f, i) => (
                  <figure key={f.url} className="relative aspect-[4/5] overflow-hidden rounded-photo bg-ink-800">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f.url} alt={`Frame ${i + 1}`} className="h-full w-full object-cover" />
                    <figcaption className="num absolute bottom-1 left-1 rounded bg-ink-950/75 px-1.5 text-[11px]">
                      F{i + 1} · {f.time}s
                    </figcaption>
                  </figure>
                ))}
              </div>
              <p className="text-sm text-fog-300">
                {evidence.frames.length} frames from a {Math.round(evidence.duration)} second video. The model reads them together.
              </p>
              {voice}
              <div className="flex flex-wrap gap-3">
                <Button onClick={onNext}>Use video</Button>
                <label className={buttonClasses("secondary", "cursor-pointer")}>
                  Record again
                  <input type="file" accept="video/*" capture="environment" className="sr-only" onChange={(e) => void onVideo(e)} />
                </label>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-5 py-8 text-center">
              <h2 className="font-display text-[32px] leading-tight font-semibold">Film up to {MAX_VIDEO_SECONDS} seconds</h2>
              <p className="max-w-sm text-fog-300">Walk past the problem slowly. The AI finds every issue in the video and points to the frames that show it.</p>
              <label className="flex size-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-full bg-signal text-ink-950 transition-transform active:scale-[0.97]">
                <Video size={40} aria-hidden />
                <span className="text-sm font-bold">{busy ? "Reading…" : "Record video"}</span>
                <input type="file" accept="video/*" capture="environment" className="sr-only" onChange={(e) => void onVideo(e)} disabled={busy} />
              </label>
              {error && (
                <p role="alert" className="text-sm">
                  {error}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {mode === "voice" && (
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <h2 className="font-display text-[32px] leading-tight font-semibold">Just talk</h2>
            <p className="text-fog-300">
              Say what is wrong and where, in English, हिन्दी, ಕನ್ನಡ, தமிழ் or తెలుగు. The AI turns it into a case and only asks you to confirm the
              location.
            </p>
          </div>
          {voice}
          <p className="text-xs text-fog-500">A photo helps the city verify the fix later; you can add one to the issue afterwards.</p>
          <div>
            <Button onClick={onNext} disabled={!transcript.trim()}>
              Use voice note
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
