"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Check, LoaderCircle, X } from "lucide-react";

interface CameraCaptureProps {
  onCapture: (file: File) => void;
  onClose: () => void;
}

export function CameraCapture({ onCapture, onClose }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let activeStream: MediaStream | null = null;
    let disposed = false;

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Camera capture isn't available in this browser. You can still upload an image.");
    } else {
      navigator.mediaDevices
        .getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false })
        .then((stream) => {
          if (disposed) {
            stream.getTracks().forEach((track) => track.stop());
            return;
          }
          activeStream = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            void videoRef.current.play();
            setCameraReady(true);
          }
        })
        .catch(() => {
          if (!disposed) {
            setError("Camera access was blocked. Allow camera access or upload an image instead.");
          }
        });
    }

    return () => {
      disposed = true;
      activeStream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function captureFrame() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      setError("This browser couldn't prepare the camera image. Try uploading a file instead.");
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!blob) {
      setError("This browser couldn't capture the image. Please try again.");
      return;
    }

    onCapture(new File([blob], `sightline-capture-${Date.now()}.jpg`, { type: "image/jpeg" }));
    onClose();
  }

  return (
    <div className="modal-scrim" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="camera-modal" role="dialog" aria-modal="true" aria-labelledby="camera-title">
        <div className="camera-modal__head">
          <div>
            <span className="eyebrow">IMAGE SOURCE</span>
            <h2 id="camera-title">Take a picture</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close camera">
            <X size={19} />
          </button>
        </div>

        <div className="camera-view">
          <video ref={videoRef} autoPlay playsInline muted aria-label="Camera preview" />
          {!cameraReady && !error && (
            <div className="camera-placeholder">
              <span className="camera-placeholder__icon"><LoaderCircle className="spin" size={24} /></span>
              <span>Connecting to your camera…</span>
            </div>
          )}
          {error && (
            <div className="camera-placeholder camera-placeholder--error">
              <span className="camera-placeholder__icon"><Camera size={22} /></span>
              <span>{error}</span>
            </div>
          )}
          {cameraReady && <span className="camera-live"><span /> LIVE PREVIEW</span>}
        </div>

        <div className="camera-modal__foot">
          <p>Your image is only sent to the detection service when you run analysis.</p>
          <button className="button button--primary" type="button" onClick={() => void captureFrame()} disabled={!cameraReady}>
            <Check size={17} /> Capture image
          </button>
        </div>
      </section>
    </div>
  );
}
