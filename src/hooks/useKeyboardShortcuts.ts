import { useEffect, useCallback } from 'react';

interface KeyboardShortcut {
  key: string;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  action: () => void;
  description: string;
}

export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[]) {
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // 忽略在输入框中的快捷键
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      // 只允许 Escape 和特定的全局快捷键
      if (event.key !== 'Escape') {
        return;
      }
    }

    for (const shortcut of shortcuts) {
      const keyMatch = event.key.toLowerCase() === shortcut.key.toLowerCase();
      // 修改匹配逻辑：如果定义了 ctrlKey，则必须匹配；如果未定义，则不能有 ctrl/meta
      const ctrlMatch = shortcut.ctrlKey !== undefined
        ? (shortcut.ctrlKey ? (event.ctrlKey || event.metaKey) : (!event.ctrlKey && !event.metaKey))
        : true;
      const shiftMatch = shortcut.shiftKey !== undefined
        ? (shortcut.shiftKey ? event.shiftKey : !event.shiftKey)
        : true;
      const altMatch = shortcut.altKey !== undefined
        ? (shortcut.altKey ? event.altKey : !event.altKey)
        : true;

      if (keyMatch && ctrlMatch && shiftMatch && altMatch) {
        event.preventDefault();
        shortcut.action();
        return;
      }
    }
  }, [shortcuts]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}

// 三组合快捷键配置（避免与浏览器和常用工具冲突）
export const SHORTCUTS_INFO = [
  { key: 'N', ctrlKey: true, altKey: true, description: '新建商单 (Ctrl+Alt+N)' },
  { key: 'B', ctrlKey: true, altKey: true, description: '新建品牌 (Ctrl+Alt+B)' },
  { key: 'T', ctrlKey: true, altKey: true, description: '新建待办 (Ctrl+Alt+T)' },
  { key: 'S', ctrlKey: true, altKey: true, description: '设置 (Ctrl+Alt+S)' },
  { key: 'K', ctrlKey: true, altKey: true, description: '快速搜索 (Ctrl+Alt+K)' },
  { key: 'Escape', description: '关闭弹窗' },
];