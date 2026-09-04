import React, { useRef, useState } from 'react';
import { ModelItem, ModelVersion, ScreenType } from '../types';
import {
  createModelVersion,
  deployModelVersion,
  undeployModelVersion,
  uploadModelArtifact,
} from '../lib/model-api';

interface ModelDetailScreenProps {
  model: ModelItem;
  onBack: () => void;
  onNavigate: (screen: ScreenType) => void;
  onShowToast: (msg: string) => void;
  onUpdateModel: (updatedModel: ModelItem) => void;
  onDeleteModel: (modelId: string) => void;
  onRefresh: () => Promise<void>;
}

export const ModelDetailScreen: React.FC<ModelDetailScreenProps> = ({
  model,
  onBack,
  onNavigate,
  onShowToast,
  onUpdateModel,
  onDeleteModel,
  onRefresh,
}) => {
  const [selectedArtifactVersion, setSelectedArtifactVersion] = useState<ModelVersion | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [newVersionTag, setNewVersionTag] = useState('');
  const [newFramework, setNewFramework] = useState('sklearn');
  const [newFileSize, setNewFileSize] = useState('1.2 GB');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploadingVersion, setIsUploadingVersion] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCopyEndpoint = (url: string) => {
    navigator.clipboard.writeText(url);
    onShowToast('Production endpoint URL copied to clipboard');
  };

  const handleCopyCurl = () => {
    const curl = `curl -X POST \\
  http://localhost:8000/api/v1/models/${model.id}/versions/${model.currentVersion}/predict \\
  -H 'Content-Type: application/json' \\
  -d '{"sku_id": "SKU-992", "history_window": [14, 12, 19, 21]}'`;
    navigator.clipboard.writeText(curl);
    onShowToast('cURL payload copied to clipboard');
  };

  const handleDeployVersion = async (versionId: string) => {
    const targetVersion = model.versions.find((v) => v.id === versionId);

    if (!targetVersion) {
      onShowToast('Version not found');
      return;
    }

    if (targetVersion.status !== 'validated' && targetVersion.status !== 'deployed') {
      onShowToast('Only validated versions can be deployed');
      return;
    }

    try {
      await deployModelVersion(model.id, targetVersion.version);
      await onRefresh();
      onShowToast(`Version ${targetVersion.version} deployed successfully`);
    } catch (error) {
      console.error('Failed to deploy version:', error);
      onShowToast(
        error instanceof Error ? error.message : 'Failed to deploy version',
      );
    }
  };

  const handleUndeployVersion = async (versionId: string) => {
    const targetVersion = model.versions.find((v) => v.id === versionId);

    if (!targetVersion) {
      onShowToast('Version not found');
      return;
    }

    try {
      await undeployModelVersion(model.id, targetVersion.version);
      await onRefresh();
      onShowToast(`Version ${targetVersion.version} undeployed`);
    } catch (error) {
      console.error('Failed to undeploy version:', error);
      onShowToast(
        error instanceof Error ? error.message : 'Failed to undeploy version',
      );
    }
  };

  const handleDeleteVersion = (versionId: string) => {
    if (model.versions.length <= 1) {
      onShowToast('Cannot delete the sole version. Delete the model instead.');
      return;
    }
    const updatedVersions = model.versions.filter((v) => v.id !== versionId);
    onUpdateModel({
      ...model,
      versionsCount: updatedVersions.length,
      versions: updatedVersions,
    });
    onShowToast(`Version ${versionId} deleted`);
  };

  const handleUploadVersionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const version = newVersionTag.trim();

    if (!version) {
      onShowToast('Version tag is required');
      return;
    }

    if (!selectedFile) {
      onShowToast('Please select an artifact file');
      return;
    }

    setIsUploadingVersion(true);

    try {
      const created = await createModelVersion(model.id, {
        version,
        artifact_path: `pending/${selectedFile.name}`,
        framework: newFramework,
      });

      await uploadModelArtifact(model.id, created.version, selectedFile);

      await onRefresh();
      onShowToast(`Version ${version} uploaded and validated`);
      setIsUploadModalOpen(false);
      setNewVersionTag('');
      setSelectedFile(null);
      setNewFileSize('1.2 GB');

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

    } catch (error) {
      onShowToast(
        error instanceof Error
          ? error.message
          : 'Failed to upload model version',
      );
    } finally {
      setIsUploadingVersion(false);
    }
  };

  return (
    <div className="flex flex-col w-full pb-space-12">
      {/* Breadcrumb and Header */}
      <div className="flex flex-col gap-space-4 pt-space-4 pb-space-6">
        <nav className="flex items-center gap-space-2 font-label-default text-label-default">
          <button
            onClick={onBack}
            className="text-on-surface-variant hover:text-on-surface transition-colors flex items-center gap-1 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[14px]">arrow_back</span>
            <span>Models</span>
          </button>
          <span className="text-outline-variant font-code-sm">/</span>
          <span className="text-on-surface font-headline-sm">{model.name}</span>
        </nav>

        <div className="flex flex-wrap items-start justify-between gap-space-4">
          <div className="flex flex-col gap-space-2 min-w-0 max-w-3xl">
            <div className="flex flex-wrap items-center gap-space-3">
              <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight font-semibold">
                {model.name}
              </h1>
              <span className="inline-flex items-center px-space-2 py-0.5 rounded bg-surface-container text-on-surface-variant font-label-caps text-label-caps uppercase tracking-wider font-semibold">
                {model.task}
              </span>
              <span className="inline-flex items-center gap-1 px-space-2 py-0.5 rounded bg-surface-container-high text-on-surface-variant font-code-sm text-code-sm">
                <span className="text-outline-variant">#</span>
                {model.modelCode}
              </span>
            </div>
            <p className="font-body-lg text-body-lg text-on-surface-variant">
              {model.description}
            </p>
          </div>

          <div className="flex items-center gap-space-3">
            <button
              onClick={() => {
                if (confirm(`Are you sure you want to delete model "${model.name}"?`)) {
                  onDeleteModel(model.id);
                  onShowToast(`Model ${model.name} deleted`);
                  onBack();
                }
              }}
              className="px-space-3 py-1.5 rounded bg-error-container/30 hover:bg-error-container text-error hover:text-on-error-container transition-colors flex items-center gap-1.5 font-label-default text-label-default cursor-pointer"
              id="deleteModelTrigger"
            >
              <span className="material-symbols-outlined text-[16px]">delete</span>
              <span>Delete Model</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-space-6 mt-space-2 shadow-sm bg-surface-container-lowest px-space-4 rounded border border-surface-variant/30">
          <button className="relative py-space-3 font-label-default text-label-default text-on-surface font-semibold flex items-center gap-2 cursor-pointer">
            <span>Overview</span>
            <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"></div>
          </button>
          <button
            onClick={() => onNavigate('inference')}
            className="py-space-3 font-label-default text-label-default text-on-surface-variant hover:text-on-surface transition-colors flex items-center gap-2 cursor-pointer"
          >
            <span>Inference</span>
            <span className="px-1.5 py-0.5 rounded-full bg-surface-container font-code-sm text-[10px]">
              API
            </span>
          </button>
          <button
            onClick={() => onNavigate('monitoring')}
            className="py-space-3 font-label-default text-label-default text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
          >
            Metrics
          </button>
          <button
            onClick={() => onNavigate('history')}
            className="py-space-3 font-label-default text-label-default text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
          >
            History
          </button>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-space-6 items-start">
        {/* Left 8 cols: Model Versions list */}
        <div className="xl:col-span-8 flex flex-col gap-space-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-space-2">
              <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                Model Versions
              </h2>
              <span className="px-space-2 py-0.5 rounded bg-surface-container text-on-surface-variant font-code-sm text-code-sm font-medium">
                {model.versions.length} versions
              </span>
            </div>
            <button
              onClick={() => setIsUploadModalOpen(true)}
              className="px-space-3 py-1.5 rounded bg-surface-container-lowest hover:bg-surface-container text-on-surface shadow-sm hover:shadow transition-all flex items-center gap-1.5 font-label-default text-label-default font-medium cursor-pointer border border-surface-variant/40"
            >
              <span className="material-symbols-outlined text-[16px]">upload_file</span>
              <span>+ Upload New Version</span>
            </button>
          </div>

          {/* Versions Render */}
          {model.versions.map((ver) => {
            const isDeployed = ver.status === 'deployed';
            const isValidated = ver.status === 'validated';
            const isRetired = ver.status === 'retired';

            return (
              <div
                key={ver.id}
                className={`bg-surface-container-lowest rounded-lg p-space-4 shadow-sm flex flex-col gap-space-4 hover:shadow-md transition-shadow border border-surface-variant/40 ${
                  isRetired ? 'opacity-85 hover:opacity-100' : ''
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-space-3">
                  <div className="flex items-center gap-space-3">
                    <span className="font-headline-md text-headline-md text-on-surface font-semibold tracking-tight">
                      {ver.version}
                    </span>

                    {isDeployed && (
                      <span className="inline-flex items-center gap-1.5 px-space-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-label-caps text-label-caps font-semibold tracking-wide">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                        DEPLOYED
                      </span>
                    )}

                    {isValidated && (
                      <span className="inline-flex items-center gap-1.5 px-space-2 py-0.5 rounded bg-surface-container-high text-on-surface-variant font-label-caps text-label-caps font-semibold tracking-wide">
                        <span className="w-1.5 h-1.5 rounded-full bg-outline"></span>
                        VALIDATED
                      </span>
                    )}

                    {isRetired && (
                      <span className="inline-flex items-center gap-1.5 px-space-2 py-0.5 rounded bg-surface-container text-on-surface-variant font-label-caps text-label-caps font-semibold tracking-wide">
                        <span className="w-1.5 h-1.5 rounded-full bg-outline-variant"></span>
                        RETIRED
                      </span>
                    )}

                    <span className="inline-flex items-center gap-1 px-space-2 py-0.5 rounded bg-surface-container-low text-on-surface-variant font-code-sm text-code-sm">
                      <span className="material-symbols-outlined text-[14px]">code</span>
                      {ver.framework}
                    </span>
                  </div>

                  <div className="flex items-center gap-space-2">
                    {isDeployed ? (
                      <button
                        onClick={() => handleUndeployVersion(ver.id)}
                        className="px-space-3 py-1.5 rounded bg-surface-container hover:bg-surface-container-high text-on-surface font-label-default text-label-default font-medium transition-colors cursor-pointer"
                      >
                        Undeploy
                      </button>
                    ) : (
                      <button
                        onClick={() => handleDeployVersion(ver.id)}
                        className={`px-space-3 py-1.5 rounded font-label-default text-label-default font-medium transition-colors shadow-sm cursor-pointer ${
                          isValidated
                            ? 'bg-primary hover:bg-inverse-surface text-on-primary'
                            : 'bg-surface-container hover:bg-surface-container-high text-on-surface'
                        }`}
                      >
                        Deploy
                      </button>
                    )}

                    <button
                      onClick={() => setSelectedArtifactVersion(ver)}
                      className="px-space-2.5 py-1.5 rounded bg-transparent hover:bg-surface-container text-on-surface-variant hover:text-on-surface font-label-default text-label-default transition-colors cursor-pointer"
                    >
                      Artifact Details
                    </button>

                    <button
                      onClick={() => handleDeleteVersion(ver.id)}
                      className="p-1.5 rounded hover:bg-error-container/40 text-on-surface-variant hover:text-error transition-colors cursor-pointer"
                      title="Delete Version"
                    >
                      <span className="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                  </div>
                </div>

                {/* Sub-grid: Artifact Registry & Timeline */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-space-3 pt-space-2 bg-surface-container-low/60 rounded p-space-3">
                  <div className="flex flex-col gap-1">
                    <span className="font-label-caps text-label-caps text-on-surface-variant uppercase font-medium">
                      Artifact Registry
                    </span>
                    <div className="flex items-center gap-1.5 font-code-sm text-code-sm text-on-surface font-medium">
                      {ver.isVerified ? (
                        <>
                          <span className="material-symbols-outlined text-[16px] text-secondary">
                            verified
                          </span>
                          <span>
                            {ver.artifactName} ({ver.artifactSize})
                          </span>
                          <span className="text-on-surface-variant font-normal">· Verified</span>
                        </>
                      ) : (
                        <>
                          <span className="material-symbols-outlined text-[16px] text-on-surface-variant">
                            inventory_2
                          </span>
                          <span>
                            {ver.artifactName} ({ver.artifactSize})
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-1">
                    <span className="font-label-caps text-label-caps text-on-surface-variant uppercase font-medium">
                      Registered Timeline
                    </span>
                    <div className="flex items-center gap-1.5 font-code-sm text-code-sm text-on-surface">
                      <span className="material-symbols-outlined text-[16px] text-on-surface-variant">
                        {ver.registeredAgo ? 'schedule' : 'calendar_today'}
                      </span>
                      <span>{ver.registeredDate}</span>
                      {ver.registeredAgo && (
                        <span className="text-on-surface-variant">· {ver.registeredAgo}</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Production Endpoint for Deployed version */}
                {isDeployed && ver.endpointUrl && (
                  <div className="flex flex-col gap-1.5 pt-1">
                    <span className="font-label-caps text-label-caps text-on-surface-variant uppercase font-medium">
                      Production Endpoint
                    </span>
                    <div className="flex items-center justify-between bg-surface-container-lowest rounded px-space-3 py-2 shadow-xs border border-surface-variant/40">
                      <div className="flex items-center gap-2 min-w-0 font-code-sm text-code-sm text-on-surface">
                        <span className="px-1.5 py-0.5 rounded bg-surface-container-high text-primary font-bold text-[10px]">
                          POST
                        </span>
                        <span className="truncate">{ver.endpointUrl}</span>
                      </div>
                      <button
                        onClick={() => handleCopyEndpoint(ver.endpointUrl!)}
                        className="text-on-surface-variant hover:text-on-surface transition-colors p-1 rounded hover:bg-surface-container cursor-pointer"
                        title="Copy endpoint"
                      >
                        <span className="material-symbols-outlined text-[16px]">content_copy</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Right 4 cols: Telemetry & Diagnostic Panel */}
        <div className="xl:col-span-4 flex flex-col gap-space-4">
          {/* Runtime Telemetry Card */}
          <div className="bg-surface-container-lowest rounded-lg p-space-4 shadow-sm flex flex-col gap-space-4 border border-surface-variant/40">
            <div className="flex items-center justify-between pb-space-2">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary text-[18px]">
                  monitoring
                </span>
                <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                  Runtime Telemetry
                </span>
              </div>
              <span className="font-label-caps text-label-caps px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold">
                ONLINE
              </span>
            </div>

            {/* Latency Chart Preview */}
            <div className="flex flex-col gap-1 bg-surface-container-low rounded p-space-3">
              <div className="flex items-center justify-between">
                <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">
                  P95 Inference Latency
                </span>
                <span className="font-code-sm text-code-sm text-on-surface font-semibold">
                  {model.runtimeTelemetry.p95LatencyMs} ms
                </span>
              </div>
              <div className="h-16 w-full flex items-end pt-2">
                <svg
                  className="w-full h-full text-secondary"
                  preserveAspectRatio="none"
                  viewBox="0 0 100 40"
                >
                  <path
                    d="M0 32 Q 10 28, 20 29 T 40 22 T 60 16 T 80 18 T 100 12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    vectorEffect="non-scaling-stroke"
                  />
                  <path
                    d="M0 32 Q 10 28, 20 29 T 40 22 T 60 16 T 80 18 T 100 12 L 100 40 L 0 40 Z"
                    fill="currentColor"
                    fillOpacity="0.1"
                  />
                </svg>
              </div>
            </div>

            {/* VRAM & Throughput Tiles */}
            <div className="grid grid-cols-2 gap-space-3">
              <div className="p-space-3 bg-surface-container-low rounded flex flex-col gap-1">
                <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">
                  VRAM Allocation
                </span>
                <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                  {model.runtimeTelemetry.vramAllocatedGb} / {model.runtimeTelemetry.vramTotalGb} GB
                </span>
                <div className="w-full bg-surface-container-high rounded-full h-1.5 mt-1 overflow-hidden">
                  <div
                    className="bg-secondary h-full rounded-full"
                    style={{
                      width: `${(model.runtimeTelemetry.vramAllocatedGb / model.runtimeTelemetry.vramTotalGb) * 100}%`,
                    }}
                  ></div>
                </div>
              </div>

              <div className="p-space-3 bg-surface-container-low rounded flex flex-col gap-1">
                <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">
                  Throughput
                </span>
                <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                  {model.runtimeTelemetry.throughputReqMin} req/m
                </span>
                <span className="font-code-sm text-[10px] text-emerald-700 flex items-center gap-0.5 mt-1 font-medium">
                  <span className="material-symbols-outlined text-[12px]">trending_up</span> +
                  {model.runtimeTelemetry.throughputChangePct}% vs last hr
                </span>
              </div>
            </div>

            {/* Quick Spec Details */}
            <div className="flex flex-col gap-2 pt-space-2 border-t border-surface-variant/30">
              <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">
                Hardware Binding
              </span>
              <div className="flex items-center justify-between text-on-surface font-code-sm text-code-sm py-1">
                <span className="text-on-surface-variant">Compute Device</span>
                <span>{model.hardwareBinding.computeDevice}</span>
              </div>
              <div className="flex items-center justify-between text-on-surface font-code-sm text-code-sm py-1">
                <span className="text-on-surface-variant">Batch Window</span>
                <span>{model.hardwareBinding.batchWindow}</span>
              </div>
              <div className="flex items-center justify-between text-on-surface font-code-sm text-code-sm py-1">
                <span className="text-on-surface-variant">Quantization</span>
                <span>{model.hardwareBinding.quantization}</span>
              </div>
            </div>
          </div>

          {/* Quick Test Payload Card */}
          <div className="bg-surface-container-lowest rounded-lg p-space-4 shadow-sm flex flex-col gap-space-3 border border-surface-variant/40">
            <div className="flex items-center justify-between">
              <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                Live Payload Probe
              </span>
              <button
                onClick={handleCopyCurl}
                className="font-code-sm text-code-sm text-on-surface-variant hover:text-on-surface flex items-center gap-1 cursor-pointer"
              >
                <span>cURL</span>
                <span className="material-symbols-outlined text-[14px]">content_copy</span>
              </button>
            </div>
            <div
              onClick={handleCopyCurl}
              className="bg-primary-container text-on-primary p-space-3 rounded font-code-sm text-code-sm overflow-x-auto select-all cursor-pointer hover:opacity-95 transition-opacity"
              title="Click to copy cURL command"
            >
              <code className="text-secondary-fixed">
                curl -X POST \
  http://localhost:8000/api/v1/models/{model.id}/versions/{model.currentVersion}/predict \
  -H &apos;Content-Type: application/json&apos; \
  -d &apos;{JSON.stringify({ sku_id: 'SKU-992', history_window: [14, 12, 19, 21] })}&apos;
              </code>
            </div>
          </div>
        </div>
      </div>

      {/* Artifact Details Modal */}
      {selectedArtifactVersion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-inverse-surface/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg bg-surface-container-lowest rounded-lg shadow-xl border border-surface-variant overflow-hidden">
            <div className="flex items-center justify-between px-space-4 py-space-3 border-b border-surface-variant bg-surface-container-low">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]">inventory_2</span>
                <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                  Artifact Details: {selectedArtifactVersion.version}
                </span>
              </div>
              <button
                onClick={() => setSelectedArtifactVersion(null)}
                className="p-1 rounded hover:bg-surface-container text-on-surface-variant"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            <div className="p-space-4 flex flex-col gap-space-3">
              <div className="grid grid-cols-2 gap-space-2 p-space-3 bg-surface-container-low rounded">
                <div>
                  <span className="font-label-caps uppercase text-on-surface-variant block">Filename</span>
                  <span className="font-code-sm font-medium text-on-surface">{selectedArtifactVersion.artifactName}</span>
                </div>
                <div>
                  <span className="font-label-caps uppercase text-on-surface-variant block">Size on Disk</span>
                  <span className="font-code-sm font-medium text-on-surface">{selectedArtifactVersion.artifactSize}</span>
                </div>
                <div className="mt-2">
                  <span className="font-label-caps uppercase text-on-surface-variant block">Framework</span>
                  <span className="font-code-sm text-on-surface">{selectedArtifactVersion.framework}</span>
                </div>
                <div className="mt-2">
                  <span className="font-label-caps uppercase text-on-surface-variant block">Integrity Check</span>
                  <span className="font-code-sm text-secondary font-semibold">SHA256 Validated</span>
                </div>
              </div>

              <div>
                <span className="font-label-caps uppercase text-on-surface-variant block mb-1">Local Storage Path</span>
                <code className="block p-2 bg-surface-container rounded font-code-sm text-code-sm text-on-surface select-all">
                  /var/lib/modeldock/artifacts/{model.slug}/{selectedArtifactVersion.version}/{selectedArtifactVersion.artifactName}
                </code>
              </div>

              <div>
                <span className="font-label-caps uppercase text-on-surface-variant block mb-1">Runtime Container Image</span>
                <code className="block p-2 bg-surface-container rounded font-code-sm text-code-sm text-on-surface select-all">
                  modeldock/runner-pytorch:2.1.0-cuda12.1-cudnn8-runtime
                </code>
              </div>

              <div className="pt-space-2 border-t border-surface-variant flex items-center justify-end">
                <button
                  onClick={() => setSelectedArtifactVersion(null)}
                  className="px-3 py-1.5 rounded bg-primary text-on-primary font-label-default text-label-default cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Upload New Version Modal */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-inverse-surface/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg bg-surface-container-lowest rounded-lg shadow-xl border border-surface-variant overflow-hidden">
            <div className="flex items-center justify-between px-space-4 py-space-3 border-b border-surface-variant bg-surface-container-low">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]">upload_file</span>
                <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                  Upload New Version
                </span>
              </div>
              <button
                onClick={() => setIsUploadModalOpen(false)}
                className="p-1 rounded hover:bg-surface-container text-on-surface-variant"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <form onSubmit={handleUploadVersionSubmit} className="p-space-4 flex flex-col gap-space-3">
              <div>
                <label className="font-label-caps uppercase text-on-surface-variant block mb-1">
                  Version Semantic Tag
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. v1.3.0"
                  value={newVersionTag}
                  onChange={(e) => setNewVersionTag(e.target.value)}
                  className="w-full h-8 px-2.5 bg-surface-container-low text-on-surface rounded border border-outline-variant font-code-sm text-code-sm focus:outline-none focus:border-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-space-3">
                <div>
                  <label className="font-label-caps uppercase text-on-surface-variant block mb-1">
                    Framework
                  </label>
                  <select
                      value={newFramework}
                      onChange={(e) => setNewFramework(e.target.value)}
                      className="w-full h-8 px-2 bg-surface-container-low text-on-surface rounded border border-outline-variant font-label-default text-label-default focus:outline-none"
                    >
                      <option value="sklearn">sklearn</option>
                      <option value="python">python</option>
                      <option value="json">json</option>
                    </select>
                </div>
                <div>
                  <label className="font-label-caps uppercase text-on-surface-variant block mb-1">
                    Artifact Weights Size
                  </label>
                  <input
                    type="text"
                    value={newFileSize}
                    onChange={(e) => setNewFileSize(e.target.value)}
                    className="w-full h-8 px-2.5 bg-surface-container-low text-on-surface rounded border border-outline-variant font-code-sm text-code-sm focus:outline-none"
                  />
                </div>
              </div>

              <div onClick={() => fileInputRef.current?.click()}
                  className="p-space-4 border-2 border-dashed border-outline-variant rounded-lg text-center hover:bg-surface-container-low transition-colors cursor-pointer">
                <span className="material-symbols-outlined text-[28px] text-on-surface-variant mb-1">
                  cloud_upload
                </span>
                <p className="font-body-default text-on-surface font-medium">
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    setSelectedFile(file);

                    if (file) {
                      setNewFileSize(
                        `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
                      );
                    }
                  }}
                />

                  {selectedFile ? selectedFile.name : 'Drag & drop weights file (.joblib, .pt, .onnx, .bin)'}
                </p>
                <p className="font-code-sm text-code-sm text-on-surface-variant mt-1">
                  {selectedFile ? `${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB selected` : 'or click to select file from local disk'}
                </p>
              </div>

              <div className="pt-space-2 border-t border-surface-variant flex items-center justify-end gap-space-2">
                <button
                  type="button"
                  onClick={() => setIsUploadModalOpen(false)}
                  className="px-3 py-1.5 rounded bg-surface-container text-on-surface font-label-default text-label-default hover:bg-surface-container-high transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded bg-primary text-on-primary font-label-default text-label-default hover:opacity-90 transition-opacity"
                >
                  Upload & Register
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};


