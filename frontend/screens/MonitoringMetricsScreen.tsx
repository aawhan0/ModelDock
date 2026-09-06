import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchInferenceHistory,
  fetchMetricsTimeseries,
  mapInferenceErrors,
  MetricsTimeseriesItem,
} from '../lib/model-api';
import { ModelItem, ScreenType, ErrorDiagnostic } from '../types';

interface MonitoringMetricsScreenProps {
  model: ModelItem;
  onNavigate: (screen: ScreenType, modelId?: string) => void;
  onShowToast: (msg: string) => void;
}

interface TelemetryChartProps {
  data: MetricsTimeseriesItem[];
  metric: 'latency' | 'requests';
  hours: number;
}

const CHART_WIDTH = 760;
const CHART_HEIGHT = 330;
const PLOT_LEFT = 58;
const PLOT_RIGHT = 744;
const PLOT_TOP = 18;
const PLOT_BOTTOM = 260;

function niceStep(roughStep: number): number {
  if (!Number.isFinite(roughStep) || roughStep <= 0) return 1;

  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalized = roughStep / magnitude;
  const niceNormalized =
    normalized <= 1 ? 1 :
    normalized <= 2 ? 2 :
    normalized <= 5 ? 5 : 10;

  return niceNormalized * magnitude;
}

function formatChartValue(value: number, metric: TelemetryChartProps['metric']): string {
  if (metric === 'requests') return Math.round(value).toLocaleString();
  return value.toFixed(value >= 100 ? 0 : 1) + ' ms';
}

function formatAxisValue(value: number, metric: TelemetryChartProps['metric']): string {
  if (metric === 'requests') return Math.round(value).toLocaleString();
  return value.toFixed(value >= 100 ? 0 : 1);
}

function formatBucketLabel(timestamp: string, hours: number): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '—';

  if (hours <= 6) {
    return date.toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  if (hours <= 24) {
    return date.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  });
}

function formatTooltipTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return 'Unknown time';

  return date.toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const TelemetryChart: React.FC<TelemetryChartProps> = ({ data, metric, hours }) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const chartData = useMemo(
    () =>
      data
        .filter(
          (item) =>
            Number.isFinite(item.requests) &&
            Number.isFinite(item.average_latency_ms) &&
            !Number.isNaN(new Date(item.timestamp).getTime()),
        )
        .sort(
          (a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
        ),
    [data],
  );

  const values = chartData.map((item) =>
    metric === 'latency' ? item.average_latency_ms : item.requests,
  );

  const observedMax = Math.max(0, ...values);
  const step = niceStep(observedMax / 4);
  const yMax = Math.max(step * 4, step);
  const plotWidth = PLOT_RIGHT - PLOT_LEFT;
  const plotHeight = PLOT_BOTTOM - PLOT_TOP;

  const points = chartData.map((item, index) => {
    const value = metric === 'latency' ? item.average_latency_ms : item.requests;
    const x =
      chartData.length === 1
        ? PLOT_LEFT + plotWidth / 2
        : PLOT_LEFT + (index / (chartData.length - 1)) * plotWidth;
    const y = PLOT_BOTTOM - (value / yMax) * plotHeight;
    return { x, y, value, item };
  });

  const pointString = points
    .map((point) => point.x.toFixed(1) + ',' + point.y.toFixed(1))
    .join(' ');

  const areaString =
    points.length > 0
      ? PLOT_LEFT + ',' + PLOT_BOTTOM + ' ' + pointString + ' ' + PLOT_RIGHT + ',' + PLOT_BOTTOM
      : '';

  const tickIndexes = useMemo(() => {
    if (!chartData.length) return [] as number[];
    const count = Math.min(6, chartData.length);
    if (count === 1) return [0];

    const indexes = Array.from({ length: count }, (_, index) =>
      Math.round((index * (chartData.length - 1)) / (count - 1)),
    );

    return [...new Set(indexes)];
  }, [chartData.length]);

  const latestActive = [...points].reverse().find((point) => point.value > 0);
  const peak = points.reduce(
    (current, point) => (point.value > current ? point.value : current),
    0,
  );
  const average =
    values.length > 0
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : 0;

  return (
    <div className="flex flex-col gap-space-3">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-space-2">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold">
              {metric === 'latency' ? 'Inference Average Latency' : 'Inference Request Activity'}
            </h2>
            <span className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-secondary/10 text-secondary font-label-caps text-label-caps uppercase">
              hourly
            </span>
          </div>
          <p className="mt-0.5 font-body-sm text-body-sm text-on-surface-variant">
            {metric === 'latency'
              ? 'Average inference latency per backend hour bucket.'
              : 'Inference request volume per backend hour bucket.'}
          </p>
        </div>

        <div className="flex items-center gap-space-3 font-code-sm text-code-sm text-on-surface-variant">
          <span>
            Latest{' '}
            <strong className="text-on-surface font-medium">
              {latestActive ? formatChartValue(latestActive.value, metric) : '—'}
            </strong>
          </span>
          <span>·</span>
          <span>
            Peak{' '}
            <strong className="text-on-surface font-medium">
              {formatChartValue(peak, metric)}
            </strong>
          </span>
          <span className="hidden md:inline">
            · Avg{' '}
            <strong className="text-on-surface font-medium">
              {formatChartValue(average, metric)}
            </strong>
          </span>
        </div>
      </div>

      {chartData.length === 0 ? (
        <div className="h-80 rounded-lg border border-dashed border-surface-variant bg-surface-container-low/40 flex items-center justify-center text-center px-6">
          <div>
            <span className="material-symbols-outlined text-[24px] text-on-surface-variant">
              monitoring
            </span>
            <p className="mt-2 font-body-default text-body-default text-on-surface">
              No telemetry recorded for this model version in this window.
            </p>
            <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
              Run an inference request to populate the chart.
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-lg bg-surface-container-low/45 border border-surface-variant/40 overflow-hidden">
          <div className="px-2 sm:px-3 pt-2">
            <svg
              className="w-full h-[300px]"
              viewBox={'0 0 ' + CHART_WIDTH + ' ' + CHART_HEIGHT}
              preserveAspectRatio="none"
              role="img"
              aria-label={
                metric === 'latency'
                  ? 'Inference average latency over time'
                  : 'Inference request activity over time'
              }
            >
              <defs>
                <linearGradient id={'chart-fill-' + metric} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" className="text-secondary" stopColor="currentColor" stopOpacity="0.18" />
                  <stop offset="100%" className="text-secondary" stopColor="currentColor" stopOpacity="0" />
                </linearGradient>
              </defs>

              {Array.from({ length: 5 }, (_, index) => {
                const value = yMax - step * index;
                const y = PLOT_TOP + (plotHeight / 4) * index;

                return (
                  <g key={'grid-' + index}>
                    <line
                      x1={PLOT_LEFT}
                      y1={y}
                      x2={PLOT_RIGHT}
                      y2={y}
                      className="stroke-surface-variant"
                      strokeDasharray={index === 4 ? undefined : '4 5'}
                      strokeWidth="1"
                    />
                    <text
                      x={PLOT_LEFT - 10}
                      y={y + 4}
                      textAnchor="end"
                      className="fill-on-surface-variant font-mono text-[10px]"
                    >
                      {formatAxisValue(value, metric)}
                    </text>
                  </g>
                );
              })}

              <line
                x1={PLOT_LEFT}
                y1={PLOT_BOTTOM}
                x2={PLOT_RIGHT}
                y2={PLOT_BOTTOM}
                className="stroke-outline-variant"
                strokeWidth="1"
              />

              {areaString && (
                <polygon
                  points={areaString}
                  fill={'url(#chart-fill-' + metric + ')'}
                />
              )}

              {pointString && (
                <polyline
                  fill="none"
                  points={pointString}
                  className="stroke-secondary"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {points.map((point, index) => (
                <g key={'point-' + index}>
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={hoveredIndex === index ? 5.5 : 3.5}
                    className="fill-surface-container-lowest stroke-secondary"
                    strokeWidth={hoveredIndex === index ? 3 : 2}
                    tabIndex={0}
                    role="button"
                    aria-label={
                      formatTooltipTimestamp(point.item.timestamp) +
                      ': ' +
                      formatChartValue(point.value, metric)
                    }
                    onMouseEnter={() => setHoveredIndex(index)}
                    onMouseLeave={() => setHoveredIndex(null)}
                    onFocus={() => setHoveredIndex(index)}
                    onBlur={() => setHoveredIndex(null)}
                  >
                    <title>
                      {formatTooltipTimestamp(point.item.timestamp) +
                        ' · ' +
                        formatChartValue(point.value, metric)}
                    </title>
                  </circle>
                </g>
              ))}

              {hoveredIndex !== null && points[hoveredIndex] && (() => {
                const point = points[hoveredIndex];
                const tooltipWidth = 202;
                const tooltipHeight = 70;
                const tooltipX = Math.min(
                  Math.max(point.x - tooltipWidth / 2, PLOT_LEFT),
                  PLOT_RIGHT - tooltipWidth,
                );
                const tooltipY =
                  point.y < PLOT_TOP + tooltipHeight + 8
                    ? point.y + 12
                    : point.y - tooltipHeight - 12;

                return (
                  <g pointerEvents="none">
                    <line
                      x1={point.x}
                      y1={PLOT_TOP}
                      x2={point.x}
                      y2={PLOT_BOTTOM}
                      className="stroke-secondary/25"
                      strokeDasharray="3 4"
                    />
                    <rect
                      x={tooltipX}
                      y={tooltipY}
                      width={tooltipWidth}
                      height={tooltipHeight}
                      rx="8"
                      className="fill-surface-container-lowest stroke-surface-variant"
                      strokeWidth="1"
                    />
                    <text
                      x={tooltipX + 12}
                      y={tooltipY + 19}
                      className="fill-on-surface font-mono text-[10px] font-semibold"
                    >
                      {formatTooltipTimestamp(point.item.timestamp)}
                    </text>
                    <text
                      x={tooltipX + 12}
                      y={tooltipY + 38}
                      className="fill-on-surface-variant font-mono text-[10px]"
                    >
                      {metric === 'latency'
                        ? 'Average latency: '
                        : 'Requests: '}
                      <tspan className="fill-on-surface font-semibold">
                        {formatChartValue(point.value, metric)}
                      </tspan>
                    </text>
                    {metric === 'requests' && (
                      <text
                        x={tooltipX + 12}
                        y={tooltipY + 56}
                        className="fill-on-surface-variant font-mono text-[10px]"
                      >
                        Successful {point.item.successful} · Failed {point.item.failed}
                      </text>
                    )}
                  </g>
                );
              })()}

              {tickIndexes.map((index) => {
                const point = points[index];
                return (
                  <text
                    key={'x-label-' + index}
                    x={point.x}
                    y={PLOT_BOTTOM + 25}
                    textAnchor={
                      index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'
                    }
                    className="fill-on-surface-variant font-mono text-[10px]"
                  >
                    {formatBucketLabel(point.item.timestamp, hours)}
                  </text>
                );
              })}
            </svg>
          </div>

          <div className="flex items-center justify-between border-t border-surface-variant/30 px-3 py-2 font-code-sm text-code-sm text-on-surface-variant">
            <span>{chartData.length} hourly buckets</span>
            <span className="hidden sm:inline">Hover or focus a point for details</span>
          </div>
        </div>
      )}
    </div>
  );
};

function summarizeWindow(data: MetricsTimeseriesItem[]) {
  const requests = data.reduce((sum, item) => sum + item.requests, 0);
  const successful = data.reduce((sum, item) => sum + item.successful, 0);
  const failed = data.reduce((sum, item) => sum + item.failed, 0);
  const totalLatency = data.reduce(
    (sum, item) => sum + item.average_latency_ms * item.requests,
    0,
  );

  return {
    requests,
    successful,
    failed,
    averageLatencyMs: requests ? totalLatency / requests : 0,
  };
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
  const [runtimeErrors, setRuntimeErrors] = useState<ErrorDiagnostic[]>([]);
  const [metrics, setMetrics] = useState({
    requests: 0,
    successful: 0,
    failed: 0,
    averageLatencyMs: 0,
  });
  const [timeseries, setTimeseries] = useState<MetricsTimeseriesItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const refreshInFlightRef = useRef(false);
  const hours = timeRange === '1H' ? 1 : timeRange === '6H' ? 6 : timeRange === '7D' ? 168 : 24;

  const refreshMetrics = useCallback(
    async (mode: 'initial' | 'background' | 'manual') => {
      if (refreshInFlightRef.current) return;

      refreshInFlightRef.current = true;
      if (mode === 'initial') {
        setIsLoading(true);
      } else {
        setIsRefreshing(true);
      }

      try {
        const [history, inferenceHistory] = await Promise.all([
          fetchMetricsTimeseries(model.id, model.currentVersion, hours),
          fetchInferenceHistory(model.id, model.currentVersion, 100),
        ]);

        setTimeseries(history);
        setMetrics(summarizeWindow(history));
        setRuntimeErrors(mapInferenceErrors(inferenceHistory, model.id, model.currentVersion));
        setLastUpdated(new Date());
      } catch (error) {
        if (mode !== 'background') {
          onShowToast(
            error instanceof Error
              ? error.message
              : 'Failed to refresh monitoring metrics',
          );
        }
      } finally {
        refreshInFlightRef.current = false;
        if (mode === 'initial') {
          setIsLoading(false);
        } else {
          setIsRefreshing(false);
        }
      }
    },
    [hours, model.currentVersion, model.id, onShowToast],
  );

  useEffect(() => {
    void refreshMetrics('initial');
  }, [refreshMetrics]);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = window.setInterval(() => {
      void refreshMetrics('background');
    }, 10000);

    return () => window.clearInterval(interval);
  }, [autoRefresh, refreshMetrics]);

  const handleAutoRefreshToggle = () => {
    const next = !autoRefresh;
    setAutoRefresh(next);
    if (next) {
      void refreshMetrics('manual');
    }
  };

  const filteredErrors = useMemo(
    () =>
      errorFilter === 'ALL'
        ? runtimeErrors
        : runtimeErrors.filter((err) => err.severity === errorFilter),
    [runtimeErrors, errorFilter],
  );

  const formatLastUpdated = (value: Date | null) => {
    if (!value) return 'Waiting for first refresh';
    return value.toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const handleExportMetrics = () => {
    const report = {
      model: model.name,
      version: model.currentVersion,
      timeRange,
      generatedAt: new Date().toISOString(),
      metrics,
      timeseries,
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = model.slug + '-metrics-' + timeRange + '.json';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    onShowToast(
      'Metrics snapshot downloaded: ' +
        model.slug +
        '-metrics-' +
        timeRange +
        '.json',
    );
  };

  return (
    <div className="flex flex-col w-full pb-space-12">
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-space-4 py-space-4">
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
              onClick={() => onNavigate('model-detail', model.id)}
              className="hover:text-on-surface transition-colors cursor-pointer"
            >
              {model.name}
            </button>
            <span>/</span>
            <span className="text-on-surface font-semibold">Monitoring</span>
          </div>

          <div className="flex flex-wrap items-center gap-space-3 mt-space-1">
            <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight font-semibold">
              Telemetry &amp; Monitoring
            </h1>
            <span className="font-code-sm text-code-sm text-secondary bg-secondary/10 px-space-2 py-0.5 rounded font-medium">
              Backend Metrics Connected
            </span>
          </div>

          <p className="font-body-default text-body-default text-on-surface-variant">
            Runtime metrics and backend-recorded inference diagnostics for {model.name}.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-space-2">
          <div className="flex items-center bg-surface-container-lowest rounded-lg p-0.5 shadow-sm border border-surface-variant/40">
            {(['1H', '6H', '24H', '7D'] as const).map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                aria-pressed={timeRange === range}
                className={
                  'px-space-3 py-1.5 rounded-md font-code-sm text-code-sm font-medium transition-colors cursor-pointer ' +
                  (timeRange === range
                    ? 'bg-primary text-on-primary shadow-xs'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container')
                }
              >
                {range}
              </button>
            ))}
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={autoRefresh}
            aria-label="Toggle automatic monitoring refresh"
            onClick={handleAutoRefreshToggle}
            className={
              'group inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border shadow-sm transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary/40 ' +
              (autoRefresh
                ? 'bg-primary text-on-primary border-primary'
                : 'bg-surface-container-lowest text-on-surface border-surface-variant/40 hover:bg-surface-container')
            }
            title={
              autoRefresh
                ? 'Auto refresh is on — updating every 10 seconds'
                : 'Auto refresh is off — click to enable'
            }
          >
            <span
              className={
                'material-symbols-outlined text-[16px] transition-transform ' +
                (autoRefresh ? 'auto-refresh-spin' : '')
              }
              aria-hidden="true"
            >
              sync
            </span>
            <span className="font-label-default text-label-default">Auto refresh</span>
            <span
              className={
                'font-code-sm text-code-sm ' +
                (autoRefresh ? 'text-on-primary/75' : 'text-on-surface-variant')
              }
            >
              {autoRefresh ? '10s' : 'Off'}
            </span>
            <span
              className={
                'w-1.5 h-1.5 rounded-full ' +
                (autoRefresh ? 'bg-secondary-fixed animate-pulse' : 'bg-outline')
              }
              aria-hidden="true"
            />
          </button>

          <button
            onClick={() => void refreshMetrics('manual')}
            disabled={isRefreshing || isLoading}
            className="flex items-center gap-1.5 px-space-3 py-1.5 rounded-lg bg-surface-container-lowest text-on-surface hover:bg-surface-container transition-colors font-label-default text-label-default shadow-sm border border-surface-variant/40 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            title="Refresh monitoring data now"
          >
            <span
              className={
                'material-symbols-outlined text-[16px] ' +
                (isRefreshing ? 'animate-spin' : '')
              }
            >
              refresh
            </span>
            <span>{isRefreshing ? 'Refreshing…' : 'Refresh'}</span>
          </button>

          <button
            onClick={handleExportMetrics}
            className="flex items-center gap-1.5 px-space-3 py-1.5 rounded-lg bg-surface-container-lowest text-on-surface hover:bg-surface-container transition-colors font-label-default text-label-default shadow-sm border border-surface-variant/40 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">download</span>
            <span>Export Metrics</span>
          </button>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 min-h-5 -mt-1 mb-space-3 font-code-sm text-code-sm text-on-surface-variant">
        <span className={isRefreshing ? 'text-secondary' : ''}>
          {isRefreshing
            ? 'Updating backend metrics…'
            : 'Last updated ' + formatLastUpdated(lastUpdated)}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-space-4">
        <div className="bg-surface-container-lowest p-space-4 rounded-xl shadow-sm flex flex-col justify-between border border-surface-variant/40 min-h-32">
          <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">Requests</span>
          <div className="my-space-2 flex items-baseline justify-between gap-3">
            <span className="font-display text-display text-on-surface font-semibold">
              {metrics.requests.toLocaleString()}
            </span>
            <span className="font-code-sm text-code-sm text-on-surface-variant">Selected window</span>
          </div>
        </div>

        <div className="bg-surface-container-lowest p-space-4 rounded-xl shadow-sm flex flex-col justify-between border border-surface-variant/40 min-h-32">
          <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">
            Average Inference Latency
          </span>
          <div className="my-space-2 flex items-baseline justify-between">
            <span className="font-display text-display text-on-surface font-semibold">
              {isLoading ? '—' : metrics.averageLatencyMs.toFixed(1)}
              <span className="font-code-sm text-code-sm text-on-surface-variant font-normal"> ms</span>
            </span>
          </div>
          <div className="flex items-center justify-between text-on-surface-variant font-code-sm text-code-sm">
            <span>successful: {metrics.successful}</span>
            <span>·</span>
            <span>failed: {metrics.failed}</span>
          </div>
        </div>

        <div className="bg-surface-container-lowest p-space-4 rounded-xl shadow-sm flex flex-col justify-between border border-surface-variant/40 min-h-32">
          <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">
            GPU VRAM Allocation
          </span>
          <span className="font-display text-display text-on-surface font-semibold">Not exposed</span>
          <span className="font-code-sm text-code-sm text-on-surface-variant">
            Backend does not report GPU VRAM
          </span>
        </div>

        <div className="bg-surface-container-lowest p-space-4 rounded-xl shadow-sm flex flex-col justify-between border border-surface-variant/40 min-h-32">
          <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">
            Success Rate
          </span>
          <span className="font-display text-display text-on-surface font-semibold">
            {metrics.requests
              ? ((metrics.successful / metrics.requests) * 100).toFixed(1) + '%'
              : 'N/A'}
          </span>
          <span className="font-code-sm text-code-sm text-on-surface-variant">
            Calculated from selected window
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-space-4 mt-space-4">
        <div className="bg-surface-container-lowest p-space-4 sm:p-space-5 rounded-xl shadow-sm border border-surface-variant/40">
          <TelemetryChart data={timeseries} metric="latency" hours={hours} />
        </div>

        <div className="bg-surface-container-lowest p-space-4 sm:p-space-5 rounded-xl shadow-sm border border-surface-variant/40">
          <TelemetryChart data={timeseries} metric="requests" hours={hours} />
        </div>
      </div>

      <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden flex flex-col mt-space-4 border border-surface-variant/40">
        <div className="p-space-4 bg-surface-container-low flex flex-col sm:flex-row sm:items-center justify-between gap-space-3 border-b border-surface-variant/40">
          <div>
            <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold">
              Recent Runtime Exceptions &amp; Diagnostic Logs
            </h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Backend-recorded inference failures for this model version.
            </p>
          </div>

          <div className="flex items-center gap-1 bg-surface-container-lowest rounded p-1 shadow-xs border border-surface-variant/30">
            {(['ALL', 'ERROR', 'WARNING'] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setErrorFilter(filter)}
                aria-pressed={errorFilter === filter}
                className={
                  'px-2.5 py-1 rounded font-label-default text-label-default cursor-pointer ' +
                  (errorFilter === filter
                    ? 'bg-primary text-on-primary font-medium'
                    : 'text-on-surface-variant hover:text-on-surface')
                }
              >
                {filter === 'ALL'
                  ? 'All Logs (' + runtimeErrors.length + ')'
                  : filter === 'ERROR'
                    ? 'Errors Only (' +
                      runtimeErrors.filter((err) => err.severity === 'ERROR').length +
                      ')'
                    : 'Warnings Only (' +
                      runtimeErrors.filter((err) => err.severity === 'WARNING').length +
                      ')'}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto w-full">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low/50 text-on-surface-variant font-label-caps text-label-caps uppercase select-none border-b border-surface-variant/30">
                <th className="py-2.5 px-4">Timestamp</th>
                <th className="py-2.5 px-4">Severity / Code</th>
                <th className="py-2.5 px-4">Message</th>
                <th className="py-2.5 px-4">Version</th>
                <th className="py-2.5 px-4">Source</th>
                <th className="py-2.5 px-4 text-right">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-surface-variant/20 font-code-sm text-code-sm">
              {filteredErrors.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-space-6 px-4 text-center text-on-surface-variant">
                    No backend error records for this version.
                  </td>
                </tr>
              ) : (
                filteredErrors.map((err) => (
                  <tr
                    key={err.id}
                    onClick={() => setSelectedError(err)}
                    className="hover:bg-surface-container-low/60 transition-colors cursor-pointer"
                  >
                    <td className="py-2.5 px-4 whitespace-nowrap">{err.timestamp}</td>
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-label-caps text-label-caps bg-error-container text-on-error-container font-semibold">
                        <span className="w-1.5 h-1.5 rounded-full bg-error" />
                        {err.code}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-on-surface font-medium max-w-md truncate">
                      {err.errorMessage}
                    </td>
                    <td className="py-2.5 px-4 text-on-surface-variant">{err.version}</td>
                    <td className="py-2.5 px-4 text-on-surface-variant">Backend API</td>
                    <td className="py-2.5 px-4 text-right">
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedError(err);
                        }}
                        className="px-2.5 py-1 rounded bg-surface-container hover:bg-surface-container-high text-on-surface font-label-default text-label-default cursor-pointer"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedError && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-inverse-surface/40 p-4"
          onClick={() => setSelectedError(null)}
        >
          <div
            className="w-full max-w-2xl bg-surface-container-lowest rounded-xl shadow-xl border border-surface-variant overflow-hidden"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between px-space-4 py-space-3 border-b border-surface-variant bg-surface-container-low">
              <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                Diagnostic Incident #{selectedError.id}
              </span>
              <button
                onClick={() => setSelectedError(null)}
                className="p-1 rounded hover:bg-surface-container text-on-surface-variant cursor-pointer"
                aria-label="Close diagnostic incident"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <div className="p-space-4 flex flex-col gap-space-3">
              <div className="p-space-3 bg-surface-container-low rounded">
                <span className="font-label-caps uppercase text-on-surface-variant">Error Message</span>
                <p className="font-body-default text-body-default text-on-surface font-medium mt-1">
                  {selectedError.errorMessage}
                </p>
                <span className="font-code-sm text-on-surface-variant">
                  Model version: {selectedError.version} · Recorded: {selectedError.timestamp}
                </span>
              </div>

              <div>
                <span className="font-label-caps uppercase text-on-surface-variant block mb-1">
                  Input Payload
                </span>
                <pre className="p-space-3 bg-primary-container text-inverse-on-surface rounded font-code-sm text-code-sm overflow-x-auto select-text">
                  <code>{selectedError.payloadSample}</code>
                </pre>
              </div>

              <div className="flex justify-end">
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
