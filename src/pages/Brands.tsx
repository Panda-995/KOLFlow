import { useState, useMemo, useEffect } from 'react';
import { useStore, Brand } from '../store/useStore';
import type { BrandContact } from '../types';
import {
  Search,
  Plus,
  Phone,
  Edit2,
  Trash2,
  User,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  X,
  MessageSquare
} from 'lucide-react';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import { clsx } from 'clsx';

export default function Brands() {
  const { brands, addBrand, updateBrand, deleteBrand, orders, payments, todos, assets, fetchBrands, fetchTodos, fetchOrders, fetchPayments, fetchAssets } = useStore();
  const { showToast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [industryFilter, setIndustryFilter] = useState('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBrandId, setEditingBrandId] = useState<string | null>(null);
  const [viewingBrandTodos, setViewingBrandTodos] = useState<Brand | null>(null);
  const [viewingBrandOrders, setViewingBrandOrders] = useState<Brand | null>(null);

  // 删除确认弹窗状态
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; brand: Brand | null }>({
    isOpen: false,
    brand: null
  });

  useEffect(() => {
    fetchBrands();
    fetchTodos();
    fetchOrders();
    fetchPayments();
    fetchAssets();
  }, [fetchBrands, fetchTodos, fetchOrders, fetchPayments, fetchAssets]);
  const [formData, setFormData] = useState({
    name: '',
    industry: '',
    contact: '',
    phone: '',
    contacts: [] as BrandContact[]
  });

  const allIndustries = useMemo(() => {
    const industries = new Set<string>();
    brands.forEach(b => {
      if (b.industry) industries.add(b.industry);
    });
    return Array.from(industries);
  }, [brands]);

  const filteredBrands = useMemo(() => {
    return brands.filter(brand => {
      const contactsSearch = (brand.contacts || []).some(c =>
        (c.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.phone || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.note || '').toLowerCase().includes(searchTerm.toLowerCase())
      );
      const matchesSearch = brand.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (brand.contact || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                          contactsSearch;
      const matchesIndustry = industryFilter === 'all' ? true : brand.industry === industryFilter;
      return matchesSearch && matchesIndustry;
    });
  }, [brands, searchTerm, industryFilter]);

  const brandStats = useMemo(() => {
    const stats: Record<string, {
      totalOrders: number,
      totalIncome: number,
      avgOrderValue: number,
      lastOrderDate: string | null
    }> = {};

    brands.forEach(b => {
      stats[b.name] = { totalOrders: 0, totalIncome: 0, avgOrderValue: 0, lastOrderDate: null };
    });

    // 统计商单数量和最后商单日期
    orders.forEach(o => {
      if (o.brandName && stats[o.brandName]) {
        stats[o.brandName].totalOrders += 1;
        if (!stats[o.brandName].lastOrderDate || (o.acceptDate && o.acceptDate > stats[o.brandName].lastOrderDate!)) {
          stats[o.brandName].lastOrderDate = o.acceptDate;
        }
      }
    });

    // 统计收益 - 从已结算的支付记录中计算
    payments.forEach(p => {
      if (p.type === 'settled' && p.brand && stats[p.brand]) {
        stats[p.brand].totalIncome += p.amount;
      }
    });

    // 统计已出资产收益
    assets.forEach(a => {
      if (a.saleStatus === 'sold' && a.soldAmount > 0 && a.brandName && stats[a.brandName]) {
        stats[a.brandName].totalIncome += a.soldAmount;
      }
    });

    // 计算平均客单价
    Object.keys(stats).forEach(name => {
      if (stats[name].totalOrders > 0) {
        stats[name].avgOrderValue = stats[name].totalIncome / stats[name].totalOrders;
      }
    });

    return stats;
  }, [brands, orders, payments, assets]);

  const handleOpenModal = (brand?: Brand) => {
    if (brand) {
      setEditingBrandId(brand.id);
      setFormData({
        name: brand.name,
        industry: brand.industry || '',
        contact: brand.contact || '',
        phone: brand.phone || '',
        contacts: brand.contacts || []
      });
    } else {
      setEditingBrandId(null);
      setFormData({ name: '', industry: '', contact: '', phone: '', contacts: [] });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingBrandId) {
        await updateBrand(editingBrandId, formData);
        showToast('品牌信息已更新', 'success');
      } else {
        await addBrand(formData);
        showToast('新品牌已添加', 'success');
      }
      setIsModalOpen(false);
    } catch (error) {
      showToast('操作失败，请重试', 'error');
    }
  };

  const handleDelete = (brand: Brand) => {
    setDeleteConfirm({ isOpen: true, brand });
  };

  const confirmDeleteBrand = async () => {
    if (deleteConfirm.brand) {
      try {
        await deleteBrand(deleteConfirm.brand.id);
        showToast('品牌已删除', 'success');
      } catch (error) {
        showToast('删除失败', 'error');
        throw error;
      }
    }
  };

  const handleDeleteIndustry = async (industry: string) => {
    if (industry === '其他') return;
    if (window.confirm(`确定要删除行业分类 "${industry}" 吗？该行业下的品牌将被归类为 "其他"。`)) {
      try {
        const brandsToUpdate = brands.filter(b => b.industry === industry);
        for (const brand of brandsToUpdate) {
          await updateBrand(brand.id, { ...brand, industry: '其他' });
        }
        showToast('行业分类已删除', 'success');
        if (industryFilter === industry) setIndustryFilter('all');
      } catch (error) {
        showToast('删除失败', 'error');
      }
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-7xl mx-auto pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-panda-black">品牌/客户管理</h1>
          <p className="text-gray-500 text-sm mt-1">维护你的品牌资源库与合作历史</p>
        </div>
        <button onClick={() => handleOpenModal()} className="btn-sketch flex items-center justify-center gap-2">
          <Plus size={18} />
          <span>添加新品牌</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Filters Sidebar */}
        <div className="lg:col-span-1 space-y-6">
          <div className="card-sketch p-5 space-y-6">
            <div>
              <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">搜索</h3>
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input 
                  type="text" 
                  placeholder="品牌名/联系人..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 bg-gray-50 border border-transparent focus:border-accent focus:bg-white rounded-xl outline-none transition-all text-sm"
                />
              </div>
            </div>

            <div>
              <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">行业分类</h3>
              <div className="space-y-1">
                <button
                  onClick={() => setIndustryFilter('all')}
                  className={clsx(
                    "w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm font-medium transition-all",
                    industryFilter === 'all' ? "bg-panda-black text-white" : "text-gray-600 hover:bg-gray-100"
                  )}
                >
                  <span>全部行业</span>
                  <span className={clsx("px-2 py-0.5 rounded-full text-[10px]", industryFilter === 'all' ? "bg-white/20" : "bg-gray-100")}>
                    {brands.length}
                  </span>
                </button>
                {allIndustries.map(ind => {
                  const count = brands.filter(b => b.industry === ind).length;
                  const isDefault = ['美妆护肤', '数码科技', '生活家居', '服饰穿搭', '美食饮品', '母婴宠物', '教育培训', '其他'].includes(ind);
                  
                  return (
                    <div key={ind} className="group/item relative">
                      <button
                        onClick={() => setIndustryFilter(ind)}
                        className={clsx(
                          "w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm font-medium transition-all pr-8",
                          industryFilter === ind ? "bg-panda-black text-white" : "text-gray-600 hover:bg-gray-100"
                        )}
                      >
                        <span className="truncate">{ind}</span>
                        <span className={clsx("px-2 py-0.5 rounded-full text-[10px]", industryFilter === ind ? "bg-white/20" : "bg-gray-100")}>
                          {count}
                        </span>
                      </button>
                      {!isDefault && (
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteIndustry(ind);
                          }}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-danger opacity-0 group-hover/item:opacity-100 transition-all"
                          title="删除分类"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="card-sketch p-5 bg-accent/5 border-accent/10">
            <div className="flex items-center gap-2 text-accent mb-2">
              <TrendingUp size={18} />
              <h3 className="font-bold">合作概览</h3>
            </div>
            <div className="space-y-3 mt-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">平均客单价</span>
                <span className="font-bold text-panda-black">
                  ¥{(() => {
                    const totalIncome = Object.values(brandStats).reduce((acc, curr) => acc + curr.totalIncome, 0);
                    const totalOrders = Object.values(brandStats).reduce((acc, curr) => acc + curr.totalOrders, 0);
                    return totalOrders > 0 ? (totalIncome / totalOrders).toFixed(0) : '0';
                  })()}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">最高收益品牌</span>
                <span className="font-bold text-panda-black truncate max-w-[100px]">
                  {Object.entries(brandStats).sort((a, b) => b[1].totalIncome - a[1].totalIncome)[0]?.[0] || '-'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Brands Grid */}
        <div className="lg:col-span-3">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredBrands.map(brand => {
              const stats = brandStats[brand.name] || { totalOrders: 0, totalIncome: 0, avgOrderValue: 0, lastOrderDate: null };

              return (
                <div key={brand.id} className="card-sketch p-3 group relative bg-white">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-panda-black text-white flex items-center justify-center font-bold text-sm">
                        {brand.name.charAt(0)}
                      </div>
                      <div>
                        <h3 className="font-bold text-sm text-panda-black truncate">{brand.name}</h3>
                        <span className="text-[10px] text-gray-400">{brand.industry || '未分类'}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => setViewingBrandTodos(brand)}
                        className="p-1 text-gray-400 hover:text-success hover:bg-success/10 rounded transition-colors"
                        title="查看关联任务"
                      >
                        <CheckCircle2 size={12} />
                      </button>
                      <button
                        onClick={() => setViewingBrandOrders(brand)}
                        className="p-1 text-gray-400 hover:text-accent hover:bg-accent/10 rounded transition-colors"
                        title="查看关联商单"
                      >
                        <Eye size={12} />
                      </button>
                      <button onClick={() => handleOpenModal(brand)} className="p-1 text-gray-400 hover:text-panda-black hover:bg-gray-100 rounded transition-colors">
                        <Edit2 size={12} />
                      </button>
                      <button onClick={() => handleDelete(brand)} className="p-1 text-gray-400 hover:text-danger hover:bg-danger/10 rounded transition-colors">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5 mb-2">
                    {(brand.contacts && brand.contacts.length > 0 ? brand.contacts : (brand.contact || brand.phone ? [{ id: '0', name: brand.contact || '', phone: brand.phone || '', note: '' }] : [])).map((c, idx) => (
                      <div key={c.id || idx} className="flex items-center gap-1.5 text-xs">
                        <User size={10} className="text-gray-400 flex-shrink-0" />
                        <span className="font-medium truncate">{c.name || '-'}</span>
                        {c.phone && <span className="text-gray-400 truncate">{c.phone}</span>}
                        {c.note && (
                          <span className="text-gray-400 flex items-center gap-0.5" title={c.note}>
                            <MessageSquare size={9} />
                          </span>
                        )}
                      </div>
                    ))}
                    {(!brand.contacts || brand.contacts.length === 0) && !brand.contact && !brand.phone && (
                      <div className="flex items-center gap-1.5 text-xs text-gray-400">
                        <User size={10} />
                        <span>暂无联系人</span>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/50 text-xs">
                    <div>
                      <span className="text-gray-400 text-[10px] block">商单</span>
                      <span className="font-bold text-panda-black">{stats.totalOrders} 单</span>
                    </div>
                    <div>
                      <span className="text-gray-400 text-[10px] block">收益</span>
                      <span className="font-bold text-success">¥{stats.totalIncome.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              );
            })}

            {filteredBrands.length === 0 && (
              <div className="col-span-full py-16 flex flex-col items-center justify-center text-gray-400 card-sketch">
                <AlertCircle size={32} className="text-gray-200 mb-2" />
                <p className="text-sm">未找到品牌</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingBrandId ? "编辑品牌信息" : "添加新品牌"}>
        <form onSubmit={handleSubmit} className="space-y-5 p-1">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-sm font-bold text-gray-700 mb-2">品牌名称</label>
              <input 
                required 
                type="text" 
                value={formData.name} 
                onChange={e => setFormData({...formData, name: e.target.value})} 
                placeholder="例如: 完美日记"
                className="w-full px-4 py-2.5 border border-border rounded-xl outline-none focus:border-accent transition-all" 
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-sm font-bold text-gray-700 mb-2">所属行业</label>
              <div className="relative">
                <input 
                  type="text" 
                  list="industry-list"
                  value={formData.industry} 
                  onChange={e => setFormData({...formData, industry: e.target.value})} 
                  placeholder="选择或输入行业"
                  className="w-full px-4 py-2.5 border border-border rounded-xl outline-none focus:border-accent transition-all bg-white"
                />
                <datalist id="industry-list">
                  {allIndustries.map(ind => <option key={ind} value={ind} />)}
                </datalist>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-border/50 pb-2">
              <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">联系人信息</h3>
              <button
                type="button"
                onClick={() => setFormData({
                  ...formData,
                  contacts: [...formData.contacts, { id: crypto.randomUUID(), name: '', phone: '', note: '' }]
                })}
                className="text-xs text-accent hover:text-accent/80 font-medium flex items-center gap-1"
              >
                <Plus size={12} />
                添加联系人
              </button>
            </div>
            {formData.contacts.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">暂无联系人，点击上方按钮添加</p>
            )}
            {formData.contacts.map((contact, index) => (
              <div key={contact.id} className="p-3 bg-gray-50 rounded-xl border border-border/50 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-500">联系人 {index + 1}</span>
                  <button
                    type="button"
                    onClick={() => setFormData({
                      ...formData,
                      contacts: formData.contacts.filter(c => c.id !== contact.id)
                    })}
                    className="p-0.5 text-gray-400 hover:text-danger rounded transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">姓名</label>
                    <div className="relative">
                      <User size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        value={contact.name}
                        onChange={e => {
                          const newContacts = [...formData.contacts];
                          newContacts[index] = { ...newContacts[index], name: e.target.value };
                          setFormData({ ...formData, contacts: newContacts });
                        }}
                        placeholder="姓名"
                        className="w-full pl-8 pr-3 py-2 border border-border rounded-lg outline-none focus:border-accent transition-all text-sm"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">电话</label>
                    <div className="relative">
                      <Phone size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        value={contact.phone}
                        onChange={e => {
                          const newContacts = [...formData.contacts];
                          newContacts[index] = { ...newContacts[index], phone: e.target.value };
                          setFormData({ ...formData, contacts: newContacts });
                        }}
                        placeholder="手机号/微信"
                        className="w-full pl-8 pr-3 py-2 border border-border rounded-lg outline-none focus:border-accent transition-all text-sm"
                      />
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">备注</label>
                  <div className="relative">
                    <MessageSquare size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
                    <input
                      type="text"
                      value={contact.note}
                      onChange={e => {
                        const newContacts = [...formData.contacts];
                        newContacts[index] = { ...newContacts[index], note: e.target.value };
                        setFormData({ ...formData, contacts: newContacts });
                      }}
                      placeholder="如：负责商务对接、周一联系等"
                      className="w-full pl-8 pr-3 py-2 border border-border rounded-lg outline-none focus:border-accent transition-all text-sm"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="pt-6 flex justify-end gap-3">
            <button type="button" onClick={() => setIsModalOpen(false)} className="px-6 py-2.5 text-gray-600 hover:bg-gray-100 rounded-2xl transition-all font-bold">取消</button>
            <button type="submit" className="btn-sketch px-8 py-2.5">
              {editingBrandId ? "保存修改" : "确认添加"}
            </button>
          </div>
        </form>
      </Modal>
      <Modal 
        isOpen={!!viewingBrandTodos} 
        onClose={() => setViewingBrandTodos(null)} 
        title={`${viewingBrandTodos?.name} - 关联任务`}
      >
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
          {viewingBrandTodos && todos.filter(t => t.brandId === viewingBrandTodos.id || t.category === viewingBrandTodos.name).length > 0 ? (
            todos.filter(t => t.brandId === viewingBrandTodos.id || t.category === viewingBrandTodos.name).map(todo => (
              <div key={todo.id} className="p-3 bg-gray-50 rounded-xl border border-border/50 flex items-start gap-3">
                <div className={clsx(
                  "mt-1 w-5 h-5 rounded flex items-center justify-center flex-shrink-0",
                  todo.completed ? "bg-success text-white" : "bg-white border border-gray-300 text-transparent"
                )}>
                  <CheckCircle2 size={14} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={clsx("text-sm font-medium", todo.completed && "line-through text-gray-400")}>
                    {todo.content}
                  </p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-[10px] text-gray-400 flex items-center gap-1">
                      <Clock size={10} />
                      {todo.dueDate || '无日期'}
                    </span>
                    {todo.orderNo && (
                      <span className="text-[10px] text-accent font-bold">
                        #{todo.orderNo}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="py-10 text-center text-gray-400">
              <AlertCircle size={32} className="mx-auto mb-2 opacity-20" />
              <p>该品牌暂无关联任务</p>
            </div>
          )}
        </div>
        <div className="mt-6 flex justify-end">
          <button onClick={() => setViewingBrandTodos(null)} className="btn-primary py-2 px-6">关闭</button>
        </div>
      </Modal>
      <Modal
        isOpen={!!viewingBrandOrders}
        onClose={() => setViewingBrandOrders(null)}
        title={`${viewingBrandOrders?.name} - 关联商单`}
      >
        <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-2">
          {viewingBrandOrders && orders.filter(o => o.brandName === viewingBrandOrders.name).length > 0 ? (
            orders.filter(o => o.brandName === viewingBrandOrders.name).map(order => (
              <div key={order.id} className="p-2.5 bg-gray-50 rounded-lg border border-border/50 hover:bg-gray-100 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <FileText size={14} className="text-accent flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-panda-black truncate">{order.title}</p>
                      <span className="text-[10px] text-gray-400">{order.orderNo}</span>
                    </div>
                  </div>
                  <span className={clsx(
                    "px-1.5 py-0.5 rounded text-[9px] font-medium flex-shrink-0",
                    order.status === 'completed' ? "bg-success/10 text-success" :
                    order.status === 'cancelled' ? "bg-danger/10 text-danger" :
                    "bg-accent/10 text-accent"
                  )}>
                    {order.status === 'completed' ? '完成' : order.status === 'cancelled' ? '取消' : '进行中'}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-1.5 text-[10px]">
                  <span className="text-gray-500">
                    {order.type === 'paid' ? '付费' : order.type === 'product_exchange' ? '置换' : '直发'}
                  </span>
                  <span className="font-bold text-success">¥{order.actualAmount.toLocaleString()}</span>
                  {order.submitDate && <span className="text-gray-400">{order.submitDate}</span>}
                </div>
              </div>
            ))
          ) : (
            <div className="py-8 text-center text-gray-400">
              <AlertCircle size={24} className="mx-auto mb-2 opacity-20" />
              <p className="text-xs">该品牌暂无关联商单</p>
            </div>
          )}
        </div>
        <div className="mt-4 flex justify-end">
          <button onClick={() => setViewingBrandOrders(null)} className="btn-primary py-1.5 px-4 text-sm">关闭</button>
        </div>
      </Modal>

      {/* 删除确认弹窗 */}
      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        onClose={() => setDeleteConfirm({ isOpen: false, brand: null })}
        onConfirm={confirmDeleteBrand}
        title="确认删除品牌"
        message={`确定要删除品牌「${deleteConfirm.brand?.name}」吗？此操作不可恢复，关联的商单和待办将失去品牌关联。`}
        confirmText="确认删除"
      />
    </div>
  );
}
