import { useEffect, useState } from 'react';

export function useCapacitor() {
  const [isNative, setIsNative] = useState(false);
  const [platform, setPlatform] = useState<string | null>(null);

  useEffect(() => {
    const checkCapacitor = async () => {
      if (typeof window !== 'undefined' && window.Capacitor) {
        setIsNative(window.Capacitor.isNativePlatform());
        setPlatform(window.Capacitor.getPlatform());
      }
    };
    checkCapacitor();
  }, []);

  const getServerUrl = () => {
    if (isNative) {
      return localStorage.getItem('kolflow_server_url') || '';
    }
    return '';
  };

  const setServerUrl = (url: string) => {
    localStorage.setItem('kolflow_server_url', url);
  };

  return {
    isNative,
    platform,
    getServerUrl,
    setServerUrl,
    needsServerConfig: isNative && !localStorage.getItem('kolflow_server_url'),
  };
}