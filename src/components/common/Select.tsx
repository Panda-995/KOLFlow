import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { clsx } from 'clsx';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  id?: string;
  size?: 'md' | 'sm' | 'xs';
  disabled?: boolean;
  className?: string;
  /** 当 value 不在 options 中时的占位文案 */
  placeholder?: string;
  'aria-label'?: string;
}

interface PanelPosition {
  top?: number;
  bottom?: number;
  left: number;
  minWidth: number;
  maxHeight: number;
}

// 记录当前打开的 Select 面板数量：弹窗层据此判断 Esc 应先关闭下拉而不是关闭弹窗
let openPanelCount = 0;
export const isSelectPanelOpen = (): boolean => openPanelCount > 0;

const PANEL_GAP = 6;
const PANEL_ESTIMATED_HEIGHT = 280;

/**
 * 风格化下拉框：像素手绘语言（2px 实心边 + 硬阴影 + 阶梯箭头）。
 * 用自定义弹层替代浏览器原生菜单，保证与项目整体视觉一致；
 * 交互遵循 combobox + listbox 模式：焦点留在触发器，用 aria-activedescendant 指路。
 */
export default function Select({
  value,
  onChange,
  options,
  id,
  size = 'md',
  disabled = false,
  className,
  placeholder,
  'aria-label': ariaLabel,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const [position, setPosition] = useState<PanelPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const listboxId = useId();

  const selectedIndex = useMemo(
    () => options.findIndex(option => option.value === value),
    [options, value],
  );
  const selectedLabel = selectedIndex >= 0 ? options[selectedIndex].label : (placeholder ?? value);

  const firstEnabledIndex = useCallback((from: number, step: 1 | -1): number => {
    if (options.length === 0) return -1;
    let index = from;
    for (let i = 0; i < options.length; i += 1) {
      if (index < 0) index = options.length - 1;
      if (index >= options.length) index = 0;
      if (!options[index]?.disabled) return index;
      index += step;
    }
    return -1;
  }, [options]);

  const measure = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - PANEL_GAP;
    const spaceAbove = rect.top - PANEL_GAP;
    const openUpwards = spaceBelow < Math.min(PANEL_ESTIMATED_HEIGHT, spaceAbove) && spaceAbove > spaceBelow;
    const maxHeight = Math.max(96, Math.min(272, openUpwards ? spaceAbove : spaceBelow));
    // 面板最小宽度 8rem：靠右的触发器需要左移，避免溢出视口右缘
    const minWidth = Math.max(rect.width, 128);
    const maxLeft = window.innerWidth - minWidth - PANEL_GAP;
    const left = Math.max(PANEL_GAP, Math.min(rect.left, maxLeft));
    setPosition(openUpwards
      // 上翻时用 bottom 锚定面板底边，内容多高都紧贴触发器上方
      ? { bottom: window.innerHeight - rect.top + PANEL_GAP, left, minWidth, maxHeight }
      : { top: rect.bottom + PANEL_GAP, left, minWidth, maxHeight });
  }, []);

  const openPanel = useCallback(() => {
    if (disabled) return;
    measure();
    setHighlighted(selectedIndex >= 0 ? selectedIndex : firstEnabledIndex(0, 1));
    setOpen(true);
  }, [disabled, firstEnabledIndex, measure, selectedIndex]);

  const closePanel = useCallback((refocus = false) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }, []);

  const commit = useCallback((index: number) => {
    const option = options[index];
    if (!option || option.disabled) return;
    if (option.value !== value) onChange(option.value);
    closePanel(true);
  }, [closePanel, onChange, options, value]);

  // 面板开合计数（供弹窗层判断 Esc 归属）
  useEffect(() => {
    if (!open) return;
    openPanelCount += 1;
    return () => { openPanelCount = Math.max(0, openPanelCount - 1); };
  }, [open]);

  // 打开时重新测量；滚动/缩放跟随定位
  useEffect(() => {
    if (!open) return;
    measure();
    const onScrollOrResize = () => measure();
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open, measure]);

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      closePanel();
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open, closePanel]);

  // 高亮项滚动到可见区域
  useEffect(() => {
    if (!open || !panelRef.current) return;
    const node = panelRef.current.querySelector<HTMLElement>(`[data-index="${highlighted}"]`);
    node?.scrollIntoView({ block: 'nearest' });
  }, [open, highlighted]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!open) {
          openPanel();
        } else {
          const next = firstEnabledIndex(highlighted + 1, 1);
          if (next >= 0) setHighlighted(next);
        }
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (!open) {
          openPanel();
        } else {
          const prev = firstEnabledIndex(highlighted - 1, -1);
          if (prev >= 0) setHighlighted(prev);
        }
        break;
      case 'Home':
        if (!open) return;
        event.preventDefault();
        setHighlighted(firstEnabledIndex(0, 1));
        break;
      case 'End':
        if (!open) return;
        event.preventDefault();
        setHighlighted(firstEnabledIndex(options.length - 1, -1));
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (!open) openPanel();
        else commit(highlighted);
        break;
      case 'Escape':
        if (!open) return;
        event.preventDefault();
        closePanel(true);
        break;
      case 'Tab':
        if (open) closePanel();
        break;
      default:
        break;
    }
  };

  const sizeClass = size === 'sm' ? 'select-trigger-sm' : size === 'xs' ? 'select-trigger-xs' : '';

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-label={ariaLabel}
        aria-valuetext={selectedLabel}
        aria-owns={open ? listboxId : undefined}
        title={ariaLabel}
        aria-activedescendant={open && highlighted >= 0 && highlighted < options.length ? `${listboxId}-opt-${highlighted}` : undefined}
        disabled={disabled}
        onClick={() => (open ? closePanel() : openPanel())}
        onKeyDown={handleKeyDown}
        className={clsx('select-trigger', sizeClass, className)}
      >
        <span className="truncate">{selectedLabel}</span>
      </button>

      {/* 渲染到 body：锚点祖先可能带 transform（卡片悬停位移），会让 fixed 定位失效 */}
      {open && position && createPortal(
        <div
          ref={panelRef}
          id={listboxId}
          role="listbox"
          tabIndex={-1}
          aria-label={ariaLabel}
          className="select-panel"
          style={{
            top: position.top,
            bottom: position.bottom,
            left: position.left,
            minWidth: position.minWidth,
            maxHeight: position.maxHeight,
          }}
        >
          {options.map((option, index) => (
            <div
              key={option.value}
              id={`${listboxId}-opt-${index}`}
              role="option"
              aria-selected={option.value === value}
              data-index={index}
              data-size={size === 'sm' || size === 'xs' ? 'sm' : 'md'}
              data-highlighted={index === highlighted}
              data-disabled={option.disabled ? 'true' : undefined}
              className="select-option"
              onMouseEnter={() => !option.disabled && setHighlighted(index)}
              // 阻止 mousedown 抢焦点，避免点击选项时出现焦点空窗
              onMouseDown={event => event.preventDefault()}
              onClick={() => commit(index)}
            >
              <span className="truncate">{option.label}</span>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
