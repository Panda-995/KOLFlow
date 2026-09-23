import { useCallback, useEffect, useState } from 'react';
import { useStore } from '../store/useStore';
import { ArrowUpRight, ArrowDownRight, Package, DollarSign, CheckCircle2, Calendar as CalendarIcon, Receipt, Target, Edit3 } from 'lucide-react';
import { clsx } from 'clsx';
import { Link, useNavigate } from 'react-router-dom';
import Modal from '../components/Modal';
import { useToast } from '../components/Toast';
import { AreaChartComponent } from '../components/charts/MemoizedCharts';
import TodoItem from '../components/todos/TodoItem';
import { authFetch } from '../lib/api';
import { getSessionEpoch, isSessionCurrent } from '../store/cache';
import type { Order, Todo } from '../types';

type DashboardOverview = {
  monthlyIncome: number;
  lastMonthIncome: number;
  completedOrders: number;
  pendingOrders: number;
  completionRate: number;
  completionRateChange: number;
  newOrdersThisMonth: number;
  thisMonthOrderCount: number;
  monthlyStats: Array<{ name: string; monthIndex: number; income: number }>;
  recentOrders: Order[];
  recentTodos: Todo[];
};

export default function Dashboard() {
  const { toggleTodo } = useStore();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [loadError, setLoadError] = useState(false);
  const loadOverview = useCallback(async () => {
    const epoch = getSessionEpoch();
    const now = new Date();
    try {
      const response = await authFetch(`/api/dashboard?year=${now.getFullYear()}&month=${now.getMonth() + 1}`);
      if (!response.ok) throw new Error('仪表盘加载失败');
      const data = await response.json() as DashboardOverview;
      if (!isSessionCurrent(epoch)) return;
      setOverview(data);
      setLoadError(false);
    } catch {
      if (isSessionCurrent(epoch)) setLoadError(true);
    }
  }, []);
  useEffect(() => { void loadOverview(); }, [loadOverview]);

  const monthlyTargetKey = `monthlyTarget:${localStorage.getItem('userId') ?? ''}`;
  const [monthlyTarget, setMonthlyTarget] = useState(() => {
    const saved = Number(localStorage.getItem(monthlyTargetKey));
    return Number.isFinite(saved) && saved > 0 ? saved : 10000;
  });
  const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);
  const [goalInput, setGoalInput] = useState(monthlyTarget.toString());

  const handleSaveGoal = () => {
    const newGoal = Number(goalInput);
    if (newGoal > 0) {
      setMonthlyTarget(newGoal);
      localStorage.setItem(monthlyTargetKey, newGoal.toString());
      setIsGoalModalOpen(false);
      showToast('月度目标已更新');
    } else {
      showToast('请输入有效的目标金额', 'error');
    }
  };

  const monthlyIncome = overview?.monthlyIncome ?? 0;
  const lastMonthIncome = overview?.lastMonthIncome ?? 0;
  const completedOrders = overview?.completedOrders ?? 0;
  const pendingOrders = overview?.pendingOrders ?? 0;
  const completionRate = overview?.completionRate ?? 0;
  const newOrdersThisMonth = overview?.newOrdersThisMonth ?? 0;
  const completionRateChange = overview?.completionRateChange ?? 0;
  const thisMonthOrderCount = overview?.thisMonthOrderCount ?? 0;
  const orders = overview?.recentOrders ?? [];
  const todos = overview?.recentTodos ?? [];
  const data = overview?.monthlyStats ?? [];
  const incomeChange = lastMonthIncome === 0
    ? (monthlyIncome > 0 ? 100 : 0)
    : ((monthlyIncome - lastMonthIncome) / lastMonthIncome) * 100;
  const targetProgress = Math.min(Math.round((monthlyIncome / monthlyTarget) * 100), 100) || 0;
  const handleToggleTodo = async (id: string) => {
    await toggleTodo(id);
    await loadOverview();
  };

  const quickActions = [
    { name: '新建商单', icon: Package, path: '/orders?new=1', color: 'bg-blue-500 text-white' },
    { name: '添加待办', icon: CheckCircle2, path: '/todos?tab=list&new=1', color: 'bg-panda-black text-panda-white' },
    { name: '查看日历', icon: CalendarIcon, path: '/todos?tab=calendar', color: 'bg-emerald-500 text-white' },
    { name: '财务入账', icon: Receipt, path: '/billing?new=1', color: 'bg-amber-500 text-white' },
  ];

  if (loadError && !overview) {
    return <div role="alert" className="card-pixel p-6">仪表盘加载失败。<button className="ml-3 underline" onClick={() => void loadOverview()}>重试</button></div>;
  }
  if (!overview) {
    return <div role="status" className="card-pixel p-6">正在加载业务概览…</div>;
  }

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
            <div className="text-xs text-gray-500">{new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
          </div>
          <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-panda-white border border-border/50 flex items-center justify-center shadow-sm">
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
            <div className={clsx("w-9 h-9 md:w-10 md:h-10 rounded-xl flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform", action.color)}>
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
          className="card-pixel p-4 md:p-6 flex flex-col gap-3 md:gap-4 bg-gradient-to-br from-panda-black to-gray-800 text-white relative overflow-hidden cursor-pointer group focus-visible:outline-2 focus-visible:outline-offset-2"
          role="button"
          tabIndex={0}
          aria-label="设置月度目标"
          onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setIsGoalModalOpen(true); } }}
          onClick={() => setIsGoalModalOpen(true)}
        >
          <div className="absolute top-0 right-0 p-6 md:p-8 opacity-10">
            <DollarSign size={80} className="md:hidden" />
            <DollarSign size={120} className="hidden md:block" />
          </div>
          <div className="absolute top-2 md:top-3 right-2 md:right-3 max-md:opacity-100 opacity-0 group-hover:opacity-100 hover-visible transition-opacity">
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
                  incomeChange > 0 ? "text-white bg-panda-white/20" : "text-white bg-panda-white/10"
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
            <div className="w-full bg-panda-white/20 h-1.5 md:h-2 rounded-full overflow-hidden">
              <div className="bg-panda-white h-full rounded-full transition-all duration-1000" style={{ width: `${targetProgress}%` }}></div>
            </div>
            <div className="flex justify-between items-center mt-1.5 md:mt-2">
              <span className="text-[10px] md:text-xs text-gray-200">月度目标 ¥{monthlyTarget.toLocaleString()}</span>
              <span className="text-[10px] md:text-xs font-bold text-white">{targetProgress}%</span>
            </div>
          </div>
        </div>

        <div className="card-pixel p-4 md:p-6 flex flex-col gap-3 md:gap-4 relative overflow-hidden bg-panda-white">
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

        <div className="card-pixel p-4 md:p-6 flex flex-col gap-3 md:gap-4 relative overflow-hidden bg-panda-white">
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
                  <span title="本月完成率环比上月（按接单日期）">{completionRateChange > 0 ? '+' : ''}{completionRateChange.toFixed(1)}%</span>
                </div>
              )}
            </div>
            <div className="text-2xl md:text-4xl font-bold font-mono tracking-tight text-panda-black mb-2 md:mb-4">
              {completionRate}%
            </div>
            <div className="flex items-center gap-2 text-xs md:text-sm text-gray-500">
              <span className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-success"></span>
              本月 {thisMonthOrderCount} 单 · 累计完成 {completedOrders}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
{/* 收入趋势 */}
        <div className="card-pixel p-6 lg:col-span-2 bg-panda-white">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold">收入趋势</h2>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 text-xs text-gray-500">
                <div className="w-2 h-2 rounded-full bg-panda-black"></div>
                <span>实收金额</span>
              </div>
            </div>
          </div>
          {/* 空账号不画全零折线：与统计页的空状态保持一致 */}
          {data.some(point => point.income > 0) ? (
            <div className="h-[300px] w-full">
              <AreaChartComponent
                data={data}
                dataKey="income"
                dataName="实收金额"
                height={300}
              />
            </div>
          ) : (
            <div className="h-[300px] w-full flex flex-col items-center justify-center text-gray-600">
              <div className="text-4xl mb-2 opacity-50">🐼</div>
              <p>暂无收入数据</p>
            </div>
          )}
        </div>

        {/* 待办事项 */}
        <div className="card-pixel p-6 flex flex-col bg-panda-white">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold">近期待办</h2>
            <Link to="/todos" className="text-sm text-accent hover:underline font-medium">查看全部</Link>
          </div>
          <div className="space-y-4 flex-1 overflow-auto pr-2 custom-scrollbar">
            {todos.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-600 gap-2">
                <CheckCircle2 size={40} className="opacity-20" />
                <p className="text-sm">暂无待办事项</p>
              </div>
            ) : (
              todos.slice(0, 6).map(todo => (
                <TodoItem
                  key={todo.id}
                  todo={todo}
                  onToggle={() => void handleToggleTodo(todo.id)}
                />
              ))
            )}
          </div>
        </div>

        {/* 最近商单 */}
        <div className="card-pixel p-4 md:p-6 lg:col-span-3 bg-panda-white">
          <div className="flex items-center justify-between mb-4 md:mb-6">
            <h2 className="text-base md:text-lg font-bold">最近商单</h2>
            <Link to="/orders" className="text-xs md:text-sm text-accent hover:underline font-medium">查看全部</Link>
          </div>
          
          {/* Mobile card view */}
          <div className="md:hidden space-y-3">
            {orders.slice(0, 5).map(order => (
              <div 
                key={order.id} 
                className="p-3 border border-border/50 rounded-xl hover:bg-panda-black/5 transition-colors cursor-pointer"
                onClick={() => navigate(`/orders?id=${order.id}`)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); navigate(`/orders?id=${order.id}`); } }}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-panda-black text-panda-white flex items-center justify-center font-bold text-xs">
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
                <div className="text-[10px] text-gray-500 mt-1">
                  {order.acceptDate || '-'}
                </div>
              </div>
            ))}
            {orders.length === 0 && (
              <div className="py-8 text-center text-gray-600 text-sm">
                暂无商单记录
              </div>
            )}
          </div>

          {/* Desktop table view */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[10px] font-bold text-gray-600 uppercase tracking-widest border-b border-border/50">
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
                  <tr key={order.id} className="group hover:bg-panda-black/5 transition-colors">
                    <td className="py-4 pl-2">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-panda-black text-panda-white flex items-center justify-center font-bold text-xs">
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
                        className="text-gray-600 hover:text-panda-black transition-colors"
                        aria-label={`查看商单：${order.title}`}
                      >
                        <ArrowUpRight size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
                {orders.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-gray-600 text-sm">
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
            <label htmlFor="monthly-target" className="text-sm font-medium text-gray-700">目标金额 (¥)</label>
            <input
              id="monthly-target"
              type="number"
              value={goalInput}
              onChange={(e) => setGoalInput(e.target.value)}
              className="w-full form-control text-lg font-mono"
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
                    ? "bg-accent text-[#1a1a1a]"
                    : "bg-gray-100 text-gray-600 hover:bg-panda-black/15"
                )}
              >
                ¥{amount.toLocaleString()}
              </button>
            ))}
          </div>

          <div className="pt-4 flex justify-end gap-3">
            <button
              onClick={() => setIsGoalModalOpen(false)}
              className="px-4 py-2 text-gray-600 hover:bg-panda-black/10 rounded-xl transition-colors text-sm"
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
