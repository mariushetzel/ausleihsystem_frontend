/**
 * API - Zentraler Einstiegspunkt für alle API-Operationen
 * 
 * Dies ist die neue API-Struktur (Refactoring Priorität 5).
 * Alle Komponenten sollten von '../api/client' auf '../api' umsteigen.
 */

// Re-export alles aus der alten API während der Migrationsphase
// Die alte client.ts bleibt als Implementierung erhalten,
// aber alle Imports gehen jetzt über diese Datei.
export * from './client';

// Neue strukturierte Services (werden schrittweise implementiert)
export { WareService } from './services/WareService';
export { AusleiheService } from './services/AusleiheService';
export { AuthService } from './services/AuthService';
export { BenutzerService } from './services/BenutzerService';

// Neue HTTP Client Klassen für zukünftige Verwendung
export { HttpClient } from './client/HttpClient';
export { TokenManager } from './client/TokenManager';

// Types
export type { Ware, WarenListResponse } from './services/WareService';
export type { Ausleihe } from './services/AusleiheService';
export type { User, LoginResponse } from './services/AuthService';
export type { Benutzer, CreateBenutzerRequest } from './services/BenutzerService';
