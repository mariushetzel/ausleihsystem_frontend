// API Client für das Django Backend
export function getApiBaseUrl(): string {
  // Wenn ein backend_ip im localStorage gesetzt ist, verwende dieses
  const backendIp = localStorage.getItem('backend_ip');
  if (backendIp) {
    return `http://${backendIp}/api`;
  }
  
  // Im Production-Build: relative URL (gleicher Host, nginx proxyt zu Backend)
  // Im Development: localhost:8000
  if (import.meta.env.PROD) {
    return '/api';  // nginx proxyt /api zu localhost:8000/api
  }
  
  return 'http://localhost:8000/api';
}

// Token aus localStorage holen
function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('access_token');
  if (token) {
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }
  return {
    'Content-Type': 'application/json',
  };
}

// Prüft ob Token in den nächsten X Minuten abläuft
function isTokenExpiringSoon(minutes: number = 2): boolean {
  const token = localStorage.getItem('access_token');
  if (!token) return false;
  
  try {
    // JWT Payload dekodieren (Base64)
    const payload = JSON.parse(atob(token.split('.')[1]));
    const exp = payload.exp * 1000; // Sekunden zu Millisekunden
    const now = Date.now();
    const buffer = minutes * 60 * 1000; // Minuten zu Millisekunden
    
    const timeUntilExpiry = exp - now;
    const isExpiringSoon = timeUntilExpiry < buffer;
    
    // Token-Expiring-Log entfernt (nur Debug)
    
    return isExpiringSoon;
  } catch {
    return false;
  }
}

// Globale Variable um mehrfache parallele Refresh-Versuche zu verhindern
let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;

// Token erneuern
async function refreshToken(): Promise<string | null> {
  const refreshTokenStr = localStorage.getItem('refresh_token');
  if (!refreshTokenStr) {
    return null;
  }
  
  // Wenn bereits ein Refresh läuft, warte auf diesen
  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }
  
  isRefreshing = true;
  
  refreshPromise = (async () => {
    try {
      const response = await fetch(`${getApiBaseUrl()}/refresh/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshTokenStr }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Token Refresh fehlgeschlagen: ${response.status} - ${errorText}`);
        
        // Nur bei 401 oder 403 ausloggen (Token wirklich ungültig)
        if (response.status === 401 || response.status === 403) {
          console.log('Refresh Token ungültig, leite zu Login weiter...');
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          localStorage.removeItem('user');
          window.location.href = '/';
        }
        // Bei anderen Fehlern (Netzwerk, 500er) nicht ausloggen - nächster Versuch später
        return null;
      }
      
      const data = await response.json();
      
      // Tokens aktualisieren
      localStorage.setItem('access_token', data.access_token);
      localStorage.setItem('refresh_token', data.refresh_token);
      
      return data.access_token;
    } catch (error) {
      console.error('Token Refresh fehlgeschlagen (Netzwerkfehler?):', error);
      // Bei Netzwerkfehlern nicht ausloggen - nächster API-Call versucht es erneut
      return null;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();
  
  return refreshPromise;
}

// Neue Interfaces für das neue Backend
export interface Benutzer {
  id: string;
  vorname: string;
  nachname: string;
  email: string;
  rolle: 'Student' | 'Mitarbeiter' | 'Laborleiter' | 'Admin';
  rfid_karte?: string;
  hat_passwort: boolean;
  hat_karte: boolean;
}

export interface VerbleibOrt {
  id: string;
  name: string;
  beschreibung: string;
  reihenfolge: number;
  raumnummer_erforderlich?: boolean;
}

export interface EmailDomain {
  id: string;
  domain: string;
  beschreibung: string;
}

export interface Warenkategorie {
  id: string;
  name: string;
  beschreibung: string;
  minimale_rolle: 'Student' | 'Mitarbeiter' | 'Laborleiter' | 'Admin';
  gesperrte_verbleib_orte?: string[]; // IDs der gesperrten Verbleib-Orte
}

export interface Ware {
  id: string;
  name: string;
  beschreibung: string;
  rfid_tag: string | null;
  schranknummer: string;
  /** @deprecated Use kategorien instead */
  kategorie_id?: string | null;
  /** @deprecated Use kategorien instead */
  kategorie_name?: string | null;
  kategorien: { id: string; name: string }[];
  kategorie_ids?: string[];
  ist_ausgeliehen: boolean;
  ist_gesperrt: boolean;
  verfuegbar: boolean;
  erstellt_am?: string;
  letzte_ausleihe?: string; // Datum der letzten Ausleihe (egal ob zurückgegeben oder nicht)
  erlaubte_verbleib_orte?: string[];
}

export interface Ausleihe {
  id: string;
  ware: {
    id: string;
    name: string;
    rfid_tag: string | null;
  };
  benutzer: {
    id: string;
    name: string;
  };
  status: 'aktiv' | 'rueckgabe_beantragt' | 'zurueckgegeben' | 'abgeschlossen';
  ausgeliehen_am: string;
  geplante_rueckgabe: string | null;
  rueckgabe_beantragt_am: string | null;
  tatsaechliche_rueckgabe: string | null;
  verbleib_ort: string;
  notiz: string;
}

export interface LoginResponse {
  success: boolean;
  user: Benutzer;
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

// Hilfsfunktion für API Calls
async function apiCall<T>(
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  data?: object
): Promise<T> {
  const url = `${getApiBaseUrl()}${endpoint}`;
  
  // WICHTIG: Token erneuern wenn er bald abläuft (bei Aktivität!)
  // Aber nur wenn nicht bereits ein Refresh läuft
  if (isTokenExpiringSoon(2)) {
    const newToken = await refreshToken();
    if (!newToken) {
      // Nicht sofort ausloggen, versuche Request mit aktuellem Token
    }
  }
  
  // Wenn ein Refresh läuft, warte darauf (auch wenn Token nicht abläuft)
  // Das verhindert parallele Requests während des Refreshes
  if (isRefreshing && refreshPromise) {
    await refreshPromise;
  }
  
  const options: RequestInit = {
    method,
    headers: getAuthHeaders(),
  };

  if (data && method !== 'GET') {
    options.body = JSON.stringify(data);
  }

  let response = await fetch(url, options);
  
  // Bei 401 (Unauthorized): Versuche Token zu erneuern und Request zu wiederholen
  if (response.status === 401) {
    const newToken = await refreshToken();
    
    if (newToken) {
      // Mit neuem Token nochmal versuchen
      options.headers = getAuthHeaders();
      response = await fetch(url, options);
    } else {
      // Refresh fehlgeschlagen - ausloggen
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('user');
      localStorage.setItem('session_expired', 'true');
      window.location.href = '/';
      throw new Error('SESSION_EXPIRED');
    }
  }
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API Error: ${response.status} - ${error}`);
  }

  return response.json();
}

// =============================================================================
// AUTH API
// =============================================================================

export const authApi = {
  login: (email: string, passwort: string) => 
    apiCall<LoginResponse>('/login/', 'POST', { email, passwort }),
  
  register: (data: { vorname: string; nachname: string; email: string; passwort: string; rfid_karte?: string }) =>
    apiCall<{ success: boolean; id: string; message: string }>('/register/', 'POST', data),
  
  logout: () => 
    apiCall<{ success: boolean }>('/logout/', 'POST'),
  
  refresh: (refreshToken: string) => 
    apiCall<{ access_token: string; refresh_token: string; expires_in: number }>('/refresh/', 'POST', { refresh_token: refreshToken }),
  
  me: () => 
    apiCall<Benutzer>('/me/'),
  
  ping: () => 
    apiCall<{ ping: boolean; timestamp: string }>('/ping/'),
  
  pingAuth: () =>
    apiCall<{ ping: boolean; user_id: string; rolle: string; timestamp: string }>('/ping-auth/'),
};

// =============================================================================
// BENUTZER API (Benutzerverwaltung)
// =============================================================================

export const benutzerApi = {
  // Alle Benutzer laden (nur Laborleiter/Admin)
  getAll: () => apiCall<Benutzer[]>('/benutzer/'),
  
  // Einzelnen Benutzer laden
  getById: (id: string) => apiCall<Benutzer>(`/benutzer/${id}/`),
  
  // Benutzer erstellen (nur Laborleiter/Admin) - Passwort optional (dann Login per Karte)
  create: (data: { vorname: string; nachname: string; email: string; passwort?: string; rolle: string; rfid_karte?: string }) =>
    apiCall<{ success: boolean; id: string; message: string }>('/benutzer/', 'POST', data),
  
  // Benutzer aktualisieren (eigener oder niedrigere Rolle)
  update: (id: string, data: Partial<Benutzer> & { passwort?: string }) =>
    apiCall<{ success: boolean; message: string }>(`/benutzer/${id}/`, 'PUT', data),
  
  // Benutzer deaktivieren (nur Laborleiter/Admin)
  delete: (id: string) =>
    apiCall<{ success: boolean; message: string }>(`/benutzer/${id}/`, 'DELETE'),
  
  // Prüfen ob Karte bereits vergeben ist
  checkCard: (rfidKarte: string) =>
    apiCall<{ vergeben: boolean; benutzer?: { id: string; vorname: string; nachname: string; email: string } }>(`/check-card/${rfidKarte}/`),
};

// =============================================================================
// WAREN API
// =============================================================================

export const warenApi = {
  // Alle Waren laden (mit Pagination)
  getAll: (params?: { limit?: number; offset?: number }) => {
    const queryParams = new URLSearchParams();
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.offset) queryParams.append('offset', params.offset.toString());
    const query = queryParams.toString();
    return apiCall<{ waren: Ware[]; total: number; limit: number; offset: number; has_more: boolean }>(`/waren/${query ? '?' + query : ''}`);
  },
  
  // Einzelne Ware laden
  getById: (id: string) => apiCall<Ware>(`/waren/${id}/`),
  
  // Neue Ware erstellen (nur Mitarbeiter+)
  create: (data: Partial<Ware>) => apiCall<{ success: boolean; id: string }>('/waren/', 'POST', data),
  
  // Ware bearbeiten (nur Mitarbeiter+)
  update: (id: string, data: Partial<Ware>) => apiCall<{ success: boolean }>(`/waren/${id}/`, 'PUT', data),
  
  // Ware löschen/deaktivieren (nur Mitarbeiter+)
  delete: (id: string) => apiCall<{ success: boolean }>(`/waren/${id}/`, 'DELETE'),
};

// =============================================================================
// KATEGORIEN API
// =============================================================================

export const kategorienApi = {
  getAll: () => apiCall<Warenkategorie[]>('/kategorien/'),
  create: (name: string, beschreibung?: string, minimale_rolle?: 'Student' | 'Mitarbeiter' | 'Laborleiter' | 'Admin') => 
    apiCall<{id: string; name: string; beschreibung: string; minimale_rolle: string; existing: boolean; message: string}>('/kategorien/', 'POST', { name, beschreibung, minimale_rolle }),
  update: (id: string, data: { name?: string; beschreibung?: string; minimale_rolle?: string }) =>
    apiCall<{id: string; name: string; beschreibung: string; minimale_rolle: string; message: string}>(`/kategorien/${id}/`, 'PUT', data),
  delete: (id: string) =>
    apiCall<{success: boolean; message: string}>(`/kategorien/${id}/`, 'DELETE'),
  // Gesperrte Verbleib-Orte für eine Kategorie
  getGesperrteVerbleibOrte: (kategorieId: string) =>
    apiCall<{id: string; name: string}[]>(`/kategorien/${kategorieId}/verbleib/`),
  updateGesperrteVerbleibOrte: (kategorieId: string, verbleibOrtIds: string[]) =>
    apiCall<{success: boolean; message: string; gesperrte_verbleib_orte: {id: string; name: string}[]}>(`/kategorien/${kategorieId}/verbleib/`, 'PUT', { gesperrte_verbleib_orte: verbleibOrtIds }),
};

// =============================================================================
// KATEGORIE-VERBLEIB MATRIX API
// =============================================================================

export interface MatrixZelle {
  minimale_rolle: 'Student' | 'Mitarbeiter' | 'Laborleiter' | 'Admin';
  gesperrt: boolean;
  maximale_leihdauer_tage: number | null;
}

export interface MatrixKategorie {
  id: string;
  name: string;
  zellen: Record<string, MatrixZelle>; // key: verbleib_ort_id
}

export interface MatrixData {
  kategorien: MatrixKategorie[];
  verbleib_orte: VerbleibOrt[];
}

export const kategorieVerbleibMatrixApi = {
  // Matrix laden
  getMatrix: () => apiCall<MatrixData>('/kategorie-verbleib-matrix/'),
  
  // Regel erstellen/aktualisieren
  updateRegel: (kategorieId: string, verbleibOrtId: string, data: { minimale_rolle: string; gesperrt: boolean; maximale_leihdauer_tage?: number | null }) =>
    apiCall<{id: string; kategorie_id: string; verbleib_ort_id: string; minimale_rolle: string; gesperrt: boolean; maximale_leihdauer_tage: number | null; created: boolean; message: string}>('/kategorie-verbleib-regel/', 'PUT', { 
      kategorie_id: kategorieId, 
      verbleib_ort_id: verbleibOrtId, 
      ...data 
    }),
  
  // Maximale Leihdauer abfragen
  getMaxLeihdauer: (kategorieId: string, ortId: string) =>
    apiCall<{kategorie_id: string; ort_id: string; maximale_leihdauer_tage: number | null}>('/max-leihdauer/', 'GET', { kategorie_id: kategorieId, ort_id: ortId }),
  
  // Verfügbare Zeiträume für eine Ware abfragen
  getVerfuegbareZeitraeume: (wareId: string, ortId?: string) => {
    const params = new URLSearchParams();
    params.append('ware_id', wareId);
    if (ortId) params.append('ort_id', ortId);
    return apiCall<{
      ware_id: string;
      ort_id: string | null;
      maximale_leihdauer_tage: number | null;
      blockierte_zeitraeume: Array<{
        von: string | null;
        bis: string | null;
        ausleihe_id: string;
        benutzer: string;
      }>;
    }>(`/verfuegbare-zeitraeume/?${params.toString()}`, 'GET');
  },
  
  // Regel löschen (zurücksetzen auf Standard)
  deleteRegel: (kategorieId: string, verbleibOrtId: string) =>
    apiCall<{success: boolean; message: string}>('/kategorie-verbleib-regel/', 'DELETE', { 
      kategorie_id: kategorieId, 
      verbleib_ort_id: verbleibOrtId 
    }),
};

// =============================================================================
// VERBLEIB ORTE API
// =============================================================================

export const verbleibOrtApi = {
  getAll: () => apiCall<VerbleibOrt[]>('/verbleib-orte/'),
  create: (name: string, beschreibung?: string, reihenfolge?: number, raumnummer_erforderlich?: boolean) =>
    apiCall<{id: string; name: string; beschreibung: string; reihenfolge: number; raumnummer_erforderlich: boolean; existing: boolean; message: string}>('/verbleib-orte/', 'POST', { name, beschreibung, reihenfolge, raumnummer_erforderlich }),
  update: (id: string, data: { name?: string; beschreibung?: string; reihenfolge?: number; raumnummer_erforderlich?: boolean }) =>
    apiCall<{id: string; name: string; beschreibung: string; reihenfolge: number; raumnummer_erforderlich: boolean; message: string}>(`/verbleib-orte/${id}/`, 'PUT', data),
  delete: (id: string) =>
    apiCall<{success: boolean; message: string}>(`/verbleib-orte/${id}/`, 'DELETE'),
};

// =============================================================================
// EMAIL DOMAINS API
// =============================================================================

export const emailDomainApi = {
  getAll: () => apiCall<EmailDomain[]>('/email-domains/'),
  create: (domain: string, beschreibung?: string) =>
    apiCall<{id: string; domain: string; beschreibung: string; existing: boolean; message: string}>('/email-domains/', 'POST', { domain, beschreibung }),
  update: (id: string, data: { domain?: string; beschreibung?: string }) =>
    apiCall<{id: string; domain: string; beschreibung: string; message: string}>(`/email-domains/${id}/`, 'PUT', data),
  delete: (id: string) =>
    apiCall<{success: boolean; message: string}>(`/email-domains/${id}/`, 'DELETE'),
};

// =============================================================================
// AUSLEIHEN API
// =============================================================================

export const ausleihenApi = {
  // Alle Ausleihen laden (eigene oder alle je nach Rolle)
  getAll: (params?: { status?: string; meine?: boolean }) => {
    const queryParams = new URLSearchParams();
    if (params?.status) queryParams.append('status', params.status);
    if (params?.meine) queryParams.append('meine', 'true');
    const query = queryParams.toString();
    return apiCall<Ausleihe[]>(`/ausleihen/${query ? '?' + query : ''}`);
  },
  
  // Eigene Ausleihen laden (für Student/Mitarbeiter)
  getMyBorrowings: () => {
    return apiCall<Ausleihe[]>(`/ausleihen/?meine=true&status=aktiv`);
  },
  
  // Neue Ausleihe erstellen
  create: (wareId: string, data: { geplante_rueckgabe?: string; verbleib_ort?: string; notiz?: string }) =>
    apiCall<{ success: boolean; id: string }>('/ausleihen/', 'POST', { ware_id: wareId, ...data }),
  
  // Ausleihe-Details laden
  getById: (id: string) => apiCall<Ausleihe>(`/ausleihen/${id}/`),
  
  // Rückgabe beantragen
  beantrageRueckgabe: (id: string) =>
    apiCall<{ success: boolean }>(`/ausleihen/${id}/`, 'PUT', { aktion: 'rueckgabe_beantragen' }),
  
  // Rückgabe quittieren (nur Mitarbeiter+)
  quittiereRueckgabe: (id: string, zustand: string = 'gut', kommentar: string = '') =>
    apiCall<{ success: boolean }>(`/ausleihen/${id}/`, 'PUT', { aktion: 'rueckgabe_quittieren', zustand, kommentar }),
  
  // Ware als verschwunden markieren (Rückgabe quittieren + Soft-Delete)
  markiereAlsVerschwunden: (id: string, kommentar?: string) =>
    apiCall<{ success: boolean }>(`/ausleihen/${id}/`, 'PUT', { 
      aktion: 'ware_verschwunden',
      kommentar: kommentar || 'Verschwunden'
    }),
};

// =============================================================================
// SCHADENSMELDUNGEN API
// =============================================================================

export interface Schadensmeldung {
  id: string;
  ware_id: string;
  ware_name?: string;
  ausleihe_id?: string;
  beschreibung: string;
  rueckgeber?: {
    id: string;
    name: string;
  };
  erstellt_am: string;
  quittiert: boolean;
  quittierer?: {
    id: string;
    name: string;
  };
  quittiert_am?: string;
  quittierer_beschreibung?: string;
}

export const schadensmeldungApi = {
  // Alle Meldungen für eine Ware oder Ausleihe
  getAll: (params?: { ware_id?: string; ausleihe_id?: string }) => {
    const queryParams = new URLSearchParams();
    if (params?.ware_id) queryParams.append('ware_id', params.ware_id);
    if (params?.ausleihe_id) queryParams.append('ausleihe_id', params.ausleihe_id);
    const query = queryParams.toString();
    return apiCall<Schadensmeldung[]>(`/schadensmeldungen/${query ? '?' + query : ''}`);
  },
  
  // Neue Meldung erstellen
  create: (data: { ware_id: string; beschreibung: string; ausleihe_id?: string }) =>
    apiCall<Schadensmeldung>('/schadensmeldungen/', 'POST', data),
  
  // Einzelne Meldung anzeigen
  getById: (id: string) =>
    apiCall<Schadensmeldung>(`/schadensmeldungen/${id}/`),
  
  // Meldung quittieren
  quittieren: (id: string, beschreibung?: string, quittierer_beschreibung?: string) =>
    apiCall<Schadensmeldung>(`/schadensmeldungen/${id}/`, 'PUT', { beschreibung, quittierer_beschreibung }),
  
  // Offene Meldungen für eine Ausleihe
  getOffene: (ausleihe_id: string) =>
    apiCall<Schadensmeldung[]>(`/schadensmeldungen/offen/?ausleihe_id=${ausleihe_id}`),
  
  // Alle Meldungen für eine spezifische Ware
  getByWare: (wareId: string) =>
    apiCall<Schadensmeldung[]>(`/waren/${wareId}/schadensmeldungen/`),
};

// =============================================================================
// HISTORIE API
// =============================================================================

export interface HistoryEntry {
  id: string;
  ware: {
    id: string;
    name: string;
    rfid_tag?: string;
  };
  benutzer?: {
    id: string;
    name: string;
  };
  ausgeliehen_am: string;
  rueckgegeben_am?: string;
  geplante_rueckgabe?: string;
  zustand?: string;
}

export const historieApi = {
  getAll: (params?: { ware_id?: string; benutzer_id?: string }) => {
    const queryParams = new URLSearchParams();
    if (params?.ware_id) queryParams.append('ware_id', params.ware_id);
    if (params?.benutzer_id) queryParams.append('benutzer_id', params.benutzer_id);
    const query = queryParams.toString();
    return apiCall<HistoryEntry[]>(`/historie/${query ? '?' + query : ''}`);
  },
  
  // Eigene Ausleihhistorie laden
  getMyHistory: () => {
    return apiCall<HistoryEntry[]>(`/historie/?meine=true`);
  },
};

// =============================================================================
// RFID ANTENNEN API
// =============================================================================

export interface TagInfo {
  timer: number;
  rssi: number;
  ant: number;
  cn: number;
  epc_len: number;
  epc: string;
  name: string;
  desc: string;
  loaned_by: string;
  ware_id?: string;
  ware_name?: string;

  ist_ausgeliehen?: boolean;
}

export interface DeviceParams {
  DEVICEARRD: number;
  RFIDPRO: number;
  WORKMODE: number;
  INTERFACE: number;
  BAUDRATE: number;
  WGSET: number;
  ANT: number;
  REGION: number;
  STRATFREI: number;
  STEPFRE: number;
  CN: number;
  RFIDPOWER: number;
  INVENTORYAREA: number;
  QVALUE: number;
  SESSION: number;
  ACSADDR: number;
  ACSDATALEN: number;
  FILTERTIME: number;
  TRIGGLETIME: number;
  BUZZERTIME: number;
  INTERNELTIME: number;
}

export const rfidAntennaApi = {
  // Verfügbare Ports laden
  getPorts: () => apiCall<{ ports: string[] }>('/getPorts/'),
  
  // Scanning-Status prüfen
  getScanningStatus: () => apiCall<{ scanning: boolean; info?: { user_id: string; since: string } }>('/scanningStatus/'),
  
  // Gerät öffnen (mit Session-ID für Locking)
  openDevice: (port: string, baudrate: number, sessionId?: string) =>
    apiCall<{ res: number; success: boolean; log: string; hComm: number; session_id?: string; locked_by?: string }>('/openDevice/', 'POST', { port, baudrate, session_id: sessionId }),
  
  // Gerät schließen
  closeDevice: (hComm: number, sessionId?: string) =>
    apiCall<{ res: number; success: boolean; log: string }>('/closeDevice/', 'POST', { hComm, session_id: sessionId }),
  
  // Tag-Scanning starten
  startCounting: (hComm: number, params: Partial<DeviceParams>) =>
    apiCall<{ res: number; success: boolean; log: string }>('/startCounting/', 'POST', { hComm, ...params }),
  
  // Tag-Info abrufen
  getTagInfo: () => apiCall<TagInfo[]>('/getTagInfo/'),
  
  // Scanning stoppen
  inventoryStop: (hComm: number, timeout: number = 0) =>
    apiCall<{ res: number; success: boolean; log: string }>('/inventoryStop/', 'POST', { hComm, timeout }),
  
  // Geräte-Parameter laden
  getDevicePara: (hComm: number) =>
    apiCall<DeviceParams>('/getDevicePara/', 'POST', { hComm }),
  
  // Geräte-Parameter setzen
  setDevicePara: (hComm: number, params: Partial<DeviceParams>) =>
    apiCall<{ res: number; success: boolean; log: string }>('/setDevicePara/', 'POST', { hComm, ...params }),
  
  // Gerät rebooten
  rebootDevice: (hComm: number) =>
    apiCall<{ res: number; success: boolean; log: string }>('/rebootDevice/', 'POST', { hComm }),
  
};

// =============================================================================
// KARTENLESER API (mit Authentifizierung)
// =============================================================================

export const cardReaderApi = {
  start: (port: string = '/dev/ttyUSB0', baudrate: number = 9600, sessionId?: string, userId?: string) =>
    apiCall<{ success: boolean; error?: string; session_id?: string }>('/startCardReader/', 'POST', { 
      port, 
      baudrate, 
      session_id: sessionId,
      user_id: userId 
    }),
  
  getData: (sessionId?: string, userId?: string) =>
    apiCall<{ success: boolean; code: string }>(`/getCardReaderData/?session_id=${sessionId || ''}&user_id=${userId || ''}`),
  
  stop: (sessionId?: string, userId?: string) =>
    apiCall<{ success: boolean; error?: string }>('/stopCardReader/', 'POST', { session_id: sessionId, user_id: userId }),
};

// =============================================================================
// ÖFFENTLICHE KARTENLESER API (OHNE Authentifizierung - für Login/Registrierung)
// =============================================================================

async function publicApiCall<T>(
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  data?: object
): Promise<T> {
  const url = `${getApiBaseUrl()}${endpoint}`;
  
  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };

  if (data && method !== 'GET') {
    options.body = JSON.stringify(data);
  }

  const response = await fetch(url, options);
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API Error: ${response.status} - ${error}`);
  }

  return response.json();
}

export const publicCardReaderApi = {
  /** Startet den Kartenleser - KEIN Token nötig (für Registrierung/Login) */
  start: (port: string = '/dev/ttyUSB0', baudrate: number = 9600, sessionId?: string, userId?: string) =>
    publicApiCall<{ success: boolean; error?: string; session_id?: string }>('/startCardReader/', 'POST', { 
      port, 
      baudrate, 
      session_id: sessionId,
      user_id: userId 
    }),
  
  /** Liest gescannte Karte aus - KEIN Token nötig */
  getData: (sessionId?: string, userId?: string) =>
    publicApiCall<{ success: boolean; code: string; error?: string }>(`/getCardReaderData/?session_id=${sessionId || ''}&user_id=${userId || ''}`, 'GET'),
  
  /** Stoppt den Kartenleser - KEIN Token nötig */
  stop: (sessionId?: string, userId?: string) =>
    publicApiCall<{ success: boolean; error?: string }>('/stopCardReader/', 'POST', { session_id: sessionId, user_id: userId }),
};

// =============================================================================
// SYSTEM-EINSTELLUNGEN API (Serverseitige globale Einstellungen)
// =============================================================================

export interface SystemEinstellung {
  id: string;
  schluessel: string;
  wert: string;
  beschreibung: string;
  aktualisiert_am: string;
}

export const systemEinstellungenApi = {
  /** Holt alle System-Einstellungen (nur authentifiziert) */
  getAll: () =>
    apiCall<SystemEinstellung[]>('/system-einstellungen/'),
  
  /** Holt eine spezifische Einstellung (nur authentifiziert) */
  get: (schluessel: string) =>
    apiCall<SystemEinstellung>(`/system-einstellungen/${schluessel}/`),
  
  /** Aktualisiert eine Einstellung (nur Laborleiter/Admin) */
  set: (schluessel: string, wert: string, beschreibung?: string) =>
    apiCall<{ success: boolean; message: string; id: string }>('/system-einstellungen-aktualisieren/', 'POST', {
      schluessel,
      wert,
      beschreibung
    }),
  
  /** Holt öffentliche Einstellungen (kein Token nötig) - wird beim App-Start geladen */
  getOeffentlich: () =>
    publicApiCall<{
      antenna_port: string;
      antenna_baudrate: string;
      cardreader_port: string;
      cardreader_baudrate: string;
    }>('/system-einstellungen-oeffentlich/'),
};

// =============================================================================
// ALTE INTERFACES (für Abwärtskompatibilität)
// =============================================================================

export interface Tool {
  id: number;
  name: string;
  description: string;
  tagid: string | null;
  cabinet_number: string | null;
  categories: string[];
}

export interface Loan {
  tool: Tool;
  user: {
    cardID: string;
    name: string;
    nachname: string;
    email: string;
  };
  note: string;
  borrow_date: string;
  return_date: string;
}

// Legacy Interface für alte API-Struktur
export interface LegacyHistoryEntry {
  tagid: string;
  toolname: string;
  description: string;
  cardID: string;
  name: string;
  nachname: string;
  email: string;
  note: string;
  borrow_date: string;
  return_date: string;
  returned_date: string;
  returned_by: string;
}

export interface NewToolData {
  name?: string;
  description?: string;
  tagid?: string | null;
  cabinet_number?: string;
  category_ids?: string[];
}

// Alte API-Names für Kompatibilität
export const toolsApi = {
  getAll: warenApi.getAll,
  create: (data: NewToolData) => warenApi.create({
    name: data.name,
    beschreibung: data.description,
    rfid_tag: data.tagid,
    schranknummer: data.cabinet_number,
    kategorie_ids: data.category_ids || [],
  }),
  update: (id: string, data: Partial<NewToolData>) => warenApi.update(id, {
    name: data.name,
    beschreibung: data.description,
    rfid_tag: data.tagid,
    schranknummer: data.cabinet_number,
    kategorie_ids: data.category_ids || [],

  }),
  delete: warenApi.delete,
};

export const loansApi = {
  getAll: ausleihenApi.getAll,
};

export const historyApi = {
  getAll: historieApi.getAll,
};

// Health Check
export const ping = () => authApi.ping();
