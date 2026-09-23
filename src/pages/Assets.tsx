import { useState, useEffect, useRef, useMemo } from 'react';
import { useStore, Asset } from '../store/useStore';
import { Search, Trash2, Upload, Pencil, X, Check, Package, Plus } from 'lucide-react';
import { clsx } from 'clsx';
import Select from '../components/common/Select';
import { sumMoney } from '../lib/money';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import { ALL_MONTHS, ALL_YEARS, getAvailableYears, matchesYearMonth, monthOptions } from '../lib/dateFilter';
import { authFetch } from '../lib/api';
import { useProgressiveList } from '../hooks/useProgressiveList';

const getAssetFilterDate = (asset: Asset): string => asset.createdAt || asset.soldDate || '';
const assetImageCache = new Map<string, string>();
const assetImageRequests = new Map<string, Promise<string | null>>();

const loadAssetImage = async (assetId: string): Promise<string | null> => {
  const cached = assetImageCache.get(assetId);
  if (cached) return cached;

  const pending = assetImageRequests.get(assetId);
  if (pending) return pending;

  const request = (async () => {
    try {
      const response = await authFetch(`/api/assets/${assetId}/image`);
      if (!response.ok) return null;
      const data = await response.json() as { image?: string };
      if (!data.image) return null;
      assetImageCache.set(assetId, data.image);
      return data.image;
    } catch {
      return null;
    } finally {
      assetImageRequests.delete(assetId);
    }
  })();

  assetImageRequests.set(assetId, request);
  return request;
};

const readBlobAsDataUrl = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result as string);
  reader.onerror = () => reject(new Error('读取图片失败'));
  reader.readAsDataURL(blob);
});

const optimizeAssetImage = async (file: File): Promise<string> => {
  const supportedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
  if (!supportedTypes.has(file.type)) {
    throw new Error('仅支持 JPG、PNG 或 WebP 图片');
  }

  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const nextImage = new Image();
      nextImage.onload = () => resolve(nextImage);
      nextImage.onerror = () => reject(new Error('无法解析图片'));
      nextImage.src = objectUrl;
    });

    const maxDimension = 1600;
    const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    if (!context) throw new Error('图片处理失败');
    context.drawImage(image, 0, 0, width, height);

    const optimizedBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        blob => blob ? resolve(blob) : reject(new Error('图片压缩失败')),
        'image/webp',
        0.82
      );
    });

    return readBlobAsDataUrl(optimizedBlob);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

function AssetThumbnail({ asset, onClick }: { asset: Asset; onClick: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [imageSource, setImageSource] = useState(() => asset.image || assetImageCache.get(asset.id) || '');
  const hasImage = Boolean(asset.image || asset.hasImage);

  useEffect(() => {
    if (asset.image) {
      assetImageCache.set(asset.id, asset.image);
      setImageSource(asset.image);
      return;
    }

    setImageSource(assetImageCache.get(asset.id) || '');
  }, [asset.id, asset.image]);

  useEffect(() => {
    if (!hasImage || imageSource) return;

    let cancelled = false;
    const load = async () => {
      const image = await loadAssetImage(asset.id);
      if (!cancelled && image) setImageSource(image);
    };

    if (!('IntersectionObserver' in window)) {
      void load();
      return () => {
        cancelled = true;
      };
    }

    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      void load();
    }, { rootMargin: '240px' });

    if (containerRef.current) observer.observe(containerRef.current);

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [asset.id, hasImage, imageSource]);

  return (
    <div
      ref={containerRef}
      className={clsx(
        "w-20 h-20 rounded-xl flex-shrink-0 flex items-center justify-center overflow-hidden border-2",
        hasImage
          ? "border-transparent cursor-pointer bg-bg-tertiary"
          : "border-dashed border-gray-200 hover:border-panda-black/30 cursor-pointer"
      )}
      role="button"
      tabIndex={0}
      aria-label={hasImage ? `查看资产图片: ${asset.productName}` : `上传资产图片: ${asset.productName}`}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      onClick={onClick}
    >
      {imageSource ? (
        <img
          src={imageSource}
          alt={asset.productName}
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover"
        />
      ) : hasImage ? (
        <div className="w-full h-full animate-pulse bg-gray-200" aria-label="图片加载中" />
      ) : (
        <div className="flex flex-col items-center text-gray-600">
          <Upload size={16} />
          <span className="text-[9px] mt-0.5">上传图片</span>
        </div>
      )}
    </div>
  );
}

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        await Promise.all([fetchAssets(), fetchBrands()]);
      } catch (e) {
        if (!cancelled) setError('加载资产数据失败，请刷新重试');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
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

  const handleImageUpload = async (asset: Asset) => {
    if (isEcard(asset)) return;
    const cachedImage = asset.image || assetImageCache.get(asset.id);
    setImageAsset(cachedImage ? { ...asset, image: cachedImage } : asset);
    setIsImageModalOpen(true);

    if (!cachedImage && asset.hasImage) {
      const image = await loadAssetImage(asset.id);
      if (image) {
        setImageAsset(current => current?.id === asset.id ? { ...current, image } : current);
      }
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !imageAsset) return;

    if (file.size > 5 * 1024 * 1024) {
      showToast('图片大小不能超过5MB', 'error');
      e.target.value = '';
      return;
    }

    try {
      const optimizedImage = await optimizeAssetImage(file);
      await updateAsset(imageAsset.id, { image: optimizedImage });
      assetImageCache.set(imageAsset.id, optimizedImage);
      showToast('图片已压缩并上传');
      setIsImageModalOpen(false);
      setImageAsset(null);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '图片上传失败', 'error');
    } finally {
      e.target.value = '';
    }
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

  // 按分累加：已售出取成交价，其余取估值
  const totalValue = sumMoney(filteredAssets, a => (a.saleStatus === 'sold' ? (a.soldAmount || 0) : a.productValue));

  // 渐进渲染：数据全量加载（统计需要），但列表只渲染前若干条
  const assetsView = useProgressiveList(
    filteredAssets,
    undefined,
    `${searchTerm}|${brandFilter}|${yearFilter}|${monthFilter}`,
  );


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

      <div className="card-sketch p-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-panda-white">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-1">
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
            <input
              type="text"
              aria-label="搜索资产" placeholder="搜索产品名称、品牌、商单号"
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
              aria-label="按资产创建年份筛选"
              options={[{ value: ALL_YEARS, label: '全部年份' }, ...availableYears.map(year => ({ value: year, label: `${year}年` }))]}
            />
            <Select
              value={monthFilter}
              onChange={setMonthFilter}
              size="sm"
              className="w-24 flex-shrink-0"
              aria-label="按资产创建月份筛选"
              options={[{ value: ALL_MONTHS, label: '全年' }, ...monthOptions.map(option => ({ value: option.value, label: option.label }))]}
            />
          </div>
        </div>
        <span className="text-xs text-gray-500">{filteredAssets.length} 件资产</span>
      </div>

      {loading ? (
        <div className="py-16 flex flex-col items-center justify-center text-gray-600">
          <div className="w-8 h-8 border-2 border-gray-300 border-t-panda-black rounded-full animate-spin mb-3" />
          <p className="text-sm">正在加载资产数据...</p>
        </div>
      ) : error ? (
        <div className="py-16 flex flex-col items-center justify-center text-gray-600 card-pixel p-8">
          <div className="w-16 h-16 border-2 border-red-200 rounded-full flex items-center justify-center mb-3 bg-red-50">
            <Package size={28} className="text-red-400" />
          </div>
          <p className="text-sm text-red-500">{error}</p>
          <button
            onClick={() => { setLoading(true); setError(null); Promise.all([fetchAssets(), fetchBrands()]).then(() => setLoading(false)).catch(() => { setError('加载资产数据失败，请刷新重试'); setLoading(false); }); }}
            className="mt-3 text-xs text-panda-black underline hover:no-underline"
          >
            点击重试
          </button>
        </div>
      ) : filteredAssets.length === 0 ? (
        <div className="py-16 flex flex-col items-center justify-center text-gray-600 card-pixel p-8">
          <div className="w-16 h-16 border-2 border-dashed border-gray-300 rounded-full flex items-center justify-center mb-3">
            <Package size={28} />
          </div>
          <p className="text-sm">暂无资产</p>
          <p className="text-xs mt-1">完成置换商单会自动添加，也可以手动新建资产</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {assetsView.visibleItems.map(asset => (
            <div
              key={asset.id}
              className="card-pixel p-4 bg-panda-white rounded-2xl border-2 border-gray-100 hover:border-panda-black/20 transition-all duration-300"
            >
              <div className="flex items-start gap-3">
                {isEcard(asset) ? (
                  <div className="w-20 h-20 rounded-xl flex-shrink-0 overflow-hidden border-2 border-red-200 bg-red-50">
                    <img src="/jd.png" alt="E卡" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <AssetThumbnail asset={asset} onClick={() => { void handleImageUpload(asset); }} />
                )}
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
                          className="w-full form-control form-control-xs"
                        />
                      )}
                      <input
                        type="number"
                        value={editForm.productValue}
                        onChange={e => setEditForm({ ...editForm, productValue: e.target.value })}
                        className="w-full form-control form-control-xs"
                      />
                      <Select
                        value={editForm.saleStatus}
                        onChange={value => setEditForm({ ...editForm, saleStatus: value as 'keep' | 'sold' })}
                        size="xs"
                        className="w-full"
                        aria-label="资产状态"
                        options={[{ value: 'keep', label: '自留' }, { value: 'sold', label: '已出' }]}
                      />
                      {editForm.saleStatus === 'sold' && (
                        <input
                          type="number"
                          value={editForm.soldAmount}
                          onChange={e => setEditForm({ ...editForm, soldAmount: e.target.value })}
                          placeholder="已出金额"
                          className="w-full form-control form-control-xs"
                        />
                      )}
                      <div className="flex gap-1">
                        <button onClick={handleSaveEdit} className="p-1 text-success hover:bg-green-50 rounded"><Check size={14} /></button>
                        <button onClick={() => setEditingAsset(null)} className="p-1 text-gray-600 hover:bg-panda-black/5 rounded"><X size={14} /></button>
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
                      <p className="text-xs text-gray-500 font-mono mt-0.5">{asset.orderNo}</p>
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
                  className="p-1.5 text-gray-600 hover:text-panda-black hover:bg-panda-black/10 rounded-lg transition-colors"
                  title="编辑"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => setDeleteConfirm({ isOpen: true, asset })}
                  className="p-1.5 text-gray-600 hover:text-danger hover:bg-red-50 rounded-lg transition-colors"
                  title="删除"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}

          {assetsView.windowed && (
              <div className="flex flex-col items-center gap-1 py-4">
                {assetsView.hasMore && (
                  <button type="button" onClick={assetsView.loadMore} className="btn-secondary text-sm">
                    加载更多
                  </button>
                )}
                <span className="text-xs text-gray-500">
                  已显示 {assetsView.visibleCount} / {assetsView.total} 条
                </span>
              </div>
            )}
        </div>
      )}

      <Modal isOpen={isCreateModalOpen} onClose={closeCreateModal} title="新建资产">
        <form onSubmit={handleCreateAsset} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="asset-product-name" className="block text-xs font-medium text-gray-700 mb-1">资产名称</label>
              <input
                id="asset-product-name"
                required
                type="text"
                value={createForm.productName}
                onChange={e => setCreateForm({ ...createForm, productName: e.target.value })}
                className="w-full form-control"
                placeholder="产品名称、E卡等"
              />
            </div>
            <div>
              <label htmlFor="asset-brand" className="block text-xs font-medium text-gray-700 mb-1">品牌</label>
              <Select
                id="asset-brand"
                value={isCustomBrand ? MANUAL_BRAND_VALUE : createForm.brandName}
                onChange={value => {
                  if (value === MANUAL_BRAND_VALUE) {
                    setIsCustomBrand(true);
                    setCreateForm({ ...createForm, brandName: '' });
                    return;
                  }
                  setIsCustomBrand(false);
                  setCreateForm({ ...createForm, brandName: value });
                }}
                className="w-full"
                options={[
                  { value: '', label: '不关联品牌' },
                  ...brandOptions.map(brand => ({ value: brand, label: brand })),
                  { value: MANUAL_BRAND_VALUE, label: '手动输入品牌' },
                ]}
              />
            </div>
          </div>
          {isCustomBrand && (
            <div>
              <label htmlFor="asset-custom-brand" className="block text-xs font-medium text-gray-700 mb-1">品牌名称</label>
              <input
                id="asset-custom-brand"
                type="text"
                value={createForm.brandName}
                onChange={e => setCreateForm({ ...createForm, brandName: e.target.value })}
                className="w-full form-control"
                placeholder="输入品牌名称"
              />
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="asset-product-value" className="block text-xs font-medium text-gray-700 mb-1">资产价值 (¥)</label>
              <input
                id="asset-product-value"
                type="number"
                min="0"
                step="0.01"
                value={createForm.productValue}
                onChange={e => setCreateForm({ ...createForm, productValue: e.target.value })}
                className="w-full form-control"
                placeholder="0"
              />
            </div>
            <div>
              <label htmlFor="asset-sale-status" className="block text-xs font-medium text-gray-700 mb-1">状态</label>
              <Select
                id="asset-sale-status"
                value={createForm.saleStatus}
                onChange={value => setCreateForm({ ...createForm, saleStatus: value as 'keep' | 'sold' })}
                className="w-full"
                options={[{ value: 'keep', label: '自留' }, { value: 'sold', label: '已出' }]}
              />
            </div>
          </div>
          {createForm.saleStatus === 'sold' && (
            <div>
              <label htmlFor="asset-sold-amount" className="block text-xs font-medium text-gray-700 mb-1">已出金额 (¥)</label>
              <input
                id="asset-sold-amount"
                type="number"
                min="0"
                step="0.01"
                value={createForm.soldAmount}
                onChange={e => setCreateForm({ ...createForm, soldAmount: e.target.value })}
                className="w-full form-control"
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
            <Upload size={24} className="mx-auto text-gray-600 mb-2" />
            <p className="text-sm text-gray-500">点击选择图片</p>
            <p className="text-xs text-gray-500 mt-1">支持 JPG、PNG、WebP，最大 5MB；上传时自动压缩</p>
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
