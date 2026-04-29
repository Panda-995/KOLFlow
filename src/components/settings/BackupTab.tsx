import { Download, Upload, AlertTriangle } from 'lucide-react';
import type { BackupTabProps } from './types';

export function BackupTab({ handleExportData, handleImportData, importInputRef, setClearDataConfirm }: BackupTabProps) {
  return (
    <div className="card-sketch p-6 bg-white">
      <h2 className="text-lg font-bold mb-6">数据管理</h2>
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button 
            onClick={handleExportData}
            className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-border rounded-2xl hover:border-panda-black hover:bg-gray-50 transition-all group"
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
            <span className="text-xs text-gray-500 mt-1">从备份文件恢复数据</span>
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
              导入数据将完全覆盖您当前的所有商单、品牌、账单和待办事项。此操作不可逆，请在操作前确保已做好备份。
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