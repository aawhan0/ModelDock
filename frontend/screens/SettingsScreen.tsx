import React, { useState } from 'react';

interface SettingsScreenProps {
  onShowToast: (msg: string) => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({ onShowToast }) => {
  const [hostPort, setHostPort] = useState('8080');
  const [cudaDevice, setCudaDevice] = useState('cuda:0 (NVIDIA RTX 4090)');
  const [maxVramGb, setMaxVramGb] = useState('16');
  const [enableOtel, setEnableOtel] = useState(true);
  const [storageDir, setStorageDir] = useState('/var/lib/modeldock/artifacts');

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onShowToast('Local engine configuration saved and reloaded');
  };

  return (
    <div className="flex flex-col w-full pb-space-12 max-w-3xl">
      <div className="flex flex-col gap-1 py-space-4">
        <div className="flex items-center gap-space-2 text-on-surface-variant font-label-caps text-label-caps tracking-wider uppercase">
          <span>PLATFORM</span>
          <span>/</span>
          <span className="text-primary font-semibold">SETTINGS</span>
        </div>
        <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight font-semibold">
          Host Configuration
        </h1>
        <p className="font-body-default text-body-default text-on-surface-variant">
          Manage local runtime bindings, hardware acceleration, and telemetry pipelines.
        </p>
      </div>

      <form
        onSubmit={handleSave}
        className="bg-surface-container-lowest rounded-xl p-space-6 shadow-sm border border-surface-variant/40 flex flex-col gap-space-5 mt-space-4"
      >
        <div className="flex flex-col gap-1 border-b border-surface-variant/40 pb-space-4">
          <span className="font-headline-sm text-headline-sm font-semibold text-on-surface">
            Network &amp; Binding
          </span>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            FastAPI server bind address and exposed REST port.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-3 mt-space-2">
            <div>
              <label className="font-label-caps uppercase text-on-surface-variant block mb-1">
                Listen Host
              </label>
              <input
                type="text"
                disabled
                value="127.0.0.1 (Loopback)"
                className="w-full h-8 px-2.5 bg-surface-container-low text-on-surface-variant rounded font-code-sm text-code-sm border border-outline-variant"
              />
            </div>
            <div>
              <label className="font-label-caps uppercase text-on-surface-variant block mb-1">
                HTTP Port
              </label>
              <input
                type="text"
                value={hostPort}
                onChange={(e) => setHostPort(e.target.value)}
                className="w-full h-8 px-2.5 bg-surface-container-low text-on-surface rounded font-code-sm text-code-sm border border-outline-variant focus:outline-none focus:border-primary"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-1 border-b border-surface-variant/40 pb-space-4">
          <span className="font-headline-sm text-headline-sm font-semibold text-on-surface">
            Compute Device &amp; Memory Allocation
          </span>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            Designate CUDA / ROCm GPU accelerators and memory caps.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-3 mt-space-2">
            <div>
              <label className="font-label-caps uppercase text-on-surface-variant block mb-1">
                Primary Accelerator
              </label>
              <select
                value={cudaDevice}
                onChange={(e) => setCudaDevice(e.target.value)}
                className="w-full h-8 px-2 bg-surface-container-low text-on-surface rounded font-label-default text-label-default border border-outline-variant focus:outline-none"
              >
                <option>cuda:0 (NVIDIA RTX 4090)</option>
                <option>cuda:1 (NVIDIA RTX 3080)</option>
                <option>cpu (Host Multithreaded)</option>
                <option>mps (Apple Silicon Metal)</option>
              </select>
            </div>
            <div>
              <label className="font-label-caps uppercase text-on-surface-variant block mb-1">
                Max VRAM Cap (GB)
              </label>
              <input
                type="number"
                value={maxVramGb}
                onChange={(e) => setMaxVramGb(e.target.value)}
                className="w-full h-8 px-2.5 bg-surface-container-low text-on-surface rounded font-code-sm text-code-sm border border-outline-variant focus:outline-none"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-1 border-b border-surface-variant/40 pb-space-4">
          <span className="font-headline-sm text-headline-sm font-semibold text-on-surface">
            Local Weight Storage Path
          </span>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            Filesystem root for downloaded and cached PyTorch/ONNX checkpoints.
          </p>
          <input
            type="text"
            value={storageDir}
            onChange={(e) => setStorageDir(e.target.value)}
            className="w-full h-8 px-2.5 bg-surface-container-low text-on-surface rounded font-code-sm text-code-sm border border-outline-variant focus:outline-none mt-space-2"
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <span className="font-label-default text-label-default font-semibold text-on-surface block">
              OpenTelemetry Export
            </span>
            <span className="font-body-sm text-body-sm text-on-surface-variant">
              Stream spans and latency histograms to local collector (:4317).
            </span>
          </div>
          <input
            type="checkbox"
            checked={enableOtel}
            onChange={(e) => setEnableOtel(e.target.checked)}
            className="w-4 h-4 rounded text-primary focus:ring-primary cursor-pointer"
          />
        </div>

        <div className="pt-space-3 flex justify-end gap-space-2">
          <button
            type="submit"
            className="px-space-4 py-2 rounded bg-primary text-on-primary font-label-default text-label-default hover:bg-primary-container transition-colors shadow-sm cursor-pointer"
          >
            Save Configuration
          </button>
        </div>
      </form>
    </div>
  );
};
