import { X, History as HistoryIcon, CheckCircle, Clock, Package } from 'lucide-react';

interface HistoryEntry {
  id: string;
  ware?: { id: string; name: string; rfid_tag?: string };
  ware_name?: string;
  ware_kategorie?: string;
  benutzer_name?: string;
  ausgeliehen_am?: string;
  geplante_rueckgabe?: string;
  tatsaechliche_rueckgabe?: string;
  verbleib_ort?: string;
  zustand?: string;
  genehmigt_von?: string;
  status?: string;
}

interface UserHistoryDialogProps {
  username: string;
  history: HistoryEntry[];
  isLoading?: boolean;
  onClose: () => void;
}

function formatDate(dateStr: string | undefined | null): string {
  if (!dateStr || dateStr === 'null') return '-';
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
  } catch {
    return dateStr;
  }
}

// Pruefe ob zurueckgegeben anhand von status oder tatsaechliche_rueckgabe
function isReturned(entry: HistoryEntry): boolean {
  // Aktive Ausleihen (aus ausleihenApi) haben status 'aktiv' oder 'rueckgabe_beantragt'
  if (entry.status === 'aktiv' || entry.status === 'rueckgabe_beantragt') {
    return false;
  }
  // Historie-Einträge (ohne status) sind immer abgeschlossen
  if (!entry.status) {
    return true;
  }
  // Fallback: Pruefe tatsaechliche_rueckgabe
  if (entry.tatsaechliche_rueckgabe) {
    const val = String(entry.tatsaechliche_rueckgabe).trim();
    return val !== '' && val !== 'null' && val !== 'undefined';
  }
  return false;
}

export function UserHistoryDialog({ username, history, isLoading = false, onClose }: UserHistoryDialogProps) {
  const validHistory = history.filter(entry => entry.id && (entry.ware?.name || entry.ware_name));

  const sortedHistory = [...validHistory].sort((a, b) => {
    const dateA = new Date(a.ausgeliehen_am || 0).getTime();
    const dateB = new Date(b.ausgeliehen_am || 0).getTime();
    return dateB - dateA;
  });

  const currentBorrowings = sortedHistory.filter(h => !isReturned(h));
  const returnedBorrowings = sortedHistory.filter(h => isReturned(h));
  
  // Aktive Ausleihen unterteilen in "aktiv" und "rueckgabe beantragt"
  const activeBorrowings = currentBorrowings.filter(h => h.status !== 'rueckgabe_beantragt');
  const pendingReturnBorrowings = currentBorrowings.filter(h => h.status === 'rueckgabe_beantragt');

  const getWareName = (entry: HistoryEntry): string => entry.ware?.name || entry.ware_name || 'Unbekannte Ware';

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 flex-shrink-0">
          <div>
            <h2 className="text-xl font-semibold text-teal-700 mb-1 flex items-center gap-2">
              <HistoryIcon className="w-6 h-6" />
              Meine Ausleihhistorie
            </h2>
            <p className="text-sm text-gray-600">{username}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors p-2 rounded-lg hover:bg-gray-100 flex-shrink-0">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 min-h-0">
          {isLoading ? (
            <div className="text-center py-12">
              <div className="animate-spin w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full mx-auto mb-4" />
              <p className="text-gray-600">Lade Historie...</p>
            </div>
          ) : sortedHistory.length === 0 ? (
            <div className="text-center py-12">
              <HistoryIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-600">Keine Ausleihen vorhanden</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Aktuelle Ausleihen (Status: aktiv) */}
              {activeBorrowings.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Aktuell ausgeliehen ({activeBorrowings.length})
                  </h3>
                  <div className="space-y-3">
                    {activeBorrowings.map((entry) => (
                      <div key={entry.id} className="border-2 border-orange-200 bg-orange-50 rounded-lg p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3 min-w-0">
                            <Package className="w-5 h-5 text-orange-600 flex-shrink-0" />
                            <div className="min-w-0">
                              <p className="font-medium text-gray-900 truncate">{getWareName(entry)}</p>
                              {entry.ware_kategorie && <p className="text-xs text-gray-500">{entry.ware_kategorie}</p>}
                            </div>
                          </div>
                          <span className="px-2 py-1 bg-orange-100 text-orange-700 text-xs rounded-full flex-shrink-0 ml-2">Aktiv</span>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <span className="text-gray-500">Ausgeliehen:</span>
                            <p className="text-gray-900">{formatDate(entry.ausgeliehen_am)}</p>
                          </div>
                          <div>
                            <span className="text-gray-500">Rueckgabe bis:</span>
                            <p className="text-gray-900">{formatDate(entry.geplante_rueckgabe)}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Beantragte Rueckgaben */}
              {pendingReturnBorrowings.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Rueckgabe beantragt ({pendingReturnBorrowings.length})
                  </h3>
                  <div className="space-y-3">
                    {pendingReturnBorrowings.map((entry) => (
                      <div key={entry.id} className="border-2 border-blue-200 bg-blue-50 rounded-lg p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3 min-w-0">
                            <Package className="w-5 h-5 text-blue-600 flex-shrink-0" />
                            <div className="min-w-0">
                              <p className="font-medium text-gray-900 truncate">{getWareName(entry)}</p>
                              {entry.ware_kategorie && <p className="text-xs text-gray-500">{entry.ware_kategorie}</p>}
                            </div>
                          </div>
                          <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full flex-shrink-0 ml-2">Beantragt</span>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <span className="text-gray-500">Ausgeliehen:</span>
                            <p className="text-gray-900">{formatDate(entry.ausgeliehen_am)}</p>
                          </div>
                          <div>
                            <span className="text-gray-500">Rueckgabe bis:</span>
                            <p className="text-gray-900">{formatDate(entry.geplante_rueckgabe)}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Zurueckgegebene Ausleihen */}
              {returnedBorrowings.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" />
                    Zurueckgegeben ({returnedBorrowings.length})
                  </h3>
                  <div className="space-y-3">
                    {returnedBorrowings.map((entry) => (
                      <div key={entry.id} className="border border-gray-200 bg-white rounded-lg p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3 min-w-0">
                            <Package className="w-5 h-5 text-gray-400 flex-shrink-0" />
                            <div className="min-w-0">
                              <p className="font-medium text-gray-900 truncate">{getWareName(entry)}</p>
                              {entry.ware_kategorie && <p className="text-xs text-gray-500">{entry.ware_kategorie}</p>}
                            </div>
                          </div>
                          <span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-xs rounded-full flex-shrink-0 ml-2">Zurueckgegeben</span>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <span className="text-gray-500">Ausgeliehen:</span>
                            <p className="text-gray-900">{formatDate(entry.ausgeliehen_am)}</p>
                          </div>
                          <div>
                            <span className="text-gray-500">Zurueckgegeben:</span>
                            <p className="text-gray-900">{formatDate(entry.tatsaechliche_rueckgabe)}</p>
                          </div>
                          {entry.zustand && (
                            <div>
                              <span className="text-gray-500">Zustand:</span>
                              <p className="text-gray-900">{entry.zustand}</p>
                            </div>
                          )}
                          {entry.genehmigt_von && (
                            <div>
                              <span className="text-gray-500">Quittiert von:</span>
                              <p className="text-gray-900">{entry.genehmigt_von}</p>
                            </div>
                          )}
                        </div>
                        {entry.verbleib_ort && (
                          <div className="mt-2 text-sm">
                            <span className="text-gray-500">Verbleib:</span>
                            <p className="text-gray-900">{entry.verbleib_ort}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end p-6 border-t border-gray-200 flex-shrink-0">
          <button onClick={onClose} className="px-6 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium">
            Schliessen
          </button>
        </div>
      </div>
    </div>
  );
}
