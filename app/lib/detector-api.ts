export type ApiStatus = "checking" | "online" | "offline";

export interface HealthResponse {
  status: "ready" | "loading";
  model: string;
}

export interface Detection {
  class_id: number;
  class_name: string;
  confidence: number;
  box: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  };
}

export interface DetectionResponse {
  model: string;
  image_width: number;
  image_height: number;
  elapsed_ms: number;
  confidence_threshold: number;
  detections: Detection[];
  annotated_image: string;
}

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");

export async function checkApiHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const response = await fetch(`${API_BASE_URL}/api/health`, {
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    throw new Error("The detection service is unavailable.");
  }

  return (await response.json()) as HealthResponse;
}

export async function detectObjects(
  file: File,
  confidence: number,
  signal?: AbortSignal,
): Promise<DetectionResponse> {
  const form = new FormData();
  form.append("file", file);

  let response: Response;
  try {
    response = await fetch(
      `${API_BASE_URL}/api/detect?confidence=${encodeURIComponent(confidence.toFixed(2))}`,
      {
        method: "POST",
        body: form,
        signal,
      },
    );
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    throw new Error("Can't reach the detection API. Check its address and try again.");
  }

  const body = (await response.json().catch(() => null)) as
    | { detail?: string }
    | DetectionResponse
    | null;

  if (!response.ok) {
    const detail = body && "detail" in body ? body.detail : undefined;
    if (response.status === 413) {
      throw new Error(detail || "This image is over the 12 MB upload limit.");
    }
    if (response.status === 415) {
      throw new Error(detail || "Use a JPEG, PNG, or WebP image.");
    }
    throw new Error(detail || "Detection didn't finish. Please try again.");
  }

  return body as DetectionResponse;
}
