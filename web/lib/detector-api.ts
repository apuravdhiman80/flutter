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
  return `The image analysis service returned ${response.status}.`;
}

export async function getDetectorHealth(): Promise<DetectorHealth> {
  try {
    const response = await fetch(`${API_URL}/api/health`, { cache: "no-store" });
    if (response.ok) return (await response.json()) as DetectorHealth;
    return { status: "error", message: `The image analysis service returned ${response.status}.` };
  } catch {
    return { status: "offline", message: "Start the Python API to enable image analysis." };
  }
}

export async function analyzeImage(
  file: Blob,
  prompt: string,
  signal?: AbortSignal,
): Promise<DetectionResponse> {
  const query = new URLSearchParams();
  if (prompt.trim()) query.set("prompt", prompt.trim());
  const queryString = query.toString();
  const suffix = queryString ? `?${queryString}` : "";

  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/detect${suffix}`, {
      method: "POST",
      headers: { "Content-Type": file.type || "image/jpeg" },
      body: file,
      signal,
    });
  } catch {
    throw new Error("Can’t reach the image analysis service. Make sure the Python API is running.");
  }

  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as DetectionResponse;
}

export function getDetectorApiUrl(): string {
  return API_URL;
}
