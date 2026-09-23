import { useEffect, useState, useMemo, useCallback } from 'react';
import { useStore, Payment } from '../store/useStore';
import { ArrowUpRight, ArrowDownRight, Download, CheckCircle, Clock, Edit2, Trash2, Search } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useProgressiveList } from '../hooks/useProgressiveList';
import { useFormSessionGuard } from '../hooks/useFormSessionGuard';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import { clsx } from 'clsx';
import Select from '../components/common/Select';
import { ALL_MONTHS, ALL_YEARS, formatLocalDate, getAvailableYears, matchesYearMonth, monthOptions } from '../lib/dateFilter';
import { csvCell } from '../lib/csv';
import { sumMoney } from '../lib/money';

const getPaymentCreatedDate = (payment: Payment): string => payment.createdAt || payment.date;
const getPaymentBusinessDate = (payment: Payment): string => payment.type === 'settled'
  ? (payment.settledDate || payment.date)
  : (payment.dueDate || payment.date);

const normalizeMonthParam = (value: string | null): string => {
  if (!value) return ALL_MONTHS;
  if (/^\d{2}$/.test(value)) return value;

  const numericValue = Number(value);
  if (Number.isInteger(numericValue) && numericValue >= 0 && numericValue <= 11) {
    return String(numericValue + 1).padStart(2, '0');
  }

  return ALL_MONTHS;
};

const isSettledPaymentInMonth = (payment: Payment, year: number, monthIndex: number): boolean => {
  return payment.type === 'settled' && matchesYearMonth(payment.settledDate || payment.date, String(year), String(monthIndex + 1).padStart(2, '0'));
};

export default function Billing() {
  const { payments, fetchPayments, addPayment, settlePayment, updatePayment, deletePayment } = useStore();
  const { showToast } = useToast();
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const loadPayments = useCallback(async () => {
    setLoadState('loading');
    try {
      await fetchPayments();
      setLoadState('ready');
    } catch {
      setLoadState('error');
    }
  }, [fetchPayments]);
  useEffect(() => { void loadPayments(); }, [loadPayments]);
  const [searchParams, setSearchParams] = useSearchParams();
  const monthParam = searchParams.get('month');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'settled' | 'pending'>('all');
  const [yearFilter, setYearFilter] = useState(() => searchParams.get('year') || ALL_YEARS);
  const [monthFilter, setMonthFilter] = useState(() => normalizeMonthParam(monthParam));
  const [brandFilter, setBrandFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [formData, setFormData] = useState({
    orderNo: '',
    brand: '',
    amount: '',
    type: 'pending' as Payment['type'],
    dueDate: '',
    settledDate: '',
    method: ''
  });

  // 删除确认弹窗状态
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; payment: Payment | null }>({
    isOpen: false,
    payment: null
  });

  // 结算操作处理中锁：防止连点或重试导致状态反向切换
  const [settlingIds, setSettlingIds] = useState<string[]>([]);
  const { invalidateFormSession, captureFormSession, isFormSessionCurrent } = useFormSessionGuard();

  useEffect(() => {
    if (!searchParams.get('new')) return;
    invalidateFormSession();
    setEditingPayment(null);
    setFormData({ orderNo: '', brand: '', amount: '', type: 'pending', dueDate: '', settledDate: '', method: '' });
    setIsModalOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete('new');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, invalidateFormSession]);

  const handleToggleSettle = async (payment: Payment) => {
    if (settlingIds.includes(payment.id)) return;
    setSettlingIds(ids => [...ids, payment.id]);
    try {
      await settlePayment(payment.id, { settled: payment.type !== 'settled' });
    } catch {
      // store 已提示错误
    } finally {
      setSettlingIds(ids => ids.filter(id => id !== payment.id));
    }
  };

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    const formSession = captureFormSession();
    setIsSubmitting(true);
    try {
      if (editingPayment) {
        await updatePayment(editingPayment, {
          ...formData,
          amount: Number(formData.amount) || 0
        });
      } else {
        await addPayment({
          ...formData,
          amount: Number(formData.amount) || 0
        });
      }
      if (!isFormSessionCurrent(formSession)) return;
      setIsModalOpen(false);
      setEditingPayment(null);
      setFormData({ orderNo: '', brand: '', amount: '', type: 'pending', dueDate: '', settledDate: '', method: '' });
    } catch (error) {
      showToast(error instanceof Error ? error.message : '操作失败', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (payment: Payment) => {
    invalidateFormSession();
    setEditingPayment(payment.id);
    setFormData({
      orderNo: payment.orderNo || '',
      brand: payment.brand || '',
      amount: payment.amount.toString(),
      type: payment.type,
      dueDate: payment.dueDate || (payment.type === 'pending' ? payment.date : ''),
      settledDate: payment.settledDate || (payment.type === 'settled' ? payment.date : ''),
      method: payment.method || ''
    });
    setIsModalOpen(true);
  };

  const handlePaymentTypeChange = (type: Payment['type']) => {
    setFormData(current => ({
      ...current,
      type,
      settledDate: type === 'settled' && current.type !== 'settled'
        ? formatLocalDate()
        : current.settledDate
    }));
  };

  const handleDelete = (payment: Payment) => {
    setDeleteConfirm({ isOpen: true, payment });
  };

  const confirmDeletePayment = async () => {
    if (deleteConfirm.payment) {
      await deletePayment(deleteConfirm.payment.id);
    }
  };

  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  const lastMonthDate = new Date(currentYear, currentMonth - 1, 1);

  const thisMonthSettled = sumMoney(
    payments.filter(p => isSettledPaymentInMonth(p, currentYear, currentMonth)),
    p => p.amount,
  );

  const lastMonthSettled = sumMoney(
    payments.filter(p => isSettledPaymentInMonth(p, lastMonthDate.getFullYear(), lastMonthDate.getMonth())),
    p => p.amount,
  );

  const monthChange = lastMonthSettled === 0
    ? (thisMonthSettled > 0 ? 100 : 0)
    : ((thisMonthSettled - lastMonthSettled) / lastMonthSettled) * 100;

  const availableYears = useMemo(
    () => getAvailableYears(payments.map(payment => getPaymentCreatedDate(payment))),
    [payments],
  );

  const brandOptions = useMemo(() => {
    const names = payments
      .map(payment => payment.brand)
      .filter((name): name is string => Boolean(name?.trim()));
    return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b, 'zh-CN'));
  }, [payments]);

  const scopedPayments = useMemo(() => {
    const searchLower = searchTerm.trim().toLowerCase();

    return payments.filter(payment => {
      const matchesDate = matchesYearMonth(getPaymentCreatedDate(payment), yearFilter, monthFilter);
      const matchesBrand = brandFilter === 'all' || payment.brand === brandFilter;
      const matchesSearch = !searchLower || [
        payment.brand,
        payment.orderNo,
        payment.method,
        payment.dueDate,
        payment.settledDate,
        payment.date,
        getPaymentCreatedDate(payment),
        String(payment.amount),
      ].some(value => String(value || '').toLowerCase().includes(searchLower));

      return matchesDate && matchesBrand && matchesSearch;
    });
  }, [payments, yearFilter, monthFilter, brandFilter, searchTerm]);

  const totalSettled = sumMoney(scopedPayments.filter(p => p.type === 'settled'), p => p.amount);
  const totalPending = sumMoney(scopedPayments.filter(p => p.type === 'pending'), p => p.amount);
  const showMonthChange = yearFilter === ALL_YEARS && monthFilter === ALL_MONTHS && brandFilter === 'all' && !searchTerm.trim() && monthChange !== 0;

  const filteredPayments = useMemo(() => {
    return scopedPayments.filter(p => {
      const matchesType = filterType === 'all' || p.type === filterType;
      return matchesType;
    }).sort((a, b) => new Date(getPaymentCreatedDate(b)).getTime() - new Date(getPaymentCreatedDate(a)).getTime());
  }, [scopedPayments, filterType]);

  const handleExport = () => {
    const headers = ['截止日期', '结算日期', '关联商单', '品牌方', '金额', '状态', '备注'];
    const csvContent = [
      headers.map(csvCell).join(','),
      ...filteredPayments.map(p => [
        csvCell(p.dueDate || (p.type === 'pending' ? p.date : '')),
        csvCell(p.settledDate || (p.type === 'settled' ? p.date : '')),
        csvCell(p.orderNo || ''),
        csvCell(p.brand || ''),
        csvCell(p.amount),
        csvCell(p.type === 'settled' ? '已结算' : '待结算'),
        csvCell(p.method || '')
      ].join(','))
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `账单报表_${formatLocalDate()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // 渐进渲染：数据全量加载（统计需要），但列表只渲染前若干条
  const paymentsView = useProgressiveList(
    filteredPayments,
    undefined,
    `${searchTerm}|${filterType}|${brandFilter}|${yearFilter}|${monthFilter}`,
  );


  if (loadState === 'loading') {
    return <div key="loading" role="status" className="card-pixel p-6"><h1 className="text-lg font-bold mb-3">账单管理</h1>正在加载账单…</div>;
  }
  if (loadState === 'error') {
    return <div key="error" role="alert" className="card-pixel p-6"><h1 className="text-lg font-bold mb-3">账单管理</h1>账单加载失败，请检查连接后重试。<button type="button" className="ml-3 underline" onClick={() => void loadPayments()}>重试</button></div>;
  }

  return (
    <div key="content" className="space-y-4 md:space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-lg md:text-lg font-bold text-panda-black">账单管理</h1>
        <div className="flex items-center gap-2">
          <button onClick={handleExport} className="btn-secondary flex items-center gap-1 text-xs md:text-sm py-1.5 px-2.5 md:px-3">
            <Download size={14} />
            导出
          </button>
          <button onClick={() => { invalidateFormSession(); setEditingPayment(null); setFormData({ orderNo: '', brand: '', amount: '', type: 'pending', dueDate: '', settledDate: '', method: '' }); setIsModalOpen(true); }} className="btn-sketch flex items-center justify-center gap-1 text-xs md:text-sm py-1.5 px-2.5 md:px-3">
            <span>+</span> 记账
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 md:gap-4">
        <div className="card-sketch p-3 md:p-4 bg-panda-white">
          <div className="text-gray-500 text-[10px] md:text-xs font-medium mb-0.5 md:mb-1">已结算</div>
          <div className="text-lg md:text-2xl font-bold font-mono text-success">¥ {totalSettled.toLocaleString()}</div>
          {showMonthChange && (
            <div className={`flex items-center gap-1 text-[10px] md:text-xs mt-0.5 md:mt-1 ${monthChange > 0 ? 'text-success' : 'text-danger'}`}>
              {monthChange > 0 ? <ArrowUpRight size={10} className="md:hidden" /> : <ArrowDownRight size={10} className="md:hidden" />}
              {monthChange > 0 ? <ArrowUpRight size={12} className="hidden md:block" /> : <ArrowDownRight size={12} className="hidden md:block" />}
              <span>{monthChange > 0 ? '+' : ''}{monthChange.toFixed(1)}%</span>
            </div>
          )}
        </div>
        <div className="card-sketch p-3 md:p-4 bg-panda-white">
          <div className="text-gray-500 text-[10px] md:text-xs font-medium mb-0.5 md:mb-1">待结算</div>
          <div className="text-lg md:text-2xl font-bold font-mono text-warning">¥ {totalPending.toLocaleString()}</div>
          <div className="text-[10px] md:text-xs text-gray-500 mt-0.5 md:mt-1">{scopedPayments.filter(p => p.type === 'pending').length} 笔</div>
        </div>
        <div className="card-sketch p-3 md:p-4 bg-panda-white">
          <div className="text-gray-500 text-[10px] md:text-xs font-medium mb-0.5 md:mb-1">总金额</div>
          <div className="text-lg md:text-2xl font-bold font-mono">¥ {(totalSettled + totalPending).toLocaleString()}</div>
          <div className="text-[10px] md:text-xs text-gray-500 mt-0.5 md:mt-1">{scopedPayments.length} 笔</div>
        </div>
      </div>

      <div className="card-sketch overflow-hidden bg-panda-white">
        <div className="p-3 md:p-3 border-b-2 border-panda-black/10 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="font-bold text-xs md:text-sm">收支明细</h2>
            <span className="text-[10px] md:text-xs text-gray-500" title="年份/月份筛选依据账单的创建日期；收入结算统计（本月 vs 上月）依据结算日期">按创建日期筛选</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-48">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-600" />
              <input
                type="text"
                placeholder="搜索品牌、商单、备注"
                aria-label="搜索品牌、商单、备注"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full form-control form-control-sm pl-8"
              />
            </div>
            <Select
              value={brandFilter}
              onChange={setBrandFilter}
              size="sm"
              className="w-32 flex-shrink-0"
              aria-label="按品牌筛选"
              options={[{ value: 'all', label: '全部品牌' }, ...brandOptions.map(brand => ({ value: brand, label: brand }))]}
            />
            <Select
              value={yearFilter}
              onChange={setYearFilter}
              size="sm"
              className="w-28 flex-shrink-0"
              aria-label="按创建年份筛选"
              options={[{ value: ALL_YEARS, label: '全部年份' }, ...availableYears.map(year => ({ value: year, label: `${year}年` }))]}
            />
            <Select
              value={monthFilter}
              onChange={setMonthFilter}
              size="sm"
              className="w-24 flex-shrink-0"
              aria-label="按创建月份筛选"
              options={[{ value: ALL_MONTHS, label: '全年' }, ...monthOptions.map(option => ({ value: option.value, label: option.label }))]}
            />
            <div className="segment-group gap-0.5 md:gap-1 p-0.5 md:p-1">
              <button
                type="button"
                aria-pressed={filterType === 'all'}
                onClick={() => setFilterType('all')}
                className="segment px-1.5 md:px-2 py-0.5 md:py-1 text-[10px] md:text-xs"
              >
                全部
              </button>
              <button
                type="button"
                aria-pressed={filterType === 'settled'}
                onClick={() => setFilterType('settled')}
                className="segment px-1.5 md:px-2 py-0.5 md:py-1 text-[10px] md:text-xs"
              >
                已结算
              </button>
              <button
                type="button"
                aria-pressed={filterType === 'pending'}
                onClick={() => setFilterType('pending')}
                className="segment px-1.5 md:px-2 py-0.5 md:py-1 text-[10px] md:text-xs"
              >
                待结算
              </button>
            </div>
          </div>
        </div>
        
        <p className="px-3 py-2 text-[10px] md:text-xs text-gray-500 border-b border-panda-black/5">
          提示：列表按账单创建日期筛选；"已结算"收款统计按结算日期计算。8 月创建、9 月结算的账单会出现在 8 月列表中，同时计入 9 月收入。
        </p>

        {/* Mobile card view */}
        <div className="md:hidden divide-y divide-panda-black/5">
          {paymentsView.visibleItems.map(payment => (
            <div key={payment.id} className="p-3 hover:bg-panda-black/5 transition-colors">
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-medium text-sm">{payment.brand || '-'}</span>
                <span className={clsx(
                  "font-bold text-sm font-mono",
                  payment.type === 'settled' ? 'text-success' : 'text-warning'
                )}>
                  ¥{payment.amount.toLocaleString()}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[10px] text-gray-500">
                  <span>{getPaymentBusinessDate(payment) || '-'}</span>
                  {payment.orderNo && <span className="font-mono">({payment.orderNo})</span>}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleToggleSettle(payment)}
                    disabled={settlingIds.includes(payment.id)}
                    aria-label={payment.type === 'settled' ? '点击撤销结算' : '点击标记为已结算'}
                    className={clsx(
                      "text-[10px] px-2 py-0.5 rounded-full font-bold cursor-pointer hover:opacity-80 transition-opacity disabled:opacity-50",
                      payment.type === 'settled' ? "bg-success/10 text-success" : "bg-warning/10 text-warning"
                    )}
                  >
                    {payment.type === 'settled' ? '已结算' : '待结算'}
                  </button>
                  <button
                    onClick={() => handleEdit(payment)}
                    aria-label={`编辑账单 ${payment.brand}`}
                    className="p-1 text-gray-600 hover:text-panda-black transition-colors"
                  >
                    <Edit2 size={12} />
                  </button>
                  <button
                    onClick={() => handleDelete(payment)}
                    aria-label={`删除账单 ${payment.brand}`}
                    className="p-1 text-gray-600 hover:text-danger transition-colors"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            </div>
          ))}

          {filteredPayments.length === 0 && (
            <div className="py-8 text-center text-gray-600 text-xs">
              {payments.length === 0 ? '暂无收支明细' : '没有匹配的账单'}
            </div>
          )}
        </div>

        {/* Desktop table view */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">截止/结算日期</th>
                <th className="px-4 py-3 font-medium">关联商单</th>
                <th className="px-4 py-3 font-medium">品牌方</th>
                <th className="px-4 py-3 font-medium">金额</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-panda-black/5">
              {paymentsView.visibleItems.map(payment => (
                <tr key={payment.id} className="hover:bg-panda-black/5 transition-colors group">
                  <td className="px-4 py-3 text-gray-600">{getPaymentBusinessDate(payment) || '-'}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{payment.orderNo || '-'}</td>
                  <td className="px-4 py-3 font-medium">{payment.brand || '-'}</td>
                  <td className="px-4 py-3 font-mono font-bold">
                    <span className={payment.type === 'settled' ? 'text-success' : 'text-warning'}>
                      ¥{payment.amount.toLocaleString()}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => handleToggleSettle(payment)}
                      disabled={settlingIds.includes(payment.id)}
                      aria-label={payment.type === 'settled' ? '点击撤销结算' : '点击标记为已结算'}
                      className={clsx(
                        "status-badge flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity disabled:opacity-50",
                        payment.type === 'settled' ? 'status-settled' : 'status-pending'
                      )}
                      title="点击切换状态"
                    >
                      {payment.type === 'settled' ? (
                        <><CheckCircle size={10} /> 已结算</>
                      ) : (
                        <><Clock size={10} /> 待结算</>
                      )}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleEdit(payment)}
                        className="p-1.5 text-gray-600 hover:text-panda-black hover:bg-panda-black/10 rounded-lg transition-all max-md:opacity-100 opacity-0 group-hover:opacity-100 hover-visible"
                        title="编辑"
                      >
                        <Edit2 size={12} />
                      </button>
                      <button
                        onClick={() => handleDelete(payment)}
                        className="p-1.5 text-gray-600 hover:text-danger hover:bg-danger/10 rounded-lg transition-all max-md:opacity-100 opacity-0 group-hover:opacity-100 hover-visible"
                        title="删除"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredPayments.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-gray-600">
                    <div className="w-12 h-12 border-2 border-dashed border-gray-300 rounded-full flex items-center justify-center mx-auto mb-2">
                      <span className="text-lg">📋</span>
                    </div>
                    {payments.length === 0 ? '暂无收支明细' : '没有匹配的账单'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
        {paymentsView.windowed && (
            <div className="flex flex-col items-center gap-1 py-4">
              {paymentsView.hasMore && (
                <button type="button" onClick={paymentsView.loadMore} className="btn-secondary text-sm">
                  加载更多
                </button>
              )}
              <span className="text-xs text-gray-500">
                已显示 {paymentsView.visibleCount} / {paymentsView.total} 条
              </span>
            </div>
          )}


      <Modal isOpen={isModalOpen} onClose={() => { invalidateFormSession(); setIsModalOpen(false); setEditingPayment(null); }} title={editingPayment ? "编辑账单" : "记录账单"}>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="payment-orderNo" className="block text-xs font-medium text-gray-700 mb-1">关联商单号</label>
              <input id="payment-orderNo" type="text" value={formData.orderNo} onChange={e => setFormData({...formData, orderNo: e.target.value})} className="w-full form-control" />
            </div>
            <div>
              <label htmlFor="payment-brand" className="block text-xs font-medium text-gray-700 mb-1">品牌方</label>
              <input id="payment-brand" required type="text" value={formData.brand} onChange={e => setFormData({...formData, brand: e.target.value})} className="w-full form-control" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="payment-amount" className="block text-xs font-medium text-gray-700 mb-1">金额 (¥)</label>
              <input id="payment-amount" required type="number" min="0" inputMode="decimal" value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value})} className="w-full form-control" />
            </div>
            <div>
              <label htmlFor="payment-type" className="block text-xs font-medium text-gray-700 mb-1">状态</label>
              <Select
                id="payment-type"
                value={formData.type}
                onChange={value => handlePaymentTypeChange(value as Payment['type'])}
                className="w-full"
                options={[{ value: 'pending', label: '待结算' }, { value: 'settled', label: '已结算' }]}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="payment-date" className="block text-xs font-medium text-gray-700 mb-1">
                {formData.type === 'settled' ? '结算日期' : '预计收款日期'}
              </label>
              <input
                id="payment-date"
                type="date"
                value={formData.type === 'settled' ? formData.settledDate : formData.dueDate}
                onChange={e => setFormData(formData.type === 'settled'
                  ? { ...formData, settledDate: e.target.value }
                  : { ...formData, dueDate: e.target.value })}
                className="w-full form-control"
              />
            </div>
            <div>
              <label htmlFor="payment-method" className="block text-xs font-medium text-gray-700 mb-1">备注</label>
              <input id="payment-method" type="text" placeholder="备注" value={formData.method} onChange={e => setFormData({...formData, method: e.target.value})} className="w-full form-control" />
            </div>
          </div>
          <div className="pt-3 flex justify-end gap-2">
            <button type="button" onClick={() => { invalidateFormSession(); setIsModalOpen(false); setEditingPayment(null); }} className="btn-secondary py-2 px-4">取消</button>
            <button type="submit" disabled={isSubmitting} className="btn-sketch py-2 px-4 disabled:opacity-50">{isSubmitting ? '保存中...' : editingPayment ? '保存' : '记账'}</button>
          </div>
        </form>
      </Modal>

      {/* 删除确认弹窗 */}
      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        onClose={() => setDeleteConfirm({ isOpen: false, payment: null })}
        onConfirm={confirmDeletePayment}
        title="确认删除账单"
        message={`确定要删除账单「${deleteConfirm.payment?.brand} ¥${deleteConfirm.payment?.amount}」吗？此操作不可恢复。`}
        confirmText="确认删除"
      />
    </div>
  );
}
