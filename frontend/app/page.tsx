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

type Prediction = {
  model: string;
  version: string;
  prediction: unknown;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function Home() {
  const [models, setModels] = useState<Model[]>([]);
  const [selectedModel, setSelectedModel] = useState<Model | null>(null);
  const [versions, setVersions] = useState<ModelVersion[]>([]);
  const [metrics, setMetrics] = useState<Record<string, Metrics>>({});
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [predictions, setPredictions] = useState<Record<string, Prediction>>({});
  const [predictionErrors, setPredictionErrors] = useState<Record<string, string>>({});
  const [predictionLatency, setPredictionLatency] = useState<Record<string, number>>({});
  const [predicting, setPredicting] = useState<Record<string, boolean>>({});
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

  const loadMetrics = async (modelId: number, modelVersions: ModelVersion[]) => {
    const metricsEntries = await Promise.all(
      modelVersions.map(async (version) => {
        const response = await fetch(
          `${API_URL}/api/v1/metrics/${modelId}/${version.version}`
        );
        if (!response.ok) return null;
        return (await response.json()) as Metrics;
      })
    );

    const metricsMap: Record<string, Metrics> = {};
    metricsEntries.forEach((entry) => {
      if (entry) metricsMap[entry.version] = entry;
    });
    setMetrics(metricsMap);
  };

  const viewModel = async (model: Model) => {
    setSelectedModel(model);
    setDetailLoading(true);
    setError(null);
    setPredictions({});
    setPredictionErrors({});
    setPredictionLatency({});

    try {
      const response = await fetch(`${API_URL}/api/v1/models/${model.id}/versions`);
      if (!response.ok) throw new Error("Failed to load model versions");
      const modelVersions: ModelVersion[] = await response.json();
      setVersions(modelVersions);
      await loadMetrics(model.id, modelVersions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load model details");
    } finally {
      setDetailLoading(false);
    }
  };

  const runPrediction = async (version: ModelVersion) => {
    if (!selectedModel) return;

    const input = inputs[version.version]?.trim();
    if (!input) {
      setPredictionErrors((current) => ({
        ...current,
        [version.version]: "Enter an input before running prediction.",
      }));
      return;
    }

    const key = version.version;
    setPredicting((current) => ({ ...current, [key]: true }));
    setPredictionErrors((current) => ({ ...current, [key]: "" }));

    const startedAt = performance.now();

    try {
      const response = await fetch(
        `${API_URL}/api/v1/models/${selectedModel.id}/versions/${version.version}/predict`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input }),
        }
      );

      const elapsed = performance.now() - startedAt;
      setPredictionLatency((current) => ({ ...current, [key]: elapsed }));

      const body = await response.json();
      if (!response.ok) throw new Error(body.detail || "Prediction failed");

      setPredictions((current) => ({ ...current, [key]: body as Prediction }));
      await loadMetrics(selectedModel.id, versions);
    } catch (err) {
      setPredictionErrors((current) => ({
        ...current,
        [key]: err instanceof Error ? err.message : "Prediction failed",
      }));
    } finally {
      setPredicting((current) => ({ ...current, [key]: false }));
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
            const prediction = predictions[version.version];
            const predictionError = predictionErrors[version.version];
            const isPredicting = predicting[version.version];

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

                <div className="inference">
                  <div className="inference-title">Test Inference</div>
                  <textarea
                    value={inputs[version.version] ?? ""}
                    onChange={(event) =>
                      setInputs((current) => ({ ...current, [version.version]: event.target.value }))
                    }
                    placeholder="Enter text to classify..."
                    rows={3}
                    disabled={isPredicting || !version.artifact_path}
                  />
                  <button
                    type="button"
                    onClick={() => runPrediction(version)}
                    disabled={isPredicting || !version.artifact_path}
                  >
                    {isPredicting ? "Running..." : "Run Prediction"}
                  </button>

                  {predictionError && <div className="prediction-error">{predictionError}</div>}

                  {prediction && (
                    <div className="prediction-result">
                      <div>
                        <span>Prediction</span>
                        <strong>{JSON.stringify(prediction.prediction)}</strong>
                      </div>
                      <div>
                        <span>Request time</span>
                        <strong>{predictionLatency[version.version]?.toFixed(1)} ms</strong>
                      </div>
                    </div>
                  )}
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
              <div><span>Task</span><strong>{model.task}</strong></div>
              <div><span>Created</span><strong>{new Date(model.created_at).toLocaleDateString()}</strong></div>
            </div>
            <button type="button" onClick={() => viewModel(model)}>View Model</button>
          </article>
        ))}
      </section>
    </main>
  );
}
