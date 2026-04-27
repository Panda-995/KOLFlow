import { memo } from 'react';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export default memo(function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="py-10 md:py-16 flex flex-col items-center justify-center text-gray-400">
      {icon && <div className="text-3xl md:text-4xl mb-2 opacity-50">{icon}</div>}
      <p className="text-sm font-medium text-gray-600">{title}</p>
      {description && <p className="text-xs text-gray-400 mt-1">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
});