/**
 * CartPanel Component - Warenkorb-Anzeige
 */
import { ShoppingCart, X } from 'lucide-react';
import type { CartItem, Item } from '../../../shared/types';

interface CartPanelProps {
  cart: CartItem[];
  cartReturnDate: string;
  cartLocation: string;
  selectedVerbleibOrtId: string;
  roomNumber: string;
  verbleibOrte: Array<{ id: string; name: string; raumnummer_erforderlich: boolean }>;
  maxLeihdauerTage: number | null;
  blockierteZeitraeume: Array<{ von: string; bis: string }>;
  ladeZeitraeume: boolean;
  gesperrteVerbleibOrte: Set<string>;
  onRemoveItem: (itemId: string) => void;
  onReturnDateChange: (date: string) => void;
  onVerbleibOrtChange: (ortId: string, ortName: string, needsRoomNumber: boolean) => void;
  onRoomNumberChange: (room: string) => void;
  onShowItemInfo: (itemId: string) => void;
  onBorrowAll: () => void;
  onClearCart: () => void;
}

export function CartPanel({
  cart,
  cartReturnDate,
  selectedVerbleibOrtId,
  roomNumber,
  verbleibOrte,
  maxLeihdauerTage,
  blockierteZeitraeume,
  ladeZeitraeume,
  gesperrteVerbleibOrte,
  onRemoveItem,
  onReturnDateChange,
  onVerbleibOrtChange,
  onRoomNumberChange,
  onShowItemInfo,
  onBorrowAll,
  onClearCart
}: CartPanelProps) {
  if (cart.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex items-center gap-2 mb-4">
          <ShoppingCart className="w-5 h-5 text-teal-600" />
          <h2 className="text-lg font-semibold">Warenkorb</h2>
        </div>
        <p className="text-gray-500 text-center py-4">Warenkorb ist leer</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ShoppingCart className="w-5 h-5 text-teal-600" />
          <h2 className="text-lg font-semibold">Warenkorb ({cart.length})</h2>
        </div>
        <button
          onClick={onClearCart}
          className="text-sm text-red-500 hover:text-red-700"
        >
          Leeren
        </button>
      </div>

      {/* Verbleib-Ort Auswahl */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Verbleib *
        </label>
        <div className="space-y-2">
          {verbleibOrte.map(ort => {
            const isGesperrt = gesperrteVerbleibOrte.has(ort.id);
            const isSelected = selectedVerbleibOrtId === ort.id;
            
            return (
              <div key={ort.id}>
                <label className={`flex items-center gap-2 cursor-pointer ${
                  isGesperrt ? 'opacity-50 cursor-not-allowed' : ''
                }`}>
                  <input
                    type="radio"
                    name="verbleibOrt"
                    checked={isSelected}
                    disabled={isGesperrt}
                    onChange={() => onVerbleibOrtChange(
                      ort.id, 
                      ort.name, 
                      ort.raumnummer_erforderlich
                    )}
                    className="w-4 h-4 border-gray-300 text-teal-600"
                  />
                  <span className={`text-sm ${
                    isGesperrt ? 'line-through text-gray-400' : ''
                  }`}>
                    {ort.name}
                    {isGesperrt && <span className="text-red-500 ml-1">(gesperrt)</span>}
                  </span>
                </label>
                
                {isSelected && ort.raumnummer_erforderlich && (
                  <div className="ml-6 mt-2">
                    <input
                      type="text"
                      value={roomNumber}
                      onChange={(e) => onRoomNumberChange(e.target.value)}
                      placeholder="Raumnummer z.B. 2.204"
                      className="w-full px-3 py-2 border rounded-lg text-sm"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Rückgabedatum */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Rückgabedatum *
        </label>
        {maxLeihdauerTage !== null && (
          <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded">
            Max. {maxLeihdauerTage} Tage
          </span>
        )}
        <input
          type="date"
          value={cartReturnDate}
          disabled={!selectedVerbleibOrtId}
          onChange={(e) => onReturnDateChange(e.target.value)}
          className="w-full px-3 py-2 border rounded-lg mt-2 disabled:bg-gray-100"
        />
      </div>

      {/* Cart Items */}
      <div className="space-y-2 mb-4 max-h-64 overflow-y-auto">
        {cart.map(({ item }) => (
          <div
            key={item.id}
            onClick={() => onShowItemInfo(item.id)}
            className="flex items-center justify-between p-3 border rounded-lg hover:border-teal-400 cursor-pointer"
          >
            <span className="font-medium text-sm">{item.name}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemoveItem(item.id);
              }}
              className="text-red-500 hover:text-red-700 p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Ausleihen Button */}
      <button
        onClick={onBorrowAll}
        disabled={!cartReturnDate || !selectedVerbleibOrtId}
        className="w-full py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50"
      >
        Ausleihen
      </button>
    </div>
  );
}

export default CartPanel;
