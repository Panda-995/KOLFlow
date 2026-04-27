import { useMemo, useState, useEffect, memo, useCallback } from 'react';
import { useStore } from '../store/useStore';
import { ArrowUpRight, ArrowDownRight, Package, DollarSign, CheckCircle2, Clock, Plus, Calendar as CalendarIcon, Users, Receipt, Target, Edit3, X } from 'lucide-react';
import { clsx } from 'clsx';
import { Link, useNavigate } from 'react-router-dom';
import Modal from '../components/Modal';
import { useToast } from '../components/Toast';
import { AreaChartComponent } from '../components/charts/MemoizedCharts';
import TodoItem from '../components/todos/TodoItem';

// 日期解析辅助函数 - 提取到组件外部避免重复创建
const safeParseDate = (dateStr: string | null | undefined): Date | null => {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  return isNaN(date.getTime()) ? null : date;
};

export default function Dashboard() {
  const { orders, todos, toggleTodo, payments } = useStore();
  const { showToast } = useToast();
  const navigate = useNavigate();

  // 月度目标设置
  const [monthlyTarget, setMonthlyTarget] = useState(() => {
    const saved = localStorage.getItem('monthlyTarget');
    return saved ? Number(saved) : 10000;
  });
  const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);
  const [goalInput, setGoalInput] = useState(monthlyTarget.toString());

  const handleSaveGoal = () => {
    const newGoal = Number(goalInput);
    if (newGoal > 0) {
      setMonthlyTarget(newGoal);
      localStorage.setItem('monthlyTarget', newGoal.toString());
      setIsGoalModalOpen(false);
      showToast('月度目标已更新');
    } else {
      showToast('请输入有效的目标金额', 'error');
    }
  };

  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();

  // 使用 useMemo 缓存所有计算结果
  const paymentStats = useMemo(() => {
    // 当月收入
    const monthlyIncome = payments.filter(p => {
      if (p.type !== 'settled') return false;
      const date = safeParseDate(p.date);
      return date && date.getMonth() === currentMonth && date.getFullYear() === currentYear;
    }).reduce((acc, p) => acc + p.amount, 0);

    // 上月收入
    const lastMonthIncome = payments.filter(p => {
      if (p.type !== 'settled') return false;
      const date = safeParseDate(p.date);
      if (!date) return false;
      return date.getMonth() === (currentMonth === 0 ? 11 : currentMonth - 1) &&
             date.getFullYear() === (currentMonth === 0 ? currentYear - 1 : currentYear);
    }).reduce((acc, p) => acc + p.amount, 0);

    return { monthlyIncome, lastMonthIncome };
  }, [payments, currentMonth, currentYear]);

  const monthlyIncome = paymentStats.monthlyIncome;
  const lastMonthIncome = paymentStats.lastMonthIncome;

  const orderStats = useMemo(() => {
    const completedOrders = orders.filter(o => o.status === 'completed').length;
    const pendingOrders = orders.filter(o => o.status !== 'completed' && o.status !== 'cancelled').length;
    const completionRate = orders.length > 0 ? Math.round((completedOrders / orders.length) * 100) : 0;

    // 本月新增商单
    const newOrdersThisMonth = orders.filter(o => {
      const date = safeParseDate(o.acceptDate);
      return date && date.getMonth() === currentMonth && date.getFullYear() === currentYear;
    }).length;

    // 上月完成率
    const lastMonthOrders = orders.filter(o => {
      const date = safeParseDate(o.acceptDate);
      if (!date) return false;
      return date.getMonth() === (currentMonth === 0 ? 11 : currentMonth - 1) &&
             date.getFullYear() === (currentMonth === 0 ? currentYear - 1 : currentYear);
    });
    const lastMonthCompleted = lastMonthOrders.filter(o => o.status === 'completed').length;
    const lastMonthCompletionRate = lastMonthOrders.length > 0 ? Math.round((lastMonthCompleted / lastMonthOrders.length) * 100) : 0;
    const completionRateChange = completionRate - lastMonthCompletionRate;

    return { completedOrders, pendingOrders, completionRate, newOrdersThisMonth, completionRateChange };
  }, [orders, currentMonth, currentYear]);

  const completedOrders = orderStats.completedOrders;
  const pendingOrders = orderStats.pendingOrders;
  const completionRate = orderStats.completionRate;
  const newOrdersThisMonth = orderStats.newOrdersThisMonth;
  const completionRateChange = orderStats.completionRateChange;

  const incomeChange = lastMonthIncome === 0
    ? (monthlyIncome > 0 ? 100 : 0)
    : ((monthlyIncome - lastMonthIncome) / lastMonthIncome) * 100;

  const targetProgress = Math.min(Math.round((monthlyIncome / monthlyTarget) * 100), 100) || 0;

  const data = useMemo(() => {
    const currentYear = new Date().getFullYear().toString();
    const yearPayments = payments.filter(p => p.date && p.date.startsWith(currentYear) && p.type === 'settled');
    
    const monthlyStats = Array.from({ length: 12 }, (_, i) => ({
      name: `${i + 1}月`,
      monthIndex: i,
      income: 0,
    }));

    yearPayments.forEach(payment => {
      const month = safeParseDate(payment.date)?.getMonth();
      if (month !== undefined && month !== null && !isNaN(month)) {
        monthlyStats[month].income += payment.amount;
      }
    });

    const currentMonth = new Date().getMonth();
    return monthlyStats.slice(0, currentMonth + 1).length > 0 ? monthlyStats.slice(0, currentMonth + 1) : monthlyStats.slice(0, 1);
  }, [payments]);

  const quickActions = [
    { name: '新建商单', icon: Package, path: '/orders', color: 'bg-blue-500' },
    { name: '添加待办', icon: CheckCircle2, path: '/todos?tab=list', color: 'bg-panda-black' },
    { name: '查看日历', icon: CalendarIcon, path: '/todos?tab=calendar', color: 'bg-emerald-500' },
    { name: '财务入账', icon: Receipt, path: '/billing', color: 'bg-amber-500' },
  ];

  return (
    <div className="space-y-4 md:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-panda-black">仪表盘</h1>
          <p className="text-xs md:text-sm text-gray-500 mt-0.5 md:mt-1">欢迎回来，这是您今天的业务概览。</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right hidden md:block">
            <div className="text-sm font-medium text-panda-black">{new Date().toLocaleDateString('zh-CN', { weekday: 'long' })}</div>
            <div className="text-xs text-gray-400">{new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
          </div>
          <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-white border border-border/50 flex items-center justify-center shadow-sm">
            <CalendarIcon size={18} className="text-panda-black md:hidden" />
            <CalendarIcon size={20} className="text-panda-black hidden md:block" />
          </div>
        </div>
      </div>

      {/* 快捷操作 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4">
        {quickActions.map((action) => (
          <button
            key={action.name}
            onClick={() => navigate(action.path)}
            className="group card-sketch p-3 md:p-4 flex items-center gap-3 md:gap-4 hover:scale-[1.02] transition-all cursor-pointer"
          >
            <div className={clsx("w-9 h-9 md:w-10 md:h-10 rounded-xl flex items-center justify-center text-white shadow-sm group-hover:scale-110 transition-transform", action.color)}>
              <action.icon size={18} className="md:hidden" />
              <action.icon size={20} className="hidden md:block" />
            </div>
            <span className="font-bold text-panda-black text-sm md:text-base">{action.name}</span>
          </button>
        ))}
      </div>

      {/* 核心指标卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-6">
        <div
          className="card-pixel p-4 md:p-6 flex flex-col gap-3 md:gap-4 bg-gradient-to-br from-panda-black to-gray-800 text-white relative overflow-hidden cursor-pointer group"
          onClick={() => setIsGoalModalOpen(true)}
        >
          <div className="absolute top-0 right-0 p-6 md:p-8 opacity-10">
            <DollarSign size={80} className="md:hidden" />
            <DollarSign size={120} className="hidden md:block" />
          </div>
          <div className="absolute top-2 md:top-3 right-2 md:right-3 opacity-0 group-hover:opacity-100 transition-opacity">
            <Edit3 size={14} className="text-white/60 md:hidden" />
            <Edit3 size={16} className="text-white/60 hidden md:block" />
          </div>
          <div className="relative">
            <div className="flex items-center justify-between mb-2 md:mb-4">
              <div className="flex items-center gap-1.5 md:gap-2 text-gray-300 font-medium text-sm md:text-base">
                <DollarSign size={16} className="text-white md:hidden" />
                <DollarSign size={20} className="text-white hidden md:block" />
                <span>月收入</span>
              </div>
              {incomeChange !== 0 && (
                <div className={clsx(
                  "flex items-center gap-1 text-xs md:text-sm font-medium px-1.5 md:px-2 py-0.5 md:py-1 rounded-md",
                  incomeChange > 0 ? "text-white bg-white/20" : "text-white bg-white/10"
                )}>
                  {incomeChange > 0 ? <ArrowUpRight size={12} className="md:hidden" /> : <ArrowDownRight size={12} className="md:hidden" />}
                  {incomeChange > 0 ? <ArrowUpRight size={16} className="hidden md:block" /> : <ArrowDownRight size={16} className="hidden md:block" />}
                  <span>{incomeChange > 0 ? '+' : ''}{incomeChange.toFixed(1)}%</span>
                </div>
              )}
            </div>
            <div className="text-2xl md:text-4xl font-bold font-mono tracking-tight text-white mb-2 md:mb-4">
              ¥ {monthlyIncome.toLocaleString()}
            </div>
            <div className="w-full bg-white/20 h-1.5 md:h-2 rounded-full overflow-hidden">
              <div className="bg-white h-full rounded-full transition-all duration-1000" style={{ width: `${targetProgress}%` }}></div>
            </div>
            <div className="flex justify-between items-center mt-1.5 md:mt-2">
              <span className="text-[10px] md:text-xs text-gray-400">月度目标 ¥{monthlyTarget.toLocaleString()}</span>
              <span className="text-[10px] md:text-xs font-bold text-white">{targetProgress}%</span>
            </div>
          </div>
        </div>

        <div className="card-pixel p-4 md:p-6 flex flex-col gap-3 md:gap-4 relative overflow-hidden bg-white">
          <div className="absolute top-0 right-0 p-6 md:p-8 opacity-5">
            <Package size={80} className="md:hidden" />
            <Package size={120} className="hidden md:block" />
          </div>
          <div className="relative">
            <div className="flex items-center justify-between mb-2 md:mb-4">
              <div className="flex items-center gap-1.5 md:gap-2 text-gray-500 font-medium text-sm md:text-base">
                <Package size={16} className="text-info md:hidden" />
                <Package size={20} className="text-info hidden md:block" />
                <span>进行中商单</span>
              </div>
            </div>
            <div className="text-2xl md:text-4xl font-bold font-mono tracking-tight text-panda-black mb-2 md:mb-4">
              {pendingOrders}
            </div>
            <div className="flex items-center gap-2 text-xs md:text-sm text-gray-500">
              <span className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-info animate-pulse"></span>
              本月新增 {newOrdersThisMonth} 个合作
            </div>
          </div>
        </div>

        <div className="card-pixel p-4 md:p-6 flex flex-col gap-3 md:gap-4 relative overflow-hidden bg-white">
          <div className="absolute top-0 right-0 p-6 md:p-8 opacity-5">
            <CheckCircle2 size={80} className="md:hidden" />
            <CheckCircle2 size={120} className="hidden md:block" />
          </div>
          <div className="relative">
            <div className="flex items-center justify-between mb-2 md:mb-4">
              <div className="flex items-center gap-1.5 md:gap-2 text-gray-500 font-medium text-sm md:text-base">
                <CheckCircle2 size={16} className="text-success md:hidden" />
                <CheckCircle2 size={20} className="text-success hidden md:block" />
                <span>完成率</span>
              </div>
              {completionRateChange !== 0 && (
                <div className={clsx(
                  "flex items-center gap-1 text-xs md:text-sm font-medium px-1.5 md:px-2 py-0.5 md:py-1 rounded-md",
                  completionRateChange > 0 ? "text-success bg-success/10" : "text-danger bg-danger/10"
                )}>
                  {completionRateChange > 0 ? <ArrowUpRight size={12} className="md:hidden" /> : <ArrowDownRight size={12} className="md:hidden" />}
                  {completionRateChange > 0 ? <ArrowUpRight size={16} className="hidden md:block" /> : <ArrowDownRight size={16} className="hidden md:block" />}
                  <span>{completionRateChange > 0 ? '+' : ''}{completionRateChange.toFixed(1)}%</span>
                </div>
              )}
            </div>
            <div className="text-2xl md:text-4xl font-bold font-mono tracking-tight text-panda-black mb-2 md:mb-4">
              {completionRate}%
            </div>
            <div className="flex items-center gap-2 text-xs md:text-sm text-gray-500">
              <span className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-success"></span>
              共 {completedOrders} 个已完成商单
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
{/* 收入趋势 */}
        <div className="card-pixel p-6 lg:col-span-2 bg-white">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold">收入趋势</h2>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 text-xs text-gray-500">
                <div className="w-2 h-2 rounded-full bg-panda-black"></div>
                <span>实收金额</span>
              </div>
            </div>
          </div>
          <div className="h-[300px] w-full">
            <AreaChartComponent
              data={data}
              dataKey="income"
              height={300}
            />
          </div>
        </div>

        {/* 待办事项 */}
        <div className="card-pixel p-6 flex flex-col bg-white">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold">近期待办</h2>
            <Link to="/todos" className="text-sm text-accent hover:underline font-medium">查看全部</Link>
          </div>
          <div className="space-y-4 flex-1 overflow-auto pr-2 custom-scrollbar">
            {todos.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-2">
                <CheckCircle2 size={40} className="opacity-20" />
                <p className="text-sm">暂无待办事项</p>
              </div>
            ) : (
              todos.slice(0, 6).map(todo => (
                <TodoItem
                  key={todo.id}
                  todo={todo}
                  onToggle={() => toggleTodo(todo.id)}
                />
              ))
            )}
          </div>
        </div>

        {/* 最近商单 */}
        <div className="card-pixel p-4 md:p-6 lg:col-span-3 bg-white">
          <div className="flex items-center justify-between mb-4 md:mb-6">
            <h2 className="text-base md:text-lg font-bold">最近商单</h2>
            <Link to="/orders" className="text-xs md:text-sm text-accent hover:underline font-medium">查看全部</Link>
          </div>
          
          {/* Mobile card view */}
          <div className="md:hidden space-y-3">
            {orders.slice(0, 5).map(order => (
              <div 
                key={order.id} 
                className="p-3 border border-border/50 rounded-xl hover:bg-gray-50/50 transition-colors cursor-pointer"
                onClick={() => navigate(`/orders?id=${order.id}`)}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-panda-black text-white flex items-center justify-center font-bold text-xs">
                      {order.brandName?.charAt(0) || '?'}
                    </div>
                    <span className="font-bold text-panda-black text-sm">{order.brandName || '未知品牌'}</span>
                  </div>
                  <span className={clsx(
                    "text-[10px] px-2 py-0.5 rounded-full font-bold",
                    order.status === 'completed' ? "bg-success/10 text-success" :
                    order.status === 'in_progress' ? "bg-info/10 text-info" :
                    "bg-danger/10 text-danger"
                  )}>
                    {order.status === 'completed' ? '已完成' : 
                     order.status === 'in_progress' ? '进行中' : 
                     '已取消'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>{order.platforms.join(', ')}</span>
                  <span className="font-bold text-panda-black">¥{order.actualAmount.toLocaleString()}</span>
                </div>
                <div className="text-[10px] text-gray-400 mt-1">
                  {order.acceptDate || '-'}
                </div>
              </div>
            ))}
            {orders.length === 0 && (
              <div className="py-8 text-center text-gray-400 text-sm">
                暂无商单记录
              </div>
            )}
          </div>

          {/* Desktop table view */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b border-border/50">
                  <th className="pb-3 pl-2">品牌</th>
                  <th className="pb-3">平台</th>
                  <th className="pb-3">接单日期</th>
                  <th className="pb-3">金额</th>
                  <th className="pb-3">状态</th>
                  <th className="pb-3 text-right pr-2">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {orders.slice(0, 5).map(order => (
                  <tr key={order.id} className="group hover:bg-gray-50/50 transition-colors">
                    <td className="py-4 pl-2">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-panda-black text-white flex items-center justify-center font-bold text-xs">
                          {order.brandName?.charAt(0) || '?'}
                        </div>
                        <span className="font-bold text-panda-black text-sm">{order.brandName || '未知品牌'}</span>
                      </div>
                    </td>
                    <td className="py-4">
                      <span className="text-xs font-medium text-gray-600 bg-gray-100 px-2 py-1 rounded-md">
                        {order.platforms.join(', ')}
                      </span>
                    </td>
                    <td className="py-4">
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <CalendarIcon size={12} />
                        {order.acceptDate || '-'}
                      </div>
                    </td>
                    <td className="py-4">
                      <span className="font-bold text-panda-black text-sm">¥{order.actualAmount.toLocaleString()}</span>
                    </td>
                    <td className="py-4">
                      <span className={clsx(
                        "text-[10px] px-2 py-1 rounded-full font-bold uppercase tracking-wider",
                        order.status === 'completed' ? "bg-success/10 text-success" :
                        order.status === 'in_progress' ? "bg-info/10 text-info" :
                        order.status === 'cancelled' ? "bg-danger/10 text-danger" :
                        "bg-warning/10 text-warning"
                      )}>
                        {order.status === 'completed' ? '已完成' : 
                         order.status === 'in_progress' ? '进行中' : 
                         order.status === 'cancelled' ? '已取消' : '待处理'}
                      </span>
                    </td>
                    <td className="py-4 text-right pr-2">
                      <button 
                        onClick={() => navigate(`/orders?id=${order.id}`)}
                        className="text-gray-400 hover:text-panda-black transition-colors"
                      >
                        <ArrowUpRight size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
                {orders.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-gray-400 text-sm">
                      暂无商单记录
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 月度目标设置弹窗 */}
      <Modal isOpen={isGoalModalOpen} onClose={() => setIsGoalModalOpen(false)} title="设置月度目标">
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-4 bg-accent/5 rounded-xl border border-accent/20">
            <Target className="text-accent" size={24} />
            <div>
              <p className="font-medium text-panda-black">设置您的月度收入目标</p>
              <p className="text-xs text-gray-500 mt-0.5">达成目标后进度条将显示100%</p>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">目标金额 (¥)</label>
            <input
              type="number"
              value={goalInput}
              onChange={(e) => setGoalInput(e.target.value)}
              className="w-full px-4 py-3 border border-border rounded-xl outline-none focus:border-accent transition-all text-lg font-mono"
              placeholder="输入目标金额"
            />
          </div>

          <div className="grid grid-cols-4 gap-2">
            {[5000, 10000, 20000, 50000].map((amount) => (
              <button
                key={amount}
                onClick={() => setGoalInput(amount.toString())}
                className={clsx(
                  "py-2 rounded-lg text-sm font-medium transition-all",
                  Number(goalInput) === amount
                    ? "bg-accent text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                )}
              >
                ¥{amount.toLocaleString()}
              </button>
            ))}
          </div>

          <div className="pt-4 flex justify-end gap-3">
            <button
              onClick={() => setIsGoalModalOpen(false)}
              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-xl transition-colors text-sm"
            >
              取消
            </button>
            <button
              onClick={handleSaveGoal}
              className="btn-primary py-2 px-6"
            >
              保存目标
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
