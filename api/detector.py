"""In-memory local and open-vocabulary YOLO models."""

from __future__ import annotations

import os
import threading
from typing import Any

from PIL import Image
from ultralytics import YOLO, YOLOWorld

MODEL_NAME = os.getenv("VISION_MODEL", "yolo26n.pt")
WORLD_MODEL_NAME = os.getenv("VISION_WORLD_MODEL", "yolov8s-worldv2.pt")

_state_lock = threading.Lock()
_inference_lock = threading.Lock()
_model: YOLO | None = None
_world_model: YOLOWorld | None = None
_state = "loading"
_world_state = "loading"
_load_error: str | None = None
_world_load_error: str | None = None
_loader_started = False
_world_classes: tuple[str, ...] = ()


def _load() -> None:
    global _model, _state, _load_error
    try:
        model = YOLO(MODEL_NAME, verbose=False)
        with _state_lock:
            _model = model
            _state = "ready"
            _load_error = None
    except Exception as error:  # Keep the API alive so health can report a useful state.
        with _state_lock:
            _state = "error"
            _load_error = str(error)


def _load_world() -> None:
    global _world_model, _world_state, _world_load_error
    try:
        model = YOLOWorld(WORLD_MODEL_NAME, verbose=False)
        with _state_lock:
            _world_model = model
            _world_state = "ready"
            _world_load_error = None
    except Exception as error:  # Keep the local model usable if this larger model fails.
        with _state_lock:
            _world_state = "error"
            _world_load_error = str(error)


def start_model_loading() -> None:
    """Load both model weights in the background so health stays responsive."""
    global _loader_started
    with _state_lock:
        if _loader_started:
            return
        _loader_started = True
        threading.Thread(target=_load, name="vision-model-loader", daemon=True).start()
        threading.Thread(target=_load_world, name="vision-world-model-loader", daemon=True).start()


def model_status() -> tuple[str, str | None]:
    with _state_lock:
        return _state, _load_error


def world_model_status() -> tuple[str, str | None]:
    with _state_lock:
        return _world_state, _world_load_error


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


def predict(
    image: Image.Image,
    confidence: float,
    provider: str = "local",
    prompt: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Run one prediction and return image-relative boxes in the 0–1 range."""
    global _world_classes

    with _state_lock:
        model: YOLO | YOLOWorld | None = _world_model if provider == "world" else _model
        state = _world_state if provider == "world" else _state
        error = _world_load_error if provider == "world" else _load_error
    if model is None:
        detail = error[:240] if error else "The detection model is still loading."
        raise RuntimeError(detail)

    width, height = image.size
    with _inference_lock:
        if provider == "world":
            classes = tuple(prompt or ())
            if not classes:
                raise ValueError("Enter one or more object names for open-vocabulary detection.")
            if classes != _world_classes:
                model.set_classes(list(classes))
                _world_classes = classes
        result = model.predict(source=image, conf=confidence, verbose=False)[0]

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
