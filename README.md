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

The browser sends the selected image directly to the Python API. Deploy the repository root as the Next.js app on Vercel, and deploy `backend/` as a separate web service. This keeps the full Python model runtime and its weights outside the Vercel frontend deployment. The frontend API address and backend CORS origins are configured through environment variables. The upload goes straight from the browser to the Python API, so it does not pass through a Vercel function upload limit.

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

The first start downloads the `yolov8n-oiv7.pt` weights if they are not already present. This nano model recognizes 601 categories, including Pen. The local app starts at a 20% confidence threshold so small or less-certain objects like pens are shown; raise it if you see false detections. The API listens at `http://127.0.0.1:8000`; its interactive API documentation is at `http://127.0.0.1:8000/docs`.

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

1. Push this project to a GitHub, GitLab, or Bitbucket repository, then choose **Add New → Project** in Vercel and import that repository. You can also deploy from the project folder with the Vercel CLI (`npx vercel`).
2. Keep **Root Directory** at the repository root. Vercel detects Next.js from `package.json` and `vercel.json`; leave the framework as **Next.js** and use the detected build settings.
3. Add the environment variable `NEXT_PUBLIC_API_URL` with the public base URL of the Python API, for example `https://your-service.onrender.com` (no `/api` suffix). Add it for **Production** and **Preview** as needed.
4. Deploy. If you add or change an environment variable after deployment, redeploy so the new build includes it.
5. Once Vercel gives you the site URL (for example `https://your-app.vercel.app`), set the backend's `FRONTEND_ORIGINS` to that exact origin, then redeploy the backend. For a Vercel preview URL, add that origin too if you want uploads to work from previews.
6. Open the Vercel URL. The app should show the API as ready; upload a JPEG, PNG, or WebP image to check detection.

`vercel.json` selects the Next.js framework. The frontend does not package the Python dependencies or model weights.

**Important:** Vercel hosts the Next.js frontend, while the Python API must have its own public HTTPS URL. This app allows images up to 12 MiB and sends them directly to that API. Do not configure the upload to proxy through a Vercel function, whose standard request/response body limit is 4.5 MB. See [Vercel Function limits](https://vercel.com/docs/functions/limitations).

### Python API on Render

1. Start the [Render Blueprint deployment](https://render.com/deploy?repo=https://github.com/apuravdhiman80/flutter) and connect GitHub if prompted. It reads the root `render.yaml` to create the Docker service.
2. Deploy the `sightline-yolo-api` Docker web service. Render provides a public HTTPS service URL after it finishes building and loading the model.
3. Check `https://<your-render-service>/api/health`. It must return JSON with `"status":"ready"` before you configure the frontend.
4. Set the backend's `FRONTEND_ORIGINS` to the exact deployed Vercel origin, such as `https://your-app.vercel.app`, then redeploy the backend.
5. In Vercel, set `NEXT_PUBLIC_API_URL` to the Render service base URL (no `/api` suffix) for Production and Preview as needed, then redeploy the frontend. This value is embedded at build time.

The Blueprint points its Docker build at `backend/Dockerfile`, which installs CPU-only PyTorch for the container. The service downloads the default model weights when it starts. You can set `MODEL_NAME` to a different Ultralytics detection model or a custom `.pt` file included in your container image.

For a different Python host, build and run `backend/Dockerfile` and set `PORT`, `MODEL_NAME`, and `FRONTEND_ORIGINS` in the host's environment settings.

## Environment variables

| Variable | Used by | Default | Description |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | Next.js browser app | `http://127.0.0.1:8000` | Public base URL for the FastAPI service. |
| `MODEL_NAME` | Python API | `yolov8n-oiv7.pt` locally | Ultralytics model name or path to model weights. |
| `FRONTEND_ORIGINS` | Python API | `http://localhost:3000,http://127.0.0.1:3000` | Comma-separated browser origins allowed by CORS. |
| `MAX_UPLOAD_BYTES` | Python API | `12582912` | Maximum image request size in bytes (12 MiB). |
| `MAX_IMAGE_PIXELS` | Python API | `30000000` | Maximum decoded image pixel count. |

## API

### `GET /api/health`

Returns model readiness and the configured model name:

```json
{ "status": "ready", "model": "yolov8n-oiv7.pt" }
```

### `POST /api/detect?confidence=0.35`

Send one `multipart/form-data` field named `file`. The confidence threshold must be between `0.1` and `0.9`. JPEG, PNG, and WebP files are accepted up to 12 MiB and 30 million decoded pixels. A successful response contains image dimensions, elapsed inference time, detections with pixel-space boxes, and a data URL for the annotated image.

## Notes

- Camera capture requires browser permission and a secure context. `localhost` is allowed during development; deployed sites must use HTTPS.
- The local default uses Ultralytics YOLOv8 nano pretrained on Open Images V7, which includes 601 categories such as Pen. The Render Blueprint still explicitly selects the COCO `yolo26n.pt` model. To recognize other specific objects, configure compatible custom model weights.
- Ultralytics code and pretrained YOLO weights are covered by the [AGPL-3.0 license](https://www.ultralytics.com/license) by default. Review the current license terms for your use; proprietary or commercial deployments may require an Enterprise license.
