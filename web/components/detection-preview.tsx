import type { RefObject } from "react";
import { Aperture, ScanLine, Upload } from "lucide-react";
import type { Detection } from "@/lib/types";

const BOX_COLORS = ["#bef264", "#67e8f9", "#c4b5fd", "#fb923c", "#f9a8d4"];

type DetectionPreviewProps = {
  imageUrl: string | null;
  imageName: string;
  aspectRatio: string;
  cameraActive: boolean;
  videoRef: RefObject<HTMLVideoElement | null>;
  detections: Detection[];
  loading: boolean;
  onChooseImage: () => void;
};

export function DetectionPreview({
  imageUrl,
  imageName,
  aspectRatio,
  cameraActive,
  videoRef,
  detections,
  loading,
  onChooseImage,
}: DetectionPreviewProps) {
  const hasSource = cameraActive || Boolean(imageUrl);

  return (
    <div className="preview-stage">
      <div className="preview-frame" style={{ aspectRatio }}>
        {cameraActive ? (
          <video ref={videoRef} className="preview-media" autoPlay playsInline muted aria-label="Live camera preview" />
        ) : imageUrl ? (
          // The selected local file is rendered from a temporary browser object URL.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} className="preview-media" alt={imageName || "Selected image"} />
        ) : (
          <div className="preview-empty">
            <div className="empty-orbit orbit-one" />
            <div className="empty-orbit orbit-two" />
            <div className="empty-lens"><Aperture size={31} strokeWidth={1.35} /></div>
            <span className="empty-crosshair crosshair-left" />
            <span className="empty-crosshair crosshair-right" />
            <div className="empty-copy">
              <span className="eyebrow">YOUR CANVAS IS READY</span>
              <h3>Drop a scene in.</h3>
              <p>Choose an image or switch on your camera to start seeing what’s there.</p>
              <button className="button button-soft" onClick={onChooseImage} type="button">
                <Upload size={15} /> Choose an image
              </button>
            </div>
            <div className="empty-coordinate coordinate-top">X 0640 <span>Y 0384</span></div>
            <div className="empty-coordinate coordinate-bottom">SCOPE / 01 <span>READY</span></div>
          </div>
        )}

        {hasSource && (
          <div className="detection-overlay" aria-label={`${detections.length} detected objects`}>
            {detections.map((detection, index) => (
              <div
                className="detection-box"
                key={`${detection.className}-${index}`}
                style={{
                  left: `${detection.box.x * 100}%`,
                  top: `${detection.box.y * 100}%`,
                  width: `${detection.box.width * 100}%`,
                  height: `${detection.box.height * 100}%`,
                  borderColor: BOX_COLORS[index % BOX_COLORS.length],
                  color: BOX_COLORS[index % BOX_COLORS.length],
                }}
              >
                <span className="detection-label" style={{ backgroundColor: BOX_COLORS[index % BOX_COLORS.length] }}>
                  {detection.className}<b>{Math.round(detection.confidence * 100)}%</b>
                </span>
              </div>
            ))}
          </div>
        )}

        {!hasSource && (
          <div className="frame-corner corner-tl" />
        )}
        {!hasSource && (
          <>
            <div className="frame-corner corner-tr" />
            <div className="frame-corner corner-bl" />
            <div className="frame-corner corner-br" />
          </>
        )}

        {loading && hasSource && (
          <div className="analysis-sweep" aria-hidden="true"><ScanLine size={19} /> Analyzing frame</div>
        )}
      </div>
      {hasSource && (
        <div className="preview-caption">
          <span><i className="caption-dot" /> {cameraActive ? "LIVE FEED" : "IMAGE SOURCE"}</span>
          <span>{cameraActive ? "LOCAL CAMERA" : imageName}</span>
        </div>
      )}
    </div>
  );
}
