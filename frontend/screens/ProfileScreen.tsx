import React, { useEffect, useState } from 'react';
import { ScreenType } from '../types';

interface ProfileScreenProps {
  onNavigate: (screen: ScreenType) => void;
}

interface OperatorProfile {
  displayName: string;
  title: string;
  workspace: string;
}

const DEFAULT_PROFILE: OperatorProfile = {
  displayName: 'Workspace Administrator',
  title: 'Local operator',
  workspace: 'ModelDock Local Engine',
};

const PROFILE_STORAGE_KEY = 'modeldock.operator-profile';

const EditableField: React.FC<{
  label: string;
  value: string;
  editing: boolean;
  draftValue: string;
  onChange: (value: string) => void;
  onEdit: () => void;
  mono?: boolean;
}> = ({ label, value, editing, draftValue, onChange, onEdit, mono = false }) => (
  <div className="group min-w-0 border-b border-surface-variant/40 py-space-4 last:border-b-0">
    <div className="flex items-start justify-between gap-space-3">
      <span className="font-label-caps text-label-caps uppercase tracking-wide text-on-surface-variant">
        {label}
      </span>
      {!editing && (
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Edit ${label}`}
          title={`Edit ${label}`}
          className="shrink-0 rounded-md p-1 text-on-surface-variant opacity-60 transition-all hover:bg-surface-container hover:text-on-surface hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary/40"
        >
          <span className="material-symbols-outlined text-[16px]">edit</span>
        </button>
      )}
    </div>

    {editing ? (
      <input
        autoFocus
        value={draftValue}
        onChange={(event) => onChange(event.target.value)}
        className={`mt-2 w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-on-surface outline-none transition-colors focus:border-secondary focus:ring-2 focus:ring-secondary/10 ${mono ? 'font-code-sm text-code-sm' : 'font-body-default text-body-default'}`}
      />
    ) : (
      <p
        className={`mt-1.5 break-words text-on-surface ${mono ? 'font-code-sm text-code-sm' : 'font-body-default text-body-default'}`}
      >
        {value}
      </p>
    )}
  </div>
);

const ReadOnlyField: React.FC<{ label: string; value: string; mono?: boolean }> = ({
  label,
  value,
  mono = false,
}) => (
  <div className="min-w-0 border-b border-surface-variant/40 py-space-4 last:border-b-0">
    <span className="font-label-caps text-label-caps uppercase tracking-wide text-on-surface-variant">
      {label}
    </span>
    <div className="mt-1.5 flex items-center gap-2">
      <p
        className={`min-w-0 break-words text-on-surface ${mono ? 'font-code-sm text-code-sm' : 'font-body-default text-body-default'}`}
      >
        {value}
      </p>
      <span
        className="material-symbols-outlined shrink-0 text-[14px] text-on-surface-variant/60"
        title="Managed by the local runtime"
      >
        lock
      </span>
    </div>
  </div>
);

export const ProfileScreen: React.FC<ProfileScreenProps> = ({ onNavigate }) => {
  const [profile, setProfile] = useState<OperatorProfile>(DEFAULT_PROFILE);
  const [draft, setDraft] = useState<OperatorProfile>(DEFAULT_PROFILE);
  const [editingField, setEditingField] = useState<keyof OperatorProfile | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(PROFILE_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<OperatorProfile>;
        const restored = { ...DEFAULT_PROFILE, ...parsed };
        setProfile(restored);
        setDraft(restored);
      }
    } catch {
      // Keep the local defaults if stored profile data cannot be read.
    }
  }, []);

  const startEditing = (field: keyof OperatorProfile) => {
    setDraft(profile);
    setEditingField(field);
    setSaved(false);
  };

  const cancelEditing = () => {
    setDraft(profile);
    setEditingField(null);
  };

  const saveProfile = () => {
    const cleaned: OperatorProfile = {
      displayName: draft.displayName.trim() || DEFAULT_PROFILE.displayName,
      title: draft.title.trim() || DEFAULT_PROFILE.title,
      workspace: draft.workspace.trim() || DEFAULT_PROFILE.workspace,
    };

    setProfile(cleaned);
    setDraft(cleaned);
    setEditingField(null);
    setSaved(true);

    try {
      window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(cleaned));
    } catch {
      // The UI remains usable if local storage is unavailable.
    }

    window.setTimeout(() => setSaved(false), 2400);
  };

  const updateDraftField = (field: keyof OperatorProfile, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const hasUnsavedChanges =
    draft.displayName !== profile.displayName ||
    draft.title !== profile.title ||
    draft.workspace !== profile.workspace;

  return (
    <div className="flex w-full flex-col pb-space-12">
      <div className="py-space-4">
        <div className="flex items-center gap-space-2 font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant">
          <button
            type="button"
            onClick={() => onNavigate('models')}
            className="cursor-pointer transition-colors hover:text-on-surface"
          >
            Models
          </button>
          <span>/</span>
          <span className="font-semibold text-on-surface">Operator Profile</span>
        </div>

        <div className="mt-space-3 flex flex-col gap-space-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-headline-lg text-headline-lg font-semibold tracking-tight text-on-surface">
              Operator Profile
            </h1>
            <p className="mt-1 max-w-2xl font-body-default text-body-default text-on-surface-variant">
              Manage the identity shown for this local ModelDock workspace and review its runtime connection.
            </p>
          </div>

          <div className="inline-flex w-fit items-center gap-2 rounded-lg border border-surface-variant/60 bg-surface-container-lowest px-3 py-2 shadow-sm">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-secondary opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-secondary" />
            </span>
            <span className="font-code-sm text-code-sm text-on-surface">Local session active</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-space-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.85fr)]">
        <section className="overflow-hidden rounded-xl border border-surface-variant/50 bg-surface-container-lowest shadow-sm">
          <div className="border-b border-surface-variant/50 bg-surface-container-low p-space-6">
            <div className="flex flex-col gap-space-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-space-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-primary shadow-sm">
                  <span className="material-symbols-outlined text-[30px] text-on-primary">person</span>
                </div>
                <div className="min-w-0">
                  <p className="font-label-caps text-label-caps uppercase tracking-wider text-secondary">
                    {profile.title}
                  </p>
                  <h2 className="mt-1 truncate font-headline-md text-headline-md font-semibold text-on-surface">
                    {profile.displayName}
                  </h2>
                  <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
                    Full access to this local ModelDock workspace
                  </p>
                </div>
              </div>

              {saved && (
                <span className="inline-flex w-fit items-center gap-1.5 rounded-md bg-secondary/10 px-2.5 py-1.5 font-label-caps text-label-caps uppercase text-secondary">
                  <span className="material-symbols-outlined text-[14px]">check_circle</span>
                  Saved locally
                </span>
              )}
            </div>
          </div>

          <div className="p-space-6">
            <div className="mb-space-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
                  Profile information
                </h3>
                <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
                  These details are stored only in this browser.
                </p>
              </div>
              <span className="material-symbols-outlined text-[20px] text-on-surface-variant/60">edit_note</span>
            </div>

            <div className="grid grid-cols-1 gap-x-space-8 sm:grid-cols-2">
              <EditableField
                label="Display name"
                value={profile.displayName}
                editing={editingField === 'displayName'}
                draftValue={draft.displayName}
                onChange={(value) => updateDraftField('displayName', value)}
                onEdit={() => startEditing('displayName')}
              />
              <EditableField
                label="Operator title"
                value={profile.title}
                editing={editingField === 'title'}
                draftValue={draft.title}
                onChange={(value) => updateDraftField('title', value)}
                onEdit={() => startEditing('title')}
              />
              <EditableField
                label="Workspace name"
                value={profile.workspace}
                editing={editingField === 'workspace'}
                draftValue={draft.workspace}
                onChange={(value) => updateDraftField('workspace', value)}
                onEdit={() => startEditing('workspace')}
              />
              <ReadOnlyField label="Account type" value="Local operator" />
              <ReadOnlyField label="Access level" value="Administrator" />
              <ReadOnlyField label="Frontend" value="v1.4.2-local" mono />
            </div>

            {editingField && (
              <div className="mt-space-5 flex flex-col gap-space-2 rounded-lg border border-secondary/20 bg-secondary/5 p-space-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  Update the highlighted profile information, then save your changes.
                </p>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={cancelEditing}
                    className="rounded-lg border border-surface-variant/60 bg-surface-container-lowest px-3 py-2 font-label-default text-label-default text-on-surface transition-colors hover:bg-surface-container"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={saveProfile}
                    disabled={!hasUnsavedChanges}
                    className="rounded-lg bg-primary px-3 py-2 font-label-default text-label-default text-on-primary transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Save changes
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-surface-variant/50 bg-surface-container-lowest shadow-sm">
          <div className="border-b border-surface-variant/50 p-space-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
                  Runtime status
                </h2>
                <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
                  Current local environment
                </p>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-secondary/10 px-2 py-1 font-label-caps text-label-caps uppercase text-secondary">
                <span className="h-1.5 w-1.5 rounded-full bg-secondary animate-pulse" />
                Connected
              </span>
            </div>
          </div>

          <div className="p-space-5">
            <div className="rounded-lg border border-secondary/15 bg-surface-container-low p-space-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary/10">
                  <span className="material-symbols-outlined text-[19px] text-secondary">dns</span>
                </div>
                <div className="min-w-0">
                  <p className="font-label-default text-label-default font-medium text-on-surface">
                    Local runtime
                  </p>
                  <p className="mt-0.5 font-code-sm text-code-sm text-on-surface-variant">
                    Docker-managed backend services
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-space-3 divide-y divide-surface-variant/40 rounded-lg border border-surface-variant/40 px-space-4">
              <ReadOnlyField label="API endpoint" value="http://localhost:8000" mono />
              <ReadOnlyField label="Artifact storage" value="Backend managed" />
              <ReadOnlyField label="Authentication" value="Not configured for this local instance" />
            </div>

            <div className="mt-space-3 rounded-lg bg-surface-container-low p-space-4">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[17px] text-on-surface-variant">info</span>
                <p className="font-label-default text-label-default font-medium text-on-surface">
                  Runtime settings live outside the profile
                </p>
              </div>
              <p className="mt-1.5 font-body-sm text-body-sm leading-relaxed text-on-surface-variant">
                Ports, storage paths, GPU allocation, authentication, and telemetry are controlled by the local runtime configuration.
              </p>
            </div>
          </div>
        </section>
      </div>

      <section className="mt-space-4 overflow-hidden rounded-xl border border-surface-variant/50 bg-surface-container-lowest shadow-sm">
        <div className="flex flex-col gap-space-4 p-space-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] text-on-surface-variant">tune</span>
              <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
                Workspace actions
              </h2>
            </div>
            <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
              Continue to runtime configuration or return to the model registry.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onNavigate('settings')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-surface-container px-3 py-2 font-label-default text-label-default text-on-surface transition-colors hover:bg-surface-container-high"
            >
              <span className="material-symbols-outlined text-[16px]">settings</span>
              Runtime settings
            </button>
            <button
              type="button"
              onClick={() => onNavigate('models')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 font-label-default text-label-default text-on-primary transition-opacity hover:opacity-90"
            >
              <span className="material-symbols-outlined text-[16px]">inventory_2</span>
              Back to Models
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
