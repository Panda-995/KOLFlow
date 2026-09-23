import { useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle } from 'lucide-react';
import { clsx } from 'clsx';
import { useDialogA11y } from '../hooks/useDialogA11y';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
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
  const [isConfirming, setIsConfirming] = useState(false);
  // 确认执行中禁止 Esc 关闭（与取消按钮的禁用条件一致）
  const containerRef = useDialogA11y<HTMLDivElement>(isOpen, onClose, { canClose: () => !isConfirming });

  if (!isOpen) return null;

  const typeStyles = {
    danger: {
      icon: 'text-danger bg-danger/10',
      button: 'bg-danger hover:bg-danger/90 text-white'
    },
    warning: {
      icon: 'text-warning bg-warning/10',
      // 黄底配白字对比仅约 2:1，改用深色文字满足可读性
      button: 'bg-warning hover:bg-warning/90 text-panda-black'
    },
    info: {
      icon: 'text-info bg-info/10',
      button: 'bg-info hover:bg-info/90 text-white'
    }
  };

  const style = typeStyles[type];

  const handleConfirm = async () => {
    if (isConfirming) return;

    setIsConfirming(true);
    try {
      await onConfirm();
      onClose();
    } catch (error) {
      console.error('Confirm action failed:', error);
    } finally {
      setIsConfirming(false);
    }
  };

  // 与 Modal 一致：portal 到 body，保证相对视口居中且不被滚动容器带走
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div
        ref={containerRef}
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="bg-panda-white rounded-2xl border-2 border-panda-black shadow-[6px_6px_0_0_var(--shadow-hard)] w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200 outline-none"
      >
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
              type="button"
              onClick={onClose}
              disabled={isConfirming}
              className="btn-secondary px-3 md:px-4 py-2 text-xs md:text-sm"
            >
              {cancelText}
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isConfirming}
              className={clsx('px-3 md:px-4 py-2 text-xs md:text-sm font-medium rounded-xl border-2 transition-all shadow-[3px_3px_0_0_var(--shadow-hard)] hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[5px_5px_0_0_var(--shadow-hard)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-[1px_1px_0_0_var(--shadow-hard)] disabled:opacity-60 disabled:cursor-not-allowed', style.button)}
            >
              {isConfirming ? '处理中...' : confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
