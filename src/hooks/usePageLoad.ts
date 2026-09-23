import { useCallback, useEffect, useState } from 'react';

export const usePageLoad = (load: () => Promise<unknown>) => {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const retry = useCallback(async () => {
    setState('loading');
    try {
      await load();
      setState('ready');
    } catch {
      setState('error');
    }
  }, [load]);
  useEffect(() => { void retry(); }, [retry]);
  return { state, retry };
};
