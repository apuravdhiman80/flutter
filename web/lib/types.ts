export type Detection = {
  className: string;
  confidence: number;
  box: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

export type DetectionResponse = {
  image: {
    width: number;
    height: number;
  };
  detections: Detection[];
};

export type DetectorHealth = {
  status: "ready" | "loading" | "error" | "offline";
  model?: string;
  message?: string;
  worldStatus?: "loading" | "ready" | "error";
  worldMessage?: string;
  googleConfigured?: boolean;
};

export type DetectionProvider = "local" | "world" | "google";
