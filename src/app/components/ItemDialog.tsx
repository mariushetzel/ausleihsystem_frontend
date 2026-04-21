import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Scan, AlertTriangle, CheckCircle } from 'lucide-react';
import { rfidAntennaApi, type DeviceParams, type TagInfo } from '../api';

// Prüft ob Antennen-Einstellungen konfiguriert sind
const hasAntennaConfig = (): boolean => {
  const port = localStorage.getItem('antenna_port');
  const baudrate = localStorage.getItem('antenna_baudrate');
  return !!(port && baudrate);
};

// Bereinigt Fehlermeldungen - entfernt HTML-Stacktraces und kürzt auf lesbare Länge
const formatErrorMessage = (error: string | Error): string => {
  let msg = error instanceof Error ? error.message : String(error);
  
  // HTML-Stacktraces erkennen und entfernen (Django Debug-Seite)
  if (msg.includes('<!DOCTYPE') || msg.includes('<html')) {
    const apiMatch = msg.match(/\/api\/\w+/);
    if (apiMatch) {
      return `Serverfehler bei ${apiMatch[0]} - Gerät antwortet nicht korrekt`;
    }
    return 'Serverfehler - Verbindung zum Gerät nicht möglich';
  }
  
  // UnicodeDecodeError speziell behandeln
  if (msg.includes('UnicodeDecodeError')) {
    return 'Falsches Gerät - Dieser Port scheint nicht die RFID-Antenne zu sein';
  }
  
  // Lange Fehlermeldungen kürzen
  if (msg.length > 150) {
    msg = msg.substring(0, 150) + '...';
  }
  
  return msg;
};

export interface Item {
  id: string;
  name: string;
  description: string;
  tagId: string;
  cabinetNumber: string;
  categories: string[];
  categoryIds?: string[];
  borrowable: boolean;
  borrowedBy?: string;
  borrowedAt?: string;
  letzteAusleihe?: string; // Datum der letzten Ausleihe (egal ob zurückgegeben oder nicht)
  returnDate?: string;
  location?: string;
  borrowingStatus?: 'aktiv' | 'rueckgabe_beantragt';
  borrowingId?: string;
  rueckgabeBeantragtAm?: string; // Datum der Beantragung der Rückgabe
  erlaubteVerbleibOrte?: string[];
  erstelltAm?: string;
}

interface ItemDialogProps {
  item?: Item;
  onSave: (item: Omit<Item, 'id'> & { id?: string }, quantity?: number) => void;
  onClose: () => void;
}

// Toast notification type
type ToastType = 'success' | 'error';
interface Toast {
  message: string;
  type: ToastType;
}

// Komponente für Kategorie-Suche und Auswahl
interface CategorySelectorProps {
  availableCategories: {id: string, name: string}[];
  selectedCategoryIds: string[];
  onChange: (categoryIds: string[], categoryNames: string[]) => void;
  onCategoryCreated: (category: {id: string, name: string}) => void;
}

function CategorySelector({ 
  availableCategories, 
  selectedCategoryIds, 
  onChange,
  onCategoryCreated 
}: CategorySelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  // Auto-hide toast after 3 seconds
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Gefilterte Kategorien basierend auf Suche
  const filteredCategories = searchQuery.trim() 
    ? availableCategories.filter(cat => 
        cat.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : availableCategories;

  // Prüfen ob Suche exakt mit existierender Kategorie übereinstimmt
  const exactMatch = availableCategories.find(
    cat => cat.name.toLowerCase() === searchQuery.trim().toLowerCase()
  );

  // Ausgewählte Kategorien als Tags anzeigen
  const selectedCategories = availableCategories.filter(cat => 
    selectedCategoryIds.includes(cat.id)
  );

  const handleCreate = async () => {
    const name = searchQuery.trim();
    if (!name) return;
    
    setIsCreating(true);
    setToast(null);
    
    try {
      const { kategorienApi } = await import('../api/client');
      // Im ItemDialog erstellte Kategorien haben immer minimale_rolle = 'Student'
      const result = await kategorienApi.create(name, '', 'Student');
      
      if (result.existing) {
        setToast({ message: `"${result.name}" existiert bereits - wurde ausgewählt`, type: 'success' });
      } else {
        setToast({ message: `"${result.name}" erstellt und ausgewählt`, type: 'success' });
      }
      
      // Neue Kategorie zur Liste hinzufügen und auswählen
      onCategoryCreated({ id: result.id, name: result.name });
      
      // Automatisch auswählen
      if (!selectedCategoryIds.includes(result.id)) {
        onChange(
          [...selectedCategoryIds, result.id],
          [...selectedCategories.map(c => c.name), result.name]
        );
      }
      
      setSearchQuery('');
    } catch (err: any) {
      const errorMsg = err?.message || 'Unbekannter Fehler';
      setToast({ 
        message: `Fehler: ${errorMsg.length > 50 ? errorMsg.substring(0, 50) + '...' : errorMsg}`, 
        type: 'error' 
      });
    } finally {
      setIsCreating(false);
    }
  };

  const toggleCategory = (cat: {id: string, name: string}) => {
    if (selectedCategoryIds.includes(cat.id)) {
      // Abwählen
      onChange(
        selectedCategoryIds.filter(id => id !== cat.id),
        selectedCategories.filter(c => c.id !== cat.id).map(c => c.name)
      );
    } else {
      // Auswählen
      onChange(
        [...selectedCategoryIds, cat.id],
        [...selectedCategories.map(c => c.name), cat.name]
      );
    }
  };

  const removeCategory = (catId: string) => {
    onChange(
      selectedCategoryIds.filter(id => id !== catId),
      selectedCategories.filter(c => c.id !== catId).map(c => c.name)
    );
  };

  return (
    <div className="space-y-2">
      {/* Inline Notification */}
      {toast && (
        <div 
          className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm ${
            toast.type === 'success' 
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Suchfeld / Neu erstellen */}
      <div className="relative">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Kategorie suchen oder neue erstellen..."
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
        />
        {searchQuery.trim() && !exactMatch && (
          <button
            type="button"
            onClick={handleCreate}
            disabled={isCreating}
            className="absolute right-2 top-1/2 transform -translate-y-1/2 px-2 py-1 text-xs bg-teal-600 text-white rounded hover:bg-teal-700 disabled:opacity-50"
          >
            {isCreating ? '...' : `+ "${searchQuery.trim()}" erstellen`}
          </button>
        )}
      </div>

      {/* Ausgewählte Kategorien als Tags */}
      {selectedCategories.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedCategories.map(cat => (
            <span
              key={cat.id}
              className="inline-flex items-center gap-1 px-2 py-1 bg-teal-100 text-teal-700 text-xs rounded"
            >
              {cat.name}
              <button
                type="button"
                onClick={() => removeCategory(cat.id)}
                className="hover:text-teal-900"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Gefilterte Liste */}
      <div className="border border-gray-300 rounded-md p-2 max-h-32 overflow-y-auto">
        {availableCategories.length === 0 ? (
          <p className="text-sm text-gray-500">Lade Kategorien...</p>
        ) : filteredCategories.length === 0 ? (
          <p className="text-sm text-gray-500">
            Keine Kategorien gefunden. {searchQuery.trim() && 'Klicken Sie auf "+ Erstellen".'}
          </p>
        ) : (
          filteredCategories.map((cat) => (
            <label
              key={cat.id}
              className={`flex items-center gap-2 py-1 px-1 rounded cursor-pointer ${
                selectedCategoryIds.includes(cat.id) ? 'bg-teal-50' : 'hover:bg-gray-50'
              }`}
            >
              <input
                type="checkbox"
                checked={selectedCategoryIds.includes(cat.id)}
                onChange={() => toggleCategory(cat)}
                className="w-6 h-6 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
              />
              <span className="text-sm">{cat.name}</span>
            </label>
          ))
        )}
      </div>
      
      {selectedCategories.length > 0 && (
        <p className="text-xs text-gray-500">
          {selectedCategories.length} Kategorie{selectedCategories.length !== 1 ? 'n' : ''} ausgewählt
        </p>
      )}
    </div>
  );
}

export function ItemDialog({ item, onSave, onClose }: ItemDialogProps) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    tagId: '',
    cabinetNumber: '',
    categories: [] as string[],
    categoryIds: [] as string[],
  });
  const [availableCategories, setAvailableCategories] = useState<{id: string, name: string}[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [isScanningTag, setIsScanningTag] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanError, setScanError] = useState<string | null>(null);
  const [hComm, setHComm] = useState<number | null>(null);
  const [deviceParams, setDeviceParams] = useState<DeviceParams | null>(null);
  const [foundKnownTags, setFoundKnownTags] = useState<TagInfo[]>([]); // Bekannte Tags für Anzeige
  const [collectedTags, setCollectedTags] = useState<string[]>([]); // Gesammelte Tag-IDs für Multi-Scan
  
  // Refs für das Polling und für zuverlässigen Zugriff in Cleanup
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hCommRef = useRef<number | null>(null);
  const deviceParamsRef = useRef<DeviceParams | null>(null);
  const isCleaningRef = useRef<boolean>(false); // Verhindert paralleles Cleanup
  
  // Refs synchronisieren mit State (für zuverlässigen Zugriff in Cleanup/Timeouts)
  useEffect(() => { hCommRef.current = hComm; }, [hComm]);
  useEffect(() => { deviceParamsRef.current = deviceParams; }, [deviceParams]);

  // Kategorien laden
  useEffect(() => {
    const loadCategories = async () => {
      try {
        const { kategorienApi } = await import('../api/client');
        const cats = await kategorienApi.getAll();
        // Alphabetisch nach Name sortieren
        const sortedCats = cats.filter(c => c.aktiv !== false).sort((a, b) => a.name.localeCompare(b.name));
        setAvailableCategories(sortedCats);
      } catch (e) {
        // Kategorien-Ladefehler ignorieren
      }
    };
    loadCategories();
  }, []);

  useEffect(() => {
    if (item) {
      setFormData({
        name: item.name,
        description: item.description,
        tagId: item.tagId,
        cabinetNumber: item.cabinetNumber,
        categories: item.categories || [],
        categoryIds: item.categoryIds || [],
      });
    }
  }, [item]);

  // Cleanup beim Unmount
  useEffect(() => {
    return () => {
      cleanupAntenna();
    };
  }, []);

  const cleanupAntenna = useCallback(async () => {
    // Verhindern, dass Cleanup zweimal gleichzeitig läuft
    if (isCleaningRef.current) {
      return;
    }
    isCleaningRef.current = true;
    
    // Intervalle aufräumen
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    
    // WICHTIG: Refs verwenden statt State (Closure-Problem!)
    const currentHComm = hCommRef.current;
    const currentParams = deviceParamsRef.current;
    
    // Antennen-Verbindung ordnungsgemäß schließen
    if (currentHComm !== null && currentParams !== null) {
      try {
        // 1. Zuerst Workmode auf 0 setzen (mit allen Parametern!)
        const paramsForWorkmode0 = {
          hComm: currentHComm,
          DEVICEARRD: currentParams.DEVICEARRD,
          RFIDPRO: currentParams.RFIDPRO,
          WORKMODE: 0, // Workmode auf 0 setzen
          INTERFACE: currentParams.INTERFACE,
          BAUDRATE: currentParams.BAUDRATE,
          WGSET: currentParams.WGSET,
          ANT: currentParams.ANT,
          REGION: currentParams.REGION,
          STRATFREI: currentParams.STRATFREI,
          STEPFRE: currentParams.STEPFRE,
          CN: currentParams.CN,
          RFIDPOWER: currentParams.RFIDPOWER,
          INVENTORYAREA: currentParams.INVENTORYAREA,
          QVALUE: currentParams.QVALUE,
          SESSION: currentParams.SESSION,
          ACSADDR: currentParams.ACSADDR,
          ACSDATALEN: currentParams.ACSDATALEN,
          FILTERTIME: currentParams.FILTERTIME,
          TRIGGLETIME: currentParams.TRIGGLETIME,
          BUZZERTIME: currentParams.BUZZERTIME,
          INTERNELTIME: currentParams.INTERNELTIME,
        };
        await rfidAntennaApi.setDevicePara(currentHComm, paramsForWorkmode0);
        
        // 2. Thread stoppen
        await rfidAntennaApi.inventoryStop(currentHComm, 0);
        
        // 3. Verbindung schließen
        await rfidAntennaApi.closeDevice(currentHComm);
      } catch (e) {
        // Ignorieren - Verbindung war vielleicht schon geschlossen
      }
    }
    
    setHComm(null);
    setDeviceParams(null);
    setIsScanningTag(false);
    setScanProgress(0);
    setFoundKnownTags([]); // Bekannte Tags zurücksetzen
    setCollectedTags([]); // Gesammelte Tags zurücksetzen
    
    // Cleanup-Flag zurücksetzen
    isCleaningRef.current = false;
  }, []); // Keine Dependencies - verwendet nur Refs

  // Storage Keys (müssen mit AntennaSettings.tsx übereinstimmen)
  const ANTENNA_PORT_KEY = 'antenna_port';
  const ANTENNA_BAUDRATE_KEY = 'antenna_baudrate';

  const handleScanTag = async () => {
    setScanError(null);
    
    // Prüfen ob Antennen-Einstellungen konfiguriert sind
    if (!hasAntennaConfig()) {
      setScanError(
        'Antenne nicht konfiguriert. Bitte öffnen Sie zuerst die Einstellungen ' +
        'und wählen Sie den richtigen Port für die RFID-Antenne.'
      );
      setIsScanningTag(false);
      return;
    }
    
    setIsScanningTag(true);
    setScanProgress(0);
    setFoundKnownTags([]); // Bekannte Tags zurücksetzen
    setCollectedTags([]); // Gesammelte Tags zurücksetzen
    
    // Port und Baudrate aus den globalen Einstellungen laden
    const port = localStorage.getItem(ANTENNA_PORT_KEY) || '/dev/ttyUSB0';
    const baudrate = localStorage.getItem(ANTENNA_BAUDRATE_KEY) || '115200';
    
    let currentHComm: number | null = null;
    let currentDeviceParams: DeviceParams | null = null;
    
    try {
      // 1. Verbindung zur Antenne öffnen (mit den Einstellungen aus der Antennen-Seite)
      const openResult = await rfidAntennaApi.openDevice(port, parseInt(baudrate));
      if (!openResult.success) {
        setScanError(formatErrorMessage('Fehler beim Öffnen: ' + openResult.log));
        setIsScanningTag(false);
        return;
      }
      currentHComm = openResult.hComm;
      setHComm(currentHComm);
      hCommRef.current = currentHComm; // Ref direkt aktualisieren!
      
      // 2. Geräte-Parameter laden (für späteren Gebrauch)
      const loadedParams = await rfidAntennaApi.getDevicePara(currentHComm);
      currentDeviceParams = loadedParams;
      setDeviceParams(loadedParams);
      deviceParamsRef.current = loadedParams; // Ref direkt aktualisieren!
      
      // 3. Scanning starten (Thread starten) - Workmode auf 0 setzen
      const countingParams = {
        hComm: currentHComm,
        DEVICEARRD: loadedParams.DEVICEARRD,
        RFIDPRO: loadedParams.RFIDPRO,
        WORKMODE: 0, // Workmode 0 für Standard-Scanning
        INTERFACE: loadedParams.INTERFACE,
        BAUDRATE: loadedParams.BAUDRATE,
        WGSET: loadedParams.WGSET,
        ANT: loadedParams.ANT,
        REGION: loadedParams.REGION,
        STRATFREI: loadedParams.STRATFREI,
        STEPFRE: loadedParams.STEPFRE,
        CN: loadedParams.CN,
        RFIDPOWER: loadedParams.RFIDPOWER,
        INVENTORYAREA: loadedParams.INVENTORYAREA,
        QVALUE: loadedParams.QVALUE,
        SESSION: loadedParams.SESSION,
        ACSADDR: loadedParams.ACSADDR,
        ACSDATALEN: loadedParams.ACSDATALEN,
        FILTERTIME: loadedParams.FILTERTIME,
        TRIGGLETIME: loadedParams.TRIGGLETIME,
        BUZZERTIME: loadedParams.BUZZERTIME,
        INTERNELTIME: loadedParams.INTERNELTIME,
      };
      
      const startResult = await rfidAntennaApi.startCounting(currentHComm, countingParams);
      if (!startResult.success) {
        setScanError(formatErrorMessage('Fehler beim Starten: ' + startResult.log));
        // Aufräumen: Workmode 0, Stop, Close
        try {
          await rfidAntennaApi.setDevicePara(currentHComm, countingParams); // Workmode bereits 0
          await rfidAntennaApi.inventoryStop(currentHComm, 0);
          await rfidAntennaApi.closeDevice(currentHComm);
        } catch (e) {
          // Cleanup-Fehler ignorieren
        }
        setHComm(null);
        setDeviceParams(null);
        setIsScanningTag(false);
        return;
      }
      
      // 4. Timeout nach 20 Sekunden
      // WICHTIG: Eigene Cleanup-Funktion mit lokalen Variablen (nicht State!)
      timeoutRef.current = setTimeout(async () => {
        // Intervalle aufräumen
        if (scanIntervalRef.current) {
          clearInterval(scanIntervalRef.current);
          scanIntervalRef.current = null;
        }
        
        // Workmode 0 setzen UND Verbindung schließen mit LOKALEN Variablen
        if (currentHComm !== null && currentDeviceParams !== null) {
          try {
            // 1. Workmode auf 0 setzen
            const paramsForWorkmode0 = {
              hComm: currentHComm,
              DEVICEARRD: currentDeviceParams.DEVICEARRD,
              RFIDPRO: currentDeviceParams.RFIDPRO,
              WORKMODE: 0,
              INTERFACE: currentDeviceParams.INTERFACE,
              BAUDRATE: currentDeviceParams.BAUDRATE,
              WGSET: currentDeviceParams.WGSET,
              ANT: currentDeviceParams.ANT,
              REGION: currentDeviceParams.REGION,
              STRATFREI: currentDeviceParams.STRATFREI,
              STEPFRE: currentDeviceParams.STEPFRE,
              CN: currentDeviceParams.CN,
              RFIDPOWER: currentDeviceParams.RFIDPOWER,
              INVENTORYAREA: currentDeviceParams.INVENTORYAREA,
              QVALUE: currentDeviceParams.QVALUE,
              SESSION: currentDeviceParams.SESSION,
              ACSADDR: currentDeviceParams.ACSADDR,
              ACSDATALEN: currentDeviceParams.ACSDATALEN,
              FILTERTIME: currentDeviceParams.FILTERTIME,
              TRIGGLETIME: currentDeviceParams.TRIGGLETIME,
              BUZZERTIME: currentDeviceParams.BUZZERTIME,
              INTERNELTIME: currentDeviceParams.INTERNELTIME,
            };
            await rfidAntennaApi.setDevicePara(currentHComm, paramsForWorkmode0);
            // 2. Thread stoppen
            await rfidAntennaApi.inventoryStop(currentHComm, 0);
            // 3. Verbindung schließen
            await rfidAntennaApi.closeDevice(currentHComm);
          } catch (e) {
            // Cleanup-Fehler ignorieren
          }
        }
        
        // State zurücksetzen
        setHComm(null);
        setDeviceParams(null);
        setIsScanningTag(false);
        setScanProgress(0);
        
        // Timeout-Message mit bekannten Tags
        if (foundKnownTags.length > 0) {
          const tagNames = foundKnownTags.slice(0, 5).map(t => t.name).join(', ');
          const more = foundKnownTags.length > 5 ? ` (+${foundKnownTags.length - 5} weitere)` : '';
          setScanError(`Timeout: Keine unbekannten Tags gefunden. Bereits bekannt: ${tagNames}${more}`);
        } else {
          setScanError('Timeout: Keine Tags gefunden');
        }
      }, 20000);
      
      // 5. Alle 500ms pollen nach neuen Tags
      const foundUnknownTags = new Set<string>();
      const foundKnownTagsLocal: TagInfo[] = []; // Lokale Liste für bekannte Tags
      const startTime = Date.now();
      const targetQuantity = quantity; // Ziel-Anzahl
      const isMultiScan = targetQuantity > 1;
      
      scanIntervalRef.current = setInterval(async () => {
        try {
          // Fortschritt aktualisieren (0-100% über 20s)
          const elapsed = Date.now() - startTime;
          const progress = Math.min((elapsed / 20000) * 100, 100);
          setScanProgress(progress);
          
          // Tags aus dem Thread holen
          const tags: TagInfo[] = await rfidAntennaApi.getTagInfo();
          
          // Filter: Unbekannte Tags (nicht in DB)
          const unknownTags = tags.filter(tag => tag.name === 'Name not found');
          // Filter: Bekannte Tags (in DB)
          const knownTags = tags.filter(tag => tag.name && tag.name !== 'Name not found');
          
          // Bekannte Tags sammeln für Anzeige bei Timeout
          knownTags.forEach(tag => {
            if (!foundKnownTagsLocal.find(t => t.epc === tag.epc)) {
              foundKnownTagsLocal.push(tag);
              setFoundKnownTags([...foundKnownTagsLocal]);
            }
          });
          
          // Alle unbekannten Tags sammeln
          unknownTags.forEach(tag => {
            if (tag.epc) {
              foundUnknownTags.add(tag.epc);
            }
          });
          
          // Multi-Scan Modus (Anzahl > 1): Sammle Tags bis Ziel erreicht
          if (isMultiScan) {
            const collectedArray = Array.from(foundUnknownTags);
            setCollectedTags(collectedArray);
            
            // Prüfen ob genügend Tags gesammelt wurden
            if (foundUnknownTags.size >= targetQuantity) {
              // Genug Tags gefunden!
              const selectedTags = collectedArray.slice(0, targetQuantity);
              
              // Aufräumen
              if (scanIntervalRef.current) {
                clearInterval(scanIntervalRef.current);
                scanIntervalRef.current = null;
              }
              if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
              }
              
              // Antenne ordnungsgemäß schließen
              const paramsForWorkmode0 = {
                hComm: currentHComm,
                DEVICEARRD: currentDeviceParams!.DEVICEARRD,
                RFIDPRO: currentDeviceParams!.RFIDPRO,
                WORKMODE: 0,
                INTERFACE: currentDeviceParams!.INTERFACE,
                BAUDRATE: currentDeviceParams!.BAUDRATE,
                WGSET: currentDeviceParams!.WGSET,
                ANT: currentDeviceParams!.ANT,
                REGION: currentDeviceParams!.REGION,
                STRATFREI: currentDeviceParams!.STRATFREI,
                STEPFRE: currentDeviceParams!.STEPFRE,
                CN: currentDeviceParams!.CN,
                RFIDPOWER: currentDeviceParams!.RFIDPOWER,
                INVENTORYAREA: currentDeviceParams!.INVENTORYAREA,
                QVALUE: currentDeviceParams!.QVALUE,
                SESSION: currentDeviceParams!.SESSION,
                ACSADDR: currentDeviceParams!.ACSADDR,
                ACSDATALEN: currentDeviceParams!.ACSDATALEN,
                FILTERTIME: currentDeviceParams!.FILTERTIME,
                TRIGGLETIME: currentDeviceParams!.TRIGGLETIME,
                BUZZERTIME: currentDeviceParams!.BUZZERTIME,
                INTERNELTIME: currentDeviceParams!.INTERNELTIME,
              };
              await rfidAntennaApi.setDevicePara(currentHComm, paramsForWorkmode0);
              await rfidAntennaApi.inventoryStop(currentHComm, 0);
              await rfidAntennaApi.closeDevice(currentHComm);
              
              setHComm(null);
              setDeviceParams(null);
              
              // Tag-IDs komma-getrennt eintragen
              setFormData(prev => ({ ...prev, tagId: selectedTags.join(', ') }));
              setIsScanningTag(false);
              setScanProgress(0);
              setFoundKnownTags([]);
            }
            // Wenn noch nicht genug, einfach weiter pollen...
          } else {
            // Einzel-Scan Modus (Anzahl = 1): Verhalte dich wie bisher
            if (foundUnknownTags.size === 1) {
              // Genau ein unbekanntes Tag gefunden - perfekt!
              const tagId = Array.from(foundUnknownTags)[0];
              
              // Aufräumen
              if (scanIntervalRef.current) {
                clearInterval(scanIntervalRef.current);
                scanIntervalRef.current = null;
              }
              if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
              }
              
              // Antenne ordnungsgemäß schließen
              const paramsForWorkmode0 = {
                hComm: currentHComm,
                DEVICEARRD: currentDeviceParams!.DEVICEARRD,
                RFIDPRO: currentDeviceParams!.RFIDPRO,
                WORKMODE: 0,
                INTERFACE: currentDeviceParams!.INTERFACE,
                BAUDRATE: currentDeviceParams!.BAUDRATE,
                WGSET: currentDeviceParams!.WGSET,
                ANT: currentDeviceParams!.ANT,
                REGION: currentDeviceParams!.REGION,
                STRATFREI: currentDeviceParams!.STRATFREI,
                STEPFRE: currentDeviceParams!.STEPFRE,
                CN: currentDeviceParams!.CN,
                RFIDPOWER: currentDeviceParams!.RFIDPOWER,
                INVENTORYAREA: currentDeviceParams!.INVENTORYAREA,
                QVALUE: currentDeviceParams!.QVALUE,
                SESSION: currentDeviceParams!.SESSION,
                ACSADDR: currentDeviceParams!.ACSADDR,
                ACSDATALEN: currentDeviceParams!.ACSDATALEN,
                FILTERTIME: currentDeviceParams!.FILTERTIME,
                TRIGGLETIME: currentDeviceParams!.TRIGGLETIME,
                BUZZERTIME: currentDeviceParams!.BUZZERTIME,
                INTERNELTIME: currentDeviceParams!.INTERNELTIME,
              };
              await rfidAntennaApi.setDevicePara(currentHComm, paramsForWorkmode0);
              await rfidAntennaApi.inventoryStop(currentHComm, 0);
              await rfidAntennaApi.closeDevice(currentHComm);
              
              setHComm(null);
              setDeviceParams(null);
              
              // Tag-ID eintragen
              setFormData(prev => ({ ...prev, tagId }));
              setIsScanningTag(false);
              setScanProgress(0);
              setFoundKnownTags([]);
              
            } else if (foundUnknownTags.size > 1) {
              // Mehrere unbekannte Tags - Fehler!
              if (scanIntervalRef.current) {
                clearInterval(scanIntervalRef.current);
                scanIntervalRef.current = null;
              }
              if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
              }
              
              // Antenne schließen
              const paramsForWorkmode0 = {
                hComm: currentHComm,
                DEVICEARRD: currentDeviceParams!.DEVICEARRD,
                RFIDPRO: currentDeviceParams!.RFIDPRO,
                WORKMODE: 0,
                INTERFACE: currentDeviceParams!.INTERFACE,
                BAUDRATE: currentDeviceParams!.BAUDRATE,
                WGSET: currentDeviceParams!.WGSET,
                ANT: currentDeviceParams!.ANT,
                REGION: currentDeviceParams!.REGION,
                STRATFREI: currentDeviceParams!.STRATFREI,
                STEPFRE: currentDeviceParams!.STEPFRE,
                CN: currentDeviceParams!.CN,
                RFIDPOWER: currentDeviceParams!.RFIDPOWER,
                INVENTORYAREA: currentDeviceParams!.INVENTORYAREA,
                QVALUE: currentDeviceParams!.QVALUE,
                SESSION: currentDeviceParams!.SESSION,
                ACSADDR: currentDeviceParams!.ACSADDR,
                ACSDATALEN: currentDeviceParams!.ACSDATALEN,
                FILTERTIME: currentDeviceParams!.FILTERTIME,
                TRIGGLETIME: currentDeviceParams!.TRIGGLETIME,
                BUZZERTIME: currentDeviceParams!.BUZZERTIME,
                INTERNELTIME: currentDeviceParams!.INTERNELTIME,
              };
              await rfidAntennaApi.setDevicePara(currentHComm, paramsForWorkmode0);
              await rfidAntennaApi.inventoryStop(currentHComm, 0);
              await rfidAntennaApi.closeDevice(currentHComm);
              
              setHComm(null);
              setDeviceParams(null);
              
              setScanError(`Mehrere unbekannte Tags gefunden (${foundUnknownTags.size}). Bitte halten Sie nur ein Tag an die Antenne.`);
              setIsScanningTag(false);
              setScanProgress(0);
            }
            // Wenn 0 Tags, einfach weiter pollen...
          }
          
        } catch (e) {
          // Polling-Fehler ignorieren
        }
      }, 500);
      
    } catch (e) {
      // Im Fehlerfall Antenne schließen
      if (currentHComm !== null && currentDeviceParams !== null) {
        try {
          const paramsForWorkmode0 = {
            hComm: currentHComm,
            DEVICEARRD: currentDeviceParams.DEVICEARRD,
            RFIDPRO: currentDeviceParams.RFIDPRO,
            WORKMODE: 0,
            INTERFACE: currentDeviceParams.INTERFACE,
            BAUDRATE: currentDeviceParams.BAUDRATE,
            WGSET: currentDeviceParams.WGSET,
            ANT: currentDeviceParams.ANT,
            REGION: currentDeviceParams.REGION,
            STRATFREI: currentDeviceParams.STRATFREI,
            STEPFRE: currentDeviceParams.STEPFRE,
            CN: currentDeviceParams.CN,
            RFIDPOWER: currentDeviceParams.RFIDPOWER,
            INVENTORYAREA: currentDeviceParams.INVENTORYAREA,
            QVALUE: currentDeviceParams.QVALUE,
            SESSION: currentDeviceParams.SESSION,
            ACSADDR: currentDeviceParams.ACSADDR,
            ACSDATALEN: currentDeviceParams.ACSDATALEN,
            FILTERTIME: currentDeviceParams.FILTERTIME,
            TRIGGLETIME: currentDeviceParams.TRIGGLETIME,
            BUZZERTIME: currentDeviceParams.BUZZERTIME,
            INTERNELTIME: currentDeviceParams.INTERNELTIME,
          };
          await rfidAntennaApi.setDevicePara(currentHComm, paramsForWorkmode0);
          await rfidAntennaApi.inventoryStop(currentHComm, 0);
          await rfidAntennaApi.closeDevice(currentHComm);
        } catch {}
      }
      setHComm(null);
      setDeviceParams(null);
      setScanError(formatErrorMessage(e instanceof Error ? e : new Error('Unbekannter Fehler')));
      setIsScanningTag(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Scan stoppen falls noch aktiv
    await cleanupAntenna();
    
    if (item) {
      onSave({ ...formData, id: item.id });
    } else {
      onSave(formData, quantity);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2>{item ? 'Ware bearbeiten' : 'Neue Ware hinzufügen'}</h2>
          <button
            onClick={async () => {
              await cleanupAntenna();
              onClose();
            }}
            className="text-gray-500 hover:text-gray-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* Anzahl - kompakt oben (nur bei Neuanlage) */}
        {!item && (
          <div className="flex items-center gap-3 mb-4 p-2 bg-gray-50 rounded-md">
            <label htmlFor="quantity" className="text-sm font-medium text-gray-700 whitespace-nowrap">
              Anzahl:
            </label>
            <input
              id="quantity"
              type="number"
              min="1"
              max="50"
              value={quantity}
              onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
              className="w-16 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
            <span className="text-xs text-gray-500">
              {quantity > 1 ? `Es werden ${quantity} Waren erstellt` : 'Einzelne Ware erstellen'}
            </span>
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm mb-1">
              Name *
            </label>
            <input
              id="name"
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
              required
            />
          </div>
          <div>
            <label htmlFor="description" className="block text-sm mb-1">
              Beschreibung
            </label>
            <textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
              rows={3}
            />
          </div>
          <div>
            <label className="block text-sm mb-1">
              Kategorien
            </label>
            <CategorySelector
              availableCategories={availableCategories}
              selectedCategoryIds={formData.categoryIds}
              onChange={(categoryIds, categoryNames) => {
                setFormData(prev => ({
                  ...prev,
                  categoryIds,
                  categories: categoryNames
                }));
              }}
              onCategoryCreated={(newCat) => {
                setAvailableCategories(prev => [...prev, newCat]);
              }}
            />
          </div>
          <div>
            <label htmlFor="tagId" className="block text-sm mb-1">
              Tag-ID {quantity > 1 && <span className="text-xs text-gray-500">(optional - komma-getrennt)</span>}
            </label>
            <div className="flex gap-2">
              <input
                id="tagId"
                type="text"
                value={formData.tagId}
                onChange={(e) => setFormData({ ...formData, tagId: e.target.value })}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
                placeholder={quantity > 1 ? "Tag1, Tag2, Tag3... oder scannen" : "Manuell eingeben oder scannen"}
              />
              <button
                type="button"
                onClick={handleScanTag}
                disabled={isScanningTag || !hasAntennaConfig()}
                className={`px-3 py-2 border rounded-md transition-colors ${
                  isScanningTag
                    ? 'border-teal-500 bg-teal-50 text-teal-600'
                    : !hasAntennaConfig()
                      ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed'
                      : 'border-gray-300 hover:bg-gray-50'
                }`}
                title={
                  !hasAntennaConfig() 
                    ? 'Antenne nicht konfiguriert - bitte zuerst Einstellungen öffnen' 
                    : 'Tag-ID mit RFID-Antenne scannen'
                }
              >
                <Scan className={`w-5 h-5 ${isScanningTag ? 'animate-pulse' : ''}`} />
              </button>
            </div>
            
            {/* Scan Status */}
            {isScanningTag && (
              <div className="mt-2">
                <div className="flex justify-between text-xs text-teal-600 mb-1">
                  <span>
                    {quantity > 1 
                      ? `Multi-Scan: Sammle ${quantity} Tags... (${collectedTags.length}/${quantity})` 
                      : 'Scanne nach unbekannten Tags...'}
                  </span>
                  <span>{Math.round(scanProgress)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-teal-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${scanProgress}%` }}
                  />
                </div>
                {/* Gesammelte Tags im Multi-Scan Modus */}
                {quantity > 1 && collectedTags.length > 0 && (
                  <div className="mt-2 text-xs">
                    <span className="font-medium text-teal-700">
                      Gesammelt: {collectedTags.length} / {quantity}
                    </span>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {collectedTags.map((tag, idx) => (
                        <span key={idx} className="px-2 py-0.5 bg-teal-100 text-teal-700 rounded text-[10px] break-all" title={tag}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Bereits bekannte Tags anzeigen */}
                {foundKnownTags.length > 0 && (
                  <div className="mt-2 text-xs text-gray-600">
                    <span className="font-medium">Bereits bekannt:</span>
                    <div className="mt-1 space-y-1 max-h-20 overflow-y-auto">
                      {foundKnownTags.slice(0, 5).map((tag, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <span className="w-2 h-2 bg-blue-400 rounded-full"></span>
                          <span className="truncate">{tag.name}</span>
                          <code className="text-gray-400 text-[10px]">{tag.epc?.slice(0, 8)}...</code>
                        </div>
                      ))}
                      {foundKnownTags.length > 5 && (
                        <div className="text-gray-400">+{foundKnownTags.length - 5} weitere...</div>
                      )}
                    </div>
                  </div>
                )}
                <button
                  type="button"
                  onClick={cleanupAntenna}
                  className="mt-2 text-xs text-red-500 hover:text-red-700 underline"
                >
                  Scan abbrechen
                </button>
              </div>
            )}
            
            {scanError && (
              <p className="text-xs text-red-600 mt-1">{scanError}</p>
            )}
          </div>
          <div>
            <label htmlFor="cabinetNumber" className="block text-sm mb-1">
              Schranknummer
            </label>
            <input
              id="cabinetNumber"
              type="text"
              value={formData.cabinetNumber}
              onChange={(e) => setFormData({ ...formData, cabinetNumber: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
              placeholder="z.B. A-12"
            />
          </div>

          <div className="flex gap-2 pt-4">
            <button
              type="button"
              onClick={async () => {
                await cleanupAntenna();
                onClose();
              }}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-teal-600 text-white rounded-md hover:bg-teal-700 transition-colors"
            >
              Speichern
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
