import { useState, useMemo, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../store/useStore';
import {
  CheckCircle2,
  Clock,
  Plus,
  Trash2,
  Calendar as CalendarIcon,
  List as ListIcon,
  ChevronLeft,
  ChevronRight,
  Building2,
  MoreHorizontal,
  AlertCircle,
  Filter,
  Search,
  Tag,
  Package
} from 'lucide-react';
import { clsx } from 'clsx';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, isSameMonth, isSameDay, addDays, parseISO } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { Todo } from '../types';

const PRIORITIES = [
  { id: 'low', label: '低', color: 'text-info', bg: 'bg-info/10' },
  { id: 'medium', label: '中', color: 'text-warning', bg: 'bg-warning/10' },
  { id: 'high', label: '高', color: 'text-danger', bg: 'bg-danger/10' },
];

export default function Todos() {
  const { todos, toggleTodo, addTodo, deleteTodo, brands, fetchBrands, fetchTodos, orders } = useStore();
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');

  const [viewMode, setViewMode] = useState<'list' | 'calendar'>(() => {
    return tabParam === 'list' ? 'list' : 'calendar';
  });
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isSummaryModalOpen, setIsSummaryModalOpen] = useState(false);

  // 删除确认弹窗状态
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; todo: Todo | null }>({
    isOpen: false,
    todo: null
  });

  const [formData, setFormData] = useState({
    content: '',
    priority: 'medium' as 'low' | 'medium' | 'high',
    category: '',
    brandId: '',
    dueDate: format(new Date(), 'yyyy-MM-dd')
  });

  useEffect(() => {
    fetchBrands();
  }, [fetchBrands]);

  const filteredTodos = useMemo(() => {
    return todos.filter(todo => {
      const matchesStatus = filter === 'all' ? true : (filter === 'active' ? !todo.completed : todo.completed);
      const matchesCategory = categoryFilter === 'all' ? true : todo.category === categoryFilter;
      const matchesSearch = todo.content.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesStatus && matchesCategory && matchesSearch;
    }).sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      const priorityMap = { high: 0, medium: 1, low: 2 };
      return priorityMap[a.priority] - priorityMap[b.priority];
    });
  }, [todos, filter, categoryFilter, searchQuery]);

  const categories = useMemo(() => {
    return brands.map(b => b.name);
  }, [brands]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addTodo(formData);
      showToast('任务已创建');
      setIsModalOpen(false);
      setFormData({
        content: '',
        priority: 'medium',
        category: '',
        brandId: '',
        dueDate: format(new Date(), 'yyyy-MM-dd')
      });
    } catch (error) {
      showToast(error instanceof Error ? error.message : '创建失败', 'error');
    }
  };

  const handleBrandChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const brandId = e.target.value;
    const brand = brands.find(b => b.id === brandId);
    setFormData({
      ...formData,
      brandId,
      category: brand ? brand.name : ''
    });
  };

  const handleDeleteTodo = (todo: Todo) => {
    setDeleteConfirm({ isOpen: true, todo });
  };

  const confirmDeleteTodo = async () => {
    if (deleteConfirm.todo) {
      await deleteTodo(deleteConfirm.todo.id);
    }
  };

  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));

  // 预计算日历数据，避免在渲染时重复计算
  const calendarData = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
    const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });

    const days: { date: Date; isCurrentMonth: boolean; todos: typeof todos; orders: typeof orders }[] = [];
    let day = startDate;

    while (day <= endDate) {
      const cloneDay = day;
      const dayTodos = todos.filter(t => t.dueDate && isSameDay(parseISO(t.dueDate), cloneDay));
      const dayOrders = orders.filter(order => {
        const acceptDate = order.acceptDate ? parseISO(order.acceptDate) : null;
        const submitDate = order.submitDate ? parseISO(order.submitDate) : null;
        return (acceptDate && isSameDay(acceptDate, cloneDay)) || (submitDate && isSameDay(submitDate, cloneDay));
      });

      days.push({
        date: cloneDay,
        isCurrentMonth: isSameMonth(cloneDay, monthStart),
        todos: dayTodos,
        orders: dayOrders
      });
      day = addDays(day, 1);
    }

    return days;
  }, [currentMonth, todos, orders]);

  const renderCalendar = useCallback(() => {
    const rows: JSX.Element[] = [];
    let days: JSX.Element[] = [];

    calendarData.forEach((dayData, index) => {
      const { date, isCurrentMonth, todos: dayTodos, orders: dayOrders } = dayData;
      const formattedDate = format(date, "d");

      days.push(
        <div
          className={clsx(
            "min-h-[100px] border-2 border-panda-black/10 p-2 flex flex-col gap-1 transition-all group relative bg-white",
            !isCurrentMonth ? "bg-gray-50/50 text-gray-400" : "bg-white",
            isSameDay(date, new Date()) ? "border-panda-black bg-panda-black/5" : ""
          )}
          key={date.toString()}
        >
          <div className="flex justify-between items-center mb-1">
            <span className={clsx(
              "text-sm font-bold w-7 h-7 flex items-center justify-center rounded-full transition-colors",
              isSameDay(date, new Date()) ? "bg-panda-black text-white" : "text-panda-black"
            )}>
              {formattedDate}
            </span>
            <button
              onClick={() => {
                setFormData({ ...formData, dueDate: format(date, 'yyyy-MM-dd') });
                setIsModalOpen(true);
              }}
              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-100 rounded-md transition-all text-gray-400 hover:text-panda-black"
            >
              <Plus size={14} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto space-y-1 no-scrollbar">
            {/* 显示商单 */}
            {dayOrders.map(order => {
              const isAccept = order.acceptDate && isSameDay(parseISO(order.acceptDate), date);
              return (
                <div
                  key={order.id}
                  className={clsx(
                    "text-[10px] p-1 rounded-lg border-l-2 truncate flex items-center gap-1",
                    isAccept
                      ? "bg-success/10 text-success border-success"
                      : "bg-warning/10 text-warning border-warning"
                  )}
                  title={order.title}
                >
                  <Package size={10} />
                  <span className="truncate">{order.title}</span>
                </div>
              );
            })}
            {/* 显示待办 */}
            {dayTodos.slice(0, 3 - Math.min(dayOrders.length, 2)).map(todo => (
              <div
                key={todo.id}
                onClick={() => toggleTodo(todo.id)}
                className={clsx(
                  "text-[10px] p-1 rounded cursor-pointer truncate transition-all border-l-2 flex items-center gap-1",
                  todo.completed ? "bg-gray-100 text-gray-400 line-through border-gray-300" :
                  todo.priority === 'high' ? "bg-danger/5 text-danger border-danger" :
                  todo.priority === 'medium' ? "bg-warning/5 text-warning border-warning" :
                  "bg-info/5 text-info border-info"
                )}
              >
                <span className="truncate">{todo.content}</span>
              </div>
            ))}
            {(dayTodos.length + dayOrders.length > 3) && (
              <button
                onClick={() => {
                  setSelectedDate(date);
                  setIsSummaryModalOpen(true);
                }}
                className="text-[10px] text-gray-400 hover:text-panda-black font-medium w-full text-left px-1"
              >
                还有 {dayTodos.length + dayOrders.length - 3} 项...
              </button>
            )}
          </div>
        </div>
      );

      if ((index + 1) % 7 === 0) {
        rows.push(
          <div className="grid grid-cols-7" key={`row-${index}`}>
            {days}
          </div>
        );
        days = [];
      }
    });

    return <div className="border-2 border-panda-black/20 rounded-2xl overflow-hidden">{rows}</div>;
  }, [calendarData, toggleTodo, formData, setFormData]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-6xl mx-auto pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-panda-black">任务与日程</h1>
          <p className="text-gray-500 text-xs mt-1">管理你的日常任务和商单进度</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-gray-100 p-1 rounded-xl border-2 border-panda-black/10">
            <button
              onClick={() => setViewMode('calendar')}
              className={clsx("p-1.5 px-3 rounded-lg transition-all flex items-center gap-2 text-sm font-medium", viewMode === 'calendar' ? "bg-panda-black text-white" : "text-gray-500 hover:text-panda-black")}
            >
              <CalendarIcon size={16} /> 日历
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={clsx("p-1.5 px-3 rounded-lg transition-all flex items-center gap-2 text-sm font-medium", viewMode === 'list' ? "bg-panda-black text-white" : "text-gray-500 hover:text-panda-black")}
            >
              <ListIcon size={16} /> 列表
            </button>
          </div>
          <button onClick={() => setIsModalOpen(true)} className="btn-sketch flex items-center gap-2 text-sm">
            <Plus size={16} />
            <span>新建任务</span>
          </button>
        </div>
      </div>

      {/* 图例 */}
      <div className="flex gap-4 text-xs">
        <div className="flex items-center gap-2 text-gray-600">
          <div className="w-3 h-3 rounded-full bg-success"></div>
          <span>接单日期</span>
        </div>
        <div className="flex items-center gap-2 text-gray-600">
          <div className="w-3 h-3 rounded-full bg-warning"></div>
          <span>交稿日期</span>
        </div>
        <div className="flex items-center gap-2 text-gray-600">
          <div className="w-3 h-3 rounded-full bg-info"></div>
          <span>待办事项</span>
        </div>
      </div>

      {viewMode === 'list' ? (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar Filters */}
          <div className="lg:col-span-1 space-y-6">
            <div className="card-sketch p-5 space-y-5">
              <div>
                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">状态过滤</h3>
                <div className="space-y-1">
                  {[
                    { id: 'all', label: '全部任务', count: todos.length },
                    { id: 'active', label: '进行中', count: todos.filter(t => !t.completed).length },
                    { id: 'completed', label: '已完成', count: todos.filter(t => t.completed).length },
                  ].map(item => (
                    <button
                      key={item.id}
                      onClick={() => setFilter(item.id as any)}
                      className={clsx(
                        "w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm font-medium transition-all",
                        filter === item.id ? "bg-panda-black text-white" : "text-gray-600 hover:bg-gray-100"
                      )}
                    >
                      <span>{item.label}</span>
                      <span className={clsx("px-2 py-0.5 rounded-full text-[10px]", filter === item.id ? "bg-white/20" : "bg-gray-100")}>
                        {item.count}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">品牌分类</h3>
                <div className="space-y-1">
                  <button
                    onClick={() => setCategoryFilter('all')}
                    className={clsx(
                      "w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all",
                      categoryFilter === 'all' ? "bg-panda-black text-white" : "text-gray-600 hover:bg-gray-100"
                    )}
                  >
                    <Filter size={16} />
                    <span>全部品牌</span>
                  </button>
                  {categories.map(cat => (
                    <button
                      key={cat}
                      onClick={() => setCategoryFilter(cat)}
                      className={clsx(
                        "w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all",
                        categoryFilter === cat ? "bg-panda-black text-white" : "text-gray-600 hover:bg-gray-100"
                      )}
                    >
                      <Building2 size={16} className={categoryFilter === cat ? "text-white" : "text-gray-400"} />
                      <span className="truncate">{cat}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Main List */}
          <div className="lg:col-span-3 space-y-4">
            <div className="flex items-center gap-3 bg-white p-2 rounded-2xl border-2 border-panda-black/10">
              <div className="flex-1 flex items-center gap-2 px-3">
                <Search size={18} className="text-gray-400" />
                <input
                  type="text"
                  placeholder="搜索任务..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full bg-transparent outline-none text-sm py-2"
                />
              </div>
            </div>

            <div className="space-y-3">
              {filteredTodos.map(todo => {
                const priority = PRIORITIES.find(p => p.id === todo.priority) || PRIORITIES[1];

                return (
                  <div
                    key={todo.id}
                    className={clsx(
                      "flex items-center gap-4 p-4 rounded-2xl border-2 transition-all group",
                      todo.completed ? "bg-gray-50 border-transparent opacity-60" : "bg-white border-panda-black/10 hover:border-panda-black/30"
                    )}
                  >
                    <button
                      onClick={() => toggleTodo(todo.id)}
                      className={clsx(
                        "w-6 h-6 rounded-lg border-2 flex items-center justify-center flex-shrink-0 transition-all",
                        todo.completed ? "bg-panda-black border-panda-black text-white" : "border-gray-300 text-transparent hover:border-panda-black"
                      )}
                    >
                      <CheckCircle2 size={16} />
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={clsx(
                          "font-semibold transition-all text-sm truncate",
                          todo.completed ? "line-through text-gray-400" : "text-panda-black"
                        )}>
                          {todo.content}
                        </p>
                        {todo.category && (
                          <span className="p-1 rounded-md bg-gray-50 flex items-center gap-1 text-[10px] text-gray-500 font-bold border border-panda-black/10">
                            <Building2 size={10} />
                            {todo.category}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className={clsx(
                          "text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider",
                          priority.bg, priority.color
                        )}>
                          {priority.label}
                        </span>
                        <span className="text-xs text-gray-400 flex items-center gap-1 font-medium">
                          <Clock size={14} />
                          {todo.dueDate || '无截止日期'}
                        </span>
                      </div>
                    </div>

                    <button onClick={() => handleDeleteTodo(todo)} className="p-2 text-gray-400 hover:text-danger hover:bg-danger/10 rounded-xl transition-all opacity-0 group-hover:opacity-100">
                      <Trash2 size={18} />
                    </button>
                  </div>
                );
              })}

              {filteredTodos.length === 0 && (
                <div className="py-20 flex flex-col items-center justify-center text-gray-400 card-sketch">
                  <div className="w-16 h-16 border-2 border-dashed border-gray-300 rounded-full flex items-center justify-center mb-4">
                    <AlertCircle size={32} className="text-gray-300" />
                  </div>
                  <h3 className="text-sm font-bold text-gray-600">未找到任务</h3>
                  <p className="text-xs text-gray-400">尝试调整过滤条件或搜索关键词</p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="card-sketch p-6 bg-white">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <h2 className="text-lg font-bold text-panda-black">
                {format(currentMonth, 'yyyy年 MM月', { locale: zhCN })}
              </h2>
              <div className="flex gap-1 bg-gray-100 p-1 rounded-xl border-2 border-panda-black/10">
                <button onClick={prevMonth} className="p-1.5 hover:bg-white hover:shadow-sm rounded-lg transition-all text-gray-600">
                  <ChevronLeft size={18} />
                </button>
                <button onClick={() => setCurrentMonth(new Date())} className="px-3 py-1 text-xs font-bold hover:bg-white hover:shadow-sm rounded-lg transition-all text-gray-600">
                  今天
                </button>
                <button onClick={nextMonth} className="p-1.5 hover:bg-white hover:shadow-sm rounded-lg transition-all text-gray-600">
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-7 mb-2">
            {['一', '二', '三', '四', '五', '六', '日'].map(day => (
              <div key={day} className="text-center text-xs font-bold text-gray-400 py-2 uppercase tracking-widest">
                周{day}
              </div>
            ))}
          </div>

          {renderCalendar()}
        </div>
      )}

      {/* Create Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="新建任务">
        <form onSubmit={handleSubmit} className="space-y-5 p-1">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">任务内容</label>
            <textarea
              required
              rows={3}
              value={formData.content}
              onChange={e => setFormData({...formData, content: e.target.value})}
              placeholder="输入任务描述..."
              className="input-sketch resize-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">关联品牌 (分类)</label>
              <div className="relative">
                <Building2 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <select
                  value={formData.brandId}
                  onChange={handleBrandChange}
                  className="input-sketch pl-10"
                >
                  <option value="">不关联品牌 (个人任务)</option>
                  {brands.map(brand => (
                    <option key={brand.id} value={brand.id}>{brand.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">优先级</label>
                <div className="flex gap-2">
                  {PRIORITIES.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setFormData({...formData, priority: p.id as any})}
                      className={clsx(
                        "flex-1 py-2 rounded-xl border-2 text-xs font-bold transition-all",
                        formData.priority === p.id ? "border-panda-black bg-panda-black text-white" : "border-panda-black/20 hover:border-panda-black/40"
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">截止日期</label>
                <input
                  type="date"
                  value={formData.dueDate}
                  onChange={e => setFormData({...formData, dueDate: e.target.value})}
                  className="input-sketch"
                />
              </div>
            </div>
          </div>

          <div className="pt-4 flex justify-end gap-3">
            <button type="button" onClick={() => setIsModalOpen(false)} className="btn-secondary px-6 py-2.5">取消</button>
            <button type="submit" className="btn-sketch px-8 py-2.5">保存任务</button>
          </div>
        </form>
      </Modal>

      {/* Summary Modal */}
      <Modal isOpen={isSummaryModalOpen} onClose={() => setIsSummaryModalOpen(false)} title={selectedDate ? format(selectedDate, 'yyyy年MM月dd日 日程', { locale: zhCN }) : ''}>
        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2 no-scrollbar">
          {selectedDate && (
            <>
              {/* 显示商单 */}
              {orders.filter(order => {
                const acceptDate = order.acceptDate ? parseISO(order.acceptDate) : null;
                const submitDate = order.submitDate ? parseISO(order.submitDate) : null;
                return (acceptDate && isSameDay(acceptDate, selectedDate)) || (submitDate && isSameDay(submitDate, selectedDate));
              }).map(order => {
                const isAccept = order.acceptDate && isSameDay(parseISO(order.acceptDate), selectedDate);
                return (
                  <div
                    key={order.id}
                    className={clsx(
                      "flex items-center gap-3 p-4 rounded-2xl border-2 transition-all",
                      isAccept ? "bg-success/5 border-success/30" : "bg-warning/5 border-warning/30"
                    )}
                  >
                    <div className={clsx(
                      "w-5 h-5 rounded-lg flex items-center justify-center flex-shrink-0",
                      isAccept ? "bg-success text-white" : "bg-warning text-white"
                    )}>
                      <Package size={12} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-panda-black truncate">{order.title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={clsx(
                          "text-[10px] px-2 py-0.5 rounded-full font-bold",
                          isAccept ? "bg-success/10 text-success" : "bg-warning/10 text-warning"
                        )}>
                          {isAccept ? '接单日期' : '交稿日期'}
                        </span>
                        <span className="text-[10px] text-gray-400">{order.brandName}</span>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* 显示待办 */}
              {todos.filter(t => t.dueDate && isSameDay(parseISO(t.dueDate), selectedDate)).map(todo => {
                const priority = PRIORITIES.find(p => p.id === todo.priority) || PRIORITIES[1];

                return (
                  <div
                    key={todo.id}
                    className={clsx(
                      "flex items-center gap-3 p-4 rounded-2xl border-2 transition-all",
                      todo.completed ? "bg-gray-50 border-transparent opacity-60" : "bg-white border-panda-black/10"
                    )}
                  >
                    <button
                      onClick={() => toggleTodo(todo.id)}
                      className={clsx(
                        "w-5 h-5 rounded-lg border-2 flex items-center justify-center flex-shrink-0 transition-all",
                        todo.completed ? "bg-panda-black border-panda-black text-white" : "border-gray-300 text-transparent hover:border-panda-black"
                      )}
                    >
                      <CheckCircle2 size={14} />
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className={clsx(
                        "text-sm font-bold transition-all",
                        todo.completed ? "line-through text-gray-500" : "text-panda-black"
                      )}>
                        {todo.content}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        {todo.category && (
                          <span className="p-1 rounded-md bg-gray-50 flex items-center gap-1 text-[9px] text-gray-500 font-bold border border-panda-black/10">
                            <Building2 size={10} />
                            {todo.category}
                          </span>
                        )}
                        <span className={clsx(
                          "text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider",
                          priority.bg, priority.color
                        )}>
                          {priority.label}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {selectedDate && todos.filter(t => t.dueDate && isSameDay(parseISO(t.dueDate), selectedDate)).length === 0 &&
            orders.filter(order => {
              const acceptDate = order.acceptDate ? parseISO(order.acceptDate) : null;
              const submitDate = order.submitDate ? parseISO(order.submitDate) : null;
              return (acceptDate && isSameDay(acceptDate, selectedDate)) || (submitDate && isSameDay(submitDate, selectedDate));
            }).length === 0 && (
            <div className="py-12 flex flex-col items-center justify-center text-gray-400">
              <div className="w-16 h-16 border-2 border-dashed border-gray-300 rounded-full flex items-center justify-center mb-3">
                <AlertCircle size={32} className="text-gray-300" />
              </div>
              <p className="font-bold text-sm">当日无日程</p>
            </div>
          )}
        </div>
        <div className="pt-6 flex justify-end">
          <button onClick={() => setIsSummaryModalOpen(false)} className="btn-secondary px-6 py-2.5">关闭</button>
        </div>
      </Modal>

      {/* 删除确认弹窗 */}
      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        onClose={() => setDeleteConfirm({ isOpen: false, todo: null })}
        onConfirm={confirmDeleteTodo}
        title="确认删除任务"
        message={`确定要删除任务「${deleteConfirm.todo?.content}」吗？此操作不可恢复。`}
        confirmText="确认删除"
      />
    </div>
  );
}