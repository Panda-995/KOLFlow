import { ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  width?: string;
}

export default function Modal({ isOpen, onClose, title, children, width = 'max-w-md' }: ModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className={`bg-white rounded-2xl shadow-xl w-full ${width} overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col`}>
        <div className="flex items-center justify-between px-4 md:px-6 py-4 border-b border-border/50 flex-shrink-0">
          <h2 className="text-base md:text-lg font-bold text-panda-black">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-panda-black transition-colors">
            <X size={20} />
          </button>
        </div>
        <div className="p-4 md:p-6 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
