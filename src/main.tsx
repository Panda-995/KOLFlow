import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { applyThemeColors, getSavedThemeId } from './lib/theme';
import './index.css';

// 应用启动即恢复已保存的主题，而不是等进入设置页才生效
applyThemeColors(getSavedThemeId());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
