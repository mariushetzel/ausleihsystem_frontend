import { useState, useEffect, useRef } from 'react';
import { generateUUID } from '../utils/uuid';
import { Scan, Search, ShoppingCart, User, Settings, Package, LogOut, History, Users, Check, X, Clock, AlertTriangle, Wifi, ChevronDown, ArrowUp, ArrowDown } from 'lucide-react';
import { authApi, ausleihenApi, rfidAntennaApi, kategorienApi, verbleibOrtApi, schadensmeldungApi, kategorieVerbleibMatrixApi, historieApi, type VerbleibOrt, type Ware, TokenManager } from '../api';
import { Item } from './ItemDialog';
import { ItemInfoDialog } from './ItemInfoDialog';
import { ItemHistoryDialog } from './ItemHistoryDialog';
import { SchadensmeldungDialog } from './SchadensmeldungDialog';
import { UserHistoryDialog } from './UserHistoryDialog';
import type { HistoryEntry } from './Dashboard';

interface CartItem {
  item: Item;
  returnDate: string;
  location: string;
}

interface ScannedItem {
  item: Item;
  timestamp: number;
}

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}



// Hilfsfunktion: Vergleicht zwei Datumsstrings (YYYY-MM-DD) korrekt ohne Zeitzonen
function compareDates(dateStr1: string, dateStr2: string): number {
  // Zerlege Datum in Jahr, Monat, Tag
  const [y1, m1, d1] = dateStr1.split('-').map(Number);
  const [y2, m2, d2] = dateStr2.split('-').map(Number);
  
  // Vergleiche Jahr, dann Monat, dann Tag
  if (y1 !== y2) return y1 - y2;
  if (m1 !== m2) return m1 - m2;
  return d1 - d2;
}

// Hilfsfunktion: Prüft ob ein Datum (YYYY-MM-DD) in der Vergangenheit ist
function isDateInPast(dateStr: string): boolean {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0]; // YYYY-MM-DD
  return compareDates(dateStr, todayStr) < 0;
}

// Hilfsfunktion: Formatiert ein Datum (YYYY-MM-DD) für die Anzeige
function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${d.toString().padStart(2, '0')}.${m.toString().padStart(2, '0')}.${y}`;
}

interface BorrowViewProps {
  username: string;
  userRole: string;
  items: Item[];
  onUpdateItems: (items: Item[]) => void;
  onLogout: () => void;
  onNavigateToManagement: () => void;
  onNavigateToReturns: () => void;
  onNavigateToAntenna: () => void;
  onNavigateToUsers: () => void;
  onEditProfile: () => void;
  onShowAutoLogoutDialog?: (title: string, message: string) => void;
}

export function BorrowView({
  username,
  userRole,
  items,
  onUpdateItems,
  onLogout,
  onNavigateToManagement,
  onNavigateToReturns,
  onNavigateToAntenna,
  onNavigateToUsers,
  onEditProfile,
  onShowAutoLogoutDialog,
}: BorrowViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  
  // Pagination State
  const ITEMS_PER_PAGE = 50;
  const [displayCount, setDisplayCount] = useState(ITEMS_PER_PAGE);
  
  // Sortierung State - vereinfacht
  type SortField = 'name' | 'created' | 'lastBorrowed';
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartReturnDate, setCartReturnDate] = useState('');
  const [cartLocation, setCartLocation] = useState('');
  const [selectedVerbleibOrtId, setSelectedVerbleibOrtId] = useState<string>('');
  const [roomNumber, setRoomNumber] = useState('');
  
  // Maximale Leihdauer und blockierte Zeiträume für den Warenkorb
  const [maxLeihdauerTage, setMaxLeihdauerTage] = useState<number | null>(null);
  const [blockierteZeitraeume, setBlockierteZeitraeume] = useState<Array<{von: string; bis: string}>>([]);
  const [ladeZeitraeume, setLadeZeitraeume] = useState(false);
  
  // Verbleib-Orte aus dem Backend
  const [verbleibOrte, setVerbleibOrte] = useState<VerbleibOrt[]>([]);
  const [gesperrteVerbleibOrte, setGesperrteVerbleibOrte] = useState<Set<string>>(new Set());
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [scannedItems, setScannedItems] = useState<ScannedItem[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  
  // New state for return functionality
  const [selectedForReturn, setSelectedForReturn] = useState<Set<string>>(new Set());
  const [rfidSelectedForReturn, setRfidSelectedForReturn] = useState<Set<string>>(new Set());
  const [showScanModal, setShowScanModal] = useState(false);
  const [scanningItems, setScanningItems] = useState<Item[]>([]);
  const [scannedTagIds, setScannedTagIds] = useState<Set<string>>(new Set());
  
  // Confirm modal state
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState('');
  const [confirmCallback, setConfirmCallback] = useState<(() => void) | null>(null);
  
  // Alle Kategorien laden (auch leere)
  const [allCategories, setAllCategories] = useState<{id: string, name: string}[]>([]);
  
  // Schadensmeldung Dialog State
  const [showSchadensDialog, setShowSchadensDialog] = useState(false);
  const [pendingReturnItems, setPendingReturnItems] = useState<Item[]>([]);
  const [pendingReturnIds, setPendingReturnIds] = useState<string[]>([]);
  const [pendingScannedTags, setPendingScannedTags] = useState<Set<string>>(new Set());
  
  // Item Info Dialog
  const [selectedItemForInfo, setSelectedItemForInfo] = useState<Ware | null>(null);
  const [showItemInfoDialog, setShowItemInfoDialog] = useState(false);
  
  // Item History Dialog
  const [selectedItemHistory, setSelectedItemHistory] = useState<{
    itemName: string;
    itemTagId: string;
    history: HistoryEntry[];
    schadensmeldungen: any[];
  } | null>(null);
  
  // Schadensmeldung Dialog
  const [schadensDialog, setSchadensDialog] = useState<{
    isOpen: boolean;
    item: Item | null;
  }>({ isOpen: false, item: null });
  
  // User History Dialog
  const [showUserHistory, setShowUserHistory] = useState(false);
  const [userHistory, setUserHistory] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const hCommRef = useRef<number | null>(null);
  const sessionIdRef = useRef<string>(generateUUID());
  const menuRef = useRef<HTMLDivElement>(null);



  // Toast helper
  const addToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };

  // Custom confirm dialog
  const showConfirm = (message: string, onConfirm: () => void) => {
    setConfirmMessage(message);
    setConfirmCallback(() => onConfirm);
    setShowConfirmModal(true);
  };

  const handleConfirm = () => {
    if (confirmCallback) {
      confirmCallback();
    }
    setShowConfirmModal(false);
    setConfirmCallback(null);
  };

  const handleCancel = () => {
    setShowConfirmModal(false);
    setConfirmCallback(null);
  };

  // Alle Kategorien für Filter (von API geladen)
  const categories = allCategories.map(c => c.name).sort();

  // Wenn Items sich ändern (z.B. nach Navigation zurück), reset displayCount
  useEffect(() => {
    setDisplayCount(ITEMS_PER_PAGE);
  }, [items.length]);

  // Filter items based on search and category
  const filteredItems = items.filter((item) => {
    const matchesSearch =
      searchQuery === '' ||
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.tagId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.cabinetNumber.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesCategory =
      selectedCategory === '' || item.categories.includes(selectedCategory);
    
    return matchesSearch && matchesCategory;
  });
  
  // Sortierte Items - vereinfachte Logik
  const sortedItems = [...filteredItems].sort((a, b) => {
    let comparison = 0;
    
    switch (sortField) {
      case 'name':
        comparison = a.name.localeCompare(b.name);
        break;
      case 'created':
        // Nach Hinzufügedatum
        if (!a.erstelltAm && !b.erstelltAm) comparison = 0;
        else if (!a.erstelltAm) comparison = 1;
        else if (!b.erstelltAm) comparison = -1;
        else {
          const dateA = new Date(a.erstelltAm).getTime();
          const dateB = new Date(b.erstelltAm).getTime();
          comparison = dateA - dateB;
        }
        break;
      case 'lastBorrowed':
        // Nach letzter Verwendung (letzte Ausleihe, egal ob zurückgegeben oder nicht)
        const dateA = a.letzteAusleihe ? new Date(a.letzteAusleihe).getTime() : (a.erstelltAm ? new Date(a.erstelltAm).getTime() : 0);
        const dateB = b.letzteAusleihe ? new Date(b.letzteAusleihe).getTime() : (b.erstelltAm ? new Date(b.erstelltAm).getTime() : 0);
        comparison = dateA - dateB;
        break;
    }
    
    return sortDirection === 'asc' ? comparison : -comparison;
  });
  
  // Paginierte Items (nur die ersten displayCount)
  const paginatedItems = sortedItems.slice(0, displayCount);
  const hasMoreItems = sortedItems.length > displayCount;

  // Get my borrowed items
  const myBorrowedItems = items.filter((item) => item.borrowedBy === username);

  // Handler für Item Info Dialog
  const handleShowItemInfo = async (itemId: string) => {
    try {
      const { warenApi } = await import('../api/client');
      const ware = await warenApi.getById(itemId);
      setSelectedItemForInfo(ware);
      setShowItemInfoDialog(true);
    } catch (err) {
      console.error('Fehler beim Laden der Ware:', err);
      addToast('Fehler beim Laden der Warendetails', 'error');
    }
  };
  
  const handleShowHistory = async (item: Item) => {
    try {
      const [apiHistory, schadensmeldungen] = await Promise.all([
        historieApi.getAll({ ware_id: item.id }),
        schadensmeldungApi.getByWare(item.id)
      ]);
      
      const mappedHistory = apiHistory.map((h: any) => ({
        id: String(h.id),
        borrower: h.borrower || 'Unbekannt',
        borrowedAt: h.borrowedAt || h.borrowed_at || '',
        returnedAt: h.returnedAt || h.returned_at || '',
        plannedReturnDate: h.plannedReturnDate || h.planned_return_date,
        location: h.location,
        returnedBy: h.returnedBy,
      }));
      
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
    }
  };
  
  const handleSchadenMelden = (item: Item) => {
    setSchadensDialog({ isOpen: true, item });
  };
  
  const handleDirectSchadensmeldungSubmit = () => {
    setSchadensDialog({ isOpen: false, item: null });
    addToast('Schadensmeldung erfolgreich erstellt', 'success');
  };

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Cleanup scanning on unmount
  useEffect(() => {
    return () => {
      stopScanning();
    };
  }, []);
  
  // Alle Kategorien und Verbleib-Orte laden
  useEffect(() => {
    const loadCategories = async () => {
      try {
        const cats = await kategorienApi.getAll();
        setAllCategories(cats);
      } catch (err) {
        console.error('Fehler beim Laden der Kategorien:', err);
      }
    };
    loadCategories();
    
    const loadVerbleib = async () => {
      try {
        const orte = await verbleibOrtApi.getAll();
        setVerbleibOrte(orte);
      } catch (err) {
        console.error('Fehler beim Laden der Verbleib-Orte:', err);
      }
    };
    loadVerbleib();
  }, []);
  
  // Gesperrte Verbleib-Orte basierend auf Kategorien und Berechtigungsmatrix im Warenkorb berechnen
  useEffect(() => {
    const berechneGesperrteOrte = async () => {
      if (cart.length === 0) {
        setGesperrteVerbleibOrte(new Set());
        return;
      }
      
      const gesperrt = new Set<string>();
      
      // 1. Lade gesperrte Verbleib-Orte für Kategorien
      const kategorieIds = new Set<string>();
      cart.forEach(cartItem => {
        const item = items.find(i => i.id === cartItem.item.id);
        if (item) {
          item.categoryIds?.forEach(id => kategorieIds.add(id));
        }
      });
      
      for (const katId of kategorieIds) {
        try {
          const sperren = await kategorienApi.getGesperrteVerbleibOrte(katId);
          sperren.forEach(ort => gesperrt.add(ort.id));
        } catch (err) {
          console.error('Fehler beim Laden der Sperren:', err);
        }
      }
      
      // 2. Prüfe Berechtigungsmatrix - finde Verbleib-Orte, die für alle Waren erlaubt sind
      // Die strengste Regel gilt: Ein Ort muss für ALLE Waren im Warenkorb erlaubt sein
      const alleVerbleibOrtIds = verbleibOrte.map(o => o.id);
      
      for (const ortId of alleVerbleibOrtIds) {
        for (const cartItem of cart) {
          const item = items.find(i => i.id === cartItem.item.id);
          if (item && item.erlaubteVerbleibOrte) {
            // Prüfe ob dieser Verbleib-Ort (nach Name) für diese Ware erlaubt ist
            const ortName = verbleibOrte.find(o => o.id === ortId)?.name;
            if (ortName && !item.erlaubteVerbleibOrte.includes(ortName)) {
              gesperrt.add(ortId);
              break; // Ein Artikel blockiert diesen Ort → weiter mit nächstem Ort
            }
          }
        }
      }
      
      setGesperrteVerbleibOrte(gesperrt);
      
      // Wenn aktuell ausgewählter Verbleib-Ort gesperrt ist, Auswahl zurücksetzen
      if (selectedVerbleibOrtId && gesperrt.has(selectedVerbleibOrtId)) {
        setSelectedVerbleibOrtId('');
        setCartLocation('');
      }
    };
    
    berechneGesperrteOrte();
  }, [cart, items, verbleibOrte]);

  const stopScanning = async () => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (hCommRef.current !== null) {
      try {
        await rfidAntennaApi.inventoryStop(hCommRef.current);
        await rfidAntennaApi.closeDevice(hCommRef.current, sessionIdRef.current);
      } catch (err) {
        console.error('Error stopping scan:', err);
      }
      hCommRef.current = null;
    }
    setIsScanning(false);
  };

  const handleStartScan = async () => {
    if (isScanning) {
      await stopScanning();
      return;
    }

    const port = localStorage.getItem('antenna_port');
    const baudrate = localStorage.getItem('antenna_baudrate');
    
    if (!port || !baudrate) {
      addToast('Bitte konfigurieren Sie zuerst die RFID-Antenne in den Einstellungen.', 'error');
      return;
    }

    // Prüfe ob jemand anders scannt
    try {
      const status = await rfidAntennaApi.getScanningStatus();
      if (status.scanning) {
        addToast('Ein anderer Benutzer scannt gerade. Bitte warten.', 'error');
        return;
      }
    } catch (err) {
      // Scanning-Status nicht kritisch, ignorieren
    }

    setIsScanning(true);
    setScanError(null);

    try {
      const openData = await rfidAntennaApi.openDevice(port, parseInt(baudrate), sessionIdRef.current);
      
      if (!openData.success) {
        if (openData.res === 1002) {
          throw new Error('Ein anderer Benutzer scannt gerade. Bitte warten.');
        }
        throw new Error(openData.log || 'Konnte Gerät nicht öffnen');
      }

      hCommRef.current = openData.hComm;
      const hComm = openData.hComm;

      await rfidAntennaApi.startCounting(hComm, {
        DEVICEARRD: 0, RFIDPRO: 0, WORKMODE: 0, INTERFACE: 0, BAUDRATE: 0,
        WGSET: 0, ANT: 1, REGION: 2, STRATFREI: 865, STEPFRE: 250, CN: 6,
        RFIDPOWER: 20, INVENTORYAREA: 6, QVALUE: 4, SESSION: 0,
        ACSADDR: 0, ACSDATALEN: 0, FILTERTIME: 0, TRIGGLETIME: 0,
        BUZZERTIME: 0, INTERNELTIME: 0,
      });

      scanIntervalRef.current = setInterval(async () => {
        try {
          const tags = await rfidAntennaApi.getTagInfo();
          
          if (tags && tags.length > 0) {
            tags.forEach((tag) => {
              const foundItem = items.find(
                (item) => item.tagId.toLowerCase() === tag.epc.toLowerCase()
              );
              if (foundItem) {
                setScannedItems((prev) => {
                  const filtered = prev.filter((s) => s.item.id !== foundItem.id);
                  return [...filtered, { item: foundItem, timestamp: Date.now() }];
                });
              }
            });
          }
        } catch (err) {
          console.error('Scan interval error:', err);
        }
      }, 500);

    } catch (err: any) {
      console.error('Scan error:', err);
      setScanError(err.message || 'Scan fehlgeschlagen');
      stopScanning();
    }
  };

  const addToCart = (item: Item) => {
    if (!item.borrowable) {
      addToast('Diese Ware ist nicht verfügbar.', 'error');
      return;
    }
    if (!item.erlaubteVerbleibOrte || item.erlaubteVerbleibOrte.length === 0) {
      addToast('Diese Ware ist für Ihre Rolle nicht ausleihbar.', 'error');
      return;
    }
    if (cart.find((c) => c.item.id === item.id)) {
      addToast('Ware bereits im Warenkorb.', 'error');
      return;
    }
    setCart([...cart, { item, returnDate: '', location: '' }]);
    addToast(`${item.name} zum Warenkorb hinzugefügt`, 'success');
  };

  const removeFromCart = (itemId: string) => {
    setCart(cart.filter((c) => c.item.id !== itemId));
  };

  const handleBorrowAll = async () => {
    await authApi.ping().catch(() => {});
    
    if (cart.length === 0) return;
    
    if (!cartReturnDate) {
      addToast('Bitte geben Sie ein Rückgabedatum an.', 'error');
      return;
    }
    
    // Validierung: Maximale Leihdauer prüfen
    if (maxLeihdauerTage !== null) {
      const maxDatum = new Date(Date.now() + maxLeihdauerTage * 24 * 60 * 60 * 1000);
      const gewaehltesDatum = new Date(cartReturnDate);
      
      if (gewaehltesDatum > maxDatum) {
        addToast(`Das Rückgabedatum überschreitet die maximale Leihdauer von ${maxLeihdauerTage} Tagen.`, 'error');
        return;
      }
    }
    
    if (!selectedVerbleibOrtId) {
      addToast('Bitte wählen Sie einen Verbleib-Ort.', 'error');
      return;
    }
    
    const selectedOrt = verbleibOrte.find(o => o.id === selectedVerbleibOrtId);
    if (selectedOrt?.raumnummer_erforderlich && !roomNumber.trim()) {
      addToast('Bitte geben Sie eine Raumnummer ein.', 'error');
      return;
    }
    
    setIsLoading(true);
    const errors: string[] = [];
    const successful: string[] = [];
    
    for (const cartItem of cart) {
      try {
        await ausleihenApi.create(cartItem.item.id, {
          geplante_rueckgabe: cartReturnDate,
          verbleib_ort: cartLocation,
          notiz: ''
        });
        successful.push(cartItem.item.name);
      } catch (err: any) {
        console.error(`Error borrowing ${cartItem.item.name}:`, err);
        errors.push(`${cartItem.item.name}: ${err.message || 'Fehler'}`);
      }
    }
    
    setCart([]);
    setCartReturnDate('');
    setCartLocation('');
    setSelectedVerbleibOrtId('');
    setRoomNumber('');
    setIsLoading(false);
    onUpdateItems([]);
    
    if (errors.length > 0) {
      if (successful.length > 0) {
        addToast(`${successful.length} Waren ausgeliehen, ${errors.length} Fehler`, 'error');
      } else {
        addToast('Ausleihe fehlgeschlagen', 'error');
      }
    } else {
      // Zeige Auto-Logout Dialog bei erfolgreicher Ausleihe
      if (onShowAutoLogoutDialog) {
        onShowAutoLogoutDialog('Ausleihe erfolgreich', `${successful.length} Waren erfolgreich ausgeliehen!`);
      }
    }
  };

  // Toggle item selection for return (per Klick in der Liste)
  const toggleItemSelection = (itemId: string) => {
    setSelectedForReturn(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };
  
  // Toggle item selection for return (per RFID-Scan)
  const toggleItemSelectionViaRFID = (itemId: string) => {
    setSelectedForReturn(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
    setRfidSelectedForReturn(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };

  // Select/Deselect all
  const toggleSelectAll = () => {
    if (selectedForReturn.size === myBorrowedItems.length) {
      setSelectedForReturn(new Set());
      setRfidSelectedForReturn(new Set());
    } else {
      setSelectedForReturn(new Set(myBorrowedItems.map(item => item.id)));
    }
  };

  // Handle return selected items - only for items without pending return
  const handleReturnSelected = async () => {
    if (selectedForReturn.size === 0) {
      addToast('Bitte wählen Sie mindestens eine Ware aus.', 'error');
      return;
    }

    // Filter out items that already have a pending return
    const itemsToReturn = myBorrowedItems.filter(item => 
      selectedForReturn.has(item.id) && item.borrowingStatus !== 'rueckgabe_beantragt'
    );
    
    if (itemsToReturn.length === 0) {
      addToast('Für alle ausgewählten Waren wurde bereits eine Rückgabe beantragt.', 'info');
      return;
    }
    
    // Speichere Items für den Schadensmeldungsdialog
    setPendingReturnItems(itemsToReturn);
    setPendingReturnIds(itemsToReturn.map(item => item.id));
    
    const itemsWithTag = itemsToReturn.filter(item => item.tagId && item.tagId.trim() !== '');
    
    // Nur Tags der per RFID-Scan ausgewählten Items als bereits gescannt markieren
    const preScannedTags = new Set<string>();
    itemsToReturn.forEach(item => {
      if (item.tagId && rfidSelectedForReturn.has(item.id)) {
        preScannedTags.add(item.tagId.toLowerCase());
      }
    });

    if (itemsWithTag.length > 0) {
      setScanningItems(itemsWithTag);
      setShowScanModal(true);
      setScannedTagIds(preScannedTags);
      startReturnScan(itemsWithTag, preScannedTags);
    } else {
      // Keine Tags - direkt Schadensmeldungsdialog zeigen
      setPendingScannedTags(preScannedTags);
      setShowSchadensDialog(true);
    }
  };

  // Ref for selected items to handle async state issues
  const selectedForReturnRef = useRef<Set<string>>(new Set());
  
  // Keep ref in sync with state
  useEffect(() => {
    selectedForReturnRef.current = selectedForReturn;
  }, [selectedForReturn]);

  // Lade maximale Leihdauer und blockierte Zeiträume wenn sich Cart oder Verbleib-Ort ändert
  useEffect(() => {
    const ladeZeitraumInfo = async () => {
      if (cart.length === 0 || !selectedVerbleibOrtId) {
        setMaxLeihdauerTage(null);
        setBlockierteZeitraeume([]);
        return;
      }

      setLadeZeitraeume(true);
      try {
        // Finde den Verbleib-Ort Namen
        const ort = verbleibOrte.find(o => o.id === selectedVerbleibOrtId);
        if (!ort) return;

        // Lade für jede Ware im Cart die Zeitraum-Info
        let globaleMaxDauer: number | null = null;
        const alleBlockierteZeitraeume: Array<{von: string; bis: string}> = [];

        for (const cartItem of cart) {
          try {
            const zeitraumInfo = await kategorieVerbleibMatrixApi.getVerfuegbareZeitraeume(
              cartItem.item.id,
              selectedVerbleibOrtId
            );

            // Prüfe maximale Leihdauer (niedrigste wins)
            if (zeitraumInfo.maximale_leihdauer_tage !== null && zeitraumInfo.maximale_leihdauer_tage !== undefined) {
              if (globaleMaxDauer === null || zeitraumInfo.maximale_leihdauer_tage < globaleMaxDauer) {
                globaleMaxDauer = zeitraumInfo.maximale_leihdauer_tage;
              }
            }

            // Sammle blockierte Zeiträume
            for (const blockiert of zeitraumInfo.blockierte_zeitraeume) {
              if (blockiert.von && blockiert.bis) {
                alleBlockierteZeitraeume.push({
                  von: blockiert.von,
                  bis: blockiert.bis
                });
              }
            }
          } catch (err) {
            console.error('Fehler beim Laden der Zeitraum-Info:', err);
          }
        }

        setMaxLeihdauerTage(globaleMaxDauer);
        setBlockierteZeitraeume(alleBlockierteZeitraeume);
      } finally {
        setLadeZeitraeume(false);
      }
    };

    ladeZeitraumInfo();
  }, [cart, selectedVerbleibOrtId, verbleibOrte]);

  // Start scanning for return
  const startReturnScan = async (itemsToScan: Item[], preScannedTags?: Set<string>) => {
    const port = localStorage.getItem('antenna_port');
    const baudrate = localStorage.getItem('antenna_baudrate');
    
    if (!port || !baudrate) {
      addToast('Bitte konfigurieren Sie zuerst die RFID-Antenne in den Einstellungen.', 'error');
      setShowScanModal(false);
      return;
    }

    // Prüfe ob jemand anders scannt
    try {
      const status = await rfidAntennaApi.getScanningStatus();
      if (status.scanning) {
        addToast('Ein anderer Benutzer scannt gerade. Bitte warten.', 'error');
        setShowScanModal(false);
        return;
      }
    } catch (err) {
      console.error('Fehler beim Prüfen des Scanning-Status:', err);
    }

    setIsScanning(true);

    try {
      const openData = await rfidAntennaApi.openDevice(port, parseInt(baudrate), sessionIdRef.current);
      if (!openData.success) {
        if (openData.res === 1002) {
          throw new Error('Ein anderer Benutzer scannt gerade. Bitte warten.');
        }
        throw new Error(openData.log || 'Konnte Gerät nicht öffnen');
      }

      hCommRef.current = openData.hComm;
      const hComm = openData.hComm;

      await rfidAntennaApi.startCounting(hComm, {
        DEVICEARRD: 0, RFIDPRO: 0, WORKMODE: 0, INTERFACE: 0, BAUDRATE: 0,
        WGSET: 0, ANT: 1, REGION: 2, STRATFREI: 865, STEPFRE: 250, CN: 6,
        RFIDPOWER: 20, INVENTORYAREA: 6, QVALUE: 4, SESSION: 0,
        ACSADDR: 0, ACSDATALEN: 0, FILTERTIME: 0, TRIGGLETIME: 0,
        BUZZERTIME: 0, INTERNELTIME: 0,
      });

      // Track scanned tags locally for auto-complete check
      // Initialisiere mit bereits gescannten Tags (z.B. per RFID-Scan ausgewählt)
      let localScannedTags = new Set<string>(preScannedTags || []);
      
      // Prüfe ob alle Items bereits gescannt sind
      const allAlreadyScanned = itemsToScan.every(item => 
        localScannedTags.has(item.tagId.toLowerCase())
      );
      
      if (allAlreadyScanned) {
        addToast('Alle Waren bereits gescannt!', 'success');
        await stopScanning();
        setShowScanModal(false);
        setPendingScannedTags(localScannedTags);
        setShowSchadensDialog(true);
        return;
      }
      
      scanIntervalRef.current = setInterval(async () => {
        try {
          const tags = await rfidAntennaApi.getTagInfo();
          
          if (tags && tags.length > 0) {
            const newTags: string[] = [];
            tags.forEach(tag => {
              const tagId = tag.epc.toLowerCase();
              if (!localScannedTags.has(tagId)) {
                localScannedTags.add(tagId);
                newTags.push(tagId);
              }
            });
            
            if (newTags.length > 0) {
              // Update state with new tags
              setScannedTagIds(prev => {
                const updated = new Set(prev);
                newTags.forEach(t => updated.add(t));
                return updated;
              });
              
              // Check if all items are scanned
              const allScanned = itemsToScan.every(item => 
                localScannedTags.has(item.tagId.toLowerCase())
              );
              
              if (allScanned && scanIntervalRef.current) {
                // Auto-complete - alle Waren wurden gescannt
                // Sofort stoppen um Doppel-Ausführung zu verhindern
                const intervalId = scanIntervalRef.current;
                scanIntervalRef.current = null;
                clearInterval(intervalId);
                
                addToast('Alle Waren gescannt!', 'success');
                
                await stopScanning();
                setShowScanModal(false);
                
                // Schadensmeldungsdialog öffnen
                setPendingScannedTags(localScannedTags);
                setShowSchadensDialog(true);
              }
            }
          }
        } catch (err) {
          // Interval-Fehler ignorieren
        }
      }, 500);

    } catch (err: any) {
      addToast('Scan fehlgeschlagen: ' + err.message, 'error');
      await stopScanning();
    }
  };

  // Handle scan complete
  const handleScanComplete = async (scannedTags: Set<string>) => {
    await stopScanning();
    setShowScanModal(false);
    
    // Speichere gescannte Tags und zeige Schadensmeldungsdialog
    setPendingScannedTags(scannedTags);
    setShowSchadensDialog(true);
  };

  // Process return
  const processReturn = async (itemIds: string[], scannedTags?: Set<string>) => {
    setIsLoading(true);
    
    try {
      const borrowings = await ausleihenApi.getMyBorrowings();
      
      // Only process items that don't already have a pending return
      const itemsToProcess = itemIds.filter(itemId => {
        const item = myBorrowedItems.find(i => i.id === itemId);
        return item && item.borrowingStatus !== 'rueckgabe_beantragt';
      });
      
      if (itemsToProcess.length === 0) {
        addToast('Für alle ausgewählten Waren wurde bereits eine Rückgabe beantragt.', 'info');
        setIsLoading(false);
        setSelectedForReturn(new Set());
        setShowScanModal(false);
        return;
      }
      
      for (const itemId of itemsToProcess) {
        const borrowing = borrowings.find((b: any) => b.ware.id === itemId);
        
        if (borrowing) {
          await ausleihenApi.beantrageRueckgabe(borrowing.id);
        }
      }
      
      // Save scanned tags to localStorage for ReturnView to use
      if (scannedTags && scannedTags.size > 0) {
        const existingScanned = JSON.parse(localStorage.getItem('scannedReturnTags') || '[]');
        const newScanned = Array.from(scannedTags);
        localStorage.setItem('scannedReturnTags', JSON.stringify([...existingScanned, ...newScanned]));
      }
      
      // Clear selection
      setSelectedForReturn(new Set());
      setRfidSelectedForReturn(new Set());
      
      // Reload data
      onUpdateItems([]);
      
      const scannedCount = scannedTags ? 
        itemsToProcess.filter(id => {
          const item = myBorrowedItems.find(i => i.id === id);
          return item && item.tagId && scannedTags.has(item.tagId.toLowerCase());
        }).length : 0;
      
      // Zeige Auto-Logout Dialog
      if (onShowAutoLogoutDialog) {
        const message = scannedCount > 0 
          ? `Rückgabe beantragt. ${scannedCount} von ${itemsToProcess.length} Waren gescannt.`
          : `Rückgabe für ${itemsToProcess.length} Waren erfolgreich beantragt.`;
        onShowAutoLogoutDialog('Rückgabe erfolgreich', message);
      }
    } catch (err: any) {
      console.error('Error returning items:', err);
      addToast(`Fehler: ${err.message || 'Rückgabe fehlgeschlagen'}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle return all - only for items without pending return
  const handleReturnAll = () => {
    // Filter out items that already have a pending return
    const itemsToReturn = myBorrowedItems.filter(item => item.borrowingStatus !== 'rueckgabe_beantragt');
    
    if (itemsToReturn.length === 0) {
      addToast('Für alle Waren wurde bereits eine Rückgabe beantragt.', 'info');
      return;
    }
    
    // Speichere Items für den Schadensmeldungsdialog
    setPendingReturnItems(itemsToReturn);
    setPendingReturnIds(itemsToReturn.map(item => item.id));
    setSelectedForReturn(new Set(itemsToReturn.map(item => item.id)));
    setRfidSelectedForReturn(new Set());
    
    // Direkt zum Scan oder Schadensmeldungsdialog
    const itemsWithTag = itemsToReturn.filter(item => item.tagId && item.tagId.trim() !== '');
    
    if (itemsWithTag.length > 0) {
      setScanningItems(itemsWithTag);
      setShowScanModal(true);
      setScannedTagIds(new Set());
      startReturnScan(itemsWithTag);
    } else {
      // Keine Tags - direkt Schadensmeldungsdialog zeigen
      setPendingScannedTags(new Set());
      setShowSchadensDialog(true);
    }
  };
  
  // Öffne die persönliche Ausleihhistorie
  const handleOpenUserHistory = async () => {
    setIsLoadingHistory(true);
    setShowUserHistory(true);
    try {
      const [history, activeBorrowings] = await Promise.all([
        historieApi.getMyHistory().catch(() => []),
        ausleihenApi.getAll({ meine: true }).catch(() => [])
      ]);
      
      // Aktive Ausleihen in HistoryEntry-Format konvertieren
      const activeAsHistory = activeBorrowings.map((ausleihe: any) => ({
        id: ausleihe.id,
        ware_name: ausleihe.ware?.name || 'Unbekannte Ware',
        ware_kategorie: '',
        benutzer_name: ausleihe.benutzer?.name || '',
        ausgeliehen_am: ausleihe.ausgeliehen_am,
        geplante_rueckgabe: ausleihe.geplante_rueckgabe,
        tatsaechliche_rueckgabe: null,
        verbleib_ort: ausleihe.verbleib_ort,
        zustand: '',
        genehmigt_von: undefined,
        status: ausleihe.status,
      }));
      
      // Kombinieren: Aktive zuerst, dann abgeschlossene Historie
      const combined = [...activeAsHistory, ...history];
      setUserHistory(combined);
    } catch (error) {
      console.error('Fehler beim Laden der Historie:', error);
      addToast('Fehler beim Laden der Ausleihhistorie', 'error');
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // Cancel scan modal
  const handleCancelScan = async () => {
    await stopScanning();
    setShowScanModal(false);
    setScannedTagIds(new Set());
  };

  // Handle Schadensmeldung Submit
  const handleSchadensmeldungSubmit = async () => {
    setShowSchadensDialog(false);
    
    // Führe die Rückgabe durch
    await processReturn(pendingReturnIds, pendingScannedTags);
    
    // Reset
    setPendingReturnItems([]);
    setPendingReturnIds([]);
    setPendingScannedTags(new Set());
  };

  // Continue without scan
  const handleContinueWithoutScan = async () => {
    await stopScanning();
    setShowScanModal(false);
    
    // Zeige Schadensmeldungsdialog
    setPendingScannedTags(scannedTagIds);
    setShowSchadensDialog(true);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Toast Notifications */}
      <div className="fixed top-20 right-4 z-50 space-y-2">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`px-4 py-3 rounded-lg shadow-lg text-white text-sm flex items-center gap-2 ${
              toast.type === 'success' ? 'bg-emerald-500' : 
              toast.type === 'error' ? 'bg-red-500' : 'bg-blue-500'
            }`}
          >
            {toast.type === 'success' ? <Check className="w-4 h-4" /> : 
             toast.type === 'error' ? <AlertTriangle className="w-4 h-4" /> : 
             <Clock className="w-4 h-4" />}
            {toast.message}
          </div>
        ))}
      </div>

      {/* Confirm Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Bestätigung</h3>
            <p className="text-gray-600 mb-6 whitespace-pre-line">{confirmMessage}</p>
            <div className="flex gap-3">
              <button
                onClick={handleCancel}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
              >
                Abbrechen
              </button>
              <button
                onClick={handleConfirm}
                className="flex-1 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
              >
                Bestätigen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Item Info Dialog */}
      <ItemInfoDialog
        item={selectedItemForInfo}
        isOpen={showItemInfoDialog}
        onClose={() => {
          setShowItemInfoDialog(false);
          setSelectedItemForInfo(null);
        }}
        onShowHistory={selectedItemForInfo ? () => {
          const item = items.find(i => i.id === selectedItemForInfo.id);
          if (item) {
            setShowItemInfoDialog(false);
            handleShowHistory(item);
          }
        } : undefined}
        onReportDamage={selectedItemForInfo ? () => {
          const item = items.find(i => i.id === selectedItemForInfo.id);
          if (item) {
            setShowItemInfoDialog(false);
            handleSchadenMelden(item);
          }
        } : undefined}
      />

      {/* Item History Dialog */}
      {selectedItemHistory && (
        <ItemHistoryDialog
          itemName={selectedItemHistory.itemName}
          itemTagId={selectedItemHistory.itemTagId}
          history={selectedItemHistory.history}
          schadensmeldungen={selectedItemHistory.schadensmeldungen}
          onClose={() => setSelectedItemHistory(null)}
        />
      )}

      {/* Direct Schadensmeldung Dialog */}
      {schadensDialog.isOpen && schadensDialog.item && (
        <SchadensmeldungDialog
          items={[schadensDialog.item]}
          isOpen={schadensDialog.isOpen}
          onClose={() => setSchadensDialog({ isOpen: false, item: null })}
          onSubmit={handleDirectSchadensmeldungSubmit}
          mode="mitarbeiter-direct"
        />
      )}

      {/* Header */}
      <header className="bg-white shadow-sm border-b sticky top-0 z-40">
        <div className="w-full px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {(() => {
              const tm = new TokenManager();
              const token = tm.getToken();
              const payload = token ? tm.decodePayload(token) : null;
              const userEmail = (payload as any)?.email || '';
              if (userEmail === 'marius.hetzel@th-koeln.de') {
                return (
                  <h1 className="text-xl font-bold text-teal-700 flex items-center gap-2">
                    <span className="animate-bounce">🎉</span>
                    Willkommen, Chef!
                    <span className="animate-bounce" style={{ animationDelay: '0.2s' }}>✨</span>
                  </h1>
                );
              }
              return <h1 className="text-xl font-bold text-teal-700">Ausleihsystem</h1>;
            })()}
            
            <div className="flex items-center gap-4">
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center gap-2 px-3 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <User className="w-5 h-5" />
                  <span className="hidden sm:inline">{username}</span>
                </button>
                
                {showUserMenu && (
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border py-2 z-50">
                    <div className="px-4 py-2 border-b">
                      <p className="font-medium text-gray-900">{username}</p>
                      <p className="text-xs text-gray-500">{userRole}</p>
                    </div>
                    
                    <button
                      onClick={() => { setShowUserMenu(false); onEditProfile(); }}
                      className="w-full px-4 py-2 text-left text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                    >
                      <User className="w-4 h-4" />
                      Profil bearbeiten
                    </button>
                    
                    {(userRole === 'Mitarbeiter' || userRole === 'Laborleiter' || userRole === 'Admin') && (
                      <>
                        <button
                          onClick={() => { setShowUserMenu(false); onNavigateToReturns(); }}
                          className="w-full px-4 py-2 text-left text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                        >
                          <Package className="w-4 h-4" />
                          Rückgaben verwalten
                        </button>
                        <button
                          onClick={() => { setShowUserMenu(false); onNavigateToManagement(); }}
                          className="w-full px-4 py-2 text-left text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                        >
                          <Package className="w-4 h-4" />
                          Waren verwalten
                        </button>
                      </>
                    )}
                    
                    {(userRole === 'Laborleiter' || userRole === 'Admin') && (
                      <button
                        onClick={() => { setShowUserMenu(false); onNavigateToUsers(); }}
                        className="w-full px-4 py-2 text-left text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                      >
                        <Users className="w-4 h-4" />
                        Benutzerverwaltung
                      </button>
                    )}
                    
                    {(userRole === 'Mitarbeiter' || userRole === 'Laborleiter' || userRole === 'Admin') && (
                      <button
                        onClick={() => { setShowUserMenu(false); onNavigateToAntenna(); }}
                        className="w-full px-4 py-2 text-left text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                      >
                        <Settings className="w-4 h-4" />
                        Einstellungen
                      </button>
                    )}
                    
                    <div className="border-t mt-2 pt-2">
                      <button
                        onClick={() => { setShowUserMenu(false); onLogout(); }}
                        className="w-full px-4 py-2 text-left text-red-600 hover:bg-red-50 flex items-center gap-2"
                      >
                        <LogOut className="w-4 h-4" />
                        Abmelden
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left Column: Available Items */}
          <div className="lg:col-span-3 space-y-6">
            {/* Scanner Section */}
            <div className="bg-white rounded-lg shadow-sm border p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Scan className="w-5 h-5 text-teal-600" />
                  RFID-Scanner
                </h2>
                <div className="flex items-center gap-2">
                  {scannedItems.length > 0 && (
                    <button
                      onClick={() => setScannedItems([])}
                      className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 transition-colors"
                    >
                      Clear
                    </button>
                  )}
                  <button
                    onClick={handleStartScan}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                      isScanning
                        ? 'bg-red-600 text-white hover:bg-red-700'
                        : 'bg-teal-600 text-white hover:bg-teal-700'
                    }`}
                  >
                    {isScanning ? 'Scan stoppen' : 'Scan starten'}
                  </button>
                </div>
              </div>
              
              {scanError && (
                <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
                  {scanError}
                </div>
              )}
              
              {scannedItems.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-700">Gescannte Waren:</p>
                  <div className="flex flex-wrap gap-2">
                    {scannedItems.map((scanned) => (
                      <div
                        key={scanned.item.id}
                        className={`flex items-center gap-2 px-3 py-2 border rounded-lg ${
                          scanned.item.borrowedBy === username
                            ? 'bg-orange-50 border-orange-200'
                            : 'bg-teal-50 border-teal-200'
                        }`}
                      >
                        <span className={`text-sm font-medium flex items-center gap-1 ${
                          scanned.item.borrowedBy === username ? 'text-orange-900' : 'text-teal-900'
                        }`}>
                          {scanned.item.name}
                          {scanned.item.tagId && (
                            <Wifi className="w-3 h-3" title="RFID-Tag hinterlegt" />
                          )}
                        </span>
                        {scanned.item.borrowedBy === username ? (
                          <button
                            onClick={() => {
                              toggleItemSelectionViaRFID(scanned.item.id);
                            }}
                            className={`text-xs px-2 py-1 rounded ${
                              selectedForReturn.has(scanned.item.id)
                                ? 'bg-blue-600 text-white hover:bg-blue-700'
                                : 'bg-orange-600 text-white hover:bg-orange-700'
                            }`}
                          >
                            {selectedForReturn.has(scanned.item.id) ? 'Ausgewählt' : 'Zurückgeben'}
                          </button>
                        ) : !cart.find((c) => c.item.id === scanned.item.id) && scanned.item.borrowable && !scanned.item.borrowedBy && scanned.item.erlaubteVerbleibOrte && scanned.item.erlaubteVerbleibOrte.length > 0 && (
                          <button
                            onClick={() => addToCart(scanned.item)}
                            className="text-xs px-2 py-1 bg-teal-600 text-white rounded hover:bg-teal-700"
                          >
                            + Warenkorb
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Available Items */}
            <div className="bg-white rounded-lg shadow-sm border">
              {/* Header mit Filtern */}
              <div className="p-4 border-b bg-white">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <h2 className="text-lg font-semibold text-gray-900">Verfügbare Waren</h2>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* Suchfeld */}
                    <div className="relative w-48 lg:w-56">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setDisplayCount(ITEMS_PER_PAGE);
                      }}
                      placeholder="Suchen..."
                      className="w-full pl-9 pr-8 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 text-sm transition-all"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5 rounded-full hover:bg-gray-200 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Kategorie Dropdown */}
                  <div className="relative">
                    <select
                      value={selectedCategory}
                      onChange={(e) => {
                        setSelectedCategory(e.target.value);
                        setDisplayCount(ITEMS_PER_PAGE);
                      }}
                      className="appearance-none pl-3 pr-8 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 text-sm cursor-pointer min-w-[140px]"
                    >
                      <option value="">Alle Kategorien</option>
                      {[...categories].sort().map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>

                  {/* Sortierung */}
                  <div className="flex items-center gap-1 bg-gray-50 rounded-lg border border-gray-200 p-0.5">
                    <select
                      value={sortField}
                      onChange={(e) => {
                        setSortField(e.target.value as 'name' | 'created' | 'lastBorrowed');
                        setSortDirection('asc');
                        setDisplayCount(ITEMS_PER_PAGE);
                      }}
                      className="appearance-none bg-transparent px-2 py-1.5 text-sm text-gray-700 focus:outline-none cursor-pointer border-r border-gray-200 pr-6"
                    >
                      <option value="name">Name</option>
                      <option value="created">Hinzugefügt</option>
                      <option value="lastBorrowed">Letzte Ausleihe</option>
                    </select>
                    <button
                      onClick={() => setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')}
                      className="p-1.5 text-gray-500 hover:text-teal-600 hover:bg-white rounded-md transition-all"
                      title={sortDirection === 'asc' ? 'Aufsteigend' : 'Absteigend'}
                    >
                      {sortDirection === 'asc' ? (
                        <ArrowUp className="w-4 h-4" />
                      ) : (
                        <ArrowDown className="w-4 h-4" />
                      )}
                    </button>
                  </div>

                    {/* Ergebnis-Counter */}
                    <span className="text-sm text-gray-500 ml-2">
                      {filteredItems.length} {filteredItems.length === 1 ? 'Artikel' : 'Artikel'}
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="p-4">
                {filteredItems.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">Keine Waren gefunden</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-stretch">
                    {paginatedItems.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => handleShowItemInfo(item.id)}
                        className={`border rounded-lg p-4 transition-colors flex flex-col h-full ${
                          item.borrowedBy
                            ? 'bg-orange-50 border-orange-200 hover:border-orange-400'
                            : item.borrowable
                            ? 'bg-white border-gray-200 hover:border-teal-400'
                            : 'bg-gray-50 border-gray-200 hover:border-gray-400'
                        }`}
                        title="Klicken für Details"
                      >
                        {/* Header - immer oben */}
                        <div className="flex justify-between items-start mb-2">
                          <h3 className="font-medium text-gray-900 flex items-center gap-2">
                            {item.name}
                            {item.tagId && (
                              <Wifi className="w-4 h-4 text-teal-500" title="RFID-Tag hinterlegt" />
                            )}
                          </h3>
                          <span className={`px-2 py-1 text-xs rounded ${
                            item.borrowedBy
                              ? 'bg-orange-100 text-orange-700'
                              : item.borrowable
                              ? 'bg-teal-100 text-teal-700'
                              : 'bg-gray-100 text-gray-600'
                          }`}>
                            {item.borrowedBy ? 'Ausgeliehen' : item.borrowable ? 'Verfügbar' : 'Nicht ausleihbar'}
                          </span>
                        </div>
                        
                        {/* Inhalt - flexibel */}
                        <div className="flex-1">
                          <p className="text-sm text-gray-600 mb-1">
                            {item.categories.length > 0 
                              ? [...item.categories].sort().join(', ') 
                              : 'Keine Kategorie'}
                          </p>
                          {item.description && (
                            <p className="text-sm text-gray-500 mb-2 line-clamp-2">{item.description}</p>
                          )}
                          <p className="text-xs text-gray-500 mb-3">Schrank: {item.cabinetNumber}</p>
                          
                          {item.borrowedBy && (
                            <div className="text-xs text-orange-600 mb-3 space-y-1">
                              {item.borrowedBy === username ? (
                                <>
                                  <p>Ausgeliehen von: {item.borrowedBy}</p>
                                  {item.location && <p>Verbleib: {item.location}</p>}
                                  {item.returnDate && (
                                    <p className={isDateInPast(item.returnDate) ? 'text-red-600 font-semibold' : ''}>
                                      Rückgabe: {formatDate(item.returnDate)}
                                      {isDateInPast(item.returnDate) && ' (überfällig)'}
                                    </p>
                                  )}
                                </>
                              ) : userRole === 'Student' ? (
                                <>
                                  <p>Status: Ausgeliehen</p>
                                  {item.returnDate && (
                                    <p className={isDateInPast(item.returnDate) ? 'text-red-600 font-semibold' : ''}>
                                      Rückgabe: {formatDate(item.returnDate)}
                                      {isDateInPast(item.returnDate) && ' (überfällig)'}
                                    </p>
                                  )}
                                </>
                              ) : (
                                <>
                                  <p>Ausgeliehen von: {item.borrowedBy}</p>
                                  {item.location && <p>Verbleib: {item.location}</p>}
                                  {item.returnDate && (
                                    <p className={isDateInPast(item.returnDate) ? 'text-red-600 font-semibold' : ''}>
                                      Rückgabe: {formatDate(item.returnDate)}
                                      {isDateInPast(item.returnDate) && ' (überfällig)'}
                                    </p>
                                  )}
                                </>
                              )}
                            </div>
                          )}
                        </div>
                        
                        {/* Button - immer unten */}
                        {item.borrowable && !item.borrowedBy && item.erlaubteVerbleibOrte && item.erlaubteVerbleibOrte.length > 0 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation(); // Verhindert, dass der Dialog geöffnet wird
                              addToCart(item);
                            }}
                            disabled={cart.find((c) => c.item.id === item.id) !== undefined}
                            className={`w-full px-3 py-2 rounded-lg text-sm font-medium transition-colors mt-auto ${
                              cart.find((c) => c.item.id === item.id)
                                ? 'bg-gray-100 text-gray-500 cursor-not-allowed'
                                : 'bg-teal-600 text-white hover:bg-teal-700'
                            }`}
                          >
                            {cart.find((c) => c.item.id === item.id)
                              ? 'Im Warenkorb'
                              : 'Zum Warenkorb'}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                
                {/* Weitere laden Button */}
                {hasMoreItems && (
                  <div className="mt-4 text-center">
                    <button
                      onClick={() => setDisplayCount(prev => prev + ITEMS_PER_PAGE)}
                      className="flex items-center justify-center gap-2 w-full px-4 py-3 text-sm font-medium text-teal-700 bg-white border border-teal-200 rounded-lg hover:bg-teal-50 hover:border-teal-300 transition-colors"
                    >
                      <ChevronDown className="w-4 h-4" />
                      Weitere Waren laden
                      <span className="text-gray-500">
                        ({Math.min(displayCount + ITEMS_PER_PAGE, filteredItems.length)} von {filteredItems.length})
                      </span>
                    </button>
                  </div>
                )}
                
                {/* Info wenn alle geladen sind und mehr als 50 */}
                {!hasMoreItems && filteredItems.length > ITEMS_PER_PAGE && (
                  <div className="mt-4 text-center text-sm text-gray-500">
                    Alle {filteredItems.length} Waren werden angezeigt
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Cart and My Borrowings */}
          <div className="space-y-6">
            {/* Cart */}
            <div className="bg-white rounded-lg shadow-sm border">
              <div className="p-4 border-b flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <ShoppingCart className="w-5 h-5 text-teal-600" />
                  Warenkorb
                </h2>
                <span className="px-2 py-1 bg-teal-100 text-teal-700 text-sm rounded-full">
                  {cart.length}
                </span>
              </div>
              
              <div className="p-4">
                {cart.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">Warenkorb ist leer</p>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-3 p-3 bg-gray-50 rounded-lg">
                      {/* Verbleib zuerst - Pflichtfeld */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Verbleib *
                        </label>
                        <div className="space-y-2">
                          {verbleibOrte.length === 0 ? (
                            <p className="text-sm text-gray-500">Keine Verbleib-Orte verfügbar</p>
                          ) : (
                            verbleibOrte.map(ort => {
                              const isGesperrt = gesperrteVerbleibOrte.has(ort.id);
                              const isSelected = selectedVerbleibOrtId === ort.id;
                              const needsRoomNumber = ort.raumnummer_erforderlich;
                              
                              return (
                                <div key={ort.id}>
                                  <label className={`flex items-center gap-2 cursor-pointer ${isGesperrt ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                    <input
                                      type="radio"
                                      name="verbleibOrt"
                                      checked={isSelected}
                                      disabled={isGesperrt}
                                      onChange={() => {
                                        if (!isGesperrt) {
                                          setSelectedVerbleibOrtId(ort.id);
                                          if (!needsRoomNumber) {
                                            setCartLocation(ort.name);
                                            setRoomNumber('');
                                          } else {
                                            setCartLocation('');
                                          }
                                        }
                                      }}
                                      className="w-4 h-4 border-gray-300 text-teal-600 focus:ring-teal-500"
                                    />
                                    <span className={`text-sm ${isGesperrt ? 'line-through text-gray-400' : ''}`}>
                                      {ort.name}
                                      {isGesperrt && <span className="text-red-500 ml-1">(gesperrt)</span>}
                                    </span>
                                  </label>
                                  
                                  {/* Raumnummer Feld (nur wenn für diesen Ort erforderlich) */}
                                  {isSelected && needsRoomNumber && (
                                    <div className="ml-6 mt-2">
                                      <input
                                        type="text"
                                        value={roomNumber}
                                        onChange={(e) => {
                                          const value = e.target.value;
                                          setRoomNumber(value);
                                          setCartLocation(`${ort.name} - ${value}`);
                                        }}
                                        placeholder="Raumnummer z.B. 2.204"
                                        className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
                                      />
                                    </div>
                                  )}
                                </div>
                              );
                            })
                          )}
                          
                          {gesperrteVerbleibOrte.size > 0 && (
                            <p className="text-xs text-orange-600 mt-2">
                              Einige Verbleib-Orte sind aufgrund der Kategorien oder Berechtigungen im Warenkorb gesperrt.
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Rückgabedatum - erst nach Verbleib-Auswahl */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-sm font-medium text-gray-700">
                            Rückgabedatum *
                          </label>
                          {maxLeihdauerTage !== null && (
                            <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded">
                              Max. {maxLeihdauerTage} Tage
                            </span>
                          )}
                        </div>
                        
                        {/* Datums-Hilfe */}
                        <div className="mb-2 p-2 bg-blue-50 border border-blue-200 rounded text-xs">
                          {maxLeihdauerTage !== null ? (
                            <>
                              <p className="text-blue-700">
                                <strong>Maximale Leihdauer:</strong> {maxLeihdauerTage} Tage
                              </p>
                              <p className="text-blue-600 mt-1">
                                Bis: {formatDate(new Date(Date.now() + maxLeihdauerTage * 24 * 60 * 60 * 1000).toISOString().split('T')[0])}
                              </p>
                            </>
                          ) : (
                            <p className="text-blue-700">
                              <strong>Keine maximale Leihdauer festgelegt</strong><br />
                              <span className="text-blue-600">Rückgabe bis zu 1 Jahr möglich</span>
                            </p>
                          )}
                        </div>
                        
                        {/* Hinweis wenn Verbleib nicht ausgewählt */}
                        {!selectedVerbleibOrtId && (
                          <div className="mb-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs">
                            <p className="text-amber-700">
                              <strong>Bitte zuerst Verbleib auswählen</strong>
                            </p>
                          </div>
                        )}
                        
                        <div className="relative">
                          <input
                            type="date"
                            value={cartReturnDate}
                            min={new Date().toISOString().split('T')[0]}
                            max={maxLeihdauerTage !== null ? 
                              new Date(Date.now() + maxLeihdauerTage * 24 * 60 * 60 * 1000).toISOString().split('T')[0] : 
                              new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
                            }
                            disabled={!selectedVerbleibOrtId}
                            onChange={(e) => {
                              const gewaehltesDatum = e.target.value;
                              if (!gewaehltesDatum) {
                                setCartReturnDate('');
                                return;
                              }
                              
                              // Prüfung: Verbleib ausgewählt?
                              if (!selectedVerbleibOrtId) {
                                addToast('Bitte wählen Sie zuerst einen Verbleib-Ort aus.', 'error');
                                setCartReturnDate('');
                                return;
                              }
                              
                              // Validierung: Wochenende prüfen
                              const date = new Date(gewaehltesDatum);
                              const day = date.getDay();
                              if (day === 0 || day === 6) {
                                addToast('Wochenenden (Samstag und Sonntag) sind nicht als Rückgabedatum erlaubt.', 'error');
                                setCartReturnDate('');
                                return;
                              }
                              
                              // Validierung: Nicht in der Vergangenheit
                              const heute = new Date();
                              heute.setHours(0, 0, 0, 0);
                              const gewaehlt = new Date(gewaehltesDatum);
                              if (gewaehlt < heute) {
                                addToast('Das Datum darf nicht in der Vergangenheit liegen.', 'error');
                                setCartReturnDate('');
                                return;
                              }
                              
                              // Validierung: Maximale Leihdauer
                              if (maxLeihdauerTage !== null) {
                                const maxDatum = new Date(Date.now() + maxLeihdauerTage * 24 * 60 * 60 * 1000);
                                maxDatum.setHours(23, 59, 59, 999);
                                if (gewaehlt > maxDatum) {
                                  addToast(`Das Datum überschreitet die maximale Leihdauer von ${maxLeihdauerTage} Tagen.`, 'error');
                                  setCartReturnDate('');
                                  return;
                                }
                              }
                              
                              setCartReturnDate(gewaehltesDatum);
                            }}
                            className={`w-full px-3 py-2 text-base border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 ${!selectedVerbleibOrtId ? 'bg-gray-100 cursor-not-allowed' : 'border-gray-300'}`}
                            onInvalid={(e) => {
                              e.preventDefault();
                              addToast('Bitte wählen Sie ein Datum innerhalb des erlaubten Zeitraums.', 'error');
                            }}
                          />
                        </div>
                        
                        {/* Blockierte Zeiträume anzeigen */}
                        {blockierteZeitraeume.length > 0 && (
                          <div className="mt-2 p-2 bg-orange-50 border border-orange-200 rounded text-xs">
                            <p className="font-medium text-orange-700 mb-1">Bereits reserviert:</p>
                            <ul className="space-y-0.5">
                              {blockierteZeitraeume.slice(0, 3).map((z, i) => (
                                <li key={i} className="text-orange-600">
                                  {new Date(z.von).toLocaleDateString()} - {new Date(z.bis).toLocaleDateString()}
                                </li>
                              ))}
                              {blockierteZeitraeume.length > 3 && (
                                <li className="text-orange-500">+ {blockierteZeitraeume.length - 3} weitere</li>
                              )}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {cart.map((cartItem) => (
                        <div
                          key={cartItem.item.id}
                          onClick={() => handleShowItemInfo(cartItem.item.id)}
                          className="flex items-center justify-between p-3 border rounded-lg hover:border-teal-400 transition-colors"
                          title="Klicken für Details"
                        >
                          <div className="flex-1">
                            <p className="font-medium text-sm flex items-center gap-1">
                              {cartItem.item.name}
                              {cartItem.item.tagId && (
                                <Wifi className="w-3 h-3 text-teal-500" title="RFID-Tag hinterlegt" />
                              )}
                            </p>
                            <p className="text-xs text-gray-500">
                              {cartItem.item.categories.length > 0 
                                ? [...cartItem.item.categories].sort().join(', ') 
                                : 'Keine Kategorie'}
                            </p>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation(); // Verhindert, dass der Dialog geöffnet wird
                              removeFromCart(cartItem.item.id);
                            }}
                            className="text-red-500 hover:text-red-700 p-2"
                            title="Aus Warenkorb entfernen"
                          >
                            <X className="w-6 h-6" />
                          </button>
                        </div>
                      ))}
                    </div>

                    {/* Warnung wenn Datum zu weit in der Zukunft */}
                    {(() => {
                      const isDateInvalid = maxLeihdauerTage !== null && cartReturnDate && 
                        compareDates(cartReturnDate, new Date(Date.now() + maxLeihdauerTage * 24 * 60 * 60 * 1000).toISOString().split('T')[0]) > 0;
                      
                      if (isDateInvalid) {
                        return (
                          <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                            <strong>Datum zu weit in der Zukunft!</strong><br />
                            Maximale Leihdauer: {maxLeihdauerTage} Tage
                          </div>
                        );
                      }
                      return null;
                    })()}

                    <button
                      onClick={handleBorrowAll}
                      disabled={isLoading || cart.length === 0 || (maxLeihdauerTage !== null && cartReturnDate && compareDates(cartReturnDate, new Date(Date.now() + maxLeihdauerTage * 24 * 60 * 60 * 1000).toISOString().split('T')[0]) > 0)}
                      className="w-full px-4 py-3 bg-teal-600 text-white rounded-lg font-medium hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isLoading ? 'Wird ausgeliehen...' : `Alle ausleihen (${cart.length})`}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* My Borrowings */}
            <div className="bg-white rounded-lg shadow-sm border">
              {/* Header - klickbar für Historie */}
              <div 
                className="p-4 border-b cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={handleOpenUserHistory}
                title="Klicken für vollständige Ausleihhistorie"
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    <History className="w-5 h-5 text-teal-600" />
                    Meine Ausleihen
                  </h2>
                  <span className="px-2 py-1 bg-orange-100 text-orange-700 text-sm rounded-full">
                    {myBorrowedItems.length}
                  </span>
                </div>
              </div>
              
              {/* Buttons - nicht klickbar für Historie */}
              {myBorrowedItems.length > 0 && (
                <div className="p-4 border-b bg-gray-50">
                  <div className="flex gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleSelectAll(); }}
                      className="flex-1 px-3 py-2 bg-white border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      {selectedForReturn.size === myBorrowedItems.length ? 'Keine auswählen' : 'Alle auswählen'}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleReturnSelected(); }}
                      disabled={isLoading || selectedForReturn.size === 0}
                      className="flex-1 px-3 py-2 bg-orange-600 text-white text-sm rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:bg-gray-300 flex items-center justify-center gap-2"
                    >
                      <Check className="w-4 h-4" />
                      Ausgewählte zurückgeben {selectedForReturn.size > 0 && `(${selectedForReturn.size})`}
                    </button>
                  </div>
                </div>
              )}
              
              <div className="p-4">
                {myBorrowedItems.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">Keine ausgeliehenen Waren</p>
                ) : (
                  <div className="space-y-3">
                    {myBorrowedItems.map((item) => {
                      const isPendingReturn = item.borrowingStatus === 'rueckgabe_beantragt';
                      return (
                        <div 
                          key={item.id} 
                          className={`border rounded-lg p-3 transition-colors ${
                            isPendingReturn
                              ? 'bg-blue-50 border-blue-200'
                              : selectedForReturn.has(item.id) 
                                ? 'bg-teal-50 border-teal-300 cursor-pointer' 
                                : 'hover:bg-gray-50 cursor-pointer'
                          }`}
                          onClick={() => !isPendingReturn && toggleItemSelection(item.id)}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center mt-0.5 ${
                              isPendingReturn
                                ? 'bg-blue-200 border-blue-400'
                                : selectedForReturn.has(item.id) 
                                  ? 'bg-teal-600 border-teal-600' 
                                  : 'border-gray-300'
                            }`}>
                              {selectedForReturn.has(item.id) && <Check className="w-3 h-3 text-white" />}
                            </div>
                            <div className="flex-1">
                              <div className="flex justify-between items-start mb-1">
                                <p className="font-medium text-sm flex items-center gap-1">
                                  {item.name}
                                  {item.tagId && (
                                    <Wifi className="w-3 h-3 text-teal-500" title="RFID-Tag hinterlegt" />
                                  )}
                                </p>
                                <div className="flex items-center gap-1">
                                  {isPendingReturn && (
                                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">
                                      Rückgabe beantragt
                                    </span>
                                  )}
                                  {item.tagId && (
                                    <Wifi className="w-3 h-3 text-teal-500" title="RFID-Tag hinterlegt" />
                                  )}
                                </div>
                              </div>
                              <div className="text-xs text-gray-600 space-y-0.5">
                                <p>Schrank: {item.cabinetNumber}</p>
                                {item.borrowedAt && (
                                  <p>Seit: {formatDate(item.borrowedAt.split('T')[0])}</p>
                                )}
                                {item.returnDate && (
                                  <p className={isDateInPast(item.returnDate) ? 'text-red-600 font-semibold' : ''}>
                                    Rückgabe: {formatDate(item.returnDate)}
                                    {isDateInPast(item.returnDate) && ' (überfällig)'}
                                  </p>
                                )}
                                {item.location && <p>Verbleib: {item.location}</p>}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Scan Modal for Return */}
      {/* Schadensmeldung Dialog */}
      {showSchadensDialog && (
        <SchadensmeldungDialog
          items={pendingReturnItems}
          ausleiheIds={pendingReturnItems.map(item => item.borrowingId).filter(Boolean) as string[]}
          itemAusleiheMap={pendingReturnItems.reduce((acc, item) => {
            if (item.borrowingId) acc[item.id] = item.borrowingId;
            return acc;
          }, {} as Record<string, string>)}
          isOpen={showSchadensDialog}
          onClose={() => {
            setShowSchadensDialog(false);
            setPendingReturnItems([]);
            setPendingReturnIds([]);
            setPendingScannedTags(new Set());
            setRfidSelectedForReturn(new Set());
          }}
          onSubmit={handleSchadensmeldungSubmit}
          mode="return"
        />
      )}

      {/* Scan Modal for Return */}
      {showScanModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={(e) => { if (e.target === e.currentTarget) handleCancelScan(); }}>
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Scan className="w-5 h-5 text-teal-600" />
                  Waren scannen
                </h3>
                <button
                  onClick={handleCancelScan}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <p className="text-sm text-gray-600 mb-4">
                Bitte scannen Sie die folgenden Waren ein:
              </p>
              
              <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
                {scanningItems.map((item) => {
                  const isScanned = scannedTagIds.has(item.tagId.toLowerCase());
                  return (
                    <div 
                      key={item.id} 
                      className={`flex items-center gap-3 p-3 rounded-lg ${
                        isScanned ? 'bg-green-50 border border-green-200' : 'bg-gray-50 border border-gray-200'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center ${
                        isScanned ? 'bg-green-500' : 'bg-gray-300'
                      }`}>
                        {isScanned ? (
                          <Check className="w-3 h-3 text-white" />
                        ) : (
                          <Clock className="w-3 h-3 text-white" />
                        )}
                      </div>
                      <span className={`text-sm ${isScanned ? 'text-green-900' : 'text-gray-700'}`}>
                        {item.name}
                      </span>
                      {isScanned && (
                        <span className="ml-auto text-xs text-green-600 font-medium">
                          Gescannt
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              
              <div className="text-sm text-gray-500 mb-4 text-center">
                {Array.from(scannedTagIds).filter(tagId => 
                  scanningItems.some(item => item.tagId.toLowerCase() === tagId)
                ).length} von {scanningItems.length} gescannt
              </div>
              
              <div className="flex gap-2">
                <button
                  onClick={handleCancelScan}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  Abbrechen
                </button>
                <button
                  onClick={handleContinueWithoutScan}
                  className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
                >
                  Ohne Scannen fortfahren
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* User History Dialog */}
      {showUserHistory && (
        <UserHistoryDialog
          username={username}
          history={userHistory}
          isLoading={isLoadingHistory}
          onClose={() => setShowUserHistory(false)}
        />
      )}
    </div>
  );
}
