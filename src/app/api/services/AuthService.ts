/**
 * AuthService - API für Authentifizierung
 */
import type { HttpClient } from '../client/HttpClient';
import type { TokenManager } from '../client/TokenManager';

export interface User {
  id: string;
  vorname: string;
  nachname: string;
  email: string;
  rolle: string;
}

export interface LoginResponse {
  success: boolean;
  user: User;
  access_token: string;
  refresh_token: string;
}

export interface RegisterRequest {
  email: string;
  passwort: string;
  vorname: string;
  nachname: string;
  rfid_karte?: string;
}

export class AuthService {
  constructor(
    private http: HttpClient,
    private tokenManager: TokenManager
  ) {}

  async login(email: string, passwort: string): Promise<LoginResponse> {
    const response = await this.http.post<LoginResponse>('/login/', { email, passwort }, { skipAuth: true });
    
    this.tokenManager.setTokens({
      accessToken: response.access_token,
      refreshToken: response.refresh_token,
    });
    
    return response;
  }

  async loginWithCard(rfidKarte: string): Promise<LoginResponse> {
    const response = await this.http.post<LoginResponse>('/login/', { rfid_karte: rfidKarte }, { skipAuth: true });
    
    this.tokenManager.setTokens({
      accessToken: response.access_token,
      refreshToken: response.refresh_token,
    });
    
    return response;
  }

  async register(data: RegisterRequest): Promise<{ success: boolean; id: string; message: string }> {
    return this.http.post('/register/', data, { skipAuth: true });
  }

  async logout(): Promise<void> {
    try {
      await this.http.post('/logout/', {});
    } finally {
      this.tokenManager.clearTokens();
    }
  }

  async refreshToken(): Promise<{ success: boolean; access_token: string; refresh_token: string } | null> {
    const token = await this.tokenManager.refreshToken();
    if (!token) return null;
    
    return {
      success: true,
      access_token: token,
      refresh_token: this.tokenManager.getToken() || '',
    };
  }

  async getCurrentUser(): Promise<User | null> {
    try {
      return await this.http.get<User>('/me/');
    } catch {
      return null;
    }
  }

  async ping(): Promise<{ ping: boolean }> {
    return this.http.get('/ping/', { skipAuth: true });
  }

  async pingAuth(): Promise<{ ping: boolean; user: User }> {
    return this.http.get('/ping-auth/');
  }

  isLoggedIn(): boolean {
    return !!this.tokenManager.getToken();
  }

  getCurrentUserFromToken(): { id: string; role: string } | null {
    return this.tokenManager.getCurrentUser();
  }
}

export default AuthService;
