import { useState, useMemo } from 'react';
import { useStore, Payment } from '../store/useStore';
import { ArrowUpRight, ArrowDownRight, Download, CheckCircle, Clock, Edit2, Trash2, Search } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import { clsx } from 'clsx';
import { ALL_MONTHS, ALL_YEARS, formatLocalDate, getAvailableYears, matchesYearMonth, monthOptions } from '../lib/dateFilter';

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
  const { payments, addPayment, settlePayment, updatePayment, deletePayment } = useStore();
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingPayment) {
        await updatePayment(editingPayment, {
          ...formData,
          amount: Number(formData.amount) || 0
        });
        showToast('账单已更新');
      } else {
        await addPayment({
          ...formData,
          amount: Number(formData.amount) || 0
        });
        showToast('账单已创建');
      }
      setIsModalOpen(false);
      setEditingPayment(null);
      setFormData({ orderNo: '', brand: '', amount: '', type: 'pending', dueDate: '', settledDate: '', method: '' });
    } catch (error) {
      showToast(error instanceof Error ? error.message : '操作失败', 'error');
    }
  };

  const handleEdit = (payment: Payment) => {
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

  const thisMonthSettled = payments
    .filter(p => isSettledPaymentInMonth(p, currentYear, currentMonth))
    .reduce((acc, p) => acc + p.amount, 0);

  const lastMonthSettled = payments
    .filter(p => isSettledPaymentInMonth(p, lastMonthDate.getFullYear(), lastMonthDate.getMonth()))
    .reduce((acc, p) => acc + p.amount, 0);

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

  const totalSettled = scopedPayments.filter(p => p.type === 'settled').reduce((acc, p) => acc + p.amount, 0);
  const totalPending = scopedPayments.filter(p => p.type === 'pending').reduce((acc, p) => acc + p.amount, 0);
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
      headers.join(','),
      ...filteredPayments.map(p => [
        `"${p.dueDate || (p.type === 'pending' ? p.date : '')}"`,
        `"${p.settledDate || (p.type === 'settled' ? p.date : '')}"`,
        `"${p.orderNo || ''}"`,
        `"${p.brand || ''}"`,
        p.amount,
        `"${p.type === 'settled' ? '已结算' : '待结算'}"`,
        `"${p.method || ''}"`
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

  return (
    <div className="space-y-4 md:space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-lg md:text-lg font-bold text-panda-black">账单管理</h1>
        <div className="flex items-center gap-2">
          <button onClick={handleExport} className="btn-secondary flex items-center gap-1 text-xs md:text-sm py-1.5 px-2.5 md:px-3">
            <Download size={14} />
            导出
          </button>
          <button onClick={() => { setEditingPayment(null); setFormData({ orderNo: '', brand: '', amount: '', type: 'pending', dueDate: '', settledDate: '', method: '' }); setIsModalOpen(true); }} className="btn-sketch flex items-center justify-center gap-1 text-xs md:text-sm py-1.5 px-2.5 md:px-3">
            <span>+</span> 记账
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 md:gap-4">
        <div className="card-sketch p-3 md:p-4 bg-white">
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
        <div className="card-sketch p-3 md:p-4 bg-white">
          <div className="text-gray-500 text-[10px] md:text-xs font-medium mb-0.5 md:mb-1">待结算</div>
          <div className="text-lg md:text-2xl font-bold font-mono text-warning">¥ {totalPending.toLocaleString()}</div>
          <div className="text-[10px] md:text-xs text-gray-400 mt-0.5 md:mt-1">{scopedPayments.filter(p => p.type === 'pending').length} 笔</div>
        </div>
        <div className="card-sketch p-3 md:p-4 bg-white">
          <div className="text-gray-500 text-[10px] md:text-xs font-medium mb-0.5 md:mb-1">总金额</div>
          <div className="text-lg md:text-2xl font-bold font-mono">¥ {(totalSettled + totalPending).toLocaleString()}</div>
          <div className="text-[10px] md:text-xs text-gray-400 mt-0.5 md:mt-1">{scopedPayments.length} 笔</div>
        </div>
      </div>

      <div className="card-sketch overflow-hidden bg-white">
        <div className="p-3 md:p-3 border-b-2 border-panda-black/10 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="font-bold text-xs md:text-sm">收支明细</h2>
            <span className="text-[10px] md:text-xs text-gray-400">按创建日期</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-48">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="搜索品牌、商单、备注"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full h-8 pl-8 pr-2 bg-gray-50 border-2 border-panda-black/10 focus:border-panda-black focus:bg-white rounded-lg text-xs outline-none transition-all"
              />
            </div>
            <select
              value={brandFilter}
              onChange={e => setBrandFilter(e.target.value)}
              className="h-8 bg-gray-50 border-2 border-panda-black/10 focus:border-panda-black focus:bg-white rounded-lg px-2 text-xs outline-none transition-all"
            >
              <option value="all">全部品牌</option>
              {brandOptions.map(brand => (
                <option key={brand} value={brand}>{brand}</option>
              ))}
            </select>
            <select
              value={yearFilter}
              onChange={e => setYearFilter(e.target.value)}
              className="h-8 bg-gray-50 border-2 border-panda-black/10 focus:border-panda-black focus:bg-white rounded-lg px-2 text-xs outline-none transition-all"
            >
              <option value={ALL_YEARS}>全部年份</option>
              {availableYears.map(year => (
                <option key={year} value={year}>{year}年</option>
              ))}
            </select>
            <select
              value={monthFilter}
              onChange={e => setMonthFilter(e.target.value)}
              className="h-8 bg-gray-50 border-2 border-panda-black/10 focus:border-panda-black focus:bg-white rounded-lg px-2 text-xs outline-none transition-all"
            >
              <option value={ALL_MONTHS}>全年</option>
              {monthOptions.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <div className="flex items-center gap-0.5 md:gap-1 bg-gray-100 p-0.5 md:p-1 rounded-lg md:rounded-xl border-2 border-panda-black/10">
              <button
                onClick={() => setFilterType('all')}
                className={clsx("px-1.5 md:px-2 py-0.5 md:py-1 rounded text-[10px] md:text-xs font-medium transition-all", filterType === 'all' ? 'bg-panda-black text-white' : 'text-gray-500 hover:text-panda-black')}
              >
                全部
              </button>
              <button
                onClick={() => setFilterType('settled')}
                className={clsx("px-1.5 md:px-2 py-0.5 md:py-1 rounded text-[10px] md:text-xs font-medium transition-all", filterType === 'settled' ? 'bg-panda-black text-white' : 'text-gray-500 hover:text-panda-black')}
              >
                已结算
              </button>
              <button
                onClick={() => setFilterType('pending')}
                className={clsx("px-1.5 md:px-2 py-0.5 md:py-1 rounded text-[10px] md:text-xs font-medium transition-all", filterType === 'pending' ? 'bg-panda-black text-white' : 'text-gray-500 hover:text-panda-black')}
              >
                待结算
              </button>
            </div>
          </div>
        </div>
        
        {/* Mobile card view */}
        <div className="md:hidden divide-y divide-panda-black/5">
          {filteredPayments.map(payment => (
            <div key={payment.id} className="p-3 hover:bg-gray-50/50 transition-colors">
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
                    onClick={() => settlePayment(payment.id)}
                    className={clsx(
                      "text-[10px] px-2 py-0.5 rounded-full font-bold cursor-pointer hover:opacity-80 transition-opacity",
                      payment.type === 'settled' ? "bg-success/10 text-success" : "bg-warning/10 text-warning"
                    )}
                  >
                    {payment.type === 'settled' ? '已结算' : '待结算'}
                  </button>
                  <button
                    onClick={() => handleEdit(payment)}
                    className="p-1 text-gray-400 hover:text-panda-black transition-colors"
                  >
                    <Edit2 size={12} />
                  </button>
                  <button
                    onClick={() => handleDelete(payment)}
                    className="p-1 text-gray-400 hover:text-danger transition-colors"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            </div>
          ))}
          {filteredPayments.length === 0 && (
            <div className="py-8 text-center text-gray-400 text-xs">
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
              {filteredPayments.map(payment => (
                <tr key={payment.id} className="hover:bg-gray-50/50 transition-colors group">
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
                      onClick={() => settlePayment(payment.id)}
                      className={clsx(
                        "status-badge flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity",
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
                        className="p-1.5 text-gray-400 hover:text-panda-black hover:bg-gray-100 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                        title="编辑"
                      >
                        <Edit2 size={12} />
                      </button>
                      <button
                        onClick={() => handleDelete(payment)}
                        className="p-1.5 text-gray-400 hover:text-danger hover:bg-danger/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
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
                  <td colSpan={6} className="px-4 py-10 text-center text-gray-400">
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

      <Modal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); setEditingPayment(null); }} title={editingPayment ? "编辑账单" : "记录账单"}>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">关联商单号</label>
              <input type="text" value={formData.orderNo} onChange={e => setFormData({...formData, orderNo: e.target.value})} className="input-sketch" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">品牌方</label>
              <input required type="text" value={formData.brand} onChange={e => setFormData({...formData, brand: e.target.value})} className="input-sketch" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">金额 (¥)</label>
              <input required type="number" value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value})} className="input-sketch" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">状态</label>
              <select value={formData.type} onChange={e => handlePaymentTypeChange(e.target.value as Payment['type'])} className="input-sketch">
                <option value="pending">待结算</option>
                <option value="settled">已结算</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                {formData.type === 'settled' ? '结算日期' : '预计收款日期'}
              </label>
              <input
                type="date"
                value={formData.type === 'settled' ? formData.settledDate : formData.dueDate}
                onChange={e => setFormData(formData.type === 'settled'
                  ? { ...formData, settledDate: e.target.value }
                  : { ...formData, dueDate: e.target.value })}
                className="input-sketch"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">备注</label>
              <input type="text" placeholder="备注" value={formData.method} onChange={e => setFormData({...formData, method: e.target.value})} className="input-sketch" />
            </div>
          </div>
          <div className="pt-3 flex justify-end gap-2">
            <button type="button" onClick={() => { setIsModalOpen(false); setEditingPayment(null); }} className="btn-secondary py-2 px-4">取消</button>
            <button type="submit" className="btn-sketch py-2 px-4">{editingPayment ? '保存' : '记账'}</button>
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
