"use client";
import { useEffect, useState } from 'react';
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
    setCurrentScreen(screen);

    if (screen === 'model-detail' && modelId) {
      router.push("/models/" + modelId);
      return;
    }

    router.push(screenToPath[screen]);
  };

  useEffect(() => {
    setCurrentScreen(pathToScreen(pathname));
  }, [pathname]);
  const [models, setModels] = useState<ModelItem[]>([]);
  const [selectedModel, setSelectedModel] = useState<ModelItem | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastTimeout, setToastTimeout] = useState<number | null>(null);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadModels = async () => {
      try {
        const loadedModels = await fetchModels();

        if (cancelled) return;

        setModels(loadedModels);
        setIsLoadingModels(false);

        const modelIdFromPath = pathname.startsWith('/models/')
          ? pathname.split('/')[2]
          : null;

        if (modelIdFromPath) {
          const modelFromPath = loadedModels.find(
            (model) => model.id === modelIdFromPath
          );

          setSelectedModel(modelFromPath ?? loadedModels[0] ?? null);
        } else if (loadedModels.length > 0) {
          setSelectedModel(loadedModels[0]);
        }
      } catch (error) {
        console.error('Failed to load models:', error);
        setIsLoadingModels(false);
        showToast('Failed to load models from backend');
      }
    };

    loadModels();

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const showToast = (message: string) => {
    if (toastTimeout) {
      window.clearTimeout(toastTimeout);
    }
    setToastMessage(message);
    const timeout = window.setTimeout(() => {
      setToastMessage(null);
    }, 3200);
    setToastTimeout(timeout);
  };

  const handleSelectModel = (model: ModelItem) => {
    setSelectedModel(model);
    navigate('model-detail', model.id);
  };

  const refreshModels = async () => {
    const loadedModels = await fetchModels();

    setModels(loadedModels);

    setSelectedModel((current) => {
      if (!current) {
        return loadedModels[0] ?? null;
      }

      return loadedModels.find((model) => model.id === current.id)
        ?? loadedModels[0]
        ?? null;
    });
  };

  const handleUpdateModel = (updatedModel: ModelItem) => {
    setModels((prev) =>
      prev.map((m) => (m.id === updatedModel.id ? updatedModel : m))
    );
    if (selectedModel?.id === updatedModel.id) {
      setSelectedModel(updatedModel);
    }
  };

  const handleDeleteModel = async (modelId: string) => {
    try {
      await deleteModel(modelId);

      setModels((prev) => {
        const remaining = prev.filter((m) => m.id !== modelId);

        if (selectedModel?.id === modelId) {
          setSelectedModel(remaining[0] ?? ({} as ModelItem));
          navigate('models');
        }

        return remaining;
      });

      showToast('Model deleted successfully');
    } catch (error) {
      console.error('Failed to delete model:', error);
      showToast(
        error instanceof Error
          ? error.message
          : 'Failed to delete model',
      );
    }
  };
  const handleAddNewModel = async (newModelData: Partial<ModelItem>) => {
    try {
      const createdModel = await createModel({
        name: newModelData.name || 'new-model',
        task: newModelData.task || 'Regression',
        description:
          newModelData.description ||
          'Locally served model weights.',
      });

      setModels((prev) => [createdModel, ...prev]);
      setSelectedModel(createdModel);

      showToast(`Model ${createdModel.name} registered successfully`);
    } catch (error) {
      console.error('Failed to create model:', error);
      showToast(
        error instanceof Error
          ? error.message
          : 'Failed to register model',
      );
    }
  };

  const handleReplayInference = (record: InferenceRecord) => {
    // Jump straight to inference screen
    navigate('inference');
    showToast(`Request #${record.id} loaded into Inference playground`);
  };

  return (
    <div className="min-h-screen bg-surface text-on-surface flex flex-col font-sans selection:bg-secondary/20 selection:text-secondary">
      {/* Fixed Sidebar */}
      <Sidebar
        currentScreen={currentScreen}
        onNavigate={navigate}
        isOpenMobile={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
      />

      {/* Fixed Top Header */}
      <Header onToggleMobileSidebar={() => setIsMobileSidebarOpen(true)} />

      {/* Main Content Area */}
      <main className="flex-1 ml-0 lg:ml-[240px] pt-14 min-h-screen">
        <div className="max-w-360 mx-auto px-4 sm:px-6 lg:px-8 py-4">
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

          {currentScreen === 'settings' && (
            <SettingsScreen onShowToast={showToast} />
          )}

          {currentScreen === 'documentation' && (
            <DocumentationScreen onShowToast={showToast} />
          )}
        </div>
      </main>

      {/* Floating System Toast */}
      <Toast message={toastMessage} />
    </div>
  );
}














