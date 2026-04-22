import { useState, useEffect, useRef } from 'react';
import { generateUUID } from '../utils/uuid';
import { LogIn, CreditCard, Loader2, X } from 'lucide-react';
import { PasswordInput } from './PasswordInput';
import { publicCardReaderApi, getApiBaseUrl } from '../api';

interface LoginFormProps {
  onLogin: (username: string, token: string, role: string) => void;
  onRegister: (preFilledCardId?: string) => void;
}

interface Toast {
  message: string;
  type: 'success' | 'error' | 'info';
}

export function LoginForm({ onLogin, onRegister }: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isCardReaderActive, setIsCardReaderActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  
  // Refs für Card Reader
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cardReaderPort = useRef<string>('/dev/ttyUSB0');
  const sessionIdRef = useRef<string>(generateUUID());
  const userIdRef = useRef<string>('login_form');

  // Prüfen ob Session abgelaufen
  useEffect(() => {
    if (localStorage.getItem('session_expired') === 'true') {
      setToast({ message: 'Sitzung abgelaufen. Bitte melden Sie sich erneut an.', type: 'error' });
      localStorage.removeItem('session_expired');
    }
    // Port aus localStorage laden
    const savedPort = localStorage.getItem('cardreader_port');
    if (savedPort) {
      cardReaderPort.current = savedPort;
    }
  }, []);

  // Auto-hide toast after 3 seconds
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  
  // Cleanup beim Unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      publicCardReaderApi.stop(sessionIdRef.current, userIdRef.current).catch(() => {});
    };
  }, []);

  const stopCardReader = async () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    try {
      await publicCardReaderApi.stop(sessionIdRef.current, userIdRef.current);
    } catch (e) {
      // Ignorieren
    }
    setIsCardReaderActive(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch(`${getApiBaseUrl()}/login/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email,
          passwort: password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Anmeldung fehlgeschlagen');
      }

      if (data.success && data.access_token) {
        // Tokens in localStorage speichern
        localStorage.setItem('access_token', data.access_token);
        localStorage.setItem('refresh_token', data.refresh_token);
        localStorage.setItem('user', JSON.stringify(data.user));
        localStorage.removeItem('session_expired');
        
        onLogin(`${data.user.vorname} ${data.user.nachname}`, data.access_token, data.user.rolle);
      } else {
        throw new Error('Ungültige Antwort vom Server');
      }
    } catch (err) {
      setToast({ 
        message: err instanceof Error ? err.message : 'Ein Fehler ist aufgetreten', 
        type: 'error' 
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCardLogin = async (rfidKarte: string) => {
    setIsLoading(true);

    try {
      const response = await fetch(`${getApiBaseUrl()}/login/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          rfid_karte: rfidKarte,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        // Prüfen ob die Karte nicht existiert
        if (data.error && (
          data.error.includes('nicht gefunden') || 
          data.error.includes('existiert nicht') ||
          data.error.toLowerCase().includes('not found')
        )) {
          // Zur Registrierung weiterleiten mit der Karten-ID
          setToast({ 
            message: `Karte ${rfidKarte} nicht gefunden. Weiterleitung zur Registrierung...`, 
            type: 'info' 
          });
          setTimeout(() => {
            onRegister(rfidKarte);
          }, 1500);
          return;
        }
        throw new Error(data.error || 'Anmeldung fehlgeschlagen');
      }

      if (data.success && data.access_token) {
        // Tokens in localStorage speichern
        localStorage.setItem('access_token', data.access_token);
        localStorage.setItem('refresh_token', data.refresh_token);
        localStorage.setItem('user', JSON.stringify(data.user));
        localStorage.removeItem('session_expired');
        
        onLogin(`${data.user.vorname} ${data.user.nachname}`, data.access_token, data.user.rolle);
      } else {
        throw new Error('Ungültige Antwort vom Server');
      }
    } catch (err) {
      setToast({ 
        message: err instanceof Error ? err.message : 'Ein Fehler ist aufgetreten', 
        type: 'error' 
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCardReaderClick = async () => {
    if (isCardReaderActive) {
      await stopCardReader();
      return;
    }

    setIsCardReaderActive(true);

    try {
      // Card Reader starten
      const result = await publicCardReaderApi.start(cardReaderPort.current, 9600, sessionIdRef.current, userIdRef.current);
      if (result.session_id) {
        sessionIdRef.current = result.session_id;
      }
      
      if (!result.success) {
        throw new Error(result.error || 'Konnte Kartenleser nicht starten');
      }

      // Polling starten - alle 400ms (Reader sendet alle 500ms, Backend wartet 700ms)
      pollingRef.current = setInterval(async () => {
        try {
          const result = await publicCardReaderApi.getData(sessionIdRef.current, userIdRef.current);
          
          if (result.success && result.code && result.code !== 'None' && result.code.trim() !== '') {
            // Karte gelesen!
            const cardId = result.code.trim();
            await stopCardReader();
            await handleCardLogin(cardId);
          }
        } catch (e) {
          // Ignorieren - weiter pollen
        }
      }, 400);

    } catch (err) {
      setToast({ 
        message: err instanceof Error ? err.message : 'Fehler beim Starten des Kartenlesers', 
        type: 'error' 
      });
      setIsCardReaderActive(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 to-emerald-50">
      {/* Toast Notification */}
      {toast && (
        <div 
          className={`fixed top-20 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-white text-sm flex items-center gap-2 ${
            toast.type === 'success' 
              ? 'bg-emerald-500' 
              : toast.type === 'error' 
              ? 'bg-red-500' 
              : 'bg-blue-500'
          }`}
        >
          <span>{toast.message}</span>
          <button 
            onClick={() => setToast(null)}
            className="ml-2 hover:opacity-80"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
        <div className="flex items-center justify-center mb-6">
          <LogIn className="w-12 h-12 text-teal-600" />
        </div>
        <h1 className="text-center mb-2 text-teal-700">Ausleihsystem</h1>
        <p className="text-center text-gray-500 text-sm mb-6">
          Bitte melden Sie sich an
        </p>
        
        {/* Mitarbeiterkarte Login */}
        <div className="mb-6">
          <button
            type="button"
            onClick={handleCardReaderClick}
            disabled={isLoading}
            className={`w-full py-8 border-2 border-dashed rounded-lg transition-all ${
              isCardReaderActive
                ? 'border-red-400 bg-red-50 hover:bg-red-100'
                : 'border-teal-600 hover:border-teal-700 hover:bg-teal-50'
            }`}
          >
            <div className="flex flex-col items-center gap-3">
              {isLoading ? (
                <Loader2 className="w-12 h-12 text-teal-600 animate-spin" />
              ) : (
                <CreditCard className={`w-12 h-12 ${isCardReaderActive ? 'text-red-500' : 'text-teal-600'}`} />
              )}
              <div className="text-center">
                <p className={`font-medium ${isCardReaderActive ? 'text-red-600' : 'text-teal-700'}`}>
                  {isLoading ? 'Anmelden...' : (isCardReaderActive ? 'Scan abbrechen' : 'Mit Mitarbeiterkarte anmelden')}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  {isCardReaderActive ? 'Klicken zum Abbrechen' : 'Klicken Sie, um den Reader zu starten'}
                </p>
              </div>
            </div>
          </button>
        </div>

        {/* Trennlinie */}
        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white text-gray-500">oder</span>
          </div>
        </div>

        {/* Manuelle Anmeldung mit E-Mail */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm mb-1 text-gray-700">
              E-Mail
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
              placeholder="E-Mail-Adresse eingeben"
              required
              disabled={isLoading}
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm mb-1 text-gray-700">
              Passwort
            </label>
            <PasswordInput
              id="password"
              value={password}
              onChange={setPassword}
              placeholder="Passwort eingeben"
              required
              disabled={isLoading}
            />
          </div>
          
          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-teal-600 text-white py-2 rounded-md hover:bg-teal-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Wird angemeldet...
              </>
            ) : (
              'Anmelden'
            )}
          </button>
        </form>

        {/* Registrierung Link */}
        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600">
            Noch keinen Account?{' '}
            <button
              type="button"
              onClick={() => onRegister()}
              className="text-teal-600 hover:text-teal-700 font-medium underline"
            >
              Jetzt registrieren
            </button>
          </p>
        </div>

        {/* Hilfe-Text */}
        <p className="text-center text-xs text-gray-400 mt-6">
          Bei Problemen wenden Sie sich an den Administrator
        </p>
      </div>
    </div>
  );
}
