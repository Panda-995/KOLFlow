import { useState } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, isSameMonth, isSameDay, addDays, parseISO } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { useStore } from '../store/useStore';
import { clsx } from 'clsx';

export default function Calendar() {
  const { orders } = useStore();
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const renderHeader = () => {
    return (
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-panda-black text-white rounded-xl">
            <CalendarIcon size={24} />
          </div>
          <h1 className="text-2xl font-bold text-panda-black">日程日历</h1>
        </div>
        <div className="flex items-center gap-4 bg-white p-1 rounded-xl shadow-sm border border-border/50">
          <button 
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            className="p-2 hover:bg-bg-secondary rounded-lg transition-colors"
          >
            <ChevronLeft size={20} />
          </button>
          <span className="text-lg font-bold min-w-[120px] text-center">
            {format(currentMonth, 'yyyy年 MMMM', { locale: zhCN })}
          </span>
          <button 
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            className="p-2 hover:bg-bg-secondary rounded-lg transition-colors"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>
    );
  };

  const renderDays = () => {
    const days = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    return (
      <div className="grid grid-cols-7 mb-2">
        {days.map((day, index) => (
          <div key={index} className="text-center text-sm font-medium text-gray-500 py-2">
            {day}
          </div>
        ))}
      </div>
    );
  };

  const renderCells = () => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
    const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });

    const rows = [];
    let days = [];
    let day = startDate;
    let formattedDate = "";

    while (day <= endDate) {
      for (let i = 0; i < 7; i++) {
        formattedDate = format(day, "d");
        const cloneDay = day;

        // Find orders for this day (使用接单日期和交稿日期)
        const dayOrders = orders.filter(order => {
          const acceptDate = order.acceptDate ? parseISO(order.acceptDate) : null;
          const submitDate = order.submitDate ? parseISO(order.submitDate) : null;
          return (acceptDate && isSameDay(acceptDate, cloneDay)) || (submitDate && isSameDay(submitDate, cloneDay));
        });

        days.push(
          <div
            key={day.toString()}
            className={clsx(
              "min-h-[120px] p-2 border-t border-l border-border/30 bg-white transition-colors hover:bg-bg-secondary/30",
              !isSameMonth(day, monthStart) ? "text-gray-300 bg-bg-secondary/10" : "text-panda-black",
              isSameDay(day, new Date()) && "bg-panda-black/5"
            )}
          >
            <div className="flex justify-between items-start mb-2">
              <span className={clsx(
                "text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full",
                isSameDay(day, new Date()) && "bg-panda-black text-white shadow-md"
              )}>
                {formattedDate}
              </span>
            </div>
            <div className="space-y-1">
              {dayOrders.map(order => {
                const isAccept = order.acceptDate && isSameDay(parseISO(order.acceptDate), cloneDay);
                return (
                  <div
                    key={order.id}
                    className={clsx(
                      "text-[10px] p-1.5 rounded-lg border truncate shadow-sm",
                      isAccept
                        ? "bg-success/10 border-success/20 text-success-dark"
                        : "bg-warning/10 border-warning/20 text-warning-dark"
                    )}
                    title={order.title}
                  >
                    <div className="flex items-center gap-1 font-bold">
                      {isAccept ? "接单" : "交稿"}
                    </div>
                    <div className="truncate">{order.title}</div>
                  </div>
                );
              })}
            </div>
          </div>
        );
        day = addDays(day, 1);
      }
      rows.push(
        <div className="grid grid-cols-7" key={day.toString()}>
          {days}
        </div>
      );
      days = [];
    }
    return <div className="border-b border-r border-border/30 rounded-xl overflow-hidden shadow-sm">{rows}</div>;
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      {renderHeader()}
      <div className="card p-0 overflow-hidden">
        {renderDays()}
        {renderCells()}
      </div>
      
      <div className="mt-8 flex gap-6">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <div className="w-3 h-3 rounded-full bg-success"></div>
          <span>接单日期</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <div className="w-3 h-3 rounded-full bg-warning"></div>
          <span>交稿日期</span>
        </div>
      </div>
    </div>
  );
}
