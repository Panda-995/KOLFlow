import { memo } from 'react';
import { clsx } from 'clsx';
import { CheckCircle2, Clock } from 'lucide-react';
import { Todo } from '../../types';
import { TODO_PRIORITY_CONFIG } from '../../constants/orders';

interface TodoItemProps {
  todo: Todo;
  onToggle: () => void;
}

export default memo(function TodoItem({ todo, onToggle }: TodoItemProps) {
  const priority = TODO_PRIORITY_CONFIG[todo.priority] || TODO_PRIORITY_CONFIG.medium;

  return (
    <div
      className={clsx(
        "flex items-start gap-3 p-3 rounded-xl border transition-all duration-200 cursor-pointer group",
        todo.completed
          ? "bg-gray-50 border-transparent opacity-60"
          : "bg-white border-border/50 hover:border-accent/50 hover:shadow-sm"
      )}
      onClick={onToggle}
    >
      <div
        className={clsx(
          "mt-0.5 w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0 transition-all duration-200",
          todo.completed
            ? "bg-accent border-accent text-white"
            : "border-gray-300 text-transparent group-hover:border-accent"
        )}
      >
        <CheckCircle2 size={12} />
      </div>
      <div className="flex-1 min-w-0">
        <p
          className={clsx(
            "text-sm font-medium truncate transition-all",
            todo.completed ? "line-through text-gray-500" : "text-panda-black"
          )}
        >
          {todo.content}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <span
            className={clsx(
              "text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider",
              priority.bg,
              priority.text
            )}
          >
            {priority.label}
          </span>
          <span className="text-[10px] text-gray-400 flex items-center gap-1">
            <Clock size={10} />
            {todo.dueDate}
          </span>
        </div>
      </div>
    </div>
  );
});