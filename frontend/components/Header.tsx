import React from 'react';
import { ScreenType } from '../types';

interface HeaderProps {
  onToggleMobileSidebar?: () => void;
  onNavigate?: (screen: ScreenType) => void;
}

export const Header: React.FC<HeaderProps> = ({ onToggleMobileSidebar, onNavigate }) => {
  return (
    <header className="fixed top-0 left-0 lg:left-[240px] right-0 h-14 bg-surface border-b border-surface-variant z-40 flex items-center justify-between px-space-4 lg:px-space-6">
      <div className="flex items-center gap-space-2 lg:hidden">
        <button
          onClick={onToggleMobileSidebar}
          className="p-1.5 rounded hover:bg-surface-container text-on-surface cursor-pointer"
          aria-label="Open navigation menu"
        >
          <span className="material-symbols-outlined text-[20px]">menu</span>
        </button>
        <button
          onClick={() => onNavigate?.('models')}
          className="font-headline-sm text-headline-sm text-on-surface font-semibold cursor-pointer"
          aria-label="Go to ModelDock home"
        >
          ModelDock
        </button>
      </div>

      <div className="flex items-center gap-space-3 ml-auto">
        <div className="flex items-center gap-space-1 px-space-2 py-1 rounded border border-surface-variant bg-surface-container-lowest text-on-surface-variant font-code-sm text-code-sm">
          <span className="material-symbols-outlined text-[14px]">terminal</span>
          <span>v1.4.2-local</span>
        </div>
        <button
          type="button"
          onClick={() => onNavigate?.('profile')}
          className="w-8 h-8 rounded-full bg-primary flex items-center justify-center cursor-pointer hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary/40"
          title="Open local operator profile"
          aria-label="Open local operator profile"
        >
          <span className="material-symbols-outlined text-on-primary text-[18px]">person</span>
        </button>
      </div>
    </header>
  );
};
