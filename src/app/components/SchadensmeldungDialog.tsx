import { useState, useEffect } from 'react';
import { AlertTriangle, Check, X, Package } from 'lucide-react';
import { schadensmeldungApi } from '../api';
import type { Item } from './ItemDialog';

interface SchadensmeldungDialogProps {
  items: Item[];
  ausleiheIds?: string[];
  isOpen: boolean;
  onClose: () => void;
  onSubmit: () => void;
  mode: 'student' | 'mitarbeiter' | 'mitarbeiter-direct' | 'return' | 'mitarbeiter-return';
  existingMeldungen?: Array<{
    id: string;
    ware_id: string;
    ware_name: string;
    beschreibung: string;
    rueckgeber?: { id: string; name: string };
    erstellt_am: string;
  }>;
  // Map von Item-ID zu Ausleihe-ID für korrekte Zuordnung
  itemAusleiheMap?: Record<string, string>;
}

export function SchadensmeldungDialog({
  items,
  ausleiheIds,
  itemAusleiheMap,
  isOpen,
  onClose,
  onSubmit,
  mode,
  existingMeldungen = []
}: SchadensmeldungDialogProps) {
  const [unbeschaedigt, setUnbeschaedigt] = useState(false);
  const [schadensmeldungen, setSchadensmeldungen] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Bestehende Meldungen beim Öffnen in den State laden (bearbeitbar)
  useEffect(() => {
    if (isOpen && existingMeldungen.length > 0) {
      const initialMeldungen: Record<string, string> = {};
      existingMeldungen.forEach(meldung => {
        initialMeldungen[meldung.ware_id] = meldung.beschreibung;
      });
      setSchadensmeldungen(initialMeldungen);
    }
  }, [isOpen, existingMeldungen]);

  if (!isOpen) return null;

  const handleSchadenChange = (itemId: string, beschreibung: string) => {
    setSchadensmeldungen(prev => ({
      ...prev,
      [itemId]: beschreibung
    }));
  };

  const handleSubmit = async () => {
    setError(null);
    setIsSubmitting(true);

    try {
      if (mode === 'student' || mode === 'return') {
        // Student/Rückgabe: Wenn unbeschädigt, nichts zu tun
        // Wenn Schaden, für jede Ware mit Beschreibung eine Meldung erstellen
        if (!unbeschaedigt) {
          const itemsMitSchaden = items.filter(item => schadensmeldungen[item.id]?.trim());
          
          if (itemsMitSchaden.length === 0) {
            setError('Bitte geben Sie für mindestens eine Ware eine Schadensbeschreibung ein.');
            setIsSubmitting(false);
            return;
          }

          for (const item of itemsMitSchaden) {
            // Verwende die spezifische Ausleihe-ID für dieses Item
            const ausleiheId = itemAusleiheMap?.[item.id] || item.borrowingId || ausleiheIds?.[0];
            await schadensmeldungApi.create({
              ware_id: item.id,
              beschreibung: schadensmeldungen[item.id],
              ausleihe_id: ausleiheId
            });
          }
        }
      } else if (mode === 'mitarbeiter') {
        // Mitarbeiter: Quittierte Meldungen aktualisieren
        for (const meldung of existingMeldungen) {
          const beschreibung = schadensmeldungen[meldung.ware_id] || '';
          await schadensmeldungApi.quittieren(meldung.id, beschreibung);
        }
      } else if (mode === 'mitarbeiter-direct' || mode === 'mitarbeiter-return') {
        // Mitarbeiter direkt oder Return View: Neue Meldung erstellen (sofort quittiert)
        const itemsMitSchaden = items.filter(item => schadensmeldungen[item.id]?.trim());
        
        // Bei bestehenden Meldungen diese auch quittieren
        for (const meldung of existingMeldungen) {
          const beschreibung = schadensmeldungen[meldung.ware_id] || '';
          await schadensmeldungApi.quittieren(meldung.id, beschreibung);
        }
        
        // Neue Meldungen erstellen
        for (const item of itemsMitSchaden) {
          const ausleiheId = itemAusleiheMap?.[item.id] || item.borrowingId || ausleiheIds?.[0];
          await schadensmeldungApi.create({
            ware_id: item.id,
            beschreibung: schadensmeldungen[item.id],
            ausleihe_id: ausleiheId
          });
        }
      }

      onSubmit();
    } catch (err: any) {
      setError(err.message || 'Fehler beim Speichern der Schadensmeldungen');
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasSchaden = (itemId: string) => !!schadensmeldungen[itemId]?.trim();

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 rounded-lg">
              <AlertTriangle className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                {mode === 'return' ? 'Zustand der Waren' : mode === 'mitarbeiter' ? 'Schadensmeldungen quittieren' : mode === 'mitarbeiter-return' ? 'Schadensmeldung erstellen' : 'Schaden melden'}
              </h2>
              <p className="text-sm text-gray-500">
                {mode === 'return' 
                  ? `${items.length} Ware(n) werden zurückgegeben`
                  : mode === 'mitarbeiter' 
                  ? `${existingMeldungen.length} offene Meldung(en)`
                  : mode === 'mitarbeiter-return'
                  ? `${items.length} Ware(n) werden quittiert`
                  : `${items.length} Ware(n) ausgewählt`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Error */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <span className="text-red-700 text-sm">{error}</span>
            </div>
          )}

          {mode === 'return' ? (
            /* Rückgabe View - für alle Rollen gleich */
            <>
              {/* Haupt-Checkbox */}
              <label className="flex items-start gap-3 p-4 bg-emerald-50 rounded-lg cursor-pointer hover:bg-emerald-100 transition-colors">
                <input
                  type="checkbox"
                  checked={unbeschaedigt}
                  onChange={(e) => setUnbeschaedigt(e.target.checked)}
                  className="w-8 h-8 mt-0.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                />
                <div>
                  <p className="font-medium text-emerald-900">
                    Alle Waren sind unbeschädigt
                  </p>
                  <p className="text-sm text-emerald-700 mt-1">
                    Setzen Sie den Haken, falls alle Waren unbeschädigt sind. Andernfalls beschreiben Sie den Schaden unten.
                  </p>
                </div>
              </label>

              {/* Schadensmeldungen pro Ware - nur bearbeitbar wenn nicht unbeschädigt */}
              {!unbeschaedigt && (
                <div className="space-y-4">
                  <p className="text-sm text-gray-600 font-medium">
                    Bitte beschreiben Sie den Schaden für die betroffenen Waren:
                  </p>
                  {items.map(item => (
                    <div 
                      key={item.id}
                      className={`p-4 border rounded-lg ${hasSchaden(item.id) ? 'border-amber-300 bg-amber-50' : 'border-gray-200'}`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Package className="w-4 h-4 text-gray-500" />
                        <span className="font-medium text-gray-900">{item.name}</span>
                        {hasSchaden(item.id) && (
                          <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full">
                            Schaden gemeldet
                          </span>
                        )}
                      </div>
                      <textarea
                        value={schadensmeldungen[item.id] || ''}
                        onChange={(e) => handleSchadenChange(item.id, e.target.value)}
                        placeholder="Beschreibung des Schadens (z.B. Kratzer am Display, USB-Port defekt...)"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                        rows={2}
                      />
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : mode === 'mitarbeiter' ? (
            /* Mitarbeiter Quittieren View */
            <>
              <div className="space-y-4">
                {existingMeldungen.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">
                    Keine offenen Schadensmeldungen
                  </p>
                ) : (
                  existingMeldungen.map(meldung => (
                    <div 
                      key={meldung.id}
                      className="p-4 border border-amber-300 bg-amber-50 rounded-lg"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Package className="w-4 h-4 text-amber-600" />
                        <span className="font-medium text-amber-900">{meldung.ware_name}</span>
                      </div>
                      
                      <div className="mb-2 flex items-center gap-2 text-xs text-gray-500">
                        <span>Gemeldet von {meldung.rueckgeber?.name || 'Unbekannt'}</span>
                      </div>
                      
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Schadensbeschreibung (bearbeitbar):
                      </label>
                      <textarea
                        value={schadensmeldungen[meldung.ware_id] || ''}
                        onChange={(e) => handleSchadenChange(meldung.ware_id, e.target.value)}
                        placeholder="Beschreibung des Schadens..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                        rows={3}
                      />
                    </div>
                  ))
                )}
              </div>
            </>
          ) : mode === 'mitarbeiter-return' ? (
            /* Mitarbeiter Return View - Direkte Schadensmeldung ohne Checkbox */
            <>
              {/* Bestehende offene Meldungen - bearbeitbar */}
              {existingMeldungen.length > 0 && (
                <div className="space-y-4 mb-6">
                  <p className="text-sm font-medium text-amber-700">
                    Bereits gemeldete Schäden (bearbeiten und quittieren):
                  </p>
                  {existingMeldungen.map(meldung => (
                    <div 
                      key={meldung.id}
                      className="p-4 border border-amber-300 bg-amber-50 rounded-lg"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Package className="w-4 h-4 text-amber-600" />
                        <span className="font-medium text-amber-900">{meldung.ware_name}</span>
                      </div>
                      <div className="mb-2 flex items-center gap-2 text-xs text-gray-500">
                        <span>Gemeldet von {meldung.rueckgeber?.name || 'Unbekannt'}</span>
                      </div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Schadensbeschreibung (bearbeitbar):
                      </label>
                      <textarea
                        value={schadensmeldungen[meldung.ware_id] || ''}
                        onChange={(e) => handleSchadenChange(meldung.ware_id, e.target.value)}
                        placeholder="Beschreibung des Schadens..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                        rows={3}
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Neue Schadensmeldungen für alle Items */}
              <div className="space-y-4">
                <p className="text-sm font-medium text-gray-700">
                  Neue Schadensmeldung:
                </p>
                {items.map(item => (
                  <div 
                    key={item.id}
                    className={`p-4 border rounded-lg ${hasSchaden(item.id) ? 'border-amber-300 bg-amber-50' : 'border-gray-200'}`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Package className="w-4 h-4 text-gray-500" />
                      <span className="font-medium text-gray-900">{item.name}</span>
                      {hasSchaden(item.id) && (
                        <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full">
                          Schaden gemeldet
                        </span>
                      )}
                    </div>
                    <textarea
                      value={schadensmeldungen[item.id] || ''}
                      onChange={(e) => handleSchadenChange(item.id, e.target.value)}
                      placeholder="Beschreibung des Schadens (optional, falls vorhanden...)"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                      rows={2}
                    />
                  </div>
                ))}
              </div>
            </>
          ) : (
            /* Mitarbeiter Direct View (Neue Meldung aus Inventar) */
            <>
              <div className="space-y-4">
                <p className="text-sm text-gray-600">
                  Beschreiben Sie den Schaden für die ausgewählte Ware:
                </p>
                {items.map(item => (
                  <div 
                    key={item.id}
                    className={`p-4 border rounded-lg ${hasSchaden(item.id) ? 'border-amber-300 bg-amber-50' : 'border-gray-200'}`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Package className="w-4 h-4 text-gray-500" />
                      <span className="font-medium text-gray-900">{item.name}</span>
                      {hasSchaden(item.id) && (
                        <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full">
                          Schaden gemeldet
                        </span>
                      )}
                    </div>
                    <textarea
                      value={schadensmeldungen[item.id] || ''}
                      onChange={(e) => handleSchadenChange(item.id, e.target.value)}
                      placeholder="Beschreibung des Schadens (z.B. Kratzer am Display, USB-Port defekt...)"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                      rows={3}
                    />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Abbrechen
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {isSubmitting ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Speichern...
              </>
            ) : mode === 'return' ? (
              <>
                <Check className="w-4 h-4" />
                Rückgabe beantragen
              </>
            ) : mode === 'mitarbeiter' ? (
              <>
                <Check className="w-4 h-4" />
                Quittieren
              </>
            ) : mode === 'mitarbeiter-return' ? (
              <>
                <Check className="w-4 h-4" />
                Quittieren mit Schadensmeldung
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                Schaden melden
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
