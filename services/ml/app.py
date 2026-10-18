"""UrbanTrace stretch model service: /transcribe (F9), /blur (F11), /depth (F13).

Run: services/ml/.venv/Scripts/python -m uvicorn app:app --port 8001 (from services/ml)
Runs on the CPU, so it does not compete with Ollama for the GPU. Models load on first use.

Models and licences:
- Whisper small through faster-whisper (Systran/faster-whisper-small): MIT
- YuNet face detector (opencv/face_detection_yunet): MIT
- YOLOv9-t number plate detector from open-image-models: MIT
- Depth Anything V2 Small, ONNX (onnx-community/depth-anything-v2-small): Apache 2.0
"""

import os
import tempfile
import threading
from typing import Any

import cv2
import numpy as np
from fastapi import FastAPI, File, HTTPException, Response, UploadFile

app = FastAPI(title="UrbanTrace ML")

MAX_AUDIO_S = 35  # the browser records up to 30 s
MAX_IMAGE_BYTES = 15 * 1024 * 1024

_lock = threading.Lock()
_models: dict[str, Any] = {}
# OpenCV's face detector keeps per-call state (its input size), so detection runs one image at a time.
_detect_lock = threading.Lock()


def _model(name: str) -> Any:
    """Load each model once, on first use."""
    with _lock:
        if name not in _models:
            _models[name] = _LOADERS[name]()
        return _models[name]


def _load_whisper() -> Any:
    from faster_whisper import WhisperModel

    return WhisperModel("small", device="cpu", compute_type="int8")


def _load_faces() -> Any:
    from huggingface_hub import hf_hub_download

    path = hf_hub_download("opencv/face_detection_yunet", "face_detection_yunet_2023mar.onnx")
    return cv2.FaceDetectorYN.create(path, "", (320, 320), score_threshold=0.6)


def _load_plates() -> Any:
    from open_image_models import create_detector

    return create_detector("yolo-v9-t-640-license-plate-end2end", conf_thresh=0.3, providers=["CPUExecutionProvider"])


def _load_depth() -> Any:
    import onnxruntime as ort
    from huggingface_hub import hf_hub_download

    path = hf_hub_download("onnx-community/depth-anything-v2-small", "onnx/model.onnx")
    return ort.InferenceSession(path, providers=["CPUExecutionProvider"])


_LOADERS = {"whisper": _load_whisper, "faces": _load_faces, "plates": _load_plates, "depth": _load_depth}


def _read_image(data: bytes) -> np.ndarray:
    if not data or len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(400, "Send one image under 15 MB")
    img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(400, "Could not read the image")
    return img


@app.get("/health")
def health() -> dict[str, Any]:
    return {"ok": True, "loaded": sorted(_models)}


@app.post("/transcribe")
def transcribe(audio: UploadFile = File(...)) -> dict[str, Any]:
    """F9: speech to text in the speaker's language, up to 30 s."""
    data = audio.file.read()
    if not data:
        raise HTTPException(400, "Send an audio file")
    suffix = os.path.splitext(audio.filename or "")[1] or ".webm"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
        f.write(data)
        path = f.name
    try:
        segments, info = _model("whisper").transcribe(path, beam_size=1, vad_filter=True)
        if info.duration > MAX_AUDIO_S:
            raise HTTPException(400, "Keep the voice note under 30 seconds")
        text = " ".join(s.text.strip() for s in segments).strip()
    finally:
        os.unlink(path)
    return {"text": text, "language": info.language, "duration": round(info.duration, 1)}


def _blur_box(img: np.ndarray, x1: float, y1: float, x2: float, y2: float, pad: float = 0.15) -> None:
    h, w = img.shape[:2]
    bw, bh = x2 - x1, y2 - y1
    x1, y1 = max(0, int(x1 - bw * pad)), max(0, int(y1 - bh * pad))
    x2, y2 = min(w, int(x2 + bw * pad)), min(h, int(y2 + bh * pad))
    if x2 <= x1 or y2 <= y1:
        return
    k = max(15, (max(x2 - x1, y2 - y1) // 2) | 1)
    roi = img[y1:y2, x1:x2]
    img[y1:y2, x1:x2] = cv2.GaussianBlur(cv2.GaussianBlur(roi, (k, k), 0), (k, k), 0)


@app.post("/blur")
def blur(image: UploadFile = File(...)) -> Response:
    """F11: blur faces and number plates; returns the JPEG with counts in X-Faces and X-Plates."""
    img = _read_image(image.file.read())
    h, w = img.shape[:2]

    faces = _model("faces")
    plates = _model("plates")
    with _detect_lock:
        faces.setInputSize((w, h))
        _, found = faces.detect(img)
        plate_results = plates.predict(img)
    face_boxes = [] if found is None else [(f[0], f[1], f[0] + f[2], f[1] + f[3]) for f in found]
    plate_boxes = [(d.bounding_box.x1, d.bounding_box.y1, d.bounding_box.x2, d.bounding_box.y2) for d in plate_results]

    for box in face_boxes + plate_boxes:
        _blur_box(img, *box)

    ok, out = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 85])
    if not ok:
        raise HTTPException(500, "Could not encode the image")
    return Response(
        out.tobytes(),
        media_type="image/jpeg",
        headers={"X-Faces": str(len(face_boxes)), "X-Plates": str(len(plate_boxes))},
    )


DEPTH_SIZE = 518  # a multiple of the model's 14 px patch
MEAN = np.array([0.485, 0.456, 0.406], np.float32)
STD = np.array([0.229, 0.224, 0.225], np.float32)


@app.post("/depth")
def depth(image: UploadFile = File(...)) -> dict[str, Any]:
    """F13: a rough pothole depth class from relative depth.

    The model gives relative inverse depth (larger is closer), not centimetres. We fit a plane to the
    road around the centre of the photo, where the pothole is framed, and measure how far the centre
    drops below that plane, relative to the plane's own range. The class is an estimate.
    """
    img = _read_image(image.file.read())
    rgb = cv2.cvtColor(cv2.resize(img, (DEPTH_SIZE, DEPTH_SIZE), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2RGB)
    x = ((rgb.astype(np.float32) / 255.0 - MEAN) / STD).transpose(2, 0, 1)[None]
    session = _model("depth")
    d = session.run(None, {session.get_inputs()[0].name: x})[0].reshape(DEPTH_SIZE, DEPTH_SIZE)

    small = cv2.resize(d, (64, 64), interpolation=cv2.INTER_AREA)
    ys, xs = np.mgrid[0:64, 0:64]
    centre = (abs(xs - 31.5) < 13) & (abs(ys - 31.5) < 13)
    ring = ~centre
    a = np.c_[xs[ring], ys[ring], np.ones(ring.sum())]
    coef, *_ = np.linalg.lstsq(a, small[ring], rcond=None)
    plane = coef[0] * xs + coef[1] * ys + coef[2]
    scale = float(plane.max() - plane.min()) or float(small.max() - small.min()) or 1.0
    drop = float(-np.percentile((small - plane)[centre], 5)) / scale

    depth_class = "shallow" if drop < 0.04 else "moderate" if drop < 0.10 else "deep"
    return {"depth_class": depth_class, "score": round(drop, 3)}
