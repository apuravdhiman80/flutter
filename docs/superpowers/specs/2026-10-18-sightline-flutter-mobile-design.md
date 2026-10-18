# Sightline Flutter Mobile App Design

**Status:** Approved in conversation on 2026-10-18

**Scope:** Android and iOS client for the existing Sightline local detection and training service

## Purpose

Add a Flutter mobile app for Sightline. Detection and custom YOLO training continue to run in the existing Python service on the user's Windows PC. The phone connects to that PC over the same Wi-Fi network. Photos, annotations, and trained weights remain on the PC; the app does not use cloud AI or a hosted service.

## Approved decisions

- Build Android and iOS clients in a new `mobile/` Flutter project.
- Keep the Python FastAPI service and its local YOLO inference and training responsibilities.
- Use three direct bottom tabs: **Detect**, **Train**, and **Settings**.
- Let the user enter the PC address and pairing token manually. Do not add automatic PC discovery in the first version.
- Add LAN authentication and a backend-only Windows launcher. Retain loopback access for the existing web app.
- Keep the existing web app and preserve the uncommitted changes present in the repository when work began.

## Architecture and boundaries

```text
Flutter app (Android/iOS)
  Detect, Train, Settings
  camera/photo library, result overlays, touch annotation
           |
           | HTTP over the same Wi-Fi
           | Authorization: Bearer <pairing token>
           v
Python FastAPI service on Windows PC
  YOLO detection, training data, training jobs, model status
           |
           v
Local files under api/data/ and model weights on the PC
```

Flutter owns the mobile interface, image selection/capture, drawing overlays, and display state. Python remains the source of truth for classes, samples, annotations, detection, training progress, and the active model. The mobile app talks to the existing `/api` endpoints and does not call Next.js. The current web app continues to use loopback access and is not removed or redesigned by this change.

The Flutter code is organized by responsibility: a shared API client and data models; local connection preferences; and separate Detect, Train, and Settings feature screens. UI state is kept separate from HTTP parsing and image-coordinate conversion so network and annotation behavior can be changed without rewriting screen layouts.

## Mobile workflows

### Detect

- Load the configured service health and model status.
- Choose a JPEG, PNG, or WebP image from the photo library or capture one with the camera. Honor the API's 10 MB limit and explain unsupported or oversized files before upload when possible.
- Send the image to `POST /api/detect?confidence=...` with the configured pairing token. Keep the current confidence control, initially 0.25, and let the user rerun detection after changing it.
- Show the source image with approximate boxes and per-object class and confidence labels. Provide a result summary and the analysis fields returned by the API: overview, setting, notable details, visible text, object descriptions, and attributes. Render optional/empty fields safely because backend versions may omit them.
- Support retry after a request failure and save an annotated copy on the phone. The annotation overlay is composed in Flutter; the API continues returning normalized boxes and image dimensions.

### Train

- Load classes, samples, and training state from the service.
- Add an object class by name; show existing classes and the count of distinct photos with saved boxes for each class.
- Add multiple example photos from the library or capture photos with the camera. Upload examples to the PC service; show that they are stored on the PC.
- Select a photo and class, draw normalized bounding boxes with touch, show existing box labels, remove a box, and save annotations to that sample. Warn before discarding unsaved annotations when switching photos.
- Allow deleting a sample with confirmation. Do not allow training while labels are unsaved.
- Keep training disabled until every class has boxes in at least three distinct photos. Offer the current training rounds (10, 20, 35, or 50, default 20) and start with `POST /api/training/start`.
- Poll `GET /api/training/status` every 2.5 seconds while training is running. Display epoch, progress, message, and errors; refresh model health when training completes and identify the custom model as active.

### Settings

- Store the base URL for the PC service and pairing token. Store the token using platform secure storage; allow the user to replace or clear it.
- Provide a connection check using `/api/health`. Show connected, model loading, model error, and custom-model-active states.
- Show concise setup instructions: start the backend on the PC, connect both devices to the same Wi-Fi, enter the PC's LAN address and token, and allow the Python service on private networks in Windows Firewall.
- Keep the configured service address editable because the PC's DHCP address may change.

## Backend and Windows setup

- Add a dedicated `run-backend.cmd` launcher that prepares the existing Python environment if needed and starts Uvicorn on port 8000 bound to LAN interfaces. It must not require the Next.js server for the mobile app to work.
- Print the usable non-loopback PC address or addresses and the pairing token in the launcher output. The token is generated randomly on first setup and stored under ignored `api/data/` so it survives restarts. Document how to rotate it.
- Require `Authorization: Bearer <token>` for requests from non-loopback clients. Continue allowing loopback requests without a token so the existing local web UI keeps working. Apply the check consistently to health, detection, and training endpoints.
- Keep the listener usable only on a trusted local network in the intended setup. Document allowing Python on a Private Windows network profile; do not create a broad firewall exception automatically.
- Configure Android and iOS app permissions for camera/photo access and local-network HTTP access. Native Flutter HTTP requests are not subject to browser CORS, so the existing localhost CORS allowlist need not be broadened for the mobile client.

## Failure behavior and privacy

- Distinguish an unreachable PC, invalid address, rejected token, model loading/error, image validation errors, and failed detection/training requests. Keep the user's selected image and unsaved annotations available for retry where practical.
- Show a clear warning if the service disconnects during training; reconnect and resume polling when possible. Do not report training complete until the API reports completion and health reflects the active model.
- Never fall back to a cloud service. Detection requests and training images travel from phone to PC over the local Wi-Fi; the API persists training photos, labels, and model runs on the PC.
- The initial LAN transport is HTTP. The pairing token is an access control for the trusted local network, not encryption against someone monitoring that network.

## Non-goals

- Running YOLO inference or custom training on the phone.
- Hosting the API in a cloud service.
- Automatic network discovery or a remote-access mode.
- Replacing the Python API or removing the current web UI.
- Adding account management or multi-user access control.

## Acceptance criteria

1. A user can start the backend on Windows without starting Next.js, read the PC address and token, and connect from an Android or iOS app on the same Wi-Fi.
2. A phone without the correct token cannot use non-loopback detection or training endpoints; the existing web UI can still access the API from the PC.
3. The Detect tab supports photo-library and camera input, confidence adjustment, object overlays, complete analysis details, retry, and an annotated image export.
4. The Train tab supports class creation, photo upload/capture, touch box annotation, saving/deleting samples, per-class readiness, and training progress through completion or error.
5. The Settings tab can edit and securely store the connection details, check health, and show the active model state.
6. Images and model training stay on the PC, with no cloud calls. Offline and authorization failures are explained in the app.

## Platform and implementation constraints

- The current workspace shell does not expose a Flutter SDK command; a Flutter SDK must be available before the project can be built or run.
- Android development/building can run from the Windows workspace. Building and signing an iOS app requires macOS with Xcode.
- Preserve the existing modified API, web, launcher, README, and script files. Review their current diffs before making dependent edits; do not replace them wholesale.

## Verification approach

Use the available Flutter SDK to analyze and build the Android target, then exercise connection, detection, annotation, and training with the local API on an Android device or emulator. Build the iOS target on macOS with Xcode when available. Check that local web loopback requests still work after LAN authentication is added. Do not claim either mobile platform or backend integration works until the corresponding build and runtime checks have actually been performed.
