import { useState, useEffect, useRef, useMemo, useCallback, lazy, Suspense } from 'react';
import { useStore, Order } from '../store/useStore';
import { useSearchParams } from 'react-router-dom';
import { useProgressiveList } from '../hooks/useProgressiveList';
import { usePageLoad } from '../hooks/usePageLoad';
import { useFormSessionGuard } from '../hooks/useFormSessionGuard';
import { Search, Plus, Trash2, MessageSquare, Send, Upload, FileSpreadsheet, Download, FileDown, Link as LinkIcon, ExternalLink, Copy, Megaphone } from 'lucide-react';
import { clsx } from 'clsx';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import OrderCard from '../components/orders/OrderCard';
// 模板面板组件级懒加载：仅进入商单页时下载该组件代码
const OrderTemplatesPanel = lazy(() => import('../components/orders/OrderTemplatesPanel'));
import OrderFormModal, { type OrderFormPayload } from './orders/OrderFormModal';
import Select from '../components/common/Select';
import { sumMoney } from '../lib/money';
import { ORDER_STATUS_MAP, ORDER_TYPE_MAP, getPlatformIcon } from '../constants/orders';
import { authFetch } from '../lib/api';
import { ALL_MONTHS, ALL_YEARS, formatLocalDate, getAvailableYears, matchesYearMonth, monthOptions, parseDatabaseDate } from '../lib/dateFilter';
import { csvCell } from '../lib/csv';


const statusMap = ORDER_STATUS_MAP;
const typeMap = ORDER_TYPE_MAP;

export default function Orders() {
  const { orders, brands, payments, assets, orderTemplates, addOrder, updateOrder, updateOrderStatus, deleteOrder, addBrand, fetchOrders, fetchBrands, fetchPayments, fetchAssets, fetchOrderTemplates, comments, fetchComments, addComment, deleteComment, refreshOrders, publishLinks, fetchPublishLinks, addPublishLink, batchAddPublishLinks, deletePublishLink, paidPromotions, fetchPaidPromotions, addPaidPromotion, deletePaidPromotion } = useStore();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [yearFilter, setYearFilter] = useState(ALL_YEARS);
  const [monthFilter, setMonthFilter] = useState(ALL_MONTHS);
  const [brandFilter, setBrandFilter] = useState('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const { invalidateFormSession, captureFormSession, isFormSessionCurrent } = useFormSessionGuard();
  const [viewingOrder, setViewingOrder] = useState<Order | null>(null);
  const [newComment, setNewComment] = useState('');
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [newLinkInput, setNewLinkInput] = useState('');
  const [promotionPlatform, setPromotionPlatform] = useState('');
  const [promotionAmount, setPromotionAmount] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 删除确认弹窗状态
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; order: Order | null }>({
    isOpen: false,
    order: null
  });

  const handleDeleteOrder = (order: Order) => {
    setDeleteConfirm({ isOpen: true, order });
  };

  // 状态回退提示：后端会保留已结算账单与已出售资产，仅移除未结算的自动生成记录
  const getStatusRollbackWarning = (order: Order): string | null => {
    if (order.status !== 'completed') return null;
    const settledCount = rollbackWarnings.settledByOrderNo.get(order.orderNo) || 0;
    const soldCount = rollbackWarnings.soldByOrderId.get(order.id) || 0;
    const keepParts: string[] = [];
    if (settledCount > 0) keepParts.push(`${settledCount} 笔已结算账单`);
    if (soldCount > 0) keepParts.push(`${soldCount} 条已出售资产`);
    const keepText = keepParts.length > 0 ? `；${keepParts.join('、')}会保留` : '';
    return `回退状态将移除该商单未结算的自动账单/资产${keepText}`;
  };

  const confirmDeleteOrder = async () => {
    if (deleteConfirm.order) {
      await deleteOrder(deleteConfirm.order.id);
    }
  };

  const { state: loadState, retry: retryLoad } = usePageLoad(useCallback(
    () => Promise.all([fetchOrders(), fetchBrands(), fetchPayments(), fetchAssets()]),
    [fetchOrders, fetchBrands, fetchPayments, fetchAssets],
  ));

  // 模板面板仅本页使用，挂载时按需加载
  useEffect(() => {
    if (orderTemplates.length === 0) {
      fetchOrderTemplates().catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 快捷键/深链：?new=1 直接打开新建商单表单（effect 放在 handleOpenModal 之后，避免依赖数组访问未初始化的绑定）

  // 导出商单数据
  const handleExportOrders = () => {
    const exportData = filteredOrders.map(order => ({
      '商单号': order.orderNo,
      '标题': order.title,
      '品牌': order.brandName,
      '合作类型': order.type === 'paid' ? '付费' : order.type === 'product_exchange' ? '置换' : order.type === 'ecard' ? 'E卡' : '直发',
      '金额': order.actualAmount,
      '平台': order.platforms.join(', '),
      '接单日期': order.acceptDate || '',
      '提交日期': order.submitDate || '',
      '状态': order.status === 'completed' ? '已完成' : order.status === 'cancelled' ? '已取消' : '进行中'
    }));

    if (exportData.length === 0) {
      showToast('没有可导出的商单数据', 'warning');
      return;
    }

    const headers = Object.keys(exportData[0]);
    const csvContent = [
      headers.map(csvCell).join(','),
      ...exportData.map(row => headers.map(h => csvCell(row[h as keyof typeof row] ?? '')).join(','))
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `商单导出_${formatLocalDate()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`已导出 ${exportData.length} 条商单数据`);
  };

  useEffect(() => {
    if (viewingOrder) {
      fetchComments(viewingOrder.id).catch(() => {});
      fetchPublishLinks(viewingOrder.id).catch(() => {});
      fetchPaidPromotions(viewingOrder.id).catch(() => {});
    }
  }, [viewingOrder, fetchComments, fetchPublishLinks, fetchPaidPromotions]);

  const handleOpenModal = useCallback((order?: Order) => {
    invalidateFormSession();
    setEditingOrder(order ?? null);
    setIsModalOpen(true);
  }, [invalidateFormSession]);

  const handleCloseModal = () => {
    invalidateFormSession();
    setIsModalOpen(false);
    setEditingOrder(null);
  };

  // 快捷键/深链：?new=1 直接打开新建商单表单
  useEffect(() => {
    if (searchParams.get('new')) {
      handleOpenModal();
      const next = new URLSearchParams(searchParams);
      next.delete('new');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams, handleOpenModal]);

  useEffect(() => {
    const orderId = searchParams.get('id');
    if (!orderId) return;
    const order = orders.find(item => item.id === orderId);
    if (!order) return;
    setViewingOrder(order);
    const next = new URLSearchParams(searchParams);
    next.delete('id');
    setSearchParams(next, { replace: true });
  }, [orders, searchParams, setSearchParams]);

  const availableYears = useMemo(() => getAvailableYears(orders.map(order => order.acceptDate)), [orders]);
  const brandOptions = useMemo(() => {
    const names = orders
      .map(order => order.brandName)
      .filter((name): name is string => Boolean(name?.trim()));
    return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b, 'zh-CN'));
  }, [orders]);

  const filteredOrders = useMemo(() => {
    const searchLower = searchTerm.toLowerCase();
    return orders.filter(order => {
      const matchesSearch = order.title.toLowerCase().includes(searchLower) ||
        (order.brandName?.toLowerCase() || '').includes(searchLower) ||
        order.orderNo.toLowerCase().includes(searchLower) ||
        (order.platforms || []).some(platform => platform.toLowerCase().includes(searchLower));
      const matchesBrand = brandFilter === 'all' || order.brandName === brandFilter;
      const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
      const matchesAcceptDate = matchesYearMonth(order.acceptDate, yearFilter, monthFilter);
      return matchesSearch && matchesBrand && matchesStatus && matchesAcceptDate;
    });
  }, [orders, searchTerm, brandFilter, statusFilter, yearFilter, monthFilter]);

  // 状态回退提示按商单号/商单 ID 预聚合一次，避免每个卡片各自扫描账单与资产
  const rollbackWarnings = useMemo(() => {
    const settledByOrderNo = new Map<string, number>();
    for (const payment of payments) {
      if (payment.type !== 'settled' || !payment.orderNo) continue;
      settledByOrderNo.set(payment.orderNo, (settledByOrderNo.get(payment.orderNo) || 0) + 1);
    }
    const soldByOrderId = new Map<string, number>();
    for (const asset of assets) {
      if (asset.saleStatus !== 'sold') continue;
      soldByOrderId.set(asset.orderId, (soldByOrderId.get(asset.orderId) || 0) + 1);
    }
    return { settledByOrderNo, soldByOrderId };
  }, [payments, assets]);

  // 表单提交（品牌自动创建与接口调用留在页面层，表单状态在 OrderFormModal 内）
  const handleFormSubmit = async (payload: OrderFormPayload) => {
    // 记录发起保存时的表单：返回后若弹窗已被关闭/换成另一张表单，不再改动弹窗状态
    const formSession = captureFormSession();
    const existingBrand = brands.find(b => b.name === payload.brandName);
    if (!existingBrand && payload.brandName.trim()) {
      await addBrand({
        name: payload.brandName,
        industry: '未知',
        contact: '未知',
        phone: ''
      });
    }

    if (editingOrder) {
      await updateOrder(editingOrder.id, payload);
    } else {
      await addOrder(payload);
    }

    // 表单已被关闭或换成另一张：不再改动弹窗状态（否则会关掉用户正在填写的表单）
    if (!isFormSessionCurrent(formSession)) return;
    setIsModalOpen(false);
    setEditingOrder(null);
  };

  const handleAddComment = async () => {
    if (!viewingOrder || !newComment.trim()) return;
    try {
      await addComment(viewingOrder.id, newComment.trim());
      setNewComment('');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '添加评论失败', 'error');
    }
  };

  const formatCommentDate = (dateStr: string) => {
    const date = parseDatabaseDate(dateStr) ?? new Date(dateStr);
    return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  // 仅允许 http/https 链接渲染为可点击（避免 javascript: 等协议注入）
  const toSafeHref = (url: string): string | undefined => {
    try {
      const parsed = new URL(url, window.location.origin);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : undefined;
    } catch {
      return undefined;
    }
  };

  const handleAddPublishLink = async () => {
    if (!viewingOrder || !newLinkInput.trim()) return;
    try {
      const lines = newLinkInput.split('\n').map(line => line.trim()).filter(Boolean);
      if (lines.length === 0) return;
      
      if (lines.length === 1) {
        await addPublishLink(viewingOrder.id, '', lines[0]);
      } else {
        await batchAddPublishLinks(viewingOrder.id, lines);
      }
      setNewLinkInput('');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '添加链接失败', 'error');
    }
  };

  const handleDeletePublishLink = async (id: string) => {
    try {
      await deletePublishLink(id);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '删除链接失败', 'error');
    }
  };

  const handleAddPaidPromotion = async () => {
    if (!viewingOrder) return;
    const platform = promotionPlatform.trim();
    const amount = Number(promotionAmount);

    if (!platform) {
      showToast('请填写推广平台', 'warning');
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      showToast('请填写有效的推广金额', 'warning');
      return;
    }

    try {
      await addPaidPromotion(viewingOrder.id, platform, amount);
      setPromotionPlatform('');
      setPromotionAmount('');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '添加付费推广记录失败', 'error');
    }
  };

  const handleDeletePaidPromotion = async (id: string) => {
    try {
      await deletePaidPromotion(id);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '删除付费推广记录失败', 'error');
    }
  };

  const handleDeleteComment = async (id: string) => {
    try {
      await deleteComment(id);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '删除沟通记录失败', 'error');
    }
  };

  const handleBatchCopyLinks = async () => {
    if (!viewingOrder) return;
    const links = publishLinks.filter(l => l.orderId === viewingOrder.id);
    if (links.length === 0) {
      showToast('暂无链接可复制', 'warning');
      return;
    }
    const text = links.map(l => `${l.platform}: ${l.url}`).join('\n');

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard API unavailable');
      }
      await navigator.clipboard.writeText(text);
      showToast(`已复制 ${links.length} 个链接`);
    } catch (error) {
      showToast('复制失败', 'error');
    }
  };

  // 批量导入处理
  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ['.xlsx', '.csv'];
    const fileExt = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (!validTypes.includes(fileExt)) {
      showToast('请上传 .xlsx 或 .csv 文件', 'error');
      return;
    }

    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await authFetch('/api/data/orders/file', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();
      if (result.success !== undefined) {
        showToast(`导入完成：成功 ${result.success} 条，失败 ${result.failed} 条`, result.failed > 0 ? 'warning' : 'success');
        if (result.errors?.length > 0) {
          console.warn('导入错误:', result.errors);
        }
        await refreshOrders();
        setIsImportModalOpen(false);
      } else {
        showToast(result.error || '导入失败', 'error');
      }
    } catch (error) {
      showToast('导入失败，请检查文件格式', 'error');
    } finally {
      setImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // 下载导入模板
  const downloadTemplate = () => {
    const template = [
      ['标题', '品牌名称', '合作类型', '金额', '平台', '接单日期', '提交日期', '状态'],
      ['示例商单1', '完美日记', '付费', '5000', '小红书,抖音', '2024-01-15', '2024-01-20', '进行中'],
      ['示例商单2', '花西子', '置换', '0', '小红书', '2024-01-16', '2024-01-25', '进行中'],
      ['示例商单3', '珀莱雅', '直发', '3000', '抖音', '2024-01-18', '2024-01-22', '已完成']
    ];

    const csvContent = template.map(row => row.map(csvCell).join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '商单导入模板.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  // 详情始终展示 store 中的最新商单数据（编辑后不再显示旧快照）
  const currentViewingOrder = viewingOrder ? (orders.find(o => o.id === viewingOrder.id) ?? viewingOrder) : null;
  const viewingOrderLinks = currentViewingOrder ? publishLinks.filter(link => link.orderId === currentViewingOrder.id) : [];
  const viewingOrderPromotions = currentViewingOrder ? paidPromotions.filter(record => record.orderId === currentViewingOrder.id) : [];
  const viewingOrderPromotionTotal = sumMoney(viewingOrderPromotions, record => record.amount);
  const promotionPlatformOptions = Array.from(new Set(viewingOrderLinks.map(link => link.platform).filter(Boolean)));

  // 渐进渲染：数据全量加载（统计需要），但列表只渲染前若干条
  const ordersView = useProgressiveList(filteredOrders, undefined, `${searchTerm}|${statusFilter}|${brandFilter}|${yearFilter}|${monthFilter}`);


  if (loadState === 'loading') return <div key="loading" role="status" className="card-pixel p-6"><h1 className="text-lg font-bold mb-3">商单管理</h1>正在加载商单…</div>;
  if (loadState === 'error') return <div key="error" role="alert" className="card-pixel p-6"><h1 className="text-lg font-bold mb-3">商单管理</h1>商单数据加载失败，请检查连接后重试。<button type="button" className="ml-3 underline" onClick={() => void retryLoad()}>重试</button></div>;

  return (
    <div key="content" className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-bold text-panda-black">商单管理</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportOrders}
            aria-label="导出"
            className="btn-secondary flex items-center gap-1 text-sm py-1.5 px-3 hover:scale-[1.02] transition-all"
          >
            <FileDown size={14} />
            <span className="hidden sm:inline">导出</span>
          </button>
          <button onClick={() => setIsImportModalOpen(true)} aria-label="导入" className="btn-secondary flex items-center gap-1 text-sm py-1.5 px-3 hover:scale-[1.02] transition-all">
            <Upload size={14} />
            <span className="hidden sm:inline">导入</span>
          </button>
          <button onClick={() => handleOpenModal()} className="btn-sketch flex items-center gap-1 text-sm py-1.5 px-3">
            <Plus size={14} />
            <span>新建</span>
          </button>
        </div>
      </div>

      <Suspense fallback={<div className="h-24 card-sketch animate-pulse" aria-hidden="true" />}>
        <OrderTemplatesPanel />
      </Suspense>

      <div className="card-sketch p-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-panda-white">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-1">
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
            <input
              type="text"
              aria-label="搜索商单、品牌、平台" placeholder="搜索..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full form-control form-control-sm pl-8"
            />
          </div>
          <div className="flex items-center gap-2">
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
              aria-label="按接单年份筛选"
              options={[{ value: ALL_YEARS, label: '全部年份' }, ...availableYears.map(year => ({ value: year, label: `${year}年` }))]}
            />
            <Select
              value={monthFilter}
              onChange={setMonthFilter}
              size="sm"
              className="w-24 flex-shrink-0"
              aria-label="按接单月份筛选"
              options={[{ value: ALL_MONTHS, label: '全年' }, ...monthOptions.map(option => ({ value: option.value, label: option.label }))]}
            />
          </div>
        </div>

        <div className="segment-group gap-1 overflow-x-auto">
          <button
            type="button"
            aria-pressed={statusFilter === 'all'}
            onClick={() => setStatusFilter('all')}
            className="segment px-2.5 py-1"
          >
            全部
          </button>
          {Object.entries(statusMap).map(([key, value]) => (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              aria-pressed={statusFilter === key}
              className="segment px-2.5 py-1"
            >
              {value.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {ordersView.visibleItems.map(order => (
          <OrderCard
            key={order.id}
            order={order}
            onDelete={() => handleDeleteOrder(order)}
            onStatusChange={(status) => updateOrderStatus(order.id, status)}
            onEdit={() => handleOpenModal(order)}
            onView={() => setViewingOrder(order)}
            statusChangeWarning={getStatusRollbackWarning(order)}
          />
        ))}

        {ordersView.windowed && (
            <div className="flex flex-col items-center gap-1 py-4">
              {ordersView.hasMore && (
                <button type="button" onClick={ordersView.loadMore} className="btn-secondary text-sm">
                  加载更多
                </button>
              )}
              <span className="text-xs text-gray-500">
                已显示 {ordersView.visibleCount} / {ordersView.total} 条
              </span>
            </div>
          )}
        {filteredOrders.length === 0 && (
          <div className="col-span-full py-16 flex flex-col items-center justify-center text-gray-600 card-pixel p-8">
            <div className="w-16 h-16 border-2 border-dashed border-gray-300 rounded-full flex items-center justify-center mb-3">
              <span className="text-2xl">📋</span>
            </div>
            <p className="text-sm">没有找到匹配的商单</p>
          </div>
        )}
      </div>

      <OrderFormModal
        isOpen={isModalOpen}
        editingOrder={editingOrder}
        brands={brands}
        onClose={handleCloseModal}
        onSubmit={handleFormSubmit}
      />

      <Modal isOpen={!!viewingOrder} onClose={() => { setViewingOrder(null); setNewComment(''); setNewLinkInput(''); setPromotionPlatform(''); setPromotionAmount(''); }} title="商单详情" width="max-w-lg">
        {currentViewingOrder && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-gray-500 text-xs block">商单号</span>
                <span className="font-medium">{currentViewingOrder!.orderNo}</span>
              </div>
              <div>
                <span className="text-gray-500 text-xs block">状态</span>
                <span className={clsx("text-xs px-2 py-0.5 rounded-full font-medium inline-flex items-center gap-1 mt-1", statusMap[currentViewingOrder!.status]?.color)}>
                  {statusMap[currentViewingOrder!.status]?.icon} {statusMap[currentViewingOrder!.status]?.label}
                </span>
              </div>
              <div className="col-span-2">
                <span className="text-gray-500 text-xs block">标题</span>
                <span className="font-medium">{currentViewingOrder!.title}</span>
              </div>
              <div>
                <span className="text-gray-500 text-xs block">品牌</span>
                <span className="font-medium">{currentViewingOrder!.brandName || '未知品牌'}</span>
              </div>
              <div>
                <span className="text-gray-500 text-xs block">类型</span>
                <span className="font-medium">{typeMap[currentViewingOrder!.type]?.icon} {typeMap[currentViewingOrder!.type]?.label}</span>
              </div>
              <div>
                <span className="text-gray-500 text-xs block">金额</span>
                <span className="font-medium text-success">¥{currentViewingOrder!.actualAmount.toLocaleString()}</span>
              </div>
              {currentViewingOrder!.type === 'product_exchange' && currentViewingOrder!.productName && (
                  <>
                    <div>
                      <span className="text-gray-500 text-xs block">置换产品</span>
                      <span className="font-medium">{currentViewingOrder!.productName}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 text-xs block">产品价值</span>
                      <span className="font-medium text-success">¥{(currentViewingOrder!.productValue || 0).toLocaleString()}</span>
                    </div>
                  </>
                )}
                {currentViewingOrder!.type === 'ecard' && (
                  <div>
                    <span className="text-gray-500 text-xs block">面值</span>
                    <span className="font-medium text-success">¥{(currentViewingOrder!.productValue || 0).toLocaleString()}</span>
                  </div>
                )}
              <div>
                <span className="text-gray-500 text-xs block">平台</span>
                <span className="font-medium">{currentViewingOrder!.platforms?.join(', ') || '-'}</span>
              </div>
            </div>

            {/* 评论区域 */}
            <div className="border-t border-border/50 pt-4">
              <div className="flex items-center gap-2 mb-3">
                <MessageSquare size={16} className="text-gray-500" />
                <span className="text-sm font-medium text-gray-700">沟通记录</span>
                <span className="text-xs text-gray-500">({comments.filter(c => c.orderId === currentViewingOrder!.id).length})</span>
              </div>

              <div className="space-y-2 max-h-[200px] overflow-y-auto mb-3">
                {comments.filter(c => c.orderId === currentViewingOrder!.id).length > 0 ? (
                  comments.filter(c => c.orderId === currentViewingOrder!.id).map(comment => (
                    <div key={comment.id} className="bg-gray-50 rounded-lg p-2.5 flex items-start gap-2 group">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-700 break-words">{comment.content}</p>
                        <span className="text-[10px] text-gray-500 mt-1 block">{formatCommentDate(comment.createdAt)}</span>
                      </div>
                      <button
                        onClick={() => handleDeleteComment(comment.id)}
                        className="p-1.5 text-gray-600 hover:text-danger hover:bg-danger/10 rounded transition-colors max-md:opacity-100 opacity-0 group-hover:opacity-100 hover-visible"
                        title="删除沟通记录"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-gray-500 text-center py-4">暂无沟通记录</p>
                )}
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="添加沟通记录..."
                  value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddComment()}
                  className="flex-1 form-control"
                />
                <button
                  type="button"
                  aria-label="发送评论"
                  onClick={handleAddComment}
                  disabled={!newComment.trim()}
                  className="btn-sketch py-2 px-3 disabled:opacity-50"
                >
                  <Send size={14} />
                </button>
              </div>
            </div>

            {/* 发布链接区域 */}
            <div className="border-t border-border/50 pt-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <LinkIcon size={16} className="text-gray-500" />
                  <span className="text-sm font-medium text-gray-700">发布链接</span>
                  <span className="text-xs text-gray-500">({publishLinks.filter(l => l.orderId === currentViewingOrder!.id).length})</span>
                </div>
                {publishLinks.filter(l => l.orderId === currentViewingOrder!.id).length > 0 && (
                  <button
                    onClick={handleBatchCopyLinks}
                    className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600 hover:bg-blue-50 px-2 py-1 rounded-lg transition-colors"
                  >
                    <Copy size={12} />
                    批量复制
                  </button>
                )}
              </div>

              <div className="space-y-2 max-h-[200px] overflow-y-auto mb-3">
                {publishLinks.filter(l => l.orderId === currentViewingOrder!.id).length > 0 ? (
                  publishLinks.filter(l => l.orderId === currentViewingOrder!.id).map(link => (
                    <div key={link.id} className="bg-gray-50 rounded-lg p-2.5 flex items-center gap-3 group">
                      <span className="text-lg">{getPlatformIcon(link.platform)}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-gray-600">{link.platform}</span>
                        </div>
                        <a
                          href={toSafeHref(link.url)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-500 hover:underline truncate block"
                        >
                          {(link.url || '').length > 40 ? (link.url || '').substring(0, 40) + '...' : link.url || '-'}
                        </a>
                      </div>
                      <a
                        href={toSafeHref(link.url) || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 text-gray-600 hover:text-blue-500 hover:bg-blue-50 rounded transition-colors"
                        title="打开链接"
                      >
                        <ExternalLink size={14} />
                      </a>
                      <button
                        onClick={() => handleDeletePublishLink(link.id)}
                        className="p-1.5 text-gray-600 hover:text-danger hover:bg-danger/10 rounded transition-colors max-md:opacity-100 opacity-0 group-hover:opacity-100 hover-visible"
                        title="删除链接"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-gray-500 text-center py-4">暂无发布链接</p>
                )}
              </div>

              <div className="flex gap-2">
                <textarea
                  placeholder="粘贴链接，每行一个...&#10;支持格式：&#10;小红书：https://...&#10;https://douyin.com/...&#10;(自动识别平台)"
                  value={newLinkInput}
                  onChange={e => setNewLinkInput(e.target.value)}
                  className="flex-1 form-control resize-none"
                  rows={3}
                />
                <button
                  type="button"
                  aria-label="添加发布链接"
                  onClick={handleAddPublishLink}
                  disabled={!newLinkInput.trim()}
                  className="btn-sketch py-2 px-3 disabled:opacity-50 self-end"
                >
                  <Plus size={14} />
                </button>
              </div>
              <p className="text-[10px] text-gray-500 mt-1">支持多行批量输入，自动识别平台。格式：平台：链接 或直接粘贴链接</p>
            </div>

            {/* 付费推广记录 */}
            <div className="border-t border-border/50 pt-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Megaphone size={16} className="text-gray-500" />
                  <span className="text-sm font-medium text-gray-700">付费推广记录</span>
                  <span className="text-xs text-gray-500">({viewingOrderPromotions.length})</span>
                </div>
                <span className="text-xs font-semibold text-danger bg-danger/10 px-2 py-1 rounded-full">
                  合计 ¥{viewingOrderPromotionTotal.toLocaleString()}
                </span>
              </div>

              <div className="space-y-2 max-h-[180px] overflow-y-auto mb-3">
                {viewingOrderPromotions.length > 0 ? (
                  viewingOrderPromotions.map(record => (
                    <div key={record.id} className="bg-gray-50 rounded-lg p-2.5 flex items-center gap-3 group">
                      <span className="text-lg">{getPlatformIcon(record.platform)}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-gray-600 truncate">{record.platform}</div>
                        <div className="text-[10px] text-gray-500">{formatCommentDate(record.createdAt)}</div>
                      </div>
                      <div className="text-sm font-semibold text-danger">¥{record.amount.toLocaleString()}</div>
                      <button
                        onClick={() => handleDeletePaidPromotion(record.id)}
                        className="p-1.5 text-gray-600 hover:text-danger hover:bg-danger/10 rounded transition-colors max-md:opacity-100 opacity-0 group-hover:opacity-100 hover-visible"
                        title="删除记录"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-gray-500 text-center py-4">暂无付费推广记录</p>
                )}
              </div>

              <div className="space-y-2">
                {promotionPlatformOptions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {promotionPlatformOptions.map(platform => (
                      <button
                        key={platform}
                        type="button"
                        onClick={() => setPromotionPlatform(platform)}
                        className={clsx(
                          "text-[10px] px-2.5 py-1 rounded-full border transition-colors",
                          promotionPlatform === platform
                            ? "bg-panda-black text-panda-white border-panda-black"
                            : "bg-panda-white text-gray-600 border-border hover:border-panda-black"
                        )}
                      >
                        {getPlatformIcon(platform)} {platform}
                      </button>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_110px_auto] gap-2">
                  <div className="min-w-0">
                    <input
                      list="paid-promotion-platforms"
                      value={promotionPlatform}
                      onChange={e => setPromotionPlatform(e.target.value)}
                      placeholder="推广平台"
                      className="w-full form-control"
                    />
                    <datalist id="paid-promotion-platforms">
                      {promotionPlatformOptions.map(platform => (
                        <option key={platform} value={platform} />
                      ))}
                    </datalist>
                  </div>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={promotionAmount}
                    onChange={e => setPromotionAmount(e.target.value)}
                    placeholder="金额"
                    className="w-full form-control"
                  />
                  <button
                    onClick={handleAddPaidPromotion}
                    disabled={!promotionPlatform.trim() || !promotionAmount.trim()}
                    className="btn-sketch py-2 px-3 disabled:opacity-50 justify-center"
                    title="添加付费推广记录"
                  >
                    <Plus size={14} />
                  </button>
                </div>
                <p className="text-[10px] text-gray-500">可手动输入平台，也可以点选已填写发布链接的平台。</p>
              </div>
            </div>

            <div className="pt-3 flex justify-end">
              <button onClick={() => { setViewingOrder(null); setNewComment(''); setNewLinkInput(''); setPromotionPlatform(''); setPromotionAmount(''); }} className="btn-sketch py-2 px-4 text-sm">关闭</button>
            </div>
          </div>
        )}
      </Modal>

      {/* 批量导入弹窗 */}
      <Modal isOpen={isImportModalOpen} onClose={() => setIsImportModalOpen(false)} title="批量导入商单">
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-700">
            <p className="font-medium mb-2">导入说明：</p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li>支持 Excel (.xlsx) 和 CSV 格式</li>
              <li>第一行为标题行，必须包含"标题"列</li>
              <li>合作类型：付费、置换、直发</li>
              <li>状态：进行中、已完成、已取消</li>
            </ul>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={downloadTemplate}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-panda-black/15 rounded-xl text-sm transition-colors"
            >
              <Download size={16} />
              下载模板
            </button>
          </div>

          <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-accent transition-colors">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.csv"
              onChange={handleFileImport}
              className="hidden"
              id="file-import"
            />
            <label htmlFor="file-import" className="cursor-pointer">
              <FileSpreadsheet size={40} className="mx-auto text-gray-600 mb-3" />
              <p className="text-sm text-gray-600 mb-1">
                {importing ? '正在导入...' : '点击选择文件或拖拽文件到此处'}
              </p>
              <p className="text-xs text-gray-500">支持 .xlsx, .csv 格式</p>
            </label>
          </div>

          <div className="pt-4 flex justify-end gap-3">
            <button
              onClick={() => setIsImportModalOpen(false)}
              className="px-4 py-2 text-gray-600 hover:bg-panda-black/10 rounded-xl transition-colors text-sm"
              disabled={importing}
            >
              关闭
            </button>
          </div>
        </div>
      </Modal>

      {/* 删除确认弹窗 */}
      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        onClose={() => setDeleteConfirm({ isOpen: false, order: null })}
        onConfirm={confirmDeleteOrder}
        title="确认删除商单"
        message={`确定要删除商单「${deleteConfirm.order?.title}」吗？此操作不可恢复。`}
        confirmText="确认删除"
      />
    </div>
  );
}
