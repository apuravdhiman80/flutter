# Sightline — Deep Image Analysis

Sightline is an image-upload-only web app. It sends one selected JPEG, PNG, or WebP image to OpenAI Vision and displays an image overview, object-by-object descriptions, approximate object boxes, visible text, and notable visual details. It does not start a camera or send camera frames.

Images are sent through the local Python API to OpenAI when selected. The API key stays on the server side. OpenAI API billing is separate from a ChatGPT subscription, and each upload can incur API charges. See [OpenAI billing details](https://help.openai.com/en/articles/9039756-managing-billing-settings-on-the-chatgpt-web-and-api-platform).

## Requirements

- Windows, macOS, or Linux
- Python 3.12 or newer
- Node.js 20.9 or newer and pnpm

## Run on Windows

Open PowerShell in this folder and run:

```powershell
Set-Location D:\flutter
.\run.cmd
```

The launcher installs missing dependencies, opens the API and web app, and visits `http://localhost:3000`. The Python API is available at `http://127.0.0.1:8000`.

## Connect OpenAI Vision

1. Create an API key in your OpenAI API account. ChatGPT subscriptions and API billing are separate.
2. In PowerShell at the project folder, copy the example settings and open the API environment file:

   ```powershell
   Set-Location D:\flutter
   if (-not (Test-Path .\api\.env)) { Copy-Item .\api\.env.example .\api\.env }
   notepad .\api\.env
   ```

3. Set the key on the `OPENAI_API_KEY=` line and save the file. Keep the key in `api/.env`; never add it to frontend code or `web/.env.local`.
4. Stop the existing **Sightline API** window with Ctrl+C, then run `.\run.cmd` again from PowerShell so the API reads the key.

Selecting an image starts one analysis request. Choosing another image while an analysis is running is blocked until the current report finishes. Selecting the same image again or retrying intentionally sends another API request.

## Image handling

- Accepted formats: JPEG, PNG, and WebP
- Maximum upload size: 10 MB
- Image contents are checked and analyzed in memory by the Python API; the app does not save uploaded files to a server folder.
- OpenAI returns an overview, setting, readable text, notable details, and estimated object boxes. The boxes and confidence values are approximate; no model can guarantee detection of every visible object.
- No live camera, browser webcam permission, Google Cloud Vision, or local YOLO model is used by this image-only app.
