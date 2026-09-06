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
}> = ({ label, value, editing, draftValue, onChange, onEdit }) => (
  <div className="group border-b border-surface-variant/45 py-3 last:border-b-0">
    <div className="flex items-center justify-between gap-4">
      <span className="font-label-caps text-label-caps uppercase tracking-[0.08em] text-on-surface-variant">
        {label}
      </span>

      {!editing && (
        <button
          type="button"
          onClick={onEdit}
          aria-label={'Edit ' + label}
          title={'Edit ' + label}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-on-surface-variant/55 opacity-70 transition hover:bg-surface-container hover:text-on-surface hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary/30"
        >
          <span className="material-symbols-outlined text-[14px]">edit</span>
        </button>
      )}
    </div>

    {editing ? (
      <input
        autoFocus
        value={draftValue}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 w-full rounded-md border border-outline-variant bg-surface-container-lowest px-2.5 py-1.5 font-body-default text-body-default text-on-surface outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/10"
      />
    ) : (
      <p className="mt-1 font-body-lg text-body-lg text-on-surface">{value}</p>
    )}
  </div>
);

const RuntimeRow: React.FC<{
  label: string;
  value: string;
  mono?: boolean;
}> = ({ label, value, mono = false }) => (
  <div className="grid grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] items-baseline gap-5 border-b border-surface-variant/45 py-3 last:border-b-0">
    <span className="font-label-caps text-label-caps uppercase tracking-[0.08em] text-on-surface-variant">
      {label}
    </span>
    <span
      className={
        'min-w-0 break-words text-on-surface ' +
        (mono ? 'font-code-default text-code-default' : 'font-body-default text-body-default')
      }
    >
      {value}
    </span>
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
      // Keep defaults if stored profile data is unavailable.
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

  const editingLabel =
    editingField === 'displayName'
      ? 'display name'
      : editingField === 'title'
        ? 'operator title'
        : 'workspace';

  return (
    <div className="flex w-full flex-col pb-space-6">
      <header className="border-b border-surface-variant/40 py-3">
        <div className="flex items-center gap-2 font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant">
          <button
            type="button"
            onClick={() => onNavigate('models')}
            className="transition-colors hover:text-on-surface"
          >
            Models
          </button>
          <span>/</span>
          <span className="font-semibold text-on-surface">Operator Profile</span>
        </div>

        <div className="mt-1.5 flex items-end justify-between gap-4">
          <div>
            <h1 className="font-headline-lg text-headline-lg font-semibold tracking-tight text-on-surface">
              Operator Profile
            </h1>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Local workspace identity and runtime connection details.
            </p>
          </div>

          {saved && (
            <span className="inline-flex shrink-0 items-center gap-1.5 font-label-default text-label-default text-secondary">
              <span className="h-1.5 w-1.5 rounded-full bg-secondary" />
              Saved locally
            </span>
          )}
        </div>
      </header>

      <section className="mt-4 overflow-hidden rounded-xl border border-surface-variant/55 bg-surface-container-lowest shadow-sm">
        <div className="flex items-center gap-3.5 border-b border-surface-variant/45 px-5 py-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary">
            <span className="material-symbols-outlined text-[20px] text-on-primary">person</span>
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate font-headline-md text-headline-md font-semibold text-on-surface">
                {profile.displayName}
              </h2>
              <span className="shrink-0 rounded bg-surface-container px-1.5 py-0.5 font-label-caps text-label-caps text-on-surface-variant">
                LOCAL
              </span>
            </div>
            <p className="mt-0.5 font-body-sm text-body-sm text-on-surface-variant">
              {profile.title} · Administrator
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2">
          <section className="px-5 py-3 md:border-r md:border-surface-variant/45">
            <div className="mb-1.5">
              <h3 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
                Profile
              </h3>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Identity shown across this workspace.
              </p>
            </div>

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
              label="Workspace"
              value={profile.workspace}
              editing={editingField === 'workspace'}
              draftValue={draft.workspace}
              onChange={(value) => updateDraftField('workspace', value)}
              onEdit={() => startEditing('workspace')}
            />
          </section>

          <section className="border-t border-surface-variant/45 px-5 py-3 md:border-t-0">
            <div className="mb-1.5 flex items-start justify-between gap-3">
              <div>
                <h3 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
                  Runtime
                </h3>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  Connection details managed by the local runtime.
                </p>
              </div>

              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-secondary/10 px-2 py-1 font-label-caps text-label-caps uppercase text-secondary">
                <span className="h-1.5 w-1.5 rounded-full bg-secondary" />
                Connected
              </span>
            </div>

            <RuntimeRow label="API endpoint" value="http://localhost:8000" mono />
            <RuntimeRow label="Artifact storage" value="Backend managed" />
            <RuntimeRow label="Frontend" value="v1.4.2-local" mono />
            <RuntimeRow label="Authentication" value="Not configured" />
          </section>
        </div>

        {editingField && (
          <div className="flex flex-col gap-2 border-t border-surface-variant/45 bg-surface-container-low px-5 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Editing {editingLabel}.
            </p>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={cancelEditing}
                className="rounded-md border border-surface-variant/60 bg-surface-container-lowest px-3 py-1.5 font-label-default text-label-default text-on-surface transition-colors hover:bg-surface-container"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveProfile}
                disabled={!hasUnsavedChanges}
                className="rounded-md bg-primary px-3 py-1.5 font-label-default text-label-default text-on-primary transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Save changes
              </button>
            </div>
          </div>
        )}

        <footer className="flex flex-col gap-2 border-t border-surface-variant/45 px-5 py-2.5 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            Runtime settings are configured separately.
          </p>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onNavigate('settings')}
              className="inline-flex items-center gap-1.5 rounded-md bg-surface-container px-3 py-1.5 font-label-default text-label-default text-on-surface transition-colors hover:bg-surface-container-high"
            >
              <span className="material-symbols-outlined text-[16px]">settings</span>
              Runtime settings
            </button>
            <button
              type="button"
              onClick={() => onNavigate('models')}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 font-label-default text-label-default text-on-primary transition-opacity hover:opacity-90"
            >
              <span className="material-symbols-outlined text-[16px]">inventory_2</span>
              Models
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
};
