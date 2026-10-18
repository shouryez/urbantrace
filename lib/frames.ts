// Browser only: pulls evenly spaced still frames out of a short video (feature 1), so the server
// gets plain JPEGs and needs no video decoder. Frames are scaled to fit 1280 px.

export type VideoFrame = { blob: Blob; url: string; time: number };

export const MAX_VIDEO_SECONDS = 20;

function seek(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = () => {
      video.removeEventListener("seeked", done);
      resolve();
    };
    video.addEventListener("seeked", done);
    video.addEventListener("error", () => reject(new Error("Could not read the video")), { once: true });
    video.currentTime = time;
  });
}

export async function extractFrames(file: File, count = 6): Promise<{ frames: VideoFrame[]; duration: number }> {
  const src = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = src;
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error("This video format cannot be read here"));
    });
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    if (!duration) throw new Error("Could not read the video length");
    if (duration > MAX_VIDEO_SECONDS + 1) throw new Error(`Keep the video under ${MAX_VIDEO_SECONDS} seconds`);
    const n = Math.max(2, Math.min(count, Math.ceil(duration / 1.5)));
    const scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not prepare the frames");
    const frames: VideoFrame[] = [];
    for (let i = 0; i < n; i++) {
      const t = Math.min(duration - 0.05, 0.3 + ((duration - 0.6) * i) / Math.max(1, n - 1));
      await seek(video, t);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
      if (blob) frames.push({ blob, url: URL.createObjectURL(blob), time: Math.round(t * 10) / 10 });
    }
    return { frames, duration };
  } finally {
    URL.revokeObjectURL(src);
  }
}
