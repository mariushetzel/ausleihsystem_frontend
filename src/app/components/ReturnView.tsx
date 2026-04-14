import { useState, useEffect, useRef } from 'react';
import { generateUUID } from '../utils/uuid';
import { ArrowLeft, Package, Search, Scan, CheckCircle2, User, Check, Clock, X, AlertTriangle, PackageX } from 'lucide-react';
import { Item } from './ItemDialog';
import { HistoryEntry } from './Dashboard';
import { ausleihenApi, rfidAntennaApi, schadensmeldungApi } from '../api';
import { SchadensmeldungDialog } from './SchadensmeldungDialog';

interface ReturnViewProps {
  username: string;
  userRole: string;
  items: Item[];
  onUpdateItems: (items: Item[]) => void;
  onAddHistory: (entries: HistoryEntry[]) => void;
  onBack: () => void;
}

interface GroupedBorrower {
  borrower: string;
  items: Item[];
  checkedItems: Set<string>;
}

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error';
}

export function ReturnView({ username, userRole, items, onUpdateItems, onAddHistory, onBack }: ReturnViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [groupedBorrowers, setGroupedBorrowers] = useState<GroupedBorrower[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [scannedTagIds, setScannedTagIds] = useState<string[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  
  // Schadensmeldung Dialog State
  const [showSchadensDialog, setShowSchadensDialog] = useState(false);
  const [pendingReturnBorrower, setPendingReturnBorrower] = useState<string | null>(null);
  const [offeneSchadensmeldungen, setOffeneSchadensmeldungen] = useState<any[]>([]);
  const [forceShowSchadensDialog, setForceShowSchadensDialog] = useState(false);
  
  // Für RFID-Scan Auto-Open Dialog
  const [pendingScanBorrower, setPendingScanBorrower] = useState<string | null>(null);
  
  // Offene Schadensmeldungen pro Borrower (für Button-Anzeige)
  const [offeneMeldungenMap, setOffeneMeldungenMap] = useState<Record<string, number>>({});
  
  // Schadensmeldungen pro Item (für Icon-Anzeige)
  const [itemSchadensMap, setItemSchadensMap] = useState<Record<string, number>>({});
  
  // Verschwunden Dialog State
  const [showVerschwundenDialog, setShowVerschwundenDialog] = useState(false);
  const [pendingVerschwundenBorrower, setPendingVerschwundenBorrower] = useState<string | null>(null);
  
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const hCommRef = useRef<number | null>(null);

  const isMitarbeiterOrHigher = userRole === 'Mitarbeiter' || userRole === 'Laborleiter' || userRole === 'Admin';

  const borrowedItems = items.filter((item) => item.borrowedBy);

  // Lade offene Schadensmeldungen für alle Borrower und Items
  useEffect(() => {
    const loadOffeneSchadensmeldungen = async () => {
      const newMap: Record<string, number> = {};
      const newItemMap: Record<string, number> = {};
      
      for (const group of groupedBorrowers) {
        let count = 0;
        for (const item of group.items) {
          if (item.borrowingId) {
            try {
              const meldungen = await schadensmeldungApi.getAll({ ausleihe_id: item.borrowingId });
              const offene = meldungen.filter(m => !m.quittiert);
              count += offene.length;
              
              // Speichere pro Item
              if (offene.length > 0) {
                newItemMap[item.id] = offene.length;
              }
            } catch (e) {
              // Ignorieren
            }
          }
        }
        if (count > 0) {
          newMap[group.borrower] = count;
        }
      }
      
      setOffeneMeldungenMap(newMap);
      setItemSchadensMap(newItemMap);
    };
    
    if (groupedBorrowers.length > 0) {
      loadOffeneSchadensmeldungen();
    }
  }, [groupedBorrowers]);

  // Group items by borrower
  useEffect(() => {
    const grouped = borrowedItems.reduce((acc, item) => {
      const borrower = item.borrowedBy!;
      const existing = acc.find(g => g.borrower === borrower);
      
      // Check if this item was scanned (from localStorage)
      const scannedTags = JSON.parse(localStorage.getItem('scannedReturnTags') || '[]');
      const wasScanned = item.tagId && scannedTags.includes(item.tagId.toLowerCase());
      
      if (existing) {
        existing.items.push(item);
        // Auto-check if scanned and has pending return
        if (wasScanned && item.borrowingStatus === 'rueckgabe_beantragt') {
          existing.checkedItems.add(item.id);
        }
      } else {
        const checkedItems = new Set<string>();
        if (wasScanned && item.borrowingStatus === 'rueckgabe_beantragt') {
          checkedItems.add(item.id);
        }
        acc.push({
          borrower,
          items: [item],
          checkedItems,
        });
      }
      return acc;
    }, [] as GroupedBorrower[]);

    // Sort: pending returns first, then overdue
    const today = new Date().toISOString().split('T')[0];
    grouped.sort((a, b) => {
      const aPending = a.items.some(item => item.borrowingStatus === 'rueckgabe_beantragt');
      const bPending = b.items.some(item => item.borrowingStatus === 'rueckgabe_beantragt');
      if (aPending && !bPending) return -1;
      if (!aPending && bPending) return 1;
      
      const aOverdue = a.items.some(item => item.returnDate && item.returnDate < today);
      const bOverdue = b.items.some(item => item.returnDate && item.returnDate < today);
      if (aOverdue && !bOverdue) return -1;
      if (!aOverdue && bOverdue) return 1;
      return 0;
    });

    setGroupedBorrowers(grouped);
  }, [items]);

  // Filter borrowers based on search query and scanned tags
  const filteredBorrowers = groupedBorrowers
    .map(group => ({
      ...group,
      items: group.items.filter((item) => {
        if (scannedTagIds.length > 0) {
          return scannedTagIds.some(tagId => 
            item.tagId.toLowerCase() === tagId.toLowerCase()
          );
        }
        return (
          item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.tagId.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.borrowedBy?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.cabinetNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.categories.some(cat => cat.toLowerCase().includes(searchQuery.toLowerCase()))
        );
      })
    }))
    .filter(group => group.items.length > 0);

  const addToast = (message: string, type: 'success' | 'error') => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, message, type }]);
  };

  // Auto-hide toasts after 3 seconds
  useEffect(() => {
    if (toasts.length === 0) return;
    
    const timers = toasts.map(toast => 
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== toast.id));
      }, 3000)
    );
    
    return () => {
      timers.forEach(timer => clearTimeout(timer));
    };
  }, [toasts]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopScanning();
    };
  }, []);

  const sessionIdRef = useRef<string>(generateUUID());

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
        // Scan-Stop-Fehler ignorieren
      }
      hCommRef.current = null;
    }
    setIsScanning(false);
  };

  const handleToggleScan = async () => {
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
      // Scanning-Status-Fehler ignorieren
    }

    setIsScanning(true);
    setScannedTagIds([]);

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
            setScannedTagIds(prev => {
              const newTags = tags
                .map(t => t.epc.toLowerCase())
                .filter(tagId => !prev.includes(tagId));
              return [...prev, ...newTags];
            });
            
            // Auto-check found items
            tags.forEach((tag) => {
              const foundItem = items.find(
                (item) => item.tagId.toLowerCase() === tag.epc.toLowerCase() && item.borrowedBy
              );
              if (foundItem) {
                const borrower = foundItem.borrowedBy!;
                setGroupedBorrowers(prev => prev.map(group => {
                  if (group.borrower === borrower) {
                    const newChecked = new Set(group.checkedItems);
                    newChecked.add(foundItem.id);
                    return { ...group, checkedItems: newChecked };
                  }
                  return group;
                }));
              }
            });
          }
        } catch (err) {
          // Scan-Interval-Fehler ignorieren
        }
      }, 500);
      
    } catch (err: any) {
      addToast(err.message || 'Scan fehlgeschlagen', 'error');
      await stopScanning();
    }
  };

  const handleToggleItem = (borrower: string, itemId: string) => {
    setGroupedBorrowers(prev => prev.map(group => {
      if (group.borrower === borrower) {
        const newChecked = new Set(group.checkedItems);
        if (newChecked.has(itemId)) {
          newChecked.delete(itemId);
        } else {
          newChecked.add(itemId);
        }
        return { ...group, checkedItems: newChecked };
      }
      return group;
    }));
  };

  const handleToggleAll = (borrower: string, checked: boolean) => {
    setGroupedBorrowers(prev => prev.map(group => {
      if (group.borrower === borrower) {
        if (checked) {
          return { ...group, checkedItems: new Set(group.items.map(i => i.id)) };
        } else {
          return { ...group, checkedItems: new Set() };
        }
      }
      return group;
    }));
  };

  // Auto-open Schadensmeldung Dialog when items are scanned via RFID
  useEffect(() => {
    // Wenn Tags gescannt wurden, prüfe ob es dazugehörige Borrower gibt
    if (scannedTagIds.length > 0) {
      // Sammle alle Borrower, deren Items gescannt wurden
      const scannedBorrowers = groupedBorrowers.filter(group => 
        group.items.some(item => 
          item.tagId && scannedTagIds.some(tagId => 
            item.tagId.toLowerCase() === tagId.toLowerCase()
          )
        )
      );
      
      // Wenn genau ein Borrower gefunden wurde, öffne den Dialog automatisch
      if (scannedBorrowers.length === 1 && !showSchadensDialog) {
        const borrower = scannedBorrowers[0];
        // Prüfe ob alle gescannten Items zum selben Borrower gehören
        const allScannedItemsBelongToBorrower = scannedTagIds.every(tagId => {
          const item = items.find(i => i.tagId.toLowerCase() === tagId.toLowerCase());
          return item && item.borrowedBy === borrower.borrower;
        });
        
        if (allScannedItemsBelongToBorrower && pendingScanBorrower !== borrower.borrower) {
          setPendingScanBorrower(borrower.borrower);
          // Kurze Verzögerung, damit der Benutzer sieht was passiert
          setTimeout(() => {
            handleReturn(borrower.borrower);
          }, 500);
        }
      }
    }
  }, [scannedTagIds, groupedBorrowers, items, showSchadensDialog, pendingScanBorrower]);

  // Lade offene Schadensmeldungen für eine Ausleihe
  const loadOffeneMeldungenFuerDialog = async (borrower: string) => {
    const group = groupedBorrowers.find(g => g.borrower === borrower);
    if (!group) return [];
    
    const itemsToCheck = group.items.filter(item => group.checkedItems.has(item.id));
    const offeneMeldungen: any[] = [];
    const itemSchadenCount: Record<string, number> = {};
    
    for (const item of itemsToCheck) {
      if (item.borrowingId) {
        try {
          const meldungen = await schadensmeldungApi.getAll({ ausleihe_id: item.borrowingId });
          const offene = meldungen.filter(m => !m.quittiert);
          offeneMeldungen.push(...offene);
          
          // Zähle Schadensmeldungen pro Item
          if (offene.length > 0) {
            itemSchadenCount[item.id] = offene.length;
          }
        } catch (e) {
          // Ignorieren
        }
      }
    }
    
    // Speichere die Item-Schadenszuordnung
    setItemSchadensMap(prev => ({ ...prev, ...itemSchadenCount }));
    
    return offeneMeldungen;
  };

  // Direkt quittieren - öffnet Dialog nur wenn Schadensmeldungen existieren
  const handleQuittieren = async (borrower: string) => {
    const group = groupedBorrowers.find(g => g.borrower === borrower);
    if (!group || group.checkedItems.size === 0) {
      addToast('Bitte wählen Sie mindestens eine Ware aus.', 'error');
      return;
    }

    // Lade offene Schadensmeldungen
    const offene = await loadOffeneMeldungenFuerDialog(borrower);
    
    if (offene.length > 0) {
      // Es gibt Schadensmeldungen -> Dialog öffnen
      setOffeneSchadensmeldungen(offene);
      setPendingReturnBorrower(borrower);
      setForceShowSchadensDialog(false);
      setShowSchadensDialog(true);
    } else {
      // Keine Schadensmeldungen -> Direkt quittieren
      await executeQuittierung(borrower);
    }
  };

  // Quittieren mit Schadensmeldung - öffnet immer den Dialog
  const handleQuittierenMitSchaden = async (borrower: string) => {
    const group = groupedBorrowers.find(g => g.borrower === borrower);
    if (!group || group.checkedItems.size === 0) {
      addToast('Bitte wählen Sie mindestens eine Ware aus.', 'error');
      return;
    }

    // Lade offene Schadensmeldungen (falls vorhanden)
    const offene = await loadOffeneMeldungenFuerDialog(borrower);
    setOffeneSchadensmeldungen(offene);
    setPendingReturnBorrower(borrower);
    setForceShowSchadensDialog(true);
    setShowSchadensDialog(true);
  };

  // Öffnet den Verschwunden-Bestätigungsdialog
  const handleVerschwunden = (borrower: string) => {
    const group = groupedBorrowers.find(g => g.borrower === borrower);
    if (!group || group.checkedItems.size === 0) {
      addToast('Bitte wählen Sie mindestens eine Ware aus.', 'error');
      return;
    }
    setPendingVerschwundenBorrower(borrower);
    setShowVerschwundenDialog(true);
  };

  // Führt die Verschwunden-Aktion aus nach Bestätigung
  const executeVerschwunden = async () => {
    if (!pendingVerschwundenBorrower) return;
    
    const group = groupedBorrowers.find(g => g.borrower === pendingVerschwundenBorrower);
    if (!group) return;
    
    const itemsToReturn = group.items.filter(item => group.checkedItems.has(item.id));
    
    setIsLoading(true);

    try {
      const pendingItems = itemsToReturn.filter(item => item.borrowingStatus === 'rueckgabe_beantragt');
      const activeItems = itemsToReturn.filter(item => item.borrowingStatus === 'aktiv');

      // 1. Zuerst für alle aktiven Items eine Rückgabe beantragen
      for (const item of activeItems) {
        if (item.borrowingId) {
          await ausleihenApi.beantrageRueckgabe(item.borrowingId);
        }
      }

      // 2. Dann alle Items als verschwunden markieren (quittieren + soft-delete)
      const allItemsToProcess = [...pendingItems, ...activeItems];
      for (const item of allItemsToProcess) {
        if (item.borrowingId) {
          await ausleihenApi.markiereAlsVerschwunden(item.borrowingId, 'Ware als verschwunden markiert');
        }
      }
      
      // Remove scanned tags for returned items from localStorage
      const scannedTags = JSON.parse(localStorage.getItem('scannedReturnTags') || '[]');
      const remainingTags = scannedTags.filter((tagId: string) => 
        !itemsToReturn.some(item => item.tagId && item.tagId.toLowerCase() === tagId.toLowerCase())
      );
      localStorage.setItem('scannedReturnTags', JSON.stringify(remainingTags));
      
      onUpdateItems([]);
      addToast(`${itemsToReturn.length} Waren als verschwunden markiert.`, 'success');
    } catch (err: any) {
      console.error('Error marking as lost:', err);
      addToast(`Fehler: ${err.message || 'Aktion fehlgeschlagen'}`, 'error');
    } finally {
      setIsLoading(false);
      setShowVerschwundenDialog(false);
      setPendingVerschwundenBorrower(null);
    }
  };

  // Führt die eigentliche Quittierung durch
  const executeQuittierung = async (borrower: string) => {
    const group = groupedBorrowers.find(g => g.borrower === borrower);
    if (!group) return;

    const itemsToReturn = group.items.filter(item => group.checkedItems.has(item.id));
    const pendingItems = itemsToReturn.filter(item => item.borrowingStatus === 'rueckgabe_beantragt');
    const activeItems = itemsToReturn.filter(item => item.borrowingStatus === 'aktiv');

    setIsLoading(true);

    try {
      // 1. Zuerst für alle aktiven Items eine Rückgabe beantragen
      for (const item of activeItems) {
        if (item.borrowingId) {
          await ausleihenApi.beantrageRueckgabe(item.borrowingId);
        }
      }

      // 2. Dann alle (jetzt pending) Items quittieren
      const allItemsToQuittieren = [...pendingItems, ...activeItems];
      for (const item of allItemsToQuittieren) {
        if (item.borrowingId) {
          await ausleihenApi.quittiereRueckgabe(item.borrowingId, 'gut', '');
        }
      }
      
      // Remove scanned tags for returned items from localStorage
      const scannedTags = JSON.parse(localStorage.getItem('scannedReturnTags') || '[]');
      const remainingTags = scannedTags.filter((tagId: string) => 
        !itemsToReturn.some(item => item.tagId && item.tagId.toLowerCase() === tagId.toLowerCase())
      );
      localStorage.setItem('scannedReturnTags', JSON.stringify(remainingTags));
      
      setShowSchadensDialog(false);
      setPendingReturnBorrower(null);
      setPendingScanBorrower(null);
      onUpdateItems([]);
      addToast(`${itemsToReturn.length} Waren erfolgreich quittiert.`, 'success');
    } catch (err: any) {
      console.error('Error returning:', err);
      addToast(`Fehler: ${err.message || 'Rückgabe fehlgeschlagen'}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSchadensmeldungSubmit = async () => {
    if (!pendingReturnBorrower) return;
    
    setIsLoading(true);
    
    try {
      // 1. Schadensmeldungen quittieren (wenn vorhanden)
      for (const meldung of offeneSchadensmeldungen) {
        await schadensmeldungApi.quittieren(meldung.id);
      }
      
      // 2. Ausleihen quittieren
      await executeQuittierung(pendingReturnBorrower);
      
    } catch (err: any) {
      console.error('Error during submission:', err);
      addToast(`Fehler: ${err.message || 'Quittierung fehlgeschlagen'}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Statistics
  const today = new Date().toISOString().split('T')[0];
  const overdueItems = borrowedItems.filter(item => item.returnDate && item.returnDate < today);
  const dueTodayItems = borrowedItems.filter(item => item.returnDate === today);
  const pendingReturns = borrowedItems.filter(item => item.borrowingStatus === 'rueckgabe_beantragt');

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-emerald-50">
      {/* Toast Notifications - Top Right */}
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

      <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-40">
        <div className="w-full px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Package className="w-8 h-8 text-teal-600" />
            <h1 className="text-teal-700">Ausleihsystem - Rückgaben</h1>
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
        <div className="mb-6">
          <h2 className="text-teal-700">Rückgaben verwalten</h2>
          <p className="text-gray-600 mt-1">Scannen oder suchen Sie Waren, um Rückgaben zu quittieren</p>
        </div>

        {/* Search & Scan */}
        <div className="flex gap-2 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setScannedTagIds([]);
              }}
              placeholder={scannedTagIds.length > 0 
                ? `${scannedTagIds.length} Tag(s) gescannt` 
                : "Suchen..."}
              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            {scannedTagIds.length > 0 && (
              <button
                onClick={() => {
                  setScannedTagIds([]);
                  setSearchQuery('');
                }}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                ×
              </button>
            )}
          </div>
          <button
            onClick={handleToggleScan}
            className={`px-4 py-2 border rounded-md transition-colors flex items-center gap-2 ${
              isScanning
                ? 'border-teal-500 bg-teal-600 text-white'
                : 'border-gray-300 hover:bg-gray-50'
            }`}
          >
            <Scan className={`w-5 h-5 ${isScanning ? 'animate-pulse' : ''}`} />
            <span>{isScanning ? 'Scan stoppen' : 'Scannen'}</span>
          </button>
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow-sm p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Rückgabe beantragt</p>
                <p className="text-2xl font-bold text-blue-600">{pendingReturns.length}</p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                <Clock className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Überfällig</p>
                <p className="text-2xl font-bold text-red-600">{overdueItems.length}</p>
              </div>
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                <Package className="w-6 h-6 text-red-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Heute fällig</p>
                <p className="text-2xl font-bold text-orange-600">{dueTodayItems.length}</p>
              </div>
              <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center">
                <Package className="w-6 h-6 text-orange-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Gesamt ausgeliehen</p>
                <p className="text-2xl font-bold text-teal-600">{borrowedItems.length}</p>
              </div>
              <div className="w-12 h-12 bg-teal-100 rounded-full flex items-center justify-center">
                <Package className="w-6 h-6 text-teal-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Items List */}
        {filteredBorrowers.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            <CheckCircle2 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-600">
              {searchQuery || scannedTagIds.length > 0 ? 'Keine Waren gefunden' : 'Alle Waren wurden zurückgegeben'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredBorrowers.map((group) => (
              <BorrowerGroup
                key={group.borrower}
                group={group}
                isMitarbeiter={isMitarbeiterOrHigher}
                onToggleItem={handleToggleItem}
                onToggleAll={handleToggleAll}
                onQuittieren={handleQuittieren}
                onQuittierenMitSchaden={handleQuittierenMitSchaden}
                onVerschwunden={handleVerschwunden}
                isLoading={isLoading}
                scannedTagIds={scannedTagIds}
                offeneSchadensmeldungen={offeneMeldungenMap[group.borrower] || 0}
                itemSchadensMap={itemSchadensMap}
              />
            ))}
          </div>
        )}
      </main>

      {/* Schadensmeldung Dialog */}
      {pendingReturnBorrower && (
        <SchadensmeldungDialog
          items={groupedBorrowers.find(g => g.borrower === pendingReturnBorrower)?.items.filter(item => 
            groupedBorrowers.find(g => g.borrower === pendingReturnBorrower)?.checkedItems.has(item.id)
          ) || []}
          ausleiheIds={groupedBorrowers.find(g => g.borrower === pendingReturnBorrower)?.items
            .filter(item => groupedBorrowers.find(g => g.borrower === pendingReturnBorrower)?.checkedItems.has(item.id))
            .map(item => item.borrowingId)
            .filter(Boolean) as string[] || []}
          itemAusleiheMap={(() => {
            const group = groupedBorrowers.find(g => g.borrower === pendingReturnBorrower);
            if (!group) return {};
            return group.items
              .filter(item => group.checkedItems.has(item.id) && item.borrowingId)
              .reduce((acc, item) => {
                acc[item.id] = item.borrowingId!;
                return acc;
              }, {} as Record<string, string>);
          })()}
          isOpen={showSchadensDialog}
          onClose={() => {
            setShowSchadensDialog(false);
            setPendingReturnBorrower(null);
            setPendingScanBorrower(null); // Reset für RFID-Scan
            setForceShowSchadensDialog(false);
          }}
          onSubmit={handleSchadensmeldungSubmit}
          mode={forceShowSchadensDialog ? 'mitarbeiter-return' : 'mitarbeiter'}
          existingMeldungen={offeneSchadensmeldungen}
        />
      )}

      {/* Verschwunden Bestätigungs-Dialog */}
      {showVerschwundenDialog && pendingVerschwundenBorrower && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                <PackageX className="w-6 h-6 text-red-600" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900">Ware als verschwunden markieren</h2>
            </div>
            
            <p className="text-gray-600 mb-6">
              Sind Sie sicher?{' '}
              <span className="font-semibold text-red-600">
                {(() => {
                  const group = groupedBorrowers.find(g => g.borrower === pendingVerschwundenBorrower);
                  return group ? group.items.filter(item => group.checkedItems.has(item.id)).length : 0;
                })()} Ware(n)
              </span>{' '}
              werden als verschwunden markiert und aus dem System entfernt.
            </p>

            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-red-700">
                <AlertTriangle className="w-4 h-4 inline mr-1" />
                Diese Aktion kann nicht rückgängig gemacht werden!
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowVerschwundenDialog(false);
                  setPendingVerschwundenBorrower(null);
                }}
                disabled={isLoading}
                className="flex-1 py-2 px-4 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50"
              >
                Abbrechen
              </button>
              <button
                onClick={executeVerschwunden}
                disabled={isLoading}
                className="flex-1 py-2 px-4 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {isLoading ? 'Wird verarbeitet...' : 'Bestätigen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface BorrowerGroupProps {
  group: GroupedBorrower;
  isMitarbeiter: boolean;
  onToggleItem: (borrower: string, itemId: string) => void;
  onToggleAll: (borrower: string, checked: boolean) => void;
  onQuittieren: (borrower: string) => void;
  onQuittierenMitSchaden: (borrower: string) => void;
  onVerschwunden: (borrower: string) => void;
  isLoading: boolean;
  scannedTagIds: string[];
  offeneSchadensmeldungen?: number;
  itemSchadensMap?: Record<string, number>;
}

function BorrowerGroup({ group, isMitarbeiter, onToggleItem, onToggleAll, onQuittieren, onQuittierenMitSchaden, onVerschwunden, isLoading, scannedTagIds, offeneSchadensmeldungen = 0, itemSchadensMap = {} }: BorrowerGroupProps) {
  const today = new Date().toISOString().split('T')[0];
  const hasOverdue = group.items.some(item => item.returnDate && item.returnDate < today);
  const hasDueToday = group.items.some(item => item.returnDate === today);
  const hasPendingReturn = group.items.some(item => item.borrowingStatus === 'rueckgabe_beantragt');
  const hasActive = group.items.some(item => item.borrowingStatus === 'aktiv');
  const allChecked = group.checkedItems.size === group.items.length;
  const someChecked = group.checkedItems.size > 0 && group.checkedItems.size < group.items.length;

  const pendingItems = group.items.filter(item => item.borrowingStatus === 'rueckgabe_beantragt' && group.checkedItems.has(item.id));
  const activeItems = group.items.filter(item => item.borrowingStatus === 'aktiv' && group.checkedItems.has(item.id));

  const borderColor = hasPendingReturn ? 'border-blue-300' : hasOverdue ? 'border-red-300' : hasDueToday ? 'border-orange-300' : 'border-gray-200';
  const bgColor = hasPendingReturn ? 'bg-blue-50' : hasOverdue ? 'bg-red-50' : hasDueToday ? 'bg-orange-50' : 'bg-white';

  return (
    <div className={`${bgColor} border-2 ${borderColor} rounded-lg shadow-sm overflow-hidden`}>
      {/* Header */}
      <div className="bg-white border-b border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-teal-100 rounded-full flex items-center justify-center">
              <User className="w-5 h-5 text-teal-700" />
            </div>
            <div>
              <h3 className="font-medium text-gray-900">{group.borrower}</h3>
              <p className="text-sm text-gray-600">
                {group.items.length} {group.items.length === 1 ? 'Ware' : 'Waren'} ausgeliehen
                {group.checkedItems.size > 0 && ` · ${group.checkedItems.size} ausgewählt`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hasPendingReturn && (
              <span className="px-3 py-1 bg-blue-100 text-blue-700 text-sm rounded-full flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Rückgabe beantragt
              </span>
            )}
            {hasOverdue && (
              <span className="px-3 py-1 bg-red-100 text-red-700 text-sm rounded-full">
                Überfällig
              </span>
            )}
            {!hasOverdue && hasDueToday && (
              <span className="px-3 py-1 bg-orange-100 text-orange-700 text-sm rounded-full">
                Heute fällig
              </span>
            )}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={allChecked}
                ref={input => {
                  if (input) input.indeterminate = someChecked;
                }}
                onChange={(e) => onToggleAll(group.borrower, e.target.checked)}
                className="w-6 h-6 text-teal-600 rounded focus:ring-teal-500"
              />
              <span className="text-sm text-gray-600">Alle</span>
            </label>
          </div>
        </div>
      </div>

      {/* Items */}
      <div className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
          {group.items.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              checked={group.checkedItems.has(item.id)}
              wasScanned={scannedTagIds.some(tagId => item.tagId.toLowerCase() === tagId.toLowerCase())}
              hasSchaden={!!itemSchadensMap[item.id]}
              schadenCount={itemSchadensMap[item.id] || 0}
              onToggle={() => onToggleItem(group.borrower, item.id)}
            />
          ))}
        </div>

        {/* Action Buttons */}
        {group.checkedItems.size > 0 && (
          <div className="flex flex-wrap gap-2">
            {/* Berechne Anzahl der ausgewählten Waren mit Schadensmeldungen */}
            {(() => {
              const checkedItems = group.items.filter(item => group.checkedItems.has(item.id));
              const checkedCount = checkedItems.length;
              const schadenCount = checkedItems.filter(item => itemSchadensMap[item.id]).length;
              
              return (
                <>
                  {/* Button 1: Verschwunden (nur für Mitarbeiter) - klein */}
                  {isMitarbeiter && (
                    <button
                      onClick={() => onVerschwunden(group.borrower)}
                      disabled={isLoading}
                      className="flex-1 py-3 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 min-w-[120px]"
                      title="Ware als verschwunden markieren und aus dem System entfernen"
                    >
                      <PackageX className="w-5 h-5" />
                      {isLoading ? '...' : 'Verschw.'}
                    </button>
                  )}
                  
                  {/* Button 2: Quittieren (öffnet Dialog nur bei offenen Schadensmeldungen) - groß, mittig */}
                  <button
                    onClick={() => onQuittieren(group.borrower)}
                    disabled={isLoading}
                    className={`flex-[2] py-3 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 min-w-[200px] ${
                      offeneSchadensmeldungen > 0
                        ? 'bg-amber-500 hover:bg-amber-600 text-white'
                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }`}
                  >
                    <Check className="w-5 h-5" />
                    {isLoading ? 'Wird verarbeitet...' : (
                      <span className="flex items-center gap-2">
                        {checkedCount} quittieren
                        {schadenCount > 0 && (
                          <>
                            <span className="mx-1">·</span>
                            <span className="flex items-center gap-1">
                              {schadenCount} <AlertTriangle className="w-4 h-4" />
                            </span>
                          </>
                        )}
                      </span>
                    )}
                  </button>
                  
                  {/* Button 3: Quittieren mit Schadensmeldung (nur für Mitarbeiter) - klein */}
                  {isMitarbeiter && (
                    <button
                      onClick={() => onQuittierenMitSchaden(group.borrower)}
                      disabled={isLoading}
                      className="flex-1 py-3 bg-teal-600 text-white rounded-lg font-medium hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 min-w-[120px]"
                    >
                      <AlertTriangle className="w-5 h-5" />
                      {isLoading ? '...' : 'Schaden'}
                    </button>
                  )}
                </>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}

interface ItemCardProps {
  item: Item;
  checked: boolean;
  wasScanned: boolean;
  hasSchaden: boolean;
  schadenCount: number;
  onToggle: () => void;
}

function ItemCard({ item, checked, wasScanned, hasSchaden, schadenCount, onToggle }: ItemCardProps) {
  const today = new Date().toISOString().split('T')[0];
  const isOverdue = item.returnDate && item.returnDate < today;
  const isDueToday = item.returnDate === today;
  const isPendingReturn = item.borrowingStatus === 'rueckgabe_beantragt';

  return (
    <div
      onClick={onToggle}
      className={`relative p-3 border-2 rounded-lg cursor-pointer transition-all ${
        checked
          ? 'border-teal-500 bg-teal-50'
          : isPendingReturn
          ? 'border-blue-300 bg-blue-50 hover:border-blue-400'
          : isOverdue
          ? 'border-red-300 bg-red-50 hover:border-red-400'
          : isDueToday
          ? 'border-orange-300 bg-orange-50 hover:border-orange-400'
          : 'border-gray-200 bg-white hover:border-gray-300'
      }`}
    >
      {/* Checkbox */}
      <div className="absolute top-2 right-2">
        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
          checked ? 'bg-teal-600 border-teal-600' : 'border-gray-300'
        }`}>
          {checked && <Check className="w-3 h-3 text-white" />}
        </div>
      </div>

      {/* Content */}
      <div className="pr-6">
        <div className="flex items-start gap-2">
          <h4 className="font-medium text-gray-900 mb-1">{item.name}</h4>
          {wasScanned && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full" title="Gescannt">
              <Scan className="w-3 h-3" />
            </span>
          )}
          {hasSchaden && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full" title={`${schadenCount} Schadensmeldung(en)`}>
              <AlertTriangle className="w-3 h-3" />
              {schadenCount > 1 && schadenCount}
            </span>
          )}
        </div>
        <p className="text-sm text-gray-600 mb-1">
          {item.categories.length > 0 ? [...item.categories].sort().join(', ') : 'Keine Kategorie'}
        </p>
        <p className="text-xs text-gray-500 mb-2">Schrank: {item.cabinetNumber}</p>
        
        {item.returnDate && (
          <p className={`text-xs mb-1 ${
            isOverdue ? 'text-red-600 font-semibold' : 
            isDueToday ? 'text-orange-600' : 'text-gray-500'
          }`}>
            Rückgabe: {new Date(item.returnDate).toLocaleDateString()}
            {isOverdue && ' (überfällig)'}
          </p>
        )}
        
        {item.location && (
          <p className="text-xs text-gray-500">Verbleib: {item.location}</p>
        )}

        {/* Status Badge */}
        {isPendingReturn && (
          <div className="mt-2">
            <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">
              <Clock className="w-3 h-3" />
              Rückgabe beantragt
            </div>
            {item.rueckgabeBeantragtAm ? (
              <p className="text-xs text-blue-600 mt-1">
                Beantragt am: {new Date(item.rueckgabeBeantragtAm).toLocaleDateString()}
              </p>
            ) : (
              <p className="text-xs text-gray-400 mt-1">
                Beantragt am: --
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
