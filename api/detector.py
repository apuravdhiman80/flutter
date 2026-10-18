"""Fast, local YOLO detector with model loading isolated from the API startup."""

from __future__ import annotations

import os
import threading
from pathlib import Path
from typing import Any

from PIL import Image

PROJECT_ROOT = Path(__file__).resolve().parent.parent
MODEL_SETTING = os.getenv("VISION_MODEL", "yolo26n.pt")
MODEL_PATH = Path(MODEL_SETTING)
if not MODEL_PATH.is_absolute():
    MODEL_PATH = PROJECT_ROOT / MODEL_PATH
MODEL_PATH = MODEL_PATH.resolve()
MODEL_NAME = MODEL_PATH.stem

_state_lock = threading.Lock()
_inference_lock = threading.Lock()
_model: Any | None = None
_state = "loading"
_load_error: str | None = None
_loader_started = False


def _load() -> None:
    global _model, _state, _load_error
    try:
        if not MODEL_PATH.is_file():
            raise FileNotFoundError(f"Detector weights were not found at {MODEL_PATH}.")

        # Import PyTorch and Ultralytics in the background too. Importing them at
        # module load blocks health checks and makes the web app appear frozen.
        cpu_threads = max(1, min(4, os.cpu_count() or 1))
        os.environ.setdefault("OMP_NUM_THREADS", str(cpu_threads))
        os.environ.setdefault("MKL_NUM_THREADS", str(cpu_threads))
        import torch

        torch.set_num_threads(cpu_threads)
        try:
            torch.set_num_interop_threads(1)
        except RuntimeError:
            # Another library may have initialized the inter-op pool already.
            pass
        from ultralytics import YOLO

        model = YOLO(str(MODEL_PATH), verbose=False)
        # Pay the one-time PyTorch backend startup cost here. The first real
        # camera frame should use the warmed model instead of appearing stuck.
        warmup_image = Image.new("RGB", (640, 640), color=(114, 114, 114))
        model.predict(source=warmup_image, conf=0.25, imgsz=640, verbose=False)
        with _state_lock:
            _model = model
            _state = "ready"
            _load_error = None
    except Exception as error:  # Keep the API alive so health can explain a bad install.
        with _state_lock:
            _state = "error"
            _load_error = str(error)


def start_model_loading() -> None:
    """Start only the small detector, without blocking API startup."""
    global _loader_started
    with _state_lock:
        if _loader_started:
            return
        _loader_started = True
        threading.Thread(target=_load, name="vision-model-loader", daemon=True).start()


def model_status() -> tuple[str, str | None]:
    with _state_lock:
        return _state, _load_error


def _coordinates_to_detection(
    coordinates: list[list[float]],
    scores: list[float],
    classes: list[float],
    names: dict[int, str] | list[str],
    width: int,
    height: int,
) -> list[dict[str, Any]]:
    detections: list[dict[str, Any]] = []
    for (left, top, right, bottom), score, class_id in zip(coordinates, scores, classes):
        x1 = max(0.0, min(1.0, left / width))
        y1 = max(0.0, min(1.0, top / height))
        x2 = max(x1, min(1.0, right / width))
        y2 = max(y1, min(1.0, bottom / height))
        class_index = int(class_id)
        if isinstance(names, dict):
            class_name = names.get(class_index, str(class_index))
        else:
            class_name = names[class_index] if 0 <= class_index < len(names) else str(class_index)
        detections.append(
            {
                "className": str(class_name),
                "confidence": float(score),
                "box": {"x": x1, "y": y1, "width": x2 - x1, "height": y2 - y1},
            }
        )
    return detections


def predict(image: Image.Image, confidence: float) -> list[dict[str, Any]]:
    """Run one local prediction and return image-relative boxes in the 0–1 range."""
    with _state_lock:
        model = _model
        state = _state
        error = _load_error
    if model is None:
        detail = error[:240] if error else f"The local detector is {state}."
        raise RuntimeError(detail)

    width, height = image.size
    with _inference_lock:
        result = model.predict(source=image, conf=confidence, imgsz=640, verbose=False)[0]

    if result.boxes is None:
        return []
    return _coordinates_to_detection(
        result.boxes.xyxy.cpu().tolist(),
        result.boxes.conf.cpu().tolist(),
        result.boxes.cls.cpu().tolist(),
        result.names,
        width,
        height,
    )
