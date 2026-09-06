import React from 'react';
import { ScreenType } from '../types';

interface ProfileScreenProps {
  onNavigate: (screen: ScreenType) => void;
}

const DetailRow: React.FC<{ label: string; value: string; mono?: boolean }> = ({
  label,
  value,
  mono = false,
}) => (
  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 py-space-3 border-b border-surface-variant/40 last:border-b-0">
    <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">{label}</span>
    <span className={mono ? 'font-code-default text-code-default text-on-surface' : 'font-body-default text-body-default text-on-surface'}>
      {value}
    </span>
  </div>
);

export const ProfileScreen: React.FC<ProfileScreenProps> = ({ onNavigate }) => {
  return (
    <div className="flex flex-col w-full pb-space-12">
      <div className="py-space-4">
        <div className="flex items-center gap-space-2 text-on-surface-variant font-label-caps text-label-caps tracking-wider uppercase">
          <button
            onClick={() => onNavigate('models')}
            className="hover:text-on-surface transition-colors cursor-pointer"
          >
            Models
          </button>
          <span>/</span>
          <span className="text-on-surface font-semibold">Operator Profile</span>
        </div>

        <div className="mt-space-2">
          <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight font-semibold">
            Operator Profile
          </h1>
          <p className="mt-1 font-body-default text-body-default text-on-surface-variant">
            Local workspace identity and runtime connection details for this ModelDock instance.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)] gap-space-4">
        <section className="bg-surface-container-lowest rounded-xl border border-surface-variant/40 shadow-sm overflow-hidden">
          <div className="p-space-6 border-b border-surface-variant/40 bg-surface-container-low">
            <div className="flex items-center gap-space-4">
              <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center shrink-0 shadow-sm">
                <span className="material-symbols-outlined text-[30px] text-on-primary">person</span>
              </div>
              <div>
                <p className="font-label-caps text-label-caps uppercase text-secondary">Local operator</p>
                <h2 className="mt-1 font-headline-md text-headline-md text-on-surface font-semibold">
                  Workspace Administrator
                </h2>
                <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
                  Full access to this local ModelDock workspace
                </p>
              </div>
            </div>
          </div>

          <div className="p-space-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-space-8">
              <DetailRow label="Account type" value="Local operator" />
              <DetailRow label="Access level" value="Administrator" />
              <DetailRow label="Workspace" value="ModelDock Local Engine" />
              <DetailRow label="Frontend" value="v1.4.2-local" mono />
              <DetailRow label="API endpoint" value="http://localhost:8000" mono />
              <DetailRow label="Artifact storage" value="Backend managed" />
            </div>
          </div>
        </section>

        <section className="bg-surface-container-lowest rounded-xl border border-surface-variant/40 shadow-sm overflow-hidden">
          <div className="p-space-5 border-b border-surface-variant/40">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold">Runtime status</h2>
                <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
                  Current local environment
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-secondary/10 text-secondary font-label-caps text-label-caps uppercase">
                <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" />
                Connected
              </span>
            </div>
          </div>

          <div className="p-space-5">
            <div className="rounded-lg bg-surface-container-low p-space-4">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-secondary">dns</span>
                <span className="font-label-default text-label-default text-on-surface font-medium">Local runtime</span>
              </div>
              <p className="mt-2 font-code-sm text-code-sm text-on-surface-variant">
                Docker-managed backend services
              </p>
            </div>

            <div className="mt-space-3 rounded-lg border border-surface-variant/40 p-space-4">
              <p className="font-label-caps text-label-caps uppercase text-on-surface-variant">Session scope</p>
              <p className="mt-1 font-body-default text-body-default text-on-surface">
                This profile represents the local operator context. Authentication is not configured for this local instance.
              </p>
            </div>
          </div>
        </section>
      </div>

      <div className="mt-space-4 bg-surface-container-lowest rounded-xl border border-surface-variant/40 shadow-sm p-space-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-4">
          <div>
            <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold">Workspace actions</h2>
            <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
              Jump to the areas you are most likely to use next.
            </p>
          </div>
          <div className="flex flex-wrap gap-space-2">
            <button
              onClick={() => onNavigate('settings')}
              className="inline-flex items-center gap-1.5 px-space-3 py-1.5 rounded-lg bg-surface-container text-on-surface hover:bg-surface-container-high transition-colors font-label-default text-label-default cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">settings</span>
              Runtime settings
            </button>
            <button
              onClick={() => onNavigate('models')}
              className="inline-flex items-center gap-1.5 px-space-3 py-1.5 rounded-lg bg-primary text-on-primary hover:opacity-90 transition-opacity font-label-default text-label-default cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">inventory_2</span>
              Back to Models
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
