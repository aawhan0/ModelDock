import React from 'react';
import { ScreenType } from '../types';

interface SidebarProps {
  currentScreen: ScreenType;
  onNavigate: (screen: ScreenType) => void;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentScreen,
  onNavigate,
  isOpenMobile,
  onCloseMobile,
}) => {
  const isModelsActive = currentScreen === 'models' || currentScreen === 'model-detail' || currentScreen === 'inference' || currentScreen === 'history';

  const handleNav = (screen: ScreenType) => {
    onNavigate(screen);
    if (onCloseMobile) onCloseMobile();
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpenMobile && (
        <div
          className="fixed inset-0 bg-inverse-surface/40 backdrop-blur-xs z-40 lg:hidden"
          onClick={onCloseMobile}
        />
      )}

      <aside
        className={`fixed left-0 top-0 h-screen w-[240px] bg-surface-container-lowest flex flex-col justify-between border-r border-surface-variant z-50 transition-transform duration-200 ease-in-out ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="flex flex-col">
          {/* Logo Header */}
          <div className="p-space-4 border-b border-surface-variant">
            <div className="flex items-center justify-between">
              <button
                onClick={() => handleNav('models')}
                className="flex items-center gap-space-2 text-left focus:outline-none"
              >
                <div className="w-6 h-6 rounded bg-primary flex items-center justify-center text-on-primary">
                  <span className="material-symbols-outlined text-[14px]">layers</span>
                </div>
                <span className="font-headline-sm text-headline-sm text-on-surface tracking-tight font-semibold">
                  ModelDock
                </span>
              </button>
              {isOpenMobile && (
                <button
                  onClick={onCloseMobile}
                  className="lg:hidden p-1 rounded hover:bg-surface-container text-on-surface-variant"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              )}
            </div>
            <div className="mt-space-2 flex items-center gap-space-1">
              <span className="px-space-1 py-0.5 rounded bg-surface-container text-on-surface-variant font-label-caps text-label-caps uppercase">
                Local Engine v1.4
              </span>
            </div>
          </div>

          {/* Nav Items */}
          <nav className="p-space-2 space-y-0.5">
            <button
              onClick={() => handleNav('models')}
              aria-current={isModelsActive ? 'page' : undefined}
              className={`w-full flex items-center gap-space-2 px-space-2 py-1.5 rounded transition-colors text-left ${
                isModelsActive
                  ? 'bg-surface-container text-on-surface font-label-default font-medium'
                  : 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface font-body-default text-body-default'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">inventory_2</span>
              <span>Models</span>
            </button>

            <button
              onClick={() => handleNav('endpoints')}
              aria-current={currentScreen === 'endpoints' ? 'page' : undefined}
              className={`w-full flex items-center gap-space-2 px-space-2 py-1.5 rounded transition-colors text-left ${
                currentScreen === 'endpoints'
                  ? 'bg-surface-container text-on-surface font-label-default font-medium'
                  : 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface font-body-default text-body-default'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">bolt</span>
              <span>Endpoints</span>
            </button>

            <button
              onClick={() => handleNav('monitoring')}
              aria-current={currentScreen === 'monitoring' ? 'page' : undefined}
              className={`w-full flex items-center gap-space-2 px-space-2 py-1.5 rounded transition-colors text-left ${
                currentScreen === 'monitoring'
                  ? 'bg-surface-container text-on-surface font-label-default font-medium'
                  : 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface font-body-default text-body-default'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">query_stats</span>
              <span>Monitoring</span>
            </button>

            <button
              onClick={() => handleNav('settings')}
              aria-current={currentScreen === 'settings' ? 'page' : undefined}
              className={`w-full flex items-center gap-space-2 px-space-2 py-1.5 rounded transition-colors text-left ${
                currentScreen === 'settings'
                  ? 'bg-surface-container text-on-surface font-label-default font-medium'
                  : 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface font-body-default text-body-default'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">settings</span>
              <span>Settings</span>
            </button>
          </nav>
        </div>

        {/* Footer Actions */}
        <div className="p-space-3 border-t border-surface-variant flex flex-col gap-space-2">
          <button
            onClick={() => handleNav('documentation')}
            className="flex items-center gap-space-2 px-space-1 py-1 rounded text-on-surface-variant hover:text-on-surface transition-colors font-body-sm text-body-sm text-left"
          >
            <span className="material-symbols-outlined text-[16px]">menu_book</span>
            <span>Documentation</span>
          </button>
          <div className="flex items-center gap-space-2 px-space-1 py-1">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-secondary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-secondary"></span>
            </span>
            <span className="font-code-sm text-code-sm text-on-surface-variant truncate">
              API Connected (localhost:8000)
            </span>
          </div>
        </div>
      </aside>
    </>
  );
};
