/**
 * TokenManager - Zentrale Token-Verwaltung
 * 
 * Features:
 - Token-Refresh mit Queue (verhindert parallele Refreshes)
 - Automatische Token-Validierung
 - Speicherung in localStorage/sessionStorage
 */
import { AppError, ErrorCodes } from '../../shared/errors';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface TokenPayload {
  sub: string;
  rolle: string;
  exp: number;
  iat: number;
  jti: string;
}

export class TokenManager {
  private refreshQueue: Array<(token: string | null) => void> = [];
  private isRefreshing = false;
  private storage: Storage;

  constructor() {
    this.storage = localStorage;
  }

  /**
   * Aktuellen Token holen (ohne Validierung)
   */
  getToken(): string | null {
    return this.storage.getItem('access_token');
  }

  /**
   * Payload dekodieren
   */
  decodePayload(token: string): TokenPayload | null {
    try {
      const base64Payload = token.split('.')[1];
      const jsonPayload = atob(base64Payload);
      return JSON.parse(jsonPayload);
    } catch {
      return null;
    }
  }

  /**
   * Prüft ob Token abgelaufen ist
   */
  isTokenExpired(token: string, bufferMinutes = 2): boolean {
    const payload = this.decodePayload(token);
    if (!payload) return true;

    const expMs = payload.exp * 1000;
    const bufferMs = bufferMinutes * 60 * 1000;
    
    return Date.now() > (expMs - bufferMs);
  }

  /**
   * Holt gültigen Token (mit automatischem Refresh)
   */
  async getValidToken(): Promise<string | null> {
    const token = this.getToken();
    
    if (!token) {
      return null;
    }

    // Token noch gültig
    if (!this.isTokenExpired(token)) {
      return token;
    }

    // Token läuft ab oder ist abgelaufen -> Refresh
    return this.refreshToken();
  }

  /**
   * Token erneuern (mit Queue für parallele Requests)
   */
  async refreshToken(): Promise<string | null> {
    // Wenn bereits ein Refresh läuft, in Queue einreihen
    if (this.isRefreshing) {
      return new Promise((resolve) => {
        this.refreshQueue.push(resolve);
      });
    }

    this.isRefreshing = true;

    try {
      const refreshTokenStr = this.storage.getItem('refresh_token');
      
      if (!refreshTokenStr) {
        this.clearTokens();
        this.resolveQueue(null);
        return null;
      }

      // Refresh Request
      const baseUrl = this.getApiBaseUrl();
      const response = await fetch(`${baseUrl}/refresh/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshTokenStr }),
      });

      if (!response.ok) {
        // Bei 401/403: Token wirklich ungültig -> ausloggen
        if (response.status === 401 || response.status === 403) {
          this.clearTokens();
          window.location.href = '/';
        }
        
        this.resolveQueue(null);
        return null;
      }

      const data = await response.json() as { access_token: string; refresh_token: string };
      
      // Neue Tokens speichern
      this.setTokens({
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
      });

      // Queue auflösen
      this.resolveQueue(data.access_token);
      
      return data.access_token;

    } catch (error) {
      console.error('Token refresh failed:', error);
      this.resolveQueue(null);
      return null;
    } finally {
      this.isRefreshing = false;
    }
  }

  /**
   * Tokens setzen
   */
  setTokens(tokens: TokenPair): void {
    this.storage.setItem('access_token', tokens.accessToken);
    this.storage.setItem('refresh_token', tokens.refreshToken);
  }

  /**
   * Tokens löschen (Logout)
   */
  clearTokens(): void {
    this.storage.removeItem('access_token');
    this.storage.removeItem('refresh_token');
    this.storage.removeItem('user');
  }

  /**
   * Aktuellen Benutzer aus Token extrahieren
   */
  getCurrentUser(): { id: string; role: string } | null {
    const token = this.getToken();
    if (!token) return null;

    const payload = this.decodePayload(token);
    if (!payload) return null;

    return {
      id: payload.sub,
      role: payload.rolle,
    };
  }

  /**
   * Warteschlange für parallele Refresh-Requests auflösen
   */
  private resolveQueue(token: string | null): void {
    this.refreshQueue.forEach(resolve => resolve(token));
    this.refreshQueue = [];
  }

  /**
   * API Base URL ermitteln
   */
  private getApiBaseUrl(): string {
    const backendIp = localStorage.getItem('backend_ip');
    if (backendIp) {
      return `http://${backendIp}/api`;
    }
    
    if (import.meta.env.PROD) {
      return '/api';
    }
    
    return 'http://localhost:8000/api';
  }
}

export default TokenManager;
