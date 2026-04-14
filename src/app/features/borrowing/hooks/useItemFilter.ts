/**
 * useItemFilter Hook - Filterung und Sortierung von Items
 */
import { useState, useMemo, useCallback } from 'react';
import type { Item } from '../../../shared/types';

export type SortField = 'name' | 'created' | 'lastBorrowed';
export type SortDirection = 'asc' | 'desc';

export interface UseItemFilterReturn {
  searchQuery: string;
  selectedCategory: string;
  sortField: SortField;
  sortDirection: SortDirection;
  displayCount: number;
  setSearchQuery: (query: string) => void;
  setSelectedCategory: (category: string) => void;
  setSortField: (field: SortField) => void;
  toggleSortDirection: () => void;
  setDisplayCount: (count: number) => void;
  filteredItems: Item[];
  resetFilters: () => void;
}

const ITEMS_PER_PAGE = 50;

export function useItemFilter(items: Item[]): UseItemFilterReturn {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [displayCount, setDisplayCount] = useState(ITEMS_PER_PAGE);

  const toggleSortDirection = useCallback(() => {
    setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
  }, []);

  const resetFilters = useCallback(() => {
    setSearchQuery('');
    setSelectedCategory('');
    setSortField('name');
    setSortDirection('asc');
    setDisplayCount(ITEMS_PER_PAGE);
  }, []);

  const filteredItems = useMemo(() => {
    let result = items.filter(item => {
      const matchesSearch = searchQuery === '' ||
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.tagId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.cabinetNumber.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesCategory = selectedCategory === '' || 
        item.categories.includes(selectedCategory);
      
      return matchesSearch && matchesCategory;
    });

    // Sortierung
    result.sort((a, b) => {
      let comparison = 0;
      
      switch (sortField) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'created':
          comparison = (a.erstelltAm || '').localeCompare(b.erstelltAm || '');
          break;
        case 'lastBorrowed':
          comparison = (a.letzteAusleihe || '').localeCompare(b.letzteAusleihe || '');
          break;
      }
      
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [items, searchQuery, selectedCategory, sortField, sortDirection]);

  return {
    searchQuery,
    selectedCategory,
    sortField,
    sortDirection,
    displayCount,
    setSearchQuery,
    setSelectedCategory,
    setSortField,
    toggleSortDirection,
    setDisplayCount,
    filteredItems,
    resetFilters
  };
}

export default useItemFilter;
