/**
 * ItemGrid Component - Gitter-Ansicht der Waren
 */
import { Wifi, Package } from 'lucide-react';
import type { Item } from '../../../shared/types';

interface ItemGridProps {
  items: Item[];
  displayCount: number;
  onItemClick: (item: Item) => void;
  isItemInCart: (itemId: string) => boolean;
  onLoadMore: () => void;
}

export function ItemGrid({
  items,
  displayCount,
  onItemClick,
  isItemInCart,
  onLoadMore
}: ItemGridProps) {
  const displayedItems = items.slice(0, displayCount);
  const hasMore = items.length > displayCount;

  if (items.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        Keine Waren gefunden
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {displayedItems.map(item => {
          const inCart = isItemInCart(item.id);
          
          return (
            <div
              key={item.id}
              onClick={() => onItemClick(item)}
              className={`
                bg-white rounded-lg shadow p-4 cursor-pointer transition-all
                hover:shadow-md hover:border-teal-400 border-2
                ${inCart ? 'border-teal-500 bg-teal-50' : 'border-transparent'}
                ${!item.borrowable ? 'opacity-60' : ''}
              `}
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-medium text-gray-900 line-clamp-2 flex-1">
                  {item.name}
                </h3>
                {item.tagId && (
                  <Wifi className="w-4 h-4 text-teal-500 flex-shrink-0 ml-2" />
                )}
              </div>

              {/* Kategorien */}
              {item.categories.length > 0 && (
                <p className="text-xs text-gray-500 mb-2">
                  {[...item.categories].sort().join(', ')}
                </p>
              )}

              {/* Status */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">
                  {item.cabinetNumber}
                </span>
                
                {item.borrowedBy ? (
                  <span className="text-red-500 font-medium">
                    Ausgeliehen
                  </span>
                ) : item.borrowable ? (
                  <span className="text-emerald-600 font-medium">
                    Verfügbar
                  </span>
                ) : (
                  <span className="text-gray-400">
                    Nicht verfügbar
                  </span>
                )}
              </div>

              {/* In Cart Indicator */}
              {inCart && (
                <div className="mt-2 text-xs text-teal-600 font-medium">
                  Im Warenkorb
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Load More Button */}
      {hasMore && (
        <div className="mt-6 text-center">
          <button
            onClick={onLoadMore}
            className="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
          >
            Mehr laden ({items.length - displayCount} verbleibend)
          </button>
        </div>
      )}
    </div>
  );
}

export default ItemGrid;
