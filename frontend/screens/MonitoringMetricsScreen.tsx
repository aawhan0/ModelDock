import React, { useEffect, useMemo, useState } from 'react';
import { ModelItem, ScreenType, ErrorDiagnostic } from '../types';
import { fetchInferenceHistory, fetchMetrics, fetchMetricsTimeseries, mapInferenceErrors } from '../lib/model-api';

interface MonitoringMetricsScreenProps {
  model: ModelItem;
  onNavigate: (screen: ScreenType) => void;
  onShowToast: (msg: string) => void;
}

export const MonitoringMetricsScreen: React.FC<MonitoringMetricsScreenProps> = ({ model, onNavigate, onShowToast }) => {
  const [timeRange, setTimeRange] = useState<'1H' | '6H' | '24H' | '7D'>('24H');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedError, setSelectedError] = useState<ErrorDiagnostic | null>(null);
  const [errorFilter, setErrorFilter] = useState<'ALL' | 'ERROR' | 'WARNING'>('ALL');
  const [metrics, setMetrics] = useState({ requests: 0, successful: 0, failed: 0, averageLatencyMs: 0 });
  const [timeseries, setTimeseries] = useState<Array<{ timestamp: string; requests: number; successful: number; failed: number; average_latency_ms: number }>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [runtimeErrors, setRuntimeErrors] = useState<ErrorDiagnostic[]>([]);

  const hours = timeRange === '1H' ? 1 : timeRange === '6H' ? 6 : timeRange === '7D' ? 168 : 24;

  useEffect(() => {
    let cancelled = false;
    const loadMetrics = async () => {
      setIsLoading(true);
      try {
        const [summary, history, inferenceHistory] = await Promise.all([
          fetchMetrics(model.id, model.currentVersion),
          fetchMetricsTimeseries(model.id, model.currentVersion, hours),
          fetchInferenceHistory(model.id, model.currentVersion, 100),
        ]);
        if (cancelled) return;
        setMetrics({ requests: summary.requests, successful: summary.successful, failed: summary.failed, averageLatencyMs: summary.average_latency_ms });
        setTimeseries(history);
        setRuntimeErrors(mapInferenceErrors(inferenceHistory, model.id, model.currentVersion));
      } catch (error) {
        if (!cancelled) onShowToast(error instanceof Error ? error.message : 'Failed to load monitoring metrics');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void loadMetrics();
    if (autoRefresh) {
      const interval = window.setInterval(() => void loadMetrics(), 10000);
      return () => { cancelled = true; window.clearInterval(interval); };
    }
    return () => { cancelled = true; };
  }, [model.id, model.currentVersion, hours, autoRefresh, onShowToast]);

  const filteredErrors = useMemo(() => errorFilter === 'ALL' ? runtimeErrors : runtimeErrors.filter((err) => err.severity === errorFilter), [runtimeErrors, errorFilter]);
  const latencyMax = Math.max(1, ...timeseries.map((item) => item.average_latency_ms));
  const requestMax = Math.max(1, ...timeseries.map((item) => item.requests));

  const timeLabels = useMemo(() => {
    if (!timeseries.length) return [] as string[];
    const indexes = Array.from(new Set([0, Math.floor((timeseries.length - 1) / 3), Math.floor(((timeseries.length - 1) * 2) / 3), timeseries.length - 1]));
    return indexes.map((index) => new Date(timeseries[index].timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
  }, [timeseries]);

  const chartPoints = useMemo(() => {
    if (!timeseries.length) return { latency: '', requests: '' };
    const left = 40, right = 490, top = 30, bottom = 180, width = right - left, height = bottom - top;
    const makePoints = (values: number[], maxValue: number) => values.map((value, index) => {
      const x = timeseries.length === 1 ? left : left + (index / (timeseries.length - 1)) * width;
      const y = bottom - (value / maxValue) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    return {
      latency: makePoints(timeseries.map((item) => item.average_latency_ms), latencyMax),
      requests: makePoints(timeseries.map((item) => item.requests), requestMax),
    };
  }, [timeseries, latencyMax, requestMax]);

  const handleExportMetrics = () => {
    const report = { model: model.name, version: model.currentVersion, timeRange, generatedAt: new Date().toISOString(), metrics, timeseries };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${model.slug}-metrics-${timeRange}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    onShowToast(`Metrics snapshot downloaded: ${model.slug}-metrics-${timeRange}.json`);
  };

  return (
    <div className="flex flex-col w-full pb-space-12">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-4 py-space-4">
        <div className="flex flex-col gap-space-1">
          <div className="flex items-center gap-space-2 text-on-surface-variant font-label-caps text-label-caps tracking-wider uppercase">
            <button onClick={() => onNavigate('models')} className="hover:text-on-surface transition-colors cursor-pointer">Models</button><span>/</span>
            <button onClick={() => onNavigate('model-detail')} className="hover:text-on-surface transition-colors cursor-pointer">{model.name}</button><span>/</span>
            <span className="text-on-surface font-semibold">Monitoring</span>
          </div>
          <div className="flex items-baseline gap-space-3 mt-space-1">
            <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight font-semibold">Telemetry &amp; Monitoring</h1>
            <span className="font-code-sm text-code-sm text-secondary bg-secondary/10 px-space-2 py-0.5 rounded font-medium">Backend Metrics Connected</span>
          </div>
          <p className="font-body-default text-body-default text-on-surface-variant">Runtime metrics and backend-recorded inference diagnostics for {model.name}.</p>
        </div>
        <div className="flex flex-wrap items-center gap-space-2">
          <div className="flex items-center bg-surface-container-lowest rounded p-0.5 shadow-sm border border-surface-variant/40">
            {(['1H', '6H', '24H', '7D'] as const).map((range) => <button key={range} onClick={() => setTimeRange(range)} className={`px-space-3 py-1 rounded font-code-sm text-code-sm font-medium transition-colors cursor-pointer ${timeRange === range ? 'bg-primary text-on-primary shadow-xs' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'}`}>{range}</button>)}
          </div>
          <button onClick={() => setAutoRefresh((value) => !value)} className="flex items-center gap-1.5 px-space-3 py-1.5 rounded bg-surface-container-lowest text-on-surface hover:bg-surface-container transition-colors font-label-default text-label-default shadow-sm border border-surface-variant/40 cursor-pointer"><span className="material-symbols-outlined text-[15px]">sync</span>{autoRefresh ? 'Auto-Refresh (10s)' : 'Paused'}</button>
          <button onClick={handleExportMetrics} className="flex items-center gap-1.5 px-space-3 py-1.5 rounded bg-surface-container-lowest text-on-surface hover:bg-surface-container transition-colors font-label-default text-label-default shadow-sm border border-surface-variant/40 cursor-pointer"><span className="material-symbols-outlined text-[16px]">download</span><span>Export Metrics</span></button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-space-4 mt-space-2">
        <div className="bg-surface-container-lowest p-space-4 rounded-xl shadow-sm flex flex-col justify-between border border-surface-variant/40"><span className="font-label-caps text-label-caps uppercase text-on-surface-variant">Requests</span><div className="my-space-2 flex items-baseline justify-between"><span className="font-display text-display text-on-surface font-semibold">{metrics.requests.toLocaleString()}</span><span className="font-code-sm text-code-sm text-on-surface-variant">Selected window</span></div></div>
        <div className="bg-surface-container-lowest p-space-4 rounded-xl shadow-sm flex flex-col justify-between border border-surface-variant/40"><span className="font-label-caps text-label-caps uppercase text-on-surface-variant">Average Inference Latency</span><div className="my-space-2 flex items-baseline justify-between"><span className="font-display text-display text-on-surface font-semibold">{isLoading ? '—' : metrics.averageLatencyMs.toFixed(1)}<span className="font-code-sm text-code-sm text-on-surface-variant font-normal">ms</span></span></div><div className="flex items-center justify-between text-on-surface-variant font-code-sm text-code-sm"><span>successful: {metrics.successful}</span><span>·</span><span>failed: {metrics.failed}</span></div></div>
        <div className="bg-surface-container-lowest p-space-4 rounded-xl shadow-sm flex flex-col justify-between border border-surface-variant/40"><span className="font-label-caps text-label-caps uppercase text-on-surface-variant">GPU VRAM Allocation</span><span className="font-display text-display text-on-surface font-semibold">Not exposed</span><span className="font-code-sm text-code-sm text-on-surface-variant">Backend does not report GPU VRAM</span></div>
        <div className="bg-surface-container-lowest p-space-4 rounded-xl shadow-sm flex flex-col justify-between border border-surface-variant/40"><span className="font-label-caps text-label-caps uppercase text-on-surface-variant">Success Rate</span><span className="font-display text-display text-on-surface font-semibold">{metrics.requests ? `${((metrics.successful / metrics.requests) * 100).toFixed(1)}%` : 'N/A'}</span><span className="font-code-sm text-code-sm text-on-surface-variant">Calculated from recorded requests</span></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-space-4 mt-space-4">
        <div className="bg-surface-container-lowest p-space-4 rounded-xl shadow-sm flex flex-col gap-space-3 border border-surface-variant/40">
          <div><h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold">Inference Average Latency (ms)</h2><p className="font-body-sm text-body-sm text-on-surface-variant">Average latency measured from the backend metrics stream.</p></div>
          <div className="w-full h-56 mt-2 relative">
            <svg className="w-full h-full" viewBox="0 0 500 200" preserveAspectRatio="none" aria-label="Inference average latency chart">
              <line x1="40" y1="30" x2="490" y2="30" stroke="#e0e0e0" strokeDasharray="3 3" /><line x1="40" y1="80" x2="490" y2="80" stroke="#e0e0e0" strokeDasharray="3 3" /><line x1="40" y1="130" x2="490" y2="130" stroke="#e0e0e0" strokeDasharray="3 3" /><line x1="40" y1="180" x2="490" y2="180" stroke="#d0d0d0" />
              <text x="32" y="34" textAnchor="end" className="text-[10px] fill-on-surface-variant/70 font-mono">{latencyMax.toFixed(1)}ms</text><text x="32" y="84" textAnchor="end" className="text-[10px] fill-on-surface-variant/70 font-mono">{(latencyMax * 0.67).toFixed(1)}ms</text><text x="32" y="134" textAnchor="end" className="text-[10px] fill-on-surface-variant/70 font-mono">{(latencyMax * 0.33).toFixed(1)}ms</text><text x="32" y="184" textAnchor="end" className="text-[10px] fill-on-surface-variant/70 font-mono">0ms</text>
              <polyline fill="none" stroke="#00629e" strokeWidth="2.5" points={chartPoints.latency} />
            </svg>
            <div className="flex justify-between pl-10 pr-2 pt-1 font-code-sm text-[10px] text-on-surface-variant">
              {timeLabels.map((label, index) => <span key={`latency-${index}-${label}`}>{label}</span>)}
            </div>
          </div>
        </div>

        <div className="bg-surface-container-lowest p-space-4 rounded-xl shadow-sm flex flex-col gap-space-3 border border-surface-variant/40">
          <div><h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold">Inference Request Activity</h2><p className="font-body-sm text-body-sm text-on-surface-variant">Request volume recorded by the backend metrics stream.</p></div>
          <div className="w-full h-56 mt-2 relative">
            <svg className="w-full h-full" viewBox="0 0 500 200" preserveAspectRatio="none" aria-label="Inference request activity chart">
              <line x1="40" y1="30" x2="490" y2="30" stroke="#e0e0e0" strokeDasharray="3 3" /><line x1="40" y1="80" x2="490" y2="80" stroke="#e0e0e0" strokeDasharray="3 3" /><line x1="40" y1="130" x2="490" y2="130" stroke="#e0e0e0" strokeDasharray="3 3" /><line x1="40" y1="180" x2="490" y2="180" stroke="#d0d0d0" />
              <text x="32" y="34" textAnchor="end" className="text-[10px] fill-on-surface-variant/70 font-mono">{requestMax}</text><text x="32" y="84" textAnchor="end" className="text-[10px] fill-on-surface-variant/70 font-mono">{Math.round(requestMax * 0.67)}</text><text x="32" y="134" textAnchor="end" className="text-[10px] fill-on-surface-variant/70 font-mono">{Math.round(requestMax * 0.33)}</text><text x="32" y="184" textAnchor="end" className="text-[10px] fill-on-surface-variant/70 font-mono">0</text>
              <polyline fill="none" stroke="#00629e" strokeWidth="2" points={chartPoints.requests} />
            </svg>
            <div className="flex justify-between pl-10 pr-2 pt-1 font-code-sm text-[10px] text-on-surface-variant">
              {timeLabels.map((label, index) => <span key={`requests-${index}-${label}`}>{label}</span>)}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden flex flex-col mt-space-4 border border-surface-variant/40">
        <div className="p-space-4 bg-surface-container-low flex flex-col sm:flex-row sm:items-center justify-between gap-space-3 border-b border-surface-variant/40">
          <div><h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold">Recent Runtime Exceptions &amp; Diagnostic Logs</h2><p className="font-body-sm text-body-sm text-on-surface-variant">Backend-recorded inference failures for this model version.</p></div>
          <div className="flex items-center gap-1 bg-surface-container-lowest rounded p-1 shadow-xs border border-surface-variant/30">
            {(['ALL', 'ERROR', 'WARNING'] as const).map((filter) => <button key={filter} onClick={() => setErrorFilter(filter)} className={`px-2.5 py-1 rounded font-label-default text-label-default cursor-pointer ${errorFilter === filter ? 'bg-primary text-on-primary font-medium' : 'text-on-surface-variant hover:text-on-surface'}`}>{filter === 'ALL' ? `All Logs (${runtimeErrors.length})` : filter === 'ERROR' ? `Errors Only (${runtimeErrors.filter((err) => err.severity === 'ERROR').length})` : `Warnings Only (${runtimeErrors.filter((err) => err.severity === 'WARNING').length})`}</button>)}
          </div>
        </div>
        <div className="overflow-x-auto w-full"><table className="w-full text-left border-collapse"><thead><tr className="bg-surface-container-low/50 text-on-surface-variant font-label-caps text-label-caps uppercase select-none border-b border-surface-variant/30"><th className="py-2.5 px-4">Timestamp</th><th className="py-2.5 px-4">Severity / Code</th><th className="py-2.5 px-4">Message</th><th className="py-2.5 px-4">Version</th><th className="py-2.5 px-4">Source</th><th className="py-2.5 px-4 text-right">Actions</th></tr></thead><tbody className="divide-y divide-surface-variant/20 font-code-sm text-code-sm">
          {filteredErrors.length === 0 ? <tr><td colSpan={6} className="py-space-6 px-4 text-center text-on-surface-variant">No backend error records for this version.</td></tr> : filteredErrors.map((err) => <tr key={err.id} onClick={() => setSelectedError(err)} className="hover:bg-surface-container-low/60 transition-colors cursor-pointer"><td className="py-2.5 px-4 whitespace-nowrap">{err.timestamp}</td><td className="py-2.5 px-4 whitespace-nowrap"><span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-label-caps text-label-caps bg-error-container text-on-error-container font-semibold"><span className="w-1.5 h-1.5 rounded-full bg-error" />{err.code}</span></td><td className="py-2.5 px-4 text-on-surface font-medium max-w-md truncate">{err.errorMessage}</td><td className="py-2.5 px-4 text-on-surface-variant">{err.version}</td><td className="py-2.5 px-4 text-on-surface-variant">Backend API</td><td className="py-2.5 px-4 text-right"><button onClick={(event) => { event.stopPropagation(); setSelectedError(err); }} className="px-2.5 py-1 rounded bg-surface-container hover:bg-surface-container-high text-on-surface font-label-default text-label-default cursor-pointer">Inspect</button></td></tr>)}
        </tbody></table></div>
      </div>

      {selectedError && <div className="fixed inset-0 z-50 flex items-center justify-center bg-inverse-surface/40 p-4" onClick={() => setSelectedError(null)}><div className="w-full max-w-2xl bg-surface-container-lowest rounded-xl shadow-xl border border-surface-variant overflow-hidden" onClick={(event) => event.stopPropagation()}><div className="flex items-center justify-between px-space-4 py-space-3 border-b border-surface-variant bg-surface-container-low"><span className="font-headline-sm text-headline-sm text-on-surface font-semibold">Diagnostic Incident #{selectedError.id}</span><button onClick={() => setSelectedError(null)} className="p-1 rounded hover:bg-surface-container text-on-surface-variant cursor-pointer"><span className="material-symbols-outlined text-[18px]">close</span></button></div><div className="p-space-4 flex flex-col gap-space-3"><div className="p-space-3 bg-surface-container-low rounded"><span className="font-label-caps uppercase text-on-surface-variant">Error Message</span><p className="font-body-default text-on-surface font-medium mt-1">{selectedError.errorMessage}</p><span className="font-code-sm text-on-surface-variant">Model version: {selectedError.version} · Recorded: {selectedError.timestamp}</span></div><div><span className="font-label-caps uppercase text-on-surface-variant block mb-1">Input Payload</span><pre className="p-space-3 bg-primary-container text-inverse-on-surface rounded font-code-sm text-code-sm overflow-x-auto select-text"><code>{selectedError.payloadSample}</code></pre></div><div className="flex justify-end"><button onClick={() => setSelectedError(null)} className="px-3 py-1.5 rounded bg-primary text-on-primary font-label-default text-label-default cursor-pointer">Dismiss</button></div></div></div></div>}
    </div>
  );
};
