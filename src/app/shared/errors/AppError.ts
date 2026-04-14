/**
 * AppError - Zentrale Fehlerklasse für das Ausleihsystem
 * 
 * Bietet strukturierte Fehler mit:
 - Message (technisch)
 - Code (für Tracking)
 - Severity (error/warning/info)
 - UserMessage (für Anzeige)
 */

export type ErrorSeverity = 'error' | 'warning' | 'info';

export interface AppErrorOptions {
  code: string;
  severity?: ErrorSeverity;
  userMessage?: string;
  details?: Record<string, unknown>;
}

export class AppError extends Error {
  public readonly code: string;
  public readonly severity: ErrorSeverity;
  public readonly userMessage: string;
  public readonly details?: Record<string, unknown>;
  public readonly timestamp: Date;

  constructor(message: string, options: AppErrorOptions) {
    super(message);
    this.name = 'AppError';
    this.code = options.code;
    this.severity = options.severity || 'error';
    this.userMessage = options.userMessage || message;
    this.details = options.details;
    this.timestamp = new Date();
    
    // Für korrekte Stack-Traces
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }

  /**
   * Konvertiert zu einem einfachen Objekt für Logging/Serialization
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      severity: this.severity,
      userMessage: this.userMessage,
      details: this.details,
      timestamp: this.timestamp.toISOString(),
      stack: this.stack,
    };
  }

  /**
   * HTTP Status Code basierend auf Severity
   */
  get httpStatus(): number {
    switch (this.severity) {
      case 'info': return 200;
      case 'warning': return 400;
      case 'error': return 500;
      default: return 500;
    }
  }
}

/**
 * Vordefinierte Fehler-Codes für das Ausleihsystem
 */
export const ErrorCodes = {
  // Auth Fehler
  AUTH_UNAUTHORIZED: 'AUTH_001',
  AUTH_TOKEN_EXPIRED: 'AUTH_002',
  AUTH_INVALID_CREDENTIALS: 'AUTH_003',
  AUTH_FORBIDDEN: 'AUTH_004',
  
  // API Fehler
  API_NETWORK_ERROR: 'API_001',
  API_TIMEOUT: 'API_002',
  API_SERVER_ERROR: 'API_003',
  API_NOT_FOUND: 'API_004',
  
  // Validation Fehler
  VAL_INVALID_INPUT: 'VAL_001',
  VAL_MISSING_FIELD: 'VAL_002',
  VAL_INVALID_DATE: 'VAL_003',
  
  // Business Logic Fehler
  BIZ_ITEM_NOT_AVAILABLE: 'BIZ_001',
  BIZ_ALREADY_BORROWED: 'BIZ_002',
  BIZ_MAX_LOAN_DAYS_EXCEEDED: 'BIZ_003',
  BIZ_INVALID_RETURN_DATE: 'BIZ_004',
  
  // Hardware Fehler
  HW_SCANNER_NOT_AVAILABLE: 'HW_001',
  HW_SCAN_TIMEOUT: 'HW_002',
  HW_DEVICE_ERROR: 'HW_003',
  
  // Unbekannt
  UNKNOWN: 'UNKNOWN',
} as const;

/**
 * Nutzerfreundliche Nachrichten für häufige Fehler
 */
export const ErrorUserMessages: Record<string, string> = {
  [ErrorCodes.AUTH_UNAUTHORIZED]: 'Bitte melden Sie sich an, um fortzufahren.',
  [ErrorCodes.AUTH_TOKEN_EXPIRED]: 'Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an.',
  [ErrorCodes.AUTH_INVALID_CREDENTIALS]: 'Ungültige Anmeldedaten. Bitte überprüfen Sie E-Mail und Passwort.',
  [ErrorCodes.AUTH_FORBIDDEN]: 'Sie haben keine Berechtigung für diese Aktion.',
  
  [ErrorCodes.API_NETWORK_ERROR]: 'Verbindungsfehler. Bitte überprüfen Sie Ihre Internetverbindung.',
  [ErrorCodes.API_TIMEOUT]: 'Die Anfrage hat zu lange gedauert. Bitte versuchen Sie es erneut.',
  [ErrorCodes.API_SERVER_ERROR]: 'Ein Serverfehler ist aufgetreten. Bitte versuchen Sie es später.',
  
  [ErrorCodes.BIZ_ITEM_NOT_AVAILABLE]: 'Diese Ware ist derzeit nicht verfügbar.',
  [ErrorCodes.BIZ_ALREADY_BORROWED]: 'Diese Ware ist bereits ausgeliehen.',
  [ErrorCodes.BIZ_MAX_LOAN_DAYS_EXCEEDED]: 'Das Rückgabedatum überschreitet die maximale Leihdauer.',
  
  [ErrorCodes.HW_SCANNER_NOT_AVAILABLE]: 'Der RFID-Scanner ist nicht verfügbar.',
  [ErrorCodes.HW_SCAN_TIMEOUT]: 'Scan-Timeout: Keine Tags gefunden.',
};
