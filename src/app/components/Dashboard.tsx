import { useState, useEffect } from 'react';
import { ArrowLeft, Package, Plus, Edit, Trash2, History, Loader2, Search, X, Check, AlertTriangle, ChevronDown, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { Item, ItemDialog } from './ItemDialog';
import { ItemHistoryDialog } from './ItemHistoryDialog';
import { ItemInfoDialog } from './ItemInfoDialog';
import { SchadensmeldungDialog } from './SchadensmeldungDialog';
import { toolsApi, historieApi, schadensmeldungApi, type NewToolData, warenApi, type Ware, kategorienApi } from '../api';

export interface HistoryEntry {
  id: string;
  borrower: string;
  borrowedAt: string;
  returnedAt: string;
  plannedReturnDate?: string;
  location?: string;
  returnedBy?: string;
}

interface DashboardProps {
  username: string;
  items: Item[];
  historyEntries: HistoryEntry[];
  onUpdateItems: (items: Item[]) => void;
  onBack: () => void;
}

export function Dashboard({ username, items, historyEntries, onUpdateItems, onBack }: DashboardProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | undefined>(undefined);
  const [selectedItemHistory, setSelectedItemHistory] = useState<{
    itemName: string;
    itemTagId: string;
    history: HistoryEntry[];
    schadensmeldungen: any[];
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Kategorie-Filter State
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  
  // Pagination State
  const ITEMS_PER_PAGE = 50;
  const [displayCount, setDisplayCount] = useState(ITEMS_PER_PAGE);
  
  // Sortierung State - vereinfacht
  type SortField = 'name' | 'created' | 'lastBorrowed' | 'cabinetNumber' | 'categories';
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  
  // Delete confirmation dialog state
  const [deleteDialog, setDeleteDialog] = useState<{
    isOpen: boolean;
    item: Item | null;
    error: string | null;
  }>({ isOpen: false, item: null, error: null });

  // Schadensmeldung Dialog State
  const [schadensDialog, setSchadensDialog] = useState<{
    isOpen: boolean;
    item: Item | null;
  }>({ isOpen: false, item: null });

  // Item Info Dialog State
  const [itemInfoDialog, setItemInfoDialog] = useState<{
    isOpen: boolean;
    ware: Ware | null;
  }>({ isOpen: false, ware: null });

  // Toast notifications
  const [toasts, setToasts] = useState<Array<{id: string; message: string; type: 'success' | 'error'}>>([]);

  const addToast = (message: string, type: 'success' | 'error') => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };

  // Kategorien beim Mount laden
  useEffect(() => {
    const loadCategories = async () => {
      try {
        const kategorien = await kategorienApi.getAll();
        setCategories(kategorien.map(k => k.name).sort());
      } catch (err) {
        console.error('Fehler beim Laden der Kategorien:', err);
      }
    };
    loadCategories();
  }, []);

  // Gefilterte Items basierend auf Suchbegriff UND Kategorie
  const filteredItems = items.filter((item) => {
    const query = searchQuery.toLowerCase();
    const matchesSearch = (
      item.name.toLowerCase().includes(query) ||
      item.tagId.toLowerCase().includes(query) ||
      item.cabinetNumber.toLowerCase().includes(query) ||
      item.categories.some(cat => cat.toLowerCase().includes(query)) ||
      item.description?.toLowerCase().includes(query)
    );
    
    // Kategorie-Filter
    const matchesCategory = selectedCategory === '' || 
      item.categories.some(cat => cat.toLowerCase() === selectedCategory.toLowerCase());
    
    return matchesSearch && matchesCategory;
  });
  
  // Sortierte Items - vereinfachte Logik
  const sortedItems = [...filteredItems].sort((a, b) => {
    let comparison = 0;
    
    switch (sortField) {
      case 'name':
        comparison = a.name.localeCompare(b.name);
        break;
      case 'created': {
        // Nach Hinzufügedatum (erstelltAm)
        const dateA = a.erstelltAm ? new Date(a.erstelltAm).getTime() : 0;
        const dateB = b.erstelltAm ? new Date(b.erstelltAm).getTime() : 0;
        comparison = dateA - dateB;
        break;
      }
      case 'lastBorrowed': {
        // Nach zuletzt ausgeliehen (borrowedAt)
        const dateA = a.borrowedAt ? new Date(a.borrowedAt).getTime() : 0;
        const dateB = b.borrowedAt ? new Date(b.borrowedAt).getTime() : 0;
        comparison = dateA - dateB;
        break;
      }
      case 'cabinetNumber':
        comparison = (a.cabinetNumber || '').localeCompare(b.cabinetNumber || '');
        break;
      case 'categories':
        comparison = (a.categories[0] || '').localeCompare(b.categories[0] || '');
        break;
    }
    
    return sortDirection === 'asc' ? comparison : -comparison;
  });
  
  // Paginierte Items (nur die ersten displayCount)
  const paginatedItems = sortedItems.slice(0, displayCount);
  const hasMoreItems = sortedItems.length > displayCount;
  
  // Handler für Spalten-Sortierung
  const handleSort = (field: 'name' | 'cabinetNumber' | 'categories') => {
    if (sortField === field) {
      // Gleiches Feld -> Richtung wechseln
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      // Neues Feld -> aufsteigend starten
      setSortField(field);
      setSortDirection('asc');
    }
  };
  
  // Handler für Item Info Dialog
  const handleShowItemInfo = async (itemId: string) => {
    try {
      const ware = await warenApi.getById(itemId);
      setItemInfoDialog({ isOpen: true, ware });
    } catch (err) {
      console.error('Fehler beim Laden der Ware:', err);
      addToast('Fehler beim Laden der Warendetails', 'error');
    }
  };

  // Sortier-Icon rendern (nur aktiv bei alphabetischer Sortierung)
  const getSortIcon = (field: 'name' | 'cabinetNumber' | 'categories') => {
    // Icons nur anzeigen, wenn wir nach diesem Feld sortieren
    const isActive = sortField === field;
    if (!isActive) return <ArrowUpDown className="w-4 h-4 text-gray-400" />;
    return sortDirection === 'asc' 
      ? <ArrowUp className="w-4 h-4 text-teal-600" />
      : <ArrowDown className="w-4 h-4 text-teal-600" />;
  };

  const handleAddItem = () => {
    setEditingItem(undefined);
    setIsDialogOpen(true);
  };

  const handleEditItem = (item: Item) => {
    setEditingItem(item);
    setIsDialogOpen(true);
  };

  const handleDeleteClick = (item: Item) => {
    if (item.borrowedBy) {
      setError('Diese Ware ist aktuell ausgeliehen und kann nicht gelöscht werden.');
      setTimeout(() => setError(null), 3000);
      return;
    }
    setDeleteDialog({ isOpen: true, item, error: null });
  };

  const handleSchadenMelden = (item: Item) => {
    setSchadensDialog({ isOpen: true, item });
  };

  const handleSchadensmeldungSubmit = () => {
    setSchadensDialog({ isOpen: false, item: null });
    addToast('Schadensmeldung erfolgreich erstellt', 'success');
  };

  const handleDeleteConfirm = async () => {
    if (!deleteDialog.item) return;
    
    try {
      setIsLoading(true);
      const result = await toolsApi.delete(deleteDialog.item.id);
      if (result.success) {
        onUpdateItems(items.filter((i) => i.id !== deleteDialog.item!.id));
        setDeleteDialog({ isOpen: false, item: null, error: null });
      } else {
        setDeleteDialog(prev => ({ ...prev, error: 'Fehler beim Löschen: ' + result.error }));
      }
    } catch (err) {
      setDeleteDialog(prev => ({ ...prev, error: 'Fehler beim Löschen: ' + (err instanceof Error ? err.message : 'Unbekannter Fehler') }));
    } finally {
      setIsLoading(false);
    }
  };

  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const handleShowHistory = async (item: Item) => {
    setIsLoadingHistory(true);
    
    try {
      // Historie und Schadensmeldungen parallel laden
      const [apiHistory, schadensmeldungen] = await Promise.all([
        historieApi.getAll({ ware_id: item.id }),
        schadensmeldungApi.getByWare(item.id).catch(() => []) // Fehler ignorieren, falls keine Meldungen
      ]);
      
      // API-Daten in HistoryEntry Format konvertieren
      const mappedHistory: HistoryEntry[] = apiHistory.map((h: any) => ({
        id: h.id,
        borrower: h.benutzer_name || h.benutzer?.name || 'Unbekannt',
        borrowedAt: h.ausgeliehen_am,
        returnedAt: h.tatsaechliche_rueckgabe || '',
        plannedReturnDate: h.geplante_rueckgabe,
        location: h.verbleib_ort,
        returnedBy: h.genehmigt_von || undefined,
      }));
      
      // Aktuelle Ausleihe hinzufügen falls vorhanden
      const allHistory: HistoryEntry[] = [...mappedHistory];
      if (item.borrowedBy) {
        allHistory.unshift({
          id: `current-${item.id}`,
          borrower: item.borrowedBy,
          borrowedAt: item.borrowedAt!,
          returnedAt: '',
          plannedReturnDate: item.returnDate,
          location: item.location,
        });
      }
      
      setSelectedItemHistory({
        itemName: item.name,
        itemTagId: item.tagId,
        history: allHistory,
        schadensmeldungen: schadensmeldungen || [],
      });
    } catch (err) {
      console.error('Fehler beim Laden der Historie:', err);
      // Fallback: Nur aktuelle Ausleihe anzeigen
      const fallbackHistory: HistoryEntry[] = [];
      if (item.borrowedBy) {
        fallbackHistory.push({
          id: `current-${item.id}`,
          borrower: item.borrowedBy,
          borrowedAt: item.borrowedAt!,
          returnedAt: '',
          plannedReturnDate: item.returnDate,
          location: item.location,
        });
      }
      
      setSelectedItemHistory({
        itemName: item.name,
        itemTagId: item.tagId,
        history: fallbackHistory,
        schadensmeldungen: [],
      });
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleSaveItem = async (itemData: Omit<Item, 'id'> & { id?: string }, quantity?: number) => {
    setError(null);
    
    if (itemData.id) {
      // Bearbeiten - Backend-API aufrufen
      try {
        setIsLoading(true);
        
        // WICHTIG: toolsApi.update erwartet NewToolData Format!
        const result = await toolsApi.update(itemData.id, {
          name: itemData.name,
          description: itemData.description,
          tagid: itemData.tagId || null,
          cabinet_number: itemData.cabinetNumber,
          category_ids: itemData.categoryIds || [],
        });
        if (result.success) {
          // Lokalen State aktualisieren
          onUpdateItems(
            items.map((item) =>
              item.id === itemData.id ? { ...item, ...itemData } : item
            )
          );
        } else {
          setError(result.error || 'Fehler beim Aktualisieren');
        }
      } catch (err) {
        setError('Fehler beim Aktualisieren: ' + (err instanceof Error ? err.message : 'Unbekannter Fehler'));
      } finally {
        setIsLoading(false);
      }
    } else {
      // Neues Tool erstellen
      try {
        setIsLoading(true);
        const qty = quantity || 1;
        
        // Bei mehreren Waren: Prüfen ob genügend Tag-IDs vorhanden
        if (qty > 1) {
          // Tag-IDs aus dem Eingabefeld extrahieren (komma-getrennt)
          const tagIds = itemData.tagId
            ? itemData.tagId.split(',').map(t => t.trim()).filter(t => t.length > 0)
            : [];
          
          if (tagIds.length < qty) {
            setError(`Für ${qty} Waren werden ${qty} Tag-IDs benötigt. Bitte scannen Sie die Tags oder geben Sie sie komma-getrennt ein.`);
            setIsLoading(false);
            return;
          }
          
          // Jede Ware mit ihrer eigenen Tag-ID erstellen
          for (let i = 0; i < qty; i++) {
            const newToolData: NewToolData = {
              name: itemData.name,
              description: itemData.description,
              tagid: tagIds[i] || undefined,
              cabinet_number: itemData.cabinetNumber || undefined,
              category_ids: itemData.categoryIds || [],
            };

            const result = await toolsApi.create(newToolData);
            if (!result.success) {
              setError(result.error || 'Fehler beim Erstellen');
              break;
            }
          }
        } else {
          // Einzelne Ware erstellen
          const newToolData: NewToolData = {
            name: itemData.name,
            description: itemData.description,
            tagid: itemData.tagId || undefined,
            cabinet_number: itemData.cabinetNumber || undefined,
            category_ids: itemData.categoryIds || [],
          };

          const result = await toolsApi.create(newToolData);
          if (!result.success) {
            setError(result.error || 'Fehler beim Erstellen');
          }
        }

        // Daten neu laden
        const updatedTools = await toolsApi.getAll();
        const mappedItems: Item[] = updatedTools.map(tool => ({
          id: String(tool.id),
          name: tool.name,
          description: tool.description || '',
          tagId: tool.tagid || '',
          cabinetNumber: tool.cabinet_number || '',
          categories: tool.categories || [],
          categoryIds: tool.categoryIds || [],
          borrowable: true,
        }));
        onUpdateItems(mappedItems);
        
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Fehler beim Erstellen');
      } finally {
        setIsLoading(false);
      }
    }
    setIsDialogOpen(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-emerald-50">
      {/* Toast Notifications */}
      <div className="fixed top-20 right-4 z-50 space-y-2">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`px-4 py-3 rounded-lg shadow-lg text-white text-sm flex items-center gap-2 ${
              toast.type === 'success' ? 'bg-emerald-500' : 'bg-red-500'
            }`}
          >
            {toast.type === 'success' ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
            {toast.message}
          </div>
        ))}
      </div>
      
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="w-full px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Package className="w-8 h-8 text-teal-600" />
            <h1 className="text-teal-700">Ausleihsystem - Warenverwaltung</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">
              Angemeldet als: <span className="font-medium text-teal-700">{username}</span>
            </span>
            <button
              onClick={onBack}
              className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Zurück zur Ausleihe
            </button>
          </div>
        </div>
      </header>

      <main className="w-full px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md text-red-700">
            {error}
          </div>
        )}
        
        {/* Header mit Titel und Action-Button */}
        <div className="mb-4 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-semibold text-teal-800">Warenübersicht</h2>
            <p className="text-sm text-gray-500">
              {filteredItems.length} {filteredItems.length === 1 ? 'Artikel' : 'Artikel'}
              {(searchQuery || selectedCategory) && (
                <span className="text-teal-600"> (gefiltert)</span>
              )}
            </p>
          </div>
          <button
            onClick={handleAddItem}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors shadow-sm disabled:opacity-50 text-sm font-medium"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            Neue Ware
          </button>
        </div>

        {/* Toolbar mit Suche und Sortierung */}
        <div className="mb-4 flex flex-wrap items-center gap-3 p-3 bg-white rounded-lg shadow-sm border border-gray-100">
          {/* Suchfeld */}
          <div className="relative flex-grow max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setDisplayCount(ITEMS_PER_PAGE);
              }}
              placeholder="Ware suchen..."
              className="w-full pl-10 pr-9 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 text-sm transition-all"
            />
            {searchQuery ? (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5 rounded-full hover:bg-gray-200 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            ) : null}
          </div>

          {/* Kategorie-Filter */}
          <div className="relative">
            <select
              value={selectedCategory}
              onChange={(e) => {
                setSelectedCategory(e.target.value);
                setDisplayCount(ITEMS_PER_PAGE);
              }}
              className="appearance-none pl-3 pr-8 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 text-sm cursor-pointer min-w-[150px]"
            >
              <option value="">Alle Kategorien</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>

          {/* Sortierung */}
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-sm text-gray-500 hidden sm:inline">Sortieren:</span>
            <div className="flex items-center bg-gray-50 rounded-lg border border-gray-200 p-0.5">
              <select
                value={sortField === 'name' || sortField === 'created' || sortField === 'lastBorrowed' ? sortField : 'name'}
                onChange={(e) => {
                  const newField = e.target.value as 'name' | 'created' | 'lastBorrowed';
                  setSortField(newField);
                  setSortDirection('asc');
                  setDisplayCount(ITEMS_PER_PAGE);
                }}
                className="bg-transparent px-3 py-1.5 text-sm text-gray-700 focus:outline-none cursor-pointer border-r border-gray-200"
              >
                <option value="name">Name</option>
                <option value="created">Hinzugefügt</option>
                <option value="lastBorrowed">Letzte Ausleihe</option>
              </select>
              <button
                onClick={() => setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')}
                className="px-2 py-1.5 text-gray-500 hover:text-teal-600 hover:bg-white rounded-md transition-all"
                title={sortDirection === 'asc' ? 'Aufsteigend' : 'Absteigend'}
              >
                {sortDirection === 'asc' ? (
                  <ArrowUp className="w-4 h-4" />
                ) : (
                  <ArrowDown className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-teal-50 border-b border-teal-100">
                <tr>
                  <th 
                    className="px-6 py-3 text-left text-sm text-teal-700 cursor-pointer hover:bg-teal-100 transition-colors select-none"
                    onClick={() => handleSort('name')}
                  >
                    <div className="flex items-center gap-2">
                      Name
                      {getSortIcon('name')}
                    </div>
                  </th>
                  <th className="px-6 py-3 text-left text-sm text-teal-700">
                    Beschreibung
                  </th>
                  <th 
                    className="px-6 py-3 text-left text-sm text-teal-700 cursor-pointer hover:bg-teal-100 transition-colors select-none"
                    onClick={() => handleSort('categories')}
                  >
                    <div className="flex items-center gap-2">
                      Kategorie
                      {getSortIcon('categories')}
                    </div>
                  </th>
                  <th className="px-6 py-3 text-left text-sm text-teal-700">
                    Tag-ID
                  </th>
                  <th 
                    className="px-6 py-3 text-left text-sm text-teal-700 cursor-pointer hover:bg-teal-100 transition-colors select-none"
                    onClick={() => handleSort('cabinetNumber')}
                  >
                    <div className="flex items-center gap-2">
                      Schrank
                      {getSortIcon('cabinetNumber')}
                    </div>
                  </th>
                  <th className="px-6 py-3 text-left text-sm text-teal-700">
                    Status
                  </th>
                  <th className="px-6 py-3 text-right text-sm text-teal-700">
                    Aktionen
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {paginatedItems.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                      {searchQuery ? (
                        <div>
                          <p className="mb-2">Keine Waren gefunden für „{searchQuery}“</p>
                          <button
                            onClick={() => setSearchQuery('')}
                            className="text-teal-600 hover:text-teal-700 underline text-sm"
                          >
                            Suche zurücksetzen
                          </button>
                        </div>
                      ) : (
                        'Keine Waren vorhanden'
                      )}
                    </td>
                  </tr>
                ) : (
                  paginatedItems.map((item) => (
                  <tr 
                    key={item.id} 
                    className="hover:bg-teal-50/50"
                    onClick={() => handleShowItemInfo(item.id)}
                  >
                    <td className="px-6 py-4">{item.name}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {item.description || '-'}
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-block px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                        {item.categories.length > 0 ? [...item.categories].sort().join(', ') : '-'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <code className="bg-gray-100 px-2 py-1 rounded" title={item.tagId || '-'}>
                        {item.tagId 
                          ? item.tagId.length > 12 
                            ? `${item.tagId.slice(0, 10)}...` 
                            : item.tagId 
                          : '-'}
                      </code>
                    </td>
                    <td className="px-6 py-4 text-sm font-medium">
                      {item.cabinetNumber || '-'}
                    </td>
                    <td className="px-6 py-4">
                      {item.borrowedBy ? (
                        <div>
                          <span className="inline-block px-2 py-1 bg-orange-100 text-orange-700 text-xs rounded mb-1">
                            Ausgeliehen
                          </span>
                          <p className="text-xs text-gray-600">von {item.borrowedBy}</p>
                        </div>
                      ) : (
                        <span className="inline-block px-2 py-1 bg-emerald-100 text-emerald-700 text-xs rounded">
                          Verfügbar
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleSchadenMelden(item)}
                          className="p-2 text-gray-600 hover:text-amber-600 transition-colors"
                          title="Schaden melden"
                        >
                          <AlertTriangle className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleShowHistory(item)}
                          className="p-2 text-gray-600 hover:text-teal-600 transition-colors"
                          title="Ausleih-Historie"
                        >
                          <History className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleEditItem(item)}
                          className="p-2 text-gray-600 hover:text-teal-600 transition-colors"
                          title="Bearbeiten"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteClick(item)}
                          disabled={isLoading}
                          className="p-2 text-gray-600 hover:text-red-600 transition-colors disabled:opacity-50"
                          title="Löschen"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
                )}
              </tbody>
            </table>
          </div>
          
          {/* Weitere laden Button */}
          {hasMoreItems && (
            <div className="p-4 border-t border-gray-200 bg-gray-50 text-center">
              <button
                onClick={() => setDisplayCount(prev => prev + ITEMS_PER_PAGE)}
                className="flex items-center justify-center gap-2 w-full px-4 py-3 text-sm font-medium text-teal-700 bg-white border border-teal-200 rounded-lg hover:bg-teal-50 hover:border-teal-300 transition-colors"
              >
                <ChevronDown className="w-4 h-4" />
                Weitere Waren laden
                <span className="text-gray-500">
                  ({Math.min(displayCount + ITEMS_PER_PAGE, sortedItems.length)} von {sortedItems.length})
                </span>
              </button>
            </div>
          )}
          
          {/* Info wenn alle geladen sind und mehr als 50 */}
          {!hasMoreItems && filteredItems.length > ITEMS_PER_PAGE && (
            <div className="p-4 border-t border-gray-200 bg-gray-50 text-center text-sm text-gray-500">
              Alle {filteredItems.length} Waren werden angezeigt
            </div>
          )}
        </div>

        {items.length === 0 && !searchQuery && (
          <div className="text-center py-12 text-gray-500">
            Keine Waren vorhanden. Fügen Sie eine neue Ware hinzu.
          </div>
        )}
      </main>

      {isDialogOpen && (
        <ItemDialog
          item={editingItem}
          onSave={handleSaveItem}
          onClose={() => {
            setIsDialogOpen(false);
            setEditingItem(undefined);
          }}
        />
      )}
      {selectedItemHistory && (
        <ItemHistoryDialog
          itemName={selectedItemHistory.itemName}
          itemTagId={selectedItemHistory.itemTagId}
          history={selectedItemHistory.history}
          schadensmeldungen={selectedItemHistory.schadensmeldungen}
          onClose={() => setSelectedItemHistory(null)}
        />
      )}
      
      {/* Delete Confirmation Dialog */}
      {deleteDialog.isOpen && deleteDialog.item && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-100 rounded-full">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Ware löschen</h3>
            </div>
            
            {/* Fehleranzeige im Dialog */}
            {deleteDialog.error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <span className="text-red-700 text-sm">{deleteDialog.error}</span>
              </div>
            )}
            
            <p className="text-gray-600 mb-2">
              Möchten Sie <strong>"{deleteDialog.item.name}"</strong> wirklich löschen?
            </p>
            <p className="text-sm text-gray-500 mb-6">
              Diese Aktion kann nicht rückgängig gemacht werden.
            </p>
            
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteDialog({ isOpen: false, item: null, error: null })}
                disabled={isLoading}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Abbrechen
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={isLoading}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Löschen...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Löschen
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Schadensmeldung Dialog */}
      {schadensDialog.isOpen && schadensDialog.item && (
        <SchadensmeldungDialog
          items={[schadensDialog.item]}
          isOpen={schadensDialog.isOpen}
          onClose={() => setSchadensDialog({ isOpen: false, item: null })}
          onSubmit={handleSchadensmeldungSubmit}
          mode="mitarbeiter-direct"
        />
      )}

      {/* Item Info Dialog */}
      <ItemInfoDialog
        item={itemInfoDialog.ware}
        isOpen={itemInfoDialog.isOpen}
        onClose={() => setItemInfoDialog({ isOpen: false, ware: null })}
      />
    </div>
  );
}
