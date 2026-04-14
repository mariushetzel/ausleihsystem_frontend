/**
 * HttpClient - Zentraler HTTP Client für API Requests
 * 
 * Features:
 - Automatische Token-Verwaltung
 - Request/Response Interceptors
 - Fehlerbehandlung mit AppError
 - Retry-Logik
 */
import { AppError, ErrorCodes } from '../../shared/errors';
import { TokenManager } from './TokenManager';

export interface RequestConfig {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
  skipAuth?: boolean;
  retryCount?: number;
}

export interface HttpClientOptions {
  baseUrl: string;
  defaultHeaders?: Record<string, string>;
  timeout?: number;
}

export class HttpClient {
  private baseUrl: string;
  private defaultHeaders: Record<string, string>;
  private timeout: number;
  private tokenManager: TokenManager | null = null;

  constructor(options: HttpClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      ...options.defaultHeaders,
    };
    this.timeout = options.timeout || 30000; // 30s default
  }

  setTokenManager(tokenManager: TokenManager): void {
    this.tokenManager = tokenManager;
  }

  /**
   * Haupt-Request Methode
   */
  async request<T>(config: RequestConfig): Promise<T> {
    const { url, method = 'GET', body, params, headers = {}, skipAuth = false, retryCount = 1 } = config;

    // URL mit Query Params aufbauen
    let fullUrl = `${this.baseUrl}${url}`;
    if (params) {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          searchParams.append(key, String(value));
        }
      });
      const queryString = searchParams.toString();
      if (queryString) {
        fullUrl += `?${queryString}`;
      }
    }

    // Headers zusammenführen
    const requestHeaders: Record<string, string> = {
      ...this.defaultHeaders,
      ...headers,
    };

    // Auth Token hinzufügen
    if (!skipAuth && this.tokenManager) {
      const token = await this.tokenManager.getValidToken();
      if (token) {
        requestHeaders['Authorization'] = `Bearer ${token}`;
      }
    }

    // Request ausführen mit Timeout
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(fullUrl, {
        method,
        headers: requestHeaders,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Bei 401: Token erneuern und retry
      if (response.status === 401 && !skipAuth && this.tokenManager && retryCount > 0) {
        const newToken = await this.tokenManager.refreshToken();
        if (newToken) {
          return this.request<T>({ ...config, retryCount: retryCount - 1 });
        }
      }

      // Response verarbeiten
      return this.handleResponse<T>(response);

    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new AppError('Request timeout', {
          code: ErrorCodes.API_TIMEOUT,
          severity: 'error',
          userMessage: 'Die Anfrage hat zu lange gedauert.',
        });
      }

      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new AppError('Network error', {
          code: ErrorCodes.API_NETWORK_ERROR,
          severity: 'error',
          userMessage: 'Verbindungsfehler. Bitte überprüfen Sie Ihre Internetverbindung.',
        });
      }

      throw error;
    }
  }

  /**
   * Response verarbeiten
   */
  private async handleResponse<T>(response: Response): Promise<T> {
    // Leere Responses (204 No Content)
    if (response.status === 204) {
      return {} as T;
    }

    // JSON parsen
    let data: unknown;
    const contentType = response.headers.get('content-type');
    
    if (contentType?.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    // Bei Fehlerstatus: AppError werfen
    if (!response.ok) {
      // API Error Format: { error: string }
      if (typeof data === 'object' && data !== null) {
        const errorData = data as { error?: string; message?: string };
        const message = errorData.error || errorData.message || `HTTP ${response.status}`;
        
        throw new AppError(message, {
          code: this.getErrorCodeForStatus(response.status),
          severity: response.status >= 500 ? 'error' : 'warning',
          userMessage: message,
          details: { status: response.status, data },
        });
      }

      throw new AppError(`HTTP ${response.status}`, {
        code: this.getErrorCodeForStatus(response.status),
        severity: 'error',
        details: { status: response.status },
      });
    }

    return data as T;
  }

  /**
   * Error Code basierend auf HTTP Status
   */
  private getErrorCodeForStatus(status: number): string {
    switch (status) {
      case 401: return ErrorCodes.AUTH_UNAUTHORIZED;
      case 403: return ErrorCodes.AUTH_FORBIDDEN;
      case 404: return ErrorCodes.API_NOT_FOUND;
      case 422: return ErrorCodes.VAL_INVALID_INPUT;
      case 500: return ErrorCodes.API_SERVER_ERROR;
      case 502: return ErrorCodes.API_SERVER_ERROR;
      case 503: return ErrorCodes.API_SERVER_ERROR;
      default: return ErrorCodes.UNKNOWN;
    }
  }

  // Convenience Methods
  async get<T>(url: string, config: Omit<RequestConfig, 'url' | 'method'> = {}): Promise<T> {
    return this.request<T>({ ...config, url, method: 'GET' });
  }

  async post<T>(url: string, body?: unknown, config: Omit<RequestConfig, 'url' | 'method' | 'body'> = {}): Promise<T> {
    return this.request<T>({ ...config, url, method: 'POST', body });
  }

  async put<T>(url: string, body?: unknown, config: Omit<RequestConfig, 'url' | 'method' | 'body'> = {}): Promise<T> {
    return this.request<T>({ ...config, url, method: 'PUT', body });
  }

  async patch<T>(url: string, body?: unknown, config: Omit<RequestConfig, 'url' | 'method' | 'body'> = {}): Promise<T> {
    return this.request<T>({ ...config, url, method: 'PATCH', body });
  }

  async delete<T>(url: string, config: Omit<RequestConfig, 'url' | 'method'> = {}): Promise<T> {
    return this.request<T>({ ...config, url, method: 'DELETE' });
  }
}

export default HttpClient;
