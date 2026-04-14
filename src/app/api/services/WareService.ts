/**
 * WareService - API für Waren
 */
import type { HttpClient } from '../client/HttpClient';

export interface Ware {
  id: string;
  name: string;
  beschreibung: string;
  kategorien: Array<{ id: string; name: string }>;
  kategorie_ids: string[];
  rfid_tag: string;
  schranknummer: string;
  ist_ausgeliehen: boolean;
  ist_gesperrt: boolean;
  verfuegbar: boolean;
  erlaubte_verbleib_orte: string[];
  erstellt_am: string;
  letzte_ausleihe?: string;
}

export interface WarenListResponse {
  waren: Ware[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

export interface CreateWareRequest {
  name: string;
  beschreibung?: string;
  rfid_tag?: string;
  schranknummer?: string;
  kategorie_ids?: string[];
  labor_id?: string;
}

export class WareService {
  constructor(private http: HttpClient) {}

  async getAll(params?: { 
    limit?: number; 
    offset?: number; 
    kategorie?: string;
    verfuegbar?: boolean;
  }): Promise<WarenListResponse> {
    return this.http.get<WarenListResponse>('/waren/', { params });
  }

  async getById(id: string): Promise<Ware> {
    return this.http.get<Ware>(`/waren/${id}/`);
  }

  async create(data: CreateWareRequest): Promise<{ success: boolean; id: string; message: string }> {
    return this.http.post('/waren/', data);
  }

  async update(id: string, data: Partial<CreateWareRequest>): Promise<{ success: boolean; message: string }> {
    return this.http.put(`/waren/${id}/`, data);
  }

  async delete(id: string): Promise<{ success: boolean; message: string }> {
    return this.http.delete(`/waren/${id}/`);
  }

  async getSchadensmeldungen(wareId: string): Promise<Array<{
    id: string;
    beschreibung: string;
    gemeldet_am: string;
    benutzer: string;
  }>> {
    return this.http.get(`/waren/${wareId}/schadensmeldungen/`);
  }
}

export default WareService;
