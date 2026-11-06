import { useCallback, useEffect, useState } from 'react';
import { loadScheduledData, type ScheduledData } from '@/services/scheduled';

export function useScheduledData(workspaceId: string | null) {
  const [data, setData] = useState<ScheduledData | null>(null);
  const [loading, setLoading] = useState(Boolean(workspaceId));
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    if (!workspaceId) { setData(null); setLoading(false); return; }
    setLoading(true); setError(null);
    try { setData(await loadScheduledData(workspaceId)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load scheduled transactions.'); }
    finally { setLoading(false); }
  }, [workspaceId]);
  useEffect(() => { const task = setTimeout(() => { void reload(); }, 0); return () => clearTimeout(task); }, [reload]);
  return { data, loading, error, reload };
}
