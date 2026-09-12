import React from 'react';
import { ModelItem } from '../types';

interface ModelHealthPanelProps {
  model: ModelItem;
}

const Stat = ({ label, value, detail }: { label: string; value: string; detail: string }) => (
  <div className="rounded-lg border border-surface-variant/40 bg-surface-container-lowest p-space-4">
    <p className="font-label-default text-label-default text-on-surface-variant">{label}</p>
    <p className="mt-space-2 font-headline-md text-headline-md font-semibold text-on-surface">{value}</p>
    <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">{detail}</p>
  </div>
);

export const ModelHealthPanel: React.FC<ModelHealthPanelProps> = ({ model }) => {
  const telemetry = model.runtimeTelemetry;
  const utilization = telemetry.vramTotalGb > 0
    ? Math.min(100, (telemetry.vramAllocatedGb / telemetry.vramTotalGb) * 100)
    : 0;

  return (
    <section className="space-y-space-4" aria-labelledby="model-health-heading">
      <div className="flex flex-wrap items-start justify-between gap-space-3">
        <div>
          <h2 id="model-health-heading" className="font-headline-sm text-headline-sm font-semibold text-on-surface">
            Runtime health
          </h2>
          <p className="mt-1 font-body-default text-body-default text-on-surface-variant">
            Live capacity and performance for the selected model.
          </p>
        </div>
        <span className={`inline-flex items-center gap-2 rounded-full px-space-3 py-1 font-label-default text-label-default ${telemetry.online ? 'bg-success-container text-on-success-container' : 'bg-error-container text-on-error-container'}`}>
          <span className="h-2 w-2 rounded-full bg-current" />
          {telemetry.online ? 'Online' : 'Offline'}
        </span>
      </div>

      <div className="grid gap-space-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="P95 latency" value={`${telemetry.p95LatencyMs} ms`} detail="Request response time" />
        <Stat label="Throughput" value={`${telemetry.throughputReqMin.toFixed(1)}/min`} detail={`${telemetry.throughputChangePct >= 0 ? '+' : ''}${telemetry.throughputChangePct}% vs previous period`} />
        <Stat label="Current version" value={model.currentVersion} detail={`${model.versionsCount} registered versions`} />
        <Stat label="Model size" value={model.size} detail={model.framework} />
      </div>

      <div className="rounded-lg border border-surface-variant/40 bg-surface-container-lowest p-space-4">
        <div className="flex items-center justify-between gap-space-3">
          <div>
            <p className="font-label-default text-label-default text-on-surface-variant">VRAM allocation</p>
            <p className="mt-1 font-body-default text-body-default text-on-surface">
              {telemetry.vramAllocatedGb.toFixed(1)} GB of {telemetry.vramTotalGb.toFixed(1)} GB
            </p>
          </div>
          <span className="font-code-sm text-code-sm text-on-surface-variant">{utilization.toFixed(0)}%</span>
        </div>
        <div className="mt-space-3 h-2 overflow-hidden rounded-full bg-surface-container">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${utilization}%` }} />
        </div>
      </div>
    </section>
  );
};
