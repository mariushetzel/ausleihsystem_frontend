/**
 * Shared Types für das gesamte Ausleihsystem
 */

export interface Item {
  id: string;
  name: string;
  description: string;
  tagId: string;
  cabinetNumber: string;
  categories: string[];
  categoryIds: string[];
  borrowable: boolean;
  borrowedBy?: string;
  borrowedAt?: string;
  letzteAusleihe?: string;
  returnDate?: string;
  location?: string;
  borrowingStatus?: string;
  borrowingId?: string;
  erlaubteVerbleibOrte: string[];
  erstelltAm?: string;
}

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

export interface CartItem {
  item: Item;
  returnDate: string;
  location: string;
}

export type UserRole = 'Student' | 'Mitarbeiter' | 'Laborleiter' | 'Admin';

export interface User {
  id: string;
  vorname: string;
  nachname: string;
  email: string;
  rolle: UserRole;
}

// API Response Typen
export interface ApiError {
  error: string;
}

export interface PaginationResult<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}
