"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import {
  Activity,
  Aperture,
  ArrowDownToLine,
  Check,
  CircleHelp,
  FileImage,
  Gauge,
  Info,
  LoaderCircle,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
  Zap,
} from "lucide-react";
import { DetectionPreview } from "@/components/detection-preview";
import { analyzeImage, getDetectorApiUrl, getDetectorHealth } from "@/lib/detector-api";
import type { Detection, DetectionResponse, DetectorHealth, SceneAnalysis } from "@/lib/types";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const BOX_COLORS = ["#bef264", "#67e8f9", "#c4b5fd", "#fb923c", "#f9a8d4"];

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong while analyzing this image.";
}

function formatBytes(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function VisionStudio() {
  const [health, setHealth] = useState<DetectorHealth>({ status: "loading", message: "Checking the OpenAI connection…" });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [analysis, setAnalysis] = useState<SceneAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const [runCount, setRunCount] = useState(0);

  const imageInputRef = useRef<HTMLInputElement>(null);
  const submittedFileRef = useRef<File | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestVersionRef = useRef(0);

  const openaiReady = Boolean(health.openaiConfigured);

  useEffect(() => {
    let active = true;
    const refreshHealth = async () => {
      const nextHealth = await getDetectorHealth();
      if (active) setHealth(nextHealth);
    };
    void refreshHealth();
    const interval = window.setInterval(() => void refreshHealth(), 4000);
    return () => {
      active = false;
      window.clearInterval(interval);
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!imageUrl) return;
    return () => URL.revokeObjectURL(imageUrl);
  }, [imageUrl]);

  const setAnalysisResult = useCallback((result: DetectionResponse, elapsed: number) => {
    setDetections(result.detections);
    setAnalysis(result.analysis);
    setImageSize(result.image);
    setLatency(elapsed);
    setRunCount((count) => count + 1);
  }, []);

  const runAnalysis = useCallback(async (file: File) => {
    if (!health.openaiConfigured) {
      setErrorMessage(health.status === "offline"
        ? "The Python API is offline. Start it with .\\run.cmd, then select this image again."
        : "Add OPENAI_API_KEY to api/.env and save the file. The app checks for it automatically.");
      return;
    }

    const version = ++requestVersionRef.current;
    const controller = new AbortController();
    abortRef.current = controller;
    setIsAnalyzing(true);
    setErrorMessage(null);
    setAnalysis(null);
    setDetections([]);
    setLatency(null);
    const startedAt = performance.now();

    try {
      const result = await analyzeImage(file, "", controller.signal);
      if (version === requestVersionRef.current) setAnalysisResult(result, performance.now() - startedAt);
    } catch (error) {
      if (version === requestVersionRef.current && !controller.signal.aborted) {
        setErrorMessage(describeError(error));
      }
    } finally {
      if (version === requestVersionRef.current) setIsAnalyzing(false);
    }
  }, [health.openaiConfigured, health.status, setAnalysisResult]);

  useEffect(() => {
    if (!imageFile || !health.openaiConfigured || submittedFileRef.current === imageFile) return;
    submittedFileRef.current = imageFile;
    void runAnalysis(imageFile);
  }, [health.openaiConfigured, imageFile, runAnalysis]);

  const acceptImage = useCallback(async (file?: File) => {
    if (!file) return;
    if (isAnalyzing) {
      setErrorMessage("Wait for the current image report to finish before choosing another image.");
      return;
    }
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

    abortRef.current?.abort();
    requestVersionRef.current += 1;
    submittedFileRef.current = null;
    setErrorMessage(null);
    setDetections([]);
    setAnalysis(null);
    setLatency(null);
    setImageFile(file);
    setImageUrl(URL.createObjectURL(file));
    setImageSize(dimensions);
  }, [isAnalyzing]);

  const retryAnalysis = useCallback(() => {
    if (!imageFile || isAnalyzing) return;
    submittedFileRef.current = imageFile;
    void runAnalysis(imageFile);
  }, [imageFile, isAnalyzing, runAnalysis]);

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!isAnalyzing) setDragActive(true);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    void acceptImage(event.dataTransfer.files[0]);
  };

  const downloadAnnotatedImage = useCallback(async () => {
    if (!imageFile || !imageSize) return;
    let bitmap: ImageBitmap | null = null;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = imageSize.width;
      canvas.height = imageSize.height;
      const context = canvas.getContext("2d");
      if (!context) return;
      bitmap = await createImageBitmap(imageFile);
      context.drawImage(bitmap, 0, 0, imageSize.width, imageSize.height);

      const lineWidth = Math.max(3, Math.round(imageSize.width / 500));
      context.lineWidth = lineWidth;
      context.font = `600 ${Math.max(16, Math.round(imageSize.width / 48))}px Arial, sans-serif`;
      for (let index = 0; index < detections.length; index += 1) {
        const detection = detections[index];
        const color = BOX_COLORS[index % BOX_COLORS.length];
        const x = detection.box.x * imageSize.width;
        const y = detection.box.y * imageSize.height;
        const boxWidth = detection.box.width * imageSize.width;
        const boxHeight = detection.box.height * imageSize.height;
        const label = `${detection.className}  ${Math.round(detection.confidence * 100)}%`;
        const labelHeight = Math.max(28, Math.round(imageSize.width / 30));
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
      link.download = `${imageFile.name.replace(/\.[^.]+$/, "") || "sightline"}-analysis.png`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } finally {
      bitmap?.close();
    }
  }, [detections, imageFile, imageSize]);

  const sourceAspect = imageSize ? `${imageSize.width} / ${imageSize.height}` : "16 / 9";
  const totalObjects = detections.length;
  const averageConfidence = totalObjects
    ? Math.round(detections.reduce((sum, item) => sum + item.confidence, 0) / totalObjects * 100)
    : null;
  const objectPalette = useMemo(() => detections.map((_, index) => BOX_COLORS[index % BOX_COLORS.length]), [detections]);

  return (
    <main className="app-shell">
      <div className="topbar">
        <a className="brand-lockup" href="#top" aria-label="Sightline Vision Studio home">
          <span className="brand-mark"><Aperture size={19} strokeWidth={1.8} /></span>
          <span className="brand-type"><strong>SIGHTLINE</strong><small>IMAGE INTELLIGENCE</small></span>
        </a>
        <div className="topbar-center"><span className="topbar-separator" /> OPENAI VISION <span className="topbar-dot" /> IMAGE-ONLY MODE</div>
        <div className="topbar-actions">
          <div className={`engine-badge ${openaiReady ? "is-ready" : health.status === "offline" ? "is-offline" : "is-loading"}`}>
            {openaiReady ? <Check size={13} /> : health.status === "loading" ? <LoaderCircle className="spin" size={13} /> : <span className="status-dot" />}
            <span>{openaiReady ? "KEY LOADED" : health.status === "offline" ? "API OFFLINE" : health.status === "loading" ? "CONNECTING" : "SETUP REQUIRED"}</span>
          </div>
          <span className="icon-button help-button" title="Uploaded images are sent to OpenAI for analysis. API usage may incur charges." aria-label="Image and API usage information"><CircleHelp size={17} /></span>
          <span className="avatar-button" aria-label="Image workspace">V</span>
        </div>
      </div>

      <section className="intro-row" id="top">
        <div>
          <div className="eyebrow intro-eyebrow"><span className="eyebrow-line" /> DEEP IMAGE ANALYSIS / WORKSPACE</div>
          <h1>See the whole <span>story in a photo.</span></h1>
          <p className="intro-copy">Upload one image for an AI scene summary, object-by-object descriptions, readable text, and approximate visual boxes.</p>
        </div>
        <div className="local-note cloud-note"><ShieldCheck size={17} /><span><strong>Sent to OpenAI</strong><small>One analysis request per upload</small></span></div>
      </section>

      <div className="workspace-toolbar">
        <div className="workspace-label"><span className="workspace-number">01</span><span>IMAGE ANALYSIS</span><FileImage size={13} /></div>
        <div className="toolbar-center"><span className={`toolbar-live-dot ${openaiReady ? "" : "status-dot"}`} /> {openaiReady ? "KEY LOADED" : health.status === "offline" ? "API OFFLINE" : "WAITING FOR API KEY"} <span className="toolbar-divider">/</span> OPENAI VISION</div>
        <div className="toolbar-right"><span><Activity size={14} /> {runCount.toString().padStart(2, "0")} REPORTS</span><span className="toolbar-divider">/</span><span>{latency === null ? "— MS" : `${Math.round(latency)} MS`}</span></div>
      </div>

      <section className="workspace-grid image-only-grid">
        <div className="main-column">
          <div className="panel canvas-panel">
            <div className="panel-heading canvas-heading">
              <div className="panel-title"><span className="panel-icon"><ScanLine size={16} /></span><span><strong>Your image</strong><small>Object boxes are approximate AI estimates</small></span></div>
              <span className="image-only-chip"><FileImage size={13} /> IMAGE UPLOAD ONLY</span>
            </div>

            <div
              className={`canvas-interaction ${dragActive ? "drag-active" : ""}`}
              onDragEnter={onDragOver}
              onDragOver={onDragOver}
              onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragActive(false); }}
              onDrop={onDrop}
            >
              {dragActive && <div className="drop-overlay"><Upload size={26} /><strong>Drop to analyze</strong><span>JPEG · PNG · WEBP</span></div>}
              <DetectionPreview
                imageUrl={imageUrl}
                imageName={imageFile?.name ?? ""}
                aspectRatio={sourceAspect}
                detections={detections}
                loading={isAnalyzing}
                onChooseImage={() => imageInputRef.current?.click()}
              />
              <input
                ref={imageInputRef}
                className="visually-hidden"
                type="file"
                accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                disabled={isAnalyzing}
                onChange={(event) => {
                  void acceptImage(event.target.files?.[0]);
                  event.currentTarget.value = "";
                }}
                aria-label="Choose an image to send to OpenAI Vision"
              />
            </div>

            <div className="canvas-footer">
              <div className="footer-meta"><span className={`source-pip ${imageFile ? "loaded" : ""}`} />{isAnalyzing ? "ANALYZING IMAGE" : imageFile ? "IMAGE LOADED" : "AWAITING IMAGE"}<span className="meta-divider" />{imageFile ? `${formatBytes(imageFile.size)} · ${imageSize?.width ?? "—"} × ${imageSize?.height ?? "—"}` : "JPEG · PNG · WEBP"}</div>
              <div className="canvas-actions">
                <button className="button button-secondary" onClick={() => imageInputRef.current?.click()} disabled={isAnalyzing} type="button"><Upload size={15} /> {imageFile ? "Choose another" : "Upload image"}</button>
                {errorMessage && imageFile && openaiReady && !isAnalyzing && (
                  <button className="button button-primary" onClick={retryAnalysis} type="button"><Zap size={14} /> Try again</button>
                )}
              </div>
            </div>
          </div>

          {errorMessage && (
            <div className="error-banner" role="alert">
              <Info size={17} /><span>{errorMessage}</span><button type="button" aria-label="Dismiss error" onClick={() => setErrorMessage(null)}><X size={16} /></button>
            </div>
          )}

          {!openaiReady && health.status !== "loading" && (
            <div className="panel setup-panel">
              <div className="setup-heading"><span className="panel-icon model-icon"><Sparkles size={16} /></span><span><strong>Connect OpenAI Vision</strong><small>{health.status === "offline" ? "Start the local Python API first." : "The API key stays in the Python service."}</small></span></div>
              <ol className="setup-list">
                <li>Copy <code>api\.env.example</code> to <code>api\.env</code> if it does not exist.</li>
                <li>Put your OpenAI API key on the <code>OPENAI_API_KEY=...</code> line.</li>
                <li>Save the file. The app checks for the key automatically.</li>
              </ol>
              <p className="setup-cost-note">OpenAI API billing is separate from a ChatGPT subscription. Each uploaded image sends one API request and may incur a charge.</p>
            </div>
          )}

          <div className="lower-grid image-info-grid">
            <div className="panel control-panel">
              <div className="panel-heading compact-heading">
                <div className="panel-title"><span className="panel-icon"><ShieldCheck size={16} /></span><span><strong>What gets sent</strong><small>Clear image-only behavior</small></span></div>
                <span className="control-count"><Zap size={12} /> ONE REQUEST</span>
              </div>
              <div className="privacy-copy"><p>Only the image you choose is sent to OpenAI through the Python API. No camera is opened and no background frames are sent.</p><p>Images are limited to 10 MB. Supported formats: JPEG, PNG, and WebP.</p></div>
            </div>

            <div className="panel model-panel">
              <div className="panel-heading compact-heading">
                <div className="panel-title"><span className="panel-icon model-icon"><Sparkles size={16} /></span><span><strong>Analysis engine</strong><small>OpenAI Vision API</small></span></div>
                <span className="ready-chip">{openaiReady ? "KEY LOADED" : health.status === "offline" ? "OFFLINE" : "SETUP"}</span>
              </div>
              <div className="model-name-row"><div><span className="model-kicker">VISION MODEL</span><strong className="engine-name">{health.model ?? "OPENAI VISION"}</strong></div><span className="model-orbit"><Aperture size={25} strokeWidth={1.3} /></span></div>
              <div className="model-specs"><span><Gauge size={13} /> Detailed visual read</span><span><ShieldCheck size={13} /> Key stays server-side</span></div>
              <div className="model-footnote">SCENE · OBJECTS · TEXT <span>·</span> BOXES</div>
            </div>
          </div>
        </div>

        <aside className="panel results-panel deep-results-panel">
          <div className="panel-heading results-heading">
            <div className="panel-title"><span className="panel-icon result-icon"><Aperture size={16} /></span><span><strong>Deep analysis</strong><small>What OpenAI sees</small></span></div>
            <span className="analysis-live-label"><span className={isAnalyzing ? "analysis-pulse" : ""} /> {isAnalyzing ? "READING" : analysis ? "COMPLETE" : "READY"}</span>
          </div>

          <div className="results-total"><div className="total-number">{totalObjects.toString().padStart(2, "0")}</div><div><span className="field-label">OBJECTS FOUND</span><span className="total-subtitle">{analysis ? `${totalObjects} approximate object ${totalObjects === 1 ? "box" : "boxes"}` : imageFile ? "Waiting for the report" : "Upload an image to begin"}</span></div></div>

          <div className="deep-analysis-content" aria-live="polite">
            {analysis ? (
              <>
                <section className="insight-section overview-section">
                  <span className="field-label">SCENE OVERVIEW</span>
                  <p className="analysis-overview">{analysis.overview || "No scene overview was returned."}</p>
                </section>

                {analysis.setting && <section className="insight-section"><span className="field-label">SETTING</span><p className="analysis-setting">{analysis.setting}</p></section>}

                {analysis.notableDetails.length > 0 && (
                  <section className="insight-section">
                    <span className="field-label">NOTABLE DETAILS</span>
                    <ul className="insight-bullets">{analysis.notableDetails.map((detail, index) => <li key={`${index}-${detail}`}>{detail}</li>)}</ul>
                  </section>
                )}

                {analysis.visibleText.length > 0 && (
                  <section className="insight-section">
                    <span className="field-label">READABLE TEXT</span>
                    <div className="visible-text-list">{analysis.visibleText.map((line, index) => <p key={`${index}-${line}`}>{line}</p>)}</div>
                  </section>
                )}

                <section className="insight-section object-insights-section">
                  <div className="results-section-title"><span>OBJECT-BY-OBJECT</span><span>{detections.length.toString().padStart(2, "0")}</span></div>
                  {detections.length ? detections.map((detection, index) => (
                    <article className="object-insight" key={`${detection.className}-${index}`}>
                      <div className="object-insight-heading">
                        <span className="class-color" style={{ backgroundColor: objectPalette[index] }} />
                        <strong>{detection.className}</strong>
                        <small>{Math.round(detection.confidence * 100)}%</small>
                      </div>
                      {detection.description && <p>{detection.description}</p>}
                      {detection.attributes.length > 0 && <div className="attribute-list">{detection.attributes.map((attribute, attributeIndex) => <span key={`${attributeIndex}-${attribute}`}>{attribute}</span>)}</div>}
                    </article>
                  )) : <p className="no-objects-copy">No clear physical objects were identified. Try a sharper, well-lit image.</p>}
                </section>
              </>
            ) : (
              <div className="results-empty deep-empty">
                <div className="results-empty-icon">{errorMessage && !isAnalyzing ? <Info size={18} strokeWidth={1.5} /> : <Aperture size={18} strokeWidth={1.5} />}</div>
                <strong>{errorMessage && !isAnalyzing ? "Analysis could not finish" : isAnalyzing ? "Reading the full image…" : imageFile ? openaiReady ? "Ready to analyze" : "OpenAI setup needed" : "Your report will appear here"}</strong>
                <p>{errorMessage && !isAnalyzing ? errorMessage : isAnalyzing ? "Looking for objects, scene context, readable text, and visual relationships." : imageFile ? openaiReady ? "The image is being sent once for a detailed report." : "Add an OpenAI API key to the Python API and save the file." : "Choose a photo to get a scene overview and detailed object descriptions."}</p>
                {errorMessage && imageFile && openaiReady && !isAnalyzing && <button className="button button-primary" onClick={retryAnalysis} type="button"><Zap size={14} /> Retry analysis</button>}
              </div>
            )}
          </div>

          <div className="results-bottom">
            <div className="result-quality"><span className="quality-icon"><Check size={13} /></span><span><strong>Detection confidence</strong><small>{averageConfidence === null ? "Approximate AI estimates" : `${averageConfidence}% average estimate · boxes may be approximate`}</small></span></div>
            <button className="button button-export" type="button" onClick={() => void downloadAnnotatedImage()} disabled={!detections.length || isAnalyzing}><ArrowDownToLine size={15} /> Export image with object boxes</button>
            <p className="export-note">Box positions are estimates. AI may miss or mislabel small or obscured objects.</p>
          </div>
        </aside>
      </section>

      <footer className="app-footer">
        <div className="footer-brand"><span className="footer-mark"><Aperture size={14} /></span> SIGHTLINE <span className="footer-version">DEEP IMAGE ANALYSIS</span></div>
        <div className="footer-status"><span className={`footer-status-dot ${openaiReady ? "" : "is-muted"}`} />{openaiReady ? `Key loaded · ${health.model ?? "OpenAI Vision"}` : health.status === "offline" ? "Python API is offline" : "OpenAI API key required"}<span className="footer-divider" />API <code>{getDetectorApiUrl().replace(/^https?:\/\//, "")}</code></div>
        <div className="footer-right">ONE IMAGE AT A TIME <span>✳</span></div>
      </footer>
    </main>
  );
}
