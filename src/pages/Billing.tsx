import { useState, useMemo } from 'react';
import { useStore, Payment } from '../store/useStore';
import { ArrowUpRight, ArrowDownRight, Download, X, CheckCircle, Clock, Edit2, Trash2 } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import { clsx } from 'clsx';

export default function Billing() {
  const { payments, addPayment, settlePayment, updatePayment, deletePayment } = useStore();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const monthParam = searchParams.get('month');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'settled' | 'pending'>('all');
  const [formData, setFormData] = useState({
    orderNo: '',
    brand: '',
    amount: '',
    type: 'pending' as Payment['type'],
    date: '',
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
      setFormData({ orderNo: '', brand: '', amount: '', type: 'pending', date: '', method: '' });
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
      date: payment.date || '',
      method: payment.method || ''
    });
    setIsModalOpen(true);
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

  const thisMonthSettled = payments
    .filter(p => p.type === 'settled' && new Date(p.date).getMonth() === currentMonth && new Date(p.date).getFullYear() === currentYear)
    .reduce((acc, p) => acc + p.amount, 0);

  const lastMonthSettled = payments
    .filter(p => p.type === 'settled' && new Date(p.date).getMonth() === (currentMonth === 0 ? 11 : currentMonth - 1) && new Date(p.date).getFullYear() === (currentMonth === 0 ? currentYear - 1 : currentYear))
    .reduce((acc, p) => acc + p.amount, 0);

  const monthChange = lastMonthSettled === 0
    ? (thisMonthSettled > 0 ? 100 : 0)
    : ((thisMonthSettled - lastMonthSettled) / lastMonthSettled) * 100;

  const totalSettled = payments.filter(p => p.type === 'settled').reduce((acc, p) => acc + p.amount, 0);
  const totalPending = payments.filter(p => p.type === 'pending').reduce((acc, p) => acc + p.amount, 0);

  const filteredPayments = useMemo(() => {
    return payments.filter(p => {
      const matchesType = filterType === 'all' || p.type === filterType;
      let matchesMonth = true;
      if (monthParam !== null) {
        const paymentMonth = new Date(p.date).getMonth();
        matchesMonth = paymentMonth === parseInt(monthParam, 10);
      }
      return matchesType && matchesMonth;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [payments, filterType, monthParam]);

  const handleExport = () => {
    const headers = ['日期', '关联商单', '品牌方', '金额', '状态', '备注'];
    const csvContent = [
      headers.join(','),
      ...filteredPayments.map(p => [
        `"${p.date || ''}"`,
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
    link.setAttribute('download', `账单报表_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
          <button onClick={() => { setEditingPayment(null); setFormData({ orderNo: '', brand: '', amount: '', type: 'pending', date: '', method: '' }); setIsModalOpen(true); }} className="btn-sketch flex items-center justify-center gap-1 text-xs md:text-sm py-1.5 px-2.5 md:px-3">
            <span>+</span> 记账
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 md:gap-4">
        <div className="card-sketch p-3 md:p-4 bg-white">
          <div className="text-gray-500 text-[10px] md:text-xs font-medium mb-0.5 md:mb-1">已结算</div>
          <div className="text-lg md:text-2xl font-bold font-mono text-success">¥ {totalSettled.toLocaleString()}</div>
          {monthChange !== 0 && (
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
          <div className="text-[10px] md:text-xs text-gray-400 mt-0.5 md:mt-1">{payments.filter(p => p.type === 'pending').length} 笔</div>
        </div>
        <div className="card-sketch p-3 md:p-4 bg-white">
          <div className="text-gray-500 text-[10px] md:text-xs font-medium mb-0.5 md:mb-1">总金额</div>
          <div className="text-lg md:text-2xl font-bold font-mono">¥ {(totalSettled + totalPending).toLocaleString()}</div>
          <div className="text-[10px] md:text-xs text-gray-400 mt-0.5 md:mt-1">{payments.length} 笔</div>
        </div>
      </div>

      <div className="card-sketch overflow-hidden bg-white">
        <div className="p-3 md:p-3 border-b-2 border-panda-black/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="font-bold text-xs md:text-sm">收支明细</h2>
            {monthParam !== null && (
              <span className="bg-panda-black/10 text-panda-black px-1.5 md:px-2 py-0.5 rounded text-[10px] md:text-xs font-medium flex items-center gap-1">
                {parseInt(monthParam, 10) + 1}月
                <button
                  onClick={() => {
                    searchParams.delete('month');
                    setSearchParams(searchParams);
                  }}
                  className="hover:text-panda-black ml-0.5"
                >
                  <X size={10} className="md:hidden" />
                  <X size={12} className="hidden md:block" />
                </button>
              </span>
            )}
          </div>
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
                  <span>{payment.date || '-'}</span>
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
          {payments.length === 0 && (
            <div className="py-8 text-center text-gray-400 text-xs">
              暂无收支明细
            </div>
          )}
        </div>

        {/* Desktop table view */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">日期</th>
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
                  <td className="px-4 py-3 text-gray-600">{payment.date || '-'}</td>
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
              {payments.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                    <div className="w-12 h-12 border-2 border-dashed border-gray-300 rounded-full flex items-center justify-center mx-auto mb-2">
                      <span className="text-lg">📋</span>
                    </div>
                    暂无收支明细
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
              <select value={formData.type} onChange={e => setFormData({...formData, type: e.target.value as 'settled' | 'pending'})} className="input-sketch">
                <option value="pending">待结算</option>
                <option value="settled">已结算</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">日期</label>
              <input type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="input-sketch" />
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