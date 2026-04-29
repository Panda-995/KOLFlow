import { useState, useEffect, useRef } from 'react';
import { useStore, Order, OrderType, OrderStatus } from '../store/useStore';
import { Search, Plus, Trash2, MessageSquare, Send, Upload, FileSpreadsheet, Download, FileDown, Link as LinkIcon, ExternalLink, Copy } from 'lucide-react';
import { clsx } from 'clsx';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import OrderCard from '../components/orders/OrderCard';
import { ORDER_STATUS_MAP, ORDER_TYPE_MAP, getPlatformIcon } from '../constants/orders';


const statusMap = ORDER_STATUS_MAP;
const typeMap = ORDER_TYPE_MAP;

export default function Orders() {
  const { orders, brands, addOrder, updateOrder, updateOrderStatus, deleteOrder, addBrand, comments, fetchComments, addComment, fetchOrders, publishLinks, fetchPublishLinks, addPublishLink, batchAddPublishLinks, deletePublishLink } = useStore();
  const { showToast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [viewingOrder, setViewingOrder] = useState<Order | null>(null);
  const [newComment, setNewComment] = useState('');
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [newLinkInput, setNewLinkInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 删除确认弹窗状态
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; order: Order | null }>({
    isOpen: false,
    order: null
  });

  const handleDeleteOrder = (order: Order) => {
    setDeleteConfirm({ isOpen: true, order });
  };

  const confirmDeleteOrder = async () => {
    if (deleteConfirm.order) {
      await deleteOrder(deleteConfirm.order.id);
      showToast('商单已删除');
    }
  };

  // 导出商单数据
  const handleExportOrders = () => {
    const exportData = filteredOrders.map(order => ({
      '商单号': order.orderNo,
      '标题': order.title,
      '品牌': order.brandName,
      '合作类型': order.type === 'paid' ? '付费' : order.type === 'product_exchange' ? '置换' : '直发',
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
      headers.join(','),
      ...exportData.map(row => headers.map(h => `"${row[h as keyof typeof row] || ''}"`).join(','))
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `商单导出_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`已导出 ${exportData.length} 条商单数据`);
  };

  useEffect(() => {
    if (viewingOrder) {
      fetchComments(viewingOrder.id);
      fetchPublishLinks(viewingOrder.id);
    }
  }, [viewingOrder, fetchComments, fetchPublishLinks]);

  const [formData, setFormData] = useState({
    title: '',
    brandName: '',
    type: 'paid' as OrderType,
    status: 'in_progress' as OrderStatus,
    actualAmount: '',
    platforms: '',
    acceptDate: '',
    submitDate: ''
  });

  const handleOpenModal = (order?: Order) => {
    if (order) {
      setEditingOrderId(order.id);
      setFormData({
        title: order.title,
        brandName: order.brandName,
        type: order.type,
        status: order.status,
        actualAmount: order.actualAmount.toString(),
        platforms: order.platforms.join(', '),
        acceptDate: order.acceptDate || '',
        submitDate: order.submitDate || ''
      });
    } else {
      setEditingOrderId(null);
      setFormData({ title: '', brandName: '', type: 'paid', status: 'in_progress', actualAmount: '', platforms: '', acceptDate: '', submitDate: '' });
    }
    setIsModalOpen(true);
  };

  const filteredOrders = orders.filter(order => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = order.title.toLowerCase().includes(searchLower) ||
      (order.brandName?.toLowerCase() || '').includes(searchLower) ||
      order.orderNo.toLowerCase().includes(searchLower);
    const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const existingBrand = brands.find(b => b.name === formData.brandName);
      if (!existingBrand && formData.brandName.trim()) {
        await addBrand({
          name: formData.brandName,
          industry: '未知',
          contact: '未知',
          phone: ''
        });
      }

      const orderData = {
        ...formData,
        actualAmount: Number(formData.actualAmount) || 0,
        platforms: formData.platforms.split(',').map(s => s.trim()).filter(Boolean)
      };

      if (editingOrderId) {
        await updateOrder(editingOrderId, orderData);
        showToast('商单已更新');
      } else {
        await addOrder(orderData);
        showToast('商单已创建');
      }

      setIsModalOpen(false);
      setEditingOrderId(null);
      setFormData({ title: '', brandName: '', type: 'paid', status: 'in_progress', actualAmount: '', platforms: '', acceptDate: '', submitDate: '' });
    } catch (error) {
      showToast(error instanceof Error ? error.message : '操作失败', 'error');
    }
  };

  const handleAddComment = async () => {
    if (!viewingOrder || !newComment.trim()) return;
    await addComment(viewingOrder.id, newComment.trim());
    setNewComment('');
  };

  const formatCommentDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  const handleAddPublishLink = async () => {
    if (!viewingOrder || !newLinkInput.trim()) return;
    try {
      const lines = newLinkInput.split('\n').map(line => line.trim()).filter(Boolean);
      if (lines.length === 0) return;
      
      if (lines.length === 1) {
        await addPublishLink(viewingOrder.id, '', lines[0]);
        showToast('发布链接已添加');
      } else {
        const result = await batchAddPublishLinks(viewingOrder.id, lines);
        showToast(`已批量添加 ${result.created} 个发布链接`);
      }
      setNewLinkInput('');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '添加链接失败', 'error');
    }
  };

  const handleDeletePublishLink = async (id: string) => {
    await deletePublishLink(id);
    showToast('链接已删除');
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
      await navigator.clipboard.writeText(text);
      showToast(`已复制 ${links.length} 个链接`);
    } catch {
      showToast('复制失败', 'error');
    }
  };

  // 批量导入处理
  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ['.xlsx', '.xls', '.csv'];
    const fileExt = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (!validTypes.includes(fileExt)) {
      showToast('请上传 Excel 或 CSV 文件', 'error');
      return;
    }

    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const token = localStorage.getItem('token');
      const response = await fetch(getApiUrl('/api/data/orders/file'), {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });

      const result = await response.json();
      if (result.success !== undefined) {
        showToast(`导入完成：成功 ${result.success} 条，失败 ${result.failed} 条`, result.failed > 0 ? 'warning' : 'success');
        if (result.errors?.length > 0) {
          console.log('导入错误:', result.errors);
        }
        fetchOrders();
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

    const csvContent = template.map(row => row.join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '商单导入模板.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-bold text-panda-black">商单管理</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportOrders}
            className="btn-secondary flex items-center gap-1 text-sm py-1.5 px-3 hover:scale-[1.02] transition-all"
          >
            <FileDown size={14} />
            <span className="hidden sm:inline">导出</span>
          </button>
          <button onClick={() => setIsImportModalOpen(true)} className="btn-secondary flex items-center gap-1 text-sm py-1.5 px-3 hover:scale-[1.02] transition-all">
            <Upload size={14} />
            <span className="hidden sm:inline">导入</span>
          </button>
          <button onClick={() => handleOpenModal()} className="btn-sketch flex items-center gap-1 text-sm py-1.5 px-3">
            <Plus size={14} />
            <span>新建</span>
          </button>
        </div>
      </div>

      <div className="card-sketch p-3 flex items-center justify-between gap-3 bg-white">
        <div className="flex items-center gap-2 flex-1">
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="搜索..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-gray-50 border-2 border-panda-black/10 focus:border-panda-black focus:bg-white rounded-lg outline-none transition-all text-xs"
            />
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setStatusFilter('all')}
            className={clsx(
              "px-2.5 py-1 rounded-full text-xs font-medium transition-colors",
              statusFilter === 'all' ? "bg-panda-black text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            )}
          >
            全部
          </button>
          {Object.entries(statusMap).map(([key, value]) => (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              className={clsx(
                "px-2.5 py-1 rounded-full text-xs font-medium transition-colors",
                statusFilter === key ? "bg-panda-black text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              )}
            >
              {value.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredOrders.map(order => (
          <OrderCard
            key={order.id}
            order={order}
            onDelete={() => handleDeleteOrder(order)}
            onStatusChange={(status) => updateOrderStatus(order.id, status)}
            onEdit={() => handleOpenModal(order)}
            onView={() => setViewingOrder(order)}
          />
        ))}
        {filteredOrders.length === 0 && (
          <div className="col-span-full py-16 flex flex-col items-center justify-center text-gray-400 card-pixel p-8">
            <div className="w-16 h-16 border-2 border-dashed border-gray-300 rounded-full flex items-center justify-center mb-3">
              <span className="text-2xl">📋</span>
            </div>
            <p className="text-sm">没有找到匹配的商单</p>
          </div>
        )}
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingOrderId ? "编辑商单" : "新建商单"}>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">商单标题</label>
              <input required type="text" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className="w-full px-3 py-2 border border-border rounded-lg outline-none focus:border-accent text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">合作品牌</label>
              <input
                required
                type="text"
                list="brand-options"
                value={formData.brandName}
                onChange={e => setFormData({...formData, brandName: e.target.value})}
                className="w-full px-3 py-2 border border-border rounded-lg outline-none focus:border-accent text-sm"
              />
              <datalist id="brand-options">
                {brands.map(brand => (
                  <option key={brand.id} value={brand.name} />
                ))}
              </datalist>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">合作类型</label>
              <select value={formData.type} onChange={e => setFormData({...formData, type: e.target.value as OrderType})} className="w-full px-3 py-2 border border-border rounded-lg outline-none focus:border-accent text-sm">
                <option value="paid">付费</option>
                <option value="product_exchange">置换</option>
                <option value="direct">直发</option>
              </select>
            </div>
            {editingOrderId && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">状态</label>
                <select value={formData.status} onChange={e => setFormData({...formData, status: e.target.value as OrderStatus})} className="w-full px-3 py-2 border border-border rounded-lg outline-none focus:border-accent text-sm">
                  <option value="in_progress">进行中</option>
                  <option value="completed">已完成</option>
                  <option value="cancelled">已取消</option>
                </select>
              </div>
            )}
            <div className={editingOrderId ? "" : "col-span-2"}>
              <label className="block text-xs font-medium text-gray-700 mb-1">金额 (¥)</label>
              <input type="number" value={formData.actualAmount} onChange={e => setFormData({...formData, actualAmount: e.target.value})} className="w-full px-3 py-2 border border-border rounded-lg outline-none focus:border-accent text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">发布平台</label>
            <input type="text" placeholder="小红书, 抖音" value={formData.platforms} onChange={e => setFormData({...formData, platforms: e.target.value})} className="w-full px-3 py-2 border border-border rounded-lg outline-none focus:border-accent text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">接单日期</label>
              <input type="date" value={formData.acceptDate} onChange={e => setFormData({...formData, acceptDate: e.target.value})} className="w-full px-3 py-2 border border-border rounded-lg outline-none focus:border-accent text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">交稿日期</label>
              <input type="date" value={formData.submitDate} onChange={e => setFormData({...formData, submitDate: e.target.value})} className="w-full px-3 py-2 border border-border rounded-lg outline-none focus:border-accent text-sm" />
            </div>
          </div>
          <div className="pt-3 flex justify-end gap-2">
            <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors text-sm">取消</button>
            <button type="submit" className="btn-sketch py-2 text-sm">{editingOrderId ? '保存' : '创建'}</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!viewingOrder} onClose={() => { setViewingOrder(null); setNewComment(''); setNewLinkInput(''); }} title="商单详情" width="max-w-lg">
        {viewingOrder && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-gray-500 text-xs block">商单号</span>
                <span className="font-medium">{viewingOrder.orderNo}</span>
              </div>
              <div>
                <span className="text-gray-500 text-xs block">状态</span>
                <span className={clsx("text-xs px-2 py-0.5 rounded-full font-medium inline-flex items-center gap-1 mt-1", statusMap[viewingOrder.status]?.color)}>
                  {statusMap[viewingOrder.status]?.icon} {statusMap[viewingOrder.status]?.label}
                </span>
              </div>
              <div className="col-span-2">
                <span className="text-gray-500 text-xs block">标题</span>
                <span className="font-medium">{viewingOrder.title}</span>
              </div>
              <div>
                <span className="text-gray-500 text-xs block">品牌</span>
                <span className="font-medium">{viewingOrder.brandName || '未知品牌'}</span>
              </div>
              <div>
                <span className="text-gray-500 text-xs block">类型</span>
                <span className="font-medium">{typeMap[viewingOrder.type]?.icon} {typeMap[viewingOrder.type]?.label}</span>
              </div>
              <div>
                <span className="text-gray-500 text-xs block">金额</span>
                <span className="font-medium text-success">¥{viewingOrder.actualAmount.toLocaleString()}</span>
              </div>
              <div>
                <span className="text-gray-500 text-xs block">平台</span>
                <span className="font-medium">{viewingOrder.platforms?.join(', ') || '-'}</span>
              </div>
            </div>

            {/* 评论区域 */}
            <div className="border-t border-border/50 pt-4">
              <div className="flex items-center gap-2 mb-3">
                <MessageSquare size={16} className="text-gray-500" />
                <span className="text-sm font-medium text-gray-700">沟通记录</span>
                <span className="text-xs text-gray-400">({comments.filter(c => c.orderId === viewingOrder.id).length})</span>
              </div>

              <div className="space-y-2 max-h-[200px] overflow-y-auto mb-3">
                {comments.filter(c => c.orderId === viewingOrder.id).length > 0 ? (
                  comments.filter(c => c.orderId === viewingOrder.id).map(comment => (
                    <div key={comment.id} className="bg-gray-50 rounded-lg p-2.5">
                      <p className="text-sm text-gray-700">{comment.content}</p>
                      <span className="text-[10px] text-gray-400 mt-1 block">{formatCommentDate(comment.createdAt)}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-gray-400 text-center py-4">暂无沟通记录</p>
                )}
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="添加沟通记录..."
                  value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddComment()}
                  className="flex-1 px-3 py-2 border border-border rounded-lg outline-none focus:border-accent text-sm"
                />
                <button
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
                  <span className="text-xs text-gray-400">({publishLinks.filter(l => l.orderId === viewingOrder.id).length})</span>
                </div>
                {publishLinks.filter(l => l.orderId === viewingOrder.id).length > 0 && (
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
                {publishLinks.filter(l => l.orderId === viewingOrder.id).length > 0 ? (
                  publishLinks.filter(l => l.orderId === viewingOrder.id).map(link => (
                    <div key={link.id} className="bg-gray-50 rounded-lg p-2.5 flex items-center gap-3 group">
                      <span className="text-lg">{getPlatformIcon(link.platform)}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-gray-600">{link.platform}</span>
                        </div>
                        <a 
                          href={link.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-xs text-blue-500 hover:underline truncate block"
                        >
                          {(link.url || '').length > 40 ? (link.url || '').substring(0, 40) + '...' : link.url || '-'}
                        </a>
                      </div>
                      <a 
                        href={link.url || '#'} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded transition-colors"
                        title="打开链接"
                      >
                        <ExternalLink size={14} />
                      </a>
                      <button
                        onClick={() => handleDeletePublishLink(link.id)}
                        className="p-1.5 text-gray-400 hover:text-danger hover:bg-danger/10 rounded transition-colors opacity-0 group-hover:opacity-100"
                        title="删除链接"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-gray-400 text-center py-4">暂无发布链接</p>
                )}
              </div>

              <div className="flex gap-2">
                <textarea
                  placeholder="粘贴链接，每行一个...&#10;支持格式：&#10;小红书：https://...&#10;https://douyin.com/...&#10;(自动识别平台)"
                  value={newLinkInput}
                  onChange={e => setNewLinkInput(e.target.value)}
                  className="flex-1 px-3 py-2 border border-border rounded-lg outline-none focus:border-accent text-sm resize-none"
                  rows={3}
                />
                <button
                  onClick={handleAddPublishLink}
                  disabled={!newLinkInput.trim()}
                  className="btn-sketch py-2 px-3 disabled:opacity-50 self-end"
                >
                  <Plus size={14} />
                </button>
              </div>
              <p className="text-[10px] text-gray-400 mt-1">支持多行批量输入，自动识别平台。格式：平台：链接 或直接粘贴链接</p>
            </div>

            <div className="pt-3 flex justify-end">
              <button onClick={() => { setViewingOrder(null); setNewComment(''); setNewLinkInput(''); }} className="btn-sketch py-2 px-4 text-sm">关闭</button>
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
              <li>支持 Excel (.xlsx, .xls) 和 CSV 格式</li>
              <li>第一行为标题行，必须包含"标题"列</li>
              <li>合作类型：付费、置换、直发</li>
              <li>状态：进行中、已完成、已取消</li>
            </ul>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={downloadTemplate}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm transition-colors"
            >
              <Download size={16} />
              下载模板
            </button>
          </div>

          <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-accent transition-colors">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileImport}
              className="hidden"
              id="file-import"
            />
            <label htmlFor="file-import" className="cursor-pointer">
              <FileSpreadsheet size={40} className="mx-auto text-gray-400 mb-3" />
              <p className="text-sm text-gray-600 mb-1">
                {importing ? '正在导入...' : '点击选择文件或拖拽文件到此处'}
              </p>
              <p className="text-xs text-gray-400">支持 .xlsx, .xls, .csv 格式</p>
            </label>
          </div>

          <div className="pt-4 flex justify-end gap-3">
            <button
              onClick={() => setIsImportModalOpen(false)}
              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-xl transition-colors text-sm"
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