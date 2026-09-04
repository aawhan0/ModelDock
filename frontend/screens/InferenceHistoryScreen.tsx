import React, { useState, useMemo } from 'react';
import { InferenceRecord, ScreenType } from '../types';
import { fetchMetrics } from '../lib/model-api';
import { fetchInferenceRecords } from '../lib/model-api';

interface InferenceHistoryScreenProps {
  model: { id: string; currentVersion: string };
  inferences: InferenceRecord[];
  onNavigate: (screen: ScreenType) => void;
  onShowToast: (msg: string) => void;
  onReplayInference?: (record: InferenceRecord) => void;
}

export const InferenceHistoryScreen: React.FC<InferenceHistoryScreenProps> = ({
  model,
  inferences,
  onNavigate,
  onShowToast,
  onReplayInference,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'SUCCESS' | 'FAILED'>('ALL');
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<InferenceRecord | null>(null);
  const [isStreamActive, setIsStreamActive] = useState(true);
  const [metrics, setMetrics] = useState({
    requests: 0,
    successful: 0,
    failed: 0,
    average_latency_ms: 0,
  });
  const [isLoadingMetrics, setIsLoadingMetrics] = useState(false);
  const [liveRecords, setLiveRecords] = useState<InferenceRecord[]>(inferences);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  React.useEffect(() => {
    setLiveRecords(inferences);
  }, [inferences]);

  React.useEffect(() => {
    let cancelled = false;

    const loadMetrics = async () => {
      setIsLoadingMetrics(true);

      try {
        const result = await fetchMetrics(
          model.id,
          model.currentVersion,
        );

        if (!cancelled) {
          setMetrics({
            requests: result.requests,
            successful: result.successful,
            failed: result.failed,
            average_latency_ms: result.average_latency_ms,
          });
        }
      } catch (error) {
        if (!cancelled) {
          onShowToast(
            error instanceof Error
              ? error.message
              : 'Failed to load inference metrics',
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoadingMetrics(false);
        }
      }
    };

    loadMetrics();

    return () => {
      cancelled = true;
    };
  }, [model.id, model.currentVersion, onShowToast]);

  React.useEffect(() => {
    let cancelled = false;

    const loadHistory = async () => {
      setIsLoadingHistory(true);

      try {
        const records = await fetchInferenceRecords(
          model.id,
          model.currentVersion,
          50,
        );

        if (!cancelled) {
          setLiveRecords(records);
        }
      } catch (error) {
        if (!cancelled) {
          onShowToast(
            error instanceof Error
              ? error.message
              : 'Failed to load inference history',
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoadingHistory(false);
        }
      }
    };

    loadHistory();

    return () => {
      cancelled = true;
    };
  }, [model.id, model.currentVersion, onShowToast]);

  const filteredRecords = useMemo(() => {
    return liveRecords.filter((record) => {
      const matchesStatus =
        statusFilter === 'ALL' || record.status === statusFilter;
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        record.timestamp.toLowerCase().includes(q) ||
        record.version.toLowerCase().includes(q) ||
        record.traceId.toLowerCase().includes(q) ||
        JSON.stringify(record.inputSummary).toLowerCase().includes(q) ||
        JSON.stringify(record.outputSummary).toLowerCase().includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [liveRecords, statusFilter, searchQuery]);

  const handleExportCsv = () => {
    const headers = ['id', 'timestamp', 'version', 'status', 'latencyMs', 'traceId'];
    const rows = filteredRecords.map((r) =>
      [r.id, r.timestamp, r.version, r.status, r.latencyMs, r.traceId].join(',')
    );
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'demand-forecaster-history.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    onShowToast(`Exporting ${filteredRecords.length} inferences to demand-forecaster-history.csv`);
  };

  const handleReplay = (record: InferenceRecord, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    onShowToast(`Inference request #${record.id} re-queued with active weights.`);
    if (onReplayInference) {
      onReplayInference(record);
    }
  };

  const handleCopyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    onShowToast(`${label} copied to clipboard`);
  };

  return (
    <div className="flex flex-col w-full pb-space-12">
      <div className="flex flex-col gap-space-6 py-space-6">
        {/* Breadcrumb and Metadata Header */}
        <div className="flex flex-col gap-space-2">
          <div className="flex items-center gap-space-2 text-on-surface-variant font-code-sm text-code-sm">
            <button
              onClick={() => onNavigate('models')}
              className="hover:text-on-surface transition-colors cursor-pointer"
            >
              Models
            </button>
            <span className="text-outline">/</span>
            <button
              onClick={() => onNavigate('model-detail')}
              className="hover:text-on-surface transition-colors cursor-pointer"
            >
              demand-forecaster
            </button>
            <span className="text-outline">/</span>
            <span className="text-on-surface font-label-default text-label-default">History</span>
          </div>

          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-4">
            <div>
              <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight font-semibold">
                Inference History
              </h1>
              <p className="font-body-default text-body-default text-on-surface-variant mt-0.5">
                Log of recent prediction requests, payloads, execution latency, and return status.
              </p>
            </div>

            {/* Telemetry Summary Pill Group */}
            <div className="flex items-center gap-space-3">
              <div className="flex items-center gap-space-3 px-space-3 py-1.5 rounded-lg bg-surface-container shadow-xs border border-surface-variant/40">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-secondary"></span>
                  <span className="font-code-sm text-code-sm text-on-surface-variant">
                    p95 Latency:
                  </span>
                  <span className="font-code-sm text-code-sm text-on-surface font-semibold">
                    {isLoadingMetrics ? '?' : `${metrics.average_latency_ms.toFixed(1)}ms`}
                  </span>
                </div>
                <span className="text-outline-variant">|</span>
                <div className="flex items-center gap-1.5">
                  <span className="font-code-sm text-code-sm text-on-surface-variant">
                    Success Rate:
                  </span>
                  <span className="font-code-sm text-code-sm text-on-surface font-semibold">
                    99.82%
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Live Telemetry Inline Mini-Visualizer (4 KPI cards) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-space-3">
          <div className="bg-surface-container-lowest p-space-3 rounded-lg shadow-sm flex flex-col justify-between border border-surface-variant/40">
            <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">
              Total Inferences (24h)
            </span>
            <div className="flex items-baseline justify-between mt-space-2">
              <span className="font-display text-display text-on-surface font-semibold">{metrics.requests.toLocaleString()}</span>
              <span className="font-code-sm text-code-sm text-secondary font-medium">+14.2%</span>
            </div>
            <div className="w-full bg-surface-container h-1 rounded-full overflow-hidden mt-space-2">
              <div className="bg-primary h-full rounded-full" style={{ width: '78%' }}></div>
            </div>
          </div>

          <div className="bg-surface-container-lowest p-space-3 rounded-lg shadow-sm flex flex-col justify-between border border-surface-variant/40">
            <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">
              Mean Response Time
            </span>
            <div className="flex items-baseline justify-between mt-space-2">
              <span className="font-display text-display text-on-surface font-semibold">
                39.2<span className="font-code-sm text-code-sm text-on-surface-variant font-normal">ms</span>
              </span>
              <span className="font-code-sm text-code-sm text-on-surface-variant">-2.1ms</span>
            </div>
            {/* Micro Sparkline SVG */}
            <svg
              className="w-full h-4 mt-space-2 text-primary"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 100 16"
            >
              <path
                d="M0 12 L15 10 L30 14 L45 8 L60 9 L75 5 L90 7 L100 4"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.5"
              />
            </svg>
          </div>

          <div className="bg-surface-container-lowest p-space-3 rounded-lg shadow-sm flex flex-col justify-between border border-surface-variant/40">
            <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">
              Failed Inferences
            </span>
            <div className="flex items-baseline justify-between mt-space-2">
              <span className="font-display text-display text-error font-semibold">{metrics.failed.toLocaleString()}</span>
              <span className="font-code-sm text-code-sm text-error bg-error-container/40 px-1 rounded font-medium">
                {metrics.requests ? `${((metrics.failed / metrics.requests) * 100).toFixed(2)}%` : '0.00%'}
              </span>
            </div>
            <div className="w-full bg-surface-container h-1 rounded-full overflow-hidden mt-space-2">
              <div className="bg-error h-full rounded-full" style={{ width: '2%' }}></div>
            </div>
          </div>

          <div className="bg-surface-container-lowest p-space-3 rounded-lg shadow-sm flex flex-col justify-between border border-surface-variant/40">
            <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">
              Active Model Instance
            </span>
            <div className="flex items-baseline justify-between mt-space-2">
              <span className="font-headline-sm text-headline-sm text-on-surface font-medium">
                v1.2.0-onnx
              </span>
              <span className="font-label-caps text-label-caps bg-secondary/10 text-secondary px-1.5 py-0.5 rounded font-semibold">
                GPU:0
              </span>
            </div>
            <div className="flex items-center gap-1 mt-space-2 text-on-surface-variant font-code-sm text-code-sm">
              <span className="material-symbols-outlined text-[13px] text-secondary">memory</span>
              <span>VRAM 2.4GB / 16GB</span>
            </div>
          </div>
        </div>

        {/* Filter & Toolbar Panel */}
        <div className="bg-surface-container-lowest p-space-3 rounded-lg shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-space-3 border border-surface-variant/40">
          <div className="flex flex-wrap items-center gap-space-2 flex-1">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant text-[16px]">
                search
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search payload SKU, store, execution ID..."
                className="w-full pl-8 pr-3 py-1.5 rounded bg-surface-container-low text-on-surface placeholder:text-outline font-body-default text-body-default focus:bg-surface-container-lowest focus:outline-none transition-colors border border-surface-variant/30"
              />
            </div>

            {/* Filter Dropdown */}
            <div className="relative inline-block text-left">
              <button
                type="button"
                onClick={() => setIsFilterDropdownOpen(!isFilterDropdownOpen)}
                className="flex items-center gap-2 px-space-3 py-1.5 rounded bg-surface-container-low hover:bg-surface-container text-on-surface font-body-default text-body-default transition-colors cursor-pointer border border-surface-variant/30"
              >
                <span className="material-symbols-outlined text-[16px] text-on-surface-variant">
                  filter_list
                </span>
                <span>Status:</span>
                <span className="font-medium text-on-surface">
                  {statusFilter === 'ALL'
                    ? 'All'
                    : statusFilter === 'SUCCESS'
                    ? 'Success'
                    : 'Failed'}
                </span>
                <span className="material-symbols-outlined text-[14px] text-on-surface-variant">
                  arrow_drop_down
                </span>
              </button>

              {isFilterDropdownOpen && (
                <div className="absolute left-0 mt-1 w-36 rounded-lg bg-surface-container-lowest shadow-md py-1 z-30 border border-surface-variant">
                  <button
                    onClick={() => {
                      setStatusFilter('ALL');
                      setIsFilterDropdownOpen(false);
                    }}
                    className="w-full text-left px-3 py-1.5 text-body-default font-body-default text-on-surface hover:bg-surface-container-low cursor-pointer"
                  >
                    All Statuses
                  </button>
                  <button
                    onClick={() => {
                      setStatusFilter('SUCCESS');
                      setIsFilterDropdownOpen(false);
                    }}
                    className="w-full text-left px-3 py-1.5 text-body-default font-body-default text-on-surface hover:bg-surface-container-low cursor-pointer"
                  >
                    Success only
                  </button>
                  <button
                    onClick={() => {
                      setStatusFilter('FAILED');
                      setIsFilterDropdownOpen(false);
                    }}
                    className="w-full text-left px-3 py-1.5 text-body-default font-body-default text-on-surface hover:bg-surface-container-low cursor-pointer"
                  >
                    Failed only
                  </button>
                </div>
              )}
            </div>

            {/* Live Refresh Indicator */}
            <button
              onClick={() => {
                setIsStreamActive(!isStreamActive);
                onShowToast(isStreamActive ? 'Live stream paused' : 'Live stream resumed');
              }}
              className="flex items-center gap-1.5 px-space-2 py-1.5 rounded bg-surface-container-low hover:bg-surface-container text-on-surface-variant hover:text-on-surface text-code-sm font-code-sm transition-colors cursor-pointer border border-surface-variant/30"
              title={isStreamActive ? 'Auto-refreshing every 5s' : 'Stream Paused'}
            >
              <span
                className={`material-symbols-outlined text-[15px] ${
                  isStreamActive ? 'animate-spin' : ''
                }`}
                style={{ animationDuration: '4s' }}
              >
                sync
              </span>
              <span>{isStreamActive ? 'Stream Active' : 'Stream Paused'}</span>
            </button>
          </div>

          {/* Action Controls */}
          <div className="flex items-center gap-space-2">
            <button
              type="button"
              onClick={handleExportCsv}
              className="flex items-center gap-1.5 px-space-3 py-1.5 rounded bg-surface-container-low hover:bg-surface-container text-on-surface font-label-default text-label-default transition-colors shadow-sm cursor-pointer border border-surface-variant/30"
            >
              <span className="material-symbols-outlined text-[16px]">download</span>
              <span>Export CSV</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('inference')}
              className="flex items-center gap-1.5 px-space-3 py-1.5 rounded bg-primary text-on-primary font-label-default text-label-default hover:bg-primary-container transition-colors shadow-sm cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">play_arrow</span>
              <span>Test Request</span>
            </button>
          </div>
        </div>

        {/* Main Audit Data Table Wrapper */}
        <div className="bg-surface-container-lowest rounded-lg shadow-sm overflow-hidden flex flex-col border border-surface-variant/40">
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container-low text-on-surface-variant font-label-caps text-label-caps uppercase select-none border-b border-surface-variant/40">
                  <th className="py-2.5 px-4 font-medium tracking-wider">Timestamp</th>
                  <th className="py-2.5 px-4 font-medium tracking-wider">Version</th>
                  <th className="py-2.5 px-4 font-medium tracking-wider">Status</th>
                  <th className="py-2.5 px-4 font-medium tracking-wider">Latency</th>
                  <th className="py-2.5 px-4 font-medium tracking-wider min-w-[280px]">
                    Input Summary
                  </th>
                  <th className="py-2.5 px-4 font-medium tracking-wider min-w-[240px]">
                    Prediction / Output
                  </th>
                  <th className="py-2.5 px-4 font-medium tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-variant/20">
                {filteredRecords.map((item) => {
                  const isSuccess = item.status === 'SUCCESS';
                  return (
                    <tr
                      key={item.id}
                      onClick={() => setSelectedRecord(item)}
                      className={`hover:bg-surface-container-low/70 transition-colors group cursor-pointer ${
                        !isSuccess ? 'bg-error-container/10 hover:bg-error-container/20' : ''
                      }`}
                    >
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        <span className="font-code-sm text-code-sm text-on-surface">
                          {item.timestamp}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        <span className="font-code-sm text-code-sm text-on-surface-variant bg-surface-container px-1.5 py-0.5 rounded">
                          {item.version}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        {isSuccess ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded font-label-caps text-label-caps bg-secondary/10 text-secondary font-semibold">
                            <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
                            SUCCESS
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded font-label-caps text-label-caps bg-error-container text-on-error-container font-semibold">
                            <span className="w-1.5 h-1.5 rounded-full bg-error"></span>
                            FAILED
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        <span
                          className={`font-code-sm text-code-sm font-medium ${
                            isSuccess ? 'text-on-surface' : 'text-error'
                          }`}
                        >
                          {item.latencyMs.toLocaleString()}ms
                        </span>
                      </td>
                      <td className="py-2.5 px-4 max-w-[320px]">
                        <div className="font-code-sm text-code-sm text-on-surface-variant truncate bg-surface-container/50 px-2 py-1 rounded">
                          {JSON.stringify(item.inputSummary)}
                        </div>
                      </td>
                      <td className="py-2.5 px-4 max-w-[260px]">
                        <div
                          className={`font-code-sm text-code-sm truncate px-2 py-1 rounded font-medium ${
                            isSuccess
                              ? 'text-on-surface bg-surface-container/30'
                              : 'text-error bg-error-container/30'
                          }`}
                        >
                          {JSON.stringify(item.outputSummary)}
                        </div>
                      </td>
                      <td
                        className="py-2.5 px-4 text-right whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setSelectedRecord(item)}
                            className="px-2 py-1 rounded hover:bg-surface-container text-on-surface font-label-default text-label-default transition-colors cursor-pointer"
                          >
                            View
                          </button>
                          <button
                            onClick={(e) => handleReplay(item, e)}
                            className="p-1 rounded hover:bg-surface-container text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
                            title="Replay Inference"
                          >
                            <span className="material-symbols-outlined text-[15px]">replay</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Compact Pagination Controls Footer */}
          <div className="bg-surface-container-low px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-space-3 border-t border-surface-variant/40">
            <div className="flex items-center gap-space-2 text-on-surface-variant font-code-sm text-code-sm">
              <span>
                Showing <strong className="text-on-surface">1-{filteredRecords.length}</strong> of{' '}
                <strong className="text-on-surface">{metrics.requests.toLocaleString()}</strong> requests
              </span>
              <span className="text-outline">·</span>
              <span>Sample window: Last 24 Hours</span>
            </div>

            <div className="flex items-center gap-space-4">
              <span className="font-code-sm text-code-sm text-on-surface-variant">Page 1 of 74</span>
              <div className="flex items-center gap-1">
                <button
                  disabled
                  className="px-2.5 py-1 rounded bg-surface-container text-on-surface-variant/40 font-code-sm text-code-sm cursor-not-allowed flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-[14px]">chevron_left</span>
                  Prev
                </button>
                <button
                  onClick={() => onShowToast('Pagination: loaded next 25 rows')}
                  className="px-2.5 py-1 rounded bg-surface-container-lowest hover:bg-surface text-on-surface font-code-sm text-code-sm shadow-xs transition-colors flex items-center gap-1 cursor-pointer border border-surface-variant/30"
                >
                  Next
                  <span className="material-symbols-outlined text-[14px]">chevron_right</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Telemetry Inspector Drawer (Modal Overlay) */}
      {selectedRecord && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-inverse-surface/35 backdrop-blur-xs animate-fade-in"
          onClick={() => setSelectedRecord(null)}
        >
          <div
            className="w-full max-w-xl bg-surface-container-lowest h-full shadow-xl flex flex-col justify-between overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-space-6 flex flex-col gap-space-4">
              <div className="flex items-center justify-between pb-space-3 border-b border-surface-variant/30">
                <div>
                  <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">
                    Execution Telemetry
                  </span>
                  <h2 className="font-headline-md text-headline-md text-on-surface font-semibold">
                    Request #{selectedRecord.id} Details
                  </h2>
                </div>
                <button
                  onClick={() => setSelectedRecord(null)}
                  className="w-8 h-8 rounded flex items-center justify-center hover:bg-surface-container text-on-surface-variant transition-colors cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>

              {/* Metadata Badges */}
              <div className="grid grid-cols-3 gap-space-2 p-space-3 bg-surface-container-low rounded-lg border border-surface-variant/30">
                <div>
                  <span className="font-label-caps text-label-caps text-on-surface-variant uppercase block">
                    Status
                  </span>
                  <span
                    className={`font-code-sm text-code-sm font-semibold ${
                      selectedRecord.status === 'SUCCESS' ? 'text-secondary' : 'text-error'
                    }`}
                  >
                    {selectedRecord.status}
                  </span>
                </div>
                <div>
                  <span className="font-label-caps text-label-caps text-on-surface-variant uppercase block">
                    Execution Time
                  </span>
                  <span className="font-code-sm text-code-sm font-medium text-on-surface">
                    {selectedRecord.latencyMs}ms
                  </span>
                </div>
                <div>
                  <span className="font-label-caps text-label-caps text-on-surface-variant uppercase block">
                    Model Endpoint
                  </span>
                  <span className="font-code-sm text-code-sm text-on-surface">
                    {selectedRecord.endpoint}
                  </span>
                </div>
              </div>

              {/* Raw Request Body */}
              <div className="flex flex-col gap-space-2 mt-space-2">
                <div className="flex items-center justify-between">
                  <span className="font-label-default text-label-default text-on-surface font-semibold">
                    Raw Request Body
                  </span>
                  <button
                    onClick={() => handleCopyText(selectedRecord.fullInput, 'Request payload')}
                    className="font-code-sm text-code-sm text-secondary hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[13px]">content_copy</span> Copy
                  </button>
                </div>
                <pre className="bg-primary-container text-inverse-on-surface p-space-3 rounded-lg font-code-sm text-code-sm overflow-x-auto">
                  <code>{selectedRecord.fullInput}</code>
                </pre>
              </div>

              {/* Inference Response */}
              <div className="flex flex-col gap-space-2 mt-space-2">
                <div className="flex items-center justify-between">
                  <span className="font-label-default text-label-default text-on-surface font-semibold">
                    Inference Response
                  </span>
                  <button
                    onClick={() => handleCopyText(selectedRecord.fullOutput, 'Response payload')}
                    className="font-code-sm text-code-sm text-secondary hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[13px]">content_copy</span> Copy
                  </button>
                </div>
                <pre className="bg-primary-container text-inverse-on-surface p-space-3 rounded-lg font-code-sm text-code-sm overflow-x-auto">
                  <code>{selectedRecord.fullOutput}</code>
                </pre>
              </div>

              {/* Trace Info */}
              <div className="p-space-3 rounded-lg bg-surface-container flex flex-col gap-1 border border-surface-variant/30">
                <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">
                  OpenTelemetry Trace ID
                </span>
                <span className="font-code-sm text-code-sm text-on-surface select-all">
                  {selectedRecord.traceId}
                </span>
              </div>
            </div>

            <div className="p-space-4 bg-surface-container-low flex items-center justify-end gap-space-2 border-t border-surface-variant/30">
              <button
                onClick={() => setSelectedRecord(null)}
                className="px-space-3 py-1.5 rounded bg-surface-container-lowest text-on-surface font-label-default text-label-default hover:bg-surface transition-colors shadow-xs border border-surface-variant/30 cursor-pointer"
              >
                Close
              </button>
              <button
                onClick={() => {
                  handleReplay(selectedRecord);
                  setSelectedRecord(null);
                }}
                className="px-space-3 py-1.5 rounded bg-primary text-on-primary font-label-default text-label-default hover:bg-primary-container transition-colors shadow-sm flex items-center gap-1.5 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[15px]">replay</span>
                Replay Query
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
