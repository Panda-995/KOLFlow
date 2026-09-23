import { useEffect, useRef } from 'react';
import {
  isWebdavUploadDue,
  loadWebdavLastSync,
  loadWebdavConfig,
  saveWebdavLastError,
  clearWebdavLastError,
  uploadWebdavBackup,
  WebdavConflictError,
  WebdavSessionCancelledError,
  WEBDAV_CONFIG_UPDATED_EVENT,
} from '../lib/webdav';
import { emitToast } from '../components/Toast';
import { formatExportWarningMessage, saveBackupRisk } from '../lib/backupNotice';

export const useWebdavAutoSync = (): void => {
  const syncingRef = useRef(false);

  useEffect(() => {
    const runAutoSync = async () => {
      if (document.visibilityState === 'hidden' || syncingRef.current) return;
      const config = loadWebdavConfig();
      const intervalHours = Number(config.syncInterval);
      if (!config.url || !config.username || !config.password) return;
      if (!isWebdavUploadDue(loadWebdavLastSync(), intervalHours)) return;

      syncingRef.current = true;
      try {
        const result = await uploadWebdavBackup(config);
        clearWebdavLastError();
        // 历史副本没保住也必须让用户知道（否则被覆盖的旧版本无法找回）
        if (result.historyWarning) {
          emitToast(`自动备份：${result.historyWarning}`, 'warning');
        } else {
          // 备份可能因超限而无法恢复：自动同步同样要提示（不自动消失），并留档到数据管理页
          saveBackupRisk(result.exportWarnings, 'webdav');
          const warningMessage = formatExportWarningMessage(
            result.exportWarnings,
            '自动备份已上传，但这份备份可能无法直接恢复',
          );
          if (warningMessage) emitToast(warningMessage, 'warning', { persistent: true });
        }
      } catch (error) {
        // 账号切换导致的任务作废是预期行为：不记录失败、不提示
        if (error instanceof WebdavSessionCancelledError) return;
        const message = error instanceof WebdavConflictError
          ? '云端备份已被其他设备更新，自动备份已暂停以免覆盖。请在"云端同步"中恢复或确认覆盖。'
          : `自动备份失败：${error instanceof Error ? error.message : '未知错误'}`;
        console.warn('WebDAV 自动同步失败:', message);
        // 同类原因只在首次出现时提示，避免每分钟重复打扰
        if (saveWebdavLastError(message, 'auto')) {
          emitToast(message, 'warning');
        }
      } finally {
        syncingRef.current = false;
      }
    };

    const handleConfigUpdate = () => { void runAutoSync(); };
    void runAutoSync();
    const timer = window.setInterval(() => { void runAutoSync(); }, 60 * 1000);
    window.addEventListener(WEBDAV_CONFIG_UPDATED_EVENT, handleConfigUpdate);
    document.addEventListener('visibilitychange', handleConfigUpdate);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(WEBDAV_CONFIG_UPDATED_EVENT, handleConfigUpdate);
      document.removeEventListener('visibilitychange', handleConfigUpdate);
    };
  }, []);
};
