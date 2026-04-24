import { useState, useEffect } from 'react';
import { ArrowLeft, BarChart3, Package, Users, Clock, AlertTriangle, TrendingUp, Calendar, Award } from 'lucide-react';
import { statistikApi, type StatistikResponse } from '../api';
import { DatePicker } from './DatePicker';

interface StatisticsViewProps {
  userRole: string;
  username: string;
  onBack: () => void;
}

const ZUSTAND_LABELS: Record<string, string> = {
  'gut': 'Gut',
  'gebraucht': 'Gebraucht',
  'beschaedigt': 'Beschädigt',
  'schwer_beschaedigt': 'Schwer beschädigt',
  'verloren': 'Verloren',
};

const ZUSTAND_COLORS: Record<string, string> = {
  'gut': 'bg-emerald-500',
  'gebraucht': 'bg-blue-500',
  'beschaedigt': 'bg-amber-500',
  'schwer_beschaedigt': 'bg-orange-500',
  'verloren': 'bg-red-500',
};

function formatDateLocal(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  return `${d}.${m}.${y}`;
}

// =============================================================================
// STATISTICS VIEW
// =============================================================================
export function StatisticsView({ userRole, username, onBack }: StatisticsViewProps) {
  const [stats, setStats] = useState<StatistikResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zeitraum, setZeitraum] = useState({
    von: new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0],
    bis: new Date().toISOString().split('T')[0],
  });

  const loadStats = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await statistikApi.getAll({
        von: zeitraum.von,
        bis: zeitraum.bis,
      });
      setStats(data);
    } catch (err: any) {
      setError(err.message || 'Fehler beim Laden der Statistiken');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, [zeitraum.von, zeitraum.bis]);

  const handleQuickFilter = (type: 'thisYear' | 'lastYear' | 'last30days' | 'all') => {
    const now = new Date();
    if (type === 'thisYear') {
      setZeitraum({
        von: new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0],
        bis: now.toISOString().split('T')[0],
      });
    } else if (type === 'lastYear') {
      setZeitraum({
        von: new Date(now.getFullYear() - 1, 0, 1).toISOString().split('T')[0],
        bis: new Date(now.getFullYear() - 1, 11, 31).toISOString().split('T')[0],
      });
    } else if (type === 'last30days') {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      setZeitraum({
        von: d.toISOString().split('T')[0],
        bis: now.toISOString().split('T')[0],
      });
    } else if (type === 'all') {
      setZeitraum({
        von: '2020-01-01',
        bis: now.toISOString().split('T')[0],
      });
    }
  };

  const totalDamaged = stats
    ? (stats.zustand_verteilung['beschaedigt'] || 0)
      + (stats.zustand_verteilung['schwer_beschaedigt'] || 0)
      + (stats.zustand_verteilung['verloren'] || 0)
    : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-emerald-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-40">
        <div className="w-full px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <BarChart3 className="w-8 h-8 text-teal-600" />
            <h1 className="text-teal-700">Ausleihsystem - Statistiken</h1>
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

      <main className="w-full px-6 lg:px-8 py-6 max-w-7xl mx-auto">
        {/* Zeitraum-Auswahl */}
        <div className="bg-white rounded-lg shadow-sm border p-4 mb-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-teal-600" />
              <span className="text-sm font-medium text-gray-700">Zeitraum:</span>
            </div>
            <div className="flex items-center gap-2">
              <DatePicker
                value={zeitraum.von}
                onChange={(iso) => setZeitraum(prev => ({ ...prev, von: iso }))}
                placeholder="Von"
              />
              <span className="text-gray-400">bis</span>
              <DatePicker
                value={zeitraum.bis}
                onChange={(iso) => setZeitraum(prev => ({ ...prev, bis: iso }))}
                placeholder="Bis"
              />
            </div>
            <div className="flex gap-2 ml-auto">
              <button onClick={() => handleQuickFilter('thisYear')} className="px-3 py-1.5 text-sm bg-teal-50 text-teal-700 rounded-lg hover:bg-teal-100 transition-colors">Dieses Jahr</button>
              <button onClick={() => handleQuickFilter('lastYear')} className="px-3 py-1.5 text-sm bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors">Letztes Jahr</button>
              <button onClick={() => handleQuickFilter('last30days')} className="px-3 py-1.5 text-sm bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors">Letzte 30 Tage</button>
              <button onClick={() => handleQuickFilter('all')} className="px-3 py-1.5 text-sm bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors">Gesamt</button>
            </div>
          </div>
          {stats && (
            <p className="text-xs text-gray-400 mt-2">
              Zeitraum: {formatDateLocal(stats.zeitraum.von)} – {formatDateLocal(stats.zeitraum.bis)}
            </p>
          )}
        </div>

        {isLoading && (
          <div className="text-center py-12">
            <div className="animate-spin w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-gray-600">Statistiken werden geladen...</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-red-700">
            {error}
          </div>
        )}

        {!isLoading && stats && (
          <>
            {/* KPI-Karten */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div className="bg-white rounded-lg shadow-sm border p-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-teal-100 rounded-lg">
                    <Package className="w-5 h-5 text-teal-600" />
                  </div>
                  <span className="text-sm text-gray-500">Gesamt Ausleihen</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">{stats.gesamt_ausleihen}</p>
              </div>

              <div className="bg-white rounded-lg shadow-sm border p-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-orange-100 rounded-lg">
                    <Clock className="w-5 h-5 text-orange-600" />
                  </div>
                  <span className="text-sm text-gray-500">Aktuell ausgeliehen</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">{stats.aktuell_ausgeliehen}</p>
              </div>

              <div className="bg-white rounded-lg shadow-sm border p-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-red-100 rounded-lg">
                    <AlertTriangle className="w-5 h-5 text-red-600" />
                  </div>
                  <span className="text-sm text-gray-500">Beschädigt / Verloren</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">{totalDamaged}</p>
              </div>

              <div className="bg-white rounded-lg shadow-sm border p-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <TrendingUp className="w-5 h-5 text-blue-600" />
                  </div>
                  <span className="text-sm text-gray-500">Ø Verspätung</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">{stats.durchschnittliche_verspaetung_tage} Tage</p>
              </div>
            </div>

            {/* Tabellen-Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Top Ausleiher */}
              <div className="bg-white rounded-lg shadow-sm border p-4">
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Users className="w-5 h-5 text-teal-600" />
                  Top Ausleiher
                </h2>
                {stats.top_ausleiher.length === 0 ? (
                  <p className="text-sm text-gray-400">Keine Daten</p>
                ) : (
                  <div className="space-y-2">
                    {stats.top_ausleiher.map((a, i) => (
                      <div key={a.benutzer_email} className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50">
                        <div className="flex items-center gap-3">
                          <span className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold ${
                            i === 0 ? 'bg-amber-100 text-amber-700' :
                            i === 1 ? 'bg-gray-200 text-gray-700' :
                            i === 2 ? 'bg-orange-100 text-orange-700' :
                            'bg-gray-100 text-gray-500'
                          }`}>{i + 1}</span>
                          <div>
                            <p className="text-sm font-medium text-gray-900">{a.benutzer_name}</p>
                            <p className="text-xs text-gray-400">{a.benutzer_email}</p>
                          </div>
                        </div>
                        <span className="text-sm font-semibold text-teal-700">{a.anzahl}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Top Waren */}
              <div className="bg-white rounded-lg shadow-sm border p-4">
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Package className="w-5 h-5 text-teal-600" />
                  Top Waren
                </h2>
                {stats.top_waren.length === 0 ? (
                  <p className="text-sm text-gray-400">Keine Daten</p>
                ) : (
                  <div className="space-y-2">
                    {stats.top_waren.map((w, i) => (
                      <div key={w.ware_name} className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50">
                        <div className="flex items-center gap-3">
                          <span className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold ${
                            i === 0 ? 'bg-amber-100 text-amber-700' :
                            i === 1 ? 'bg-gray-200 text-gray-700' :
                            i === 2 ? 'bg-orange-100 text-orange-700' :
                            'bg-gray-100 text-gray-500'
                          }`}>{i + 1}</span>
                          <div>
                            <p className="text-sm font-medium text-gray-900">{w.ware_name}</p>
                            {w.ware_kategorie && <p className="text-xs text-gray-400">{w.ware_kategorie}</p>}
                          </div>
                        </div>
                        <span className="text-sm font-semibold text-teal-700">{w.anzahl}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Top Kategorien */}
              <div className="bg-white rounded-lg shadow-sm border p-4">
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Award className="w-5 h-5 text-teal-600" />
                  Top Kategorien
                </h2>
                {stats.top_kategorien.length === 0 ? (
                  <p className="text-sm text-gray-400">Keine Daten</p>
                ) : (
                  <div className="space-y-2">
                    {stats.top_kategorien.map((k, i) => (
                      <div key={k.kategorie} className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50">
                        <div className="flex items-center gap-3">
                          <span className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold ${
                            i === 0 ? 'bg-amber-100 text-amber-700' :
                            i === 1 ? 'bg-gray-200 text-gray-700' :
                            i === 2 ? 'bg-orange-100 text-orange-700' :
                            'bg-gray-100 text-gray-500'
                          }`}>{i + 1}</span>
                          <p className="text-sm font-medium text-gray-900">{k.kategorie}</p>
                        </div>
                        <span className="text-sm font-semibold text-teal-700">{k.anzahl}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Zustands-Verteilung */}
              <div className="bg-white rounded-lg shadow-sm border p-4">
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-teal-600" />
                  Zustands-Verteilung
                </h2>
                {Object.keys(stats.zustand_verteilung).length === 0 ? (
                  <p className="text-sm text-gray-400">Keine Daten</p>
                ) : (
                  <div className="space-y-3">
                    {Object.entries(stats.zustand_verteilung)
                      .sort(([,a], [,b]) => b - a)
                      .map(([zustand, anzahl]) => {
                        const total = stats.gesamt_ausleihen || 1;
                        const pct = Math.round((anzahl / total) * 100);
                        return (
                          <div key={zustand}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm text-gray-700">{ZUSTAND_LABELS[zustand] || zustand}</span>
                              <span className="text-sm font-medium text-gray-900">{anzahl} ({pct}%)</span>
                            </div>
                            <div className="w-full bg-gray-100 rounded-full h-2">
                              <div className={`h-2 rounded-full ${ZUSTAND_COLORS[zustand] || 'bg-gray-400'}`} style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>

              {/* Top Verspätungen */}
              <div className="bg-white rounded-lg shadow-sm border p-4">
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-teal-600" />
                  Top Verspätungen
                </h2>
                {stats.top_verspaetungen.length === 0 ? (
                  <p className="text-sm text-gray-400">Keine Verspätungen</p>
                ) : (
                  <div className="space-y-2">
                    {stats.top_verspaetungen.map((v, i) => (
                      <div key={v.benutzer_name} className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50">
                        <div className="flex items-center gap-3">
                          <span className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold ${
                            i === 0 ? 'bg-amber-100 text-amber-700' :
                            i === 1 ? 'bg-gray-200 text-gray-700' :
                            i === 2 ? 'bg-orange-100 text-orange-700' :
                            'bg-gray-100 text-gray-500'
                          }`}>{i + 1}</span>
                          <div>
                            <p className="text-sm font-medium text-gray-900">{v.benutzer_name}</p>
                            <p className="text-xs text-gray-400">Max. {v.max_verspaetung_tage} Tage</p>
                          </div>
                        </div>
                        <span className="text-sm font-semibold text-orange-600">{v.anzahl_verspaetet}x</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Top Beschädiger */}
              <div className="bg-white rounded-lg shadow-sm border p-4">
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-teal-600" />
                  Top Beschädiger
                </h2>
                {stats.top_beschaediger.length === 0 ? (
                  <p className="text-sm text-gray-400">Keine Beschädigungen</p>
                ) : (
                  <div className="space-y-2">
                    {stats.top_beschaediger.map((b, i) => (
                      <div key={b.benutzer_name} className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50">
                        <div className="flex items-center gap-3">
                          <span className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold ${
                            i === 0 ? 'bg-amber-100 text-amber-700' :
                            i === 1 ? 'bg-gray-200 text-gray-700' :
                            i === 2 ? 'bg-orange-100 text-orange-700' :
                            'bg-gray-100 text-gray-500'
                          }`}>{i + 1}</span>
                          <p className="text-sm font-medium text-gray-900">{b.benutzer_name}</p>
                        </div>
                        <span className="text-sm font-semibold text-red-600">{b.anzahl_beschaedigt}x</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
