# YOLO Object Detector Design

## Intent

Build a polished, easy-to-use web app that accepts an image, runs real object detection with a pretrained Ultralytics YOLO model, and presents an annotated image with readable detection results. Keep all project files in the existing `D:\flutter` workspace.

## Goals

- Provide a responsive Next.js and React interface with drag-and-drop, file selection, and a camera capture option.
- Run inference in a Python FastAPI service using Ultralytics YOLO26 nano weights by default.
- Let users adjust confidence, view object labels and scores, and download the annotated image.
- Make the front end deployable on Vercel and the Python service deployable as a Docker service.
- Explain local setup and deployment, including the service URL and CORS configuration.

## Non-goals

- Training custom models, managing datasets, storing uploaded images, or requiring accounts.
- Video processing, live streaming inference, or multi-image batches.
- Hosting PyTorch model inference inside Vercel functions.

## Constraints

- Use Next.js App Router with TypeScript and React.
- Keep image inference in Python with FastAPI and the Ultralytics `YOLO` API.
- Use the `yolo26n.pt` pretrained model by default; permit changing it with `MODEL_NAME`.
- Accept JPEG, PNG, and WebP images up to 12 MB.
- Configure the browser API address with `NEXT_PUBLIC_API_URL` and backend origins with `FRONTEND_ORIGINS`.
- Do not add or run an automated test suite for this request.
- Preserve pre-existing workspace changes, including the already-deleted `docs/superpowers/specs/2026-10-18-mathlab-design.md`.

## Approaches

1. **Run all inference in the browser.** Easiest single-host deployment, but it does not use Python and adds browser model/runtime constraints.
2. **Use a Next.js UI and a separately deployed Python API.** Chosen by Codex as the best fit for the requested Python YOLO app. It keeps the full PyTorch stack outside Vercel's function bundle and provides a clear service boundary.
3. **Run the Python service as a Vercel Function.** Possible for small Python APIs, but Ultralytics/PyTorch packaging and model inference are a less dependable fit for the documented serverless bundle and request limits.

## Architecture

The Next.js app serves the detector UI from Vercel. The browser sends one image and a confidence threshold directly to a FastAPI `/api/detect` endpoint. The service loads the configurable pretrained model once, validates image size/type, runs inference, and returns normalized metadata plus an annotated JPEG. `GET /api/health` supports service status display and hosting health checks.

## Product behavior

- Initial state explains how to add an image and offers drag-and-drop, browse, and camera capture.
- During inference, the UI gives a clear busy state and preserves the selected image.
- Success shows the annotated image, detection count, latency, confidence, and label summary, with a download action.
- Empty results explain that no supported objects were found.
- Errors distinguish unavailable API, unsupported image, upload limit, and model/service failures where the response allows.
- Images remain ephemeral; the project stores no uploads or account data.

## Deployment

Deploy the repository root as a Next.js Vercel project. Deploy `backend/` as a Docker web service, configure `FRONTEND_ORIGINS` with the deployed Vercel origin, and configure Vercel's `NEXT_PUBLIC_API_URL` with the Python service base URL. The README will include local development and deployment steps.

## Builder decisions

- Use a light warm-gray and deep-ink visual system with a vivid green accent and crisp, high-contrast detection states.
- Use inline React components and Lucide icons; avoid a CSS framework and remotely loaded fonts.
- Package CPU-only PyTorch in the backend container so a CPU deployment doesn't pull CUDA dependencies.
- Return an annotated JPEG as Base64 in the response to keep the initial deployment stateless.
- Use a 12 MB file cap and validate the decoded image in the backend.
