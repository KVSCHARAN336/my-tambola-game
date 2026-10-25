import React from 'react';
import { ToastMessage } from '../types';
import { IconCheck, IconClose } from './Icons';

interface ToastProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const Toast: React.FC<ToastProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 left-0 right-0 z-50 pointer-events-none flex flex-col items-center gap-2 px-4">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`
            pointer-events-auto flex items-center justify-between gap-3 px-4 py-3 rounded-2xl shadow-2xl text-xs sm:text-sm font-bold transition-all max-w-sm w-full border backdrop-blur-md
            ${
              toast.type === 'error'
                ? 'bg-red-950/95 text-red-100 border-red-800'
                : toast.type === 'success'
                ? 'bg-indigo-950/95 text-indigo-100 border-indigo-600'
                : 'bg-slate-900/95 text-slate-100 border-slate-700'
            }
          `}
          role="alert"
        >
          <div className="flex items-center gap-2.5 truncate">
            {toast.type === 'success' && <IconCheck className="w-4 h-4 text-amber-400 shrink-0" />}
            <span className="truncate">{toast.text}</span>
          </div>
          <button
            onClick={() => onDismiss(toast.id)}
            className="p-1 rounded-lg hover:bg-white/10 text-white/70 hover:text-white shrink-0"
            aria-label="Dismiss toast"
          >
            <IconClose className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
};
