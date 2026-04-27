import { memo, useState } from 'react';
import { clsx } from 'clsx';
import { Edit2, Trash2, ChevronDown } from 'lucide-react';
import { Order, OrderStatus } from '../../types';
import { ORDER_STATUS_MAP, ORDER_TYPE_MAP, getPlatformIcon } from '../../constants/orders';

const statusMap = ORDER_STATUS_MAP;
const typeMap = ORDER_TYPE_MAP;

interface OrderCardProps {
  order: Order;
  onDelete: () => void;
  onStatusChange: (status: OrderStatus) => void;
  onEdit: () => void;
  onView: () => void;
}

export default memo(function OrderCard({ order, onDelete, onStatusChange, onEdit, onView }: OrderCardProps) {
  const statusInfo = statusMap[order.status] || statusMap.in_progress;
  const typeInfo = typeMap[order.type] || typeMap.paid;
  const [showStatusMenu, setShowStatusMenu] = useState(false);

  const statusBgColor = {
    in_progress: 'from-amber-50 to-orange-50 border-amber-200',
    completed: 'from-emerald-50 to-green-50 border-emerald-200',
    cancelled: 'from-red-50 to-rose-50 border-red-200',
  }[order.status] || 'from-gray-50 to-slate-50 border-gray-200';

  return (
    <div 
      className={clsx(
        "relative overflow-hidden rounded-2xl border-2 bg-gradient-to-br p-4 transition-all duration-300 cursor-pointer group",
        statusBgColor,
        "hover:shadow-lg hover:shadow-gray-200/50 hover:-translate-y-0.5 hover:border-panda-black/30"
      )} 
      onClick={onView}
    >
      <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-white/40 to-transparent rounded-bl-full" />
      
      <div className="relative">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[10px] font-mono text-gray-400 bg-white/60 px-2 py-0.5 rounded-full">{order.orderNo}</span>
              <span className="text-sm">{typeInfo.icon}</span>
            </div>
            <h3 className="font-bold text-base text-panda-black truncate leading-tight">{order.title}</h3>
          </div>
          <div className="flex items-center gap-1 ml-2" onClick={e => e.stopPropagation()}>
            <div className="relative">
              <button
                onClick={() => setShowStatusMenu(!showStatusMenu)}
                className={clsx("status-badge flex items-center gap-1 text-[11px]", statusInfo.color)}
              >
                {statusInfo.icon} {statusInfo.label}
                <ChevronDown size={10} />
              </button>
              {showStatusMenu && (
                <div className="absolute right-0 top-full mt-1 bg-white border-2 border-panda-black/20 rounded-xl shadow-lg z-10 min-w-[100px] overflow-hidden">
                  {Object.entries(statusMap).map(([key, value]) => (
                    <button
                      key={key}
                      onClick={() => { onStatusChange(key as OrderStatus); setShowStatusMenu(false); }}
                      className={clsx(
                        "w-full px-3 py-2 text-left text-xs hover:bg-gray-50 flex items-center gap-2",
                        order.status === key && "bg-gray-100"
                      )}
                    >
                      {value.icon} {value.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={onEdit} className="p-1.5 text-gray-400 hover:text-panda-black hover:bg-white/80 rounded-lg transition-colors" title="编辑">
                <Edit2 size={12} />
              </button>
              <button onClick={onDelete} className="p-1.5 text-danger hover:bg-white/80 rounded-lg transition-colors" title="删除">
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white/60 backdrop-blur-sm rounded-xl p-3 space-y-2">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-purple-100 to-violet-100 flex items-center justify-center flex-shrink-0">
                <span className="text-xs">🏢</span>
              </div>
              <div className="min-w-0">
                <span className="text-gray-400 text-[10px] block leading-none">品牌</span>
                <span className="font-medium text-gray-700 truncate block">{order.brandName || '未知品牌'}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-100 to-green-100 flex items-center justify-center flex-shrink-0">
                <span className="text-xs">💰</span>
              </div>
              <div className="min-w-0">
                <span className="text-gray-400 text-[10px] block leading-none">金额</span>
                <span className="font-semibold text-emerald-600 block">{order.actualAmount > 0 ? `¥${order.actualAmount.toLocaleString()}` : '-'}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-100 to-cyan-100 flex items-center justify-center flex-shrink-0">
                <span className="text-xs">📅</span>
              </div>
              <div className="min-w-0">
                <span className="text-gray-400 text-[10px] block leading-none">交稿</span>
                <span className="font-medium text-gray-700 block">{order.submitDate || '-'}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-orange-100 to-amber-100 flex items-center justify-center flex-shrink-0">
                <span className="text-xs">📊</span>
              </div>
              <div className="min-w-0">
                <span className="text-gray-400 text-[10px] block leading-none">类型</span>
                <span className="font-medium text-gray-700 block">{typeInfo.label}</span>
              </div>
            </div>
          </div>
        </div>

        {order.platforms?.length > 0 && (
          <div className="flex items-center gap-1.5 mt-3 flex-wrap">
            {order.platforms.slice(0, 3).map(p => (
              <span key={p} className="text-[10px] bg-white/80 backdrop-blur-sm px-2.5 py-1 rounded-full text-gray-600 border border-white/50 shadow-sm font-medium">
                {getPlatformIcon(p)} {p}
              </span>
            ))}
            {order.platforms.length > 3 && (
              <span className="text-[10px] text-gray-400 bg-white/50 px-2 py-1 rounded-full">+{order.platforms.length - 3}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
});