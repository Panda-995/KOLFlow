import { useMemo, useState } from 'react';
import { Layers3, Pencil, Plus, Rocket, Trash2 } from 'lucide-react';
import Modal from '../Modal';
import ConfirmDialog from '../ConfirmDialog';
import { useToast } from '../Toast';
import { useStore, type OrderTemplate, type OrderType } from '../../store/useStore';
import { ORDER_TYPE_MAP } from '../../constants/orders';

type TemplateForm = {
  name: string;
  title: string;
  brandName: string;
  type: OrderType;
  actualAmount: string;
  platforms: string;
  productName: string;
  productValue: string;
};

const EMPTY_FORM: TemplateForm = {
  name: '',
  title: '',
  brandName: '',
  type: 'paid',
  actualAmount: '',
  platforms: '',
  productName: '',
  productValue: '',
};

const templateToForm = (template: OrderTemplate): TemplateForm => ({
  name: template.name,
  title: template.title,
  brandName: template.brandName || '',
  type: template.type,
  actualAmount: template.actualAmount ? String(template.actualAmount) : '',
  platforms: template.platforms.join(', '),
  productName: template.productName || '',
  productValue: template.productValue ? String(template.productValue) : '',
});

export default function OrderTemplatesPanel() {
  const {
    orderTemplates,
    brands,
    addBrand,
    addOrderTemplate,
    updateOrderTemplate,
    deleteOrderTemplate,
    createOrderFromTemplate,
  } = useStore();
  const { showToast } = useToast();
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<OrderTemplate | null>(null);
  const [deletingTemplate, setDeletingTemplate] = useState<OrderTemplate | null>(null);
  const [busyTemplateId, setBusyTemplateId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<TemplateForm>(EMPTY_FORM);

  const brandNames = useMemo(
    () => new Set(brands.map(brand => brand.name.trim().toLocaleLowerCase('zh-CN'))),
    [brands],
  );

  const openEditor = (template?: OrderTemplate) => {
    setEditingTemplate(template || null);
    setForm(template ? templateToForm(template) : EMPTY_FORM);
    setIsEditorOpen(true);
  };

  const closeEditor = () => {
    if (saving) return;
    setIsEditorOpen(false);
    setEditingTemplate(null);
    setForm(EMPTY_FORM);
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;

    const payload = {
      name: form.name.trim(),
      title: form.title.trim(),
      brandName: form.brandName.trim(),
      type: form.type,
      actualAmount: Number(form.actualAmount) || 0,
      platforms: form.platforms.split(/[,，]/).map(item => item.trim()).filter(Boolean),
      productName: form.productName.trim(),
      productValue: Number(form.productValue) || 0,
    };

    setSaving(true);
    try {
      if (editingTemplate) {
        await updateOrderTemplate(editingTemplate.id, payload);
        showToast('商单模板已更新');
      } else {
        await addOrderTemplate(payload);
        showToast('商单模板已创建');
      }
      setIsEditorOpen(false);
      setEditingTemplate(null);
      setForm(EMPTY_FORM);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存商单模板失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateOrder = async (template: OrderTemplate) => {
    if (busyTemplateId) return;
    setBusyTemplateId(template.id);
    try {
      const brandName = template.brandName?.trim();
      if (brandName && !brandNames.has(brandName.toLocaleLowerCase('zh-CN'))) {
        await addBrand({ name: brandName, industry: '未知', contact: '未知', phone: '' });
      }
      const order = await createOrderFromTemplate(template.id);
      showToast(`已创建商单 ${order.orderNo}`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '从模板创建商单失败', 'error');
    } finally {
      setBusyTemplateId(null);
    }
  };

  const handleDelete = async () => {
    if (!deletingTemplate) return;
    try {
      await deleteOrderTemplate(deletingTemplate.id);
      showToast('商单模板已删除');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '删除商单模板失败', 'error');
      throw error;
    }
  };

  return (
    <>
      <section className="card-sketch bg-white p-3 md:p-4" aria-labelledby="order-template-heading">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-9 h-9 rounded-xl bg-panda-yellow/25 flex items-center justify-center flex-shrink-0">
              <Layers3 size={18} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 id="order-template-heading" className="text-sm font-bold text-panda-black">商单模板</h2>
              <p className="text-xs text-gray-500 truncate">保存常用合作信息，一键创建重复商单</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => openEditor()}
            className="btn-secondary min-h-11 px-3 flex items-center gap-1.5 text-sm flex-shrink-0"
          >
            <Plus size={15} aria-hidden="true" />
            新建模板
          </button>
        </div>

        {orderTemplates.length === 0 ? (
          <button
            type="button"
            onClick={() => openEditor()}
            className="mt-3 w-full min-h-16 border-2 border-dashed border-gray-200 rounded-xl text-xs text-gray-500 hover:border-panda-black/30 hover:bg-gray-50 transition-colors"
          >
            暂无模板，点击创建第一个常用商单模板
          </button>
        ) : (
          <div className="mt-3 flex gap-3 overflow-x-auto pb-1 snap-x" aria-label="商单模板列表">
            {orderTemplates.map(template => {
              const type = ORDER_TYPE_MAP[template.type];
              const isBusy = busyTemplateId === template.id;
              const value = template.type === 'product_exchange' || template.type === 'ecard'
                ? template.productValue
                : template.actualAmount;
              return (
                <article
                  key={template.id}
                  className="min-w-[270px] max-w-[320px] flex-1 snap-start rounded-xl border border-gray-200 bg-gray-50/70 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-sm text-panda-black truncate" title={template.name}>{template.name}</h3>
                      <p className="text-xs text-gray-500 truncate mt-0.5" title={template.title}>{template.title}</p>
                    </div>
                    <span className="text-[11px] px-2 py-1 rounded-full bg-white border border-gray-200 whitespace-nowrap">
                      {type?.icon} {type?.label}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-600">
                    <span>{template.brandName || '无品牌'}</span>
                    <span>¥{(value || 0).toLocaleString()}</span>
                    <span className="truncate max-w-full">{template.platforms.join('、') || '未设置平台'}</span>
                  </div>
                  <div className="mt-3 grid grid-cols-[1fr_44px_44px] gap-2">
                    <button
                      type="button"
                      onClick={() => handleCreateOrder(template)}
                      disabled={Boolean(busyTemplateId)}
                      className="btn-sketch min-h-11 px-3 flex items-center justify-center gap-1.5 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                      aria-label={`使用模板“${template.name}”创建商单`}
                    >
                      <Rocket size={15} aria-hidden="true" />
                      {isBusy ? '创建中…' : '一键创建'}
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditor(template)}
                      className="min-h-11 rounded-xl border border-gray-200 bg-white text-gray-600 hover:text-panda-black hover:border-panda-black/30 flex items-center justify-center transition-colors"
                      aria-label={`编辑模板“${template.name}”`}
                    >
                      <Pencil size={15} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeletingTemplate(template)}
                      className="min-h-11 rounded-xl border border-gray-200 bg-white text-gray-500 hover:text-danger hover:border-danger/30 flex items-center justify-center transition-colors"
                      aria-label={`删除模板“${template.name}”`}
                    >
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <Modal
        isOpen={isEditorOpen}
        onClose={closeEditor}
        title={editingTemplate ? '编辑商单模板' : '新建商单模板'}
        width="max-w-lg"
      >
        <form onSubmit={handleSave} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-xs font-medium text-gray-700">
              模板名称
              <input
                required
                maxLength={50}
                value={form.name}
                onChange={event => setForm({ ...form, name: event.target.value })}
                placeholder="例如：小红书月度合作"
                className="mt-1 w-full px-3 py-2.5 border border-border rounded-lg outline-none focus:border-accent text-sm"
              />
            </label>
            <label className="text-xs font-medium text-gray-700">
              合作品牌
              <input
                maxLength={50}
                list="template-brand-options"
                value={form.brandName}
                onChange={event => setForm({ ...form, brandName: event.target.value })}
                className="mt-1 w-full px-3 py-2.5 border border-border rounded-lg outline-none focus:border-accent text-sm"
              />
              <datalist id="template-brand-options">
                {brands.map(brand => <option key={brand.id} value={brand.name} />)}
              </datalist>
            </label>
          </div>
          <label className="block text-xs font-medium text-gray-700">
            商单标题
            <input
              required
              maxLength={100}
              value={form.title}
              onChange={event => setForm({ ...form, title: event.target.value })}
              placeholder="每次创建后仍可单独修改"
              className="mt-1 w-full px-3 py-2.5 border border-border rounded-lg outline-none focus:border-accent text-sm"
            />
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-xs font-medium text-gray-700">
              合作类型
              <select
                value={form.type}
                onChange={event => setForm({ ...form, type: event.target.value as OrderType })}
                className="mt-1 w-full px-3 py-2.5 border border-border rounded-lg outline-none focus:border-accent text-sm bg-white"
              >
                <option value="paid">付费</option>
                <option value="product_exchange">置换</option>
                <option value="ecard">E卡</option>
                <option value="direct">直发</option>
              </select>
            </label>
            {(form.type === 'product_exchange' || form.type === 'ecard') ? (
              <label className="text-xs font-medium text-gray-700">
                {form.type === 'ecard' ? 'E卡面值 (¥)' : '产品价值 (¥)'}
                <input
                  min="0"
                  step="0.01"
                  type="number"
                  value={form.productValue}
                  onChange={event => setForm({ ...form, productValue: event.target.value })}
                  className="mt-1 w-full px-3 py-2.5 border border-border rounded-lg outline-none focus:border-accent text-sm"
                />
              </label>
            ) : (
              <label className="text-xs font-medium text-gray-700">
                金额 (¥)
                <input
                  min="0"
                  step="0.01"
                  type="number"
                  value={form.actualAmount}
                  onChange={event => setForm({ ...form, actualAmount: event.target.value })}
                  className="mt-1 w-full px-3 py-2.5 border border-border rounded-lg outline-none focus:border-accent text-sm"
                />
              </label>
            )}
          </div>
          {form.type === 'product_exchange' && (
            <label className="block text-xs font-medium text-gray-700">
              产品名称
              <input
                maxLength={100}
                value={form.productName}
                onChange={event => setForm({ ...form, productName: event.target.value })}
                className="mt-1 w-full px-3 py-2.5 border border-border rounded-lg outline-none focus:border-accent text-sm"
              />
            </label>
          )}
          <label className="block text-xs font-medium text-gray-700">
            发布平台
            <input
              value={form.platforms}
              onChange={event => setForm({ ...form, platforms: event.target.value })}
              placeholder="小红书, 抖音（逗号分隔）"
              className="mt-1 w-full px-3 py-2.5 border border-border rounded-lg outline-none focus:border-accent text-sm"
            />
          </label>
          <p className="text-xs text-gray-500">一键创建时会自动生成商单号，以当天为接单日期，并同步创建待办。</p>
          <div className="pt-2 flex justify-end gap-2">
            <button type="button" onClick={closeEditor} disabled={saving} className="min-h-11 px-4 text-sm text-gray-600 hover:bg-gray-100 rounded-xl disabled:opacity-50">取消</button>
            <button type="submit" disabled={saving} className="btn-sketch min-h-11 px-5 text-sm disabled:opacity-60">
              {saving ? '保存中…' : (editingTemplate ? '保存修改' : '创建模板')}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(deletingTemplate)}
        onClose={() => setDeletingTemplate(null)}
        onConfirm={handleDelete}
        title="删除商单模板"
        message={`确定删除“${deletingTemplate?.name || ''}”吗？已创建的商单不会受影响。`}
        confirmText="删除模板"
      />
    </>
  );
}
