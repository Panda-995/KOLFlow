import { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useDialogA11y } from '../hooks/useDialogA11y';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  width?: string;
}

export default function Modal({ isOpen, onClose, title, children, width = 'max-w-md' }: ModalProps) {
  const containerRef = useDialogA11y<HTMLDivElement>(isOpen, onClose);

  if (!isOpen) return null;

  // 渲染到 body：页面容器带有入场动画的 transform 时会成为 fixed 定位的包含块，
  // 导致弹窗相对"内容板块"而不是视口居中定位（滚动板块还会带着弹窗走）。
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`bg-panda-white rounded-2xl border-2 border-panda-black shadow-[6px_6px_0_0_var(--shadow-hard)] w-full ${width} overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col outline-none`}
      >
        <div className="flex items-center justify-between px-4 md:px-6 py-4 border-b-2 border-panda-black/15 flex-shrink-0">
          <h2 className="text-base md:text-lg font-bold text-panda-black">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭弹窗"
            className="p-1.5 text-gray-600 hover:text-panda-black hover:bg-panda-black/10 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        <div className="p-4 md:p-6 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
