/**
 * Legacy API Client - Abwärtskompatibilität
 * 
 * Diese Datei stellt die alte API-Oberfläche aus client.ts bereit,
 * intern werden aber die neuen Services verwendet.
 * 
 * DEPRECATED: Bitte migrieren Sie zu den neuen Services:
 * import { wareService, authService } from '../api';
 */
import { wareService, ausleiheService, authService } from './index';
import { TokenManager } from './TokenManager';
import type { Ware, Ausleihe } from './index';
import { getApiBaseUrl } from './index';

// Legacy Type Aliases
export type { Ware };

export interface AusleiheLegacy extends Ausleihe {}

// Legacy Auth API
export const authApi = {
  login: (email: string, passwort: string) => authService.login(email, passwort),
  logout: () => authService.logout(),
  ping: () => authService.ping(),
  refreshToken: () => authService.refreshToken(),
};

// Legacy Waren API
export const warenApi = {
  getAll: async (params?: { limit?: number; offset?: number }) => {
    const response = await wareService.getAll(params);
    // Für Abwärtskompatibilität: Nur das Array zurückgeben, nicht das ganze Response-Objekt
    return response.waren;
  },
  
  getById: (id: string) => 
    wareService.getById(id),
  
  create: (data: { name: string; beschreibung?: string; rfid_tag?: string; schranknummer?: string; kategorie_ids?: string[] }) =>
    wareService.create(data),
  
  update: (id: string, data: Partial<{ name: string; beschreibung: string; rfid_tag: string; schranknummer: string }>) =>
    wareService.update(id, data),
  
  delete: (id: string) =>
    wareService.delete(id),
};

// Legacy Ausleihen API
export const ausleihenApi = {
  getAll: (params?: { status?: string; meine?: boolean }) =>
    ausleiheService.getAll(params),
  
  getById: (id: string) =>
    ausleiheService.getById(id),
  
  create: (data: { ware_id: string; geplante_rueckgabe?: string; verbleib_ort?: string; notiz?: string }) =>
    ausleiheService.create(data),
  
  beantrageRueckgabe: (id: string) =>
    ausleiheService.beantrageRueckgabe(id),
  
  quittiereRueckgabe: (id: string, schadensmeldung?: string) =>
    ausleiheService.quittiereRueckgabe(id, schadensmeldung),
};

// Legacy Token Helpers
export function getStoredToken(): string | null {
  return localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
}

// Re-export für vollständige Kompatibilität
export { getApiBaseUrl };
