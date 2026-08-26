import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend } from 'recharts';
import { useStore } from '../store/useStore';
import { TrendingUp, TrendingDown, DollarSign, Package, CheckCircle, Filter, Megaphone, CalendarRange, X } from 'lucide-react';
import { clsx } from 'clsx';
import { isDateInReportPeriod, parseReportPeriod } from '../lib/reportPeriod';

const COLORS = ['#09090b', '#27272a', '#52525b', '#a1a1aa', '#d4d4d8', '#71717a'];
const STATUS_COLORS = {
  completed: '#22c55e',
  in_progress: '#f59e0b',
  cancelled: '#ef4444'
};
const getSettledDate = (payment: { settledDate?: string; date?: string }) => payment.settledDate || payment.date || '';

export default function Analytics() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [month, setMonth] = useState('all');
  const [brandFilter, setBrandFilter] = useState('all');
  const { orders, payments, assets, paidPromotions } = useStore();
  const reportPeriod = useMemo(() => parseReportPeriod(searchParams), [searchParams]);

  const clearReportPeriod = () => {
    if (!reportPeriod) return;
    const next = new URLSearchParams(searchParams);
    next.delete('period');
    next.delete('start');
    next.delete('end');
    setSearchParams(next, { replace: true });
  };

  const handleYearChange = (value: string) => {
    clearReportPeriod();
    setYear(value);
  };

  const handleMonthChange = (value: string) => {
    clearReportPeriod();
    setMonth(value);
  };

  const orderById = useMemo(() => new Map(orders.map(order => [order.id, order])), [orders]);

  const availableYears = useMemo(() => {
    const years = new Set<string>();
    orders.forEach(o => o.acceptDate && years.add(o.acceptDate.substring(0, 4)));
    payments.forEach(p => getSettledDate(p) && years.add(getSettledDate(p).substring(0, 4)));
    assets.forEach(a => a.soldDate && years.add(a.soldDate.substring(0, 4)));
    paidPromotions.forEach(p => p.createdAt && years.add(p.createdAt.substring(0, 4)));
    years.add(new Date().getFullYear().toString());
    return Array.from(years).sort().reverse();
  }, [orders, payments, assets, paidPromotions]);

  const brandNames = useMemo(() => {
    const names = new Set<string>();
    orders.forEach(o => o.brandName && names.add(o.brandName));
    assets.forEach(a => a.brandName && names.add(a.brandName));
    return Array.from(names).sort();
  }, [orders, assets]);

  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      const matchDate = reportPeriod
        ? isDateInReportPeriod(order.acceptDate, reportPeriod)
        : order.acceptDate?.startsWith(year)
          && (month === 'all' || order.acceptDate?.substring(5, 7) === month);
      const matchBrand = brandFilter === 'all' || order.brandName === brandFilter;
      return matchDate && matchBrand;
    });
  }, [orders, year, month, brandFilter, reportPeriod]);

  const filteredPayments = useMemo(() => {
    return payments.filter(payment => {
      const settledDate = getSettledDate(payment);
      const matchDate = reportPeriod
        ? isDateInReportPeriod(settledDate, reportPeriod)
        : settledDate.startsWith(year)
          && (month === 'all' || settledDate.substring(5, 7) === month);
      const matchBrand = brandFilter === 'all' || payment.brand === brandFilter;
      return matchDate && matchBrand && payment.type === 'settled';
    });
  }, [payments, year, month, brandFilter, reportPeriod]);

  const filteredAssets = useMemo(() => assets.filter(asset => {
    if (asset.saleStatus !== 'sold' || !asset.soldDate) return false;
    const matchDate = reportPeriod
      ? isDateInReportPeriod(asset.soldDate, reportPeriod)
      : asset.soldDate.startsWith(year)
        && (month === 'all' || asset.soldDate.substring(5, 7) === month);
    const matchBrand = brandFilter === 'all' || asset.brandName === brandFilter;
    return matchDate && matchBrand;
  }), [assets, year, month, brandFilter, reportPeriod]);

  const filteredPaidPromotions = useMemo(() => {
    return paidPromotions.filter(record => {
      const order = orderById.get(record.orderId);
      const recordDate = order?.acceptDate || record.createdAt?.substring(0, 10) || '';
      const matchDate = reportPeriod
        ? isDateInReportPeriod(recordDate, reportPeriod)
        : recordDate.startsWith(year)
          && (month === 'all' || recordDate.substring(5, 7) === month);
      const matchBrand = brandFilter === 'all' || order?.brandName === brandFilter;
      return matchDate && matchBrand;
    });
  }, [paidPromotions, orderById, year, month, brandFilter, reportPeriod]);

  const overviewStats = useMemo(() => {
    const paymentIncome = filteredPayments.reduce((sum, p) => sum + p.amount, 0);
    const assetIncome = filteredAssets.reduce((sum, asset) => sum + asset.soldAmount, 0);
    const totalIncome = paymentIncome + assetIncome;
    const paidPromotionTotal = filteredPaidPromotions.reduce((sum, record) => sum + record.amount, 0);
    const totalOrders = filteredOrders.length;
    const completedOrders = filteredOrders.filter(o => o.status === 'completed').length;
    const inProgressOrders = filteredOrders.filter(o => o.status === 'in_progress').length;
    const cancelledOrders = filteredOrders.filter(o => o.status === 'cancelled').length;
    const avgOrderValue = totalOrders > 0 ? paymentIncome / totalOrders : 0;
    const completionRate = totalOrders > 0 ? (completedOrders / totalOrders * 100).toFixed(1) : '0';

    let incomeGrowth: string | null = null;
    if (!reportPeriod) {
      const currentMonth = month === 'all' ? 12 : parseInt(month);
      const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
      const prevYear = currentMonth === 1 ? (parseInt(year) - 1).toString() : year;
      const isFullYear = month === 'all';

      const prevPayments = payments.filter(p => {
        const settledDate = getSettledDate(p);
        if (p.type !== 'settled' || !settledDate) return false;
        return isFullYear
          ? settledDate.startsWith(prevYear)
          : settledDate.startsWith(prevYear)
            && settledDate.substring(5, 7) === prevMonth.toString().padStart(2, '0');
      });
      const prevPaymentIncome = prevPayments.reduce((sum, payment) => sum + payment.amount, 0);
      const prevAssetIncome = assets
        .filter(asset => {
          if (asset.saleStatus !== 'sold' || !asset.soldDate) return false;
          return isFullYear
            ? asset.soldDate.startsWith(prevYear)
            : asset.soldDate.startsWith(prevYear)
              && asset.soldDate.substring(5, 7) === prevMonth.toString().padStart(2, '0');
        })
        .reduce((sum, asset) => sum + asset.soldAmount, 0);
      const prevIncome = prevPaymentIncome + prevAssetIncome;
      incomeGrowth = prevIncome > 0 ? ((totalIncome - prevIncome) / prevIncome * 100).toFixed(1) : '0';
    }

    return { totalIncome, paidPromotionTotal, totalOrders, completedOrders, inProgressOrders, cancelledOrders, avgOrderValue, completionRate, incomeGrowth };
  }, [filteredOrders, filteredPayments, filteredAssets, filteredPaidPromotions, payments, assets, year, month, reportPeriod]);

  const platformData = useMemo(() => {
    const platformCounts: Record<string, number> = {};
    let totalPlatforms = 0;
    filteredOrders.forEach(order => {
      order.platforms.forEach(platform => {
        platformCounts[platform] = (platformCounts[platform] || 0) + 1;
        totalPlatforms++;
      });
    });
    return Object.entries(platformCounts)
      .map(([name, count]) => ({ name, value: count, percentage: totalPlatforms > 0 ? Math.round((count / totalPlatforms) * 100) : 0 }))
      .sort((a, b) => b.value - a.value).slice(0, 6);
  }, [filteredOrders]);

  const statusData = useMemo(() => [
    { name: '已完成', value: overviewStats.completedOrders, color: STATUS_COLORS.completed },
    { name: '进行中', value: overviewStats.inProgressOrders, color: STATUS_COLORS.in_progress },
    { name: '已取消', value: overviewStats.cancelledOrders, color: STATUS_COLORS.cancelled }
  ].filter(d => d.value > 0), [overviewStats]);

  const monthlyData = useMemo(() => {
    if (reportPeriod) {
      return [{
        name: reportPeriod.type === 'weekly' ? '本周' : '本月',
        收入: filteredPayments.reduce((sum, payment) => sum + payment.amount, 0)
          + filteredAssets.reduce((sum, asset) => sum + asset.soldAmount, 0),
        推广费: filteredPaidPromotions.reduce((sum, record) => sum + record.amount, 0),
        商单数: filteredOrders.length,
        完成数: filteredOrders.filter(order => order.status === 'completed').length,
      }];
    }
    const months = month === 'all' ? 12 : 1;
    const startMonth = month === 'all' ? 0 : parseInt(month) - 1;
    return Array.from({ length: months }, (_, i) => {
      const m = month === 'all' ? i : startMonth;
      const monthStr = (m + 1).toString().padStart(2, '0');
      const monthOrders = orders.filter(o => o.acceptDate?.startsWith(year) && o.acceptDate?.substring(5, 7) === monthStr);
      const monthPayments = payments.filter(p => {
        const settledDate = getSettledDate(p);
        return settledDate.startsWith(year) && settledDate.substring(5, 7) === monthStr && p.type === 'settled';
      });
      const monthAssetIncome = assets
        .filter(a => a.saleStatus === 'sold' && a.soldDate?.startsWith(year) && a.soldDate?.substring(5, 7) === monthStr)
        .reduce((sum, a) => sum + a.soldAmount, 0);
      const monthPromotionCost = paidPromotions
        .filter(record => {
          const order = orderById.get(record.orderId);
          const recordDate = order?.acceptDate || record.createdAt?.substring(0, 10) || '';
          return recordDate.startsWith(year) && recordDate.substring(5, 7) === monthStr;
        })
        .reduce((sum, record) => sum + record.amount, 0);
      return {
        name: `${m + 1}月`,
        收入: monthPayments.reduce((sum, p) => sum + p.amount, 0) + monthAssetIncome,
        推广费: monthPromotionCost,
        商单数: monthOrders.length,
        完成数: monthOrders.filter(o => o.status === 'completed').length
      };
    });
  }, [orders, payments, assets, paidPromotions, orderById, year, month, reportPeriod, filteredOrders, filteredPayments, filteredAssets, filteredPaidPromotions]);

  const brandRanking = useMemo(() => {
    const brandIncome: Record<string, number> = {};
    filteredPayments.forEach(payment => {
      if (payment.brand) {
        brandIncome[payment.brand] = (brandIncome[payment.brand] || 0) + payment.amount;
      }
    });
    filteredAssets.forEach(asset => {
      if (asset.soldAmount <= 0 || !asset.brandName) return;
      brandIncome[asset.brandName] = (brandIncome[asset.brandName] || 0) + asset.soldAmount;
    });
    return Object.entries(brandIncome).map(([name, income]) => ({ name, income })).sort((a, b) => b.income - a.income).slice(0, 5);
  }, [filteredPayments, filteredAssets]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-panda-black">数据统计</h1>
        <div className="flex flex-wrap items-center gap-3">
          <Filter size={16} className="text-gray-400" />
          <select value={year} onChange={(e) => handleYearChange(e.target.value)} className="bg-white border border-border rounded-xl px-4 py-2 text-sm outline-none focus:border-accent">
            {availableYears.map(y => <option key={y} value={y}>{y}年</option>)}
          </select>
          <select value={month} onChange={(e) => handleMonthChange(e.target.value)} className="bg-white border border-border rounded-xl px-4 py-2 text-sm outline-none focus:border-accent">
            <option value="all">全年</option>
            {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={(i + 1).toString().padStart(2, '0')}>{i + 1}月</option>)}
          </select>
          <select value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)} className="bg-white border border-border rounded-xl px-4 py-2 text-sm outline-none focus:border-accent">
            <option value="all">全部品牌</option>
            {brandNames.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
        </div>
      </div>

      {reportPeriod && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-2 border-info/40 bg-info/10 px-4 py-3">
          <div className="flex items-center gap-3 text-sm text-panda-black">
            <CalendarRange size={18} className="text-info flex-shrink-0" />
            <div>
              <span className="font-bold">{reportPeriod.type === 'weekly' ? '周报周期' : '月报周期'}</span>
              <span className="ml-2 text-gray-600">{reportPeriod.start} 至 {reportPeriod.end}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={clearReportPeriod}
            className="inline-flex min-h-11 items-center justify-center gap-1.5 px-3 text-sm font-medium text-panda-black border border-panda-black/30 bg-bg-primary hover:bg-bg-tertiary transition-colors"
          >
            <X size={15} />
            退出周期筛选
          </button>
        </div>
      )}

      {/* 统计概览卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="card-pixel p-5 bg-white">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-500 text-sm">总收入</span>
            <DollarSign size={18} className="text-success" />
          </div>
          <div className="text-2xl font-bold text-panda-black">¥{overviewStats.totalIncome.toLocaleString()}</div>
          {overviewStats.incomeGrowth === null ? (
            <div className="text-xs text-gray-500 mt-1">所选周期内</div>
          ) : (
            <div className={clsx("text-xs mt-1 flex items-center gap-1", parseFloat(overviewStats.incomeGrowth) >= 0 ? "text-success" : "text-danger")}>
              {parseFloat(overviewStats.incomeGrowth) >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {overviewStats.incomeGrowth}% 环比
            </div>
          )}
        </div>
        <div className="card-pixel p-5 bg-white">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-500 text-sm">商单总数</span>
            <Package size={18} className="text-accent" />
          </div>
          <div className="text-2xl font-bold text-panda-black">{overviewStats.totalOrders}</div>
          <div className="text-xs text-gray-400 mt-1">{overviewStats.completedOrders} 已完成</div>
        </div>
        <div className="card-pixel p-5 bg-white">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-500 text-sm">平均客单价</span>
            <TrendingUp size={18} className="text-warning" />
          </div>
          <div className="text-2xl font-bold text-panda-black">¥{overviewStats.avgOrderValue.toFixed(0)}</div>
          <div className="text-xs text-gray-400 mt-1">基于总订单数</div>
        </div>
        <div className="card-pixel p-5 bg-white">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-500 text-sm">付费推广</span>
            <Megaphone size={18} className="text-danger" />
          </div>
          <div className="text-2xl font-bold text-panda-black">¥{overviewStats.paidPromotionTotal.toLocaleString()}</div>
          <div className="text-xs text-gray-400 mt-1">推广费用总计</div>
        </div>
        <div className="card-pixel p-5 bg-white">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-500 text-sm">完成率</span>
            <CheckCircle size={18} className="text-success" />
          </div>
          <div className="text-2xl font-bold text-panda-black">{overviewStats.completionRate}%</div>
          <div className="text-xs text-gray-400 mt-1">{overviewStats.inProgressOrders} 进行中</div>
        </div>
      </div>

      {/* 图表区域 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card-pixel p-6 bg-white min-w-0">
          <h2 className="text-lg font-bold mb-6">{reportPeriod ? '周期概览' : '月度趋势'}</h2>
          <div className="h-[300px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E0E0E0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF' }} dy={10} />
                <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF' }} dx={-10} />
                <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF' }} dx={10} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }} />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="收入" stroke="#09090b" strokeWidth={2} dot={{ fill: '#09090b' }} />
                <Line yAxisId="left" type="monotone" dataKey="推广费" stroke="#ef4444" strokeWidth={2} dot={{ fill: '#ef4444' }} />
                <Line yAxisId="right" type="monotone" dataKey="商单数" stroke="#a1a1aa" strokeWidth={2} dot={{ fill: '#a1a1aa' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card-pixel p-6 bg-white min-w-0">
          <h2 className="text-lg font-bold mb-6">平台分布</h2>
          {platformData.length > 0 ? (
            <>
              <div className="h-[240px] w-full min-w-0 flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <PieChart>
                    <Pie data={platformData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={5} dataKey="value" stroke="none">
                      {platformData.map((_, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }} formatter={(value, name, props) => [`${value}单 (${props.payload.percentage}%)`, name]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap justify-center gap-4 mt-4">
                {platformData.map((entry, index) => (
                  <div key={entry.name} className="flex items-center gap-2 text-sm">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                    <span className="text-gray-600">{entry.name} ({entry.percentage}%)</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="h-[240px] w-full flex flex-col items-center justify-center text-gray-400">
              <div className="text-4xl mb-2 opacity-50">🐼</div>
              <p>暂无平台数据</p>
            </div>
          )}
        </div>

        <div className="card-pixel p-6 bg-white min-w-0">
          <h2 className="text-lg font-bold mb-6">订单状态分布</h2>
          <div className="h-[200px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <BarChart data={statusData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" axisLine={false} tickLine={false} />
                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} width={60} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {statusData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card-pixel p-6 bg-white">
          <h2 className="text-lg font-bold mb-6">品牌收入排行 TOP 5</h2>
          {brandRanking.length > 0 ? (
            <div className="space-y-3">
              {brandRanking.map((brand, index) => (
                <div key={brand.name} className="flex items-center gap-3">
                  <div className={clsx("w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold", index === 0 ? "bg-yellow-400 text-yellow-900" : index === 1 ? "bg-gray-300 text-gray-700" : index === 2 ? "bg-amber-600 text-amber-100" : "bg-gray-100 text-gray-500")}>
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-panda-black truncate">{brand.name}</div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1">
                      <div className="bg-accent h-1.5 rounded-full" style={{ width: `${(brand.income / brandRanking[0].income) * 100}%` }}></div>
                    </div>
                  </div>
                  <div className="text-sm font-bold text-panda-black">¥{brand.income.toLocaleString()}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-[200px] w-full flex flex-col items-center justify-center text-gray-400">
              <div className="text-4xl mb-2 opacity-50">🐼</div>
              <p>暂无品牌数据</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
