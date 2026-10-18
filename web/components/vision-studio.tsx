"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from "react";
import {
  Activity,
  Aperture,
  ArrowDownToLine,
  Camera,
  Check,
  ChevronDown,
  CircleHelp,
  FileImage,
  Gauge,
  Info,
  LoaderCircle,
  Maximize2,
  ScanLine,
  Settings2,
  ShieldCheck,
  Sparkles,
  Upload,
  Video,
  VideoOff,
  X,
  Zap,
} from "lucide-react";
import { detectImage, getDetectorApiUrl, getDetectorHealth } from "@/lib/detector-api";
import type { Detection, DetectionProvider, DetectionResponse, DetectorHealth } from "@/lib/types";
import { DetectionPreview } from "@/components/detection-preview";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const BOX_COLORS = ["#bef264", "#67e8f9", "#c4b5fd", "#fb923c", "#f9a8d4"];
const DEFAULT_OBJECT_PROMPT = "person, car, bicycle, phone, laptop, cup, bottle, chair, dog, cat, plant, book";

type InputMode = "image" | "camera";

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong while analyzing this frame.";
}

function isFlatGreenFrame(context: CanvasRenderingContext2D, width: number, height: number): boolean {
  const pixels = context.getImageData(0, 0, width, height).data;
  const channels: number[][] = [[], [], []];
  let greenPixels = 0;
  const columns = 8;
  const rows = 6;

  for (let row = 1; row <= rows; row += 1) {
    for (let column = 1; column <= columns; column += 1) {
      const x = Math.floor((column / (columns + 1)) * width);
      const y = Math.floor((row / (rows + 1)) * height);
      const offset = (y * width + x) * 4;
      const [red, green, blue] = [pixels[offset], pixels[offset + 1], pixels[offset + 2]];
      channels[0].push(red);
      channels[1].push(green);
      channels[2].push(blue);
      if (green > 90 && red < 90 && blue < 90) greenPixels += 1;
    }
  }

  return greenPixels >= columns * rows * 0.96 && channels.every((values) => Math.max(...values) - Math.min(...values) < 24);
}

export function VisionStudio() {
  const [inputMode, setInputMode] = useState<InputMode>("image");
  const [provider, setProvider] = useState<DetectionProvider>("local");
  const [objectPrompt, setObjectPrompt] = useState(DEFAULT_OBJECT_PROMPT);
  const [health, setHealth] = useState<DetectorHealth>({ status: "loading", message: "Checking the local detector…" });
  const [confidence, setConfidence] = useState(0.25);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [imageName, setImageName] = useState("");
  const [detections, setDetections] = useState<Detection[]>([]);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [cameraDeviceId, setCameraDeviceId] = useState("");
  const [isDetecting, setIsDetecting] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [frameCount, setFrameCount] = useState(0);
  const [latency, setLatency] = useState<number | null>(null);

  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraRequestVersionRef = useRef(0);
  const flatGreenWarningRef = useRef(false);
  const requestPendingRef = useRef(false);
  const requestOwnerRef = useRef(0);
  const requestVersionRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const changeProvider = useCallback((nextProvider: DetectionProvider) => {
    requestVersionRef.current += 1;
    abortRef.current?.abort();
    setDetections([]);
    setIsDetecting(false);
    setProvider(nextProvider);
  }, []);

  const changeObjectPrompt = useCallback((nextPrompt: string) => {
    requestVersionRef.current += 1;
    abortRef.current?.abort();
    setDetections([]);
    setIsDetecting(false);
    setObjectPrompt(nextPrompt);
  }, []);

  useEffect(() => {
    let active = true;
    const refreshHealth = async () => {
      const nextHealth = await getDetectorHealth();
      if (active) setHealth(nextHealth);
    };
    void refreshHealth();
    const interval = window.setInterval(() => void refreshHealth(), 2500);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!imageUrl) return;
    return () => URL.revokeObjectURL(imageUrl);
  }, [imageUrl]);

  const stopCamera = useCallback(() => {
    cameraRequestVersionRef.current += 1;
    requestVersionRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    requestPendingRef.current = false;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    setCameraStarting(false);
    setIsDetecting(false);
  }, []);

  useEffect(() => {
    return () => {
      cameraRequestVersionRef.current += 1;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!cameraActive || !videoRef.current || !streamRef.current) return;
    videoRef.current.srcObject = streamRef.current;
    void videoRef.current.play().catch(() => {
      setErrorMessage("The camera opened but the preview could not play. Try selecting another camera or refresh the page.");
      stopCamera();
    });
  }, [cameraActive, stopCamera]);

  const setDetectionResult = useCallback((result: DetectionResponse, elapsed: number) => {
    setDetections(result.detections);
    setImageSize(result.image);
    setLatency(elapsed);
    setFrameCount((count) => count + 1);
  }, []);

  const runStillDetection = useCallback(async (file: File, threshold: number, selectedProvider: DetectionProvider, prompt: string) => {
    if (requestPendingRef.current) {
      abortRef.current?.abort();
    }
    const version = ++requestVersionRef.current;
    const owner = ++requestOwnerRef.current;
    const controller = new AbortController();
    abortRef.current = controller;
    requestPendingRef.current = true;
    setIsDetecting(true);
    setErrorMessage(null);
    const startedAt = performance.now();

    try {
      const result = await detectImage(file, threshold, selectedProvider, prompt, controller.signal);
      if (version === requestVersionRef.current) setDetectionResult(result, performance.now() - startedAt);
    } catch (error) {
      if (version === requestVersionRef.current && !controller.signal.aborted) {
        setDetections([]);
        setErrorMessage(describeError(error));
      }
    } finally {
      if (owner === requestOwnerRef.current) {
        requestPendingRef.current = false;
        if (version === requestVersionRef.current) setIsDetecting(false);
      }
    }
  }, [setDetectionResult]);

  const providerReady = provider === "local"
    ? health.status === "ready"
    : provider === "world"
      ? health.status === "ready" && health.worldStatus === "ready"
      : Boolean(health.googleConfigured);

  useEffect(() => {
    if (!imageFile || cameraActive) return;
    if (!providerReady) return;
    if (provider === "world" && !objectPrompt.trim()) return;
    const timeout = window.setTimeout(() => void runStillDetection(imageFile, confidence, provider, objectPrompt), 250);
    return () => window.clearTimeout(timeout);
  }, [imageFile, confidence, cameraActive, providerReady, provider, objectPrompt, runStillDetection]);

  useEffect(() => {
    if (!cameraActive) return;
    let active = true;
    let timer: number | undefined;

    const schedule = (delay = 333) => {
      if (active) timer = window.setTimeout(() => void captureAndDetect(), delay);
    };

    const captureAndDetect = async () => {
      const video = videoRef.current;
      if (!active) return;
      if (!providerReady) {
        setIsDetecting(false);
        schedule(1000);
        return;
      }
      if (provider === "world" && !objectPrompt.trim()) {
        setIsDetecting(false);
        setErrorMessage("Enter at least one object name to run open-vocabulary detection.");
        schedule(700);
        return;
      }
      if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || requestPendingRef.current) {
        schedule();
        return;
      }

      const width = video.videoWidth;
      const height = video.videoHeight;
      if (!width || !height) {
        schedule();
        return;
      }

      const scale = Math.min(1, 640 / Math.max(width, height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const context = canvas.getContext("2d");
      if (!context) {
        setErrorMessage("Your browser could not prepare a camera frame.");
        schedule();
        return;
      }
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      if (isFlatGreenFrame(context, canvas.width, canvas.height)) {
        setIsDetecting(false);
        if (!flatGreenWarningRef.current) {
          flatGreenWarningRef.current = true;
          setErrorMessage("The selected camera is sending a solid green frame. Choose another camera below, or check the camera's privacy shutter and driver.");
        }
        schedule(1200);
        return;
      }
      flatGreenWarningRef.current = false;

      const frame = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
      if (!active || !frame) {
        schedule();
        return;
      }

      requestPendingRef.current = true;
      const version = requestVersionRef.current;
      const owner = ++requestOwnerRef.current;
      const controller = new AbortController();
      abortRef.current = controller;
      setIsDetecting(true);
      setErrorMessage(null);
      const startedAt = performance.now();

      try {
        const result = await detectImage(frame, confidence, provider, objectPrompt, controller.signal);
        if (active && version === requestVersionRef.current) {
          setDetectionResult(result, performance.now() - startedAt);
        }
      } catch (error) {
        if (active && !controller.signal.aborted) setErrorMessage(describeError(error));
      } finally {
        if (owner === requestOwnerRef.current) {
          requestPendingRef.current = false;
          if (active) setIsDetecting(false);
        }
        schedule();
      }
    };

    schedule(100);
    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [cameraActive, confidence, provider, objectPrompt, providerReady, setDetectionResult]);

  const startCamera = useCallback(async (requestedDeviceId?: string) => {
    const requestVersion = ++cameraRequestVersionRef.current;
    setCameraStarting(true);
    setErrorMessage(null);
    flatGreenWarningRef.current = false;
    setInputMode("camera");
    setDetections([]);
    setFrameCount(0);
    setLatency(null);
    requestVersionRef.current += 1;
    abortRef.current?.abort();
    setImageFile(null);
    setImageUrl(null);
    setImageSize(null);
    setImageName("");

    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorMessage("This browser does not support camera access. Try a recent version of Chrome, Edge, Firefox, or Safari.");
      setCameraStarting(false);
      return;
    }

    try {
      const preferredFacingMode = window.matchMedia("(max-width: 760px)").matches ? "environment" : "user";
      const videoConstraints: MediaTrackConstraints = requestedDeviceId || cameraDeviceId
        ? { deviceId: { exact: requestedDeviceId || cameraDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
        : { facingMode: { ideal: preferredFacingMode }, width: { ideal: 1280 }, height: { ideal: 720 } };
      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: false,
      });
      if (requestVersion !== cameraRequestVersionRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = stream;
      const activeTrack = stream.getVideoTracks()[0];
      const trackSettings = activeTrack?.getSettings();
      const actualDeviceId = trackSettings?.deviceId ?? requestedDeviceId ?? cameraDeviceId;
      if (trackSettings?.width && trackSettings.height) setImageSize({ width: trackSettings.width, height: trackSettings.height });
      if (actualDeviceId) setCameraDeviceId(actualDeviceId);
      try {
        setCameraDevices((await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === "videoinput"));
      } catch {
        setCameraDevices([]);
      }
      setCameraActive(true);
    } catch (error) {
      if (requestVersion !== cameraRequestVersionRef.current) return;
      const name = error instanceof DOMException ? error.name : "";
      setErrorMessage(
        name === "NotAllowedError"
          ? "Camera access was denied. Allow camera access in your browser settings and try again."
          : name === "NotFoundError"
            ? "No camera was found on this device."
            : "The camera could not be started. Check that it is not being used by another app.",
      );
    } finally {
      if (requestVersion === cameraRequestVersionRef.current) setCameraStarting(false);
    }
  }, [cameraDeviceId]);

  const chooseImageMode = useCallback(() => {
    stopCamera();
    setInputMode("image");
    setErrorMessage(null);
  }, [stopCamera]);

  const acceptImage = useCallback(async (file?: File) => {
    if (!file) return;
    if (!ACCEPTED_TYPES.has(file.type)) {
      setErrorMessage("Choose a JPEG, PNG, or WebP image.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setErrorMessage("This image is over 10 MB. Choose a smaller file and try again.");
      return;
    }

    let dimensions: { width: number; height: number };
    try {
      const bitmap = await createImageBitmap(file);
      dimensions = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
    } catch {
      setErrorMessage("This file could not be read as an image.");
      return;
    }

    stopCamera();
    setInputMode("image");
    setErrorMessage(null);
    setDetections([]);
    setFrameCount(0);
    setLatency(null);
    setImageName(file.name);
    setImageFile(file);
    setImageUrl(URL.createObjectURL(file));
    setImageSize(dimensions);
  }, [stopCamera]);

  const toggleCamera = useCallback(() => {
    if (cameraActive || cameraStarting) {
      stopCamera();
      return;
    }
    void startCamera();
  }, [cameraActive, cameraStarting, startCamera, stopCamera]);

  const switchCamera = useCallback((deviceId: string) => {
    setCameraDeviceId(deviceId);
    stopCamera();
    void startCamera(deviceId);
  }, [startCamera, stopCamera]);

  const groupedDetections = useMemo(() => {
    const groups = new Map<string, { count: number; confidence: number }>();
    for (const detection of detections) {
      const current = groups.get(detection.className) ?? { count: 0, confidence: detection.confidence };
      groups.set(detection.className, {
        count: current.count + 1,
        confidence: Math.max(current.confidence, detection.confidence),
      });
    }
    return [...groups.entries()].sort((left, right) => right[1].count - left[1].count);
  }, [detections]);

  const downloadAnnotatedImage = useCallback(async () => {
    const video = videoRef.current;
    const source = cameraActive ? video : imageFile;
    const width = cameraActive ? video?.videoWidth ?? 0 : imageSize?.width ?? 0;
    const height = cameraActive ? video?.videoHeight ?? 0 : imageSize?.height ?? 0;
    if (!source || !width || !height) return;

    let bitmap: ImageBitmap | null = null;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) return;

      if (cameraActive) context.drawImage(source as HTMLVideoElement, 0, 0, width, height);
      else {
        bitmap = await createImageBitmap(source as File);
        context.drawImage(bitmap, 0, 0, width, height);
      }

      const lineWidth = Math.max(3, Math.round(width / 500));
      context.lineWidth = lineWidth;
      context.font = `600 ${Math.max(16, Math.round(width / 48))}px Arial, sans-serif`;
      for (let index = 0; index < detections.length; index += 1) {
        const detection = detections[index];
        const color = BOX_COLORS[index % BOX_COLORS.length];
        const x = detection.box.x * width;
        const y = detection.box.y * height;
        const boxWidth = detection.box.width * width;
        const boxHeight = detection.box.height * height;
        const label = `${detection.className}  ${Math.round(detection.confidence * 100)}%`;
        const labelHeight = Math.max(28, Math.round(width / 30));
        const labelWidth = context.measureText(label).width + 22;
        context.strokeStyle = color;
        context.strokeRect(x, y, boxWidth, boxHeight);
        context.fillStyle = color;
        context.fillRect(x, Math.max(0, y - labelHeight), labelWidth, labelHeight);
        context.fillStyle = "#111827";
        context.fillText(label, x + 11, Math.max(20, y - labelHeight / 2 + 6));
      }

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) return;
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = cameraActive ? "vision-studio-camera.png" : `${imageFile?.name.replace(/\.[^.]+$/, "") || "vision-studio"}-detected.png`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } finally {
      bitmap?.close();
    }
  }, [cameraActive, detections, imageFile, imageSize]);

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(true);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    void acceptImage(event.dataTransfer.files[0]);
  };

  const sourceAspect = imageSize ? `${imageSize.width} / ${imageSize.height}` : "16 / 9";
  const healthLabel = providerReady
    ? provider === "google" ? "GOOGLE READY" : "ENGINE READY"
    : provider === "world" && health.worldStatus === "loading"
      ? "OPEN MODEL STARTING"
      : health.status === "loading"
        ? "MODEL STARTING"
        : health.status === "offline"
          ? "API OFFLINE"
          : "ENGINE ISSUE";
  const providerTitle = provider === "world" ? "YOLO-WORLD" : provider === "google" ? "GOOGLE VISION" : "YOLO26n";
  const providerFootnote = provider === "world"
    ? "TEXT-PROMPTED OBJECT SEARCH · LOCAL"
    : provider === "google"
      ? "OBJECT LOCALIZATION · GOOGLE CLOUD"
      : "80 COMMON OBJECT CLASSES · LOCAL";
  const totalObjects = detections.length;
  const hasSource = Boolean(imageFile || cameraActive);
  const waitingTitle = provider === "world" && health.worldStatus === "loading"
    ? "Open model is warming up"
    : provider === "google" && !health.googleConfigured
      ? "Google Vision is not configured"
      : health.status === "loading"
        ? "Model is warming up"
        : health.status === "offline"
          ? "Detector is offline"
          : "Detector needs attention";

  return (
    <main className="app-shell">
      <div className="topbar">
        <a className="brand-lockup" href="#top" aria-label="Sightline Vision Studio home">
          <span className="brand-mark"><Aperture size={19} strokeWidth={1.8} /></span>
          <span className="brand-type"><strong>SIGHTLINE</strong><small>OBJECT INTELLIGENCE</small></span>
        </a>
        <div className="topbar-center"><span className="topbar-separator" /> LOCAL WORKSPACE <span className="topbar-dot" /> DETECTOR / 01</div>
        <div className="topbar-actions">
          <div className={`engine-badge ${providerReady ? "is-ready" : health.status === "offline" ? "is-offline" : "is-loading"}`}>
            {providerReady ? <Check size={13} /> : health.status === "loading" || (provider === "world" && health.worldStatus === "loading") ? <LoaderCircle className="spin" size={13} /> : <span className="status-dot" />}
            <span>{healthLabel}</span>
          </div>
          <button className="icon-button help-button" type="button" aria-label="About Vision Studio" title={provider === "google" ? "Selected images and camera frames are sent to Google Cloud Vision." : "Local detector: images stay on this device and local API."}>
            <CircleHelp size={17} />
          </button>
          <button className="avatar-button" type="button" aria-label="Local session">V</button>
        </div>
      </div>

      <section className="intro-row" id="top">
        <div>
          <div className="eyebrow intro-eyebrow"><span className="eyebrow-line" /> COMPUTER VISION / WORKSPACE</div>
          <h1>See what’s <span>in your frame.</span></h1>
          <p className="intro-copy">A little closer to the world around you. Drop in a photo or use your camera to find what’s there.</p>
        </div>
        <div className={`local-note ${provider === "google" ? "cloud-note" : ""}`}><ShieldCheck size={17} /><span><strong>{provider === "google" ? "Cloud analysis" : "Private by design"}</strong><small>{provider === "google" ? "Frames are sent to Google" : "Images stay on your device"}</small></span></div>
      </section>

      <div className="workspace-toolbar">
        <div className="workspace-label"><span className="workspace-number">01</span><span>DETECTION STUDIO</span><ChevronDown size={13} /></div>
        <div className="toolbar-center"><span className="toolbar-live-dot" /> {providerReady ? "SESSION READY" : "ENGINE STARTING"} <span className="toolbar-divider">/</span> {providerTitle}</div>
        <div className="toolbar-right"><span><Activity size={14} /> {frameCount.toString().padStart(2, "0")} {cameraActive ? "FRAMES" : "RUNS"}</span><span className="toolbar-divider">/</span><span>{latency === null ? "— MS" : `${Math.round(latency)} MS`}</span></div>
      </div>

      <section className="workspace-grid">
        <div className="main-column">
          <div className="panel canvas-panel">
            <div className="panel-heading canvas-heading">
              <div className="panel-title"><span className="panel-icon"><ScanLine size={16} /></span><span><strong>Visual canvas</strong><small>Object detection preview</small></span></div>
              <div className="source-switcher" role="tablist" aria-label="Input source">
                <button className={`source-tab ${inputMode === "image" ? "active" : ""}`} type="button" role="tab" aria-selected={inputMode === "image"} onClick={chooseImageMode}><FileImage size={14} /> Image</button>
                <button className={`source-tab ${inputMode === "camera" ? "active" : ""}`} type="button" role="tab" aria-selected={inputMode === "camera"} onClick={() => { setInputMode("camera"); if (!cameraActive && !cameraStarting) void startCamera(); }}><Video size={14} /> Live camera</button>
              </div>
            </div>

            <div
              className={`canvas-interaction ${dragActive ? "drag-active" : ""}`}
              onDragEnter={onDragOver}
              onDragOver={onDragOver}
              onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragActive(false); }}
              onDrop={onDrop}
            >
              {dragActive && <div className="drop-overlay"><Upload size={26} /><strong>Drop to inspect</strong><span>JPEG · PNG · WEBP</span></div>}
              <DetectionPreview
                imageUrl={imageUrl}
                imageName={imageName}
                aspectRatio={sourceAspect}
                cameraActive={cameraActive}
                videoRef={videoRef}
                detections={detections}
                loading={isDetecting}
                onChooseImage={() => imageInputRef.current?.click()}
              />
              <input
                ref={imageInputRef}
                className="visually-hidden"
                type="file"
                accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                onChange={(event) => {
                  void acceptImage(event.target.files?.[0]);
                  event.currentTarget.value = "";
                }}
                aria-label="Choose an image for object detection"
              />
            </div>

            <div className="canvas-footer">
              <div className="footer-meta"><span className={`source-pip ${cameraActive ? "live" : imageFile ? "loaded" : ""}`} />{cameraStarting ? "CAMERA STARTING" : cameraActive ? "CAMERA ACTIVE" : imageFile ? "SOURCE LOADED" : "AWAITING INPUT"}<span className="meta-divider" />{imageSize ? `${imageSize.width} × ${imageSize.height}` : "NO IMAGE"}</div>
              {cameraActive && cameraDevices.length > 1 && (
                <label className="camera-picker"><span className="visually-hidden">Select camera</span><select value={cameraDeviceId} onChange={(event) => switchCamera(event.target.value)} aria-label="Select camera">
                  {cameraDevices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Camera ${index + 1}`}</option>)}
                </select></label>
              )}
              <div className="canvas-actions">
                {cameraActive || cameraStarting ? (
                  <button className="button button-secondary" onClick={stopCamera} type="button"><VideoOff size={15} /> Stop camera</button>
                ) : (
                  <button className="button button-secondary" onClick={() => imageInputRef.current?.click()} type="button"><Upload size={15} /> Upload image</button>
                )}
                <button className="button button-primary" onClick={toggleCamera} type="button">
                  {cameraActive ? <Check size={15} /> : cameraStarting ? <LoaderCircle size={15} className="spin" /> : <Camera size={15} />}{cameraActive ? "Live detection on" : cameraStarting ? "Starting camera…" : "Use camera"}
                </button>
              </div>
            </div>
          </div>

          {errorMessage && (
            <div className="error-banner" role="alert">
              <Info size={17} /><span>{errorMessage}</span><button type="button" aria-label="Dismiss error" onClick={() => setErrorMessage(null)}><X size={16} /></button>
            </div>
          )}

          <div className="lower-grid">
            <div className="panel control-panel">
              <div className="panel-heading compact-heading">
                <div className="panel-title"><span className="panel-icon"><Settings2 size={16} /></span><span><strong>Detection controls</strong><small>Adjust what gets surfaced</small></span></div>
                <span className="control-count"><Zap size={12} /> LIVE</span>
              </div>
              <div className="provider-control">
                <span className="field-label">DETECTION ENGINE</span>
                <div className="provider-switcher" role="group" aria-label="Detection engine">
                  <button type="button" className={provider === "local" ? "selected" : ""} onClick={() => changeProvider("local")}>Fast · 80 classes</button>
                  <button type="button" className={provider === "world" ? "selected" : ""} onClick={() => changeProvider("world")}>Open vocabulary</button>
                  <button type="button" className={provider === "google" ? "selected" : ""} onClick={() => changeProvider("google")} disabled={!health.googleConfigured}>Google Vision</button>
                </div>
                {provider === "world" ? (
                  <label className="prompt-field"><span className="field-label">OBJECTS TO FIND · COMMA SEPARATED</span><input value={objectPrompt} onChange={(event) => changeObjectPrompt(event.target.value)} maxLength={1000} placeholder="red backpack, coffee mug, headphones" aria-label="Objects to find" /><small>Name up to 30 objects. The local open-vocabulary model searches these concepts.</small></label>
                ) : provider === "google" ? (
                  <p className="provider-note">Image frames are sent to Google Cloud Vision for object localization.</p>
                ) : health.googleConfigured ? (
                  <p className="provider-note">Local mode keeps images on this device. Google Vision is also configured.</p>
                ) : (
                  <p className="provider-note">Google Cloud Vision is optional. Add its API key to <code>api/.env</code> to enable it.</p>
                )}
                {provider === "world" && health.worldStatus === "loading" && <p className="provider-note">The open-vocabulary model is warming up; it will become ready automatically.</p>}
                {provider === "world" && health.worldStatus === "error" && <p className="provider-note is-error">{health.worldMessage ?? "Open-vocabulary model failed to load. Check the API terminal."}</p>}
              </div>
              <div className="threshold-row">
                <div><span className="field-label">CONFIDENCE THRESHOLD</span><p>Hide detections below this score.</p></div>
                <div className="threshold-value">{Math.round(confidence * 100)}<small>%</small></div>
              </div>
              <input
                className="confidence-range"
                type="range"
                min="0.05"
                max="0.95"
                step="0.05"
                value={confidence}
                onChange={(event) => setConfidence(Number(event.target.value))}
                aria-label="Confidence threshold"
                style={{ "--range-progress": `${((confidence - 0.05) / 0.9) * 100}%` } as CSSProperties}
              />
              <div className="range-labels"><span>MORE OBJECTS</span><span>HIGHER CERTAINTY</span></div>
              <div className="control-note"><Info size={14} /><span>{provider === "world" ? "Open-vocabulary search can find objects outside the standard 80 classes; name what you want to find." : provider === "google" ? "Google returns localized object boxes. Confidence filters less certain results." : "The fast local model recognizes 80 common classes. Lower confidence can reveal less certain objects."}</span></div>
            </div>

            <div className="panel model-panel">
              <div className="panel-heading compact-heading">
                <div className="panel-title"><span className="panel-icon model-icon"><Sparkles size={16} /></span><span><strong>Detection engine</strong><small>{provider === "google" ? "Google Cloud Vision" : provider === "world" ? "Running locally · open vocabulary" : "Running locally on your device"}</small></span></div>
                <span className="ready-chip">{providerReady ? "READY" : provider === "world" && health.worldStatus === "loading" ? "LOADING" : provider === "google" && !health.googleConfigured ? "SETUP" : "OFFLINE"}</span>
              </div>
              <div className="model-name-row"><div><span className="model-kicker">{provider === "google" ? "REMOTE API" : "PRETRAINED MODEL"}</span><strong className="engine-name">{providerTitle}</strong></div><span className="model-orbit"><Aperture size={25} strokeWidth={1.3} /></span></div>
              <div className="model-specs"><span><Gauge size={13} /> {provider === "google" ? "Cloud inference" : "Local inference"}</span><span><ShieldCheck size={13} /> {provider === "google" ? "Key stays server-side" : "No image storage"}</span></div>
              <div className="model-footnote">{providerFootnote.split(" · ")[0]} <span>·</span> {provider === "google" ? "EXTERNAL" : "CPU / GPU"}</div>
            </div>
          </div>
        </div>

        <aside className="panel results-panel">
          <div className="panel-heading results-heading">
            <div className="panel-title"><span className="panel-icon result-icon"><Aperture size={16} /></span><span><strong>What we found</strong><small>Detection summary</small></span></div>
            <button className="icon-button panel-more" type="button" title="Summary details" aria-label="Summary details"><Maximize2 size={15} /></button>
          </div>

          <div className="results-total"><div className="total-number">{totalObjects.toString().padStart(2, "0")}</div><div><span className="field-label">OBJECTS FOUND</span><span className="total-subtitle">{totalObjects === 1 ? "One thing, clearly seen." : totalObjects > 1 ? "A few things in the frame." : "Your scene is still quiet."}</span></div></div>

          <div className="results-section-title"><span>DETECTED CLASSES</span><span>{groupedDetections.length.toString().padStart(2, "0")}</span></div>
          <div className="detection-list" aria-live="polite">
            {groupedDetections.length ? groupedDetections.map(([name, summary], index) => (
              <div className="detection-row" key={name}>
                <span className="class-color" style={{ backgroundColor: BOX_COLORS[index % BOX_COLORS.length] }} />
                <span className="class-name">{name}<small>{Math.round(summary.confidence * 100)}% confidence</small></span>
                <span className="class-count">×{summary.count}</span>
              </div>
            )) : (
              <div className="results-empty">
                <div className="results-empty-icon"><Aperture size={18} strokeWidth={1.5} /></div>
                <strong>{isDetecting ? "Reading the frame…" : hasSource && !providerReady ? waitingTitle : hasSource ? "Nothing detected yet" : "Ready when you are"}</strong>
                <p>{isDetecting ? provider === "google" ? "Google Cloud Vision is analyzing this frame." : provider === "world" ? "The open-vocabulary model is searching your object prompts." : "The local model is looking for familiar objects." : hasSource && !providerReady ? provider === "world" ? health.worldMessage ?? "The open-vocabulary model will analyze your image when it is ready." : provider === "google" ? "Add a Google Cloud Vision API key in api/.env, then restart the API." : health.message ?? "The local model will analyze your image when it is ready." : hasSource ? provider === "world" ? "Try different object names or lower the confidence threshold." : "Try another angle or lower the confidence threshold." : "Upload a photo or turn on your camera to see detections here."}</p>
              </div>
            )}
          </div>

          <div className="results-bottom">
            <div className="result-quality"><span className="quality-icon"><Check size={13} /></span><span><strong>Detection quality</strong><small>{totalObjects ? `${Math.round(detections.reduce((sum, item) => sum + item.confidence, 0) / totalObjects * 100)}% average confidence` : "Waiting for a result"}</small></span></div>
            <button className="button button-export" type="button" onClick={() => void downloadAnnotatedImage()} disabled={!detections.length || (!imageFile && !cameraActive)}><ArrowDownToLine size={15} /> Export annotated image</button>
            <p className="export-note">Your annotated image is created in your browser.</p>
          </div>
        </aside>
      </section>

      <footer className="app-footer">
        <div className="footer-brand"><span className="footer-mark"><Aperture size={14} /></span> SIGHTLINE <span className="footer-version">VISION STUDIO / BETA</span></div>
        <div className="footer-status"><span className={`footer-status-dot ${providerReady ? "" : "is-muted"}`} />{providerReady ? `Connected to ${providerTitle}` : provider === "world" ? health.worldMessage ?? "Open-vocabulary model starting" : provider === "google" ? "Google Vision needs an API key" : health.message ?? "Waiting for the local detector"}<span className="footer-divider" />API <code>{new URL(getDetectorApiUrl()).host}</code></div>
        <div className="footer-right">MADE FOR SEEING MORE <span>✳</span></div>
      </footer>
    </main>
  );
}
