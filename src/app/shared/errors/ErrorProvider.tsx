/**
 * ErrorProvider - Kontext für App-weite Fehlerbehandlung
 * 
 * Stellt zur Verfügung:
 - Globale Fehler-Queue
 - Toast-Integration
 - Error Reporting
 */
import React, { createContext, useContext, useCallback, useState } from 'react';
import { AppError } from './AppError';
import { logError } from './errorHandler';
import type { Toast } from '../types';

interface ErrorContextValue {
  errors: AppError[];
  addError: (error: AppError) => void;
  removeError: (id: string) => void;
  clearErrors: () => void;
  lastError: AppError | null;
}

const ErrorContext = createContext<ErrorContextValue | undefined>(undefined);

interface ErrorProviderProps {
  children: React.ReactNode;
  onError?: (error: AppError) => void;
}

export function ErrorProvider({ children, onError }: ErrorProviderProps) {
  const [errors, setErrors] = useState<AppError[]>([]);
  const [lastError, setLastError] = useState<AppError | null>(null);

  const addError = useCallback((error: AppError) => {
    setErrors(prev => [...prev, error]);
    setLastError(error);
    
    // Log error
    logError(error);
    
    // Callback
    onError?.(error);
    
    // Auto-remove info errors after 5 seconds
    if (error.severity === 'info') {
      setTimeout(() => {
        setErrors(prev => prev.filter(e => e.timestamp !== error.timestamp));
      }, 5000);
    }
  }, [onError]);

  const removeError = useCallback((timestamp: string) => {
    setErrors(prev => prev.filter(e => e.timestamp.toISOString() !== timestamp));
  }, []);

  const clearErrors = useCallback(() => {
    setErrors([]);
    setLastError(null);
  }, []);

  return (
    <ErrorContext.Provider
      value={{
        errors,
        addError,
        removeError,
        clearErrors,
        lastError,
      }}
    >
      {children}
      
      {/* Global Error Display */}
      {errors.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 space-y-2">
          {errors.filter(e => e.severity !== 'info').map((error, index) => (
            <ErrorToast
              key={`${error.timestamp}-${index}`}
              error={error}
              onClose={() => removeError(error.timestamp.toISOString())}
            />
          ))}
        </div>
      )}
    </ErrorContext.Provider>
  );
}

/**
 * Einzelne Error Toast Komponente
 */
interface ErrorToastProps {
  error: AppError;
  onClose: () => void;
}

function ErrorToast({ error, onClose }: ErrorToastProps) {
  const bgColor = error.severity === 'error' ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200';
  const textColor = error.severity === 'error' ? 'text-red-800' : 'text-amber-800';
  const iconColor = error.severity === 'error' ? 'text-red-500' : 'text-amber-500';

  return (
    <div className={`${bgColor} border rounded-lg shadow-lg p-4 max-w-md animate-fade-in`}>
      <div className="flex items-start gap-3">
        <div className={`${iconColor} flex-shrink-0`}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        
        <div className="flex-1 min-w-0">
          <p className={`${textColor} font-medium`}>{error.userMessage}</p>
          {process.env.NODE_ENV === 'development' && (
            <p className={`${textColor} text-sm opacity-75 mt-1`}>
              {error.code}: {error.message}
            </p>
          )}
        </div>
        
        <button
          onClick={onClose}
          className={`${textColor} hover:opacity-75 flex-shrink-0`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/**
 * Hook für Error Context
 */
export function useErrorContext(): ErrorContextValue {
  const context = useContext(ErrorContext);
  if (context === undefined) {
    throw new Error('useErrorContext must be used within an ErrorProvider');
  }
  return context;
}

export default ErrorProvider;
