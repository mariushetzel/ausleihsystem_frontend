import { useState, useEffect, useRef, useCallback } from 'react';
import { generateUUID } from '../utils/uuid';
import { X, User, Save, Loader2, Lock, CreditCard, Scan, Radio } from 'lucide-react';
import { cardReaderApi, authApi, benutzerApi } from '../api';

// Storage Keys (müssen mit AntennaSettings.tsx übereinstimmen)
const CARD_READER_PORT_KEY = 'cardreader_port';
const CARD_READER_BAUDRATE_KEY = 'cardreader_baudrate';

interface UserProfileDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

interface UserData {
  vorname: string;
  nachname: string;
  email: string;
  rfid_karte: string;
}





export function UserProfileDialog({ isOpen, onClose }: UserProfileDialogProps) {
  const [userData, setUserData] = useState<UserData>({
    vorname: '',
    nachname: '',
    email: '',
    rfid_karte: ''
  });
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'profile' | 'password'>('profile');
  
  // RFID Scan States
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanProgress, setScanProgress] = useState(0);
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isCleaningRef = useRef(false);
  const sessionIdRef = useRef<string>(generateUUID());
  const userIdRef = useRef<string>('user_profile');

  useEffect(() => {
    if (isOpen) {
      loadUserData();
    }
  }, [isOpen]);

  // Cleanup Funktion
  const stopScanning = useCallback(async () => {
    // Verhindern, dass Cleanup zweimal läuft
    if (isCleaningRef.current) return;
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
    
    // Kartenleser stoppen
    try {
      await cardReaderApi.stop(sessionIdRef.current, userIdRef.current);
    } catch (e) {
      // Kartenleser-Stop-Fehler ignorieren
    }
    
    setIsScanning(false);
    setScanProgress(0);
    isCleaningRef.current = false;
  }, []);
  
  // RFID Scan Funktionen (Kartenleser)
  const handleScanRFID = async () => {
    if (isScanning) {
      await stopScanning();
      return;
    }
    
    // Token bei Aktivität aktualisieren
    await authApi.ping().catch(() => {});
    
    setIsScanning(true);
    setScanError(null);
    setScanProgress(0);
    
    // Port und Baudrate aus den globalen Einstellungen laden
    const port = localStorage.getItem(CARD_READER_PORT_KEY) || '/dev/ttyUSB0';
    const baudrate = localStorage.getItem(CARD_READER_BAUDRATE_KEY) || '9600';
    
    try {
      // Kartenleser starten
      const startResult = await cardReaderApi.start(port, parseInt(baudrate), sessionIdRef.current, userIdRef.current);
      if (startResult.session_id) {
        sessionIdRef.current = startResult.session_id;
      }
      if (!startResult.success) {
        throw new Error(startResult.error || 'Fehler beim Starten des Kartenlesers');
      }
      
      const startTime = Date.now();
      
      // Timeout nach 20 Sekunden
      timeoutRef.current = setTimeout(async () => {
        await stopScanning();
        setScanError('Timeout: Keine Karte innerhalb von 20 Sekunden gefunden');
      }, 20000);
      
      // Alle 500ms nach Karten-Daten fragen
      scanIntervalRef.current = setInterval(async () => {
        try {
          // Fortschritt aktualisieren (0-100% über 20s)
          const elapsed = Date.now() - startTime;
          const progress = Math.min((elapsed / 20000) * 100, 100);
          setScanProgress(progress);
          
          const result = await cardReaderApi.getData(sessionIdRef.current, userIdRef.current);
          if (result.success && result.code && result.code !== 'None' && result.code !== ' ' && result.code !== '') {
            // Gefundenen Code verwenden (ohne Null-Bytes)
            const cleanCode = result.code.replace(/\0/g, '').trim();
            if (cleanCode) {
              setUserData(prev => ({ ...prev, rfid_karte: cleanCode }));
              
              // Automatisch stoppen wenn eine Karte gefunden wurde
              await stopScanning();
            }
          }
        } catch (e) {
          // Ignorieren - einfach weiter versuchen
        }
      }, 500);
      
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Scan-Fehler');
      setIsScanning(false);
      setScanProgress(0);
    }
  };
  
  // Cleanup beim Schließen
  useEffect(() => {
    return () => {
      stopScanning();
    };
  }, [stopScanning]);

  const loadUserData = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const data = await authApi.me();
      setUserData({
        vorname: data.vorname || '',
        nachname: data.nachname || '',
        email: data.email || '',
        rfid_karte: data.rfid_karte || ''
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Fehler';
      if (msg === 'SESSION_EXPIRED') return;
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    // Kartenleser stoppen falls aktiv
    await stopScanning();
    
    setIsSaving(true);
    setError(null);
    
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      
      await benutzerApi.update(user.id, userData);
      
      localStorage.setItem('user', JSON.stringify({ ...user, ...userData }));
      setSuccess('Profil aktualisiert!');
      setTimeout(() => { onClose(); setSuccess(null); }, 1500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Fehler';
      if (msg === 'SESSION_EXPIRED') return;
      setError(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      setError('Passwörter stimmen nicht überein');
      return;
    }
    if (newPassword.length < 4) {
      setError('Mindestens 4 Zeichen');
      return;
    }
    
    // Kartenleser stoppen falls aktiv
    await stopScanning();
    
    setIsSaving(true);
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      
      await benutzerApi.update(user.id, { passwort: newPassword });
      
      setSuccess('Passwort geändert!');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => { onClose(); setSuccess(null); }, 1500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Fehler';
      if (msg === 'SESSION_EXPIRED') return;
      setError(msg);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold text-teal-700 flex items-center gap-2">
            <User className="w-6 h-6" />
            Profil bearbeiten
          </h2>
          <button 
            onClick={async () => {
              await stopScanning();
              onClose();
            }} 
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex border-b">
          <button
            onClick={() => setActiveTab('profile')}
            className={`flex-1 py-3 text-sm font-medium ${activeTab === 'profile' ? 'text-teal-600 border-b-2 border-teal-600 bg-teal-50' : 'text-gray-500'}`}
          >
            Profil
          </button>
          <button
            onClick={() => setActiveTab('password')}
            className={`flex-1 py-3 text-sm font-medium ${activeTab === 'password' ? 'text-teal-600 border-b-2 border-teal-600 bg-teal-50' : 'text-gray-500'}`}
          >
            Passwort
          </button>
        </div>

        <div className="p-6">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
            </div>
          ) : (
            <>
              {error && <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-md text-sm">{error}</div>}
              {success && <div className="mb-4 p-3 bg-green-100 text-green-700 rounded-md text-sm">{success}</div>}

              {activeTab === 'profile' ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Vorname</label>
                      <input
                        type="text"
                        value={userData.vorname}
                        onChange={(e) => setUserData({ ...userData, vorname: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Nachname</label>
                      <input
                        type="text"
                        value={userData.nachname}
                        onChange={(e) => setUserData({ ...userData, nachname: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">E-Mail</label>
                    <input
                      type="email"
                      value={userData.email}
                      onChange={(e) => setUserData({ ...userData, email: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                      <CreditCard className="w-4 h-4" />
                      RFID-Karte
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={userData.rfid_karte}
                        onChange={(e) => setUserData({ ...userData, rfid_karte: e.target.value })}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
                        placeholder="z.B. KARTE001"
                      />
                      <button
                        onClick={handleScanRFID}
                        disabled={isSaving}
                        className={`px-3 py-2 rounded-md transition-colors flex items-center gap-2 ${
                          isScanning
                            ? 'bg-teal-600 text-white animate-pulse'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {isScanning ? (
                          <>
                            <Radio className="w-4 h-4 animate-spin" />
                            Scanning...
                          </>
                        ) : (
                          <>
                            <Scan className="w-4 h-4" />
                            Scannen
                          </>
                        )}
                      </button>
                    </div>
                    {scanError && (
                      <p className="text-xs text-red-600 mt-1">{scanError}</p>
                    )}
                    {isScanning && (
                      <div className="mt-2">
                        <div className="flex justify-between text-xs text-teal-600 mb-1">
                          <span>Bitte Karte an den Leser halten...</span>
                          <span>{Math.round(scanProgress)}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-teal-500 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${scanProgress}%` }}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={stopScanning}
                          className="mt-2 text-xs text-red-500 hover:text-red-700 underline"
                        >
                          Scan abbrechen
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                      <Lock className="w-4 h-4" />
                      Neues Passwort
                    </label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Passwort bestätigen</label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex justify-end gap-3 p-6 border-t bg-gray-50">
          <button 
            onClick={async () => {
              await stopScanning();
              onClose();
            }} 
            className="px-4 py-2 text-gray-600 hover:text-gray-800" 
            disabled={isSaving}
          >
            Abbrechen
          </button>
          <button
            onClick={activeTab === 'profile' ? handleSaveProfile : handleChangePassword}
            disabled={isLoading || isSaving}
            className="px-4 py-2 bg-teal-600 text-white rounded-md hover:bg-teal-700 flex items-center gap-2 disabled:opacity-50"
          >
            {isSaving ? <><Loader2 className="w-4 h-4 animate-spin" /> Speichern...</> : <><Save className="w-4 h-4" /> Speichern</>}
          </button>
        </div>
      </div>
    </div>
  );
}
