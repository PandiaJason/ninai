import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';
import { toErrorMessage } from '../../services/errors';

export interface AsyncDataResult<T> {
    data: T | undefined;
    loading: boolean;
    error: string | null;
    reload: () => Promise<void>;
    setData: (value: T | undefined) => void;
}

/**
 * Small async loader with a stable reload function. The latest loader is kept in
 * a ref so callers can use inline closures without re-triggering the effect.
 */
export function useAsyncData<T>(loader: () => Promise<T>, deps: DependencyList): AsyncDataResult<T> {
    const loaderRef = useRef(loader);
    loaderRef.current = loader;
    const [data, setData] = useState<T | undefined>(undefined);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const requestRef = useRef(0);

    const reload = useCallback(async () => {
        const requestId = ++requestRef.current;
        setLoading(true);
        setError(null);
        try {
            const next = await loaderRef.current();
            if (requestId === requestRef.current) setData(next);
        } catch (e) {
            if (requestId === requestRef.current) setError(toErrorMessage(e));
        } finally {
            if (requestId === requestRef.current) setLoading(false);
        }
        // The dependency list controls when the loader is refreshed.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps);

    useEffect(() => {
        void reload();
    }, [reload]);

    return { data, loading, error, reload, setData };
}

export function useDebouncedValue<T>(value: T, delay = 250): T {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const timeout = window.setTimeout(() => setDebounced(value), delay);
        return () => window.clearTimeout(timeout);
    }, [value, delay]);
    return debounced;
}
