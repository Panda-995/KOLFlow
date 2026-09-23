import { THEME_COLORS } from '../components/settings/types';

const THEME_ATTR = 'data-theme';

export const getSavedThemeId = (): string => {
  try {
    return localStorage.getItem('theme') || 'panda';
  } catch {
    return 'panda';
  }
};

// 通过 data-theme 属性切换主题色，主题值由 CSS 变量块提供。
// 不使用内联 style.setProperty：内联变量会覆盖样式表里的主题变量，
// 导致后续主题切换或样式调整难以生效。
export const applyThemeColors = (themeId: string | null | undefined): void => {
  if (typeof document === 'undefined') return;
  const theme = THEME_COLORS.find(t => t.id === themeId);
  const root = document.documentElement;
  if (!theme || theme.id === 'panda') {
    root.removeAttribute(THEME_ATTR);
  } else {
    root.setAttribute(THEME_ATTR, theme.id);
  }
};
