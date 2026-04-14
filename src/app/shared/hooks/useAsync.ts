/**
 * useAsync Hook - Einheitliche Behandlung von asynchronen Operationen
 * 
 * Bietet:
 - Ladezustand
 - Fehlerbehandlung mit AppError
 - Automatische Toast-Benachrichtigungen
 - Retry-Logik
 */
import { useState, useCallback, useRef } from 'react';
import { AppError, ErrorCodes } from '../errors/AppError';
import { handleError, handleApiError } from '../errors/errorHandler';
import type { Toast } from '../types';

export type AsyncStatus = 'idle' | 'loading' | 'success' | 'error';

export interface AsyncState<T> {
  data: T | null;
  error: AppError | null;
  status: AsyncStatus;
  isLoading: boolean;
  isSuccess: boolean;
  isError: boolean;
}

export interface UseAsyncOptions {
  showToast?: boolean;
  successMessage?: string;
  errorMessage?: string;
  onSuccess?: (data: unknown) => void;
  onError?: (error: AppError) => void;
}

export interface UseAsyncReturn<T> extends AsyncState<T> {
  execute: (...args: unknown[]) => Promise<T | null>;
  reset: () => void;
  retry: () => Promise<T | null>;
}

export function useAsync<T>(
  asyncFunction: (...args: unknown[]) => Promise<T>,
  options: UseAsyncOptions = {}
): UseAsyncReturn<T> {
  const {
    showToast = true,
    successMessage,
    errorMessage,
    onSuccess,
    onError,
  } = options;

  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    error: null,
    status: 'idle',
    isLoading: false,
    isSuccess: false,
    isError: false,
  });

  // Refs für retry
  const lastArgsRef = useRef<unknown[]>([]);
  const addToastRef = useRef<((message: string, type: Toast['type']) => void) | null>(null);

  // Setzt die Toast-Funktion (wird vom Provider gesetzt)
  const setToastFunction = useCallback((fn: (message: string, type: Toast['type']) => void) => {
    addToastRef.current = fn;
  }, []);

  const reset = useCallback(() => {
    setState({
      data: null,
      error: null,
      status: 'idle',
      isLoading: false,
      isSuccess: false,
      isError: false,
    });
  }, []);

  const execute = useCallback(async (...args: unknown[]): Promise<T | null> => {
    lastArgsRef.current = args;
    
    setState(prev => ({
      ...prev,
      status: 'loading',
      isLoading: true,
      isSuccess: false,
      isError: false,
    }));

    try {
      const data = await asyncFunction(...args);
      
      setState({
        data,
        error: null,
        status: 'success',
        isLoading: false,
        isSuccess: true,
        isError: false,
      });

      // Success Toast
      if (showToast && successMessage && addToastRef.current) {
        addToastRef.current(successMessage, 'success');
      }

      onSuccess?.(data);
      return data;
      
    } catch (err: unknown) {
      // API Fehler mit { error: string } extrahieren
      let appError: AppError;
      
      if (err instanceof Response) {
        try {
          const errorData = await err.json();
          appError = handleApiError(errorData);
        } catch {
          appError = handleError(err);
        }
      } else {
        appError = handleError(err);
      }

      setState({
        data: null,
        error: appError,
        status: 'error',
        isLoading: false,
        isSuccess: false,
        isError: true,
      });

      // Error Toast
      if (showToast && addToastRef.current) {
        const message = errorMessage || appError.userMessage;
        addToastRef.current(message, 'error');
      }

      onError?.(appError);
      return null;
    }
  }, [asyncFunction, showToast, successMessage, errorMessage, onSuccess, onError]);

  const retry = useCallback(async (): Promise<T | null> => {
    if (lastArgsRef.current.length > 0) {
      return execute(...lastArgsRef.current);
    }
    return null;
  }, [execute]);

  return {
    ...state,
    execute,
    reset,
    retry,
  };
}

/**
 * Wrapper für API-Calls mit automatischer Fehlerbehandlung
 */
export async function apiCallWithErrorHandling<T>(
  call: () => Promise<T>,
  options: {
    notFoundMessage?: string;
    serverErrorMessage?: string;
  } = {}
): Promise<T> {
  try {
    return await call();
  } catch (err: unknown) {
    if (err instanceof Response) {
      const { status } = err;
      
      if (status === 404 && options.notFoundMessage) {
        throw new AppError(options.notFoundMessage, {
          code: ErrorCodes.API_NOT_FOUND,
          severity: 'warning',
        });
      }
      
      if (status >= 500 && options.serverErrorMessage) {
        throw new AppError(options.serverErrorMessage, {
          code: ErrorCodes.API_SERVER_ERROR,
          severity: 'error',
        });
      }
    }
    
    throw handleError(err);
  }
}

export default useAsync;
