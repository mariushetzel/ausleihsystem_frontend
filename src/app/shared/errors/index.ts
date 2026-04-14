/**
 * Error Handling - Zentrale Exporte
 */

// Klassen & Typen
export { AppError, ErrorCodes, ErrorUserMessages } from './AppError';
export type { ErrorSeverity, AppErrorOptions } from './AppError';

// Handler
export { handleError, handleApiError, logError } from './errorHandler';

// React Komponenten
export { ErrorBoundary } from './ErrorBoundary';
export { ErrorProvider, useErrorContext } from './ErrorProvider';

// Hooks
export { useAsync, apiCallWithErrorHandling } from '../hooks/useAsync';
export type { AsyncState, AsyncStatus, UseAsyncOptions, UseAsyncReturn } from '../hooks/useAsync';
