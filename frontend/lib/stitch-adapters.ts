import type {
  Model as ApiModel,
  ModelVersion as ApiModelVersion,
  Metrics,
} from "./model-types";
import type {
  ModelItem,
  ModelStatus,
  ModelVersion as StitchModelVersion,
} from "../types";

function toModelStatus(status: string): ModelStatus {
  if (status === "deployed") return "deployed";
  if (status === "retired") return "retired";
  return "validated";
}

function formatRelativeDate(date: string): string {
  const timestamp = new Date(date).getTime();

  if (!Number.isFinite(timestamp)) {
    return "-";
  }

  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  return new Date(date).toLocaleDateString();
}

function mapVersion(
  version: ApiModelVersion,
  metrics?: Metrics,
): StitchModelVersion {
  return {
    id: String(version.id),
    version: version.version,
    status: toModelStatus(version.status),
    framework: version.framework,
    artifactName: version.artifact_path
      ? version.artifact_path.split(/[\\/]/).pop() || "Artifact"
      : "No artifact",
    artifactSize: "-",
    isVerified: Boolean(version.artifact_path),
    registeredDate: version.created_at,
    registeredAgo: formatRelativeDate(version.created_at),
    metrics: metrics
      ? {
          latencyMs: metrics.average_latency_ms,
        }
      : undefined,
  };
}

export function adaptModel(
  model: ApiModel,
  versions: ApiModelVersion[] = [],
  metricsByVersion: Record<string, Metrics> = {},
): ModelItem {
  const stitchVersions = versions.map((version) =>
    mapVersion(version, metricsByVersion[version.version]),
  );

  const currentVersion =
    versions.find((version) => version.status === "deployed") ??
    versions.find((version) => version.status === "validated") ??
    versions[0];

  const currentMetrics = currentVersion
    ? metricsByVersion[currentVersion.version]
    : undefined;

  const status = currentVersion
    ? toModelStatus(currentVersion.status)
    : "validated";

  return {
    id: String(model.id),
    name: model.name,
    slug: model.name.toLowerCase().replace(/\s+/g, "-"),
    currentVersion: currentVersion?.version ?? "-",
    task: model.task,
    framework: currentVersion?.framework ?? "-",
    status,
    description: model.description ?? "",
    modelCode: model.name,
    versionsCount: versions.length,
    size: "-",
    lastUpdated: formatRelativeDate(model.created_at),
    callsPerHour: currentMetrics?.requests ?? 0,
    sparklineData: [],
    versions: stitchVersions,

    hardwareBinding: {
      computeDevice: "Local",
      batchWindow: "-",
      quantization: "-",
    },

    runtimeTelemetry: {
      online: status === "deployed",
      p95LatencyMs: currentMetrics?.average_latency_ms ?? 0,
      vramAllocatedGb: 0,
      vramTotalGb: 0,
      throughputReqMin: 0,
      throughputChangePct: 0,
    },
  };
}

export function adaptModels(
  models: ApiModel[],
  versionsByModel: Record<string, ApiModelVersion[]> = {},
  metricsByModel: Record<string, Record<string, Metrics>> = {},
): ModelItem[] {
  return models.map((model) =>
    adaptModel(
      model,
      versionsByModel[String(model.id)] ?? [],
      metricsByModel[String(model.id)] ?? {},
    ),
  );
}
