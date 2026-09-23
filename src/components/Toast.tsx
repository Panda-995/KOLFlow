import React, { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { clsx } from 'clsx';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
  /** 需要用户手动关闭（不自动消失）：用于"读不完就走掉"的重要警告 */
  persistent: boolean;
}

interface ToastOptions {
  persistent?: boolean;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

// 允许 ToastProvider 之外的模块（如 zustand store）发出可见通知
let externalToastSink: ((message: string, type?: ToastType, options?: ToastOptions) => void) | null = null;

export const emitToast = (message: string, type: ToastType = 'info', options?: ToastOptions): void => {
  if (externalToastSink) {
    externalToastSink(message, type, options);
    return;
  }
  console.warn(`[${type.toUpperCase()}] ${message}`);
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'success', options: ToastOptions = {}) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev.slice(-4), { id, message, type, persistent: options.persistent === true }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  useEffect(() => {
    externalToastSink = showToast;
    return () => { externalToastSink = null; };
  }, [showToast]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* 常驻 live region：容器先于消息存在，读屏才能播报后插入的内容 */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="false"
        className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none"
      >
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onRemove={() => removeToast(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: () => void }) {
  useEffect(() => {
    // 重要警告不自动关闭：长文案 3 秒读不完（备份可恢复性风险属于此类）
    if (toast.persistent) return;
    const timer = setTimeout(onRemove, toast.type === 'error' ? 6000 : 3000);
    return () => clearTimeout(timer);
  }, [onRemove, toast.type, toast.persistent]);

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
    <div
      role={toast.type === 'error' ? 'alert' : 'none'}
      className={clsx(
        "pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border shadow-lg animate-in slide-in-from-right-full duration-300 max-w-[min(92vw,26rem)]",
        bgColors[toast.type]
      )}
    >
      {icons[toast.type]}
      <p className="text-sm font-medium text-gray-800 break-words">{toast.message}</p>
      <button onClick={onRemove} aria-label="关闭通知" className="text-gray-600 hover:text-gray-600 transition-colors">
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
