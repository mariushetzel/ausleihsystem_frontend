import { useState, useEffect } from 'react';
import { ArrowLeft, Shield, MapPin, Plus, Trash2, AlertTriangle, X, Ban, Edit2, Check } from 'lucide-react';
import { 
  kategorienApi, 
  warenApi, 
  verbleibOrtApi, 
  kategorieVerbleibMatrixApi,
  type Warenkategorie, 
  type VerbleibOrt,
  type MatrixData,
  type MatrixZelle
} from '../api';

interface CategorySettingsProps {
  username: string;
  onBack: () => void;
  onCategoriesChanged?: () => void;
}

// Rollen für Berechtigungen (von niedrig zu hoch)
const ROLES = [
  { value: 'Student', label: 'St', level: 1 },
  { value: 'Mitarbeiter', label: 'Ma', level: 2 },
  { value: 'Laborleiter', label: 'LL', level: 3 },
  { value: 'Admin', label: 'Ad', level: 4 },
];

// Farben für die Rollen
const ROLE_COLORS: Record<string, string> = {
  'Student': 'bg-green-100 text-green-700 hover:bg-green-200',
  'Mitarbeiter': 'bg-blue-100 text-blue-700 hover:bg-blue-200',
  'Laborleiter': 'bg-purple-100 text-purple-700 hover:bg-purple-200',
  'Admin': 'bg-red-100 text-red-700 hover:bg-red-200',
};

export function CategorySettings({ username, onBack, onCategoriesChanged }: CategorySettingsProps) {
  // Matrix-Daten
  const [matrixData, setMatrixData] = useState<MatrixData | null>(null);
  const [isLoadingMatrix, setIsLoadingMatrix] = useState(false);
  
  // Neue Einträge
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newVerbleibOrtName, setNewVerbleibOrtName] = useState('');
  const [newVerbleibOrtRaumnummer, setNewVerbleibOrtRaumnummer] = useState(false);
  
  // Löschen Bestätigung
  const [deleteConfirmCategory, setDeleteConfirmCategory] = useState<Warenkategorie | null>(null);
  const [deleteCategoryWarenCount, setDeleteCategoryWarenCount] = useState(0);
  const [deleteConfirmVerbleib, setDeleteConfirmVerbleib] = useState<VerbleibOrt | null>(null);
  
  // Einzel-Zellen Bearbeitung
  const [editingCell, setEditingCell] = useState<{
    kategorieId: string;
    verbleibOrtId: string;
    kategorieName: string;
    verbleibOrtName: string;
    zelle: MatrixZelle;
  } | null>(null);
  
  // Bulk Bearbeitung (ganze Zeile oder Spalte)
  const [bulkEdit, setBulkEdit] = useState<{
    type: 'row' | 'column';
    id: string;
    name: string;
    zelle: MatrixZelle;
    zelleModified?: boolean; // true wenn Berechtigungen geändert wurden
    raumnummerErforderlich?: boolean; // nur für Verbleib-Orte
    error?: string;
    gemischteWerte?: boolean; // true wenn Zellen verschiedene Werte haben
  } | null>(null);
  
  // Message
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Toast automatisch nach 3 Sekunden ausblenden
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => {
        setMessage(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  // Beim ersten Laden
  useEffect(() => {
    loadMatrix();
  }, []);

  // Matrix laden
  const loadMatrix = async () => {
    setIsLoadingMatrix(true);
    try {
      const data = await kategorieVerbleibMatrixApi.getMatrix();
      setMatrixData(data);
    } catch (err) {
      console.error('Fehler beim Laden der Matrix:', err);
      setMessage({ type: 'error', text: 'Fehler beim Laden der Berechtigungs-Matrix' });
    } finally {
      setIsLoadingMatrix(false);
    }
  };

  // Neue Kategorie erstellen
  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) return;
    
    // Client-seitige Prüfung auf doppelte Namen
    const trimmedName = newCategoryName.trim();
    const existingCategory = matrixData?.kategorien.find(
      k => k.name.toLowerCase() === trimmedName.toLowerCase()
    );
    if (existingCategory) {
      setMessage({ type: 'error', text: `Kategorie "${trimmedName}" existiert bereits` });
      return;
    }
    
    try {
      const result = await kategorienApi.create(
        trimmedName,
        '',
        'Student'
      );
      
      if (result.existing) {
        setMessage({ type: 'error', text: `Kategorie "${result.name}" existiert bereits` });
      } else {
        setMessage({ type: 'success', text: `Kategorie "${result.name}" erstellt` });
        setNewCategoryName('');
        await loadMatrix();
        onCategoriesChanged?.();
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: `Fehler: ${err.message || 'Unbekannter Fehler'}` });
    }
  };

  // Kategorie löschen
  const handleDeleteCategory = async () => {
    if (!deleteConfirmCategory) return;
    
    try {
      const result = await kategorienApi.delete(deleteConfirmCategory.id);
      setMessage({ type: 'success', text: `Kategorie "${deleteConfirmCategory.name}" gelöscht` });
      setDeleteConfirmCategory(null);
      await loadMatrix();
      onCategoriesChanged?.();
    } catch (err: any) {
      setMessage({ type: 'error', text: `Fehler: ${err.message || 'Unbekannter Fehler'}` });
    }
  };

  // Prüfen wie viele Waren eine Kategorie haben
  const checkCategoryWaren = async (category: Warenkategorie) => {
    try {
      const waren = await warenApi.getAll();
      const count = waren.filter(w => w.kategorie_ids?.includes(category.id)).length;
      setDeleteCategoryWarenCount(count);
      setDeleteConfirmCategory(category);
    } catch (err) {
      setDeleteCategoryWarenCount(0);
      setDeleteConfirmCategory(category);
    }
  };

  // Neuen Verbleib-Ort erstellen
  const handleCreateVerbleibOrt = async () => {
    if (!newVerbleibOrtName.trim()) return;
    
    // Client-seitige Prüfung auf doppelte Namen
    const trimmedName = newVerbleibOrtName.trim();
    const existingOrt = matrixData?.verbleib_orte.find(
      o => o.name.toLowerCase() === trimmedName.toLowerCase()
    );
    if (existingOrt) {
      setMessage({ type: 'error', text: `Verbleib-Ort "${trimmedName}" existiert bereits` });
      return;
    }
    
    try {
      const result = await verbleibOrtApi.create(
        trimmedName,
        '',
        (matrixData?.verbleib_orte.length || 0) + 1,
        newVerbleibOrtRaumnummer
      );
      
      if (result.existing) {
        setMessage({ type: 'error', text: `Verbleib-Ort "${result.name}" existiert bereits` });
      } else {
        setMessage({ type: 'success', text: `Verbleib-Ort "${result.name}" erstellt` });
        setNewVerbleibOrtName('');
        setNewVerbleibOrtRaumnummer(false);
        await loadMatrix();
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: `Fehler: ${err.message || 'Unbekannter Fehler'}` });
    }
  };

  // Verbleib-Ort löschen
  const handleDeleteVerbleibOrt = async () => {
    if (!deleteConfirmVerbleib) return;
    
    try {
      await verbleibOrtApi.delete(deleteConfirmVerbleib.id);
      setMessage({ type: 'success', text: `Verbleib-Ort "${deleteConfirmVerbleib.name}" gelöscht` });
      setDeleteConfirmVerbleib(null);
      await loadMatrix();
    } catch (err: any) {
      setMessage({ type: 'error', text: `Fehler: ${err.message || 'Unbekannter Fehler'}` });
    }
  };

  // Zelle bearbeiten
  const handleCellClick = (kategorieId: string, verbleibOrtId: string) => {
    if (!matrixData) return;
    
    const kategorie = matrixData.kategorien.find(k => k.id === kategorieId);
    const verbleibOrt = matrixData.verbleib_orte.find(o => o.id === verbleibOrtId);
    if (!kategorie || !verbleibOrt) return;
    
    const zelle = kategorie.zellen[verbleibOrtId] || { minimale_rolle: 'Student', gesperrt: false };
    
    setEditingCell({
      kategorieId,
      verbleibOrtId,
      kategorieName: kategorie.name,
      verbleibOrtName: verbleibOrt.name,
      zelle: { ...zelle }
    });
  };

  // Zelle speichern
  const handleSaveCell = async () => {
    if (!editingCell) return;
    
    try {
      await kategorieVerbleibMatrixApi.updateRegel(
        editingCell.kategorieId,
        editingCell.verbleibOrtId,
        {
          minimale_rolle: editingCell.zelle.minimale_rolle,
          gesperrt: editingCell.zelle.gesperrt,
          maximale_leihdauer_tage: editingCell.zelle.maximale_leihdauer_tage
        }
      );
      
      setMessage({ type: 'success', text: 'Berechtigung aktualisiert' });
      setEditingCell(null);
      await loadMatrix();
    } catch (err: any) {
      setMessage({ type: 'error', text: `Fehler: ${err.message || 'Unbekannter Fehler'}` });
    }
  };

  // Bulk Bearbeitung starten (Zeile oder Spalte)
  const handleBulkEditStart = (type: 'row' | 'column', id: string) => {
    if (!matrixData) return;
    
    const item = type === 'row' 
      ? matrixData.kategorien.find(k => k.id === id)
      : matrixData.verbleib_orte.find(o => o.id === id);
    
    if (!item) return;
    
    // Sammle alle Zellen dieser Zeile/Spalte
    const zellen: MatrixZelle[] = [];
    if (type === 'row') {
      // Alle Verbleib-Orte für diese Kategorie
      for (const ort of matrixData.verbleib_orte) {
        const zelle = (item as any).zellen?.[ort.id] || { minimale_rolle: 'Student', gesperrt: false, maximale_leihdauer_tage: null };
        zellen.push(zelle);
      }
    } else {
      // Alle Kategorien für diesen Verbleib-Ort
      for (const kat of matrixData.kategorien) {
        const zelle = kat.zellen?.[id] || { minimale_rolle: 'Student', gesperrt: false, maximale_leihdauer_tage: null };
        zellen.push(zelle);
      }
    }
    
    // Prüfe ob alle Zellen gleich sind
    const ersteZelle = zellen[0] || { minimale_rolle: 'Student', gesperrt: false, maximale_leihdauer_tage: null };
    const alleGleich = zellen.every(z => 
      z.minimale_rolle === ersteZelle.minimale_rolle &&
      z.gesperrt === ersteZelle.gesperrt &&
      z.maximale_leihdauer_tage === ersteZelle.maximale_leihdauer_tage
    );
    
    setBulkEdit({
      type,
      id,
      name: item.name,
      zelle: alleGleich 
        ? { ...ersteZelle }
        : { minimale_rolle: 'Student', gesperrt: false, maximale_leihdauer_tage: null },
      zelleModified: false,
      raumnummerErforderlich: type === 'column' ? (item as VerbleibOrt).raumnummer_erforderlich : undefined,
      gemischteWerte: !alleGleich // Hinweis wenn verschiedene Werte vorhanden
    });
  };

  // Bulk Bearbeitung speichern (alle Zellen in Zeile/Spalte + Name)
  const handleBulkEditSave = async () => {
    if (!bulkEdit || !matrixData) return;
    
    // Prüfen auf doppelte Namen beim Umbenennen
    const trimmedName = bulkEdit.name.trim();
    if (!trimmedName) {
      setBulkEdit({ ...bulkEdit, error: 'Name darf nicht leer sein' });
      return;
    }
    
    if (bulkEdit.type === 'row') {
      const existingKat = matrixData.kategorien.find(
        k => k.id !== bulkEdit.id && k.name.toLowerCase() === trimmedName.toLowerCase()
      );
      if (existingKat) {
        setBulkEdit({ ...bulkEdit, error: `Kategorie "${trimmedName}" existiert bereits` });
        return;
      }
    } else {
      const existingOrt = matrixData.verbleib_orte.find(
        o => o.id !== bulkEdit.id && o.name.toLowerCase() === trimmedName.toLowerCase()
      );
      if (existingOrt) {
        setBulkEdit({ ...bulkEdit, error: `Verbleib-Ort "${trimmedName}" existiert bereits` });
        return;
      }
    }
    
    setIsLoadingMatrix(true);
    setBulkEdit({ ...bulkEdit, error: undefined }); // Fehler zurücksetzen
    let updated = 0;
    let errors = 0;
    
    try {
      // Zuerst den Namen aktualisieren
      if (bulkEdit.type === 'row') {
        try {
          await kategorienApi.update(bulkEdit.id, { name: trimmedName });
        } catch (err: any) {
          const errorMsg = err.message || '';
          if (errorMsg.includes('bereits') || errorMsg.includes('duplicate')) {
            setBulkEdit({ ...bulkEdit, error: `Kategorie "${trimmedName}" existiert bereits` });
          } else {
            setBulkEdit({ ...bulkEdit, error: `Fehler: ${errorMsg || 'Name konnte nicht geändert werden'}` });
          }
          setIsLoadingMatrix(false);
          return;
        }
      } else {
        try {
          await verbleibOrtApi.update(bulkEdit.id, { 
            name: trimmedName,
            raumnummer_erforderlich: bulkEdit.raumnummerErforderlich 
          });
        } catch (err: any) {
          const errorMsg = err.message || '';
          if (errorMsg.includes('bereits') || errorMsg.includes('duplicate')) {
            setBulkEdit({ ...bulkEdit, error: `Verbleib-Ort "${trimmedName}" existiert bereits` });
          } else {
            setBulkEdit({ ...bulkEdit, error: `Fehler: ${errorMsg || 'Name konnte nicht geändert werden'}` });
          }
          setIsLoadingMatrix(false);
          return;
        }
      }
      
      // Dann alle Berechtigungen (NUR wenn sie geändert wurden)
      if (bulkEdit.zelleModified) {
        if (bulkEdit.type === 'row') {
          // Alle Verbleib-Orte für diese Kategorie
          for (const ort of matrixData.verbleib_orte) {
            try {
              await kategorieVerbleibMatrixApi.updateRegel(
                bulkEdit.id,
                ort.id,
                {
                  minimale_rolle: bulkEdit.zelle.minimale_rolle,
                  gesperrt: bulkEdit.zelle.gesperrt,
                  maximale_leihdauer_tage: bulkEdit.zelle.maximale_leihdauer_tage
                }
              );
              updated++;
            } catch (err) {
              errors++;
            }
          }
        } else {
          // Alle Kategorien für diesen Verbleib-Ort
          for (const kat of matrixData.kategorien) {
            try {
              await kategorieVerbleibMatrixApi.updateRegel(
                kat.id,
                bulkEdit.id,
                {
                  minimale_rolle: bulkEdit.zelle.minimale_rolle,
                  gesperrt: bulkEdit.zelle.gesperrt,
                  maximale_leihdauer_tage: bulkEdit.zelle.maximale_leihdauer_tage
                }
              );
              updated++;
            } catch (err) {
              errors++;
            }
          }
        }
      }
      
      if (errors === 0) {
        if (bulkEdit.zelleModified && updated > 0) {
          setMessage({ type: 'success', text: `${trimmedName} aktualisiert (${updated} Berechtigungen geändert)` });
        } else {
          setMessage({ type: 'success', text: `${trimmedName} aktualisiert` });
        }
      } else {
        setMessage({ type: 'error', text: `${errors} Fehler bei ${updated} Aktualisierungen` });
      }
      
      setBulkEdit(null);
      await loadMatrix();
    } catch (err: any) {
      setMessage({ type: 'error', text: `Fehler: ${err.message || 'Unbekannter Fehler'}` });
    } finally {
      setIsLoadingMatrix(false);
    }
  };

  // Render Zelle - immer etwas anzeigen, Standard ist Student
  const renderCell = (zelle: MatrixZelle | undefined) => {
    // Wenn keine Zelle oder keine Einschränkung -> Student (Standard)
    const effectiveZelle: MatrixZelle = zelle || { minimale_rolle: 'Student', gesperrt: false, maximale_leihdauer_tage: null };
    
    if (effectiveZelle.gesperrt) {
      return (
        <span className="flex items-center justify-center text-red-600" title="Gesperrt">
          <Ban className="w-4 h-4" />
        </span>
      );
    }
    
    const role = ROLES.find(r => r.value === effectiveZelle.minimale_rolle);
    const hasMaxDauer = effectiveZelle.maximale_leihdauer_tage !== null && effectiveZelle.maximale_leihdauer_tage !== undefined;
    
    return (
      <div className="flex flex-col items-center gap-0.5">
        <span 
          className={`inline-flex items-center justify-center w-8 h-6 rounded text-xs font-medium ${ROLE_COLORS[effectiveZelle.minimale_rolle] || 'bg-gray-100'}`}
          title={`Mindestens: ${effectiveZelle.minimale_rolle}`}
        >
          {role?.label || effectiveZelle.minimale_rolle.substring(0, 2)}
        </span>
        {hasMaxDauer && (
          <span className="text-[10px] text-gray-500" title={`Max ${effectiveZelle.maximale_leihdauer_tage} Tage`}>
            {effectiveZelle.maximale_leihdauer_tage}d
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-emerald-50">
      <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-50">
        <div className="w-full px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Shield className="w-8 h-8 text-teal-600" />
            <h1 className="text-2xl font-bold text-teal-700">Berechtigungs-Matrix</h1>
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
              Zurück
            </button>
          </div>
        </div>
      </header>

      {/* Toast-Benachrichtigungen oben rechts */}
      {message && (
        <div className="fixed top-20 right-4 z-50 animate-fade-in">
          <div className={`px-4 py-3 rounded-lg shadow-lg ${message.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}>
            <div className="font-medium">{message.text}</div>
          </div>
        </div>
      )}

      <main className="w-full px-6 lg:px-8 py-8">

        {/* Neue Kategorie / Verbleib-Ort - OBEN */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* Neue Kategorie */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Plus className="w-5 h-5 text-teal-600" />
              Neue Kategorie
            </h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="Kategorie-Name..."
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
                onKeyPress={(e) => e.key === 'Enter' && handleCreateCategory()}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck="false"
              />
              <button
                onClick={handleCreateCategory}
                disabled={!newCategoryName.trim()}
                className="px-4 py-2 bg-teal-600 text-white rounded-md hover:bg-teal-700 disabled:opacity-50 text-sm"
              >
                Erstellen
              </button>
            </div>
          </div>

          {/* Neuer Verbleib-Ort */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Plus className="w-5 h-5 text-teal-600" />
              Neuer Verbleib-Ort
            </h3>
            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newVerbleibOrtName}
                  onChange={(e) => setNewVerbleibOrtName(e.target.value)}
                  placeholder="Verbleib-Ort-Name..."
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
                  onKeyPress={(e) => e.key === 'Enter' && handleCreateVerbleibOrt()}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck="false"
                />
                <button
                  onClick={handleCreateVerbleibOrt}
                  disabled={!newVerbleibOrtName.trim()}
                  className="px-4 py-2 bg-teal-600 text-white rounded-md hover:bg-teal-700 disabled:opacity-50 text-sm"
                >
                  Erstellen
                </button>
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={newVerbleibOrtRaumnummer}
                  onChange={(e) => setNewVerbleibOrtRaumnummer(e.target.checked)}
                  className="w-6 h-6 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                />
                <span className="text-gray-700">Raumnummer bei Ausleihe erforderlich</span>
              </label>
            </div>
          </div>
        </div>

        {/* Legende */}
        <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Legende</h3>
          <div className="flex flex-wrap gap-4">
            {ROLES.map(role => (
              <div key={role.value} className="flex items-center gap-2">
                <span className={`inline-flex items-center justify-center w-8 h-6 rounded text-xs font-medium ${ROLE_COLORS[role.value]}`}>
                  {role.label}
                </span>
                <span className="text-sm text-gray-600">{role.value}</span>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center w-8 h-6 text-red-600">
                <Ban className="w-4 h-4" />
              </span>
              <span className="text-sm text-gray-600">Gesperrt</span>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-3">
            Klicken Sie auf eine Kategorie oder einen Verbleib-Ort, um die gesamte Zeile/Spalte zu bearbeiten.
            Klicken Sie auf eine Zelle, um einzelne Berechtigungen zu ändern.
          </p>
        </div>

        {/* Matrix-Tabelle */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden mb-6">
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
              <Shield className="w-5 h-5 text-teal-600" />
              Kategorien × Verbleib-Orte
            </h2>
          </div>
          
          {isLoadingMatrix ? (
            <div className="p-8 text-center text-gray-500">Lade Matrix...</div>
          ) : !matrixData || matrixData.kategorien.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              Keine Kategorien vorhanden. Erstellen Sie zuerst eine Kategorie.
            </div>
          ) : matrixData.verbleib_orte.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              Keine Verbleib-Orte vorhanden. Erstellen Sie zuerst einen Verbleib-Ort.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-2 py-3 text-left text-sm font-medium text-gray-700 border-b border-r border-gray-200 sticky left-0 bg-gray-50 z-10 w-48">
                      <div className="flex items-center gap-2">
                        <span>Kategorie \ Verbleib</span>
                      </div>
                    </th>
                    {matrixData.verbleib_orte.map(ort => (
                      <th 
                        key={ort.id} 
                        className="px-1 py-3 text-center text-sm font-medium text-gray-700 border-b border-r border-gray-200 min-w-[90px] cursor-pointer hover:bg-teal-100 transition-colors group"
                        onClick={() => handleBulkEditStart('column', ort.id)}
                      >
                        <div className="flex items-center justify-center gap-1">
                          <span className="truncate max-w-[70px]" title={`${ort.name} (Klick für Spalten-Edit)`}>{ort.name}</span>
                          <Edit2 className="w-3 h-3 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteConfirmVerbleib(ort);
                            }}
                            className="text-red-500 hover:text-red-700 p-0.5 flex-shrink-0"
                            title="Löschen"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrixData.kategorien.map((kategorie, index) => (
                    <tr key={kategorie.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td 
                        className="px-2 py-3 text-sm font-medium text-gray-700 border-r border-gray-200 sticky left-0 bg-inherit z-10 cursor-pointer hover:bg-teal-100 transition-colors group"
                        onClick={() => handleBulkEditStart('row', kategorie.id)}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1">
                            <span className="truncate" title={`${kategorie.name} (Klick für Zeilen-Edit)`}>{kategorie.name}</span>
                            <Edit2 className="w-3 h-3 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              checkCategoryWaren(kategorie);
                            }}
                            className="text-red-500 hover:text-red-700 flex-shrink-0 p-1"
                            title="Löschen"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                      {matrixData.verbleib_orte.map(ort => (
                        <td 
                          key={ort.id}
                          className="px-1 py-2 text-center border-r border-gray-200 cursor-pointer hover:bg-teal-50 transition-colors"
                          onClick={() => handleCellClick(kategorie.id, ort.id)}
                        >
                          {renderCell(kategorie.zellen[ort.id])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Edit Cell Dialog */}
      {editingCell && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={(e) => { if (e.target === e.currentTarget) setEditingCell(null); }}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Berechtigung bearbeiten
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              {editingCell.kategorieName} → {editingCell.verbleibOrtName}
            </p>
            
            <div className="space-y-4">
              {/* Gesperrt Toggle */}
              <label className="flex items-center gap-3 p-3 bg-gray-50 rounded cursor-pointer hover:bg-gray-100">
                <input
                  type="checkbox"
                  checked={editingCell.zelle.gesperrt}
                  onChange={(e) => setEditingCell({
                    ...editingCell,
                    zelle: { ...editingCell.zelle, gesperrt: e.target.checked }
                  })}
                  className="w-2 h-2 rounded border-gray-300 text-red-600 focus:ring-red-500"
                />
                <span className="flex-1">Komplett gesperrt</span>
                {editingCell.zelle.gesperrt && (
                  <Ban className="w-4 h-4 text-red-600" />
                )}
              </label>

              {/* Minimale Rolle (nur wenn nicht gesperrt) */}
              {!editingCell.zelle.gesperrt && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Minimale erforderliche Rolle
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {ROLES.map(role => (
                      <button
                        key={role.value}
                        onClick={() => setEditingCell({
                          ...editingCell,
                          zelle: { ...editingCell.zelle, minimale_rolle: role.value as any }
                        })}
                        className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
                          editingCell.zelle.minimale_rolle === role.value
                            ? ROLE_COLORS[role.value]
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {role.label} - {role.value}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Maximale Leihdauer */}
              {!editingCell.zelle.gesperrt && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Maximale Ausleihdauer (Tage)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      max="365"
                      value={editingCell.zelle.maximale_leihdauer_tage || ''}
                      onChange={(e) => {
                        const value = e.target.value === '' ? null : parseInt(e.target.value);
                        setEditingCell({
                          ...editingCell,
                          zelle: { ...editingCell.zelle, maximale_leihdauer_tage: value }
                        });
                      }}
                      placeholder="Unbegrenzt"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
                    />
                    <span className="text-sm text-gray-500 whitespace-nowrap">Tage</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Leer lassen für unbegrenzte Ausleihdauer
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setEditingCell(null)}
                className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Abbrechen
              </button>
              <button
                onClick={handleSaveCell}
                className="px-4 py-2 bg-teal-600 text-white rounded-md hover:bg-teal-700"
              >
                Speichern
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Edit Dialog */}
      {bulkEdit && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={(e) => { if (e.target === e.currentTarget) setBulkEdit(null); }}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {bulkEdit.type === 'row' ? 'Kategorie bearbeiten' : 'Verbleib-Ort bearbeiten'}
            </h3>
            
            <div className="space-y-4">
              {/* Name bearbeiten */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {bulkEdit.type === 'row' ? 'Kategorie-Name' : 'Verbleib-Ort Name'}
                </label>
                <input
                  type="text"
                  value={bulkEdit.name}
                  onChange={(e) => setBulkEdit({ ...bulkEdit, name: e.target.value, error: undefined })}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 ${
                    bulkEdit.error 
                      ? 'border-red-500 focus:ring-red-500' 
                      : 'border-gray-300 focus:ring-teal-500'
                  }`}
                  placeholder={bulkEdit.type === 'row' ? 'Kategorie-Name...' : 'Verbleib-Ort Name...'}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck="false"
                />
                {bulkEdit.error && (
                  <p className="text-red-600 text-sm mt-1">{bulkEdit.error}</p>
                )}
              </div>
              
              {/* Raumnummer erforderlich (nur für Verbleib-Orte) */}
              {bulkEdit.type === 'column' && (
                <label className="flex items-center gap-3 p-3 bg-amber-50 rounded cursor-pointer hover:bg-amber-100 border border-amber-200">
                  <input
                    type="checkbox"
                    checked={bulkEdit.raumnummerErforderlich || false}
                    onChange={(e) => setBulkEdit({
                      ...bulkEdit,
                      raumnummerErforderlich: e.target.checked
                    })}
                    className="w-6 h-6 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                  />
                  <span className="flex-1 text-sm font-medium text-amber-800">
                    Raumnummer erforderlich
                  </span>
                  <span className="text-xs text-amber-600">
                    Bei Ausleihe muss Raum angegeben werden
                  </span>
                </label>
              )}
              
              {/* Berechtigungen ändern Toggle */}
              <label className="flex items-center gap-3 p-3 bg-gray-50 rounded cursor-pointer hover:bg-gray-100">
                <input
                  type="checkbox"
                  checked={bulkEdit.zelleModified || false}
                  onChange={(e) => setBulkEdit({
                    ...bulkEdit,
                    zelleModified: e.target.checked
                  })}
                  className="w-6 h-6 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                />
                <span className="flex-1 font-medium">Berechtigungen ändern</span>
                <span className="text-xs text-gray-500">
                  {bulkEdit.zelleModified 
                    ? `Wird auf alle ${bulkEdit.type === 'row' ? 'Verbleib-Orte' : 'Kategorien'} angewendet` 
                    : 'Nur Name ändern'}
                </span>
              </label>
              
              {/* Berechtigungs-Einstellungen -- nur anzeigen wenn aktiviert */}
              {bulkEdit.zelleModified && (
                <div className="space-y-3 pt-2 border-t border-gray-200">
                  {/* Hinweis bei gemischten Werten */}
                  {bulkEdit.gemischteWerte && (
                    <p className="text-xs text-blue-700 bg-blue-50 p-2 rounded border border-blue-200">
                      <AlertTriangle className="w-3 h-3 inline mr-1" />
                      Aktuell sind verschiedene Berechtigungen in dieser {bulkEdit.type === 'row' ? 'Zeile' : 'Spalte'} gesetzt. 
                      Wählen Sie neue Werte, um alle zu überschreiben.
                    </p>
                  )}
                  
                  <p className="text-xs text-orange-600 bg-orange-50 p-2 rounded">
                    <AlertTriangle className="w-3 h-3 inline mr-1" />
                    Dies überschreibt ALLE Berechtigungen in dieser {bulkEdit.type === 'row' ? 'Zeile' : 'Spalte'}!
                  </p>
                  
                  {/* Gesperrt Toggle */}
                  <label className="flex items-center gap-3 p-3 bg-gray-50 rounded cursor-pointer hover:bg-gray-100">
                    <input
                      type="checkbox"
                      checked={bulkEdit.zelle.gesperrt}
                      onChange={(e) => setBulkEdit({
                        ...bulkEdit,
                        zelle: { ...bulkEdit.zelle, gesperrt: e.target.checked }
                      })}
                      className="w-6 h-6 rounded border-gray-300 text-red-600 focus:ring-red-500"
                    />
                    <span className="flex-1">Komplett gesperrt</span>
                    {bulkEdit.zelle.gesperrt && (
                      <Ban className="w-4 h-4 text-red-600" />
                    )}
                  </label>

                  {/* Minimale Rolle (nur wenn nicht gesperrt) */}
                  {!bulkEdit.zelle.gesperrt && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Minimale erforderliche Rolle für alle
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {ROLES.map(role => (
                          <button
                            key={role.value}
                            onClick={() => setBulkEdit({
                              ...bulkEdit,
                              zelle: { ...bulkEdit.zelle, minimale_rolle: role.value as any }
                            })}
                            className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
                              bulkEdit.zelle.minimale_rolle === role.value
                                ? ROLE_COLORS[role.value]
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                          >
                            {role.label} - {role.value}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Maximale Leihdauer */}
                  {!bulkEdit.zelle.gesperrt && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Maximale Ausleihdauer (Tage)
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="1"
                          max="365"
                          value={bulkEdit.zelle.maximale_leihdauer_tage || ''}
                          onChange={(e) => {
                            const value = e.target.value === '' ? null : parseInt(e.target.value);
                            setBulkEdit({
                              ...bulkEdit,
                              zelle: { ...bulkEdit.zelle, maximale_leihdauer_tage: value }
                            });
                          }}
                          placeholder="Unbegrenzt"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
                        />
                        <span className="text-sm text-gray-500 whitespace-nowrap">Tage</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Leer lassen für unbegrenzte Ausleihdauer
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setBulkEdit(null)}
                className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Abbrechen
              </button>
              <button
                onClick={handleBulkEditSave}
                disabled={isLoadingMatrix}
                className="px-4 py-2 bg-teal-600 text-white rounded-md hover:bg-teal-700 disabled:opacity-50 flex items-center gap-2"
              >
                {isLoadingMatrix ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Speichern...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    {bulkEdit.zelleModified ? 'Berechtigungen & Name speichern' : 'Nur Name speichern'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Category Confirm Dialog */}
      {deleteConfirmCategory && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-100 rounded-full">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Kategorie löschen</h3>
            </div>
            <p className="text-gray-600 mb-2">
              Möchten Sie <strong>"{deleteConfirmCategory.name}"</strong> wirklich löschen?
            </p>
            {deleteCategoryWarenCount > 0 && (
              <div className="bg-orange-50 border border-orange-200 rounded p-3 mb-4">
                <p className="text-sm text-orange-700">
                  <AlertTriangle className="w-4 h-4 inline mr-1" />
                  Diese Kategorie ist <strong>{deleteCategoryWarenCount} Waren</strong> zugeordnet.
                </p>
              </div>
            )}
            <p className="text-sm text-gray-500 mb-6">
              Diese Aktion kann nicht rückgängig gemacht werden.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setDeleteConfirmCategory(null);
                  setDeleteCategoryWarenCount(0);
                }}
                className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Abbrechen
              </button>
              <button
                onClick={handleDeleteCategory}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Löschen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Verbleib Confirm Dialog */}
      {deleteConfirmVerbleib && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-100 rounded-full">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Verbleib-Ort löschen</h3>
            </div>
            <p className="text-gray-600 mb-2">
              Möchten Sie <strong>"{deleteConfirmVerbleib.name}"</strong> wirklich löschen?
            </p>
            <p className="text-sm text-gray-500 mb-6">
              Alle zugehörigen Berechtigungsregeln werden ebenfalls gelöscht.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirmVerbleib(null)}
                className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Abbrechen
              </button>
              <button
                onClick={handleDeleteVerbleibOrt}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Löschen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
