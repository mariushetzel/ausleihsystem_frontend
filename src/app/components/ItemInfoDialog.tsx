import { useState, useEffect } from 'react';
import { X, Package, Wifi, MapPin, Calendar, User, Clock, Tag, Info, XCircle, AlertTriangle, AlertOctagon, Edit, History, Wrench } from 'lucide-react';
import { type Ware, schadensmeldungApi, type Schadensmeldung, TokenManager } from '../api';

interface ItemInfoDialogProps {
  item: Ware | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit?: () => void;
  onShowHistory?: () => void;
  onReportDamage?: () => void;
}

export function ItemInfoDialog({ item, isOpen, onClose, onEdit, onShowHistory, onReportDamage }: ItemInfoDialogProps) {
  const [schadensmeldungen, setSchadensmeldungen] = useState<Schadensmeldung[]>([]);
  const [isLoadingSchaden, setIsLoadingSchaden] = useState(false);

  // User-Rolle aus Token auslesen
  const tokenManager = new TokenManager();
  const currentUser = tokenManager.getCurrentUser();
  const userRole = currentUser?.role || '';
  const isStaff = userRole === 'Mitarbeiter' || userRole === 'Laborleiter' || userRole === 'Admin';

  useEffect(() => {
    if (isOpen && item) {
      setIsLoadingSchaden(true);
      schadensmeldungApi.getByWare(item.id)
        .then(data => setSchadensmeldungen(data))
        .catch(() => setSchadensmeldungen([]))
        .finally(() => setIsLoadingSchaden(false));
    }
  }, [isOpen, item]);

  if (!isOpen || !item) return null;

  const formatDate = (dateStr: string | undefined | null) => {
    if (!dateStr) return '-';
    try {
      const date = new Date(dateStr);
      return date.toLocaleString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
  };

  const formatDateShort = (dateStr: string | undefined | null) => {
    if (!dateStr) return '-';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };

  const offeneMeldungen = schadensmeldungen.filter(m => !m.quittiert);

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-teal-100 rounded-lg">
              <Package className="w-6 h-6 text-teal-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{item.name}</h2>
              <p className="text-sm text-gray-500 break-all">ID: {item.id}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Status Badges */}
          <div className="flex gap-2 flex-wrap">
            {item.ist_ausgeliehen ? (
              <span className="inline-flex items-center gap-1 px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-sm font-medium">
                <AlertTriangle className="w-4 h-4" />
                Ausgeliehen
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-sm font-medium">
                Verfügbar
              </span>
            )}
            {item.ist_gesperrt && (
              <span className="inline-flex items-center gap-1 px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-medium">
                <XCircle className="w-4 h-4" />
                Gesperrt
              </span>
            )}
            {item.rfid_tag && (
              <span className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
                <Wifi className="w-4 h-4" />
                RFID
              </span>
            )}
          </div>

          {/* Aktuelle Ausleihe-Info (nur für Mitarbeiter+) */}
          {isStaff && item.aktuelle_ausleihe && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-semibold text-orange-800 flex items-center gap-2">
                <User className="w-4 h-4" />
                Aktuelle Ausleihe
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-orange-600">Ausleiher</p>
                  <p className="text-sm font-medium text-gray-900">{item.aktuelle_ausleihe.benutzer_name}</p>
                  <p className="text-xs text-gray-500">{item.aktuelle_ausleihe.benutzer_email}</p>
                </div>
                <div>
                  <p className="text-xs text-orange-600">Verbleib</p>
                  <p className="text-sm font-medium text-gray-900">{item.aktuelle_ausleihe.verbleib_ort || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-orange-600">Ausgeliehen am</p>
                  <p className="text-sm font-medium text-gray-900">{formatDateShort(item.aktuelle_ausleihe.ausgeliehen_am)}</p>
                </div>
                <div>
                  <p className="text-xs text-orange-600">Rückgabe bis</p>
                  <p className="text-sm font-medium text-gray-900">{formatDateShort(item.aktuelle_ausleihe.geplante_rueckgabe)}</p>
                </div>
              </div>
              {item.aktuelle_ausleihe.status === 'rueckgabe_beantragt' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs font-medium">
                  Rückgabe beantragt
                </span>
              )}
            </div>
          )}

          {/* Beschreibung */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
              <Info className="w-4 h-4 text-teal-600" />
              Beschreibung
            </h3>
            <p className="text-gray-600 bg-gray-50 p-3 rounded-lg">
              {item.beschreibung || 'Keine Beschreibung vorhanden'}
            </p>
          </div>

          {/* Kategorien */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
              <Tag className="w-4 h-4 text-teal-600" />
              Kategorien
            </h3>
            <div className="flex flex-wrap gap-2">
              {item.kategorien && item.kategorien.length > 0 ? (
                [...item.kategorien].sort((a, b) => a.name.localeCompare(b.name)).map((cat) => (
                  <span key={cat.id} className="px-3 py-1 bg-teal-50 text-teal-700 rounded-full text-sm">
                    {cat.name}
                  </span>
                ))
              ) : (
                <span className="text-gray-400 text-sm">Keine Kategorien zugewiesen</span>
              )}
            </div>
          </div>

          {/* RFID + Schrank */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-50 p-3 rounded-lg">
              <h3 className="text-xs font-medium text-gray-500 mb-1 flex items-center gap-1">
                <Wifi className="w-3 h-3" />
                RFID-Tag
              </h3>
              <p className="text-sm text-gray-900 font-mono">{item.rfid_tag || 'Nicht zugewiesen'}</p>
            </div>
            <div className="bg-gray-50 p-3 rounded-lg">
              <h3 className="text-xs font-medium text-gray-500 mb-1 flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                Schranknummer
              </h3>
              <p className="text-sm text-gray-900">{item.schranknummer || 'Nicht zugewiesen'}</p>
            </div>
          </div>

          {/* Schadensmeldungen (für ALLE sichtbar) */}
          <div className="border-t border-gray-200 pt-4">
            <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
              <AlertOctagon className="w-4 h-4 text-amber-600" />
              Schadensmeldungen
              {offeneMeldungen.length > 0 && (
                <span className="ml-2 px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full">
                  {offeneMeldungen.length} offen
                </span>
              )}
              {schadensmeldungen.length === 0 && !isLoadingSchaden && (
                <span className="ml-2 text-xs text-gray-400 font-normal">Keine Meldungen</span>
              )}
            </h3>
            <div className="space-y-3 max-h-48 overflow-y-auto">
              {isLoadingSchaden ? (
                <p className="text-sm text-gray-500">Lade Schadensmeldungen...</p>
              ) : schadensmeldungen.length === 0 ? (
                <p className="text-sm text-gray-400">Keine Schadensmeldungen vorhanden.</p>
              ) : (
                schadensmeldungen.map((meldung) => (
                  <div key={meldung.id} className={`p-3 rounded-lg text-sm ${meldung.quittiert ? 'bg-gray-50 border border-gray-200' : 'bg-amber-50 border border-amber-200'}`}>
                    <div className="flex items-start justify-between mb-1">
                      <span className={`font-medium ${meldung.quittiert ? 'text-gray-700' : 'text-amber-800'}`}>
                        {meldung.quittiert ? 'Quittiert' : 'Offen'}
                      </span>
                      <span className="text-xs text-gray-500">{formatDate(meldung.erstellt_am)}</span>
                    </div>
                    <p className="text-gray-700 mb-1">{meldung.beschreibung}</p>
                    {meldung.rueckgeber && (
                      <p className="text-xs text-gray-500">Gemeldet von: {meldung.rueckgeber.name}</p>
                    )}
                    {meldung.quittiert && meldung.quittierer && (
                      <p className="text-xs text-gray-500 mt-1">Quittiert von: {meldung.quittierer.name} am {formatDate(meldung.quittiert_am)}</p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Footer mit Buttons */}
        <div className="flex justify-between items-center p-4 border-t border-gray-200 bg-gray-50">
          {isStaff ? (
            <div className="flex gap-2">
              {onEdit && (
                <button
                  onClick={() => { onEdit(); onClose(); }}
                  className="flex items-center gap-1.5 px-3 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors text-sm font-medium"
                >
                  <Edit className="w-4 h-4" />
                  Bearbeiten
                </button>
              )}
              {onReportDamage && (
                <button
                  onClick={() => { onReportDamage(); onClose(); }}
                  className="flex items-center gap-1.5 px-3 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors text-sm font-medium"
                >
                  <Wrench className="w-4 h-4" />
                  Schaden
                </button>
              )}
              {onShowHistory && (
                <button
                  onClick={() => { onShowHistory(); onClose(); }}
                  className="flex items-center gap-1.5 px-3 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm font-medium"
                >
                  <History className="w-4 h-4" />
                  Historie
                </button>
              )}
            </div>
          ) : (
            <div />
          )}
          <button onClick={onClose} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors">
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
}
