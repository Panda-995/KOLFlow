import { useEffect, useRef } from 'react';
import { isSelectPanelOpen } from '../components/common/Select';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

// 弹窗键盘与读屏支持：打开时移入焦点、Tab 焦点陷阱、Esc 关闭、关闭后焦点归还。
// 返回的 ref 挂在弹窗容器（role="dialog"）上。
export const useDialogA11y = <T extends HTMLElement>(
  isOpen: boolean,
  onClose: () => void,
  options: { canClose?: () => boolean } = {},
) => {
  const containerRef = useRef<T | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const canCloseRef = useRef(options.canClose);
  canCloseRef.current = options.canClose;

  useEffect(() => {
    if (!isOpen) return;

    const container = containerRef.current;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const focusables = container
      ? Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
        .filter(el => el.offsetParent !== null || el === document.activeElement)
      : [];
    (focusables[0] ?? container)?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // 下拉面板展开时，Esc 只关闭下拉（Select 自己处理），不关闭整个弹窗
        if (isSelectPanelOpen()) return;
        // 处理中（如删除请求仍在执行）不允许关闭，与"取消"按钮的禁用条件保持一致
        if (canCloseRef.current && !canCloseRef.current()) return;
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !container) return;

      const items = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
        .filter(el => !el.hasAttribute('disabled'));
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    // 捕获阶段监听，保证 Esc 优先于页面级快捷键
    document.addEventListener('keydown', handleKeyDown, true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [isOpen]);

  return containerRef;
};
