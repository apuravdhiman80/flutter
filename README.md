# Sightline — YOLO object detector

Sightline is a responsive image object detector with a Next.js interface and a Python API running Ultralytics YOLO. Drop in a photo or capture one with your camera, adjust the confidence threshold, review the detections, and save the annotated image.

## What it includes

- Drag-and-drop or file-picker image upload, plus camera capture.
- YOLO26 nano inference with object names, confidence scores, and bounding boxes.
- An annotated JPEG download and a per-request inference time.
- A FastAPI health endpoint, upload validation, CORS settings, and configurable model weights.
- A Vercel-ready Next.js frontend and a Docker-based Render service definition for the Python API.
- No account, upload history, or image storage.

## How it is deployed

The browser sends the selected image directly to the Python API. Deploy the repository root as the Next.js app on Vercel, and deploy `backend/` as a separate web service. This keeps the full Python model runtime and its weights outside the Vercel frontend deployment. The frontend API address and backend CORS origins are configured through environment variables.

## Run locally

Use Node.js 20.9 or newer and Python 3.12 or 3.13.

### 1. Start the Python API

In PowerShell:

```powershell
cd backend
python --version
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --env-file .env --port 8000
```

The first start downloads the `yolo26n.pt` weights if they are not already present. The API listens at `http://127.0.0.1:8000`; its interactive API documentation is at `http://127.0.0.1:8000/docs`.

### 2. Start the Next.js app

Open a second PowerShell window at the repository root:

```powershell
if (-not (Test-Path .env.local)) { Copy-Item .env.example .env.local }
npm install
npm run dev
```

Open `http://localhost:3000`. The app checks `/api/health` and shows the service state near the workspace heading.

## Deploy

### Frontend on Vercel

1. Import this Git repository in Vercel and keep the project root set to the repository root.
2. Add `NEXT_PUBLIC_API_URL` with the public base URL for the Python API, for example `https://your-service.onrender.com` (no route suffix needed).
3. Deploy the project with the Next.js framework preset.

`vercel.json` selects the Next.js framework. The frontend does not package the Python dependencies or model weights.

### Python API on Render

1. Connect this repository to Render and create a Blueprint from its root `render.yaml`.
2. Set `FRONTEND_ORIGINS` to the exact deployed Vercel origin, such as `https://your-app.vercel.app`.
3. Deploy the `sightline-yolo-api` Docker web service, then copy its public URL into Vercel's `NEXT_PUBLIC_API_URL` setting.

The Blueprint points its Docker build at `backend/Dockerfile`, which installs CPU-only PyTorch for the container. The service downloads the default model weights when it starts. You can set `MODEL_NAME` to a different Ultralytics detection model or a custom `.pt` file included in your container image.

For a different Python host, build and run `backend/Dockerfile` and set `PORT`, `MODEL_NAME`, and `FRONTEND_ORIGINS` in the host's environment settings.

## Environment variables

| Variable | Used by | Default | Description |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | Next.js browser app | `http://127.0.0.1:8000` | Public base URL for the FastAPI service. |
| `MODEL_NAME` | Python API | `yolo26n.pt` | Ultralytics model name or path to model weights. |
| `FRONTEND_ORIGINS` | Python API | `http://localhost:3000,http://127.0.0.1:3000` | Comma-separated browser origins allowed by CORS. |
| `MAX_UPLOAD_BYTES` | Python API | `12582912` | Maximum image request size in bytes (12 MiB). |
| `MAX_IMAGE_PIXELS` | Python API | `30000000` | Maximum decoded image pixel count. |

## API

### `GET /api/health`

Returns model readiness and the configured model name:

```json
{ "status": "ready", "model": "yolo26n.pt" }
```

### `POST /api/detect?confidence=0.35`

Send one `multipart/form-data` field named `file`. The confidence threshold must be between `0.1` and `0.9`. JPEG, PNG, and WebP files are accepted up to 12 MiB and 30 million decoded pixels. A successful response contains image dimensions, elapsed inference time, detections with pixel-space boxes, and a data URL for the annotated image.

## Notes

- Camera capture requires browser permission and a secure context. `localhost` is allowed during development; deployed sites must use HTTPS.
- The default model is pretrained for common COCO object categories. To recognize a specific set of objects, configure compatible custom model weights.
- Ultralytics code and pretrained YOLO weights are covered by the [AGPL-3.0 license](https://www.ultralytics.com/license) by default. Review the current license terms for your use; proprietary or commercial deployments may require an Enterprise license.
