# Sightline — Vision Studio

A local-first object detector for uploaded photos and a live webcam. The Next.js interface sends frames to a Python API running a pretrained YOLO26n model. It recognizes common object classes, draws labeled boxes, summarizes results, and can export an annotated image.

Uploaded images and camera frames are processed in memory and are not saved by the app. CPU inference works; a supported GPU may speed it up. The first API launch downloads the model weights.

## Requirements

- Node.js 20.9 or newer and pnpm
- Python 3.12 or newer
- Windows, macOS, or Linux

## Start the detector API

From the project root in PowerShell:

```powershell
py -3.12 -m venv api/.venv
api/.venv/Scripts/python.exe -m pip install --upgrade pip
api/.venv/Scripts/python.exe -m pip install -r api/requirements.txt
api/.venv/Scripts/python.exe -m uvicorn api.main:app --reload --port 8000
```

On macOS or Linux, create and use the environment with `python3 -m venv api/.venv`, `api/.venv/bin/python -m pip install -r api/requirements.txt`, and `api/.venv/bin/python -m uvicorn api.main:app --reload --port 8000`.

The first startup may take a few minutes while the pretrained model is downloaded. The API reports readiness at [http://127.0.0.1:8000/api/health](http://127.0.0.1:8000/api/health); detection requests are available at `POST /api/detect`.

## Start the web app

In a second terminal:

```powershell
Copy-Item web/.env.example web/.env.local
pnpm --dir web install
pnpm --dir web dev
```

Open [http://localhost:3000](http://localhost:3000). If the API runs at a different address, set `NEXT_PUBLIC_DETECTOR_API_URL` in `web/.env.local` and restart Next.js.

## Use it

1. Drop in or choose a JPEG, PNG, or WebP image up to 10 MB, or select **Live camera** and allow camera access.
2. Adjust the confidence slider to filter detections.
3. Review labeled boxes, class counts, and confidence scores.
4. Export the annotated image from the results panel.

Camera detection samples at up to three frames per second and only sends one request at a time. The starter model detects its pretrained classes; it does not detect arbitrary custom objects without a separately trained model.
