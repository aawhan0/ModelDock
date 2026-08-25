"use client";

import { useEffect, useState } from "react";

type Model = {
  id: number;
  name: string;
  task: string;
  description?: string | null;
  created_at: string;
};

type ModelVersion = {
  id: number;
  model_id: number;
  version: string;
  artifact_path: string;
  framework: string;
  created_at: string;
};

type Metrics = {
  model_id: number;
  version: string;
  requests: number;
  successful: number;
  failed: number;
  average_latency_ms: number;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function Home() {
  const [models, setModels] = useState<Model[]>([]);
  const [selectedModel, setSelectedModel] = useState<Model | null>(null);
  const [versions, setVersions] = useState<ModelVersion[]>([]);
  const [metrics, setMetrics] = useState<Record<string, Metrics>>({});
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/api/v1/models`)
      .then((response) => {
        if (!response.ok) throw new Error("Failed to load models");
        return response.json();
      })
      .then(setModels)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const viewModel = async (model: Model) => {
    setSelectedModel(model);
    setDetailLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/api/v1/models/${model.id}/versions`);
      if (!response.ok) throw new Error("Failed to load model versions");
      const modelVersions: ModelVersion[] = await response.json();
      setVersions(modelVersions);

      const metricsEntries = await Promise.all(
        modelVersions.map(async (version) => {
          const metricsResponse = await fetch(
            `${API_URL}/api/v1/metrics/${model.id}/${version.version}`
          );
          if (!metricsResponse.ok) return null;
          return (await metricsResponse.json()) as Metrics;
        })
      );

      const metricsMap: Record<string, Metrics> = {};
      metricsEntries.forEach((entry) => {
        if (entry) metricsMap[entry.version] = entry;
      });
      setMetrics(metricsMap);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load model details");
    } finally {
      setDetailLoading(false);
    }
  };

  if (selectedModel) {
    return (
      <main className="dashboard">
        <button className="back-button" type="button" onClick={() => setSelectedModel(null)}>
          ← Back to models
        </button>

        <header className="detail-header">
          <div>
            <p className="eyebrow">MODEL DETAILS</p>
            <h1>{selectedModel.name}</h1>
            <p className="subtitle">{selectedModel.task}</p>
          </div>
          <span className="badge">ID {selectedModel.id}</span>
        </header>

        <section className="detail-summary">
          <span>Description</span>
          <strong>{selectedModel.description || "No description provided."}</strong>
        </section>

        <section className="section-header">
          <div>
            <h2>Versions</h2>
            <p>{versions.length} registered version{versions.length === 1 ? "" : "s"}</p>
          </div>
        </section>

        {detailLoading && <div className="state">Loading versions...</div>}
        {error && <div className="state error">Could not load details: {error}</div>}

        {!detailLoading && !error && versions.length === 0 && (
          <div className="state">No versions registered yet.</div>
        )}

        <section className="grid">
          {versions.map((version) => {
            const versionMetrics = metrics[version.version];
            return (
              <article className="card" key={version.id}>
                <div className="card-top">
                  <span className="model-icon">v</span>
                  <span className="badge">{version.version}</span>
                </div>
                <h3>{version.version}</h3>
                <p className="description">Framework: {version.framework}</p>

                <div className="metadata">
                  <div>
                    <span>Artifact</span>
                    <strong>{version.artifact_path ? "Available" : "Missing"}</strong>
                  </div>
                  <div>
                    <span>Created</span>
                    <strong>{new Date(version.created_at).toLocaleDateString()}</strong>
                  </div>
                </div>

                <div className="metrics">
                  <div><span>Requests</span><strong>{versionMetrics?.requests ?? 0}</strong></div>
                  <div><span>Success</span><strong>{versionMetrics?.successful ?? 0}</strong></div>
                  <div><span>Failed</span><strong>{versionMetrics?.failed ?? 0}</strong></div>
                  <div><span>Avg latency</span><strong>{versionMetrics?.average_latency_ms ?? 0} ms</strong></div>
                </div>
              </article>
            );
          })}
        </section>
      </main>
    );
  }

  return (
    <main className="dashboard">
      <header className="header">
        <div>
          <p className="eyebrow">MODEL SERVING PLATFORM</p>
          <h1>ModelDock</h1>
          <p className="subtitle">Manage and serve your machine learning models.</p>
        </div>
        <div className="status">● API connected</div>
      </header>

      <section className="section-header">
        <div>
          <h2>Models</h2>
          <p>{models.length} registered model{models.length === 1 ? "" : "s"}</p>
        </div>
      </section>

      {loading && <div className="state">Loading models...</div>}
      {error && <div className="state error">Could not load models: {error}</div>}

      {!loading && !error && models.length === 0 && (
        <div className="state">No models registered yet.</div>
      )}

      <section className="grid">
        {models.map((model) => (
          <article className="card" key={model.id}>
            <div className="card-top">
              <span className="model-icon">ML</span>
              <span className="badge">ID {model.id}</span>
            </div>
            <h3>{model.name}</h3>
            <p className="description">{model.description || "No description provided."}</p>
            <div className="metadata">
              <div>
                <span>Task</span>
                <strong>{model.task}</strong>
              </div>
              <div>
                <span>Created</span>
                <strong>{new Date(model.created_at).toLocaleDateString()}</strong>
              </div>
            </div>
            <button type="button" onClick={() => viewModel(model)}>View Model</button>
          </article>
        ))}
      </section>
    </main>
  );
}
