"""Image-only OpenAI Vision API for the Sightline web app."""

from __future__ import annotations

import asyncio
import base64
import io
import json
import os
import urllib.error
import urllib.request
from pathlib import Path
from typing import Annotated

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import BaseModel, Field

ENV_FILE = Path(__file__).with_name(".env")
load_dotenv(ENV_FILE, override=True)

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_IMAGE_PIXELS = 50_000_000
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
OPENAI_VISION_MODEL = os.getenv("OPENAI_VISION_MODEL", "gpt-6-luna").strip() or "gpt-6-luna"
OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"


def _get_openai_api_key() -> str:
    """Reload the API-side env file so a saved key takes effect without a restart."""
    load_dotenv(ENV_FILE, override=True)
    return os.getenv("OPENAI_API_KEY", "").strip()


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
    description: str = ""
    attributes: list[str] = Field(default_factory=list)


class SceneAnalysis(BaseModel):
    overview: str = ""
    setting: str = ""
    visibleText: list[str] = Field(default_factory=list)
    notableDetails: list[str] = Field(default_factory=list)


class DetectionResponse(BaseModel):
    image: ImageSize
    detections: list[Detection]
    analysis: SceneAnalysis


app = FastAPI(title="Sightline OpenAI Vision API", version="2.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


def _text_list(value: object, limit: int = 10, item_length: int = 300) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item).strip()[:item_length] for item in value[:limit] if str(item).strip()]


def _analyze_with_openai(
    contents: bytes,
    content_type: str,
    image_size: tuple[int, int],
    focus: str,
    api_key: str,
) -> tuple[list[dict[str, object]], dict[str, object]]:
    """Return detailed scene notes and approximate object boxes for one image."""
    focus_instruction = f"Give extra attention to: {focus.strip()}. " if focus.strip() else ""
    instructions = (
        "Analyze this single image carefully and return a useful, detailed visual report. "
        "Describe only what is visible. Do not guess hidden facts, identities, exact materials, or intent; "
        "mark uncertain interpretations as uncertain. Identify distinct physical objects, including objects "
        "outside common benchmark categories, while avoiding duplicate boxes for the same object. "
        "For every object, provide a concise but informative description of visible appearance, position, "
        "condition, and any clear relationship to nearby objects. Include a scene overview, a cautious "
        "setting description, readable text exactly as seen, and a few notable visual details. "
        f"{focus_instruction}For each object, provide a tight approximate box. Coordinates x1, y1, x2, y2 "
        "must be numbers from 0 to 1000 measured across the full image from its top-left to bottom-right. "
        "Confidence is an estimate from 0 to 1, not a calibrated measurement. Return an empty objects list "
        "when no physical object can be identified."
    )
    schema = {
        "type": "object",
        "properties": {
            "overview": {"type": "string"},
            "setting": {"type": "string"},
            "visibleText": {"type": "array", "items": {"type": "string"}},
            "notableDetails": {"type": "array", "items": {"type": "string"}},
            "objects": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "label": {"type": "string"},
                        "description": {"type": "string"},
                        "attributes": {"type": "array", "items": {"type": "string"}},
                        "confidence": {"type": "number"},
                        "x1": {"type": "number"},
                        "y1": {"type": "number"},
                        "x2": {"type": "number"},
                        "y2": {"type": "number"},
                    },
                    "required": ["label", "description", "attributes", "confidence", "x1", "y1", "x2", "y2"],
                    "additionalProperties": False,
                },
            },
        },
        "required": ["overview", "setting", "visibleText", "notableDetails", "objects"],
        "additionalProperties": False,
    }

    payload = {
        "model": OPENAI_VISION_MODEL,
        "store": False,
        "reasoning": {"effort": "medium"},
        "instructions": instructions,
        "input": [
            {
                "role": "user",
                "content": [
                    {"type": "input_text", "text": "Return a deep visual analysis and approximate boxes for this image."},
                    {
                        "type": "input_image",
                        "image_url": f"data:{content_type};base64,{base64.b64encode(contents).decode('ascii')}",
                        "detail": "high",
                    },
                ],
            }
        ],
        "text": {
            "format": {
                "type": "json_schema",
                "name": "deep_image_analysis",
                "strict": True,
                "schema": schema,
            }
        },
        "max_output_tokens": 3500,
    }
    request = urllib.request.Request(
        OPENAI_RESPONSES_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            body = json.loads(response.read())
    except urllib.error.HTTPError as error:
        try:
            error_body = json.loads(error.read())
            error_info = error_body.get("error", {})
            if not isinstance(error_info, dict):
                error_info = {}
            message = str(error_info.get("message", "")).strip()
            error_code = str(error_info.get("code") or error_info.get("type") or "").strip().lower()
            error_type = str(error_info.get("type", "")).strip().lower()
        except (json.JSONDecodeError, OSError):
            message = ""
            error_code = ""
            error_type = ""
        if error.code in (401, 403):
            detail = "OpenAI rejected the API key. Check OPENAI_API_KEY in api/.env."
        elif error.code == 429:
            quota_codes = {
                "insufficient_quota",
                "credit_balance_exhausted",
                "organization_usage_limit_exceeded",
                "organization_spend_limit_exceeded",
                "project_spend_limit_exceeded",
            }
            if error_code in quota_codes or error_type == "insufficient_quota":
                detail = (
                    "OpenAI API quota or billing limit reached. Check API billing/credits and the usage or spend limit "
                    "for the organization and project that owns this key. ChatGPT subscriptions do not include API usage."
                )
            elif "rate_limit" in error_code or "rate_limit" in error_type:
                detail = (
                    "OpenAI request or token rate limit reached. Wait a minute, then retry once. If it keeps happening, "
                    "check the model's rate limits for this API project."
                )
            else:
                detail = f"OpenAI returned HTTP 429 ({error_code or 'rate limit or quota'}). {message[:240]}".strip()
        else:
            detail = f"OpenAI Vision returned HTTP {error.code} ({error_code or 'request error'}). {message[:220]}".strip()
        raise HTTPException(status_code=502, detail=detail) from error
    except (urllib.error.URLError, TimeoutError) as error:
        raise HTTPException(status_code=502, detail="OpenAI Vision timed out or could not be reached. Try a smaller image or check your internet connection.") from error
    except (json.JSONDecodeError, OSError) as error:
        raise HTTPException(status_code=502, detail="OpenAI Vision returned an unreadable response.") from error

    output_text = body.get("output_text")
    if not isinstance(output_text, str):
        chunks = [
            part.get("text", "")
            for item in body.get("output", [])
            if item.get("type") == "message"
            for part in item.get("content", [])
            if part.get("type") == "output_text"
        ]
        output_text = "".join(chunks)
    if not output_text:
        raise HTTPException(status_code=502, detail="OpenAI Vision did not return an image analysis. Try a different image.")
    try:
        result = json.loads(output_text)
        raw_objects = result.get("objects", [])
    except (json.JSONDecodeError, AttributeError) as error:
        raise HTTPException(status_code=502, detail="OpenAI Vision returned an invalid analysis result.") from error
    if not isinstance(raw_objects, list):
        raise HTTPException(status_code=502, detail="OpenAI Vision returned an invalid object list.")

    image_width, image_height = image_size
    detections: list[dict[str, object]] = []
    for item in raw_objects[:60]:
        if not isinstance(item, dict):
            continue
        try:
            score = max(0.0, min(1.0, float(item["confidence"])))
            x1 = max(0.0, min(1.0, float(item["x1"]) / 1000))
            y1 = max(0.0, min(1.0, float(item["y1"]) / 1000))
            x2 = max(0.0, min(1.0, float(item["x2"]) / 1000))
            y2 = max(0.0, min(1.0, float(item["y2"]) / 1000))
            label = str(item["label"]).strip()[:100]
            description = str(item["description"]).strip()[:600]
        except (KeyError, TypeError, ValueError):
            continue
        if not label or x2 <= x1 or y2 <= y1:
            continue
        detections.append(
            {
                "className": label,
                "confidence": score,
                "box": {"x": x1, "y": y1, "width": x2 - x1, "height": y2 - y1},
                "description": description,
                "attributes": _text_list(item.get("attributes"), limit=6, item_length=80),
            }
        )

    raw_analysis = result.get("analysis", {})
    if not isinstance(raw_analysis, dict):
        raw_analysis = {}
    analysis = {
        "overview": str(raw_analysis.get("overview", "")).strip()[:1200],
        "setting": str(raw_analysis.get("setting", "")).strip()[:500],
        "visibleText": _text_list(raw_analysis.get("visibleText"), limit=20, item_length=250),
        "notableDetails": _text_list(raw_analysis.get("notableDetails"), limit=12, item_length=300),
    }
    return detections, analysis


@app.get("/api/health")
async def health() -> dict[str, object]:
    configured = bool(_get_openai_api_key())
    return {
        "status": "ready" if configured else "error",
        "model": OPENAI_VISION_MODEL,
        "message": "API key is configured; it will be checked when an image is analyzed." if configured else "Add OPENAI_API_KEY to api/.env and save the file.",
        "openaiConfigured": configured,
    }


@app.post("/api/detect", response_model=DetectionResponse)
async def analyze_image(
    request: Request,
    prompt: Annotated[str, Query(max_length=1000)] = "",
) -> DetectionResponse:
    api_key = _get_openai_api_key()
    if not api_key:
        raise HTTPException(status_code=503, detail="OpenAI Vision is not configured. Add OPENAI_API_KEY to api/.env and save the file.")

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
            image = ImageOps.exif_transpose(opened)
            if image.width * image.height > MAX_IMAGE_PIXELS:
                raise HTTPException(status_code=413, detail="Image dimensions are too large to process safely.")
            image_size = image.size
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError, ValueError) as error:
        raise HTTPException(status_code=400, detail="This file is not a valid image.") from error

    detections, analysis = await asyncio.to_thread(
        _analyze_with_openai,
        contents,
        content_type,
        image_size,
        prompt,
        api_key,
    )
    return DetectionResponse(
        image=ImageSize(width=image_size[0], height=image_size[1]),
        detections=[Detection(**item) for item in detections],
        analysis=SceneAnalysis(**analysis),
    )
