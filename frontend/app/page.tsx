"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import MetricsCharts from "../components/metrics-charts";

type Model = { id: number; name: string; task: string; description?: string | null; created_at: string };
type ModelVersion = { id: number; model_id: number; version: string; artifact_path: string; framework: string; created_at: string };
type Metrics = { model_id: number; version: string; requests: number; successful: number; failed: number; average_latency_ms: number };
type Prediction = { model: string; version: string; prediction: unknown };
type InferenceHistory = { id: number; input: string; prediction: unknown; success: boolean; latency_ms: number; created_at: string };
type TimeseriesPoint = { timestamp: string; requests: number; successful: number; failed: number; average_latency_ms: number };

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function Home() {
  const [models, setModels] = useState<Model[]>([]);
  const [selectedModel, setSelectedModel] = useState<Model | null>(null);
  const [versions, setVersions] = useState<ModelVersion[]>([]);
  const [metrics, setMetrics] = useState<Record<string, Metrics>>({});
  const [history, setHistory] = useState<Record<string, InferenceHistory[]>>({});
  const [timeseries, setTimeseries] = useState<Record<string, TimeseriesPoint[]>>({});
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [predictions, setPredictions] = useState<Record<string, Prediction>>({});
  const [predictionErrors, setPredictionErrors] = useState<Record<string, string>>({});
  const [predictionLatency, setPredictionLatency] = useState<Record<string, number>>({});
  const [predicting, setPredicting] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModel, setShowCreateModel] = useState(false);
  const [showCreateVersion, setShowCreateVersion] = useState(false);
  const [modelForm, setModelForm] = useState({ name: "", task: "", description: "" });
  const [versionForm, setVersionForm] = useState({ version: "", framework: "sklearn" });
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [managementError, setManagementError] = useState<string | null>(null);
  const [deletingModel, setDeletingModel] = useState(false);
  const [deletingVersion, setDeletingVersion] = useState<Record<string, boolean>>({});

  const loadModels = async () => {
    const response = await fetch(`${API_URL}/api/v1/models`);
    if (!response.ok) throw new Error("Failed to load models");
    setModels(await response.json());
  };

  useEffect(() => {
    loadModels().catch((err) => setError(err.message)).finally(() => setLoading(false));
  }, []);

  const loadMetrics = async (modelId: number, modelVersions: ModelVersion[]) => {
    const entries = await Promise.all(modelVersions.map(async (version) => {
      const response = await fetch(`${API_URL}/api/v1/metrics/${modelId}/${version.version}`);
      return response.ok ? await response.json() as Metrics : null;
    }));
    const map: Record<string, Metrics> = {};
    entries.forEach((entry) => { if (entry) map[entry.version] = entry; });
    setMetrics(map);
  };

  const loadHistory = async (modelId: number, modelVersions: ModelVersion[]) => {
    const entries = await Promise.all(modelVersions.map(async (version) => {
      const response = await fetch(`${API_URL}/api/v1/metrics/${modelId}/${version.version}/history?limit=50`);
      return response.ok ? await response.json() as InferenceHistory[] : [];
    }));
    const map: Record<string, InferenceHistory[]> = {};
    modelVersions.forEach((version, index) => { map[version.version] = entries[index]; });
    setHistory(map);
  };

  const loadTimeseries = async (modelId: number, modelVersions: ModelVersion[]) => {
    const entries = await Promise.all(modelVersions.map(async (version) => {
      const response = await fetch(`${API_URL}/api/v1/metrics/${modelId}/${version.version}/timeseries?hours=24`);
      return response.ok ? await response.json() as TimeseriesPoint[] : [];
    }));
    const map: Record<string, TimeseriesPoint[]> = {};
    modelVersions.forEach((version, index) => { map[version.version] = entries[index]; });
    setTimeseries(map);
  };

  const loadModelData = async (modelId: number, modelVersions: ModelVersion[]) => {
    await Promise.all([loadMetrics(modelId, modelVersions), loadHistory(modelId, modelVersions), loadTimeseries(modelId, modelVersions)]);
  };

  const viewModel = async (model: Model) => {
    setSelectedModel(model); setDetailLoading(true); setError(null); setManagementError(null);
    try {
      const response = await fetch(`${API_URL}/api/v1/models/${model.id}/versions`);
      if (!response.ok) throw new Error("Failed to load model versions");
      const modelVersions: ModelVersion[] = await response.json();
      setVersions(modelVersions); await loadModelData(model.id, modelVersions);
    } catch (err) { setError(err instanceof Error ? err.message : "Failed to load model details"); }
    finally { setDetailLoading(false); }
  };

  const createModel = async (event: FormEvent) => {
    event.preventDefault(); setCreating(true); setManagementError(null);
    try {
      const response = await fetch(`${API_URL}/api/v1/models`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(modelForm) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail || "Failed to create model");
      setModelForm({ name: "", task: "", description: "" }); setShowCreateModel(false); await loadModels();
    } catch (err) { setManagementError(err instanceof Error ? err.message : "Failed to create model"); }
    finally { setCreating(false); }
  };

  const createVersion = async (event: FormEvent) => {
    event.preventDefault(); if (!selectedModel) return;
    setCreating(true); setManagementError(null);
    try {
      const response = await fetch(`${API_URL}/api/v1/models/${selectedModel.id}/versions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: versionForm.version, framework: versionForm.framework, artifact_path: "" }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail || "Failed to create version");
      setVersionForm({ version: "", framework: "sklearn" }); setShowCreateVersion(false); await viewModel(selectedModel);
    } catch (err) { setManagementError(err instanceof Error ? err.message : "Failed to create version"); }
    finally { setCreating(false); }
  };

  const deleteModel = async () => {
    if (!selectedModel) return;
    const confirmed = window.confirm(`Delete model "${selectedModel.name}" and all of its versions, artifacts, and inference history? This cannot be undone.`);
    if (!confirmed) return;
    setDeletingModel(true); setManagementError(null);
    try {
      const response = await fetch(`${API_URL}/api/v1/models/${selectedModel.id}`, { method: "DELETE" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.detail || "Failed to delete model");
      }
      setSelectedModel(null); setVersions([]); setMetrics({}); setHistory({}); setTimeseries({});
      await loadModels();
    } catch (err) { setManagementError(err instanceof Error ? err.message : "Failed to delete model"); }
    finally { setDeletingModel(false); }
  };

  const deleteVersion = async (version: ModelVersion) => {
    if (!selectedModel) return;
    const confirmed = window.confirm(`Delete version "${version.version}" and its artifact, metrics, and inference history? This cannot be undone.`);
    if (!confirmed) return;
    setDeletingVersion((current) => ({ ...current, [version.version]: true })); setManagementError(null);
    try {
      const response = await fetch(`${API_URL}/api/v1/models/${selectedModel.id}/versions/${version.version}`, { method: "DELETE" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.detail || "Failed to delete version");
      }
      const remainingVersions = versions.filter((item) => item.id !== version.id);
      setVersions(remainingVersions);
      setMetrics((current) => { const next = { ...current }; delete next[version.version]; return next; });
      setHistory((current) => { const next = { ...current }; delete next[version.version]; return next; });
      setTimeseries((current) => { const next = { ...current }; delete next[version.version]; return next; });
    } catch (err) { setManagementError(err instanceof Error ? err.message : "Failed to delete version"); }
    finally { setDeletingVersion((current) => ({ ...current, [version.version]: false })); }
  };

  const uploadArtifact = async (version: ModelVersion, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file || !selectedModel) return;
    setUploading((current) => ({ ...current, [version.version]: true })); setManagementError(null);
    try {
      const formData = new FormData(); formData.append("file", file);
      const response = await fetch(`${API_URL}/api/v1/models/${selectedModel.id}/versions/${version.version}/artifact`, { method: "POST", body: formData });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail || "Failed to upload artifact");
      await viewModel(selectedModel);
    } catch (err) { setManagementError(err instanceof Error ? err.message : "Failed to upload artifact"); }
    finally { setUploading((current) => ({ ...current, [version.version]: false })); event.target.value = ""; }
  };

  const runPrediction = async (version: ModelVersion) => {
    if (!selectedModel) return;
    const input = inputs[version.version]?.trim();
    if (!input) { setPredictionErrors((current) => ({ ...current, [version.version]: "Enter an input before running prediction." })); return; }
    const key = version.version; setPredicting((current) => ({ ...current, [key]: true })); setPredictionErrors((current) => ({ ...current, [key]: "" }));
    const startedAt = performance.now();
    try {
      const response = await fetch(`${API_URL}/api/v1/models/${selectedModel.id}/versions/${version.version}/predict`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ input }) });
      const elapsed = performance.now() - startedAt; setPredictionLatency((current) => ({ ...current, [key]: elapsed }));
      const body = await response.json(); if (!response.ok) throw new Error(body.detail || "Prediction failed");
      setPredictions((current) => ({ ...current, [key]: body as Prediction }));
      await loadModelData(selectedModel.id, versions);
    } catch (err) { setPredictionErrors((current) => ({ ...current, [key]: err instanceof Error ? err.message : "Prediction failed" })); }
    finally { setPredicting((current) => ({ ...current, [key]: false })); }
  };

  if (selectedModel) {
    return <main className="dashboard">
      <button className="back-button" type="button" onClick={() => setSelectedModel(null)}>← Back to models</button>
      <header className="detail-header"><div><p className="eyebrow">MODEL DETAILS</p><h1>{selectedModel.name}</h1><p className="subtitle">{selectedModel.task}</p></div><span className="badge">ID {selectedModel.id}</span></header>
      <section className="detail-summary"><span>Description</span><strong>{selectedModel.description || "No description provided."}</strong></section>
      <section className="section-header action-header"><div><h2>Versions</h2><p>{versions.length} registered version{versions.length === 1 ? "" : "s"}</p></div><div className="management-actions"><button type="button" onClick={() => setShowCreateVersion(!showCreateVersion)}>+ Create Version</button><button type="button" className="danger-button" onClick={deleteModel} disabled={deletingModel}>{deletingModel ? "Deleting..." : "Delete Model"}</button></div></section>
      {showCreateVersion && <form className="management-form" onSubmit={createVersion}><input required placeholder="Version (e.g. v4)" value={versionForm.version} onChange={(e) => setVersionForm({ ...versionForm, version: e.target.value })} /><select value={versionForm.framework} onChange={(e) => setVersionForm({ ...versionForm, framework: e.target.value })}><option value="sklearn">sklearn</option><option value="json">json</option><option value="python">python</option><option value="pytorch">pytorch</option></select><button disabled={creating}>{creating ? "Creating..." : "Create Version"}</button></form>}
      {managementError && <div className="state error">{managementError}</div>}
      {detailLoading && <div className="state">Loading versions...</div>}
      {error && <div className="state error">Could not load details: {error}</div>}
      <section className="grid">{versions.map((version) => { const m = metrics[version.version]; const prediction = predictions[version.version]; const predictionError = predictionErrors[version.version]; const isPredicting = predicting[version.version]; const versionHistory = history[version.version] ?? []; const isDeleting = deletingVersion[version.version]; return <article className="card" key={version.id}>
        <div className="card-top"><span className="model-icon">v</span><span className="badge">{version.version}</span></div><h3>{version.version}</h3><p className="description">Framework: {version.framework}</p>
        <div className="metadata"><div><span>Artifact</span><strong>{version.artifact_path ? "Available" : "Missing"}</strong></div><div><span>Created</span><strong>{new Date(version.created_at).toLocaleDateString()}</strong></div></div>
        <div className="artifact-upload"><span>Artifact</span><label className="file-button">{uploading[version.version] ? "Uploading..." : "Choose File"}<input type="file" hidden disabled={uploading[version.version] || isDeleting} onChange={(e) => uploadArtifact(version, e)} /></label></div>
        <div className="metrics"><div><span>Requests</span><strong>{m?.requests ?? 0}</strong></div><div><span>Success</span><strong>{m?.successful ?? 0}</strong></div><div><span>Failed</span><strong>{m?.failed ?? 0}</strong></div><div><span>Avg latency</span><strong>{m?.average_latency_ms ?? 0} ms</strong></div></div>
        <MetricsCharts data={timeseries[version.version] ?? []} />
        <div className="inference"><div className="inference-title">Test Inference</div><textarea value={inputs[version.version] ?? ""} onChange={(e) => setInputs((current) => ({ ...current, [version.version]: e.target.value }))} placeholder="Enter text to classify..." rows={3} disabled={isPredicting || isDeleting || !version.artifact_path} /><button type="button" onClick={() => runPrediction(version)} disabled={isPredicting || isDeleting || !version.artifact_path}>{isPredicting ? "Running..." : "Run Prediction"}</button>{predictionError && <div className="prediction-error">{predictionError}</div>}{prediction && <div className="prediction-result"><div><span>Prediction</span><strong>{JSON.stringify(prediction.prediction)}</strong></div><div><span>Request time</span><strong>{predictionLatency[version.version]?.toFixed(1)} ms</strong></div></div>}</div>
        <div className="history"><div className="history-header"><div><div className="inference-title">Inference History</div><p>{versionHistory.length} recent request{versionHistory.length === 1 ? "" : "s"}</p></div></div>{versionHistory.length === 0 ? <div className="history-empty">No inference requests yet.</div> : <div className="history-table-wrap"><table className="history-table"><thead><tr><th>Time</th><th>Input</th><th>Prediction</th><th>Status</th><th>Latency</th></tr></thead><tbody>{versionHistory.map((item) => <tr key={item.id}><td>{new Date(item.created_at).toLocaleString()}</td><td className="history-input">{item.input}</td><td>{JSON.stringify(item.prediction)}</td><td><span className={`history-status ${item.success ? "success" : "failed"}`}>{item.success ? "Success" : "Failed"}</span></td><td>{item.latency_ms} ms</td></tr>)}</tbody></table></div>}</div>
        <button type="button" className="danger-button version-delete-button" onClick={() => deleteVersion(version)} disabled={isDeleting}>{isDeleting ? "Deleting..." : `Delete ${version.version}`}</button>
      </article>; })}</section>
    </main>;
  }

  return <main className="dashboard">
    <header className="header"><div><p className="eyebrow">MODEL SERVING PLATFORM</p><h1>ModelDock</h1><p className="subtitle">Manage and serve your machine learning models.</p></div><div className="status">● API connected</div></header>
    <section className="section-header action-header"><div><h2>Models</h2><p>{models.length} registered model{models.length === 1 ? "" : "s"}</p></div><button type="button" onClick={() => setShowCreateModel(!showCreateModel)}>+ New Model</button></section>
    {showCreateModel && <form className="management-form model-form" onSubmit={createModel}><input required placeholder="Model name" value={modelForm.name} onChange={(e) => setModelForm({ ...modelForm, name: e.target.value })} /><input required placeholder="Task (e.g. text-classification)" value={modelForm.task} onChange={(e) => setModelForm({ ...modelForm, task: e.target.value })} /><textarea placeholder="Description" rows={3} value={modelForm.description} onChange={(e) => setModelForm({ ...modelForm, description: e.target.value })} /><button disabled={creating}>{creating ? "Creating..." : "Create Model"}</button></form>}
    {loading && <div className="state">Loading models...</div>}{error && <div className="state error">Could not load models: {error}</div>}{!loading && !error && models.length === 0 && <div className="state">No models registered yet.</div>}
    <section className="grid">{models.map((model) => <article className="card" key={model.id}><div className="card-top"><span className="model-icon">ML</span><span className="badge">ID {model.id}</span></div><h3>{model.name}</h3><p className="description">{model.description || "No description provided."}</p><div className="metadata"><div><span>Task</span><strong>{model.task}</strong></div><div><span>Created</span><strong>{new Date(model.created_at).toLocaleDateString()}</strong></div></div><button type="button" onClick={() => viewModel(model)}>View Model</button></article>)}</section>
  </main>;
}
