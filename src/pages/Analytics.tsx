import { useState, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend } from 'recharts';
import { useStore } from '../store/useStore';
import { usePageLoad } from '../hooks/usePageLoad';
import { TrendingUp, TrendingDown, DollarSign, Package, CheckCircle, Filter, Megaphone, CalendarRange, X } from 'lucide-react';
import { clsx } from 'clsx';
import Select from '../components/common/Select';
import { isDateInReportPeriod, parseReportPeriod } from '../lib/reportPeriod';
import { sumMoney } from '../lib/money';

// 图表色板与状态色统一取自 constants，避免多处重复维护
import { CHART_COLORS as COLORS, STATUS_COLORS } from '../constants';
const getSettledDate = (payment: { settledDate?: string; date?: string }) => payment.settledDate || payment.date || '';

export default function Analytics() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [month, setMonth] = useState('all');
  const [brandFilter, setBrandFilter] = useState('all');
  const { orders, payments, assets, paidPromotions, fetchOrders, fetchPayments, fetchAssets, fetchPaidPromotions } = useStore();
  const { state: loadState, retry: retryLoad } = usePageLoad(useCallback(
    () => Promise.all([fetchOrders(), fetchPayments(), fetchAssets(), fetchPaidPromotions()]),
    [fetchOrders, fetchPayments, fetchAssets, fetchPaidPromotions],
  ));
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
    // 独立创建的账单（无关联商单）也要能按品牌筛选
    payments.forEach(p => p.brand && names.add(p.brand));
    return Array.from(names).sort();
  }, [orders, assets, payments]);

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
    const paymentIncome = sumMoney(filteredPayments, p => p.amount);
    const assetIncome = sumMoney(filteredAssets, asset => asset.soldAmount);
    const totalIncome = paymentIncome + assetIncome;
    const paidPromotionTotal = sumMoney(filteredPaidPromotions, record => record.amount);
    const totalOrders = filteredOrders.length;
    const completedOrders = filteredOrders.filter(o => o.status === 'completed').length;
    const inProgressOrders = filteredOrders.filter(o => o.status === 'in_progress').length;
    const cancelledOrders = filteredOrders.filter(o => o.status === 'cancelled').length;
    // 平均客单价按"当期商单实际金额之和 / 当期商单数"计算，
    // 与商单数量同口径；到账金额跨月回款会失真，不再作为分母来源
    const orderAmountSum = sumMoney(filteredOrders, order => order.actualAmount);
    const avgOrderValue = totalOrders > 0 ? orderAmountSum / totalOrders : 0;
    const completionRate = totalOrders > 0 ? (completedOrders / totalOrders * 100).toFixed(1) : '0';

    let incomeGrowth: string | null = null;
    if (!reportPeriod) {
      const isFullYear = month === 'all';
      const currentMonthNum = isFullYear ? 12 : parseInt(month);
      const prevMonthNum = currentMonthNum === 1 ? 12 : currentMonthNum - 1;
      // 全年视图与上一年全年比较；1 月与上一年 12 月比较
      const prevYearValue = isFullYear || currentMonthNum === 1 ? (parseInt(year) - 1).toString() : year;
      const inPrevPeriod = (date: string) => (
        date.startsWith(prevYearValue)
        && (isFullYear || date.substring(5, 7) === prevMonthNum.toString().padStart(2, '0'))
      );
      const matchesBrand = (brand: string | null | undefined) => brandFilter === 'all' || brand === brandFilter;

      const prevPayments = payments.filter(p => {
        const settledDate = getSettledDate(p);
        if (p.type !== 'settled' || !settledDate) return false;
        return inPrevPeriod(settledDate) && matchesBrand(p.brand);
      });
      const prevPaymentIncome = sumMoney(prevPayments, payment => payment.amount);
      const prevAssetIncome = sumMoney(
        assets.filter(asset => {
          if (asset.saleStatus !== 'sold' || !asset.soldDate) return false;
          return inPrevPeriod(asset.soldDate) && matchesBrand(asset.brandName);
        }),
        asset => asset.soldAmount,
      );
      const prevIncome = prevPaymentIncome + prevAssetIncome;
      incomeGrowth = prevIncome > 0 ? ((totalIncome - prevIncome) / prevIncome * 100).toFixed(1) : null;
    }

    return { totalIncome, paidPromotionTotal, totalOrders, completedOrders, inProgressOrders, cancelledOrders, avgOrderValue, completionRate, incomeGrowth };
  }, [filteredOrders, filteredPayments, filteredAssets, filteredPaidPromotions, payments, assets, year, month, brandFilter, reportPeriod]);

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
        name: reportPeriod.type === 'weekly' ? '报告周' : '报告月',
        收入: sumMoney(filteredPayments, payment => payment.amount)
          + sumMoney(filteredAssets, asset => asset.soldAmount),
        推广费: sumMoney(filteredPaidPromotions, record => record.amount),
        商单数: filteredOrders.length,
        完成数: filteredOrders.filter(order => order.status === 'completed').length,
      }];
    }
    const months = month === 'all' ? 12 : 1;
    const startMonth = month === 'all' ? 0 : parseInt(month) - 1;
    // 趋势图与汇总卡片保持同一筛选口径：年份、月份、品牌筛选全部生效
    const matchesBrandOrder = (brandName: string | null | undefined) => brandFilter === 'all' || brandName === brandFilter;
    return Array.from({ length: months }, (_, i) => {
      const m = month === 'all' ? i : startMonth;
      const monthStr = (m + 1).toString().padStart(2, '0');
      const monthOrders = orders.filter(o => matchesBrandOrder(o.brandName)
        && o.acceptDate?.startsWith(year) && o.acceptDate?.substring(5, 7) === monthStr);
      const monthPayments = payments.filter(p => {
        const settledDate = getSettledDate(p);
        return matchesBrandOrder(p.brand)
          && settledDate.startsWith(year) && settledDate.substring(5, 7) === monthStr && p.type === 'settled';
      });
      const monthAssetIncome = sumMoney(
        assets.filter(a => a.saleStatus === 'sold' && matchesBrandOrder(a.brandName)
          && a.soldDate?.startsWith(year) && a.soldDate?.substring(5, 7) === monthStr),
        a => a.soldAmount,
      );
      const monthPromotionCost = sumMoney(
        paidPromotions.filter(record => {
          const order = orderById.get(record.orderId);
          const recordDate = order?.acceptDate || record.createdAt?.substring(0, 10) || '';
          return matchesBrandOrder(order?.brandName)
            && recordDate.startsWith(year) && recordDate.substring(5, 7) === monthStr;
        }),
        record => record.amount,
      );
      return {
        name: `${m + 1}月`,
        收入: sumMoney(monthPayments, p => p.amount) + monthAssetIncome,
        推广费: monthPromotionCost,
        商单数: monthOrders.length,
        完成数: monthOrders.filter(o => o.status === 'completed').length
      };
    });
  }, [orders, payments, assets, paidPromotions, orderById, year, month, brandFilter, reportPeriod, filteredOrders, filteredPayments, filteredAssets, filteredPaidPromotions]);

  const brandRanking = useMemo(() => {
    const brandIncomeCents: Record<string, number> = {};
    const addIncome = (brand: string | null | undefined, amount: number) => {
      if (!brand) return;
      brandIncomeCents[brand] = (brandIncomeCents[brand] || 0) + Math.round(amount * 100);
    };
    filteredPayments.forEach(payment => addIncome(payment.brand, payment.amount));
    filteredAssets.forEach(asset => {
      if (asset.soldAmount <= 0) return;
      addIncome(asset.brandName, asset.soldAmount);
    });
    return Object.entries(brandIncomeCents)
      .map(([name, cents]) => ({ name, income: cents / 100 }))
      .sort((a, b) => b.income - a.income)
      .slice(0, 5);
  }, [filteredPayments, filteredAssets]);

  if (loadState === 'loading') return <div key="loading" role="status" className="card-pixel p-6"><h1 className="text-lg font-bold mb-3">数据统计</h1>正在加载统计数据…</div>;
  if (loadState === 'error') return <div key="error" role="alert" className="card-pixel p-6"><h1 className="text-lg font-bold mb-3">数据统计</h1>统计数据加载失败，请检查连接后重试。<button type="button" className="ml-3 underline" onClick={() => void retryLoad()}>重试</button></div>;

  return (
    <div key="content" className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-panda-black">数据统计</h1>
        <div className="flex flex-wrap items-center gap-3">
          <Filter size={16} className="text-gray-500" />
          <Select
            value={year}
            onChange={handleYearChange}
            className="w-28"
            aria-label="统计年份"
            options={availableYears.map(y => ({ value: y, label: `${y}年` }))}
          />
          <Select
            value={month}
            onChange={handleMonthChange}
            className="w-24"
            aria-label="统计月份"
            options={[{ value: 'all', label: '全年' }, ...Array.from({ length: 12 }, (_, i) => ({ value: (i + 1).toString().padStart(2, '0'), label: `${i + 1}月` }))]}
          />
          <Select
            value={brandFilter}
            onChange={setBrandFilter}
            className="w-32"
            aria-label="统计品牌"
            options={[{ value: 'all', label: '全部品牌' }, ...brandNames.map(name => ({ value: name, label: name }))]}
          />
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
        <div className="card-pixel p-5 bg-panda-white">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-500 text-sm">总收入</span>
            <DollarSign size={18} className="text-success" />
          </div>
          <div className="text-2xl font-bold text-panda-black">¥{overviewStats.totalIncome.toLocaleString()}</div>
          {overviewStats.incomeGrowth === null ? (
            <div className="text-xs text-gray-500 mt-1">{reportPeriod ? '所选周期内' : '上年同期无收入'}</div>
          ) : (
            <div className={clsx("text-xs mt-1 flex items-center gap-1", parseFloat(overviewStats.incomeGrowth) >= 0 ? "text-success" : "text-danger")}>
              {parseFloat(overviewStats.incomeGrowth) >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {overviewStats.incomeGrowth}% 环比
            </div>
          )}
        </div>
        <div className="card-pixel p-5 bg-panda-white">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-500 text-sm">商单总数</span>
            <Package size={18} className="text-accent" />
          </div>
          <div className="text-2xl font-bold text-panda-black">{overviewStats.totalOrders}</div>
          <div className="text-xs text-gray-500 mt-1">{overviewStats.completedOrders} 已完成</div>
        </div>
        <div className="card-pixel p-5 bg-panda-white">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-500 text-sm">平均客单价</span>
            <TrendingUp size={18} className="text-warning" />
          </div>
          <div className="text-2xl font-bold text-panda-black">¥{overviewStats.avgOrderValue.toFixed(0)}</div>
          <div className="text-xs text-gray-500 mt-1">当期商单金额均值</div>
        </div>
        <div className="card-pixel p-5 bg-panda-white">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-500 text-sm">付费推广</span>
            <Megaphone size={18} className="text-danger" />
          </div>
          <div className="text-2xl font-bold text-panda-black">¥{overviewStats.paidPromotionTotal.toLocaleString()}</div>
          <div className="text-xs text-gray-500 mt-1">推广费用总计</div>
        </div>
        <div className="card-pixel p-5 bg-panda-white">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-500 text-sm">完成率</span>
            <CheckCircle size={18} className="text-success" />
          </div>
          <div className="text-2xl font-bold text-panda-black">{overviewStats.completionRate}%</div>
          <div className="text-xs text-gray-500 mt-1">{overviewStats.inProgressOrders} 进行中</div>
        </div>
      </div>

      {/* 图表区域 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card-pixel p-6 bg-panda-white min-w-0">
          <h2 className="text-lg font-bold mb-6">{reportPeriod ? '周期概览' : '月度趋势'}</h2>
          {/* 与其它图表一致：筛选后没有任何数据时不画全零折线 */}
          {monthlyData.some(point => point.收入 > 0 || point.推广费 > 0 || point.商单数 > 0) ? (
          <div className="h-[300px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E0E0E0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#6B7280' }} dy={10} />
                <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fill: '#6B7280' }} dx={-10} />
                <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fill: '#6B7280' }} dx={10} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }} />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="收入" stroke="#09090b" strokeWidth={2} dot={{ fill: '#09090b' }} />
                <Line yAxisId="left" type="monotone" dataKey="推广费" stroke="#ef4444" strokeWidth={2} dot={{ fill: '#ef4444' }} />
                <Line yAxisId="right" type="monotone" dataKey="商单数" stroke="#a1a1aa" strokeWidth={2} dot={{ fill: '#a1a1aa' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          ) : (
            <div className="h-28 sm:h-[300px] w-full flex flex-col items-center justify-center text-gray-600">
              <div className="text-4xl mb-2 opacity-50">🐼</div>
              <p>暂无该周期的收入数据</p>
            </div>
          )}
        </div>

        <div className="card-pixel p-6 bg-panda-white min-w-0">
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
            <div className="h-28 sm:h-[240px] w-full flex flex-col items-center justify-center text-gray-600">
              <div className="text-4xl mb-2 opacity-50">🐼</div>
              <p>暂无平台数据</p>
            </div>
          )}
        </div>

        <div className="card-pixel p-6 bg-panda-white min-w-0">
          <h2 className="text-lg font-bold mb-6">订单状态分布</h2>
          {/* 与"平台分布"一致：无数据时不留下空白图框 */}
          {statusData.length > 0 ? (
            <div className="h-[200px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart data={statusData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#6B7280' }} />
                  <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fill: '#6B7280' }} width={60} />
                  <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {statusData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-28 sm:h-[200px] w-full flex flex-col items-center justify-center text-gray-600">
              <div className="text-4xl mb-2 opacity-50">🐼</div>
              <p>暂无订单数据</p>
            </div>
          )}
        </div>

        <div className="card-pixel p-6 bg-panda-white">
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
                      <div className="bg-accent h-1.5 rounded-full" style={{ width: `${brandRanking[0].income > 0 ? (brand.income / brandRanking[0].income) * 100 : 0}%` }}></div>
                    </div>
                  </div>
                  <div className="text-sm font-bold text-panda-black">¥{brand.income.toLocaleString()}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-28 sm:h-[200px] w-full flex flex-col items-center justify-center text-gray-600">
              <div className="text-4xl mb-2 opacity-50">🐼</div>
              <p>暂无品牌数据</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
