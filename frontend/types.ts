export type ScreenType = 
  | 'models' 
  | 'model-detail' 
  | 'inference' 
  | 'history' 
  | 'monitoring' 
  | 'endpoints'
  | 'settings'
  | 'documentation';

export type ModelStatus = 'deployed' | 'validated' | 'retired';

export interface ModelVersion {
  id: string;
  version: string;
  status: ModelStatus;
  framework: string;
  artifactName: string;
  artifactSize: string;
  isVerified: boolean;
  registeredDate: string;
  registeredAgo?: string;
  endpointUrl?: string;
  metrics?: {
    latencyMs: number;
    accuracy?: number;
  };
}

export interface ModelItem {
  id: string;
  name: string;
  slug: string;
  currentVersion: string;
  task: string;
  framework: string;
  status: ModelStatus;
  description: string;
  modelCode: string;
  versionsCount: number;
  size: string;
  lastUpdated: string;
  callsPerHour: number;
  sparklineData: number[];
  versions: ModelVersion[];
  hardwareBinding: {
    computeDevice: string;
    batchWindow: string;
    quantization: string;
  };
  runtimeTelemetry: {
    online: boolean;
    p95LatencyMs: number;
    vramAllocatedGb: number;
    vramTotalGb: number;
    throughputReqMin: number;
    throughputChangePct: number;
  };
}

export interface InferenceRecord {
  id: number | string;
  timestamp: string;
  version: string;
  status: 'SUCCESS' | 'FAILED';
  latencyMs: number;
  inputSummary: Record<string, unknown>;
  outputSummary: Record<string, unknown>;
  fullInput: string;
  fullOutput: string;
  traceId: string;
  endpoint: string;
}

export interface ErrorDiagnostic {
  id: string;
  timestamp: string;
  modelTarget: string;
  version: string;
  code: number | string;
  errorMessage: string;
  traceId: string;
  stackTrace?: string;
  severity?: 'ERROR' | 'WARNING';
  workerThread?: string;
  payloadSample?: string;
}
