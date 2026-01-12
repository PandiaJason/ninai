import { useRef, useEffect, useCallback } from 'react';

export function useDebounce<T extends (...args: any[]) => void>(callback: T, delay: number) {
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);
    const callbackRef = useRef(callback);

    // Keep callback ref up to date
    useEffect(() => {
        callbackRef.current = callback;
    }, [callback]);

    const debouncedCallback = useCallback((...args: Parameters<T>) => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }

        timeoutRef.current = setTimeout(() => {
            if (callbackRef.current) {
                callbackRef.current(...args);
            }
        }, delay);
    }, [delay]);

    return debouncedCallback;
}
