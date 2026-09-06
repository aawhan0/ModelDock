"use client";

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ModelItem, ScreenType, InferenceRecord } from '../types';
import { Sidebar } from '../components/Sidebar';
import { Header } from '../components/Header';
import { Toast } from '../components/Toast';
import { ModelRegistryScreen } from '../screens/ModelRegistryScreen';
import { ModelDetailScreen } from '../screens/ModelDetailScreen';
import { InferenceScreen } from '../screens/InferenceScreen';
import { InferenceHistoryScreen } from '../screens/InferenceHistoryScreen';
import { MonitoringMetricsScreen } from '../screens/MonitoringMetricsScreen';
import { EndpointsScreen } from '../screens/EndpointsScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { DocumentationScreen } from '../screens/DocumentationScreen';
import { createModel, deleteModel, fetchModels } from '../lib/model-api';

export default function App() {
  const router = useRouter();
  const pathname = usePathname();
  const [currentScreen, setCurrentScreen] = useState<ScreenType>('models');
  const [models, setModels] = useState<ModelItem[]>([]);
  const [selectedModel, setSelectedModel] = useState<ModelItem | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(true);
  const toastTimeoutRef = useRef<number | null>(null);

  const screenToPath: Record<ScreenType, string> = {
    models: '/',
    'model-detail': '/models',
    inference: '/inference',
    history: '/history',
    monitoring: '/monitoring',
    endpoints: '/endpoints',
    settings: '/settings',
    documentation: '/documentation',
  };

  const pathToScreen = (path: string): ScreenType => {
    if (path === '/inference') return 'inference';
    if (path === '/history') return 'history';
    if (path === '/monitoring') return 'monitoring';
    if (path === '/endpoints') return 'endpoints';
    if (path === '/settings') return 'settings';
    if (path === '/documentation') return 'documentation';
    if (path.startsWith('/models/')) return 'model-detail';
    return 'models';
  };

  const navigate = (screen: ScreenType, modelId?: string) => {
    if (screen === 'model-detail' && modelId) {
      router.push(`/models/${modelId}`);
      return;
    }

    router.push(screenToPath[screen]);
  };

  useEffect(() => {
    setCurrentScreen(pathToScreen(pathname));
  }, [pathname]);

  const showToast = (message: string) => {
    if (toastTimeoutRef.current !== null) {
      window.clearTimeout(toastTimeoutRef.current);
    }

    setToastMessage(message);
    toastTimeoutRef.current = window.setTimeout(() => {
      setToastMessage(null);
      toastTimeoutRef.current = null;
    }, 3200);
  };

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current !== null) {
        window.clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadModels = async () => {
      setIsLoadingModels(true);

      try {
        const loadedModels = await fetchModels();
        if (cancelled) return;

        setModels(loadedModels);

        const modelIdFromPath = pathname.startsWith('/models/')
          ? pathname.split('/')[2]
          : null;

        setSelectedModel(
          modelIdFromPath
            ? loadedModels.find((model) => model.id === modelIdFromPath) ?? null
            : loadedModels[0] ?? null,
        );
      } catch (error) {
        if (cancelled) return;

        console.error('Failed to load models:', error);
        showToast(
          error instanceof Error
            ? error.message
            : 'Failed to load models from backend',
        );
      } finally {
        if (!cancelled) {
          setIsLoadingModels(false);
        }
      }
    };

    void loadModels();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!pathname.startsWith('/models/')) {
      return;
    }

    const modelId = pathname.split('/')[2];
    setSelectedModel(models.find((model) => model.id === modelId) ?? null);
  }, [models, pathname]);

  const handleSelectModel = (model: ModelItem) => {
    setSelectedModel(model);
    navigate('model-detail', model.id);
  };

  const refreshModels = async () => {
    try {
      const loadedModels = await fetchModels();
      setModels(loadedModels);
      setSelectedModel((current) =>
        current
          ? loadedModels.find((model) => model.id === current.id) ?? loadedModels[0] ?? null
          : loadedModels[0] ?? null,
      );
    } catch (error) {
      console.error('Failed to refresh models:', error);
      showToast(
        error instanceof Error ? error.message : 'Failed to refresh models',
      );
    }
  };

  const handleUpdateModel = (updatedModel: ModelItem) => {
    setModels((prev) =>
      prev.map((model) => (model.id === updatedModel.id ? updatedModel : model)),
    );
    setSelectedModel((current) =>
      current?.id === updatedModel.id ? updatedModel : current,
    );
  };

  const handleDeleteModel = async (modelId: string) => {
    try {
      await deleteModel(modelId);

      setModels((prev) => prev.filter((model) => model.id !== modelId));
      setSelectedModel((current) => (current?.id === modelId ? null : current));

      if (selectedModel?.id === modelId) {
        navigate('models');
      }

      showToast('Model deleted successfully');
    } catch (error) {
      console.error('Failed to delete model:', error);
      showToast(
        error instanceof Error ? error.message : 'Failed to delete model',
      );
    }
  };

  const handleAddNewModel = async (newModelData: Partial<ModelItem>) => {
    try {
      const createdModel = await createModel({
        name: newModelData.name || 'new-model',
        task: newModelData.task || 'Regression',
        description: newModelData.description || 'Registered in ModelDock.',
      });

      setModels((prev) => [createdModel, ...prev]);
      setSelectedModel(createdModel);

      showToast(`Model ${createdModel.name} registered successfully`);
    } catch (error) {
      console.error('Failed to create model:', error);
      showToast(
        error instanceof Error ? error.message : 'Failed to register model',
      );
    }
  };

  const handleReplayInference = (record: InferenceRecord) => {
    navigate('inference');
    showToast(`Request #${record.id} loaded into Inference playground`);
  };

  return (
    <div className="min-h-screen bg-surface text-on-surface flex flex-col font-sans selection:bg-secondary/20 selection:text-secondary">
      <Sidebar
        currentScreen={currentScreen}
        onNavigate={navigate}
        isOpenMobile={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
      />

      <Header onToggleMobileSidebar={() => setIsMobileSidebarOpen(true)} />

      <main className="flex-1 ml-0 lg:ml-[240px] pt-14 min-h-screen">
        <div className="max-w-360 mx-auto px-4 sm:px-6 lg:px-8 py-4">
          {isLoadingModels && currentScreen === 'models' ? (
            <div className="py-space-12 text-center font-body-default text-body-default text-on-surface-variant">
              Loading models from backend…
            </div>
          ) : (
            <>
              {currentScreen === 'models' && (
                <ModelRegistryScreen
                  models={models}
                  onSelectModel={handleSelectModel}
                  onShowToast={showToast}
                  onAddNewModel={handleAddNewModel}
                />
              )}

              {currentScreen === 'model-detail' && selectedModel && (
                <ModelDetailScreen
                  model={selectedModel}
                  onBack={() => navigate('models')}
                  onNavigate={navigate}
                  onShowToast={showToast}
                  onUpdateModel={handleUpdateModel}
                  onDeleteModel={handleDeleteModel}
                  onRefresh={refreshModels}
                />
              )}

              {currentScreen === 'model-detail' && !selectedModel && !isLoadingModels && (
                <div className="p-space-8 text-center bg-surface-container-lowest rounded border border-surface-variant/40">
                  <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                    Model not found
                  </h2>
                  <p className="mt-2 font-body-default text-body-default text-on-surface-variant">
                    The requested model does not exist in the backend registry.
                  </p>
                  <button
                    onClick={() => navigate('models')}
                    className="mt-4 px-3 py-1.5 rounded bg-primary text-on-primary font-label-default text-label-default cursor-pointer"
                  >
                    Back to Models
                  </button>
                </div>
              )}

              {currentScreen === 'inference' && selectedModel && (
                <InferenceScreen
                  model={selectedModel}
                  onNavigate={navigate}
                  onShowToast={showToast}
                />
              )}

              {currentScreen === 'history' && selectedModel && (
                <InferenceHistoryScreen
                  model={selectedModel}
                  onNavigate={navigate}
                  onShowToast={showToast}
                  onReplayInference={handleReplayInference}
                />
              )}

              {currentScreen === 'monitoring' && selectedModel && (
                <MonitoringMetricsScreen
                  model={selectedModel}
                  onNavigate={navigate}
                  onShowToast={showToast}
                />
              )}

              {currentScreen === 'endpoints' && (
                <EndpointsScreen
                  models={models}
                  onSelectModel={handleSelectModel}
                  onNavigate={navigate}
                  onShowToast={showToast}
                />
              )}

              {currentScreen === 'settings' && <SettingsScreen />}

              {currentScreen === 'documentation' && (
                <DocumentationScreen onShowToast={showToast} />
              )}
            </>
          )}
        </div>
      </main>

      <Toast message={toastMessage} />
    </div>
  );
}
