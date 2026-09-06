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

  const chartWidth = 920;
  const chartHeight = 360;
  const plotLeft = 64;
  const plotRight = 896;
  const plotTop = 24;
  const plotBottom = 292;
  const plotWidth = plotRight - plotLeft;
  const plotHeight = plotBottom - plotTop;

  const points = chartData.map((item, index) => {
    const value = metric === 'latency' ? item.average_latency_ms : item.requests;
    const x =
      chartData.length === 1
        ? plotLeft + plotWidth / 2
        : plotLeft + (index / (chartData.length - 1)) * plotWidth;
    const y = plotBottom - (value / yMax) * plotHeight;
    return { x, y, value, item };
  });

  const pointString = points
    .map((point) => point.x.toFixed(1) + ',' + point.y.toFixed(1))
    .join(' ');

  const areaString =
    points.length > 0
      ? plotLeft + ',' + plotBottom + ' ' + pointString + ' ' + plotRight + ',' + plotBottom
      : '';

  const tickIndexes = useMemo(() => {
    if (!chartData.length) return [] as number[];
    const maxTicks = hours <= 6 ? 6 : hours <= 24 ? 7 : 8;
    const count = Math.min(maxTicks, chartData.length);
    if (count === 1) return [0];

    return Array.from({ length: count }, (_, index) =>
      Math.round((index * (chartData.length - 1)) / (count - 1)),
    );
  }, [chartData.length, hours]);

  const latestPoint = points[points.length - 1];
  const peakIndex = values.reduce(
    (bestIndex, value, index) =>
      value > (values[bestIndex] ?? -Infinity) ? index : bestIndex,
    0,
  );
  const peakPoint = points[peakIndex];
  const average = values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;

  const formatXAxisLabel = (timestamp: string, index: number) => {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return '—';

    const time = date.toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    });

    if (hours <= 6) return time;

    if (hours <= 24) {
      const day = date.toLocaleDateString([], {
        day: 'numeric',
        month: 'short',
      });
      return index === 0 || date.getHours() === 0 ? day + ' · ' + time : time;
    }

    return date.toLocaleDateString([], {
      day: 'numeric',
      month: 'short',
    });
  };

  const formatXAxisLabel = (timestamp: string, index: number) => {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return '—';

    const time = date.toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    });

    if (hours <= 6) return time;

    if (hours <= 24) {
      const day = date.toLocaleDateString([], {
        day: 'numeric',
        month: 'short',
      });
      return index === 0 || date.getHours() === 0 ? day + ' · ' + time : time;
    }

    return date.toLocaleDateString([], {
      day: 'numeric',
      month: 'short',
    });
  };

  const formatTooltipTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return 'Unknown time';

    return date.toLocaleString([], {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  return (
    <div className="flex flex-col gap-space-4">
      <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-space-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-secondary/10 text-secondary flex items-center justify-center">
              <span className="material-symbols-outlined text-[18px]">
                {metric === 'latency' ? 'speed' : 'query_stats'}
              </span>
            </span>
            <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold">
              {metric === 'latency' ? 'Inference Average Latency' : 'Inference Request Activity'}
            </h2>
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-secondary/10 text-secondary font-label-caps text-label-caps uppercase">
              hourly
            </span>
          </div>
          <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant max-w-xl">
            {metric === 'latency'
              ? 'Average inference latency grouped into backend hourly buckets.'
              : 'Request volume grouped into backend hourly buckets, including successful and failed calls.'}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-1.5 shrink-0">
          {[
            ['Latest', latestPoint ? formatChartValue(latestPoint.value, metric) : '—'],
            ['Peak', formatChartValue(peakPoint?.value ?? 0, metric)],
            ['Average', formatChartValue(average, metric)],
          ].map(([label, value]) => (
            <div
              key={label}
              className="min-w-[82px] rounded-lg bg-surface-container-low px-2.5 py-1.5 border border-surface-variant/35"
            >
              <div className="font-label-caps text-label-caps uppercase text-on-surface-variant">
                {label}
              </div>
              <div className="mt-0.5 font-code-sm text-code-sm text-on-surface font-medium">
                {value}
              </div>
            </div>
          ))}
        </div>
      </div>

      {chartData.length === 0 ? (
        <div className="h-[330px] rounded-xl border border-dashed border-surface-variant bg-surface-container-low/40 flex items-center justify-center text-center px-6">
          <div>
            <span className="material-symbols-outlined text-[28px] text-on-surface-variant">
              monitoring
            </span>
            <p className="mt-2 font-body-default text-body-default text-on-surface">
              No telemetry recorded in this window.
            </p>
            <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
              Run an inference request to populate the chart.
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-surface-variant/40 bg-surface-container-low/35 overflow-hidden">
          <div className="px-2 sm:px-3 pt-3">
            <svg
              className="block w-full h-[310px]"
              viewBox={'0 0 ' + chartWidth + ' ' + chartHeight}
              preserveAspectRatio="none"
              role="img"
              aria-label={
                metric === 'latency'
                  ? 'Inference average latency over time'
                  : 'Inference request activity over time'
              }
            >
              <defs>
                <linearGradient
                  id={'chart-fill-' + metric}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="0%"
                    className="text-secondary"
                    stopColor="currentColor"
                    stopOpacity="0.20"
                  />
                  <stop
                    offset="100%"
                    className="text-secondary"
                    stopColor="currentColor"
                    stopOpacity="0.01"
                  />
                </linearGradient>
              </defs>

              {Array.from({ length: 5 }, (_, index) => {
                const value = yMax - step * index;
                const y = plotTop + (plotHeight / 4) * index;

                return (
                  <g key={'grid-' + index}>
                    <line
                      x1={plotLeft}
                      y1={y}
                      x2={plotRight}
                      y2={y}
                      className="stroke-surface-variant/70"
                      strokeDasharray={index === 4 ? undefined : '3 6'}
                    />
                    <text
                      x={plotLeft - 12}
                      y={y + 4}
                      textAnchor="end"
                      className="fill-on-surface-variant font-mono text-[10px]"
                    >
                      {formatAxisValue(value, metric)}
                    </text>
                  </g>
                );
              })}

              {points.length > 1 && peakPoint && (
                <line
                  x1={peakPoint.x}
                  y1={plotTop}
                  x2={peakPoint.x}
                  y2={plotBottom}
                  className="stroke-secondary/15"
                  strokeDasharray="4 5"
                />
              )}

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
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {points.map((point, index) => (
                <g key={'point-' + index}>
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={hoveredIndex === index ? 7 : 4}
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

              {hoveredIndex !== null &&
                points[hoveredIndex] &&
                (() => {
                  const point = points[hoveredIndex];
                  const tooltipWidth = metric === 'requests' ? 220 : 188;
                  const tooltipHeight = metric === 'requests' ? 82 : 64;
                  const tooltipX = Math.min(
                    Math.max(point.x - tooltipWidth / 2, plotLeft),
                    plotRight - tooltipWidth,
                  );
                  const tooltipY =
                    point.y < plotTop + tooltipHeight + 12
                      ? point.y + 14
                      : point.y - tooltipHeight - 14;

                  return (
                    <g pointerEvents="none">
                      <line
                        x1={point.x}
                        y1={plotTop}
                        x2={point.x}
                        y2={plotBottom}
                        className="stroke-secondary/30"
                        strokeDasharray="3 4"
                      />
                      <rect
                        x={tooltipX}
                        y={tooltipY}
                        width={tooltipWidth}
                        height={tooltipHeight}
                        rx="10"
                        className="fill-surface-container-lowest stroke-surface-variant"
                        strokeWidth="1"
                      />
                      <text
                        x={tooltipX + 13}
                        y={tooltipY + 19}
                        className="fill-on-surface font-mono text-[10px] font-semibold"
                      >
                        {formatTooltipTimestamp(point.item.timestamp)}
                      </text>
                      <text
                        x={tooltipX + 13}
                        y={tooltipY + 39}
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
                          x={tooltipX + 13}
                          y={tooltipY + 59}
                          className="fill-on-surface-variant font-mono text-[10px]"
                        >
                          Successful {point.item.successful} · Failed {point.item.failed}
                        </text>
                      )}
                    </g>
                  );
                })()}

              {tickIndexes.map((index, tickPosition) => {
                const point = points[index];
                return (
                  <text
                    key={'x-label-' + index + '-' + tickPosition}
                    x={point.x}
                    y={plotBottom + 27}
                    textAnchor={
                      tickPosition === 0
                        ? 'start'
                        : tickPosition === tickIndexes.length - 1
                          ? 'end'
                          : 'middle'
                    }
                    className="fill-on-surface-variant font-mono text-[10px]"
                  >
                    {formatXAxisLabel(point.item.timestamp, index)}
                  </text>
                );
              })}
            </svg>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 border-t border-surface-variant/30 px-3 py-2.5 bg-surface-container-low/30">
            <span className="font-code-sm text-code-sm text-on-surface-variant">
              {chartData.length} hourly buckets · {metric === 'requests' ? 'request volume' : 'latency'}
            </span>
            <span className="font-code-sm text-code-sm text-on-surface-variant">
              Hover or focus a point for details
            </span>
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
            aria-pressed={autoRefresh}
            aria-label="Toggle automatic monitoring refresh"
            onClick={handleAutoRefreshToggle}
            className={
              'group inline-flex items-center gap-2.5 px-3 py-1.5 rounded-lg border shadow-sm transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary/40 ' +
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
                'material-symbols-outlined text-[16px] ' +
                (autoRefresh ? 'auto-refresh-spin' : '')
              }
              aria-hidden="true"
            >
              {autoRefresh ? 'sync' : 'sync_disabled'}
            </span>
            <span className="font-label-default text-label-default">Auto refresh</span>
            <span
              className={
                'font-code-sm text-code-sm font-medium ' +
                (autoRefresh ? 'text-on-primary/80' : 'text-on-surface-variant')
              }
            >
              {autoRefresh ? 'ON · 10s' : 'OFF'}
            </span>
            {autoRefresh && (
              <span
                className="w-1.5 h-1.5 rounded-full bg-secondary-fixed animate-pulse"
                aria-hidden="true"
              />
            )}
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
