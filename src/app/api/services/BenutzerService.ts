import type { HttpClient } from '../client/HttpClient';

export interface Benutzer {
  id: string;
  vorname: string;
  nachname: string;
  email: string;
  rolle: string;
  rfid_karte?: string;
  hat_passwort: boolean;
  hat_karte: boolean;
}

export interface CreateBenutzerRequest {
  email: string;
  vorname: string;
  nachname: string;
  passwort?: string;
  rolle?: string;
  rfid_karte?: string;
  labor_id?: string;
}

export class BenutzerService {
  constructor(private http: HttpClient) {}

  async getAll(): Promise<Benutzer[]> {
    return this.http.get<Benutzer[]>('/benutzer/');
  }

  async getById(id: string): Promise<Benutzer> {
    return this.http.get<Benutzer>(`/benutzer/${id}/`);
  }

  async create(data: CreateBenutzerRequest): Promise<{ success: boolean; id: string; message: string }> {
    return this.http.post('/benutzer/', data);
  }

  async update(id: string, data: Partial<CreateBenutzerRequest>): Promise<{ success: boolean; message: string }> {
    return this.http.put(`/benutzer/${id}/`, data);
  }

  async delete(id: string): Promise<{ success: boolean; message: string }> {
    return this.http.delete(`/benutzer/${id}/`);
  }

  async checkCard(rfidKarte: string, exclude?: string): Promise<{ vergeben: boolean; benutzer?: Benutzer }> {
    return this.http.get(`/check-card/${rfidKarte}/`, { params: { exclude } });
  }
}

export default BenutzerService;
