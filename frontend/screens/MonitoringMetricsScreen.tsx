import React, { useEffect, useMemo, useState } from 'react';
import { ModelItem, ScreenType, ErrorDiagnostic } from '../types';
import { fetchInferenceHistory, fetchMetrics, fetchMetricsTimeseries, mapInferenceErrors } from '../lib/model-api';

interface MonitoringMetricsScreenProps {
  model: ModelItem;
  onNavigate: (screen: ScreenType) => void;
  onShowToast: (msg: string) => void;
}

export const MonitoringMetricsScreen: React.FC<MonitoringMetricsScreenProps> = ({
  model,
  onNavigate,
  onShowToast,
}) => {
  const [timeRange, setTimeRange] = useState<'1H' | '6H' | '24H' | '7D'>('24H');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedError, setSelectedError] = useState<ErrorDiagnostic | null>(null);
  const [errorFilter, setErrorFilter] = useState<'ALL' | 'ERROR' | 'WARNING'>('ALL');
  const [metrics, setMetrics] = useState({
    requests: 0,
    successful: 0,
    failed: 0,
    averageLatencyMs: 0,
  });
  const [timeseries, setTimeseries] = useState<
    {
      timestamp: string;
      requests: number;
      successful: number;
      failed: number;
      average_latency_ms: number;
    }[]
  >([]);
  const [isLoading, setIsLoading] = useState(false);
  const [runtimeErrors, setRuntimeErrors] = useState<ErrorDiagnostic[]>([]);

  const hours = timeRange === '1H'
    ? 1
    : timeRange === '6H'
      ? 6
      : timeRange === '7D'
        ? 168
        : 24;

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

        if (!cancelled) {
          setMetrics({
            requests: summary.requests,
            successful: summary.successful,
            failed: summary.failed,
            averageLatencyMs: summary.average_latency_ms,
          });
          setTimeseries(history);
          setRuntimeErrors(mapInferenceErrors(inferenceHistory));
        }
      } catch (error) {
        if (!cancelled) {
          onShowToast(
            error instanceof Error
              ? error.message
              : 'Failed to load monitoring metrics',
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    loadMetrics();

    if (autoRefresh) {
      const interval = window.setInterval(loadMetrics, 10000);
      return () => {
        cancelled = true;
        window.clearInterval(interval);
      };
    }

    return () => {
      cancelled = true;
    };
  }, [model.id, model.currentVersion, hours, autoRefresh, onShowToast]);

  const filteredErrors = useMemo(() => {
    if (errorFilter === 'ALL') {
      return runtimeErrors;
    }

    return runtimeErrors.filter((err) => err.severity === errorFilter);
  }, [runtimeErrors, errorFilter]);

  const chartPoints = useMemo(() => {
    if (!timeseries.length) {
      return { latency: '', requests: '' };
    }

    const left = 40;
    const right = 490;
    const top = 30;
    const bottom = 180;
    const width = right - left;
    const height = bottom - top;

    const maxLatency = Math.max(
      ...timeseries.map((item) => item.average_latency_ms),
      1,
    );

    const maxRequests = Math.max(
      ...timeseries.map((item) => item.requests),
      1,
    );

    const makePoints = (values: number[], maxValue: number) =>
      values
        .map((value, index) => {
          const x =
            timeseries.length === 1
              ? left
              : left + (index / (timeseries.length - 1)) * width;

          const y = bottom - (value / maxValue) * height;

          return `${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(' ');

    return {
      latency: makePoints(
        timeseries.map((item) => item.average_latency_ms),
        maxLatency,
      ),
      requests: makePoints(
        timeseries.map((item) => item.requests),
        maxRequests,
      ),
    };
  }, [timeseries]);

  const handleExportMetrics = () => {
    const report = {
      model: model.name,
      timeRange,
      generatedAt: new Date().toISOString(),
      kpis: {
        requests: timeseries.reduce((sum, item) => sum + item.requests, 0),
        averageLatencyMs:
          timeseries.length > 0
            ? timeseries.reduce(
                (sum, item) => sum + item.average_latency_ms,
                0,
              ) / timeseries.length
            : 0,
        vram: 'Not exposed',
        throughput: 'Not exposed',
        availability: 'Not exposed',
      },
      hardware: model.hardwareBinding,
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${model.slug}-metrics-${timeRange}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    onShowToast(`Metrics snapshot downloaded: ${model.slug}-metrics-${timeRange}.json`);
  };

  return (
    <div className="flex flex-col w-full pb-space-12">
      {/* Sub-Header & Breadcrumbs */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-4 py-space-4">
        <div className="flex flex-col gap-space-1">
          <div className="flex items-center gap-space-2 text-on-surface-variant font-label-caps text-label-caps tracking-wider uppercase">
            <button
              onClick={() => onNavigate('models')}
              className="hover:text-on-surface transition-colors cursor-pointer"
            >
              Models
            </button>
            <span>/</span>
            <button
              onClick={() => onNavigate('model-detail')}
              className="hover:text-on-surface transition-colors cursor-pointer"
            >
              {model.name}
            </button>
            <span>/</span>
            <span className="text-on-surface font-semibold">Monitoring</span>
          </div>

          <div className="flex items-baseline gap-space-3 mt-space-1">
            <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight font-semibold">
              Telemetry &amp; Monitoring
            </h1>
            <span className="font-code-sm text-code-sm text-secondary bg-secondary/10 px-space-2 py-0.5 rounded font-medium">
              Real-time Ingest Active
            </span>
          </div>
          <p className="font-body-default text-body-default text-on-surface-variant">
            Production runtime benchmarks, resource consumption, and error diagnostics for {model.name}.
          </p>
        </div>

        {/* Controls Bar */}
        <div className="flex flex-wrap items-center gap-space-2">
          {/* Time Range Selector */}
          <div className="flex items-center bg-surface-container-lowest rounded p-0.5 shadow-sm border border-surface-variant/40">
            {(['1H', '6H', '24H', '7D'] as const).map((range) => (
              <button
                key={range}
                onClick={() => {
                  setTimeRange(range);
                  onShowToast(`Time window set to ${range}`);
                }}
                className={`px-space-3 py-1 rounded font-code-sm text-code-sm font-medium transition-colors cursor-pointer ${
                  timeRange === range
                    ? 'bg-primary text-on-primary shadow-xs'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
                }`}
              >
                {range}
              </button>
            ))}
          </div>

          {/* Auto Refresh Toggle */}
          <button
            onClick={() => {
              setAutoRefresh(!autoRefresh);
              onShowToast(autoRefresh ? 'Auto-refresh paused' : 'Auto-refresh active (10s)');
            }}
            className="flex items-center gap-1.5 px-space-3 py-1.5 rounded bg-surface-container-lowest text-on-surface hover:bg-surface-container transition-colors font-label-default text-label-default shadow-sm border border-surface-variant/40 cursor-pointer"
          >
            <span
              className={`material-symbols-outlined text-[15px] ${
                autoRefresh ? 'animate-spin text-secondary' : 'text-on-surface-variant'
              }`}
              style={{ animationDuration: '6s' }}
            >
              sync
            </span>
            <span>{autoRefresh ? 'Auto-Refresh (10s)' : 'Paused'}</span>
          </button>

          {/* Export Report */}
          <button
            onClick={handleExportMetrics}
            className="flex items-center gap-1.5 px-space-3 py-1.5 rounded bg-surface-container-lowest text-on-surface hover:bg-surface-container transition-colors font-label-default text-label-default shadow-sm border border-surface-variant/40 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">download</span>
            <span>Export Metrics</span>
          </button>
        </div>
      </div>

      {/* Top 4 KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-space-4 mt-space-2">
        {/* Card 1: Throughput */}
        <div className="bg-surface-container-lowest p-space-4 rounded-xl shadow-sm flex flex-col justify-between border border-surface-variant/40">
          <div className="flex items-center justify-between text-on-surface-variant">
            <span className="font-label-caps text-label-caps uppercase">Throughput (RPS)</span>
            <span className="material-symbols-outlined text-[18px] text-secondary">trending_up</span>
          </div>
          <div className="my-space-2 flex items-baseline justify-between">
            <span className="font-display text-display text-on-surface font-semibold">{metrics.requests}</span>
            <span className="font-code-sm text-code-sm text-on-surface-variant">
              Requests in window
            </span>
          </div>
          <svg className="w-full h-8 text-secondary" preserveAspectRatio="none" viewBox="0 0 100 24">
            <path
              d="M0 20 Q 15 16, 25 18 T 50 10 T 75 14 T 100 6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            />
          </svg>
        </div>

        {/* Card 2: P95 Latency */}
        <div className="bg-surface-container-lowest p-space-4 rounded-xl shadow-sm flex flex-col justify-between border border-surface-variant/40">
          <div className="flex items-center justify-between text-on-surface-variant">
            <span className="font-label-caps text-label-caps uppercase">P95 Inference Latency</span>
            <span className="material-symbols-outlined text-[18px] text-secondary">speed</span>
          </div>
          <div className="my-space-2 flex items-baseline justify-between">
            <span className="font-display text-display text-on-surface font-semibold">
              {isLoading ? '?' : metrics.averageLatencyMs.toFixed(1)}<span className="font-code-sm text-code-sm text-on-surface-variant font-normal">ms</span>
            </span>
            <span className="font-code-sm text-code-sm text-emerald-700 bg-emerald-50 px-1 rounded font-medium">
              Backend average latency
            </span>
          </div>
          <div className="flex items-center justify-between text-on-surface-variant font-code-sm text-code-sm pt-1">
            <span>successful: {metrics.successful}</span>
            <span>Â·</span>
            <span>failed: {metrics.failed}</span>
          </div>
        </div>

        {/* Card 3: GPU VRAM */}
        <div className="bg-surface-container-lowest p-space-4 rounded-xl shadow-sm flex flex-col justify-between border border-surface-variant/40">
          <div className="flex items-center justify-between text-on-surface-variant">
            <span className="font-label-caps text-label-caps uppercase">GPU VRAM Allocation</span>
            <span className="material-symbols-outlined text-[18px]">memory</span>
          </div>
          <div className="my-space-2 flex items-baseline justify-between">
            <span className="font-display text-display text-on-surface font-semibold">
              {model.runtimeTelemetry.vramAllocatedGb.toFixed(1)} <span className="text-body-default font-normal text-on-surface-variant">/ {model.runtimeTelemetry.vramTotalGb.toFixed(1)} GB</span>
            </span>
            <span className="font-code-sm text-code-sm text-on-surface font-medium">
              {model.runtimeTelemetry.vramTotalGb ? `${((model.runtimeTelemetry.vramAllocatedGb / model.runtimeTelemetry.vramTotalGb) * 100).toFixed(1)}% capacity` : 'Not reported'}
            </span>
          </div>
          <div className="w-full bg-surface-container h-2 rounded-full overflow-hidden">
            <div className="bg-secondary h-full rounded-full" style={{ width: '38.7%' }}></div>
          </div>
        </div>

        {/* Card 4: Error Budget */}
        <div className="bg-surface-container-lowest p-space-4 rounded-xl shadow-sm flex flex-col justify-between border border-surface-variant/40">
          <div className="flex items-center justify-between text-on-surface-variant">
            <span className="font-label-caps text-label-caps uppercase">Error Budget Burndown</span>
            <span className="material-symbols-outlined text-[18px] text-emerald-600">verified</span>
          </div>
          <div className="my-space-2 flex items-baseline justify-between">
            <span className="font-display text-display text-emerald-700 font-semibold">{metrics.requests ? `${((metrics.failed / metrics.requests) * 100).toFixed(2)}%` : '0.00%'}</span>
            <span className="font-code-sm text-code-sm text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded font-medium">
              {metrics.requests ? `${((metrics.successful / metrics.requests) * 100).toFixed(2)}% availability` : 'No requests'}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-on-surface-variant font-code-sm text-code-sm">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Normal range (SLA target: 99.9%)</span>
          </div>
        </div>
      </div>

      {/* 2 Primary Deep-Dive Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-space-4 mt-space-4">
        {/* Chart 1: Latency Percentiles */}
        <div className="bg-surface-container-lowest p-space-4 rounded-xl shadow-sm flex flex-col gap-space-3 border border-surface-variant/40">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-2">
            <div>
              <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                Inference Latency Percentiles (ms)
              </h2>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Average inference latency measured from the backend metrics stream.
              </p>
            </div>
            {/* Legend */}
            <div className="flex items-center gap-space-3 font-code-sm text-code-sm">
              <span className="flex items-center gap-1 text-on-surface">
                <span className="w-2.5 h-0.5 bg-primary"></span> Average latency
              </span>
            </div>
          </div>

          {/* SVG Latency Chart */}
          <div className="w-full h-56 mt-2 relative">
            <svg className="w-full h-full" viewBox="0 0 500 200" preserveAspectRatio="none">
              {/* Horizontal Grid lines */}
              <line x1="40" y1="30" x2="490" y2="30" stroke="#e0e0e0" strokeDasharray="3 3" />
              <line x1="40" y1="80" x2="490" y2="80" stroke="#e0e0e0" strokeDasharray="3 3" />
              <line x1="40" y1="130" x2="490" y2="130" stroke="#e0e0e0" strokeDasharray="3 3" />
              <line x1="40" y1="180" x2="490" y2="180" stroke="#d0d0d0" />

              {/* Y Axis Labels */}
              <text x="32" y="34" textAnchor="end" className="text-[10px] fill-on-surface-variant/70 font-mono">100ms</text>
              <text x="32" y="84" textAnchor="end" className="text-[10px] fill-on-surface-variant/70 font-mono">50ms</text>
              <text x="32" y="134" textAnchor="end" className="text-[10px] fill-on-surface-variant/70 font-mono">25ms</text>
              <text x="32" y="184" textAnchor="end" className="text-[10px] fill-on-surface-variant/70 font-mono">0ms</text>

              {/* p99 Line (Red/coral dashed) */}
              <polyline
                fill="none"
                stroke="#ba1a1a"
                strokeWidth="1.5"
                strokeDasharray="4 3"
                points={chartPoints.latency}
              />

              {/* p95 Line (Secondary Blue solid) */}
              <polyline
                fill="none"
                stroke="#00629e"
                strokeWidth="2.5"
                points={chartPoints.latency}
              />

              {/* p50 Line (Dark blue solid) */}
              <polyline
                fill="none"
                stroke="#1b1c1d"
                strokeWidth="1.5"
                points={chartPoints.latency}
              />
            </svg>

            {/* X Axis Timestamps */}
            <div className="flex justify-between pl-10 pr-2 pt-1 font-code-sm text-[10px] text-on-surface-variant">
              <span>00:00</span>
              <span>04:00</span>
              <span>08:00</span>
              <span>12:00</span>
              <span>16:00</span>
              <span>20:00</span>
              <span>Now</span>
            </div>
          </div>
        </div>

        {/* Chart 2: Hardware Resource Utilization */}
        <div className="bg-surface-container-lowest p-space-4 rounded-xl shadow-sm flex flex-col gap-space-3 border border-surface-variant/40">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-2">
            <div>
              <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                Hardware Resource Utilization
              </h2>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Inference request volume recorded by the backend metrics stream.
              </p>
            </div>
            {/* Legend */}
            <div className="flex items-center gap-space-3 font-code-sm text-code-sm">
              <span className="flex items-center gap-1 text-on-surface font-medium">
                <span className="w-2.5 h-2.5 rounded-sm bg-secondary/30 border border-secondary"></span> Requests
              </span>
              <span className="flex items-center gap-1 text-on-surface-variant">

              </span>
            </div>
          </div>

          {/* SVG Hardware Utilization Chart */}
          <div className="w-full h-56 mt-2 relative">
            <svg className="w-full h-full" viewBox="0 0 500 200" preserveAspectRatio="none">
              {/* Horizontal Grid lines */}
              <line x1="40" y1="30" x2="490" y2="30" stroke="#e0e0e0" strokeDasharray="3 3" />
              <line x1="40" y1="80" x2="490" y2="80" stroke="#e0e0e0" strokeDasharray="3 3" />
              <line x1="40" y1="130" x2="490" y2="130" stroke="#e0e0e0" strokeDasharray="3 3" />
              <line x1="40" y1="180" x2="490" y2="180" stroke="#d0d0d0" />

              {/* Y Axis Labels */}
              <text x="32" y="34" textAnchor="end" className="text-[10px] fill-on-surface-variant/70 font-mono">100%</text>
              <text x="32" y="84" textAnchor="end" className="text-[10px] fill-on-surface-variant/70 font-mono">75%</text>
              <text x="32" y="134" textAnchor="end" className="text-[10px] fill-on-surface-variant/70 font-mono">50%</text>
              <text x="32" y="184" textAnchor="end" className="text-[10px] fill-on-surface-variant/70 font-mono">0%</text>

              {/* GPU Area Polygon */}
              <polygon
                fill="#00629e"
                fillOpacity="0.12"
                points="40,180 40,140 85,125 130,135 175,110 220,118 265,90 310,105 355,80 400,95 445,75 490,82 490,180"
              />
              <polyline
                fill="none"
                stroke="#00629e"
                strokeWidth="2"
                points={chartPoints.requests}
              />

              {/* CPU Line */}
              <polyline
                fill="none"
                stroke="#75777a"
                strokeWidth="1.5"
                points={chartPoints.requests}
              />
            </svg>

            {/* X Axis Timestamps */}
            <div className="flex justify-between pl-10 pr-2 pt-1 font-code-sm text-[10px] text-on-surface-variant">
              <span>00:00</span>
              <span>04:00</span>
              <span>08:00</span>
              <span>12:00</span>
              <span>16:00</span>
              <span>20:00</span>
              <span>Now</span>
            </div>
          </div>
        </div>
      </div>

      {/* Lower Diagnostic Logs & Error Analysis Table */}
      <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden flex flex-col mt-space-4 border border-surface-variant/40">
        <div className="p-space-4 bg-surface-container-low flex flex-col sm:flex-row sm:items-center justify-between gap-space-3 border-b border-surface-variant/40">
          <div>
            <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold">
              Recent Runtime Exceptions &amp; Diagnostic Logs
            </h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Uncaught payload errors, schema validation rejections, and runtime timeouts.
            </p>
          </div>

          <div className="flex items-center gap-1 bg-surface-container-lowest rounded p-1 shadow-xs border border-surface-variant/30">
            <button
              onClick={() => setErrorFilter('ALL')}
              className={`px-2.5 py-1 rounded font-label-default text-label-default cursor-pointer ${
                errorFilter === 'ALL'
                  ? 'bg-primary text-on-primary font-medium'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              All Logs ({filteredErrors.length})
            </button>
            <button
              onClick={() => setErrorFilter('ERROR')}
              className={`px-2.5 py-1 rounded font-label-default text-label-default cursor-pointer ${
                errorFilter === 'ERROR'
                  ? 'bg-primary text-on-primary font-medium'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Errors Only ({runtimeErrors.filter((err) => err.severity === 'ERROR').length})
            </button>
            <button
              onClick={() => setErrorFilter('WARNING')}
              className={`px-2.5 py-1 rounded font-label-default text-label-default cursor-pointer ${
                errorFilter === 'WARNING'
                  ? 'bg-primary text-on-primary font-medium'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Warnings Only ({runtimeErrors.filter((err) => err.severity === 'WARNING').length})
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low/50 text-on-surface-variant font-label-caps text-label-caps uppercase select-none border-b border-surface-variant/30">
                <th className="py-2.5 px-4 font-medium tracking-wider">Timestamp</th>
                <th className="py-2.5 px-4 font-medium tracking-wider">Severity / Code</th>
                <th className="py-2.5 px-4 font-medium tracking-wider">Message</th>
                <th className="py-2.5 px-4 font-medium tracking-wider">Version</th>
                <th className="py-2.5 px-4 font-medium tracking-wider">Worker Thread</th>
                <th className="py-2.5 px-4 font-medium tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-variant/20 font-code-sm text-code-sm">
              {filteredErrors.map((err) => (
                <tr
                  key={err.id}
                  onClick={() => setSelectedError(err)}
                  className="hover:bg-surface-container-low/60 transition-colors cursor-pointer"
                >
                  <td className="py-2.5 px-4 text-on-surface whitespace-nowrap">{err.timestamp}</td>
                  <td className="py-2.5 px-4 whitespace-nowrap">
                    {err.severity === 'ERROR' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-label-caps text-label-caps bg-error-container text-on-error-container font-semibold">
                        <span className="w-1.5 h-1.5 rounded-full bg-error"></span>
                        {err.code}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-label-caps text-label-caps bg-amber-100 text-amber-900 font-semibold">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-600"></span>
                        {err.code}
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-4 text-on-surface font-medium max-w-md truncate">
                    {err.errorMessage}
                  </td>
                  <td className="py-2.5 px-4 text-on-surface-variant">{err.version}</td>
                  <td className="py-2.5 px-4 text-on-surface-variant">{err.workerThread}</td>
                  <td className="py-2.5 px-4 text-right whitespace-nowrap">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedError(err);
                      }}
                      className="px-2.5 py-1 rounded bg-surface-container hover:bg-surface-container-high text-on-surface font-label-default text-label-default transition-colors cursor-pointer"
                    >
                      Inspect Stack
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Error Details Modal */}
      {selectedError && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-inverse-surface/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-2xl bg-surface-container-lowest rounded-xl shadow-xl border border-surface-variant overflow-hidden">
            <div className="flex items-center justify-between px-space-4 py-space-3 border-b border-surface-variant bg-surface-container-low">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-error">error</span>
                <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                  Diagnostic Incident #{selectedError.id}: {selectedError.code}
                </span>
              </div>
              <button
                onClick={() => setSelectedError(null)}
                className="p-1 rounded hover:bg-surface-container text-on-surface-variant"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <div className="p-space-4 flex flex-col gap-space-3">
              <div className="p-space-3 bg-surface-container-low rounded flex flex-col gap-1">
                <span className="font-label-caps uppercase text-on-surface-variant">Error Message</span>
                <span className="font-body-default text-on-surface font-medium">{selectedError.errorMessage}</span>
                <span className="font-code-sm text-on-surface-variant mt-1">
                  Worker: {selectedError.workerThread} Â· Model: {selectedError.version} Â· Recorded: {selectedError.timestamp}
                </span>
              </div>

              <div>
                <span className="font-label-caps uppercase text-on-surface-variant block mb-1">
                  Traceback &amp; Python Stack
                </span>
                <pre className="p-space-3 bg-primary-container text-inverse-on-surface rounded font-code-sm text-code-sm overflow-x-auto leading-5 select-text">
                  <code>{selectedError.stackTrace}</code>
                </pre>
              </div>

              <div>
                <span className="font-label-caps uppercase text-on-surface-variant block mb-1">
                  Corrupted Input Payload
                </span>
                <pre className="p-space-3 bg-primary-container text-inverse-on-surface rounded font-code-sm text-code-sm overflow-x-auto select-text">
                  <code>{selectedError.payloadSample}</code>
                </pre>
              </div>

              <div className="pt-space-2 border-t border-surface-variant flex items-center justify-between">
                <span className="font-code-sm text-on-surface-variant">
                  Remediation: Adjust client preprocessing to emit non-empty lag series.
                </span>
                <button
                  onClick={() => setSelectedError(null)}
                  className="px-3 py-1.5 rounded bg-primary text-on-primary font-label-default text-label-default cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

