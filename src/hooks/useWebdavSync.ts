import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '../components/Toast';
import { formatExportWarningMessage, saveBackupRisk } from '../lib/backupNotice';
import {
  getWebdavAuthorization,
  getWebdavFileUrl,
  loadWebdavLastSync,
  loadWebdavConfig,
  loadWebdavRemoteState,
  saveWebdavLastSync,
  saveWebdavConfig,
  saveWebdavRemoteState,
  uploadWebdavBackup,
  WebdavConflictError,
  WebdavSessionCancelledError,
  webdavFetch,
  loadWebdavLastError,
  saveWebdavLastError,
  clearWebdavLastError,
  WEBDAV_LAST_SYNC_UPDATED_EVENT,
  type WebdavConfig,
} from '../lib/webdav';

interface UseWebdavSyncOptions {
  /** 恢复数据入口：下载到云端备份后由页面走预检确认流程 */
  onRestoreData: (remoteData: Record<string, unknown>) => Promise<void>;
}

interface UseWebdavSyncResult {
  webdavConfig: WebdavConfig;
  setWebdavConfig: React.Dispatch<React.SetStateAction<WebdavConfig>>;
  lastSyncTime: string | null;
  isSyncing: boolean;
  conflictConfirmOpen: boolean;
  dismissConflictConfirm: () => void;
  confirmConflictUpload: () => Promise<void>;
  handleSaveWebdavConfig: () => void;
  handleWebdavSync: (direction: 'upload' | 'download', options?: { silent?: boolean; force?: boolean }) => Promise<boolean>;
  /** 恢复数据成功后记录本次同步时间 */
  markRestored: () => void;
  /** 最近一次同步失败信息（供设置页展示） */
  lastError: ReturnType<typeof loadWebdavLastError>;
}

// WebDAV 同步的状态与操作（配置保存、上传/下载、冲突确认），从设置页抽出复用。
export function useWebdavSync({ onRestoreData }: UseWebdavSyncOptions): UseWebdavSyncResult {
  const { showToast } = useToast();
  const [webdavConfig, setWebdavConfig] = useState<WebdavConfig>(() => loadWebdavConfig());
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(() => loadWebdavLastSync());
  const [conflictConfirmOpen, setConflictConfirmOpen] = useState(false);
  const [lastError, setLastError] = useState(() => loadWebdavLastError());
  const webdavSyncInProgressRef = useRef(false);
  // undefined = 尚未下载过云端备份；null = 云端备份确实没有版本号；string = 待确认的云端版本
  const pendingRemoteStateRef = useRef<string | null | undefined>(undefined);

  // 自动同步完成后（任意页面）刷新本页"上次同步"显示
  useEffect(() => {
    const refresh = () => setLastSyncTime(loadWebdavLastSync());
    window.addEventListener(WEBDAV_LAST_SYNC_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(WEBDAV_LAST_SYNC_UPDATED_EVENT, refresh);
  }, []);

  const handleSaveWebdavConfig = () => {
    if (webdavConfig.url && (!webdavConfig.username || !webdavConfig.password)) {
      showToast('请填写完整的 WebDAV 认证信息', 'warning');
      return;
    }
    saveWebdavConfig(webdavConfig);
    showToast('WebDAV 配置已保存');
  };

  const handleWebdavSync = useCallback(async (
    direction: 'upload' | 'download',
    options: { silent?: boolean; force?: boolean } = {},
  ): Promise<boolean> => {
    if (!webdavConfig.url || !webdavConfig.username || !webdavConfig.password) {
      if (!options.silent) {
        showToast('请先配置 WebDAV 连接信息', 'warning');
      }
      return false;
    }

    if (webdavSyncInProgressRef.current) {
      return false;
    }

    webdavSyncInProgressRef.current = true;
    setIsSyncing(true);
    try {
      if (direction === 'upload') {
        const result = await uploadWebdavBackup(webdavConfig, { force: options.force });
        setLastSyncTime(result.syncedAt);
        clearWebdavLastError();
        setLastError(null);
        if (result.historyWarning) {
          showToast(result.historyWarning, 'warning');
        } else if (!options.silent) {
          // 云端备份同样要提示可恢复性风险：上传成功不代表这份备份能用
          saveBackupRisk(result.exportWarnings, 'webdav');
          const warningMessage = formatExportWarningMessage(
            result.exportWarnings,
            '已同步到 WebDAV，但这份备份可能无法直接恢复',
          );
          if (warningMessage) {
            showToast(warningMessage, 'warning', { persistent: true });
          } else {
            showToast('数据已同步到 WebDAV');
          }
        }
        return true;
      } else {
        // 从 WebDAV 下载
        const response = await webdavFetch(getWebdavFileUrl(webdavConfig), {
          method: 'GET',
          headers: {
            'Authorization': getWebdavAuthorization(webdavConfig)
          }
        });

        if (response.ok) {
          const remoteData = await response.json();
          // 基准只在恢复真正完成后记录（见 markRestored）：
          // 提前记录会让用户取消恢复后的上传"合法地"覆盖尚未恢复到本地的云端数据
          pendingRemoteStateRef.current = typeof remoteData?.exportedAt === 'string' ? remoteData.exportedAt : null;
          await onRestoreData(remoteData);
          return true;
        } else if (response.status === 404) {
          showToast('WebDAV 上暂无备份文件', 'warning');
          return false;
        } else {
          throw new Error(`下载失败: ${response.status}`);
        }
      }
    } catch (error) {
      console.error('WebDAV sync error:', error);
      // 账号已切换：任务作废属于预期行为，不提示、不记录，避免打扰新账号
      if (error instanceof WebdavSessionCancelledError) {
        return false;
      }
      const errorMessage = error instanceof Error ? error.message : '';
      if (error instanceof WebdavConflictError) {
        const reason = errorMessage || '云端备份已被其他设备更新';
        saveWebdavLastError(reason, 'manual');
        setLastError(loadWebdavLastError());
        if (!options.silent) {
          setConflictConfirmOpen(true);
        }
        return false;
      }
      if (!options.silent) {
        const reason = `同步失败: ${errorMessage || '网络错误'}`;
        saveWebdavLastError(reason, 'manual');
        setLastError(loadWebdavLastError());
        showToast(reason, 'error');
      }
      return false;
    } finally {
      webdavSyncInProgressRef.current = false;
      setIsSyncing(false);
    }
  }, [onRestoreData, showToast, webdavConfig]);

  const dismissConflictConfirm = () => setConflictConfirmOpen(false);

  const markRestored = () => {
    const now = new Date().toISOString();
    saveWebdavLastSync(now);
    const pending = pendingRemoteStateRef.current;
    if (pending !== undefined) {
      // 较新者优先：恢复确认瞬间若自动同步已写入更新的基准，不覆盖它
      const current = loadWebdavRemoteState();
      if (pending === null || (current !== null && current > pending)) {
        saveWebdavRemoteState(current);
      } else {
        saveWebdavRemoteState(pending);
      }
      pendingRemoteStateRef.current = undefined;
    }
    setLastSyncTime(now);
  };

  const confirmConflictUpload = async () => {
    setConflictConfirmOpen(false);
    await handleWebdavSync('upload', { force: true });
  };

  return {
    webdavConfig,
    setWebdavConfig,
    lastSyncTime,
    isSyncing,
    conflictConfirmOpen,
    dismissConflictConfirm,
    confirmConflictUpload,
    handleSaveWebdavConfig,
    handleWebdavSync,
    markRestored,
    lastError,
  };
}
