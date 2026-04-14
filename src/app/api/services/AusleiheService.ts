/**
 * AusleiheService - API für Ausleihen
 */
import type { HttpClient } from '../client/HttpClient';

export interface Ausleihe {
  id: string;
  ware: {
    id: string;
    name: string;
    rfid_tag: string;
    schranknummer: string;
    kategorie_name?: string;
    kategorien: Array<{ id: string; name: string }>;
  };
  benutzer: {
    id: string;
    name: string;
  };
  status: 'aktiv' | 'rueckgabe_beantragt' | 'abgeschlossen' | 'verschwunden';
  ausgeliehen_am: string;
  geplante_rueckgabe?: string;
  rueckgabe_beantragt_am?: string | null;
  tatsaechliche_rueckgabe?: string | null;
  verbleib_ort?: string;
  notiz?: string;
}

export interface CreateAusleiheRequest {
  ware_id: string;
  geplante_rueckgabe?: string;
  verbleib_ort?: string;
  notiz?: string;
}

export class AusleiheService {
  constructor(private http: HttpClient) {}

  async getAll(params?: { status?: string; meine?: boolean }): Promise<Ausleihe[]> {
    return this.http.get<Ausleihe[]>('/ausleihen/', { params });
  }

  async getById(id: string): Promise<Ausleihe> {
    return this.http.get<Ausleihe>(`/ausleihen/${id}/`);
  }

  async create(data: CreateAusleiheRequest): Promise<{ success: boolean; id: string; message: string }> {
    return this.http.post('/ausleihen/', data);
  }

  async beantrageRueckgabe(id: string): Promise<{ success: boolean; message: string }> {
    return this.http.put(`/ausleihen/${id}/`, { aktion: 'rueckgabe_beantragen' });
  }

  async quittiereRueckgabe(id: string, schadensmeldung?: string): Promise<{ success: boolean; message: string }> {
    return this.http.put(`/ausleihen/${id}/`, { 
      aktion: 'rueckgabe_quittieren',
      schadensmeldung 
    });
  }

  async markiereAlsVerschwunden(id: string): Promise<{ success: boolean; message: string }> {
    return this.http.put(`/ausleihen/${id}/`, { aktion: 'ware_verschwunden' });
  }
}

export default AusleiheService;
