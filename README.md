# Sightline — Vision Studio

A local-first object detector for uploaded photos and a live webcam. The Next.js interface sends frames to a Python API running YOLO26n for 80 common classes or YOLO-World for text-prompted open-vocabulary search. An optional Google Cloud Vision provider adds cloud object localization.

Local model images and camera frames are processed in memory and are not saved by the app. CPU inference works; a supported GPU may speed it up. The API downloads model weights the first time it starts. Google Cloud Vision is optional; selecting it sends the current image or camera frame to Google. Its API key stays in the Python service.

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

The fast YOLO26n model recognizes its 80 pretrained COCO classes. The **Open vocabulary** option loads YOLO-World and lets you enter comma-separated object names, including concepts outside that set. The first open-vocabulary model download also runs in the background.

### Optional Google Cloud Vision

1. Enable the Cloud Vision API in a Google Cloud project and create an API key with access to it.
2. Copy the example file and add the key:

   ```powershell
   Copy-Item api/.env.example api/.env
   notepad api/.env
   ```

3. Set `GOOGLE_CLOUD_VISION_API_KEY` in `api/.env`, then restart the Python API.

The **Google Vision** button becomes available after the API reports it is configured. The image leaves your device only when this provider is selected. Google Cloud Vision is a documented localization API; this app does not use Google Lens.

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

Camera detection samples at up to three frames per second and only sends one request at a time. On desktop it prefers the user-facing camera; on mobile it prefers the rear camera. When multiple cameras are available, select one beneath the preview. A flat green camera feed triggers a warning so you can switch devices or check the camera shutter/driver.

The standard detector covers common pretrained classes. Open-vocabulary and Google Vision can recognize additional named objects, but no model can guarantee detection of every object in every image.
