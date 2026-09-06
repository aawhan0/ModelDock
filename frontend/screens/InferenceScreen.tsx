import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ModelItem, ScreenType } from '../types';
import { fetchMetrics, predictModel, type MetricsSummary } from '../lib/model-api';
import { API_URL } from '../lib/api';

interface InferenceScreenProps {
  model: ModelItem;
  onNavigate: (screen: ScreenType) => void;
  onShowToast: (msg: string) => void;
}

export const InferenceScreen: React.FC<InferenceScreenProps> = ({
  model,
  onNavigate,
  onShowToast,
}) => {
  const [inputPayload, setInputPayload] = useState(
    JSON.stringify({ input: 'This is an amazing product' }, null, 2),
  );
  const [outputResponse, setOutputResponse] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [latencyStat, setLatencyStat] = useState('—');
  const [statusCode, setStatusCode] = useState('—');
  const [metrics, setMetrics] = useState<MetricsSummary | null>(null);
  const [isMetricsLoading, setIsMetricsLoading] = useState(true);
  const [isCopiedOutput, setIsCopiedOutput] = useState(false);
  const [isSampleMenuOpen, setIsSampleMenuOpen] = useState(false);

  const loadMetrics = useCallback(async () => {
    setIsMetricsLoading(true);
    try {
      setMetrics(await fetchMetrics(model.id, model.currentVersion));
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

  const lineNumbers = useMemo(
    () =>
      Array.from(
        { length: Math.max(1, inputPayload.split('\n').length) },
        (_, index) => index + 1,
      ),
    [inputPayload],
  );

  const samplePayload = JSON.stringify(
    { input: 'This is an amazing product' },
    null,
    2,
  );

  const handleFormatJson = () => {
    try {
      setInputPayload(JSON.stringify(JSON.parse(inputPayload), null, 2));
      onShowToast('JSON payload formatted');
    } catch {
      onShowToast('Cannot format: invalid JSON');
    }
  };

  const handleRunPrediction = async () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(inputPayload);
    } catch {
      onShowToast('Malformed JSON in request payload.');
      return;
    }

    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      onShowToast('Request payload must be a JSON object.');
      return;
    }

    const requestPayload = parsed as Record<string, unknown>;

    setIsLoading(true);
    setStatusCode('—');
    const startedAt = performance.now();

    try {
      const result = await predictModel(
        model.id,
        model.currentVersion,
        requestPayload.input ?? requestPayload,
      );
      const latency = Math.round(performance.now() - startedAt);
      setOutputResponse(
        JSON.stringify(
          {
            model: result.model,
            version: result.version,
            prediction: result.prediction,
          },
          null,
          2,
        ),
      );
      setLatencyStat(`${latency}ms`);
      setStatusCode('200 OK');
      await loadMetrics();
      onShowToast(`Inference completed in ${latency}ms`);
    } catch (error) {
      const latency = Math.round(performance.now() - startedAt);
      const message =
        error instanceof Error ? error.message : 'Inference request failed';
      setLatencyStat(`${latency}ms`);
      setStatusCode('ERROR');
      setOutputResponse(JSON.stringify({ error: message }, null, 2));
      await loadMetrics();
      onShowToast(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyOutput = async () => {
    if (!outputResponse) {
      onShowToast('No inference response to copy');
      return;
    }
    try {
      await navigator.clipboard.writeText(outputResponse);
    } catch {
      onShowToast('Clipboard access is unavailable');
      return;
    }
    setIsCopiedOutput(true);
    onShowToast('Inference response copied');
    window.setTimeout(() => setIsCopiedOutput(false), 1500);
  };

  const handleCopyCurl = async () => {
    const curl = `curl -X POST ${API_URL}/api/v1/models/${model.id}/versions/${encodeURIComponent(model.currentVersion)}/predict \\
  -H "Authorization: Bearer <API_KEY>" \\
  -H "Content-Type: application/json" \\
  -d '${inputPayload.replace(/'/g, "\\'")}'`;
    await navigator.clipboard.writeText(curl);
    onShowToast('cURL command copied');
  };

  const successRate =
    metrics && metrics.requests > 0
      ? `${((metrics.successful / metrics.requests) * 100).toFixed(1)}%`
      : 'N/A';

  return (
    <div className="flex flex-col w-full pb-space-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-4 py-space-4">
        <div className="flex flex-col gap-space-1">
          <div className="flex items-center gap-space-2 text-on-surface-variant font-label-caps text-label-caps tracking-wider uppercase">
            <button onClick={() => onNavigate('models')} className="hover:text-on-surface cursor-pointer">
              Models
            </button>
            <span>/</span>
            <button onClick={() => onNavigate('model-detail')} className="hover:text-on-surface cursor-pointer">
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
              {model.currentVersion}
            </span>
          </div>
          <p className="font-body-default text-body-default text-on-surface-variant">
            Run prediction requests against the deployed version ({model.currentVersion}) of {model.name}.
          </p>
        </div>

        <div className="flex items-center gap-space-3 self-start md:self-auto">
          <div className="flex items-center gap-space-2 px-space-3 py-1.5 rounded-full bg-surface-container-lowest shadow-sm border border-surface-variant/40">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-secondary opacity-75 animate-ping" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-secondary" />
            </span>
            <span className="font-code-sm text-code-sm text-on-surface">Backend endpoint</span>
          </div>
          <button onClick={() => onNavigate('monitoring')} className="flex items-center gap-1 px-3 py-1.5 rounded bg-surface-container text-on-surface cursor-pointer">
            <span className="material-symbols-outlined text-[16px]">monitoring</span>
            Metrics
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-space-4 mt-space-2 items-stretch">
        <div className="xl:col-span-6 flex flex-col bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden border border-surface-variant/40">
          <div className="flex items-center justify-between px-4 py-3 bg-surface-container-low border-b border-surface-variant/30">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-label-caps bg-primary text-on-primary px-1 py-0.5 rounded">POST</span>
              <span className="font-code-sm text-on-surface truncate">
                /api/v1/models/{model.id}/versions/{model.currentVersion}/predict
              </span>
              <span className="font-label-caps text-on-surface-variant bg-surface-container px-2 py-0.5 rounded">JSON</span>
            </div>
            <button onClick={handleCopyCurl} className="flex items-center gap-1 text-on-surface-variant cursor-pointer">
              <span className="material-symbols-outlined text-[15px]">terminal</span>
              cURL
            </button>
          </div>

          <div className="flex min-h-[360px] font-code-default bg-surface-container-lowest">
            <div className="w-10 py-3 text-right pr-3 bg-surface-container-low/50 text-on-surface-variant/40 font-code-sm border-r border-surface-variant/20">
              {lineNumbers.map((number) => <div key={number}>{number}</div>)}
            </div>
            <textarea
              value={inputPayload}
              onChange={(event) => setInputPayload(event.target.value)}
              spellCheck={false}
              className="flex-1 p-3 bg-transparent text-on-surface resize-none focus:outline-none whitespace-pre overflow-y-auto"
            />
          </div>

          <div className="flex items-center justify-between px-4 py-3 bg-surface-container-low border-t border-surface-variant/30">
            <div className="relative">
              <button onClick={() => setIsSampleMenuOpen((value) => !value)} className="flex items-center gap-2 px-3 py-1.5 rounded bg-surface-container-lowest text-on-surface border border-surface-variant/40 cursor-pointer">
                Load Sample Payload
                <span className="material-symbols-outlined text-[14px]">expand_more</span>
              </button>
              {isSampleMenuOpen && (
                <div className="absolute bottom-full mb-2 left-0 w-64 rounded-lg bg-surface-container-lowest shadow-xl border border-surface-variant z-30">
                  <button
                    onClick={() => {
                      setInputPayload(samplePayload);
                      setIsSampleMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-surface-container-low cursor-pointer"
                  >
                    Generic text classification example
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button onClick={handleFormatJson} className="px-2 py-1.5 text-on-surface-variant cursor-pointer">Format</button>
              <button onClick={handleRunPrediction} disabled={isLoading} className="flex items-center gap-2 px-4 py-2 rounded bg-primary text-on-primary disabled:opacity-50 cursor-pointer">
                {isLoading ? 'Inferring...' : 'Run Prediction'}
              </button>
            </div>
          </div>
        </div>

        <div className="xl:col-span-6 flex flex-col bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden border border-surface-variant/40">
          <div className="flex items-center justify-between px-4 py-3 bg-surface-container-low border-b border-surface-variant/30">
            <div className="flex items-center gap-3">
              <span className="px-2 py-0.5 rounded bg-surface-container-highest font-label-caps">{statusCode}</span>
              <span className="font-code-sm text-on-surface-variant">{latencyStat}</span>
            </div>
            <button onClick={handleCopyOutput} className="p-1.5 cursor-pointer" title="Copy response">
              <span className="material-symbols-outlined text-[16px]">{isCopiedOutput ? 'check' : 'content_copy'}</span>
            </button>
          </div>

          <div className="min-h-[360px] flex-1 p-4 bg-surface-container-lowest relative">
            {isLoading && (
              <div className="absolute inset-0 bg-surface-container-lowest/80 flex items-center justify-center z-10">
                <span className="font-code-sm text-on-surface">Running backend inference…</span>
              </div>
            )}
            <pre className="font-code-default text-on-surface whitespace-pre-wrap break-words">
              {outputResponse || 'Run an inference to see the backend response.'}
            </pre>
          </div>

          <div className="px-4 py-3 bg-surface-container-low border-t border-surface-variant/30 flex items-center justify-between font-code-sm text-on-surface-variant">
            <span>Backend runtime</span>
            <span>{model.framework}</span>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
        <Metric label="Requests" value={isMetricsLoading ? '...' : String(metrics?.requests ?? 0)} />
        <Metric label="Successful" value={isMetricsLoading ? '...' : String(metrics?.successful ?? 0)} />
        <Metric label="Failed" value={isMetricsLoading ? '...' : String(metrics?.failed ?? 0)} />
        <Metric label="Success rate" value={isMetricsLoading ? '...' : successRate} />
      </div>

      <div className="mt-3 p-3 rounded bg-surface-container-low border border-surface-variant/30 flex items-center justify-between gap-3">
        <span className="font-code-sm text-on-surface-variant break-all">
          Endpoint: /api/v1/models/{model.id}/versions/{model.currentVersion}/predict
        </span>
        <span className="font-label-caps text-secondary whitespace-nowrap">Backend connected</span>
      </div>
    </div>
  );
};

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-4 rounded-lg bg-surface-container-lowest border border-surface-variant/40 shadow-sm">
      <span className="font-label-caps text-label-caps text-on-surface-variant">{label}</span>
      <div className="mt-2 font-headline-lg text-headline-lg text-on-surface font-semibold">{value}</div>
    </div>
  );
}
