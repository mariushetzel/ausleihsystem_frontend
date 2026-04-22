import { useEffect, useRef, useCallback } from 'react';
import { LogOut, AlertCircle, CheckCircle } from 'lucide-react';

interface AutoLogoutDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  countdownSeconds?: number;
  onContinue: () => void;
  onLogout: () => void;
}

export function AutoLogoutDialog({
  isOpen,
  title,
  message,
  countdownSeconds = 15,
  onContinue,
  onLogout,
}: AutoLogoutDialogProps) {
  // Refs für Timer-Logik - bleiben bei Re-Renders erhalten
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const totalDurationRef = useRef<number>(countdownSeconds * 1000);
  const hasLoggedOutRef = useRef(false);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const timeDisplayRef = useRef<HTMLSpanElement>(null);

  const stopTimer = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const handleContinue = useCallback(() => {
    stopTimer();
    onContinue();
  }, [stopTimer, onContinue]);

  const handleLogout = useCallback(() => {
    stopTimer();
    onLogout();
  }, [stopTimer, onLogout]);

  useEffect(() => {
    if (!isOpen) {
      stopTimer();
      hasLoggedOutRef.current = false;
      return;
    }

    // Initialisierung - nur einmal beim Öffnen
    hasLoggedOutRef.current = false;
    startTimeRef.current = Date.now();
    totalDurationRef.current = countdownSeconds * 1000;

    // DOM direkt manipulieren für flüssige Animation
    const animate = () => {
      if (!isOpen || hasLoggedOutRef.current) return;

      const elapsed = Date.now() - startTimeRef.current;
      const remaining = Math.max(0, totalDurationRef.current - elapsed);
      const progress = (remaining / totalDurationRef.current) * 100;
      const seconds = Math.ceil(remaining / 1000);

      // Direkte DOM-Updates statt React-State
      if (progressBarRef.current) {
        progressBarRef.current.style.width = `${progress}%`;
        progressBarRef.current.className = `h-full ${seconds <= 5 ? 'bg-red-500' : 'bg-teal-500'}`;
      }
      if (timeDisplayRef.current) {
        timeDisplayRef.current.textContent = `${seconds}s`;
        timeDisplayRef.current.className = `text-2xl font-bold ${seconds <= 5 ? 'text-red-600' : 'text-teal-600'}`;
      }

      // Warning-Text ein/ausblenden
      const warningEl = document.getElementById('logout-warning');
      if (warningEl) {
        warningEl.style.display = seconds <= 5 ? 'flex' : 'none';
      }

      if (remaining <= 0 && !hasLoggedOutRef.current) {
        hasLoggedOutRef.current = true;
        onLogout();
        return;
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    // Erste Animation starten
    rafRef.current = requestAnimationFrame(animate);

    return () => {
      stopTimer();
    };
  }, [isOpen]); // Nur bei isOpen-Änderung neu starten

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={(e) => { if (e.target === e.currentTarget) handleContinue(); }}>
      <div className="bg-white rounded-lg shadow-2xl max-w-md w-full p-6">
        {/* Icon und Titel */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-teal-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-teal-600" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
          <p className="text-gray-600 mt-2">{message}</p>
        </div>

        {/* Countdown */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-500">Automatische Abmeldung in</span>
            <span 
              ref={timeDisplayRef}
              className="text-2xl font-bold text-teal-600"
            >
              {countdownSeconds}s
            </span>
          </div>
          
          {/* Fortschrittsbalken */}
          <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
            <div
              ref={progressBarRef}
              className="h-full bg-teal-500"
              style={{ width: '100%' }}
            />
          </div>
          
          <div 
            id="logout-warning"
            className="flex items-center gap-2 mt-2 text-red-600 text-sm"
            style={{ display: 'none' }}
          >
            <AlertCircle className="w-4 h-4" />
            <span>Sie werden gleich ausgeloggt</span>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onClick={handleLogout}
            className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            Jetzt ausloggen
          </button>
          <button
            onClick={handleContinue}
            className="flex-1 px-4 py-3 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium"
            autoFocus
          >
            Weiter machen
          </button>
        </div>

        <p className="text-xs text-gray-400 text-center mt-4">
          Klicken Sie auf &quot;Weiter machen&quot; um angemeldet zu bleiben
        </p>
      </div>
    </div>
  );
}
