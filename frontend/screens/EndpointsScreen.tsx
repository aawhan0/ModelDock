import React from 'react';
import { ModelItem, ScreenType } from '../types';

interface EndpointsScreenProps {
  models: ModelItem[];
  onSelectModel: (model: ModelItem) => void;
  onNavigate: (screen: ScreenType) => void;
  onShowToast: (msg: string) => void;
}

export const EndpointsScreen: React.FC<EndpointsScreenProps> = ({
  models,
  onSelectModel,
  onNavigate,
  onShowToast,
}) => {
  const deployedModels = models.filter((m) => m.status === 'deployed');

  const handleCopyEndpoint = (url: string) => {
    navigator.clipboard.writeText(url);
    onShowToast('Endpoint URL copied to clipboard');
  };

  return (
    <div className="flex flex-col w-full pb-space-12">
      <div className="flex flex-col gap-1 py-space-4">
        <div className="flex items-center gap-space-2 text-on-surface-variant font-label-caps text-label-caps tracking-wider uppercase">
          <span>PLATFORM</span>
          <span>/</span>
          <span className="text-primary font-semibold">ENDPOINTS</span>
        </div>
        <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight font-semibold">
          Active HTTP REST Endpoints
        </h1>
        <p className="font-body-default text-body-default text-on-surface-variant">
          Local inference servers bound to port 8080 and exposed for service consumers.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-space-4 mt-space-4">
        {deployedModels.map((m) => {
          const endpointUrl = `http://localhost:8000/api/v1/models/${m.id}/versions/${m.currentVersion}/predict`;
          return (
            <div
              key={m.id}
              className="bg-surface-container-lowest rounded-lg p-space-4 shadow-sm border border-surface-variant/40 flex flex-col gap-space-3"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-2">
                <div className="flex items-center gap-space-3">
                  <span className="font-headline-md text-headline-md font-semibold text-on-surface">
                    {m.name}
                  </span>
                  <span className="px-space-2 py-0.5 rounded bg-surface-container font-code-sm text-code-sm text-on-surface-variant">
                    {m.currentVersion}
                  </span>
                  <span className="inline-flex items-center gap-1 px-space-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-label-caps text-label-caps font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    ONLINE
                  </span>
                </div>

                <div className="flex items-center gap-space-2">
                  <button
                    onClick={() => {
                      onSelectModel(m);
                      onNavigate('inference');
                    }}
                    className="px-space-3 py-1 rounded bg-primary text-on-primary font-label-default text-label-default hover:bg-primary-container transition-colors shadow-xs cursor-pointer flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-[15px]">play_arrow</span>
                    <span>Test Playground</span>
                  </button>
                  <button
                    onClick={() => {
                      onSelectModel(m);
                      onNavigate('monitoring');
                    }}
                    className="px-space-3 py-1 rounded bg-surface-container hover:bg-surface-container-high text-on-surface font-label-default text-label-default transition-colors cursor-pointer flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-[15px]">monitoring</span>
                    <span>Metrics</span>
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between bg-surface-container-low rounded px-space-3 py-2 border border-surface-variant/30">
                <div className="flex items-center gap-2 font-code-sm text-code-sm text-on-surface">
                  <span className="px-1.5 py-0.5 rounded bg-primary text-on-primary font-bold text-[10px]">
                    POST
                  </span>
                  <span className="select-all">{endpointUrl}</span>
                </div>
                <button
                  onClick={() => handleCopyEndpoint(endpointUrl)}
                  className="p-1 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
                  title="Copy URL"
                >
                  <span className="material-symbols-outlined text-[16px]">content_copy</span>
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-space-2 text-on-surface-variant font-code-sm text-code-sm pt-1">
                <div>
                  <span className="text-on-surface-variant/70 block text-[10px] uppercase font-semibold">Throughput</span>
                  <span className="text-on-surface font-medium">{m.callsPerHour} req/m</span>
                </div>
                <div>
                  <span className="text-on-surface-variant/70 block text-[10px] uppercase font-semibold">p95 Latency</span>
                  <span className="text-on-surface font-medium">{m.runtimeTelemetry.p95LatencyMs} ms</span>
                </div>
                <div>
                  <span className="text-on-surface-variant/70 block text-[10px] uppercase font-semibold">VRAM Assigned</span>
                  <span className="text-on-surface font-medium">{m.runtimeTelemetry.vramAllocatedGb} GB</span>
                </div>
                <div>
                  <span className="text-on-surface-variant/70 block text-[10px] uppercase font-semibold">Device</span>
                  <span className="text-on-surface font-medium">{m.hardwareBinding.computeDevice}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
