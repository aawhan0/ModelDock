import { API_URL, apiFetch } from './api';
import { ModelItem, ModelVersion, InferenceRecord, ErrorDiagnostic } from '../types';

interface ApiModel {
  id: number;
  name: string;
  task: string;
  description: string | null;
  created_at: string;
}

interface ApiList<T> { value?: T[]; Count?: number; }

interface ApiVersion {
  id: number;
  model_id: number;
  version: string;
  artifact_path: string;
  framework: string;
  status: string;
  created_at: string;
}

function asList<T>(payload: T[] | ApiList<T>): T[] {
  return Array.isArray(payload) ? payload : payload.value ?? [];
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function mapStatus(status: string): ModelItem['status'] {
  if (status === 'deployed') return 'deployed';
  if (status === 'retired') return 'retired';
  if (status === 'uploaded') return 'uploaded';
  return 'validated';
}

function mapVersion(version: ApiVersion): ModelVersion {
  return {
    id: String(version.id),
    version: version.version,
    status: mapStatus(version.status),
    framework: version.framework,
    artifactName: version.artifact_path.split(/[\\\\/]/).pop() || 'artifact',
    artifactPath: version.artifact_path || undefined,
    artifactSize: 'Not exposed',
    isVerified: version.status !== 'uploaded',
    registeredDate: formatDate(version.created_at),
    registeredAgo: undefined,
    endpointUrl:
      version.status === 'deployed'
        ? `${API_URL}/api/v1/models/${version.model_id}/versions/${encodeURIComponent(version.version)}/predict`
        : undefined,
  };
}

function mapModel(
  model: ApiModel,
  versions: ApiVersion[],
  metrics: MetricsSummary | null = null,
  timeseries: MetricsTimeseriesItem[] = [],
): ModelItem {
  const mappedVersions = versions.map(mapVersion);

  const deployedVersion = mappedVersions.find(
    (version) => version.status === 'deployed',
  );
  const currentVersion = deployedVersion ?? mappedVersions[0];

  return {
    id: String(model.id),
    name: model.name,
    slug: model.name.toLowerCase().replace(/\s+/g, '-'),
    currentVersion: currentVersion?.version ?? 'N/A',
    task: model.task,
    framework: deployedVersion?.framework ?? currentVersion?.framework ?? 'Unknown',
    status: deployedVersion?.status ?? (currentVersion?.status ?? 'validated'),
    description: model.description ?? '',
    modelCode: `md-${model.id}`,
    versionsCount: mappedVersions.length,
    size: deployedVersion?.artifactSize ?? 'Unknown',
    lastUpdated: formatDate(model.created_at),
    callsPerHour: metrics?.requests ?? 0,
    sparklineData: timeseries.map((point) => point.requests).slice(-24),
    versions: mappedVersions,
    hardwareBinding: {
      computeDevice: 'Backend managed',
      batchWindow: 'Backend managed',
      quantization: 'Backend managed',
    },
    runtimeTelemetry: {
      online: deployedVersion?.status === 'deployed',
      p95LatencyMs: metrics?.average_latency_ms ?? 0,
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

  const models = asList((await response.json()) as ApiModel[] | ApiList<ApiModel>);

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

      const versions = asList((await versionsResponse.json()) as ApiVersion[] | ApiList<ApiVersion>);

      const deployed = versions.find((version) => version.status === 'deployed');
      if (!deployed) return mapModel(model, versions);
      const [metrics, timeseries] = await Promise.all([
        fetchMetrics(model.id.toString(), deployed.version).catch(() => null),
        fetchMetricsTimeseries(model.id.toString(), deployed.version, 24).catch(() => []),
      ]);
      return mapModel(model, versions, metrics, timeseries);
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


export async function createModelVersion(
  modelId: string,
  data: {
    version: string;
    artifact_path: string;
    framework: string;
  },
): Promise<ApiVersion> {
  const response = await apiFetch(`/api/v1/models/${modelId}/versions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(
      errorBody?.detail || `Failed to create model version: ${response.status}`,
    );
  }

  return response.json();
}

export async function uploadModelArtifact(
  modelId: string,
  version: string,
  file: File,
): Promise<{ artifact_path: string }> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await apiFetch(
    `/api/v1/models/${modelId}/versions/${encodeURIComponent(version)}/artifact`,
    {
      method: 'POST',
      body: formData,
    },
  );

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(
      errorBody?.detail || `Failed to upload artifact: ${response.status}`,
    );
  }

  return response.json();
}

export async function deleteModelVersion(
  modelId: string,
  version: string,
): Promise<void> {
  const response = await apiFetch(
    `/api/v1/models/${modelId}/versions/${encodeURIComponent(version)}`,
    { method: 'DELETE' },
  );

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(
      errorBody?.detail || `Failed to delete model version: ${response.status}`,
    );
  }
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

export async function revalidateModelVersion(
  modelId: string,
  version: string,
): Promise<void> {
  const response = await apiFetch(
    `/api/v1/models/${modelId}/versions/${encodeURIComponent(version)}/revalidate`,
    { method: 'POST' },
  );

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(
      errorBody?.detail || `Failed to revalidate version: ${response.status}`,
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
    `/api/v1/metrics/${modelId}/${encodeURIComponent(version)}?_=${Date.now()}`,
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
    `/api/v1/metrics/${modelId}/${encodeURIComponent(version)}/history?limit=${limit}&_=${Date.now()}`,
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
      modelId,
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
    `/api/v1/metrics/${modelId}/${encodeURIComponent(version)}/timeseries?hours=${hours}&_=${Date.now()}`,
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch metrics timeseries: ${response.status}`);
  }

  return response.json();
}


export function mapInferenceErrors(
  records: InferenceHistoryItem[],
  modelId: string,
  version: string,
): ErrorDiagnostic[] {
  return records
    .filter((record) => !record.success && record.error)
    .map((record) => ({
      id: `${modelId}:${version}:${record.id}`,
      timestamp: new Date(record.created_at).toLocaleString(),
      modelTarget: `model-${modelId}`,
      version,
      code: 'INFERENCE_ERROR',
      errorMessage: record.error ?? 'Inference failed',
      traceId: `inference-${modelId}-${version}-${record.id}`,
      severity: 'ERROR',
      payloadSample: record.input ?? '{}',
    }));
}

