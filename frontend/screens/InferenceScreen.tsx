import React, { useCallback, useEffect, useState } from 'react';
import { ModelItem, ScreenType } from '../types';
import {
  fetchMetrics,
  predictModel,
  type MetricsSummary,
} from '../lib/model-api';

interface InferenceScreenProps {
  model: ModelItem;
  onNavigate: (screen: ScreenType) => void;
  onShowToast: (msg: string) => void;
  onRecordInference?: (record: {
    sku: string;
    store: string;
    expectedDemand: number;
    latencyMs: number;
    inputObj: Record<string, unknown>;
    outputObj: Record<string, unknown>;
  }) => void;
}

export const InferenceScreen: React.FC<InferenceScreenProps> = ({
  model,
  onNavigate,
  onShowToast,
  onRecordInference,
}) => {
  const initialPayload = `{
  "input": "This is an amazing product"
}`

  const initialResponse = `{
  "predictions": [
    {
      "sku": "SKU-4882-BLU",
      "store_id": "ST-9041",
      "expected_demand": 184.2,
      "interval_lower": 171.0,
      "interval_upper": 198.5,
      "model_version": "v1.2.0",
      "execution_time_ms": 38.4
    }
  ],
  "host": "local-worker-0"
}`;

  const [inputPayload, setInputPayload] = useState(initialPayload);
  const [outputResponse, setOutputResponse] = useState(initialResponse);
  const [isLoading, setIsLoading] = useState(false);
  const [latencyStat, setLatencyStat] = useState('42ms');
  const [statusCode, setStatusCode] = useState('200 OK');
  const [metrics, setMetrics] = useState<MetricsSummary | null>(null);
  const [isMetricsLoading, setIsMetricsLoading] = useState(true);

  const loadMetrics = useCallback(async () => {
    setIsMetricsLoading(true);

    try {
      const result = await fetchMetrics(
        model.id,
        model.currentVersion,
      );

      setMetrics(result);
    } catch (error) {
      console.error('Failed to load inference metrics:', error);
      setMetrics(null);
    } finally {
      setIsMetricsLoading(false);
    }
  }, [model.id, model.currentVersion]);

  useEffect(() => {
    void loadMetrics();
  }, [loadMetrics]);
  const [isSampleMenuOpen, setIsSampleMenuOpen] = useState(false);
  const [isCopiedOutput, setIsCopiedOutput] = useState(false);
  const [copyCurlText, setCopyCurlText] = useState('Copy cURL');

  // Sample presets
  const presets = {
    promo: {
      instances: [
        {
          store_id: 'ST-9041',
          sku: 'SKU-4882-BLU',
          forecast_horizon_days: 14,
          promo_flag: true,
          historical_lag_7d: [142, 138, 150, 162, 155, 149, 170],
        },
      ],
      parameters: { confidence_interval: 0.95 },
    },
    baseline: {
      instances: [
        {
          store_id: 'ST-2001',
          sku: 'SKU-1029-STD',
          forecast_horizon_days: 7,
          promo_flag: false,
          historical_lag_7d: [80, 82, 85, 79, 81, 84, 83],
        },
      ],
      parameters: { confidence_interval: 0.9 },
    },
    batch: {
      instances: [
        {
          store_id: 'ST-9041',
          sku: 'SKU-4882-BLU',
          forecast_horizon_days: 7,
          promo_flag: false,
          historical_lag_7d: [120, 122, 119, 125, 130, 128, 132],
        },
        {
          store_id: 'ST-9041',
          sku: 'SKU-9941-RED',
          forecast_horizon_days: 7,
          promo_flag: true,
          historical_lag_7d: [45, 52, 60, 71, 85, 94, 110],
        },
        {
          store_id: 'ST-3012',
          sku: 'SKU-3120-GRN',
          forecast_horizon_days: 7,
          promo_flag: false,
          historical_lag_7d: [12, 14, 13, 15, 14, 16, 15],
        },
      ],
      parameters: { confidence_interval: 0.99 },
    },
  };

  const handleSelectPreset = (key: 'promo' | 'baseline' | 'batch') => {
    setInputPayload(JSON.stringify(presets[key], null, 2));
    setIsSampleMenuOpen(false);
    onShowToast(`Sample payload loaded: ${key}`);
  };

  const handleFormatJson = () => {
    try {
      const parsed = JSON.parse(inputPayload);
      setInputPayload(JSON.stringify(parsed, null, 2));
      onShowToast('JSON payload formatted');
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Invalid JSON syntax';
      onShowToast('Cannot format: ' + errorMsg);
    }
  };

  const handleRunPrediction = async () => {
    let parsed: Record<string, unknown>;

    try {
      parsed = JSON.parse(inputPayload);
    } catch {
      onShowToast('Malformed JSON in request payload. Please fix syntax.');
      return;
    }

    setIsLoading(true);
    const startedAt = performance.now();

    try {
      const result = await predictModel(
        model.id,
        model.currentVersion,
        parsed.input ?? parsed,
      );

      const latency = Math.round(performance.now() - startedAt);

      const responseObj = {
        model: result.model,
        version: result.version,
        prediction: result.prediction,
      };

      setOutputResponse(JSON.stringify(responseObj, null, 2));
      setLatencyStat(`${latency}ms`);
      setStatusCode('200 OK');

      await loadMetrics();
      onShowToast(`Inference completed in ${latency}ms`);

      if (onRecordInference) {
        onRecordInference({
          sku: typeof parsed.sku === 'string' ? parsed.sku : 'N/A',
          store: typeof parsed.store_id === 'string' ? parsed.store_id : 'N/A',
          expectedDemand:
            typeof result.prediction === 'number' ? result.prediction : 0,
          latencyMs: latency,
          inputObj: parsed,
          outputObj: responseObj,
        });
      }
    } catch (error) {
      const latency = Math.round(performance.now() - startedAt);
      const message =
        error instanceof Error ? error.message : 'Inference request failed';

      setLatencyStat(`${latency}ms`);
      setStatusCode('ERROR');
      setOutputResponse(
        JSON.stringify({ error: message }, null, 2),
      );
      onShowToast(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyOutput = () => {
    navigator.clipboard.writeText(outputResponse);
    setIsCopiedOutput(true);
    onShowToast('Inference response copied to clipboard');
    setTimeout(() => setIsCopiedOutput(false), 1500);
  };

  const handleCopyCurl = () => {
    const curl = `curl -X POST http://localhost:8000/api/v1/models/${model.id}/versions/${model.currentVersion}/predict \\
  -H "Content-Type: application/json" \\
  -d '${inputPayload.replace(/'/g, "\\'")}'`;
    navigator.clipboard.writeText(curl);
    setCopyCurlText('Copied!');
    onShowToast('cURL command copied to clipboard');
    setTimeout(() => setCopyCurlText('Copy cURL'), 1500);
  };

  const lineNumbers = Array.from({ length: 15 }, (_, i) => i + 1);

  return (
    <div className="flex flex-col w-full pb-space-8">
      {/* Sub-header & Telemetry Breadcrumbs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-4 py-space-4">
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
            <span className="text-on-surface font-semibold">Inference</span>
          </div>
          <div className="flex items-baseline gap-space-3 mt-space-1">
            <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight font-semibold">
              Test Inference
            </h1>
            <span className="font-code-sm text-code-sm text-on-surface-variant bg-surface-container-high px-space-2 py-0.5 rounded">
              {model.currentVersion}-stable
            </span>
          </div>
          <p className="font-body-default text-body-default text-on-surface-variant">
            Run prediction requests against the deployed version ({model.currentVersion}) of {model.name} in real-time.
          </p>
        </div>

        <div className="flex items-center gap-space-3 self-start md:self-auto">
          <div className="flex items-center gap-space-2 px-space-3 py-1.5 rounded-full bg-surface-container-lowest shadow-sm border border-surface-variant/40">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-secondary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-secondary"></span>
            </span>
            <span className="font-code-sm text-code-sm text-on-surface tracking-tight font-medium">
              Endpoint Active
            </span>
            <span className="text-on-surface-variant font-code-sm text-code-sm">·</span>
            <span className="font-code-sm text-code-sm text-on-surface-variant">localhost:8000</span>
          </div>
          <button
            onClick={() => onNavigate('monitoring')}
            className="flex items-center gap-space-1 px-space-3 py-1.5 rounded bg-surface-container text-on-surface hover:bg-surface-container-high transition-colors font-label-default text-label-default cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">monitoring</span>
            <span>Metrics</span>
          </button>
        </div>
      </div>

      {/* Main Side-by-Side Playground Canvas */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-space-4 mt-space-2 items-stretch">
        {/* LEFT PANEL: Request Payload */}
        <div className="xl:col-span-6 flex flex-col bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden min-h-[580px] border border-surface-variant/40">
          {/* Left Header */}
          <div className="flex items-center justify-between px-space-4 py-space-3 bg-surface-container-low border-b border-surface-variant/30">
            <div className="flex items-center gap-space-2">
              <span className="font-label-caps text-label-caps bg-primary text-on-primary px-space-1 py-0.5 rounded font-semibold tracking-wide">
                POST
              </span>
              <span className="font-code-sm text-code-sm text-on-surface truncate">
                /v1/models/{model.slug}:predict
              </span>
              <span className="font-label-caps text-label-caps text-on-surface-variant bg-surface-container px-space-2 py-0.5 rounded">
                JSON
              </span>
            </div>
            <button
              onClick={handleCopyCurl}
              className="flex items-center gap-space-1 text-on-surface-variant hover:text-on-surface px-space-2 py-1 rounded hover:bg-surface-container-high transition-colors font-label-default text-label-default cursor-pointer"
              title="Copy cURL Command"
            >
              <span className="material-symbols-outlined text-[15px]">terminal</span>
              <span>{copyCurlText}</span>
            </button>
          </div>

          {/* Left Editor Area */}
          <div className="flex-1 flex font-code-default text-code-default bg-surface-container-lowest relative overflow-hidden">
            {/* Line Numbers */}
            <div className="w-10 py-space-3 select-none text-right pr-space-3 bg-surface-container-low/50 text-on-surface-variant/40 font-code-sm text-code-sm flex flex-col gap-0.5 border-r border-surface-variant/20">
              {lineNumbers.map((n) => (
                <span key={n}>{n}</span>
              ))}
            </div>
            {/* Textarea */}
            <div className="flex-1 relative flex">
              <textarea
                value={inputPayload}
                onChange={(e) => setInputPayload(e.target.value)}
                spellCheck={false}
                className="w-full h-full p-space-3 font-code-default text-code-default leading-[22px] bg-transparent text-on-surface resize-none focus:outline-none focus:bg-surface-container-low/20 transition-colors whitespace-pre overflow-y-auto"
              />
            </div>
          </div>

          {/* Left Action Footer */}
          <div className="flex items-center justify-between px-space-4 py-space-3 bg-surface-container-low border-t border-surface-variant/30">
            <div className="relative inline-block text-left">
              <button
                onClick={() => setIsSampleMenuOpen(!isSampleMenuOpen)}
                className="flex items-center gap-space-2 px-space-3 py-1.5 rounded bg-surface-container-lowest text-on-surface hover:bg-surface-container-high transition-colors font-label-default text-label-default shadow-xs border border-surface-variant/40 cursor-pointer"
              >
                <span>Load Sample Payload</span>
                <span className="material-symbols-outlined text-[14px]">expand_more</span>
              </button>

              {isSampleMenuOpen && (
                <div className="absolute left-0 bottom-full mb-space-2 w-56 rounded-lg bg-surface-container-lowest shadow-xl py-1 z-30 font-label-default text-label-default border border-surface-variant">
                  <button
                    onClick={() => handleSelectPreset('promo')}
                    className="w-full text-left px-space-3 py-space-2 hover:bg-surface-container-low text-on-surface block cursor-pointer"
                  >
                    High Promo Surge (Holiday)
                  </button>
                  <button
                    onClick={() => handleSelectPreset('baseline')}
                    className="w-full text-left px-space-3 py-space-2 hover:bg-surface-container-low text-on-surface block cursor-pointer"
                  >
                    Standard Baseline Stock
                  </button>
                  <button
                    onClick={() => handleSelectPreset('batch')}
                    className="w-full text-left px-space-3 py-space-2 hover:bg-surface-container-low text-on-surface block cursor-pointer"
                  >
                    Multi-SKU Batch (3 Items)
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-space-2">
              <button
                onClick={handleFormatJson}
                className="px-space-2 py-1.5 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors font-label-default text-label-default cursor-pointer"
                title="Format indentation"
              >
                Format
              </button>
              <button
                onClick={handleRunPrediction}
                disabled={isLoading}
                className="flex items-center gap-space-2 px-space-4 py-2 rounded bg-primary text-on-primary hover:bg-primary-container transition-all font-label-default text-label-default shadow-md hover:shadow-lg active:scale-95 cursor-pointer disabled:opacity-50"
              >
                <span
                  className={`material-symbols-outlined text-[16px] ${isLoading ? 'animate-spin' : ''}`}
                >
                  {isLoading ? 'sync' : 'play_arrow'}
                </span>
                <span>{isLoading ? 'Inferring...' : 'Run Prediction'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT PANEL: Response Payload */}
        <div className="xl:col-span-6 flex flex-col bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden min-h-[580px] border border-surface-variant/40">
          {/* Right Header */}
          <div className="flex items-center justify-between px-space-4 py-space-3 bg-surface-container-low border-b border-surface-variant/30">
            <div className="flex items-center gap-space-3 flex-wrap">
              <div className="flex items-center gap-1.5 px-space-2 py-0.5 rounded bg-surface-container-highest text-on-surface font-label-caps text-label-caps">
                <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
                <span>{statusCode}</span>
              </div>
              <div className="flex items-center gap-space-1 font-code-sm text-code-sm text-on-surface-variant">
                <span className="material-symbols-outlined text-[14px]">timer</span>
                <span>{latencyStat}</span>
              </div>
              <div className="flex items-center gap-space-1 font-code-sm text-code-sm text-on-surface-variant">
                <span className="material-symbols-outlined text-[14px]">memory</span>
                <span>1.2 GB</span>
              </div>
              <div className="flex items-center gap-space-1 font-code-sm text-code-sm text-on-surface-variant">
                <span className="material-symbols-outlined text-[14px]">bolt</span>
                <span>Compute: FP16</span>
              </div>
            </div>

            <div className="flex items-center gap-space-2">
              <button
                onClick={handleCopyOutput}
                className="p-1.5 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
                title="Copy Response"
              >
                <span className="material-symbols-outlined text-[16px]">
                  {isCopiedOutput ? 'check' : 'content_copy'}
                </span>
              </button>
            </div>
          </div>

          {/* Right Body */}
          <div className="flex-1 flex flex-col p-space-4 font-code-default text-code-default bg-surface-container-lowest overflow-y-auto relative">
            {isLoading && (
              <div className="absolute inset-0 bg-surface-container-lowest/80 backdrop-blur-xs flex flex-col items-center justify-center gap-space-2 z-10">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                <span className="font-code-sm text-code-sm text-on-surface">Executing model graph...</span>
              </div>
            )}

            <pre className="text-on-surface whitespace-pre-wrap leading-[22px] select-text">
              <code>{outputResponse}</code>
            </pre>

            {/* Inline Visual Sparkline Representation of Horizon Inference */}
            <div className="mt-auto pt-space-4">
              <div className="p-space-3 rounded-lg bg-surface-container-low flex flex-col gap-space-2 border border-surface-variant/30">
                <div className="flex items-center justify-between text-on-surface font-label-caps text-label-caps">
                  <span>Forecast Trend Projection (14 Days)</span>
                  <span className="text-on-surface-variant">Upper / Lower Bounds 95%</span>
                </div>

                <div className="w-full h-16 flex items-end relative overflow-hidden">
                  <svg
                    className="w-full h-full text-secondary"
                    fill="none"
                    preserveAspectRatio="none"
                    viewBox="0 0 400 60"
                  >
                    {/* Confidence band */}
                    <polygon
                      className="fill-secondary/15"
                      points="0,48 30,45 60,42 90,40 120,38 150,32 180,26 210,24 240,20 270,16 300,14 330,12 360,9 400,6 400,28 360,29 330,32 300,34 270,37 240,40 210,43 180,45 150,49 120,52 90,54 60,55 30,57 0,58"
                    />
                    {/* Trend line */}
                    <polyline
                      points="0,53 30,50 60,48 90,46 120,44 150,39 180,34 210,32 240,28 270,24 300,22 330,20 360,17 400,14"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                    />
                    {/* Datapoint dot */}
                    <circle className="fill-secondary" cx="400" cy="14" r="3" />
                  </svg>
                </div>

                <div className="flex items-center justify-between font-code-sm text-code-sm text-on-surface-variant">
                  <span>Day 1: 149.0 units</span>
                  <span className="font-semibold text-on-surface">Peak: Day 14 (~184.2 units)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Action Footer */}
          <div className="flex items-center justify-between px-space-4 py-space-3 bg-surface-container-low text-on-surface-variant font-code-sm text-code-sm border-t border-surface-variant/30">
            <div className="flex items-center gap-space-3">
              <span className="flex items-center gap-1 text-on-surface">
                <span className="material-symbols-outlined text-[14px] text-secondary">check_circle</span>{' '}
                Schema Valid
              </span>
              <span>·</span>
              <span>Batch Size: 1</span>
            </div>
            <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">
              Worker: local
            </span>
          </div>
        </div>
      </div>

      {/* Inference Metrics */}
      <div className="mt-space-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-space-3">

        {/* Requests */}
        <div className="bg-surface-container-lowest rounded-lg border border-surface-variant/40 shadow-sm p-space-4 min-h-[96px]">
          <div className="flex items-start justify-between">
            <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">
              Requests
            </span>

            <span className="material-symbols-outlined text-[20px] text-primary">
              query_stats
            </span>
          </div>

          <div className="flex items-baseline gap-space-2 mt-space-2">
            <span className="font-headline-lg text-headline-lg text-on-surface font-semibold">
              {isMetricsLoading ? '...' : metrics?.requests ?? 'N/A'}
            </span>

            <span className="font-code-sm text-code-sm text-on-surface-variant">
              total
            </span>
          </div>
        </div>

        {/* Successful */}
        <div className="bg-surface-container-lowest rounded-lg border border-surface-variant/40 shadow-sm p-space-4 min-h-[96px]">
          <div className="flex items-start justify-between">
            <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">
              Successful
            </span>

            <span className="material-symbols-outlined text-[20px] text-primary">
              check_circle
            </span>
          </div>

          <div className="flex items-baseline gap-space-2 mt-space-2">
            <span className="font-headline-lg text-headline-lg text-on-surface font-semibold">
              {isMetricsLoading ? '...' : metrics?.successful ?? 'N/A'}
            </span>

            <span className="font-code-sm text-code-sm text-on-surface-variant">
              completed
            </span>
          </div>
        </div>

        {/* Failed */}
        <div className="bg-surface-container-lowest rounded-lg border border-surface-variant/40 shadow-sm p-space-4 min-h-[96px]">
          <div className="flex items-start justify-between">
            <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">
              Failed
            </span>

            <span className="material-symbols-outlined text-[20px] text-on-surface-variant">
              error
            </span>
          </div>

          <div className="flex items-baseline gap-space-2 mt-space-2">
            <span className="font-headline-lg text-headline-lg text-on-surface font-semibold">
              {isMetricsLoading ? '...' : metrics?.failed ?? 'N/A'}
            </span>

            <span className="font-code-sm text-code-sm text-on-surface-variant">
              errors
            </span>
          </div>
        </div>

        {/* Success Rate */}
        <div className="bg-surface-container-lowest rounded-lg border border-surface-variant/40 shadow-sm p-space-4 min-h-[96px]">
          <div className="flex items-start justify-between">
            <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">
              Success Rate
            </span>

            <span className="material-symbols-outlined text-[20px] text-primary">
              monitoring
            </span>
          </div>

          <div className="flex items-baseline gap-space-2 mt-space-2">
            <span className="font-headline-lg text-headline-lg text-on-surface font-semibold">
              {isMetricsLoading
                ? '...'
                : metrics && metrics.requests > 0
                  ? `${((metrics.successful / metrics.requests) * 100).toFixed(1)}%`
                  : 'N/A'}
            </span>

            <span className="font-code-sm text-code-sm text-on-surface-variant">
              successful
            </span>
          </div>
        </div>

      </div>
      {/* Telemetry & Diagnostic Inspector Footprint (3 tiles) */}
      <div className="mt-space-3 grid grid-cols-1 md:grid-cols-3 gap-space-3">
        <div className="bg-surface-container-lowest p-space-4 rounded-lg shadow-sm flex items-center gap-space-3 min-h-[76px] border border-surface-variant/40">
          <div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center text-on-surface">
            <span className="material-symbols-outlined text-[20px]">speed</span>
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">
              Average Server Latency
            </span>
            <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">
              {isMetricsLoading
                ? '...'
                : metrics
                  ? `${metrics.average_latency_ms.toFixed(1)} ms`
                  : 'N/A'}
            </span>
          </div>
        </div>

        <div className="bg-surface-container-lowest p-space-4 rounded-lg shadow-sm flex items-center gap-space-3 min-h-[76px] border border-surface-variant/40">
          <div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center text-on-surface">
            <span className="material-symbols-outlined text-[20px]">memory</span>
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">
              VRAM Allocation
            </span>
            <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">
              Not exposed
            </span>
          </div>
        </div>

        <div className="bg-surface-container-lowest p-space-4 rounded-lg shadow-sm flex items-center gap-space-3 min-h-[76px] border border-surface-variant/40">
          <div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center text-on-surface">
            <span className="material-symbols-outlined text-[20px]">sync_saved_locally</span>
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">
              Cold Start Overhead
            </span>
            <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">
              Not exposed
            </span>
          </div>
        </div>
      </div>

      {/* Operational Status Baseline Strip */}
      <div className="mt-space-4 p-space-3 rounded-lg bg-surface-container-low flex flex-col sm:flex-row items-center justify-between text-on-surface-variant font-code-sm text-code-sm gap-space-2 border border-surface-variant/30">
        <div className="flex items-center gap-space-2 truncate">
          <span className="material-symbols-outlined text-[16px] text-on-surface">security</span>
          <span>
            Inference endpoint authentication:{' '}
            <span className="text-on-surface">Local Loopback (Disabled)</span>
          </span>
          <span className="hidden sm:inline">·</span>
          <span>
            Timeout: <span className="text-on-surface">30s</span>
          </span>
        </div>
        <div className="flex items-center gap-space-3">
          <span>Worker Threads: Not exposed</span>
          <span>·</span>
          <span className="font-label-caps text-label-caps uppercase text-secondary font-semibold">
            Ready
          </span>
        </div>
      </div>
    </div>
  );
};

