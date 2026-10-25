from __future__ import annotations

import base64
import io
import logging
import os
import time
from contextlib import asynccontextmanager
from typing import Any

import cv2
from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, UnidentifiedImageError
from ultralytics import YOLO


LOGGER = logging.getLogger("sightline.api")
MODEL_NAME = os.getenv("MODEL_NAME", "yolo26n.pt")
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", str(12 * 1024 * 1024)))
MAX_IMAGE_PIXELS = int(os.getenv("MAX_IMAGE_PIXELS", str(30_000_000)))
SUPPORTED_FORMATS = {"JPEG", "PNG", "WEBP"}


def _allowed_origins() -> list[str]:
    raw = os.getenv(
        "FRONTEND_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000",
    )
    return [origin.strip().rstrip("/") for origin in raw.split(",") if origin.strip()]


@asynccontextmanager
async def lifespan(app: FastAPI):
    LOGGER.info("Loading YOLO model %s", MODEL_NAME)
    app.state.model = YOLO(MODEL_NAME)
    LOGGER.info("YOLO model is ready")
    yield


app = FastAPI(
    title="Sightline YOLO API",
    description="Image object detection powered by Ultralytics YOLO.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins(),
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, Any]:
    model = getattr(app.state, "model", None)
    return {"status": "ready" if model is not None else "loading", "model": MODEL_NAME}


def _decode_image(payload: bytes) -> tuple[Image.Image, int, int]:
    try:
        with Image.open(io.BytesIO(payload)) as source:
            image_format = (source.format or "").upper()
            if image_format not in SUPPORTED_FORMATS:
                raise HTTPException(
                    status_code=415,
                    detail="Use a JPEG, PNG, or WebP image.",
                )
            source.verify()

        with Image.open(io.BytesIO(payload)) as source:
            width, height = source.size
            if width < 1 or height < 1:
                raise HTTPException(status_code=400, detail="This image has invalid dimensions.")
            if width * height > MAX_IMAGE_PIXELS:
                raise HTTPException(
                    status_code=413,
                    detail="This image is too large to process. Try one with fewer pixels.",
                )
            return source.convert("RGB"), width, height
    except HTTPException:
        raise
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError, ValueError) as error:
        raise HTTPException(
            status_code=400,
            detail="We couldn't read this file as an image. Try a JPEG, PNG, or WebP image.",
        ) from error


def _serialize_detections(result: Any, width: int, height: int) -> list[dict[str, Any]]:
    detections: list[dict[str, Any]] = []
    if result.boxes is None:
        return detections

    names = result.names
    for box in result.boxes:
        coordinates = box.xyxy[0].detach().cpu().tolist()
        class_id = int(box.cls[0].detach().cpu().item())
        confidence = float(box.conf[0].detach().cpu().item())
        class_name = names.get(class_id, str(class_id)) if isinstance(names, dict) else names[class_id]
        x1, y1, x2, y2 = coordinates
        detections.append(
            {
                "class_id": class_id,
                "class_name": str(class_name),
                "confidence": round(confidence, 5),
                "box": {
                    "x1": round(max(0.0, min(float(width), x1)), 2),
                    "y1": round(max(0.0, min(float(height), y1)), 2),
                    "x2": round(max(0.0, min(float(width), x2)), 2),
                    "y2": round(max(0.0, min(float(height), y2)), 2),
                },
            }
        )
    return sorted(detections, key=lambda detection: detection["confidence"], reverse=True)


@app.post("/api/detect")
async def detect(
    file: UploadFile = File(...),
    confidence: float = Query(default=0.35, ge=0.1, le=0.9),
) -> dict[str, Any]:
    payload = await file.read(MAX_UPLOAD_BYTES + 1)
    await file.close()

    if not payload:
        raise HTTPException(status_code=400, detail="Choose an image before running detection.")
    if len(payload) > MAX_UPLOAD_BYTES:
        limit_mb = MAX_UPLOAD_BYTES // (1024 * 1024)
        raise HTTPException(status_code=413, detail=f"Images must be {limit_mb} MB or smaller.")

    image, width, height = _decode_image(payload)
    model = getattr(app.state, "model", None)
    if model is None:
        raise HTTPException(status_code=503, detail="The detection model is still starting up. Try again shortly.")

    started_at = time.perf_counter()
    try:
        results = model.predict(source=image, conf=confidence, verbose=False)
        result = results[0]
        detections = _serialize_detections(result, width, height)
        annotated_bgr = result.plot(labels=True, conf=True)
        encoded_ok, encoded_image = cv2.imencode(
            ".jpg",
            annotated_bgr,
            [cv2.IMWRITE_JPEG_QUALITY, 90],
        )
        if not encoded_ok:
            raise RuntimeError("OpenCV could not encode the annotated image")
    except HTTPException:
        raise
    except Exception as error:
        LOGGER.exception("YOLO inference failed")
        raise HTTPException(
            status_code=500,
            detail="The model couldn't process this image. Please try again with a different image.",
        ) from error

    elapsed_ms = round((time.perf_counter() - started_at) * 1000)
    image_data = base64.b64encode(encoded_image.tobytes()).decode("ascii")

    return {
        "model": MODEL_NAME,
        "image_width": width,
        "image_height": height,
        "elapsed_ms": elapsed_ms,
        "confidence_threshold": confidence,
        "detections": detections,
        "annotated_image": f"data:image/jpeg;base64,{image_data}",
    }
