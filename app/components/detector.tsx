"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type DragEvent, type ChangeEvent } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Boxes,
  Camera,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  Cloud,
  FileImage,
  Gauge,
  ImagePlus,
  LoaderCircle,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Target,
  Upload,
  Wifi,
  X,
} from "lucide-react";
import { CameraCapture } from "./camera-capture";
import {
  checkApiHealth,
  detectObjects,
  type ApiStatus,
  type DetectionResponse,
  type HealthResponse,
} from "../lib/detector-api";

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

function formatBytes(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatModelName(name: string) {
  return name.split(/[\\/]/).pop()?.replace(/\.pt$/i, "") || "YOLO26 nano";
}

export function Detector() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [confidence, setConfidence] = useState(0.35);
  const [apiStatus, setApiStatus] = useState<ApiStatus>("checking");
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [result, setResult] = useState<DetectionResponse | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const resultIsStale = result !== null && Math.abs(result.confidence_threshold - confidence) > 0.001;

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  const refreshHealth = useCallback(async (signal?: AbortSignal) => {
    setApiStatus("checking");
    try {
      const response = await checkApiHealth(signal);
      setHealth(response);
      setApiStatus(response.status === "ready" ? "online" : "checking");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setHealth(null);
      setApiStatus("offline");
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void refreshHealth(controller.signal);
    return () => controller.abort();
  }, [refreshHealth]);

  function chooseFile(nextFile: File | undefined) {
    if (!nextFile) return;
    setErrorMessage(null);
    setResult(null);
    if (nextFile.size > MAX_IMAGE_BYTES) {
      setFile(null);
      setErrorMessage("That image is over the 12 MB upload limit. Choose a smaller one to continue.");
      return;
    }
    if (nextFile.type && !["image/jpeg", "image/png", "image/webp"].includes(nextFile.type)) {
      setFile(null);
      setErrorMessage("Sightline works with JPEG, PNG, and WebP images.");
      return;
    }
    setFile(nextFile);
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    chooseFile(event.target.files?.[0]);
    event.target.value = "";
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    chooseFile(event.dataTransfer.files?.[0]);
  }

  async function runDetection() {
    if (!file || isDetecting) return;
    setIsDetecting(true);
    setErrorMessage(null);
    try {
      const response = await detectObjects(file, confidence);
      setResult(response);
      setApiStatus("online");
      setHealth({ status: "ready", model: response.model });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Detection didn't finish. Please try again.";
      setErrorMessage(message);
      if (message.toLowerCase().includes("reach the detection api")) {
        setApiStatus("offline");
        setHealth(null);
      }
    } finally {
      setIsDetecting(false);
    }
  }

  function startOver() {
    setFile(null);
    setResult(null);
    setErrorMessage(null);
  }

  const activeModel = health?.model || result?.model || "yolo26n.pt";
  const rangeStyle = { "--range-progress": `${((confidence - 0.1) / 0.8) * 100}%` } as CSSProperties;

  return (
    <main className="site-shell">
      <div className="ambient ambient--one" aria-hidden="true" />
      <div className="ambient ambient--two" aria-hidden="true" />

      <header className="topbar page-wrap">
        <a className="brand" href="#top" aria-label="Sightline home">
          <span className="brand-mark"><ScanLine size={19} strokeWidth={2.2} /></span>
          <span className="brand-word">sightline<span>.</span></span>
          <span className="brand-divider" />
          <span className="brand-caption">VISION STUDIO</span>
        </a>
        <nav className="top-nav" aria-label="Main navigation">
          <a href="#how-it-works">How it works <ArrowUpRight size={14} /></a>
          <a className="nav-github" href="https://github.com/ultralytics/ultralytics" target="_blank" rel="noreferrer">
            YOLO engine <ArrowUpRight size={14} />
          </a>
        </nav>
      </header>

      <section className="hero page-wrap" id="top">
        <div className="hero-copy">
          <div className="hero-kicker"><span className="kicker-line" /> COMPUTER VISION, MADE SIMPLE</div>
          <h1>Know what you&apos;re<br className="desktop-break" /> looking <span>at.</span></h1>
          <p>Drop in a photo. Let YOLO find the details. Get a clear, labeled view of every object in the frame.</p>
          <div className="hero-footnote"><ShieldCheck size={16} /> Your images stay yours. Nothing is stored.</div>
        </div>

        <div className="hero-orbit" aria-hidden="true">
          <div className="orbit orbit--outer" />
          <div className="orbit orbit--inner" />
          <div className="orbit-center"><ScanLine size={30} strokeWidth={1.6} /></div>
          <span className="orbit-dot orbit-dot--one" />
          <span className="orbit-dot orbit-dot--two" />
          <div className="orbit-tag orbit-tag--one"><span /> 80 object classes</div>
          <div className="orbit-tag orbit-tag--two"><Sparkles size={13} /> YOLO26 nano</div>
        </div>
      </section>

      <section className="studio page-wrap" aria-labelledby="studio-title">
        <div className="studio-heading">
          <div>
            <div className="section-index"><span>01</span> / YOUR WORKSPACE</div>
            <h2 id="studio-title">Start with a frame</h2>
          </div>
          <div className={`service-pill service-pill--${apiStatus}`} aria-live="polite">
            <span className="service-dot" />
            <span>{apiStatus === "online" ? "Engine ready" : apiStatus === "checking" ? "Waking engine" : "Engine offline"}</span>
            <button type="button" onClick={() => void refreshHealth()} aria-label="Refresh service status" title="Refresh service status">
              <RefreshCw size={13} className={apiStatus === "checking" ? "spin" : ""} />
            </button>
          </div>
        </div>

        <div className="workbench">
          <section className="source-panel" aria-labelledby="source-heading">
            <div className="panel-topline">
              <div className="panel-title"><span className="panel-number">A</span><div><span className="eyebrow">THE INPUT</span><h3 id="source-heading">Your image</h3></div></div>
              <div className="source-actions">
                <button type="button" className="quiet-button" onClick={() => setCameraOpen(true)}><Camera size={15} /> Camera</button>
                {file && <button type="button" className="quiet-button quiet-button--remove" onClick={startOver}><X size={15} /> Clear</button>}
              </div>
            </div>

            <input
              ref={fileInputRef}
              className="visually-hidden"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={onInputChange}
              tabIndex={-1}
              aria-label="Choose a JPEG, PNG, or WebP image"
            />

            <div
              className={`dropzone ${dragging ? "dropzone--active" : ""} ${previewUrl ? "dropzone--loaded" : ""}`}
              onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }}
              onDrop={onDrop}
            >
              {previewUrl && file ? (
                <div className="preview-layout">
                  <div className="image-preview">
                    <img
                      src={result?.annotated_image || previewUrl}
                      alt={result ? `Detected objects in ${file.name}` : `Preview of ${file.name}`}
                    />
                    {result && <span className="image-result-tag"><ScanLine size={13} /> DETECTED</span>}
                    <button className="replace-image" type="button" onClick={() => fileInputRef.current?.click()}>
                      <ImagePlus size={14} /> Replace image
                    </button>
                  </div>
                  <div className="file-meta">
                    <span className="file-meta__icon"><FileImage size={17} /></span>
                    <span className="file-meta__name" title={file.name}>{file.name}</span>
                    <span className="file-meta__size">{formatBytes(file.size)}</span>
                    {result && <span className="file-meta__complete"><Check size={13} /></span>}
                  </div>
                  {result && <div className="image-note">Showing the annotated result <span>·</span> original image stays on your device</div>}
                </div>
              ) : (
                <div className="dropzone-empty">
                  <div className="upload-illustration">
                    <span className="upload-illustration__back"><ScanLine size={30} strokeWidth={1.4} /></span>
                    <span className="upload-illustration__front"><Upload size={21} strokeWidth={1.8} /></span>
                    <span className="upload-spark upload-spark--one" />
                    <span className="upload-spark upload-spark--two" />
                  </div>
                  <h4>Drop an image to get started</h4>
                  <p>Or choose a file from your device</p>
                  <button className="button button--browse" type="button" onClick={() => fileInputRef.current?.click()}>
                    <ImagePlus size={16} /> Browse images <ArrowRight size={15} />
                  </button>
                  <div className="format-note"><span>JPG</span><span>PNG</span><span>WEBP</span><i /> UP TO 12 MB</div>
                </div>
              )}
            </div>

            <div className="privacy-line"><ShieldCheck size={14} /> Images are processed just for this session and never saved.</div>
          </section>

          <aside className="controls-panel" aria-labelledby="controls-heading">
            <div className="panel-topline">
              <div className="panel-title"><span className="panel-number panel-number--green">B</span><div><span className="eyebrow">THE ANALYSIS</span><h3 id="controls-heading">Detection setup</h3></div></div>
              <span className={`mini-status mini-status--${apiStatus}`}><span /> {apiStatus === "online" ? "READY" : apiStatus === "checking" ? "CONNECTING" : "STANDBY"}</span>
            </div>

            <div className="model-card">
              <div className="model-card__icon"><Boxes size={19} strokeWidth={1.7} /></div>
              <div className="model-card__copy"><span>ACTIVE MODEL</span><strong>{formatModelName(activeModel)}</strong></div>
              <span className="model-card__tag">{formatModelName(activeModel).toLowerCase() === "yolo26n" ? "COCO" : "CUSTOM"}</span>
            </div>
            <p className="model-description">A fast, pretrained model for everyday objects—people, vehicles, animals, and more.</p>

            <div className="control-divider" />

            <div className="confidence-heading">
              <div className="control-label"><Gauge size={16} /><span>Confidence threshold</span><button type="button" className="help-button" title="Detections below this score are hidden" aria-label="Confidence threshold help"><CircleHelp size={14} /></button></div>
              <span className="confidence-value">{Math.round(confidence * 100)}<small>%</small></span>
            </div>
            <input
              className="confidence-slider"
              type="range"
              min="0.1"
              max="0.9"
              step="0.01"
              value={confidence}
              style={rangeStyle}
              onChange={(event) => setConfidence(Number(event.target.value))}
              aria-label="Detection confidence threshold"
            />
            <div className="range-labels"><span>More detections</span><span>Higher certainty</span></div>
            <p className="confidence-hint">Only matches above this score are shown.</p>

            {errorMessage && (
              <div className="error-callout" role="alert">
                <span className="error-callout__icon"><CircleHelp size={16} /></span>
                <div><strong>Couldn&apos;t finish</strong><p>{errorMessage}</p></div>
                <button type="button" aria-label="Dismiss error" onClick={() => setErrorMessage(null)}><X size={15} /></button>
              </div>
            )}

            {apiStatus === "offline" && (
              <div className="api-hint"><Cloud size={15} /><span>Connect the Python API with <code>NEXT_PUBLIC_API_URL</code> to run detection.</span></div>
            )}

            <button className="button button--detect" type="button" onClick={() => void runDetection()} disabled={!file || isDetecting}>
              {isDetecting ? <><LoaderCircle className="spin" size={18} /> Finding objects…</> : <><ScanLine size={18} /> Detect objects <ArrowRight size={16} /></>}
            </button>
            <div className="privacy-foot"><Wifi size={13} /><span>Secure, one-time image processing</span><span className="privacy-foot__divider" /><span>{apiStatus === "online" ? "API connected" : "API status shown above"}</span></div>

            {result && (
              <section className="results-panel" aria-labelledby="results-heading" aria-live="polite">
                <div className="results-heading">
                  <div><span className="eyebrow">THE FINDINGS</span><h3 id="results-heading">Objects found <span className="result-count">{result.detections.length}</span></h3></div>
                  <span className="elapsed-time"><Clock3 size={13} /> {(result.elapsed_ms / 1000).toFixed(2)}s</span>
                </div>
                {result.detections.length > 0 ? (
                  <div className="detection-list">
                    {result.detections.map((detection, index) => (
                      <div className="detection-row" key={`${detection.class_id}-${index}`}>
                        <span className={`detection-marker detection-marker--${index % 5}`}><Target size={14} /></span>
                        <span className="detection-name">{detection.class_name}</span>
                        <span className="detection-confidence">{Math.round(detection.confidence * 100)}%</span>
                        <span className="detection-meter"><span style={{ width: `${detection.confidence * 100}%` }} /></span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="no-detections"><span className="no-detections__icon"><ScanLine size={19} /></span><div><strong>No objects above {Math.round(result.confidence_threshold * 100)}%</strong><p>Try lowering the confidence threshold or using a clearer image.</p></div></div>
                )}
                {resultIsStale && <p className="results-stale">Threshold changed · run detection again to refresh these results.</p>}
                <button className="download-button" type="button" onClick={() => {
                  const link = document.createElement("a");
                  link.href = result.annotated_image;
                  link.download = `sightline-${file?.name.replace(/\.[^/.]+$/, "") || "result"}.jpg`;
                  link.click();
                }}>
                  <ArrowDownToLine size={15} /> Download annotated image <ChevronRight size={15} />
                </button>
              </section>
            )}
          </aside>
        </div>

        <div className="workbench-foot"><span><Check size={13} /> NO SIGN-UP NEEDED</span><i /><span><Check size={13} /> PRIVATE BY DESIGN</span><i /><span><Check size={13} /> POWERED BY ULTRALYTICS</span></div>
      </section>

      <section className="how-section page-wrap" id="how-it-works">
        <div className="how-heading">
          <div><div className="section-index"><span>02</span> / THE PROCESS</div><h2>Three steps. A sharper picture.</h2></div>
          <p>Good tools get out of the way. Sightline keeps object detection simple from first click to final image.</p>
        </div>
        <div className="steps-grid">
          <article className="step-card"><span className="step-number">01</span><span className="step-icon"><ImagePlus size={19} /></span><h3>Bring your image</h3><p>Drop a photo, browse your files, or snap a fresh frame with your camera.</p><div className="step-arrow"><ArrowRight size={15} /></div></article>
          <article className="step-card"><span className="step-number">02</span><span className="step-icon"><ScanLine size={19} /></span><h3>Let YOLO take a look</h3><p>Choose how sure a match needs to be, then run your detection in a click.</p><div className="step-arrow"><ArrowRight size={15} /></div></article>
          <article className="step-card"><span className="step-number">03</span><span className="step-icon"><ArrowDownToLine size={19} /></span><h3>Keep what you find</h3><p>Review labels and scores, then download the image with detections marked.</p><div className="step-arrow step-arrow--last"><Check size={15} /></div></article>
        </div>
      </section>

      <footer className="footer page-wrap">
        <a className="brand brand--footer" href="#top"><span className="brand-mark"><ScanLine size={17} strokeWidth={2.2} /></span><span className="brand-word">sightline<span>.</span></span></a>
        <p>Made for seeing a little more.</p>
        <a className="footer-link" href="https://docs.ultralytics.com/" target="_blank" rel="noreferrer">Built with Ultralytics YOLO <ArrowUpRight size={13} /></a>
      </footer>

      {cameraOpen && <CameraCapture onCapture={chooseFile} onClose={() => setCameraOpen(false)} />}
    </main>
  );
}
