"use client";

import { useEffect, useState } from "react";

type Model = {
  id: number;
  name: string;
  task: string;
  description?: string | null;
  created_at: string;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function Home() {
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
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
            <p className="description">
              {model.description || "No description provided."}
            </p>
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
            <button type="button">View Model</button>
          </article>
        ))}
      </section>
    </main>
  );
}
