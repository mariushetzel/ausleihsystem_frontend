/**
 * ErrorBoundary - React Error Boundary für Fehler-Abfangen
 * 
 * Fängt JavaScript-Fehler in der Komponenten-Hierarchie ab
 * und zeigt eine Fallback-UI an.
 */
import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AppError } from './AppError';
import { handleError } from './errorHandler';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: AppError, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: AppError | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    // Nächsten Render zeigt Fallback-UI
    return {
      hasError: true,
      error: handleError(error),
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const appError = handleError(error);
    
    // Logging
    console.error('ErrorBoundary caught error:', {
      error: appError.toJSON(),
      errorInfo,
    });
    
    // Callback
    this.props.onError?.(appError, errorInfo);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      // Benutzerdefiniertes Fallback
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Standard Fallback-UI
      return (
        <div className="min-h-screen bg-gradient-to-br from-teal-50 to-emerald-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full">
            <div className="text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-8 h-8 text-red-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                Ein Fehler ist aufgetreten
              </h2>
              
              <p className="text-gray-600 mb-6">
                {this.state.error?.userMessage || 
                  'Ein unerwarteter Fehler ist aufgetreten. Bitte laden Sie die Seite neu.'}
              </p>

              {process.env.NODE_ENV === 'development' && this.state.error && (
                <details className="mb-6 text-left">
                  <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700">
                    Technische Details
                  </summary>
                  <pre className="mt-2 p-4 bg-gray-100 rounded text-xs overflow-auto">
                    {JSON.stringify(this.state.error.toJSON(), null, 2)}
                  </pre>
                </details>
              )}
              
              <div className="flex gap-3 justify-center">
                <button
                  onClick={this.handleRetry}
                  className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
                >
                  Erneut versuchen
                </button>
                
                <button
                  onClick={() => window.location.reload()}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Seite neu laden
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
