export type Model = {
  id: number;
  name: string;
  task: string;
  description?: string | null;
  created_at: string;
};

export type ModelVersion = {
  id: number;
  model_id: number;
  version: string;
  artifact_path: string;
  framework: string;
  status: string;
  created_at: string;
};

export type Metrics = {
  model_id: number;
  version: string;
  requests: number;
  successful: number;
  failed: number;
  average_latency_ms: number;
};

export type Prediction = {
  model: string;
  version: string;
  prediction: unknown;
};

export type InferenceHistory = {
  id: number;
  input: string;
  prediction: unknown;
  success: boolean;
  latency_ms: number;
  created_at: string;
};

export type TimeseriesPoint = {
  timestamp: string;
  requests: number;
  successful: number;
  failed: number;
  average_latency_ms: number;
};
