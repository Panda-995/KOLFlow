import { useEffect, useState } from 'react';
import { useStore, ActivityLog } from '../store/useStore';
import { Clock, User, Package, Edit2, Trash2, MessageSquare, AlertCircle, Trash } from 'lucide-react';
import { clsx } from 'clsx';
import Modal from '../components/Modal';

const actionIcons: Record<string, React.ReactNode> = {
  create: <Package size={14} className="text-success" />,
  update_status: <Edit2 size={14} className="text-warning" />,
  delete: <Trash2 size={14} className="text-danger" />,
  comment: <MessageSquare size={14} className="text-accent" />,
  login: <User size={14} className="text-accent" />
};

const actionLabels: Record<string, string> = {
  create: '创建',
  update_status: '状态更新',
  delete: '删除',
  comment: '评论',
  login: '登录'
};

const entityTypeLabels: Record<string, string> = {
  order: '商单',
  brand: '品牌',
  todo: '待办',
  payment: '账单'
};

export default function Logs() {
  const { activityLogs, fetchActivityLogs, clearActivityLogs } = useStore();
  const [showClearModal, setShowClearModal] = useState(false);

  useEffect(() => {
    fetchActivityLogs();
  }, [fetchActivityLogs]);

  const handleClearLogs = async () => {
    await clearActivityLogs();
    setShowClearModal(false);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-panda-black">操作日志</h1>
          <p className="text-gray-500 text-sm mt-1">记录系统中的关键操作，便于审计追踪</p>
        </div>
        {activityLogs.length > 0 && (
          <button
            onClick={() => setShowClearModal(true)}
            className="btn-secondary text-danger hover:bg-danger/10 text-sm flex items-center gap-2"
          >
            <Trash size={16} />
            清空日志
          </button>
        )}
      </div>

      <div className="card-pixel overflow-hidden bg-white">
        {activityLogs.length > 0 ? (
          <div className="divide-y divide-border/50">
            {activityLogs.map((log) => (
              <div key={log.id} className="p-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                    {actionIcons[log.action] || <AlertCircle size={14} className="text-gray-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-panda-black">
                        {actionLabels[log.action] || log.action}
                      </span>
                      <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
                        {entityTypeLabels[log.entityType] || log.entityType}
                      </span>
                    </div>
                    {log.details && (
                      <p className="text-sm text-gray-500 mt-1">{log.details}</p>
                    )}
                    <div className="flex items-center gap-1 text-xs text-gray-400 mt-2">
                      <Clock size={12} />
                      <span>{formatDate(log.createdAt)}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-16 flex flex-col items-center justify-center text-gray-400">
            <div className="text-4xl mb-2 opacity-50">🐼</div>
            <p>暂无操作日志</p>
            <p className="text-xs mt-1">系统会自动记录关键操作</p>
          </div>
        )}
      </div>

      <Modal isOpen={showClearModal} onClose={() => setShowClearModal(false)} title="确认清空">
        <div className="space-y-4">
          <p className="text-gray-600">确定要清空所有操作日志吗？此操作不可恢复。</p>
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setShowClearModal(false)}
              className="btn-secondary"
            >
              取消
            </button>
            <button
              onClick={handleClearLogs}
              className="btn-danger"
            >
              确认清空
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}