import type { DetectionProvider, DetectionResponse, DetectorHealth } from "@/lib/types";

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

async function readHealthError(response: Response): Promise<DetectorHealth> {
  try {
    const body = (await response.json()) as {
      detail?: string | { status?: string; message?: string; worldStatus?: string; googleConfigured?: boolean };
    };
    if (body.detail && typeof body.detail === "object") {
      const detail = body.detail;
      return {
        status: detail.status === "loading" ? "loading" : "error",
        message: detail.message,
        worldStatus: detail.worldStatus === "ready" || detail.worldStatus === "error" ? detail.worldStatus : "loading",
        googleConfigured: detail.googleConfigured,
      };
    }
    return { status: "error", message: typeof body.detail === "string" ? body.detail : `The detector service returned ${response.status}.` };
  } catch {
    return { status: "error", message: `The detector service returned ${response.status}.` };
  }
}

export async function getDetectorHealth(): Promise<DetectorHealth> {
  try {
    const response = await fetch(`${API_URL}/api/health`, { cache: "no-store" });
    if (response.ok) return (await response.json()) as DetectorHealth;

    return await readHealthError(response);
  } catch {
    return { status: "offline", message: "Start the Python API to enable detections." };
  }
}

export async function detectImage(
  file: Blob,
  confidence: number,
  provider: DetectionProvider,
  prompt: string,
  signal?: AbortSignal,
): Promise<DetectionResponse> {
  const query = new URLSearchParams({ confidence: confidence.toFixed(2), provider });
  if (provider === "world") query.set("prompt", prompt);

  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/detect?${query.toString()}`, {
      method: "POST",
      headers: { "Content-Type": file.type || "image/jpeg" },
      body: file,
      signal,
    });
  } catch {
    throw new Error("Can’t reach the detector. Make sure the Python API is running.");
  }

  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as DetectionResponse;
}

export function getDetectorApiUrl(): string {
  return API_URL;
}
