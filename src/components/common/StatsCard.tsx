import { memo } from 'react';
import { clsx } from 'clsx';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface StatsCardProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  trend?: {
    value: number;
    label?: string;
  };
  className?: string;
  onClick?: () => void;
}

export default memo(function StatsCard({ label, value, icon, trend, className, onClick }: StatsCardProps) {
  return (
    <div 
      className={clsx(
        "card-pixel p-4 md:p-6 flex flex-col gap-2 relative overflow-hidden",
        onClick && "cursor-pointer hover:shadow-lg transition-shadow",
        className
      )}
      onClick={onClick}
    >
      <div className="flex items-center justify-between">
        <span className="text-gray-500 text-xs md:text-sm">{label}</span>
        {icon}
      </div>
      <div className="text-2xl md:text-4xl font-bold font-mono tracking-tight text-panda-black">
        {value}
      </div>
      {trend && (
        <div className={clsx(
          "text-xs flex items-center gap-1",
          trend.value >= 0 ? "text-success" : "text-danger"
        )}>
          {trend.value >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          <span>{trend.value > 0 ? '+' : ''}{trend.value.toFixed(1)}%</span>
          {trend.label && <span className="text-gray-400 ml-1">{trend.label}</span>}
        </div>
      )}
    </div>
  );
});