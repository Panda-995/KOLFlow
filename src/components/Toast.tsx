import React, { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { clsx } from 'clsx';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'success') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onRemove={() => removeToast(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onRemove, 3000);
    return () => clearTimeout(timer);
  }, [onRemove]);

  const icons = {
    success: <CheckCircle className="text-success" size={18} />,
    error: <AlertCircle className="text-danger" size={18} />,
    info: <Info className="text-accent" size={18} />,
    warning: <AlertTriangle className="text-warning" size={18} />,
  };

  const bgColors = {
    success: 'bg-green-50 border-green-100',
    error: 'bg-red-50 border-red-100',
    info: 'bg-blue-50 border-blue-100',
    warning: 'bg-yellow-50 border-yellow-100',
  };

  return (
    <div className={clsx(
      "pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border shadow-lg animate-in slide-in-from-right-full duration-300",
      bgColors[toast.type]
    )}>
      {icons[toast.type]}
      <p className="text-sm font-medium text-gray-800">{toast.message}</p>
      <button onClick={onRemove} className="text-gray-400 hover:text-gray-600 transition-colors">
        <X size={16} />
      </button>
    </div>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
