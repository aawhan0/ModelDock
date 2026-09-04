import React from 'react';

interface HeaderProps {
  onToggleMobileSidebar?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onToggleMobileSidebar }) => {
  return (
    <header className="fixed top-0 left-0 lg:left-[240px] right-0 h-14 bg-surface/90 backdrop-blur-md border-b border-surface-variant z-40 flex items-center justify-between px-space-4 lg:px-space-6">
      <div className="flex items-center gap-space-2 lg:hidden">
        <button
          onClick={onToggleMobileSidebar}
          className="p-1.5 rounded hover:bg-surface-container text-on-surface"
          aria-label="Open navigation menu"
        >
          <span className="material-symbols-outlined text-[20px]">menu</span>
        </button>
        <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">ModelDock</span>
      </div>

      <div className="flex items-center gap-space-3 ml-auto">
        <div className="flex items-center gap-space-1 px-space-2 py-1 rounded border border-surface-variant bg-surface-container-lowest text-on-surface-variant font-code-sm text-code-sm">
          <span className="material-symbols-outlined text-[14px]">terminal</span>
          <span>v1.4.2-local</span>
        </div>
        <div
          className="w-8 h-8 rounded-full bg-primary flex items-center justify-center cursor-pointer hover:opacity-90 transition-opacity"
          title="Active Operator Profile (local:8080)"
        >
          <span className="material-symbols-outlined text-on-primary text-[18px]">person</span>
        </div>
      </div>
    </header>
  );
};
