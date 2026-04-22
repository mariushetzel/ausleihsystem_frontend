import { X, History as HistoryIcon, UserCheck, AlertTriangle, CheckCircle } from 'lucide-react';
import { HistoryEntry } from './Dashboard';

interface Schadensmeldung {
  id: string;
  beschreibung: string;
  rueckgeber?: { name: string };
  erstellt_am: string;
  quittiert: boolean;
  quittierer?: { name: string };
  quittiert_am?: string;
  quittierer_beschreibung?: string;
}

interface ItemHistoryDialogProps {
  itemName: string;
  itemTagId: string;
  history: HistoryEntry[];
  schadensmeldungen?: Schadensmeldung[];
  onClose: () => void;
}

// Hilfsfunktion zum Formatieren von Datumsstrings
function formatDateTime(dateStr: string | undefined | null): string {
  if (!dateStr) return '-';
  
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear().toString().slice(-2);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    
    return `${day}.${month}.${year} ${hours}:${minutes}`;
  } catch {
    return dateStr;
  }
}

export function ItemHistoryDialog({ itemName, itemTagId, history, schadensmeldungen = [], onClose }: ItemHistoryDialogProps) {
  // Kombiniere Historie und Schadensmeldungen für eine chronologische Ansicht
  const combinedEntries = [
    ...history.map(h => ({ ...h, type: 'history' as const })),
    ...schadensmeldungen.map(s => ({ ...s, type: 'schaden' as const }))
  ].sort((a, b) => {
    const dateA = new Date((a as any).erstellt_am || (a as any).borrowedAt || 0).getTime();
    const dateB = new Date((b as any).erstellt_am || (b as any).borrowedAt || 0).getTime();
    return dateB - dateA; // Neueste zuerst
  });

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[80vh] overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-teal-700 mb-1">Historie & Schadensmeldungen</h2>
            <p className="text-sm text-gray-600">
              {itemName} <code className="bg-gray-100 px-2 py-0.5 rounded ml-2">{itemTagId}</code>
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(80vh-140px)]">
          {combinedEntries.length === 0 ? (
            <div className="text-center py-12">
              <HistoryIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-600">Noch keine Historie vorhanden</p>
            </div>
          ) : (
            <div className="space-y-4">
              {combinedEntries.map((entry) => (
                'type' in entry && entry.type === 'schaden' ? (
                  // Schadensmeldung
                  <div
                    key={entry.id}
                    className={`border rounded-lg p-4 ${
                      entry.quittiert
                        ? 'border-gray-200 bg-gray-50'
                        : 'border-amber-300 bg-amber-50'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className={`w-5 h-5 ${entry.quittiert ? 'text-gray-500' : 'text-amber-600'}`} />
                        <p className="font-medium text-gray-900">Schadensmeldung</p>
                      </div>
                      {entry.quittiert ? (
                        <span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-xs rounded flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" />
                          Quittiert
                        </span>
                      ) : (
                        <span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs rounded">
                          Offen
                        </span>
                      )}
                    </div>
                    <div className="space-y-2 text-sm">
                      <div>
                        <span className="text-gray-500">Beschreibung:</span>
                        <p className="text-gray-900">{entry.beschreibung}</p>
                      </div>
                      {entry.rueckgeber && (
                        <div>
                          <span className="text-gray-500">Gemeldet von:</span>
                          <p className="text-gray-900">{entry.rueckgeber.name}</p>
                        </div>
                      )}
                      <div>
                        <span className="text-gray-500">Datum:</span>
                        <p className="text-gray-900">{formatDateTime(entry.erstellt_am)}</p>
                      </div>
                      {entry.quittiert && entry.quittierer && (
                        <div>
                          <span className="text-gray-500 flex items-center gap-1">
                            <UserCheck className="w-3 h-3" />
                            Quittiert von:
                          </span>
                          <p className="text-gray-900">{entry.quittierer.name} am {formatDateTime(entry.quittiert_am)}</p>
                        </div>
                      )}
                      {entry.quittierer_beschreibung && (
                        <div className="mt-2 p-2 bg-white rounded border border-gray-200">
                          <span className="text-gray-500">Anmerkung des Quittierers:</span>
                          <p className="text-gray-700 italic">{entry.quittierer_beschreibung}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  // Ausleihe-Historie
                  <div
                    key={(entry as HistoryEntry).id}
                    className={`border rounded-lg p-4 ${
                      (entry as HistoryEntry).returnedAt
                        ? 'border-gray-200 bg-white'
                        : 'border-orange-200 bg-orange-50'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="font-medium text-gray-900">{(entry as HistoryEntry).borrower}</p>
                        <p className="text-sm text-gray-600">{(entry as HistoryEntry).location || 'Kein Verbleib angegeben'}</p>
                      </div>
                      {(entry as HistoryEntry).returnedAt ? (
                        <span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-xs rounded">
                          Zurückgegeben
                        </span>
                      ) : (
                        <span className="px-2 py-1 bg-orange-100 text-orange-700 text-xs rounded">
                          Aktuell ausgeliehen
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-gray-500">Ausgeliehen am:</span>
                        <p className="text-gray-900">{formatDateTime((entry as HistoryEntry).borrowedAt)}</p>
                      </div>
                      <div>
                        <span className="text-gray-500">Geplante Rückgabe:</span>
                        <p className="text-gray-900">{formatDateTime((entry as HistoryEntry).plannedReturnDate)}</p>
                      </div>
                      <div>
                        <span className="text-gray-500">Zurückgegeben am:</span>
                        <p className={entry.returnedAt ? 'text-gray-900' : 'text-orange-600 font-medium'}>
                          {(entry as HistoryEntry).returnedAt ? formatDateTime((entry as HistoryEntry).returnedAt) : 'Noch nicht zurückgegeben'}
                        </p>
                      </div>
                      {(entry as HistoryEntry).returnedBy && (
                        <div>
                          <span className="text-gray-500 flex items-center gap-1">
                            <UserCheck className="w-3 h-3" />
                            Quittiert von:
                          </span>
                          <p className="text-gray-900">{(entry as HistoryEntry).returnedBy}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
          >
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
}
