import React, { useState, useMemo } from 'react';
import { ModelItem, ModelStatus } from '../types';

interface ModelRegistryScreenProps {
  models: ModelItem[];
  onSelectModel: (model: ModelItem) => void;
  onShowToast: (msg: string) => void;
  onAddNewModel?: (newModel: Partial<ModelItem>) => void;
}

export const ModelRegistryScreen: React.FC<ModelRegistryScreenProps> = ({
  models,
  onSelectModel,
  onShowToast,
  onAddNewModel,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ModelStatus>('all');
  const [frameworkFilter, setFrameworkFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);

  // New model modal state
  const [newModelName, setNewModelName] = useState('');
  const [newTask, setNewTask] = useState('Regression');
  const [newFramework, setNewFramework] = useState('PyTorch 2.1');
  const [newVersion, setNewVersion] = useState('v1.0.0');
  const [newDescription, setNewDescription] = useState('');

  const deployedCount = useMemo(
    () => models.filter((m) => m.status === 'deployed').length,
    [models]
  );
  const validatedCount = useMemo(
    () => models.filter((m) => m.status === 'validated').length,
    [models]
  );
  const retiredCount = useMemo(
    () => models.filter((m) => m.status === 'retired').length,
    [models]
  );

  const filteredModels = useMemo(() => {
    return models.filter((m) => {
      const matchesSearch =
        m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.task.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || m.status === statusFilter;
      const matchesFramework =
        frameworkFilter === 'all' ||
        m.framework.toLowerCase().includes(frameworkFilter.toLowerCase());
      return matchesSearch && matchesStatus && matchesFramework;
    });
  }, [models, searchQuery, statusFilter, frameworkFilter]);

  const handleCopyCli = () => {
    navigator.clipboard.writeText('modeldock push --target=demand-forecaster:v3.3');
    onShowToast('CLI push command copied to clipboard');
  };

  const handleCreateNewModel = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newModelName.trim()) return;
    if (onAddNewModel) {
      onAddNewModel({
        name: newModelName.trim().toLowerCase().replace(/\s+/g, '-'),
        slug: newModelName.trim().toLowerCase().replace(/\s+/g, '-'),
        task: newTask,
        framework: newFramework,
        currentVersion: newVersion || 'v1.0.0',
        description: newDescription || 'Local-first model container loaded from weights registry.',
        status: 'validated',
        size: '640 MB',
        versionsCount: 1,
        lastUpdated: 'Just now',
        callsPerHour: 0,
        sparklineData: [0, 2, 4, 8, 12, 10, 15],
      });
      onShowToast(`Model ${newModelName} registered successfully`);
    }
    setIsRegisterModalOpen(false);
    setNewModelName('');
    setNewDescription('');
  };

  return (
    <div className="flex flex-col w-full pb-space-12">
      {/* Top Context & Header Row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-4 pb-space-6">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-space-2 text-on-surface-variant font-label-caps text-label-caps tracking-wider">
            <span>PLATFORM</span>
            <span className="text-on-surface-variant/40">/</span>
            <span className="text-primary font-semibold">REGISTRY</span>
          </div>
          <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight font-semibold">
            Models
          </h1>
          <p className="font-body-default text-body-default text-on-surface-variant">
            Local models registered and managed on this host environment.
          </p>
        </div>

        {/* Action Button */}
        <div className="flex items-center gap-space-3">
          <button
            onClick={() => setIsRegisterModalOpen(true)}
            className="h-8 px-space-3 bg-primary text-on-primary rounded flex items-center gap-1.5 font-label-default text-label-default transition-opacity hover:opacity-90 active:scale-[0.98] shadow-sm cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">add</span>
            <span>New Model</span>
          </button>
        </div>
      </div>

      {/* Telemetry Summary Ticker Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-space-3 mb-space-6">
        <div className="p-space-3 rounded bg-surface-container-lowest shadow-sm flex flex-col justify-between border border-surface-variant/40">
          <div className="flex items-center justify-between text-on-surface-variant">
            <span className="font-label-caps text-label-caps">ACTIVE ENDPOINTS</span>
            <span className="material-symbols-outlined text-[16px] text-secondary">bolt</span>
          </div>
          <div className="mt-space-2 flex items-baseline gap-space-2">
            <span className="font-display text-headline-lg text-on-surface font-semibold">
              {deployedCount}
            </span>
            <span className="font-code-sm text-code-sm text-on-surface-variant">
              / {models.length} models
            </span>
          </div>
        </div>

        <div className="p-space-3 rounded bg-surface-container-lowest shadow-sm flex flex-col justify-between border border-surface-variant/40">
          <div className="flex items-center justify-between text-on-surface-variant">
            <span className="font-label-caps text-label-caps">TOTAL WEIGHTS</span>
            <span className="material-symbols-outlined text-[16px]">hard_drive</span>
          </div>
          <div className="mt-space-2 flex items-baseline gap-space-2">
            <span className="font-display text-headline-lg text-on-surface font-semibold">1.91</span>
            <span className="font-code-sm text-code-sm text-on-surface-variant">GB VRAM cache</span>
          </div>
        </div>

        <div className="p-space-3 rounded bg-surface-container-lowest shadow-sm flex flex-col justify-between border border-surface-variant/40">
          <div className="flex items-center justify-between text-on-surface-variant">
            <span className="font-label-caps text-label-caps">AVG INFERENCE</span>
            <span className="material-symbols-outlined text-[16px] text-secondary">speed</span>
          </div>
          <div className="mt-space-2 flex items-baseline gap-space-2">
            <span className="font-display text-headline-lg text-on-surface font-semibold">18.4</span>
            <span className="font-code-sm text-code-sm text-on-surface-variant">ms p95</span>
          </div>
        </div>

        <div className="p-space-3 rounded bg-surface-container-lowest shadow-sm flex flex-col justify-between border border-surface-variant/40">
          <div className="flex items-center justify-between text-on-surface-variant">
            <span className="font-label-caps text-label-caps">HOST STATUS</span>
            <span className="inline-block w-2 h-2 rounded-full bg-secondary"></span>
          </div>
          <div className="mt-space-2 flex items-baseline gap-space-2">
            <span className="font-code-default text-code-default text-on-surface font-semibold">
              ONLINE
            </span>
            <span className="font-code-sm text-code-sm text-on-surface-variant">127.0.0.1</span>
          </div>
        </div>
      </div>

      {/* Controls Row */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-space-3 mb-space-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-space-3 flex-1">
          {/* Search Input */}
          <div className="relative min-w-[260px] max-w-md w-full">
            <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[16px] text-on-surface-variant pointer-events-none">
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter models by name or task..."
              className="w-full h-8 pl-8 pr-space-3 bg-surface-container-lowest text-on-surface placeholder:text-on-surface-variant/60 font-body-default text-body-default rounded focus:outline-none focus:ring-1 focus:ring-primary shadow-sm border border-surface-variant/30"
            />
          </div>

          {/* Filter Tabs Group */}
          <div className="flex items-center gap-1 overflow-x-auto py-0.5">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-space-2 py-1 rounded font-label-default text-label-default transition-all whitespace-nowrap shadow-sm cursor-pointer ${
                statusFilter === 'all'
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container-lowest text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
              }`}
            >
              All ({models.length})
            </button>
            <button
              onClick={() => setStatusFilter('deployed')}
              className={`px-space-2 py-1 rounded font-label-default text-label-default transition-all whitespace-nowrap shadow-sm cursor-pointer ${
                statusFilter === 'deployed'
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container-lowest text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
              }`}
            >
              Deployed ({deployedCount})
            </button>
            <button
              onClick={() => setStatusFilter('validated')}
              className={`px-space-2 py-1 rounded font-label-default text-label-default transition-all whitespace-nowrap shadow-sm cursor-pointer ${
                statusFilter === 'validated'
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container-lowest text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
              }`}
            >
              Validated ({validatedCount})
            </button>
            <button
              onClick={() => setStatusFilter('retired')}
              className={`px-space-2 py-1 rounded font-label-default text-label-default transition-all whitespace-nowrap shadow-sm cursor-pointer ${
                statusFilter === 'retired'
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container-lowest text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
              }`}
            >
              Retired ({retiredCount})
            </button>
          </div>
        </div>

        {/* Framework Filter & View Mode Switcher */}
        <div className="flex items-center gap-space-2 self-end lg:self-auto">
          <div className="relative">
            <select
              value={frameworkFilter}
              onChange={(e) => setFrameworkFilter(e.target.value)}
              className="h-8 pl-space-2 pr-7 bg-surface-container-lowest text-on-surface font-label-default text-label-default rounded appearance-none cursor-pointer shadow-sm border border-surface-variant/30 focus:outline-none"
            >
              <option value="all">All Frameworks</option>
              <option value="pytorch">PyTorch</option>
              <option value="xgboost">XGBoost</option>
              <option value="onnx">ONNX Runtime</option>
              <option value="tensorflow">TensorFlow</option>
            </select>
            <span className="material-symbols-outlined absolute right-1.5 top-1/2 -translate-y-1/2 text-[16px] text-on-surface-variant pointer-events-none">
              expand_more
            </span>
          </div>

          <div className="h-8 flex items-center bg-surface-container-lowest rounded p-0.5 shadow-sm border border-surface-variant/30">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1 rounded cursor-pointer ${
                viewMode === 'grid'
                  ? 'bg-surface-container text-on-surface'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
              title="Grid View"
            >
              <span className="material-symbols-outlined text-[16px]">grid_view</span>
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1 rounded cursor-pointer ${
                viewMode === 'list'
                  ? 'bg-surface-container text-on-surface'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
              title="List View"
            >
              <span className="material-symbols-outlined text-[16px]">view_agenda</span>
            </button>
          </div>
        </div>
      </div>

      {/* Models Container */}
      <div
        className={
          viewMode === 'grid'
            ? 'grid grid-cols-1 md:grid-cols-2 gap-space-4'
            : 'grid grid-cols-1 gap-space-3'
        }
      >
        {filteredModels.map((model) => (
          <div
            key={model.id}
            className={`group bg-surface-container-lowest rounded p-space-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between border border-surface-variant/40 ${
              model.status === 'retired' ? 'opacity-85 hover:opacity-100' : ''
            }`}
          >
            <div>
              {/* Top meta info */}
              <div className="flex items-start justify-between gap-space-2">
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-space-2 flex-wrap">
                    <button
                      onClick={() => onSelectModel(model)}
                      className="font-code-default text-headline-sm text-on-surface font-semibold truncate tracking-tight hover:text-secondary text-left"
                    >
                      {model.name}
                    </button>
                    <span className="font-code-sm text-code-sm text-on-surface-variant bg-surface-container px-1.5 py-0.5 rounded">
                      {model.currentVersion}
                    </span>
                  </div>
                  <div className="flex items-center gap-space-2 mt-1.5 flex-wrap">
                    <span className="font-label-caps text-label-caps bg-surface-container px-space-2 py-0.5 rounded text-on-surface">
                      {model.task}
                    </span>
                    <span className="text-on-surface-variant/40 font-code-sm text-code-sm">•</span>
                    <span className="font-body-sm text-body-sm text-on-surface-variant">
                      {model.framework}
                    </span>
                  </div>
                </div>

                {/* Status Badge */}
                {model.status === 'deployed' && (
                  <div className="flex items-center gap-1.5 px-space-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-label-caps text-label-caps font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span>DEPLOYED</span>
                  </div>
                )}
                {model.status === 'validated' && (
                  <div className="flex items-center gap-1.5 px-space-2 py-0.5 rounded bg-surface-container text-on-surface-variant font-label-caps text-label-caps">
                    <span className="w-1.5 h-1.5 rounded-full bg-outline"></span>
                    <span>VALIDATED</span>
                  </div>
                )}
                {model.status === 'retired' && (
                  <div className="flex items-center gap-1.5 px-space-2 py-0.5 rounded bg-surface-container-high text-on-surface-variant/70 font-label-caps text-label-caps">
                    <span className="w-1.5 h-1.5 rounded-full bg-outline-variant"></span>
                    <span>RETIRED</span>
                  </div>
                )}
              </div>

              {/* Mid Card Visualization */}
              {model.status === 'deployed' && (
                <div className="mt-space-4 pt-space-3 bg-surface-container-low rounded p-space-2">
                  <div className="flex items-center justify-between text-on-surface-variant mb-1">
                    <span className="font-label-caps text-label-caps">CALLS (LAST 60M)</span>
                    <span className="font-code-sm text-code-sm text-on-surface font-medium">
                      {model.callsPerHour.toLocaleString()} req/m
                    </span>
                  </div>
                  <svg className="w-full h-7 text-secondary" preserveAspectRatio="none" viewBox="0 0 100 24">
                    <path
                      d={
                        model.slug === 'demand-forecaster'
                          ? 'M0,18 L10,16 L20,20 L30,12 L40,14 L50,8 L60,11 L70,5 L80,9 L90,4 L100,2'
                          : 'M0,15 L12,14 L24,19 L36,18 L48,12 L60,14 L72,10 L84,13 L100,6'
                      }
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.5"
                    />
                  </svg>
                </div>
              )}

              {model.status === 'validated' && (
                <div className="mt-space-4 pt-space-3 bg-surface-container-low rounded p-space-2">
                  <div className="flex items-center justify-between text-on-surface-variant mb-1">
                    <span className="font-label-caps text-label-caps">BENCHMARK EVAL</span>
                    <span className="font-code-sm text-code-sm text-on-surface font-medium">
                      Cosine NDCG: 0.884
                    </span>
                  </div>
                  <div className="w-full bg-surface-container-high h-1.5 rounded overflow-hidden mt-2">
                    <div className="bg-outline h-full w-[88%]"></div>
                  </div>
                </div>
              )}

              {model.status === 'retired' && (
                <div className="mt-space-4 pt-space-3 bg-surface-container-low rounded p-space-2">
                  <div className="flex items-center justify-between text-on-surface-variant">
                    <span className="font-label-caps text-label-caps">ARCHIVE RECORD</span>
                    <span className="font-code-sm text-code-sm text-on-surface-variant">
                      Deprecation signed
                    </span>
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface-variant/70 mt-1 truncate">
                    Superseded by text-embedder-bge inference endpoint.
                  </p>
                </div>
              )}
            </div>

            {/* Card Footer */}
            <div className="mt-space-4 pt-space-3 flex items-center justify-between border-t border-surface-variant/30">
              <div className="flex items-center gap-space-3 text-on-surface-variant font-code-sm text-code-sm">
                <span className="flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">layers</span>
                  <span>{model.versionsCount} versions</span>
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">save</span>
                  <span>{model.size}</span>
                </span>
                <span>•</span>
                <span>{model.lastUpdated}</span>
              </div>
              <button
                onClick={() => onSelectModel(model)}
                className="h-7 px-space-2 rounded bg-surface-container text-on-surface hover:bg-primary hover:text-on-primary transition-colors flex items-center gap-1 font-label-default text-label-default cursor-pointer"
              >
                <span>Open</span>
                <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
              </button>
            </div>
          </div>
        ))}
      </div>

      {filteredModels.length === 0 && (
        <div className="p-space-8 text-center bg-surface-container-lowest rounded border border-surface-variant/40 mt-space-4">
          <span className="material-symbols-outlined text-[32px] text-on-surface-variant mb-2">
            search_off
          </span>
          <p className="font-body-default text-on-surface font-medium">No models match your filter criteria.</p>
          <button
            onClick={() => {
              setSearchQuery('');
              setStatusFilter('all');
              setFrameworkFilter('all');
            }}
            className="mt-2 text-secondary font-code-sm text-code-sm hover:underline cursor-pointer"
          >
            Reset all filters
          </button>
        </div>
      )}

      {/* Quick Command Assist Strip */}
      <div className="mt-space-8 p-space-3 rounded bg-surface-container-lowest shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-space-3 border border-surface-variant/40">
        <div className="flex items-center gap-space-2">
          <span className="material-symbols-outlined text-[16px] text-on-surface-variant">
            terminal
          </span>
          <span className="font-code-sm text-code-sm text-on-surface-variant">CLI sync:</span>
          <code
            onClick={handleCopyCli}
            className="font-code-sm text-code-sm text-on-surface bg-surface-container px-space-2 py-0.5 rounded select-all cursor-pointer hover:bg-surface-container-high transition-colors"
            title="Click to copy"
          >
            modeldock push --target=demand-forecaster:v3.3
          </code>
        </div>
        <div className="flex items-center gap-space-3 text-on-surface-variant font-body-sm text-body-sm">
          <span className="hover:text-on-surface cursor-pointer">Storage quota: 1.91 GB / 20 GB</span>
        </div>
      </div>

      {/* Register New Model Modal */}
      {isRegisterModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-inverse-surface/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg bg-surface-container-lowest rounded-lg shadow-xl border border-surface-variant overflow-hidden">
            <div className="flex items-center justify-between px-space-4 py-space-3 border-b border-surface-variant bg-surface-container-low">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]">add_box</span>
                <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                  Register New Model
                </span>
              </div>
              <button
                onClick={() => setIsRegisterModalOpen(false)}
                className="p-1 rounded hover:bg-surface-container text-on-surface-variant"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            <form onSubmit={handleCreateNewModel} className="p-space-4 flex flex-col gap-space-3">
              <div>
                <label className="font-label-caps uppercase text-on-surface-variant block mb-1">
                  Model Slug / Identifier
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. sentiment-bert-v2"
                  value={newModelName}
                  onChange={(e) => setNewModelName(e.target.value)}
                  className="w-full h-8 px-2.5 bg-surface-container-low text-on-surface rounded border border-outline-variant font-code-sm text-code-sm focus:outline-none focus:border-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-space-3">
                <div>
                  <label className="font-label-caps uppercase text-on-surface-variant block mb-1">
                    Task Type
                  </label>
                  <select
                    value={newTask}
                    onChange={(e) => setNewTask(e.target.value)}
                    className="w-full h-8 px-2 bg-surface-container-low text-on-surface rounded border border-outline-variant font-label-default text-label-default focus:outline-none"
                  >
                    <option>Regression</option>
                    <option>Classification</option>
                    <option>Feature Extraction</option>
                    <option>NLP Sentiment</option>
                    <option>Object Detection</option>
                  </select>
                </div>
                <div>
                  <label className="font-label-caps uppercase text-on-surface-variant block mb-1">
                    Framework
                  </label>
                  <select
                    value={newFramework}
                    onChange={(e) => setNewFramework(e.target.value)}
                    className="w-full h-8 px-2 bg-surface-container-low text-on-surface rounded border border-outline-variant font-label-default text-label-default focus:outline-none"
                  >
                    <option>PyTorch 2.1</option>
                    <option>PyTorch 2.0</option>
                    <option>ONNX Runtime</option>
                    <option>XGBoost 1.7</option>
                    <option>TensorFlow 2.14</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-label-caps uppercase text-on-surface-variant block mb-1">
                  Initial Version Tag
                </label>
                <input
                  type="text"
                  value={newVersion}
                  onChange={(e) => setNewVersion(e.target.value)}
                  className="w-full h-8 px-2.5 bg-surface-container-low text-on-surface rounded border border-outline-variant font-code-sm text-code-sm focus:outline-none"
                />
              </div>

              <div>
                <label className="font-label-caps uppercase text-on-surface-variant block mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Describe purpose, inputs, and output representation..."
                  className="w-full p-2 bg-surface-container-low text-on-surface rounded border border-outline-variant font-body-sm text-body-sm focus:outline-none resize-none"
                />
              </div>

              <div className="pt-space-2 border-t border-surface-variant flex items-center justify-end gap-space-2">
                <button
                  type="button"
                  onClick={() => setIsRegisterModalOpen(false)}
                  className="px-3 py-1.5 rounded bg-surface-container text-on-surface font-label-default text-label-default hover:bg-surface-container-high transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded bg-primary text-on-primary font-label-default text-label-default hover:opacity-90 transition-opacity"
                >
                  Save Model
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
