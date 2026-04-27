import { memo } from 'react';
import { clsx } from 'clsx';

interface FilterButtonProps {
  options: { id: string; label: string; count?: number }[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export default memo(function FilterButton({ options, value, onChange, className }: FilterButtonProps) {
  return (
    <div className={clsx("flex items-center gap-0.5 md:gap-1 bg-gray-100 p-0.5 md:p-1 rounded-lg md:rounded-xl border-2 border-panda-black/10", className)}>
      {options.map((option) => (
        <button
          key={option.id}
          onClick={() => onChange(option.id)}
          className={clsx(
            "px-1.5 md:px-2 py-0.5 md:py-1 rounded text-[10px] md:text-xs font-medium transition-all",
            value === option.id
              ? "bg-panda-black text-white"
              : "text-gray-500 hover:text-panda-black"
          )}
        >
          {option.label}
          {option.count !== undefined && (
            <span className={clsx("ml-1", value === option.id ? "text-white/70" : "text-gray-400")}>
              ({option.count})
            </span>
          )}
        </button>
      ))}
    </div>
  );
});