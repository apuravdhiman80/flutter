"""FastAPI endpoints for the Vision Studio detector."""

from __future__ import annotations

import asyncio
import io
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import BaseModel

from api.detector import MODEL_NAME, model_status, predict, start_model_loading

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_IMAGE_PIXELS = 50_000_000
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}


class ImageSize(BaseModel):
    width: int
    height: int


class BoundingBox(BaseModel):
    x: float
    y: float
    width: float
    height: float


class Detection(BaseModel):
    className: str
    confidence: float
    box: BoundingBox


class DetectionResponse(BaseModel):
    image: ImageSize
    detections: list[Detection]


@asynccontextmanager
async def lifespan(_: FastAPI):
    start_model_loading()
    yield


app = FastAPI(title="Vision Studio Detector API", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


@app.get("/api/health")
async def health() -> dict[str, str]:
    state, error = model_status()
    if state != "ready":
        detail = "The detection model is still loading." if state == "loading" else "The detection model could not be loaded."
        if error:
            detail = f"{detail} {error[:240]}"
        raise HTTPException(status_code=503, detail={"status": state, "message": detail})
    return {"status": "ready", "model": MODEL_NAME.removesuffix(".pt")}


@app.post("/api/detect", response_model=DetectionResponse)
async def detect(
    file: Annotated[UploadFile, File()],
    confidence: Annotated[float, Form()] = 0.25,
) -> DetectionResponse:
    if not 0.05 <= confidence <= 0.95:
        raise HTTPException(status_code=422, detail="Confidence must be between 0.05 and 0.95.")
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=415, detail="Use a JPEG, PNG, or WebP image.")

    contents = await file.read(MAX_UPLOAD_BYTES + 1)
    await file.close()
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Images must be 10 MB or smaller.")

    try:
        with Image.open(io.BytesIO(contents)) as opened:
            opened.verify()
        with Image.open(io.BytesIO(contents)) as opened:
            oriented = ImageOps.exif_transpose(opened)
            if oriented.width * oriented.height > MAX_IMAGE_PIXELS:
                raise HTTPException(status_code=413, detail="Image dimensions are too large to process safely.")
            image = oriented.convert("RGB")
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError, ValueError) as error:
        raise HTTPException(status_code=400, detail="This file is not a valid image.") from error

    state, _ = model_status()
    if state != "ready":
        raise HTTPException(status_code=503, detail="The detection model is still starting. Try again shortly.")

    try:
        detections = await asyncio.to_thread(predict, image, confidence)
    except Exception as error:
        raise HTTPException(status_code=500, detail="Detection failed. Please try this image again.") from error

    width, height = image.size
    return DetectionResponse(
        image=ImageSize(width=width, height=height),
        detections=[Detection(**item) for item in detections],
    )
