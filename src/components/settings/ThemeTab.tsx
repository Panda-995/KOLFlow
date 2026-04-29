import { Check } from 'lucide-react';
import { clsx } from 'clsx';
import type { ThemeTabProps } from './types';
import { THEME_COLORS } from './types';

export function ThemeTab({ currentTheme, applyTheme }: ThemeTabProps) {
  return (
    <div className="card-sketch p-6 bg-white">
      <h2 className="text-lg font-bold mb-6">主题外观</h2>
      <div className="space-y-6">
        <p className="text-sm text-gray-500">选择您喜欢的主题配色，让系统更符合您的个性风格。</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {THEME_COLORS.map(theme => (
            <button
              key={theme.id}
              onClick={() => applyTheme(theme.id)}
              className={clsx(
                "relative p-4 rounded-2xl border-2 transition-all hover:scale-[1.02] text-left",
                currentTheme === theme.id
                  ? "border-accent shadow-lg"
                  : "border-border/50 hover:border-gray-300"
              )}
            >
              {currentTheme === theme.id && (
                <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-accent flex items-center justify-center">
                  <Check size={14} className="text-white" />
                </div>
              )}

              <div className="flex items-center gap-3 mb-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold"
                  style={{ backgroundColor: theme.primary }}
                >
                  K
                </div>
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-white"
                  style={{ backgroundColor: theme.accent }}
                >
                  +
                </div>
              </div>

              <h3 className="font-bold text-panda-black">{theme.name}</h3>
              <p className="text-xs text-gray-400 mt-1">{theme.description}</p>

              <div className="flex items-center gap-2 mt-3">
                <div
                  className="flex-1 h-2 rounded-full"
                  style={{ backgroundColor: theme.primary }}
                />
                <div
                  className="flex-1 h-2 rounded-full"
                  style={{ backgroundColor: theme.accent }}
                />
              </div>
            </button>
          ))}
        </div>

        <div className="p-4 bg-gray-50 rounded-xl">
          <p className="text-xs text-gray-500">
            💡 提示：主题设置保存在浏览器本地，切换设备后需要重新设置。
          </p>
        </div>
      </div>
    </div>
  );
}