# Vision Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a polished local web app for image and live webcam object detection.

**Architecture:** A Next.js App Router frontend in `web/` communicates with a FastAPI inference service in `api/`. The API loads YOLO26n once, returns normalized bounding boxes, and does not persist source images or webcam frames.

**Tech Stack:** Next.js, React, TypeScript, Tailwind CSS, Python 3.12+, FastAPI, Uvicorn, Pillow, `python-multipart`, Ultralytics YOLO26n.

**Spec:** `docs/superpowers/specs/2026-10-17-object-detector-design.md`

## Global Constraints

- Accept JPEG, PNG, or WebP images up to 10 MB.
- Confidence ranges from 0.05 through 0.95, default 0.25.
- Sample webcam frames at no more than 3 FPS, cap their maximum dimension at 640 pixels, and allow at most one inference request at a time.
- Return normalized 0–1 boxes relative to the original image.
- Do not persist uploaded images or webcam frames.
- Run the frontend on port 3000 and FastAPI on port 8000; allow the frontend origin through local CORS.
- Support CPU inference and use a compatible GPU when available.

## Review Focus

- Unsupported MIME types and files larger than 10 MB must be rejected with a readable UI error.
- Valid MIME with corrupt image bytes must be rejected without crashing the service.
- API startup/model download and API offline states must be visible and recoverable.
- Camera permission denial and camera stop must leave no active media tracks or frame loop.
- Empty detections must render a clear no-results state without stale boxes.

---

### Task 1: Scaffold the Next.js workspace

**Files:**
- Create: `web/package.json`, `web/next.config.ts`, `web/tsconfig.json`, `web/postcss.config.mjs`, `web/app/layout.tsx`, `web/app/page.tsx`, `web/app/globals.css`, `web/.gitignore`
- Create: `web/components/vision-studio.tsx`

**Interfaces:**
- Produces the responsive Vision Studio shell and standard `dev`, `build`, and `start` commands.

- [ ] Create a TypeScript, App Router, Tailwind Next.js app under `web/` using `create-next-app` defaults.
- [ ] Install `lucide-react` for consistent interface icons.
- [ ] Replace the starter screen with the responsive dark ink, light canvas, teal accent Vision Studio layout, including upload area, preview, controls, results summary, and empty/loading states.
- [ ] Keep the presentation component accessible: labeled controls, keyboard-operable file selection, visible focus, and responsive layout.

### Task 2: Implement the Python detection service

**Files:**
- Create: `api/main.py`
- Create: `api/detector.py`
- Create: `api/requirements.txt`

**Interfaces:**
- `GET /api/health` returns `{"status":"ready","model":"yolo26n"}` when loaded and HTTP 503 while loading or failed.
- `POST /api/detect` consumes multipart `file` and `confidence` fields and returns `{"image":{"width":int,"height":int},"detections":[{"className":str,"confidence":float,"box":{"x":float,"y":float,"width":float,"height":float}}]}`.
- `box` values are normalized to 0–1; confidence is 0.05–0.95 inclusive.

- [ ] Add FastAPI, Uvicorn, Pillow, `python-multipart`, and Ultralytics to `api/requirements.txt`.
- [ ] Implement an in-memory YOLO26n singleton with guarded background loading so the API can report model readiness while weights download.
- [ ] Implement health and detection endpoints, strict file-size/type/content validation, confidence validation, normalized boxes, and CORS for `http://localhost:3000` and `http://127.0.0.1:3000`.
- [ ] Return useful HTTP errors for startup, unsupported/oversized files, invalid image data, and inference failures; never write request images to disk.

### Task 3: Connect upload and live webcam detection

**Files:**
- Create: `web/lib/types.ts`
- Create: `web/lib/detector-api.ts`
- Create: `web/components/detection-preview.tsx`
- Modify: `web/components/vision-studio.tsx`

**Interfaces:**
- `Detection` has `className: string`, `confidence: number`, and normalized `box: {x: number; y: number; width: number; height: number}`.
- `detectImage(file: Blob, confidence: number): Promise<DetectionResponse>` posts to `NEXT_PUBLIC_DETECTOR_API_URL` or `http://127.0.0.1:8000`.
- Preview accepts a still image URL or webcam video source, source dimensions, detections, and loading state; download exports the displayed source with the current boxes.

- [ ] Implement API health/detection requests and typed error parsing.
- [ ] Add upload validation, preview, threshold control, detection list/counts, no-results state, and annotated-image download.
- [ ] Add start/stop webcam flow; capture a resized JPEG frame every 333 ms at most, keep only one request in flight, and stop every media track and pending loop on stop/unmount.
- [ ] Render confidence-labeled boxes aligned with the preview and make camera/API/model errors understandable.

### Task 4: Document local setup and finish the app shell

**Files:**
- Create: `README.md`
- Modify: `web/app/layout.tsx`, `web/app/globals.css`, `.gitignore`

- [ ] Add exact PowerShell commands to create the Python virtual environment, install dependencies, run API and web dev servers, and configure the API URL.
- [ ] Set page title/description, application icon treatment, and consistent loading/error visual states.
- [ ] Exclude `node_modules`, Python virtual environments, and downloaded model weights from version control.
- [ ] Run `pnpm --dir web build` and confirm the production build succeeds.
- [ ] Start the API and confirm its health endpoint becomes ready after the model loads.

