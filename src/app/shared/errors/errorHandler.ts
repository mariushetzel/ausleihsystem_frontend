/**
 * errorHandler - Zentrale Fehlerbehandlung
 * 
 * Konvertiert verschiedene Fehler-Typen in AppError
 */
import { AppError, ErrorCodes, ErrorUserMessages } from './AppError';

/**
 * Konvertiert einen beliebigen Fehler in einen AppError
 */
export function handleError(error: unknown): AppError {
  // Bereits ein AppError
  if (error instanceof AppError) {
    return error;
  }

  // HTTP Response Fehler (von fetch)
  if (error instanceof Response) {
    return handleHttpError(error);
  }

  // Standard JavaScript Error
  if (error instanceof Error) {
    // Netzwerkfehler erkennen
    if (error.message.includes('fetch') || 
        error.message.includes('network') ||
        error.message.includes('Failed to fetch')) {
      return new AppError(error.message, {
        code: ErrorCodes.API_NETWORK_ERROR,
        severity: 'error',
        userMessage: ErrorUserMessages[ErrorCodes.API_NETWORK_ERROR],
      });
    }

    // Timeout erkennen
    if (error.message.includes('timeout') || error.name === 'AbortError') {
      return new AppError(error.message, {
        code: ErrorCodes.API_TIMEOUT,
        severity: 'warning',
        userMessage: ErrorUserMessages[ErrorCodes.API_TIMEOUT],
      });
    }

    return new AppError(error.message, {
      code: ErrorCodes.UNKNOWN,
      severity: 'error',
    });
  }

  // String Fehler
  if (typeof error === 'string') {
    return new AppError(error, {
      code: ErrorCodes.UNKNOWN,
      severity: 'error',
    });
  }

  // Unbekannter Fehler
  return new AppError('Ein unerwarteter Fehler ist aufgetreten.', {
    code: ErrorCodes.UNKNOWN,
    severity: 'error',
  });
}

/**
 * Behandelt HTTP Response Fehler
 */
function handleHttpError(response: Response): AppError {
  const status = response.status;
  
  switch (status) {
    case 401:
      return new AppError(`HTTP ${status}: Unauthorized`, {
        code: ErrorCodes.AUTH_UNAUTHORIZED,
        severity: 'error',
        userMessage: ErrorUserMessages[ErrorCodes.AUTH_UNAUTHORIZED],
        details: { status },
      });
    
    case 403:
      return new AppError(`HTTP ${status}: Forbidden`, {
        code: ErrorCodes.AUTH_FORBIDDEN,
        severity: 'error',
        userMessage: ErrorUserMessages[ErrorCodes.AUTH_FORBIDDEN],
        details: { status },
      });
    
    case 404:
      return new AppError(`HTTP ${status}: Not Found`, {
        code: ErrorCodes.API_NOT_FOUND,
        severity: 'warning',
        userMessage: 'Die angeforderte Ressource wurde nicht gefunden.',
        details: { status },
      });
    
    case 500:
    case 502:
    case 503:
      return new AppError(`HTTP ${status}: Server Error`, {
        code: ErrorCodes.API_SERVER_ERROR,
        severity: 'error',
        userMessage: ErrorUserMessages[ErrorCodes.API_SERVER_ERROR],
        details: { status },
      });
    
    case 422:
      return new AppError(`HTTP ${status}: Validation Error`, {
        code: ErrorCodes.VAL_INVALID_INPUT,
        severity: 'warning',
        userMessage: 'Die Eingabe ist ungültig. Bitte überprüfen Sie Ihre Daten.',
        details: { status },
      });
    
    default:
      return new AppError(`HTTP ${status}: Unknown Error`, {
        code: ErrorCodes.UNKNOWN,
        severity: 'error',
        details: { status },
      });
  }
}

/**
 * Behandelt API Response Fehler (JSON mit { error: string })
 */
export function handleApiError(errorData: { error?: string; message?: string; code?: string }): AppError {
  const message = errorData.error || errorData.message || 'Unbekannter API Fehler';
  const code = errorData.code || ErrorCodes.UNKNOWN;
  
  // Spezifische Fehler-Behandlung basierend auf Nachricht
  const lowerMsg = message.toLowerCase();
  
  if (lowerMsg.includes('token') || lowerMsg.includes('abgelaufen')) {
    return new AppError(message, {
      code: ErrorCodes.AUTH_TOKEN_EXPIRED,
      severity: 'error',
      userMessage: ErrorUserMessages[ErrorCodes.AUTH_TOKEN_EXPIRED],
    });
  }
  
  if (lowerMsg.includes('nicht verfügbar') || lowerMsg.includes('ausgeliehen')) {
    return new AppError(message, {
      code: ErrorCodes.BIZ_ITEM_NOT_AVAILABLE,
      severity: 'warning',
      userMessage: ErrorUserMessages[ErrorCodes.BIZ_ITEM_NOT_AVAILABLE],
    });
  }
  
  if (lowerMsg.includes('maximale leihdauer') || lowerMsg.includes('tage')) {
    return new AppError(message, {
      code: ErrorCodes.BIZ_MAX_LOAN_DAYS_EXCEEDED,
      severity: 'warning',
      userMessage: ErrorUserMessages[ErrorCodes.BIZ_MAX_LOAN_DAYS_EXCEEDED],
    });
  }
  
  return new AppError(message, {
    code,
    severity: 'error',
  });
}

/**
 * Loggt Fehler an einen externen Service (optional)
 */
export function logError(error: AppError, context?: Record<string, unknown>): void {
  // In Produktion: An Sentry/LogRocket/etc. senden
  // Für jetzt: Nur Console
  if (process.env.NODE_ENV === 'production') {
    // TODO: Send to error tracking service
    console.error('[Error Tracking]', {
      ...error.toJSON(),
      context,
    });
  } else {
    console.error('[AppError]', error.toJSON(), context);
  }
}
