import { useState, useEffect, useRef, useMemo } from 'react';
import { useStore, Asset } from '../store/useStore';
import { Search, Trash2, Upload, Pencil, X, Check, Package, Plus } from 'lucide-react';
import { clsx } from 'clsx';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import { ALL_MONTHS, ALL_YEARS, getAvailableYears, matchesYearMonth, monthOptions } from '../lib/dateFilter';

const getAssetFilterDate = (asset: Asset): string => asset.createdAt || asset.soldDate || '';

const createAssetInitialForm = {
  productName: '',
  brandName: '',
  productValue: '',
  saleStatus: 'keep' as 'keep' | 'sold',
  soldAmount: ''
};
const MANUAL_BRAND_VALUE = '__manual__';

export default function Assets() {
  const { assets, brands, fetchAssets, fetchBrands, addAsset, updateAsset, deleteAsset } = useStore();
  const { showToast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [brandFilter, setBrandFilter] = useState('all');
  const [yearFilter, setYearFilter] = useState(ALL_YEARS);
  const [monthFilter, setMonthFilter] = useState(ALL_MONTHS);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCustomBrand, setIsCustomBrand] = useState(false);
  const [createForm, setCreateForm] = useState(createAssetInitialForm);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [editForm, setEditForm] = useState({ productName: '', productValue: '', saleStatus: 'keep' as 'keep' | 'sold', soldAmount: '' });
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [imageAsset, setImageAsset] = useState<Asset | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; asset: Asset | null }>({ isOpen: false, asset: null });
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchAssets();
    fetchBrands();
  }, [fetchAssets, fetchBrands]);

  const availableYears = useMemo(() => getAvailableYears(assets.map(asset => getAssetFilterDate(asset))), [assets]);
  const brandOptions = useMemo(() => {
    const names = [
      ...assets.map(asset => asset.brandName),
      ...brands.map(brand => brand.name)
    ]
      .filter((name): name is string => Boolean(name?.trim()));
    return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b, 'zh-CN'));
  }, [assets, brands]);

  const filteredAssets = useMemo(() => {
    const searchLower = searchTerm.trim().toLowerCase();

    return assets.filter(asset => {
      const matchesSearch = !searchLower ||
        asset.productName.toLowerCase().includes(searchLower) ||
        (asset.brandName?.toLowerCase() || '').includes(searchLower) ||
        (asset.orderNo || '').toLowerCase().includes(searchLower);
      const matchesBrand = brandFilter === 'all' || asset.brandName === brandFilter;
      const matchesDate = matchesYearMonth(getAssetFilterDate(asset), yearFilter, monthFilter);

      return matchesSearch && matchesBrand && matchesDate;
    });
  }, [assets, searchTerm, brandFilter, yearFilter, monthFilter]);

  const handleEdit = (asset: Asset) => {
    setEditingAsset(asset);
    setEditForm({
      productName: asset.productName,
      productValue: asset.productValue.toString(),
      saleStatus: asset.saleStatus || 'keep',
      soldAmount: (asset.soldAmount || 0).toString()
    });
  };

  const handleSaveEdit = async () => {
    if (!editingAsset) return;
    try {
      await updateAsset(editingAsset.id, {
        productName: editForm.productName,
        productValue: Number(editForm.productValue) || 0,
        saleStatus: editForm.saleStatus,
        soldAmount: editForm.saleStatus === 'sold' ? (Number(editForm.soldAmount) || 0) : 0
      });
      showToast('资产已更新');
      setEditingAsset(null);
    } catch {
      showToast('更新失败', 'error');
    }
  };

  const openCreateModal = () => {
    setCreateForm(createAssetInitialForm);
    setIsCustomBrand(false);
    setIsCreateModalOpen(true);
  };

  const closeCreateModal = () => {
    setCreateForm(createAssetInitialForm);
    setIsCustomBrand(false);
    setIsCreateModalOpen(false);
  };

  const handleCreateAsset = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!createForm.productName.trim()) {
      showToast('请填写资产名称', 'warning');
      return;
    }

    try {
      await addAsset({
        productName: createForm.productName.trim(),
        brandName: createForm.brandName.trim(),
        productValue: Number(createForm.productValue) || 0,
        saleStatus: createForm.saleStatus,
        soldAmount: createForm.saleStatus === 'sold' ? (Number(createForm.soldAmount) || 0) : 0
      });
      showToast('资产已创建');
      closeCreateModal();
    } catch (error) {
      showToast(error instanceof Error ? error.message : '创建失败', 'error');
    }
  };

  const isEcard = (asset: Asset) => asset.productName.includes('E卡');

  const handleImageUpload = (asset: Asset) => {
    if (isEcard(asset)) return;
    setImageAsset(asset);
    setIsImageModalOpen(true);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !imageAsset) return;

    if (file.size > 5 * 1024 * 1024) {
      showToast('图片大小不能超过5MB', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        await updateAsset(imageAsset.id, { image: reader.result as string });
        showToast('图片上传成功');
        setIsImageModalOpen(false);
        setImageAsset(null);
      } catch {
        showToast('图片上传失败', 'error');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDelete = async () => {
    if (!deleteConfirm.asset) return;
    try {
      await deleteAsset(deleteConfirm.asset.id);
      showToast('资产已删除');
      setDeleteConfirm({ isOpen: false, asset: null });
    } catch {
      showToast('删除失败', 'error');
    }
  };

  const totalValue = filteredAssets.reduce((sum, a) => {
    if (a.saleStatus === 'sold') {
      return sum + (a.soldAmount || 0);
    }
    return sum + a.productValue;
  }, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-panda-black">资产库</h1>
          <p className="text-xs text-gray-500 mt-0.5">管理置换合作获得的产品资产</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="text-xs text-gray-500">总价值</span>
            <p className="text-lg font-bold text-success">¥{totalValue.toLocaleString()}</p>
          </div>
          <button
            onClick={openCreateModal}
            className="btn-sketch flex items-center gap-1 text-sm py-1.5 px-3"
          >
            <Plus size={14} />
            新建资产
          </button>
        </div>
      </div>

      <div className="card-sketch p-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-1">
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="搜索产品名称、品牌、商单号"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-gray-50 border-2 border-panda-black/10 focus:border-panda-black focus:bg-white rounded-lg outline-none transition-all text-xs"
            />
          </div>
          <div className="flex items-center gap-2">
            <select
              value={brandFilter}
              onChange={e => setBrandFilter(e.target.value)}
              className="h-8 bg-gray-50 border-2 border-panda-black/10 focus:border-panda-black focus:bg-white rounded-lg px-2 text-xs outline-none transition-all"
              title="按品牌筛选"
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
              title="按资产创建年份筛选"
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
              title="按资产创建月份筛选"
            >
              <option value={ALL_MONTHS}>全年</option>
              {monthOptions.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
        </div>
        <span className="text-xs text-gray-400">{filteredAssets.length} 件资产</span>
      </div>

      {filteredAssets.length === 0 ? (
        <div className="py-16 flex flex-col items-center justify-center text-gray-400 card-pixel p-8">
          <div className="w-16 h-16 border-2 border-dashed border-gray-300 rounded-full flex items-center justify-center mb-3">
            <Package size={28} />
          </div>
          <p className="text-sm">暂无资产</p>
          <p className="text-xs mt-1">完成置换商单会自动添加，也可以手动新建资产</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredAssets.map(asset => (
            <div
              key={asset.id}
              className="card-pixel p-4 bg-white rounded-2xl border-2 border-gray-100 hover:border-panda-black/20 hover:shadow-lg transition-all duration-300"
            >
              <div className="flex items-start gap-3">
                <div
                  className={clsx(
                    "w-20 h-20 rounded-xl flex-shrink-0 flex items-center justify-center overflow-hidden border-2",
                    isEcard(asset)
                      ? "border-red-200 bg-red-50"
                      : asset.image
                        ? "border-transparent cursor-pointer"
                        : "border-dashed border-gray-200 hover:border-panda-black/30 cursor-pointer"
                  )}
                  onClick={() => handleImageUpload(asset)}
                >
                  {isEcard(asset) ? (
                    <img src="/jd.png" alt="E卡" className="w-full h-full object-cover" />
                  ) : asset.image ? (
                    <img src={asset.image} alt={asset.productName} className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex flex-col items-center text-gray-400">
                      <Upload size={16} />
                      <span className="text-[9px] mt-0.5">上传图片</span>
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  {editingAsset?.id === asset.id ? (
                    <div className="space-y-1.5">
                      {isEcard(asset) ? (
                        <div className="px-2 py-1 text-sm font-medium text-gray-700 bg-gray-50 rounded-lg">{editForm.productName}</div>
                      ) : (
                        <input
                          type="text"
                          value={editForm.productName}
                          onChange={e => setEditForm({ ...editForm, productName: e.target.value })}
                          className="w-full px-2 py-1 text-sm border border-border rounded-lg outline-none focus:border-accent"
                        />
                      )}
                      <input
                        type="number"
                        value={editForm.productValue}
                        onChange={e => setEditForm({ ...editForm, productValue: e.target.value })}
                        className="w-full px-2 py-1 text-sm border border-border rounded-lg outline-none focus:border-accent"
                      />
                      <select
                        value={editForm.saleStatus}
                        onChange={e => setEditForm({ ...editForm, saleStatus: e.target.value as 'keep' | 'sold' })}
                        className="w-full px-2 py-1 text-sm border border-border rounded-lg outline-none focus:border-accent"
                      >
                        <option value="keep">自留</option>
                        <option value="sold">已出</option>
                      </select>
                      {editForm.saleStatus === 'sold' && (
                        <input
                          type="number"
                          value={editForm.soldAmount}
                          onChange={e => setEditForm({ ...editForm, soldAmount: e.target.value })}
                          placeholder="已出金额"
                          className="w-full px-2 py-1 text-sm border border-border rounded-lg outline-none focus:border-accent"
                        />
                      )}
                      <div className="flex gap-1">
                        <button onClick={handleSaveEdit} className="p-1 text-success hover:bg-green-50 rounded"><Check size={14} /></button>
                        <button onClick={() => setEditingAsset(null)} className="p-1 text-gray-400 hover:bg-gray-50 rounded"><X size={14} /></button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <h3 className="font-bold text-sm text-panda-black truncate">
                        {asset.productName}
                        {isEcard(asset) && (
                          <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 font-medium">E卡</span>
                        )}
                      </h3>
                      <p className="text-xs text-gray-500 mt-0.5">{asset.brandName || '未知品牌'}</p>
                      <p className="text-xs text-gray-400 font-mono mt-0.5">{asset.orderNo}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <p className="text-sm font-bold text-success">¥{asset.productValue.toLocaleString()}</p>
                        <span className={clsx(
                          "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                          asset.saleStatus === 'sold' ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"
                        )}>
                          {asset.saleStatus === 'sold' ? `已出 ¥${(asset.soldAmount || 0).toLocaleString()}` : '自留'}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-end gap-1 mt-3 pt-2 border-t border-gray-100">
                <button
                  onClick={() => handleEdit(asset)}
                  className="p-1.5 text-gray-400 hover:text-panda-black hover:bg-gray-100 rounded-lg transition-colors"
                  title="编辑"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => setDeleteConfirm({ isOpen: true, asset })}
                  className="p-1.5 text-gray-400 hover:text-danger hover:bg-red-50 rounded-lg transition-colors"
                  title="删除"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={isCreateModalOpen} onClose={closeCreateModal} title="新建资产">
        <form onSubmit={handleCreateAsset} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">资产名称</label>
              <input
                required
                type="text"
                value={createForm.productName}
                onChange={e => setCreateForm({ ...createForm, productName: e.target.value })}
                className="input-sketch"
                placeholder="产品名称、E卡等"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">品牌</label>
              <select
                value={isCustomBrand ? MANUAL_BRAND_VALUE : createForm.brandName}
                onChange={e => {
                  if (e.target.value === MANUAL_BRAND_VALUE) {
                    setIsCustomBrand(true);
                    setCreateForm({ ...createForm, brandName: '' });
                    return;
                  }
                  setIsCustomBrand(false);
                  setCreateForm({ ...createForm, brandName: e.target.value });
                }}
                className="input-sketch"
              >
                <option value="">不关联品牌</option>
                {brandOptions.map(brand => (
                  <option key={brand} value={brand}>{brand}</option>
                ))}
                <option value={MANUAL_BRAND_VALUE}>手动输入品牌</option>
              </select>
            </div>
          </div>
          {isCustomBrand && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">品牌名称</label>
              <input
                type="text"
                value={createForm.brandName}
                onChange={e => setCreateForm({ ...createForm, brandName: e.target.value })}
                className="input-sketch"
                placeholder="输入品牌名称"
              />
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">资产价值 (¥)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={createForm.productValue}
                onChange={e => setCreateForm({ ...createForm, productValue: e.target.value })}
                className="input-sketch"
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">状态</label>
              <select
                value={createForm.saleStatus}
                onChange={e => setCreateForm({ ...createForm, saleStatus: e.target.value as 'keep' | 'sold' })}
                className="input-sketch"
              >
                <option value="keep">自留</option>
                <option value="sold">已出</option>
              </select>
            </div>
          </div>
          {createForm.saleStatus === 'sold' && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">已出金额 (¥)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={createForm.soldAmount}
                onChange={e => setCreateForm({ ...createForm, soldAmount: e.target.value })}
                className="input-sketch"
                placeholder="实际售出金额"
              />
            </div>
          )}
          <div className="pt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(false)}
              className="btn-secondary py-2 px-4"
            >
              取消
            </button>
            <button type="submit" className="btn-sketch py-2 px-4">创建</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={isImageModalOpen} onClose={() => { setIsImageModalOpen(false); setImageAsset(null); }} title="上传产品图片">
        <div className="space-y-4">
          {imageAsset?.image && (
            <div className="flex justify-center">
              <img src={imageAsset.image} alt={imageAsset.productName} className="w-40 h-40 object-cover rounded-xl border-2 border-gray-200" />
            </div>
          )}
          <div
            className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-panda-black/30 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={24} className="mx-auto text-gray-400 mb-2" />
            <p className="text-sm text-gray-500">点击选择图片</p>
            <p className="text-xs text-gray-400 mt-1">支持 JPG、PNG，最大 5MB</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        onClose={() => setDeleteConfirm({ isOpen: false, asset: null })}
        onConfirm={handleDelete}
        title="删除资产"
        message={`确定要删除「${deleteConfirm.asset?.productName}」吗？此操作不可撤销。`}
      />
    </div>
  );
}
