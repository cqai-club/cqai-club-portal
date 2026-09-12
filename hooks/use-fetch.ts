/**
 * 带请求取消和状态管理的 fetch hook
 */

import { useState, useEffect, useRef, useCallback } from "react";

interface UseFetchOptions<T> {
  url: string | null;
  immediate?: boolean;
  onSuccess?: (data: T) => void;
  onError?: (error: Error) => void;
}

interface UseFetchState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

interface UseFetchReturn<T> extends UseFetchState<T> {
  refetch: () => void;
  cancel: () => void;
}

export function useFetch<T>({
  url,
  immediate = true,
  onSuccess,
  onError,
}: UseFetchOptions<T>): UseFetchReturn<T> {
  const [state, setState] = useState<UseFetchState<T>>({
    data: null,
    loading: false,
    error: null,
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const fetchData = useCallback(async () => {
    if (!url) return;

    // 取消之前的请求
    cancel();

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const response = await fetch(url, {
        signal: abortController.signal,
      });

      if (!mountedRef.current) return;

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (!mountedRef.current) return;

      setState({ data, loading: false, error: null });
      onSuccess?.(data);
    } catch (error) {
      if (!mountedRef.current) return;

      if (error instanceof Error && error.name === "AbortError") {
        // 请求被取消，不更新状态
        return;
      }

      const err = error instanceof Error ? error : new Error(String(error));
      setState({ data: null, loading: false, error: err });
      onError?.(err);
    }
  }, [url, cancel, onSuccess, onError]);

  useEffect(() => {
    mountedRef.current = true;

    if (immediate && url) {
      fetchData();
    }

    return () => {
      mountedRef.current = false;
      cancel();
    };
  }, [url, immediate, fetchData, cancel]);

  return {
    ...state,
    refetch: fetchData,
    cancel,
  };
}

/**
 * 用于手动触发请求的 hook
 */
export function useMutation<T, B = unknown>(
  url: string,
  method: "POST" | "PATCH" | "DELETE" = "POST"
) {
  const [state, setState] = useState<UseFetchState<T>>({
    data: null,
    loading: false,
    error: null,
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const mutate = useCallback(
    async (body?: B): Promise<T | null> => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      setState((prev) => ({ ...prev, loading: true, error: null }));

      try {
        const options: RequestInit = {
          method,
          headers: { "Content-Type": "application/json" },
          signal: abortController.signal,
        };

        if (body) {
          options.body = JSON.stringify(body);
        }

        const response = await fetch(url, options);

        if (!mountedRef.current) return null;

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `HTTP ${response.status}`);
        }

        const data = await response.json();

        if (!mountedRef.current) return null;

        setState({ data, loading: false, error: null });
        return data;
      } catch (error) {
        if (!mountedRef.current) return null;

        if (error instanceof Error && error.name === "AbortError") {
          return null;
        }

        const err = error instanceof Error ? error : new Error(String(error));
        setState({ data: null, loading: false, error: err });
        return null;
      }
    },
    [url, method]
  );

  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setState((prev) => ({ ...prev, loading: false }));
    }
  }, []);

  return {
    ...state,
    mutate,
    cancel,
    reset: () => setState({ data: null, loading: false, error: null }),
  };
}
