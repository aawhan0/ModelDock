import React from 'react';

interface ToastProps {
  message: string | null;
  onClose?: () => void;
}

export const Toast: React.FC<ToastProps> = ({ message }) => {
  if (!message) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-space-4 py-space-2 bg-inverse-surface text-inverse-on-surface rounded-lg shadow-xl font-body-default text-body-default animate-fade-in transition-all">
      <span className="material-symbols-outlined text-[16px] text-secondary-fixed">check_circle</span>
      <span>{message}</span>
    </div>
  );
};
