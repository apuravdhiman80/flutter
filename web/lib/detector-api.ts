import type { DetectionResponse, DetectorHealth } from "@/lib/types";

const API_URL = (process.env.NEXT_PUBLIC_DETECTOR_API_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: string | { message?: string } };
    if (typeof body.detail === "string") return body.detail;
    if (body.detail?.message) return body.detail.message;
  } catch {
    // Fall through to a readable status message when the API body is not JSON.
  }
  return `The detector service returned ${response.status}.`;
}

export async function getDetectorHealth(): Promise<DetectorHealth> {
  try {
    const response = await fetch(`${API_URL}/api/health`, { cache: "no-store" });
    if (response.ok) return (await response.json()) as DetectorHealth;

    const message = await readError(response);
    return {
      status: response.status === 503 && message.toLowerCase().includes("loading") ? "loading" : "error",
      message,
    };
  } catch {
    return { status: "offline", message: "Start the Python API to enable detections." };
  }
}

export async function detectImage(file: Blob, confidence: number, signal?: AbortSignal): Promise<DetectionResponse> {
  const body = new FormData();
  const name = typeof File !== "undefined" && file instanceof File ? file.name : "webcam-frame.jpg";
  body.append("file", file, name);
  body.append("confidence", confidence.toFixed(2));

  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/detect`, { method: "POST", body, signal });
  } catch {
    throw new Error("Can’t reach the detector. Make sure the Python API is running.");
  }

  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as DetectionResponse;
}

export function getDetectorApiUrl(): string {
  return API_URL;
}
