import { useEffect, useState, useCallback } from 'react';

export function useFetch<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const run = useCallback(fn, deps);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    run()
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'خطأ'))
      .finally(() => setLoading(false));
  }, [run]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, error, loading, reload };
}

export function money(halalas: string | number | null | undefined): string {
  if (halalas == null) return '—';
  return `${new Intl.NumberFormat('en-US').format(Number(halalas) / 100)} ر.س`;
}
