# Vision Studio Object Detector — Design

**Status:** Approved for implementation on 2026-10-17.

## Goal

Create a polished local web app that detects common objects in uploaded images and a live webcam feed. The project uses a Next.js, React, and TypeScript interface with a Python FastAPI inference service.

## User experience

The home screen is a single “Vision Studio” workspace. It has a clear image upload area, webcam controls, a large preview with colored bounding boxes and labels, and a results panel listing detected objects, counts, and confidence scores. Users can adjust the confidence threshold and download the annotated image. The visual design uses a dark ink background, light work surfaces, and restrained teal accents, with responsive layout for smaller screens.

Supported input is JPEG, PNG, or WebP up to 10 MB. Confidence ranges from 0.05 to 0.95, defaulting to 0.25. The webcam can be started and stopped; while active, the browser samples frames with a maximum dimension of 640 pixels at up to three frames per second and sends only one request at a time. The browser draws returned boxes over the source image or current camera frame. Detection boxes use normalized coordinates so they remain aligned as the preview resizes.

## Architecture and data flow

- `web/` contains the Next.js App Router app, TypeScript components, styling, upload and webcam handling, canvas annotation, and results UI.
- `api/` contains a Python FastAPI service. It loads the small pretrained Ultralytics YOLO26n model once at startup and exposes `GET /api/health` and `POST /api/detect`.
- `GET /api/health` returns readiness and the model name, or HTTP 503 while the model is loading.
- `POST /api/detect` accepts multipart `file` and `confidence` fields, then returns `{image: {width, height}, detections: [{className, confidence, box: {x, y, width, height}}]}`. Coordinates are normalized from 0 to 1 relative to the original image.
- The browser sends images only to the configured local API. The service does not persist uploaded images or webcam frames.
- The model detects the common classes it was pretrained on. Custom class training, user accounts, saved history, and video-file processing are outside this first version.

The API validates content type, image decoding, file size, and confidence range. It returns useful errors for invalid input and remains unready until the model finishes loading. The UI communicates API startup/offline status, camera permission failures, invalid or oversized files, inference errors, and successful requests with no detections.

## Stack and local setup

- Next.js App Router, React, TypeScript, and Tailwind CSS.
- Python 3.12+, FastAPI, Uvicorn, Pillow, `python-multipart`, and Ultralytics YOLO26n.
- Frontend dev server on port 3000; API on port 8000, with local CORS configured for the frontend origin.
- First API startup may download the YOLO26n weights. CPU inference is supported; a compatible GPU can be used when available.
- Provide PowerShell setup and run commands for both services, plus an environment setting for the API URL.

## Acceptance criteria

1. The project installs and starts both the Next.js app and Python API locally.
2. Uploading a supported image produces labeled boxes and a results list; changing confidence updates detections.
3. The annotated image can be downloaded.
4. Starting the webcam produces live detections; stopping it ends camera use and frame requests.
5. The app clearly handles model startup, API unavailability, camera permission denial, unsupported/oversized/invalid images, inference errors, and no detections.
6. The app never saves user images or webcam frames to disk.
7. The frontend production build completes.

## References

- [Next.js App Router](https://nextjs.org/docs/app)
- [Next.js installation](https://nextjs.org/docs/app/getting-started/installation)
- [Ultralytics prediction](https://docs.ultralytics.com/modes/predict/)
