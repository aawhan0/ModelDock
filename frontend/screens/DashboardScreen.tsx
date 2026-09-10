import React, { useEffect, useMemo, useState } from 'react';
import {
  DriftReport,
  fetchDeploymentReadiness,
  fetchDrift,
} from '../lib/model-api';
import { ModelItem, ScreenType } from '../types';

interface DashboardScreenProps {
  models: ModelItem[];
  onNavigate: (screen: ScreenType, modelId?: string, version?: string) => void;
  onRefresh: () => Promise<void>;
}

type ModelHealth = {
  drift: DriftReport | null;
  gateAllowed: boolean | null;
  gateFailures: string[];
};

const cardClass = 'rounded-xl border border-surface-variant/50 bg-surface-container-lowest';

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}

function formatLatency(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '—';
  return `${Math.round(value)} ms`;
}

function driftLabel(status: DriftReport['status']): string {
  switch (status) {
    case 'significant_drift': return 'Significant drift';
    case 'moderate_drift': return 'Moderate drift';
    case 'insufficient_data': return 'Building baseline';
    default: return 'Stable';
  }
}

function driftTone(status: DriftReport['status']): string {
  switch (status) {
    case 'significant_drift': return 'text-error';
    case 'moderate_drift': return 'text-warning';
    case 'insufficient_data': return 'text-on-surface-variant';
    default: return 'text-secondary';
  }
}

const StatusDot: React.FC<{ online: boolean }> = ({ online }) => (
  <span className={`inline-flex h-2 w-2 rounded-full ${online ? 'bg-secondary' : 'bg-error'}`} aria-hidden="true" />
);

export const DashboardScreen: React.FC<DashboardScreenProps> = ({
  models,
  onNavigate,
  onRefresh,
}) => {
  const [health, setHealth] = useState<Record<string, ModelHealth>>({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [healthLoading, setHealthLoading] = useState(false);

  const deployedModels = useMemo(
    () => models.filter((model) => model.status === 'deployed' && model.currentVersion !== 'N/A'),
    [models],
  );

  const summary = useMemo(() => {
    const deployed = models.filter((model) => model.status === 'deployed');
    const online = deployed.filter((model) => model.runtimeTelemetry.online).length;
    const requests = models.reduce((sum, model) => sum + Math.max(0, model.callsPerHour), 0);
    const latencyValues = deployed
      .map((model) => model.runtimeTelemetry.p95LatencyMs)
      .filter((value) => Number.isFinite(value) && value > 0);
    const averageP95 = latencyValues.length
      ? latencyValues.reduce((sum, value) => sum + value, 0) / latencyValues.length
      : 0;
    const driftAlerts = Object.values(health).filter(
      (item) => item.drift?.status === 'significant_drift' || item.drift?.status === 'moderate_drift',
    ).length;
    const gateBlocks = Object.values(health).filter((item) => item.gateAllowed === false).length;

    return {
      deployed: deployed.length,
      online,
      requests,
      averageP95,
      driftAlerts,
      gateBlocks,
    };
  }, [models, health]);

  useEffect(() => {
    let cancelled = false;

    const loadHealth = async () => {
      if (deployedModels.length === 0) {
        setHealth({});
        return;
      }

      setHealthLoading(true);
      const entries = await Promise.all(
        deployedModels.slice(0, 8).map(async (model) => {
          const version = model.currentVersion;
          const [drift, readiness] = await Promise.all([
            fetchDrift(model.id, version).catch(() => null),
            fetchDeploymentReadiness(model.id, version).catch(() => null),
          ]);

          return [model.id, {
            drift,
            gateAllowed: readiness?.allowed ?? null,
            gateFailures: readiness?.failures ?? [],
          }] as const;
        }),
      );

      if (!cancelled) {
        setHealth(Object.fromEntries(entries));
        setHealthLoading(false);
      }
    };

    void loadHealth();
    return () => { cancelled = true; };
  }, [deployedModels]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
    }
  };

  const recentModels = [...models]
    .sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime())
    .slice(0, 5);

  return (
    <section className="space-y-space-5" aria-labelledby="dashboard-title">
      <header className="flex flex-col gap-space-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-space-2">
            <span className="font-label-caps text-label-caps uppercase tracking-wide text-secondary">Control plane</span>
            <span className="h-1 w-1 rounded-full bg-outline-variant" />
            <span className="font-code-sm text-code-sm text-on-surface-variant">Live registry snapshot</span>
          </div>
          <h1 id="dashboard-title" className="mt-1 font-headline-lg text-headline-lg font-semibold text-on-surface">
            Production overview
          </h1>
          <p className="mt-1 max-w-2xl font-body-default text-body-default text-on-surface-variant">
            See what is deployed, whether it is healthy, and where the platform needs attention.
          </p>
        </div>
        <div className="flex items-center gap-space-2">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="inline-flex items-center gap-2 rounded-lg border border-surface-variant bg-surface-container-lowest px-3 py-2 font-label-default text-label-default text-on-surface hover:bg-surface-container-low disabled:cursor-wait disabled:opacity-60"
          >
            <span className={`material-symbols-outlined text-[17px] ${isRefreshing ? 'animate-spin' : ''}`}>refresh</span>
            {isRefreshing ? 'Refreshing' : 'Refresh'}
          </button>
          <button
            onClick={() => onNavigate('models')}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 font-label-default text-label-default text-on-primary hover:opacity-90"
          >
            <span className="material-symbols-outlined text-[17px]">inventory_2</span>
            Models
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-space-3 sm:grid-cols-2 xl:grid-cols-4">
        <article className={`${cardClass} p-space-4`}>
          <div className="flex items-center justify-between">
            <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">Deployed models</span>
            <span className="material-symbols-outlined text-[18px] text-on-surface-variant">cloud_done</span>
          </div>
          <div className="mt-space-3 flex items-end gap-2">
            <span className="font-display-sm text-display-sm font-semibold text-on-surface">{summary.deployed}</span>
            <span className="mb-1 font-code-sm text-code-sm text-secondary">{summary.online}/{summary.deployed} online</span>
          </div>
        </article>

        <article className={`${cardClass} p-space-4`}>
          <div className="flex items-center justify-between">
            <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">Requests / hour</span>
            <span className="material-symbols-outlined text-[18px] text-on-surface-variant">swap_vert</span>
          </div>
          <div className="mt-space-3">
            <span className="font-display-sm text-display-sm font-semibold text-on-surface">{formatNumber(summary.requests)}</span>
          </div>
          <p className="mt-1 font-code-sm text-code-sm text-on-surface-variant">Across registered models</p>
        </article>

        <article className={`${cardClass} p-space-4`}>
          <div className="flex items-center justify-between">
            <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">Average p95</span>
            <span className="material-symbols-outlined text-[18px] text-on-surface-variant">speed</span>
          </div>
          <div className="mt-space-3">
            <span className="font-display-sm text-display-sm font-semibold text-on-surface">{formatLatency(summary.averageP95)}</span>
          </div>
          <p className="mt-1 font-code-sm text-code-sm text-on-surface-variant">Deployed model telemetry</p>
        </article>

        <article className={`${cardClass} p-space-4`}>
          <div className="flex items-center justify-between">
            <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">Attention</span>
            <span className="material-symbols-outlined text-[18px] text-on-surface-variant">warning</span>
          </div>
          <div className="mt-space-3 flex items-baseline gap-3">
            <span className="font-display-sm text-display-sm font-semibold text-on-surface">{summary.driftAlerts}</span>
            <span className="font-code-sm text-code-sm text-on-surface-variant">drift signals</span>
          </div>
          <p className="mt-1 font-code-sm text-code-sm text-on-surface-variant">{summary.gateBlocks} deployment gate blocks</p>
        </article>
      </div>

      <div className="grid grid-cols-1 gap-space-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,0.85fr)]">
        <article className={`${cardClass} overflow-hidden`}>
          <div className="flex items-center justify-between border-b border-surface-variant/40 px-space-4 py-space-3">
            <div>
              <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">Production health</h2>
              <p className="mt-0.5 font-body-sm text-body-sm text-on-surface-variant">Deployed versions and their latest operational signals.</p>
            </div>
            <button onClick={() => onNavigate('monitoring')} className="font-label-default text-label-default text-secondary hover:underline">
              Open monitoring
            </button>
          </div>

          {deployedModels.length === 0 ? (
            <div className="px-space-5 py-space-10 text-center">
              <span className="material-symbols-outlined text-[28px] text-on-surface-variant">cloud_off</span>
              <h3 className="mt-2 font-headline-sm text-headline-sm font-semibold text-on-surface">Nothing is deployed yet</h3>
              <p className="mx-auto mt-1 max-w-md font-body-sm text-body-sm text-on-surface-variant">Register a model, validate an artifact, and deploy a version to start seeing production telemetry here.</p>
              <button onClick={() => onNavigate('models')} className="mt-4 rounded-lg bg-primary px-3 py-2 font-label-default text-label-default text-on-primary">Open model registry</button>
            </div>
          ) : (
            <div className="divide-y divide-surface-variant/30">
              {deployedModels.map((model) => {
                const item = health[model.id];
                const drift = item?.drift;
                return (
                  <div key={model.id} className="flex flex-col gap-space-3 px-space-4 py-space-3 sm:flex-row sm:items-center sm:justify-between">
                    <button onClick={() => onNavigate('model-detail', model.id)} className="min-w-0 text-left hover:opacity-80">
                      <div className="flex items-center gap-2">
                        <StatusDot online={model.runtimeTelemetry.online} />
                        <span className="truncate font-label-default text-label-default font-medium text-on-surface">{model.name}</span>
                        <span className="font-code-sm text-code-sm text-on-surface-variant">{model.currentVersion}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 font-code-sm text-code-sm text-on-surface-variant">
                        <span>{model.framework}</span>
                        <span>{formatLatency(model.runtimeTelemetry.p95LatencyMs)} p95</span>
                        <span>{formatNumber(model.callsPerHour)} req/h</span>
                      </div>
                    </button>
                    <div className="flex items-center gap-3 sm:justify-end">
                      {healthLoading && !item ? (
                        <span className="font-code-sm text-code-sm text-on-surface-variant">Checking health…</span>
                      ) : drift ? (
                        <span className={`font-label-caps text-label-caps uppercase ${driftTone(drift.status)}`}>
                          {driftLabel(drift.status)}
                        </span>
                      ) : (
                        <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">Telemetry unavailable</span>
                      )}
                      <button
                        onClick={() => onNavigate('monitoring', model.id, model.currentVersion)}
                        className="rounded-lg border border-surface-variant px-2.5 py-1.5 font-label-default text-label-default text-on-surface hover:bg-surface-container"
                      >
                        Inspect
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </article>

        <article className={`${cardClass} overflow-hidden`}>
          <div className="flex items-center justify-between border-b border-surface-variant/40 px-space-4 py-space-3">
            <div>
              <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">Registry activity</h2>
              <p className="mt-0.5 font-body-sm text-body-sm text-on-surface-variant">Recently registered or updated models.</p>
            </div>
            <span className="material-symbols-outlined text-[18px] text-on-surface-variant">history</span>
          </div>
          {recentModels.length === 0 ? (
            <div className="px-space-4 py-space-8 text-center font-body-sm text-body-sm text-on-surface-variant">No registry activity yet.</div>
          ) : (
            <div className="divide-y divide-surface-variant/30">
              {recentModels.map((model) => (
                <button key={model.id} onClick={() => onNavigate('model-detail', model.id)} className="w-full px-space-4 py-space-3 text-left hover:bg-surface-container-low">
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate font-label-default text-label-default font-medium text-on-surface">{model.name}</span>
                    <span className="shrink-0 rounded-full bg-surface-container px-2 py-0.5 font-label-caps text-label-caps uppercase text-on-surface-variant">{model.status}</span>
                  </div>
                  <div className="mt-1 font-code-sm text-code-sm text-on-surface-variant">{model.framework} · {model.versionsCount} version{model.versionsCount === 1 ? '' : 's'}</div>
                </button>
              ))}
            </div>
          )}
        </article>
      </div>

      <div className="grid grid-cols-1 gap-space-4 md:grid-cols-3">
        <button onClick={() => onNavigate('inference')} className={`${cardClass} p-space-4 text-left hover:bg-surface-container-low`}>
          <span className="material-symbols-outlined text-[20px] text-secondary">play_arrow</span>
          <h3 className="mt-2 font-headline-sm text-headline-sm font-semibold text-on-surface">Run inference</h3>
          <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">Open the serving playground for the active model.</p>
        </button>
        <button onClick={() => onNavigate('monitoring')} className={`${cardClass} p-space-4 text-left hover:bg-surface-container-low`}>
          <span className="material-symbols-outlined text-[20px] text-secondary">query_stats</span>
          <h3 className="mt-2 font-headline-sm text-headline-sm font-semibold text-on-surface">Analyze telemetry</h3>
          <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">Inspect latency, throughput, errors, and drift.</p>
        </button>
        <button onClick={() => onNavigate('endpoints')} className={`${cardClass} p-space-4 text-left hover:bg-surface-container-low`}>
          <span className="material-symbols-outlined text-[20px] text-secondary">api</span>
          <h3 className="mt-2 font-headline-sm text-headline-sm font-semibold text-on-surface">API endpoints</h3>
          <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">View serving routes and integration details.</p>
        </button>
      </div>
    </section>
  );
};
