import { Download, Upload, AlertTriangle } from 'lucide-react';
import type { BackupTabProps } from './types';

export function BackupTab({
  handleExportData,
  handleImportData,
  importInputRef,
  setClearDataConfirm,
  backupRisk,
  onDismissBackupRisk,
}: BackupTabProps) {
  const riskTime = backupRisk ? new Date(backupRisk.at).toLocaleString('zh-CN', { hour12: false }) : '';
  return (
    <div className="card-sketch p-6 bg-panda-white">
      <h2 className="text-lg font-bold mb-6">数据管理</h2>
      {/* 备份可恢复性风险：提示条会消失，这里保留可回看（下一次无风险的导出/上传会自动清除） */}
      {backupRisk && backupRisk.warnings.length > 0 && (
        <div role="alert" className="mb-4 p-4 bg-warning/10 border border-warning/30 rounded-xl">
          <div className="flex items-start justify-between gap-3">
            <div className="flex gap-2">
              <AlertTriangle className="text-warning shrink-0 mt-0.5" size={18} />
              <div>
                <h4 className="font-bold text-sm text-panda-black">
                  最近一次备份存在风险（{backupRisk.source === 'webdav' ? 'WebDAV 上传' : '本地导出'} · {riskTime}）
                </h4>
                <ul className="mt-1 space-y-1 text-xs text-gray-600 list-disc pl-4">
                  {backupRisk.warnings.map(warning => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
                <p className="text-xs text-gray-500 mt-2">建议清理操作日志/资产图片，或调整 IMPORT_BODY_LIMIT / MAX_IMPORT_ITEMS 后重新备份。</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onDismissBackupRisk}
              aria-label="忽略备份风险提示"
              className="shrink-0 text-xs px-2 py-1 rounded-lg border border-warning/40 text-warning hover:bg-warning/10 transition-colors"
            >
              忽略
            </button>
          </div>
        </div>
      )}
      <p className="text-xs text-gray-500 mb-4">
        提示：导出的备份包含账号设置与 API Key 等敏感信息，请妥善保管，不要上传到不可信的位置。
      </p>
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button 
            onClick={handleExportData}
            className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-border rounded-2xl hover:border-panda-black hover:bg-panda-black/5 transition-all group"
          >
            <div className="w-12 h-12 rounded-full bg-panda-black/5 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
              <Download className="text-panda-black" size={24} />
            </div>
            <span className="font-bold text-panda-black">导出备份</span>
            <span className="text-xs text-gray-500 mt-1">下载所有数据的 JSON 备份</span>
          </button>

          <button 
            onClick={() => importInputRef.current?.click()}
            className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-border rounded-2xl hover:border-accent hover:bg-accent/5 transition-all group"
          >
            <div className="w-12 h-12 rounded-full bg-accent/5 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
              <Upload className="text-accent" size={24} />
            </div>
            <span className="font-bold text-panda-black">导入数据</span>
            <span className="text-xs text-gray-500 mt-1">预检后从备份文件恢复</span>
            <input 
              type="file" 
              ref={importInputRef} 
              onChange={handleImportData} 
              accept=".json" 
              className="hidden" 
            />
          </button>
        </div>

        <div className="p-4 bg-danger/5 border border-danger/10 rounded-xl flex gap-3">
          <AlertTriangle className="text-danger shrink-0" size={20} />
          <div>
            <h4 className="font-bold text-danger text-sm">危险操作</h4>
            <p className="text-xs text-danger/80 mt-1">
              导入数据会按集合替换：备份中包含的集合（商单、品牌、账单、待办等）将被整体替换，未包含的集合保持原样；仅恢复设置的备份不会改动业务数据。此操作不可逆，请在操作前确保已做好备份。
            </p>
          </div>
        </div>

        <div className="pt-6 border-t border-border/50">
          <div className="flex items-center justify-between p-4 bg-bg-tertiary rounded-xl">
            <div>
              <div className="font-medium text-panda-black">清空所有数据</div>
              <div className="text-sm text-danger">警告：此操作不可逆，将删除所有数据</div>
            </div>
            <button onClick={() => setClearDataConfirm(true)} className="px-4 py-2 border border-danger text-danger rounded-xl text-sm font-medium hover:bg-danger/10 transition-colors">
              清空
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
