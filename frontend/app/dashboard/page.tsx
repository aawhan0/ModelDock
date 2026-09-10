'use client';

import { useCallback, useEffect, useState } from 'react';
import { Header } from '../../components/Header';
import { Sidebar } from '../../components/Sidebar';
import { Toast } from '../../components/Toast';
import { DashboardScreen } from '../../screens/DashboardScreen';
import { fetchModels } from '../../lib/model-api';
import { ModelItem } from '../../types';

export default function DashboardPage() {
  const [models, setModels] = useState<ModelItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const loadModels = useCallback(async () => {
    setError(null);
    try {
      const loadedModels = await fetchModels();
      setModels(loadedModels);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load the model registry');
    }
  }, []);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    void loadModels().finally(() => {
      if (active) setIsLoading(false);
    });
    return () => { active = false; };
  }, [loadModels]);

  const refresh = async () => {
    await loadModels();
    setToast('Dashboard data refreshed');
    window.setTimeout(() => setToast(null), 2200);
  };

  return (
    <div className="min-h-screen bg-surface text-on-surface flex flex-col font-sans">
      <Sidebar
        currentScreen="models"
        onNavigate={(screen) => {
          window.location.href = screen === 'models' ? '/' : `/${screen}`;
        }}
        isOpenMobile={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
      />
      <Header
        onToggleMobileSidebar={() => setIsMobileSidebarOpen(true)}
        onNavigate={(screen) => {
          window.location.href = screen === 'models' ? '/' : `/${screen}`;
        }}
      />

      <main className="flex-1 ml-0 lg:ml-[240px] pt-14 min-h-screen">
        <div className="max-w-360 mx-auto px-4 sm:px-6 lg:px-8 py-4">
          {isLoading ? (
            <div className="rounded-xl border border-surface-variant/50 bg-surface-container-lowest px-6 py-16 text-center">
              <span className="material-symbols-outlined animate-spin text-[26px] text-secondary">progress_activity</span>
              <p className="mt-3 font-body-default text-body-default text-on-surface-variant">Loading production overview…</p>
            </div>
          ) : error ? (
            <div className="rounded-xl border border-error/30 bg-surface-container-lowest px-6 py-16 text-center">
              <span className="material-symbols-outlined text-[28px] text-error">cloud_off</span>
              <h1 className="mt-3 font-headline-sm text-headline-sm font-semibold text-on-surface">Dashboard unavailable</h1>
              <p className="mx-auto mt-1 max-w-lg font-body-sm text-body-sm text-on-surface-variant">{error}</p>
              <button
                onClick={refresh}
                className="mt-4 rounded-lg bg-primary px-3 py-2 font-label-default text-label-default text-on-primary"
              >
                Retry
              </button>
            </div>
          ) : (
            <DashboardScreen models={models} onNavigate={(screen, modelId, version) => {
              if (screen === 'models') {
                window.location.href = '/';
              } else if (screen === 'model-detail' && modelId) {
                window.location.href = `/models/${encodeURIComponent(modelId)}`;
              } else if ((screen === 'monitoring' || screen === 'inference' || screen === 'history') && modelId && version) {
                window.location.href = `/${screen}/${encodeURIComponent(modelId)}/${encodeURIComponent(version)}`;
              } else {
                window.location.href = `/${screen}`;
              }
            }} onRefresh={refresh} />
          )}
        </div>
      </main>

      <Toast message={toast} />
    </div>
  );
}
