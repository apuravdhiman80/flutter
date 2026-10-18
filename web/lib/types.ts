export type Detection = {
  className: string;
  confidence: number;
  box: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  description: string;
  attributes: string[];
};

export type SceneAnalysis = {
  overview: string;
  setting: string;
  visibleText: string[];
  notableDetails: string[];
};

export type DetectionResponse = {
  image: {
    width: number;
    height: number;
  };
  detections: Detection[];
  analysis: SceneAnalysis;
};

export type DetectorHealth = {
  status: "ready" | "loading" | "error" | "offline";
  model?: string;
  message?: string;
  openaiConfigured?: boolean;
};
