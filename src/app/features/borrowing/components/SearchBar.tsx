/**
 * SearchBar Component - Such- und Filter-Leiste
 */
import { Search, X, ArrowUp, ArrowDown } from 'lucide-react';
import type { SortField, SortDirection } from '../hooks/useItemFilter';

interface SearchBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
  categories: string[];
  sortField: SortField;
  sortDirection: SortDirection;
  onSortFieldChange: (field: SortField) => void;
  onToggleSortDirection: () => void;
  resultCount: number;
  totalCount: number;
}

export function SearchBar({
  searchQuery,
  onSearchChange,
  selectedCategory,
  onCategoryChange,
  categories,
  sortField,
  sortDirection,
  onSortFieldChange,
  onToggleSortDirection,
  resultCount,
  totalCount
}: SearchBarProps) {
  return (
    <div className="bg-white rounded-lg shadow p-4 mb-6">
      <div className="flex flex-col lg:flex-row gap-4">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Ware suchen..."
            className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Category Filter */}
        <select
          value={selectedCategory}
          onChange={(e) => onCategoryChange(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
        >
          <option value="">Alle Kategorien</option>
          {categories.map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>

        {/* Sort Controls */}
        <div className="flex items-center gap-2">
          <select
            value={sortField}
            onChange={(e) => onSortFieldChange(e.target.value as SortField)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            <option value="name">Name</option>
            <option value="created">Erstellt</option>
            <option value="lastBorrowed">Zuletzt ausgeliehen</option>
          </select>
          
          <button
            onClick={onToggleSortDirection}
            className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            title={sortDirection === 'asc' ? 'Aufsteigend' : 'Absteigend'}
          >
            {sortDirection === 'asc' ? (
              <ArrowUp className="w-5 h-5" />
            ) : (
              <ArrowDown className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>

      {/* Result Count */}
      <div className="mt-2 text-sm text-gray-600">
        {resultCount} von {totalCount} Waren angezeigt
        {searchQuery && ` (gefiltert nach "${searchQuery}")`}
      </div>
    </div>
  );
}

export default SearchBar;
