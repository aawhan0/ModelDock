import React from 'react';
import { API_URL } from '../lib/api';

export const SettingsScreen: React.FC = () => {
  return (
    <div className="flex flex-col w-full pb-space-12 max-w-3xl">
      <div className="flex flex-col gap-1 py-space-4">
        <div className="flex items-center gap-space-2 text-on-surface-variant font-label-caps text-label-caps tracking-wider uppercase">
          <span>PLATFORM</span>
          <span>/</span>
          <span className="text-primary font-semibold">SETTINGS</span>
        </div>
        <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight font-semibold">
          Runtime Configuration
        </h1>
        <p className="font-body-default text-body-default text-on-surface-variant">
          ModelDock currently reads runtime configuration from Docker and backend environment variables.
        </p>
      </div>

      <div className="bg-surface-container-lowest rounded-xl p-space-6 shadow-sm border border-surface-variant/40 flex flex-col gap-space-5 mt-space-4">
        <section className="flex flex-col gap-2 border-b border-surface-variant/40 pb-space-4">
          <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
            API Connection
          </h2>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            The browser sends model management and inference requests to this backend.
          </p>
          <div className="mt-space-2">
            <span className="font-label-caps uppercase text-on-surface-variant block mb-1">
              API Base URL
            </span>
            <code className="block w-full p-2.5 bg-surface-container-low text-on-surface rounded border border-outline-variant font-code-sm text-code-sm select-all">
              {API_URL}
            </code>
          </div>
        </section>

        <section className="flex flex-col gap-2 border-b border-surface-variant/40 pb-space-4">
          <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
            Artifact Storage
          </h2>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            Artifacts are stored and resolved by the backend. The frontend does not assume a host filesystem path.
          </p>
          <div className="flex items-center gap-2 mt-1">
            <span className="w-2 h-2 rounded-full bg-secondary"></span>
            <span className="font-code-sm text-code-sm text-on-surface">Backend managed</span>
          </div>
        </section>

        <section className="flex flex-col gap-2 border-b border-surface-variant/40 pb-space-4">
          <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
            Supported Runtimes
          </h2>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            These are the runtime identifiers currently registered by the backend.
          </p>
          <div className="flex flex-wrap gap-2 mt-1">
            {['sklearn', 'python', 'json'].map((runtime) => (
              <span
                key={runtime}
                className="px-2 py-1 rounded bg-surface-container font-code-sm text-code-sm text-on-surface"
              >
                {runtime}
              </span>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
            Configuration Changes
          </h2>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            Host port, GPU allocation, storage paths, authentication, and telemetry settings are controlled outside the frontend.
          </p>
          <span className="font-code-sm text-code-sm text-on-surface-variant">
            Restart the backend/frontend containers after changing environment configuration.
          </span>
        </section>
      </div>
    </div>
  );
};
