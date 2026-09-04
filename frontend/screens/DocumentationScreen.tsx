import React from 'react';

interface DocumentationScreenProps {
  onShowToast: (msg: string) => void;
}

export const DocumentationScreen: React.FC<DocumentationScreenProps> = ({ onShowToast }) => {
  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    onShowToast('Snippet copied to clipboard');
  };

  return (
    <div className="flex flex-col w-full pb-space-12 max-w-4xl">
      <div className="flex flex-col gap-1 py-space-4">
        <div className="flex items-center gap-space-2 text-on-surface-variant font-label-caps text-label-caps tracking-wider uppercase">
          <span>DEVELOPER</span>
          <span>/</span>
          <span className="text-primary font-semibold">DOCUMENTATION</span>
        </div>
        <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight font-semibold">
          ModelDock Engine API Reference
        </h1>
        <p className="font-body-default text-body-default text-on-surface-variant">
          Local-first ML model serving platform specifications and CLI integration guide.
        </p>
      </div>

      <div className="flex flex-col gap-space-6 mt-space-4">
        {/* Quickstart CLI */}
        <div className="bg-surface-container-lowest rounded-xl p-space-6 shadow-sm border border-surface-variant/40 flex flex-col gap-space-3">
          <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
            1. Install &amp; Push Models via CLI
          </h2>
          <p className="font-body-default text-body-default text-on-surface-variant">
            You can register and push weights directly from your training machine or notebooks:
          </p>
          <div className="relative">
            <pre className="p-space-4 bg-primary-container text-inverse-on-surface rounded-lg font-code-sm text-code-sm overflow-x-auto">
              <code>{`# Install CLI
pip install modeldock-cli

# Register and upload PyTorch checkpoint
modeldock push \\
  --target=demand-forecaster:v1.3.0 \\
  --weights=./checkpoints/model_best.pt \\
  --framework=pytorch-2.1 \\
  --task=regression`}</code>
            </pre>
            <button
              onClick={() =>
                handleCopyCode(`pip install modeldock-cli\nmodeldock push --target=demand-forecaster:v1.3.0 --weights=./checkpoints/model_best.pt --framework=pytorch-2.1 --task=regression`)
              }
              className="absolute top-3 right-3 text-on-surface-variant hover:text-on-surface p-1 rounded bg-surface-container"
              title="Copy"
            >
              <span className="material-symbols-outlined text-[16px]">content_copy</span>
            </button>
          </div>
        </div>

        {/* REST API spec */}
        <div className="bg-surface-container-lowest rounded-xl p-space-6 shadow-sm border border-surface-variant/40 flex flex-col gap-space-3">
          <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
            2. REST Inference Protocol
          </h2>
          <p className="font-body-default text-body-default text-on-surface-variant">
            Every deployed model exposes a high-throughput endpoint matching standard serving specifications:
          </p>
          <div className="p-space-3 bg-surface-container-low rounded border border-surface-variant/30 flex items-center gap-2 font-code-sm text-code-sm">
            <span className="px-2 py-0.5 rounded bg-primary text-on-primary font-bold text-[10px]">
              POST
            </span>
            <span className="text-on-surface font-semibold">
              http://localhost:8080/v1/models/{'{model_slug}'}:predict
            </span>
          </div>

          <h3 className="font-label-default font-semibold text-on-surface mt-space-2">
            Standard Request Payload:
          </h3>
          <pre className="p-space-4 bg-primary-container text-inverse-on-surface rounded-lg font-code-sm text-code-sm overflow-x-auto">
            <code>{`{
  "instances": [
    {
      "store_id": "ST-9041",
      "sku": "SKU-4882-BLU",
      "forecast_horizon_days": 14,
      "promo_flag": true,
      "historical_lag_7d": [142, 138, 150, 162, 155, 149, 170]
    }
  ],
  "parameters": {
    "confidence_interval": 0.95
  }
}`}</code>
          </pre>
        </div>
      </div>
    </div>
  );
};
