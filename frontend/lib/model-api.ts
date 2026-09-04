import { apiFetch } from './api';
import { ModelItem, ModelVersion, InferenceRecord, ErrorDiagnostic } from '../types';

interface ApiModel {
  id: number;
  name: string;
  task: string;
  description: string | null;
  created_at: string;
}

interface ApiVersion {
  id: number;
  model_id: number;
  version: string;
  artifact_path: string;
  framework: string;
  status: string;
  created_at: string;
}

function mapStatus(status: string): ModelItem['status'] {
  if (status === 'deployed') return 'deployed';
  if (status === 'retired') return 'retired';
  return 'validated';
}

function mapVersion(version: ApiVersion): ModelVersion {
  return {
    id: String(version.id),
    version: version.version,
    status: mapStatus(version.status),
    framework: version.framework,
    artifactName: version.artifact_path.split('/').pop() || 'artifact',
    artifactSize: 'Unknown',
    isVerified: version.status !== 'uploaded',
    registeredDate: new Date(version.created_at).toLocaleDateString(),
    registeredAgo: undefined,
    endpointUrl: undefined,
  };
}

function mapModel(model: ApiModel, versions: ApiVersion[]): ModelItem {
  const mappedVersions = versions.map(mapVersion);

  const deployedVersion =
    mappedVersions.find((version) => version.status === 'deployed') ??
    mappedVersions[mappedVersions.length - 1];

  return {
    id: String(model.id),
    name: model.name,
    slug: model.name.toLowerCase().replace(/\s+/g, '-'),
    currentVersion: deployedVersion?.version ?? 'N/A',
    task: model.task,
    framework: deployedVersion?.framework ?? 'Unknown',
    status: deployedVersion?.status ?? 'validated',
    description: model.description ?? '',
    modelCode: `md-${model.id}`,
    versionsCount: mappedVersions.length,
    size: deployedVersion?.artifactSize ?? 'Unknown',
    lastUpdated: new Date(model.created_at).toLocaleDateString(),
    callsPerHour: 0,
    sparklineData: [0, 0, 0, 0, 0, 0, 0],
    versions: mappedVersions,
    hardwareBinding: {
      computeDevice: 'Not configured',
      batchWindow: 'Not configured',
      quantization: 'Not configured',
    },
    runtimeTelemetry: {
      online: deployedVersion?.status === 'deployed',
      p95LatencyMs: 0,
      vramAllocatedGb: 0,
      vramTotalGb: 0,
      throughputReqMin: 0,
      throughputChangePct: 0,
    },
  };
}

export async function fetchModels(): Promise<ModelItem[]> {
  const response = await apiFetch('/api/v1/models');

  if (!response.ok) {
    throw new Error(`Failed to fetch models: ${response.status}`);
  }

  const models: ApiModel[] = await response.json();

  return Promise.all(
    models.map(async (model) => {
      const versionsResponse = await apiFetch(
        `/api/v1/models/${model.id}/versions`,
      );

      if (!versionsResponse.ok) {
        throw new Error(
          `Failed to fetch versions for model ${model.id}: ${versionsResponse.status}`,
        );
      }

      const versions: ApiVersion[] = await versionsResponse.json();

      return mapModel(model, versions);
    }),
  );
}

export async function createModel(data: {
  name: string;
  task: string;
  description?: string;
}): Promise<ModelItem> {
  const response = await apiFetch('/api/v1/models', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);

    throw new Error(
      errorBody?.detail || `Failed to create model: ${response.status}`,
    );
  }

  const model: ApiModel = await response.json();

  return mapModel(model, []);
}

export async function deleteModel(modelId: string): Promise<void> {
  const response = await apiFetch(`/api/v1/models/${modelId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);

    throw new Error(
      errorBody?.detail || `Failed to delete model: ${response.status}`,
    );
  }
}

export async function deployModelVersion(
  modelId: string,
  version: string,
): Promise<void> {
  const response = await apiFetch(
    `/api/v1/models/${modelId}/versions/${encodeURIComponent(version)}/deploy`,
    { method: 'POST' },
  );

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(
      errorBody?.detail || `Failed to deploy version: ${response.status}`,
    );
  }
}

export async function undeployModelVersion(
  modelId: string,
  version: string,
): Promise<void> {
  const response = await apiFetch(
    `/api/v1/models/${modelId}/versions/${encodeURIComponent(version)}/undeploy`,
    { method: 'POST' },
  );

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(
      errorBody?.detail || `Failed to undeploy version: ${response.status}`,
    );
  }
}

export interface PredictionResponse {
  model: string;
  version: string;
  prediction: unknown;
}

export async function predictModel(
  modelId: string,
  version: string,
  input: unknown,
): Promise<PredictionResponse> {
  const response = await apiFetch(
    `/api/v1/models/${modelId}/versions/${encodeURIComponent(version)}/predict`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ input }),
    },
  );

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(
      errorBody?.detail || `Inference failed: ${response.status}`,
    );
  }

  return response.json();
}

export interface MetricsSummary {
  model_id: number;
  version: string;
  requests: number;
  successful: number;
  failed: number;
  average_latency_ms: number;
}

export interface InferenceHistoryItem {
  id: number;
  input: string;
  prediction: string | null;
  error: string | null;
  success: boolean;
  latency_ms: number;
  created_at: string;
}

export async function fetchMetrics(
  modelId: string,
  version: string,
): Promise<MetricsSummary> {
  const response = await apiFetch(
    `/api/v1/metrics/${modelId}/${encodeURIComponent(version)}`,
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch metrics: ${response.status}`);
  }

  return response.json();
}

export async function fetchInferenceHistory(
  modelId: string,
  version: string,
  limit = 50,
): Promise<InferenceHistoryItem[]> {
  const response = await apiFetch(
    `/api/v1/metrics/${modelId}/${encodeURIComponent(version)}/history?limit=${limit}`,
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch inference history: ${response.status}`);
  }

  return response.json();
}


export async function fetchInferenceRecords(
  modelId: string,
  version: string,
  limit = 50,
): Promise<InferenceRecord[]> {
  const history = await fetchInferenceHistory(modelId, version, limit);

  return history.map((item) => {
    let inputSummary: Record<string, unknown> = {};
    let outputSummary: Record<string, unknown> = {};

    try {
      inputSummary = JSON.parse(item.input || '{}');
    } catch {
      inputSummary = { input: item.input };
    }

    try {
      outputSummary = JSON.parse(item.prediction || 'null');
    } catch {
      outputSummary = { prediction: item.prediction };
    }

    return {
      id: item.id,
      timestamp: new Date(item.created_at).toLocaleString(),
      version,
      status: item.success ? 'SUCCESS' : 'FAILED',
      latencyMs: item.latency_ms,
      traceId: `trace-${item.id}`,
      endpoint: `/api/v1/models/${modelId}/versions/${version}/predict`,
      inputSummary,
      outputSummary,
      errorMessage: item.error ?? undefined,
      fullInput: item.input ?? '',
      fullOutput: item.prediction ?? '',
    };
  });
}


export interface MetricsTimeseriesItem {
  timestamp: string;
  requests: number;
  successful: number;
  failed: number;
  average_latency_ms: number;
}

export async function fetchMetricsTimeseries(
  modelId: string,
  version: string,
  hours = 24,
): Promise<MetricsTimeseriesItem[]> {
  const response = await apiFetch(
    `/api/v1/metrics/${modelId}/${encodeURIComponent(version)}/timeseries?hours=${hours}`,
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch metrics timeseries: ${response.status}`);
  }

  return response.json();
}


export function mapInferenceErrors(
  records: InferenceHistoryItem[],
): ErrorDiagnostic[] {
  return records
    .filter((record) => !record.success && record.error)
    .map((record) => ({
      id: String(record.id),
      timestamp: new Date(record.created_at).toLocaleString(),
      modelTarget: `model-${record.id}`,
      version: 'unknown',
      code: 'INFERENCE_ERROR',
      errorMessage: record.error ?? 'Inference failed',
      traceId: `trace-${record.id}`,
      stackTrace: record.error ?? undefined,
      severity: 'ERROR',
      workerThread: 'backend-runtime',
      payloadSample: record.input ?? '{}',
    }));
}
