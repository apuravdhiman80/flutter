# YOLO Object Detector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a polished Next.js object detector backed by a deployable Python Ultralytics YOLO service.

**Architecture:** A Next.js App Router UI calls a separate FastAPI service. The API loads `yolo26n.pt`, validates single-image requests, and returns detections plus an annotated image. Vercel serves the UI; Docker/Render serves the model API.

**Tech Stack:** Next.js App Router, React, TypeScript, Lucide React, CSS, Python 3.12, FastAPI, Ultralytics, Docker.

**Spec:** `docs/superpowers/specs/2026-10-25-yolo-object-detector-design.md`

## Global Constraints

- Use Next.js App Router with TypeScript and React.
- Use the `yolo26n.pt` pretrained model by default; allow `MODEL_NAME` overrides.
- Accept JPEG, PNG, and WebP images up to 12 MB.
- Read the API base URL from `NEXT_PUBLIC_API_URL`; read allowed origins from `FRONTEND_ORIGINS`.
- Keep all new project files within `D:\flutter`.
- Do not add or run an automated test suite for this request.
- Preserve the pre-existing deletion of `docs/superpowers/specs/2026-10-18-mathlab-design.md`.

## Review Focus

- Invalid or misleading MIME types must be rejected by decoding the actual image.
- Files over 12 MB must fail with a clear client-facing error.
- A missing or unreachable Python API must leave the UI usable and explain how to connect it.
- Zero detections must display a valid annotated image and an empty result state.
- Camera capture must release its media stream when closed or captured.

## File Structure

- `app/layout.tsx`, `app/page.tsx`, `app/globals.css`: app shell, metadata, responsive visual system.
- `app/components/detector.tsx`: image selection, confidence, health, request lifecycle, and result UI.
- `app/components/camera-capture.tsx`: optional camera capture dialog.
- `app/lib/detector-api.ts`: typed frontend API contract and requests.
- `backend/app/main.py`: FastAPI lifecycle, validation, health, inference, and response serialization.
- `backend/requirements.txt`, `backend/Dockerfile`: Python runtime and container packaging.
- `render.yaml`, `vercel.json`, `.env.example`, `.gitignore`: deployment and local configuration.
- `README.md`: setup, deployment, and API contract.

## Tasks

### Task 1: Project setup and deployment configuration

**Files:** `package.json`, `tsconfig.json`, `next.config.ts`, `next-env.d.ts`, `.gitignore`, `.env.example`, `vercel.json`, `render.yaml`, `backend/requirements.txt`, `backend/Dockerfile`

- [ ] Add the Next.js/React/TypeScript configuration and scripts.
- [ ] Add local environment examples and ignore generated dependencies, caches, and model weights.
- [ ] Add Vercel frontend defaults and a Docker-based Render service definition rooted at `backend/`.
- [ ] Add Python runtime dependencies and a production Docker image.
- [ ] Verify the configuration is syntactically readable and install frontend dependencies.

### Task 2: Python YOLO API

**Files:** `backend/app/__init__.py`, `backend/app/main.py`

- [ ] Implement FastAPI startup model loading with `MODEL_NAME` defaulting to `yolo26n.pt`.
- [ ] Implement `/api/health` readiness reporting and CORS from `FRONTEND_ORIGINS`.
- [ ] Implement `/api/detect` validation for JPEG/PNG/WebP and 12 MB, threshold handling, inference, detections, latency, and annotated JPEG response.
- [ ] Compile the Python application and inspect the implementation against the five review-focus cases.

### Task 3: Detector UI and visual design

**Files:** `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `app/components/detector.tsx`, `app/components/camera-capture.tsx`, `app/lib/detector-api.ts`

- [ ] Build the responsive, polished dashboard with upload/drop, camera capture, confidence control, service status, detections, and download.
- [ ] Connect requests to the typed API client and implement empty, loading, success, and error states.
- [ ] Implement responsive styling, accessible controls, and clear keyboard focus styles.
- [ ] Run TypeScript and production-build checks.

### Task 4: User setup and deployment instructions

**Files:** `README.md`

- [ ] Document local Python and Next.js setup, first model download, Vercel frontend deployment, and separate backend deployment.
- [ ] Document environment variables, API routes, image constraints, and licensing reference.
- [ ] Re-read the design and plan to confirm each requirement maps to an implementation or documented limitation.

## Execution Notes

- Build directly in the requested workspace; the user asked for all files here.
- Use `npm run build` and `python -m compileall backend/app` as implementation checks; do not create or run a test suite.
- The current workspace contains a pre-existing deleted design file; leave that deletion intact.
