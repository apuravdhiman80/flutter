"""FastAPI endpoints for the Vision Studio detector."""

from __future__ import annotations

import asyncio
import base64
import io
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated, Literal

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import BaseModel

load_dotenv(Path(__file__).with_name(".env"), override=False)

from api.detector import (  # noqa: E402
    MODEL_NAME,
    model_status,
    predict,
    start_model_loading,
    world_model_status,
)

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_IMAGE_PIXELS = 50_000_000
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
GOOGLE_VISION_API_KEY = os.getenv("GOOGLE_CLOUD_VISION_API_KEY", "").strip()
GOOGLE_VISION_URL = "https://vision.googleapis.com/v1/images:annotate"


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


app = FastAPI(title="Vision Studio Detector API", version="1.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


def _localize_with_google(contents: bytes, image_size: tuple[int, int], confidence: float) -> list[dict[str, object]]:
    """Use Google Cloud Vision Object Localization, keeping the API key server-side."""
    query = urllib.parse.urlencode({"key": GOOGLE_VISION_API_KEY})
    payload = {
        "requests": [
            {
                "image": {"content": base64.b64encode(contents).decode("ascii")},
                "features": [{"type": "OBJECT_LOCALIZATION", "maxResults": 100}],
            }
        ]
    }
    request = urllib.request.Request(
        f"{GOOGLE_VISION_URL}?{query}",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json; charset=utf-8"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            body = json.loads(response.read())
    except urllib.error.HTTPError as error:
        raise HTTPException(
            status_code=502,
            detail=f"Google Cloud Vision returned HTTP {error.code}. Check the API key, billing, and Vision API access.",
        ) from error
    except (urllib.error.URLError, TimeoutError) as error:
        raise HTTPException(status_code=502, detail="Could not reach Google Cloud Vision. Check your internet connection and try again.") from error
    except (json.JSONDecodeError, OSError) as error:
        raise HTTPException(status_code=502, detail="Google Cloud Vision returned an unreadable response.") from error

    annotation = body.get("responses", [{}])[0]
    remote_error = annotation.get("error")
    if remote_error:
        message = remote_error.get("message", "The Google Vision request failed.")
        raise HTTPException(status_code=502, detail=f"Google Cloud Vision: {message[:240]}")

    image_width, image_height = image_size
    detections: list[dict[str, object]] = []
    for item in annotation.get("localizedObjectAnnotations", []):
        score = float(item.get("score", 0))
        if score < confidence:
            continue
        vertices = item.get("boundingPoly", {}).get("normalizedVertices", [])
        if not vertices:
            continue
        xs = [float(vertex.get("x", 0)) for vertex in vertices]
        ys = [float(vertex.get("y", 0)) for vertex in vertices]
        x1 = max(0.0, min(1.0, min(xs)))
        y1 = max(0.0, min(1.0, min(ys)))
        x2 = max(x1, min(1.0, max(xs)))
        y2 = max(y1, min(1.0, max(ys)))
        detections.append(
            {
                "className": str(item.get("name", "object")),
                "confidence": score,
                "box": {"x": x1, "y": y1, "width": x2 - x1, "height": y2 - y1},
            }
        )
    return detections


@app.get("/api/health")
async def health() -> dict[str, object]:
    state, error = model_status()
    world_state, world_error = world_model_status()
    if state != "ready":
        detail = "The local detection model is still loading." if state == "loading" else "The local detection model could not be loaded."
        if error:
            detail = f"{detail} {error[:240]}"
        raise HTTPException(
            status_code=503,
            detail={"status": state, "message": detail, "worldStatus": world_state, "googleConfigured": bool(GOOGLE_VISION_API_KEY)},
        )
    response: dict[str, object] = {
        "status": "ready",
        "model": MODEL_NAME.removesuffix(".pt"),
        "worldStatus": world_state,
        "googleConfigured": bool(GOOGLE_VISION_API_KEY),
    }
    if world_error:
        response["worldMessage"] = f"The open-vocabulary model could not be loaded. {world_error[:220]}"
    return response


@app.post("/api/detect", response_model=DetectionResponse)
async def detect(
    request: Request,
    confidence: Annotated[float, Query(ge=0.05, le=0.95)] = 0.25,
    provider: Literal["local", "world", "google"] = "local",
    prompt: Annotated[str, Query(max_length=1000)] = "",
) -> DetectionResponse:
    content_type = request.headers.get("content-type", "").split(";", maxsplit=1)[0].lower()
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=415, detail="Send a JPEG, PNG, or WebP image.")

    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > MAX_UPLOAD_BYTES:
                raise HTTPException(status_code=413, detail="Images must be 10 MB or smaller.")
        except ValueError as error:
            raise HTTPException(status_code=400, detail="Invalid content length.") from error

    chunks: list[bytes] = []
    size = 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail="Images must be 10 MB or smaller.")
        chunks.append(chunk)
    contents = b"".join(chunks)
    if not contents:
        raise HTTPException(status_code=400, detail="The image body is empty.")

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

    if provider == "google":
        if not GOOGLE_VISION_API_KEY:
            raise HTTPException(status_code=503, detail="Google Cloud Vision is not configured. Add GOOGLE_CLOUD_VISION_API_KEY to api/.env and restart the API.")
        detections = await asyncio.to_thread(_localize_with_google, contents, image.size, confidence)
    else:
        if provider == "world":
            world_state, world_error = world_model_status()
            if world_state != "ready":
                detail = "The open-vocabulary model is still loading. Try again shortly." if world_state == "loading" else "The open-vocabulary model is unavailable. Check the API log for the model download error."
                if world_error:
                    detail = f"{detail} {world_error[:200]}"
                raise HTTPException(status_code=503, detail=detail)
            classes = [entry.strip() for entry in prompt.split(",") if entry.strip()]
            if not classes:
                raise HTTPException(status_code=422, detail="Enter comma-separated object names to search for.")
            if len(classes) > 30 or any(len(entry) > 80 for entry in classes):
                raise HTTPException(status_code=422, detail="Use up to 30 object names, each no longer than 80 characters.")
            prompt = ",".join(dict.fromkeys(entry.casefold() for entry in classes))
            classes = prompt.split(",")
        else:
            classes = None

        state, _ = model_status()
        if state != "ready":
            raise HTTPException(status_code=503, detail="The local detection model is still starting. Try again shortly.")

        try:
            detections = await asyncio.to_thread(predict, image, confidence, provider, classes)
        except Exception as error:
            raise HTTPException(status_code=500, detail="Detection failed. Check the detector log and try this image again.") from error

    width, height = image.size
    return DetectionResponse(
        image=ImageSize(width=width, height=height),
        detections=[Detection(**item) for item in detections],
    )
