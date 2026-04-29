import { Cloud, Upload, Download, Settings2, RefreshCw as Sync } from 'lucide-react';
import type { SyncTabProps } from './types';

export function SyncTab({ 
  webdavConfig, 
  setWebdavConfig, 
  lastSyncTime, 
  isSyncing, 
  handleSaveWebdavConfig, 
  handleWebdavSync 
}: SyncTabProps) {
  return (
    <div className="card-sketch p-6 bg-white">
      <h2 className="text-lg font-bold mb-6">云端同步</h2>
      <div className="space-y-6">
        <div className="p-4 bg-info/5 border border-info/20 rounded-xl">
          <div className="flex items-center gap-2 text-info mb-2">
            <Cloud size={18} />
            <span className="font-bold">WebDAV 同步</span>
          </div>
          <p className="text-xs text-gray-500">
            通过 WebDAV 协议将数据同步到坚果云、NextCloud 等云存储服务，实现多设备数据同步。
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">WebDAV 服务器地址</label>
            <input
              type="url"
              value={webdavConfig.url}
              onChange={(e) => setWebdavConfig({ ...webdavConfig, url: e.target.value })}
              className="w-full px-4 py-2.5 bg-bg-tertiary border border-transparent focus:border-accent focus:bg-white rounded-xl outline-none transition-all text-sm"
              placeholder="https://dav.jianguoyun.com/dav/"
            />
            <p className="text-xs text-gray-400">例如：坚果云 https://dav.jianguoyun.com/dav/</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">用户名</label>
              <input
                type="text"
                value={webdavConfig.username}
                onChange={(e) => setWebdavConfig({ ...webdavConfig, username: e.target.value })}
                className="w-full px-4 py-2.5 bg-bg-tertiary border border-transparent focus:border-accent focus:bg-white rounded-xl outline-none transition-all text-sm"
                placeholder="WebDAV 用户名"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">密码/应用密码</label>
              <input
                type="password"
                value={webdavConfig.password}
                onChange={(e) => setWebdavConfig({ ...webdavConfig, password: e.target.value })}
                className="w-full px-4 py-2.5 bg-bg-tertiary border border-transparent focus:border-accent focus:bg-white rounded-xl outline-none transition-all text-sm"
                placeholder="WebDAV 密码"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">自动同步周期</label>
            <select
              value={webdavConfig.syncInterval}
              onChange={(e) => setWebdavConfig({ ...webdavConfig, syncInterval: e.target.value })}
              className="w-full px-4 py-2.5 bg-bg-tertiary border border-transparent focus:border-accent focus:bg-white rounded-xl outline-none transition-all text-sm"
            >
              <option value="0">手动同步</option>
              <option value="1">每小时</option>
              <option value="24">每天</option>
              <option value="168">每周</option>
            </select>
          </div>

          {lastSyncTime && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Sync size={14} />
              上次同步：{new Date(lastSyncTime).toLocaleString('zh-CN')}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-3 pt-4 border-t border-border/50">
          <button
            onClick={handleSaveWebdavConfig}
            className="btn-secondary flex items-center gap-2"
          >
            <Settings2 size={16} />
            保存配置
          </button>
          <button
            onClick={() => handleWebdavSync('upload')}
            disabled={isSyncing || !webdavConfig.url}
            className="btn-sketch flex items-center gap-2 disabled:opacity-50"
          >
            <Upload size={16} />
            {isSyncing ? '同步中...' : '上传备份'}
          </button>
          <button
            onClick={() => handleWebdavSync('download')}
            disabled={isSyncing || !webdavConfig.url}
            className="btn-secondary flex items-center gap-2 disabled:opacity-50"
          >
            <Download size={16} />
            恢复数据
          </button>
        </div>

        <div className="p-4 bg-gray-50 rounded-xl space-y-2">
          <h4 className="text-sm font-bold text-gray-700">常见 WebDAV 服务配置</h4>
          <div className="text-xs text-gray-500 space-y-1">
            <p><strong>坚果云：</strong>https://dav.jianguoyun.com/dav/（需在坚果云设置中创建应用密码）</p>
            <p><strong>NextCloud：</strong>https://your-domain/remote.php/dav/files/用户名/</p>
            <p><strong>群晖 NAS：</strong>https://your-nas:5006/（需启用 WebDAV 服务）</p>
          </div>
        </div>
      </div>
    </div>
  );
}