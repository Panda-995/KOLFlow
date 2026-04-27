import { AlertTriangle } from 'lucide-react';
import { clsx } from 'clsx';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info';
}

export default function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = '确认删除',
  cancelText = '取消',
  type = 'danger'
}: ConfirmDialogProps) {
  if (!isOpen) return null;

  const typeStyles = {
    danger: {
      icon: 'text-danger bg-danger/10',
      button: 'bg-danger hover:bg-danger/90 text-white'
    },
    warning: {
      icon: 'text-warning bg-warning/10',
      button: 'bg-warning hover:bg-warning/90 text-white'
    },
    info: {
      icon: 'text-info bg-info/10',
      button: 'bg-info hover:bg-info/90 text-white'
    }
  };

  const style = typeStyles[type];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-4 md:p-6">
          <div className="flex items-start gap-3 md:gap-4 mb-4">
            <div className={clsx('w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center flex-shrink-0', style.icon)}>
              <AlertTriangle size={20} className="md:w-6 md:h-6" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base md:text-lg font-bold text-panda-black">{title}</h3>
              <p className="text-xs md:text-sm text-gray-500 mt-1">{message}</p>
            </div>
          </div>

          <div className="flex justify-end gap-2 md:gap-3 mt-4 md:mt-6">
            <button
              onClick={onClose}
              className="px-3 md:px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-xl transition-colors text-xs md:text-sm font-medium"
            >
              {cancelText}
            </button>
            <button
              onClick={() => {
                onConfirm();
                onClose();
              }}
              className={clsx('px-3 md:px-4 py-2 rounded-xl transition-colors text-xs md:text-sm font-medium', style.button)}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}