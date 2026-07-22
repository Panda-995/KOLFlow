import { useEffect, useRef } from 'react';
import {
  isWebdavUploadDue,
  loadWebdavLastSync,
  loadWebdavConfig,
  uploadWebdavBackup,
  WEBDAV_CONFIG_UPDATED_EVENT,
} from '../lib/webdav';

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
        await uploadWebdavBackup(config);
      } catch (error) {
        console.warn('WebDAV 自动同步失败:', error instanceof Error ? error.message : error);
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
