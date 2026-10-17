"""In-memory YOLO model loading and prediction helpers."""

from __future__ import annotations

import os
import threading
from typing import Any

from PIL import Image
from ultralytics import YOLO

MODEL_NAME = os.getenv("VISION_MODEL", "yolo26n.pt")

_state_lock = threading.Lock()
_inference_lock = threading.Lock()
_model: YOLO | None = None
_state = "loading"
_load_error: str | None = None
_loader_started = False


def _load() -> None:
    global _model, _state, _load_error
    try:
        model = YOLO(MODEL_NAME)
        with _state_lock:
            _model = model
            _state = "ready"
            _load_error = None
    except Exception as error:  # Keep the API alive so health can report a useful state.
        with _state_lock:
            _state = "error"
            _load_error = str(error)


def start_model_loading() -> None:
    """Start model loading in the background, once per process."""
    global _loader_started
    with _state_lock:
        if _loader_started or _state != "loading":
            return
        _loader_started = True
        thread = threading.Thread(target=_load, name="vision-model-loader", daemon=True)
        thread.start()


def model_status() -> tuple[str, str | None]:
    with _state_lock:
        return _state, _load_error


def predict(image: Image.Image, confidence: float) -> list[dict[str, Any]]:
    """Run one prediction and return normalized, image-relative boxes."""
    width, height = image.size
    with _inference_lock:
        with _state_lock:
            model = _model
        if model is None:
            raise RuntimeError("The detection model is not ready.")
        result = model.predict(source=image, conf=confidence, verbose=False)[0]

    detections: list[dict[str, Any]] = []
    if result.boxes is None:
        return detections

    coordinates = result.boxes.xyxy.cpu().tolist()
    scores = result.boxes.conf.cpu().tolist()
    classes = result.boxes.cls.cpu().tolist()
    names = result.names

    for (left, top, right, bottom), score, class_id in zip(coordinates, scores, classes):
        x1 = max(0.0, min(1.0, left / width))
        y1 = max(0.0, min(1.0, top / height))
        x2 = max(x1, min(1.0, right / width))
        y2 = max(y1, min(1.0, bottom / height))
        class_index = int(class_id)
        detections.append(
            {
                "className": str(names.get(class_index, class_index)),
                "confidence": float(score),
                "box": {"x": x1, "y": y1, "width": x2 - x1, "height": y2 - y1},
            }
        )

    return detections
