import { Aperture, ScanLine, Upload } from "lucide-react";
import type { Detection } from "@/lib/types";

const BOX_COLORS = ["#bef264", "#67e8f9", "#c4b5fd", "#fb923c", "#f9a8d4"];

type DetectionPreviewProps = {
  imageUrl: string | null;
  imageName: string;
  aspectRatio: string;
  detections: Detection[];
  loading: boolean;
  onChooseImage: () => void;
};

export function DetectionPreview({
  imageUrl,
  imageName,
  aspectRatio,
  detections,
  loading,
  onChooseImage,
}: DetectionPreviewProps) {
  const hasImage = Boolean(imageUrl);

  return (
    <div className="preview-stage">
      <div className="preview-frame" style={{ aspectRatio }}>
        {imageUrl ? (
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
              <span className="eyebrow">IMAGE ANALYSIS / OPENAI VISION</span>
              <h3>Drop an image in.</h3>
              <p>Get a detailed scene read, object descriptions, visible text, and approximate object boxes.</p>
              <button className="button button-soft" onClick={onChooseImage} type="button">
                <Upload size={15} /> Choose an image
              </button>
            </div>
            <div className="empty-coordinate coordinate-top">ONE IMAGE <span>ONE REPORT</span></div>
            <div className="empty-coordinate coordinate-bottom">JPG · PNG · WEBP <span>UP TO 10 MB</span></div>
          </div>
        )}

        {hasImage && (
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

        {!hasImage && <div className="frame-corner corner-tl" />}
        {!hasImage && <>
          <div className="frame-corner corner-tr" />
          <div className="frame-corner corner-bl" />
          <div className="frame-corner corner-br" />
        </>}

        {loading && hasImage && (
          <div className="analysis-sweep" aria-live="polite"><ScanLine size={19} /> Reading your image in depth</div>
        )}
      </div>
      {hasImage && (
        <div className="preview-caption">
          <span><i className="caption-dot" /> SENT TO OPENAI FOR ANALYSIS</span>
          <span>{imageName}</span>
        </div>
      )}
    </div>
  );
}
