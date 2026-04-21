import { useState, useEffect, useRef } from 'react';
import { generateUUID } from '../utils/uuid';
import { UserPlus, Loader2, ArrowLeft, CheckCircle, CreditCard, X } from 'lucide-react';
import { PasswordInput } from './PasswordInput';
import { authApi, publicCardReaderApi } from '../api';

interface RegisterFormProps {
  onBackToLogin: () => void;
  preFilledCardId?: string;
}

export function RegisterForm({ onBackToLogin, preFilledCardId }: RegisterFormProps) {
  const [formData, setFormData] = useState({
    vorname: '',
    nachname: '',
    email: '',
    passwort: '',
    passwortConfirm: ''
  });
  const [rfidKarte, setRfidKarte] = useState<string | null>(null);
  const [isCardReaderActive, setIsCardReaderActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cardReaderPort = useRef<string>('/dev/ttyUSB0');
  const sessionIdRef = useRef<string>(generateUUID());
  const userIdRef = useRef<string>('register_form');

  useEffect(() => {
    const savedPort = localStorage.getItem('cardreader_port');
    if (savedPort) {
      cardReaderPort.current = savedPort;
    }
  }, []);

  useEffect(() => {
    if (preFilledCardId && preFilledCardId.trim() !== '') {
      setRfidKarte(preFilledCardId);
    }
  }, [preFilledCardId]);

  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      publicCardReaderApi.stop(sessionIdRef.current, userIdRef.current).catch(() => {});
    };
  }, []);

  const startCardReader = async () => {
    setError(null);
    setIsCardReaderActive(true);

    try {
      const result = await publicCardReaderApi.start(cardReaderPort.current, 9600, sessionIdRef.current, userIdRef.current);
      if (result.session_id) {
        sessionIdRef.current = result.session_id;
      }

      if (!result.success) {
        throw new Error(result.error || 'Konnte Kartenleser nicht starten');
      }

      pollingRef.current = setInterval(async () => {
        try {
          const result = await publicCardReaderApi.getData(sessionIdRef.current, userIdRef.current);
          if (result.success && result.code && result.code !== 'None' && result.code.trim() !== '') {
            setRfidKarte(result.code.trim());
            if (pollingRef.current) {
              clearInterval(pollingRef.current);
              pollingRef.current = null;
            }
            setIsCardReaderActive(false);
            publicCardReaderApi.stop(sessionIdRef.current, userIdRef.current).catch(() => {});
          }
        } catch {
          // Ignorieren
        }
      }, 500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Starten des Kartenlesers');
      setIsCardReaderActive(false);
    }
  };

  const stopCardReader = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    publicCardReaderApi.stop(sessionIdRef.current, userIdRef.current).catch(() => {});
    setIsCardReaderActive(false);
  };

  const clearCard = () => {
    setRfidKarte(null);
  };

  const validateEmail = (email: string): boolean => {
    const allowedDomains = ['@th-koeln.de', '@smail.th-koeln.de'];
    const emailLower = email.toLowerCase().trim();
    return allowedDomains.some(domain => emailLower.endsWith(domain));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.vorname.trim() || !formData.nachname.trim() || !formData.email.trim() || !formData.passwort) {
      setError('Alle Felder müssen ausgefüllt sein');
      return;
    }

    if (!validateEmail(formData.email)) {
      setError('Nur E-Mail-Adressen der TH Köln (@th-koeln.de oder @smail.th-koeln.de) sind erlaubt');
      return;
    }

    if (formData.passwort.length < 4) {
      setError('Passwort muss mindestens 4 Zeichen haben');
      return;
    }

    if (formData.passwort !== formData.passwortConfirm) {
      setError('Passwörter stimmen nicht überein');
      return;
    }

    setIsLoading(true);

    try {
      stopCardReader();

      const result = await authApi.register({
        vorname: formData.vorname,
        nachname: formData.nachname,
        email: formData.email,
        passwort: formData.passwort,
        rfid_karte: rfidKarte || undefined
      });

      if (result.success) {
        setSuccess(true);
      } else {
        throw new Error('Registrierung fehlgeschlagen');
      }

      setTimeout(() => {
        onBackToLogin();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler');
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 to-emerald-50">
        <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md text-center">
          <CheckCircle className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Registrierung erfolgreich!</h2>
          <p className="text-gray-600 mb-4">
            Ihr Account wurde erstellt{rfidKarte ? ' mit Karte verknüpft' : ''}.
            Sie werden zum Login weitergeleitet...
          </p>
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-teal-600 mx-auto"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 to-emerald-50">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
        <div className="text-center mb-6">
          <div className="flex items-center justify-center mb-4">
            <UserPlus className="w-12 h-12 text-teal-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800">Registrierung</h1>
          <p className="text-gray-600 mt-2">Erstellen Sie einen neuen Account</p>
          <p className="text-xs text-gray-500 mt-1">(Automatisch als Student registriert)</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-md text-sm">
            {error}
          </div>
        )}

        <div className="mb-6">
          {rfidKarte ? (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CreditCard className="w-6 h-6 text-emerald-600" />
                  <div>
                    <p className="text-sm font-medium text-emerald-800">
                      {preFilledCardId && preFilledCardId === rfidKarte
                        ? 'Karte automatisch übernommen'
                        : 'Karte hinterlegt'}
                    </p>
                    <p className="text-xs text-emerald-600 font-mono">{rfidKarte}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={clearCard}
                  className="p-1 hover:bg-emerald-200 rounded transition-colors"
                  title="Karte entfernen"
                >
                  <X className="w-4 h-4 text-emerald-700" />
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={isCardReaderActive ? stopCardReader : startCardReader}
              disabled={isLoading}
              className={`w-full py-4 border-2 border-dashed rounded-lg transition-all ${
                isCardReaderActive
                  ? 'border-teal-500 bg-teal-50 animate-pulse'
                  : 'border-gray-300 hover:border-teal-400 hover:bg-gray-50'
              }`}
            >
              <div className="flex flex-col items-center gap-2">
                <CreditCard className={`w-8 h-8 ${isCardReaderActive ? 'text-teal-600' : 'text-gray-400'}`} />
                <div className="text-center">
                  <p className={`font-medium ${isCardReaderActive ? 'text-teal-600' : 'text-gray-700'}`}>
                    {isCardReaderActive ? 'Warte auf Karte...' : 'Mitarbeiterkarte hinterlegen'}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {isCardReaderActive ? 'Bitte Karte auflegen' : 'Optional - später auch im Profil möglich'}
                  </p>
                </div>
              </div>
            </button>
          )}
        </div>

        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white text-gray-500">oder</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Vorname *</label>
              <input
                type="text"
                value={formData.vorname}
                onChange={(e) => setFormData({ ...formData, vorname: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
                disabled={isLoading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nachname *</label>
              <input
                type="text"
                value={formData.nachname}
                onChange={(e) => setFormData({ ...formData, nachname: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
                disabled={isLoading}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">E-Mail *</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
              disabled={isLoading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Passwort *</label>
            <PasswordInput
              value={formData.passwort}
              onChange={(value) => setFormData({ ...formData, passwort: value })}
              disabled={isLoading}
            />
            <p className="text-xs text-gray-500 mt-1">Mindestens 4 Zeichen</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Passwort bestätigen *</label>
            <PasswordInput
              value={formData.passwortConfirm}
              onChange={(value) => setFormData({ ...formData, passwortConfirm: value })}
              disabled={isLoading}
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full px-4 py-2 bg-teal-600 text-white rounded-md hover:bg-teal-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Registrieren...
              </>
            ) : (
              <>
                <UserPlus className="w-4 h-4" />
                Registrieren
              </>
            )}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={onBackToLogin}
            className="text-sm text-teal-600 hover:text-teal-700 flex items-center justify-center gap-1"
          >
            <ArrowLeft className="w-4 h-4" />
            Zurück zum Login
          </button>
        </div>
      </div>
    </div>
  );
}
