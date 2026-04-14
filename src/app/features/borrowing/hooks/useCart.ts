/**
 * useCart Hook - Warenkorb-Verwaltung
 */
import { useState, useCallback, useMemo } from 'react';
import type { Item, CartItem } from '../../../shared/types';

export interface UseCartReturn {
  cart: CartItem[];
  cartReturnDate: string;
  cartLocation: string;
  selectedVerbleibOrtId: string;
  roomNumber: string;
  addToCart: (item: Item) => boolean;
  removeFromCart: (itemId: string) => void;
  clearCart: () => void;
  isInCart: (itemId: string) => boolean;
  setCartReturnDate: (date: string) => void;
  setCartLocation: (location: string) => void;
  setSelectedVerbleibOrtId: (id: string) => void;
  setRoomNumber: (room: string) => void;
  cartItemCount: number;
}

export function useCart(): UseCartReturn {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartReturnDate, setCartReturnDate] = useState('');
  const [cartLocation, setCartLocation] = useState('');
  const [selectedVerbleibOrtId, setSelectedVerbleibOrtId] = useState('');
  const [roomNumber, setRoomNumber] = useState('');

  const addToCart = useCallback((item: Item): boolean => {
    setCart(prev => {
      if (prev.find(c => c.item.id === item.id)) {
        return prev; // Already in cart
      }
      return [...prev, { item, returnDate: '', location: '' }];
    });
    return true;
  }, []);

  const removeFromCart = useCallback((itemId: string) => {
    setCart(prev => prev.filter(c => c.item.id !== itemId));
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
    setCartReturnDate('');
    setCartLocation('');
    setSelectedVerbleibOrtId('');
    setRoomNumber('');
  }, []);

  const isInCart = useCallback((itemId: string): boolean => {
    return cart.some(c => c.item.id === itemId);
  }, [cart]);

  const cartItemCount = useMemo(() => cart.length, [cart]);

  return {
    cart,
    cartReturnDate,
    cartLocation,
    selectedVerbleibOrtId,
    roomNumber,
    addToCart,
    removeFromCart,
    clearCart,
    isInCart,
    setCartReturnDate,
    setCartLocation,
    setSelectedVerbleibOrtId,
    setRoomNumber,
    cartItemCount
  };
}

export default useCart;
