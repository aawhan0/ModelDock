import React from 'react';
import { API_URL } from '../lib/api';

interface DocumentationScreenProps {
  onShowToast: (msg: string) => void;
}

export const DocumentationScreen: React.FC<DocumentationScreenProps> = ({ onShowToast }) => {
  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    onShowToast('Snippet copied to clipboard');
  };

  const endpointTemplate =
    API_URL + '/api/v1/models/{model_id}/versions/{version}/predict';
  const requestExample = JSON.stringify({ input: '<model input>' }, null, 2);

  return (
    <div className="flex flex-col w-full pb-space-12 max-w-4xl">
      <div className="flex flex-col gap-1 py-space-4">
        <div className="flex items-center gap-space-2 text-on-surface-variant font-label-caps text-label-caps tracking-wider uppercase">
          <span>DEVELOPER</span>
          <span>/</span>
          <span className="text-primary font-semibold">DOCUMENTATION</span>
        </div>
        <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight font-semibold">
          ModelDock API Reference
        </h1>
        <p className="font-body-default text-body-default text-on-surface-variant">
          Reference for the REST API implemented by the local ModelDock backend.
        </p>
      </div>

      <div className="flex flex-col gap-space-6 mt-space-4">
        <div className="bg-surface-container-lowest rounded-xl p-space-6 shadow-sm border border-surface-variant/40 flex flex-col gap-space-3">
          <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
            Authentication
          </h2>
          <p className="font-body-default text-body-default text-on-surface-variant">
            When API authentication is enabled, protected requests use a Bearer API key in the Authorization header.
          </p>
          <pre className="p-space-4 bg-primary-container text-inverse-on-surface rounded-lg font-code-sm text-code-sm overflow-x-auto">
            <code>{`Authorization: Bearer <API_KEY>`}</code>
          </pre>
        </div>

        <div className="bg-surface-container-lowest rounded-xl p-space-6 shadow-sm border border-surface-variant/40 flex flex-col gap-space-3">
          <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
            Model lifecycle
          </h2>
          <p className="font-body-default text-body-default text-on-surface-variant">
            Register a model, create a version, upload and validate an artifact, then deploy the validated version.
          </p>
          <pre className="p-space-4 bg-primary-container text-inverse-on-surface rounded-lg font-code-sm text-code-sm overflow-x-auto">
            <code>{`POST /api/v1/models
POST /api/v1/models/{model_id}/versions
POST /api/v1/models/{model_id}/versions/{version}/artifact
POST /api/v1/models/{model_id}/versions/{version}/deploy
POST /api/v1/models/{model_id}/versions/{version}/undeploy`}</code>
          </pre>
        </div>

        <div className="bg-surface-container-lowest rounded-xl p-space-6 shadow-sm border border-surface-variant/40 flex flex-col gap-space-3">
          <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
            Inference
          </h2>
          <p className="font-body-default text-body-default text-on-surface-variant">
            Every deployed version exposes the prediction endpoint below. The input is passed directly to the selected runtime.
          </p>
          <div className="p-space-3 bg-surface-container-low rounded border border-surface-variant/30 flex items-center gap-2 font-code-sm text-code-sm">
            <span className="px-2 py-0.5 rounded bg-primary text-on-primary font-bold text-[10px]">
              POST
            </span>
            <span className="text-on-surface font-semibold break-all">
              {endpointTemplate}
            </span>
          </div>

          <h3 className="font-label-default font-semibold text-on-surface mt-space-2">
            Request body
          </h3>
          <div className="relative">
            <pre className="p-space-4 bg-primary-container text-inverse-on-surface rounded-lg font-code-sm text-code-sm overflow-x-auto">
              <code>{requestExample}</code>
            </pre>
            <button
              onClick={() => handleCopyCode(requestExample)}
              className="absolute top-3 right-3 text-on-surface-variant hover:text-on-surface p-1 rounded bg-surface-container"
              title="Copy"
            >
              <span className="material-symbols-outlined text-[16px]">content_copy</span>
            </button>
          </div>
        </div>

        <div className="bg-surface-container-lowest rounded-xl p-space-6 shadow-sm border border-surface-variant/40 flex flex-col gap-space-3">
          <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
            Metrics &amp; history
          </h2>
          <p className="font-body-default text-body-default text-on-surface-variant">
            Persistent inference metrics are available for each model version.
          </p>
          <pre className="p-space-4 bg-primary-container text-inverse-on-surface rounded-lg font-code-sm text-code-sm overflow-x-auto">
            <code>{`GET /api/v1/metrics/{model_id}/{version}
GET /api/v1/metrics/{model_id}/{version}/history?limit=50
GET /api/v1/metrics/{model_id}/{version}/timeseries?hours=24`}</code>
          </pre>
        </div>
      </div>
    </div>
  );
};
