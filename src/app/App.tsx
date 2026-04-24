import { useState, useEffect, useCallback, useRef } from 'react';
import { LoginForm } from './components/LoginForm';
import { RegisterForm } from './components/RegisterForm';
import { UserProfileDialog } from './components/UserProfileDialog';
import { Dashboard } from './components/Dashboard';
import type { HistoryEntry as DashboardHistoryEntry } from './components/Dashboard';
import { BorrowView } from './components/BorrowView';
import { ReturnView } from './components/ReturnView';
import { AntennaSettings } from './components/AntennaSettings';
import { CategorySettings } from './components/CategorySettings';
import { UserManagement } from './components/UserManagement';
import { StatisticsView } from './components/StatisticsView';
import { Item } from './components/ItemDialog';
import { AutoLogoutDialog } from './components/AutoLogoutDialog';
import { warenApi, ausleihenApi, authApi, systemEinstellungenApi, type Ware, type Ausleihe } from './api';

// Konvertiere Backend-Ware zu Frontend-Item
function mapWareToItem(ware: Ware, ausleihen: Ausleihe[] = []): Item {
  // Suche nach aktiver Ausleihe oder Rückgabe beantragt
  const ausleihe = ausleihen.find(a => 
    a.ware.id === ware.id && 
    (a.status === 'aktiv' || a.status === 'rueckgabe_beantragt')
  );
  
  // Kategorien aus dem Ware-Objekt extrahieren
  const categories = ware.kategorien?.map(k => k.name) || 
                     (ware.kategorie_name ? [ware.kategorie_name] : []);
  const categoryIds = ware.kategorie_ids || 
                      (ware.kategorie_id ? [ware.kategorie_id] : []);
  
  return {
    id: ware.id,
    name: ware.name,
    description: ware.beschreibung || '',
    tagId: ware.rfid_tag || '',
    cabinetNumber: ware.schranknummer || '',
    categories: categories,
    categoryIds: categoryIds,
    borrowable: ware.verfuegbar ?? (!ware.ist_ausgeliehen && !ware.ist_gesperrt),
    borrowedBy: ausleihe ? ausleihe.benutzer.name : undefined,
    borrowedAt: ausleihe ? ausleihe.ausgeliehen_am : undefined,
    letzteAusleihe: ware.letzte_ausleihe, // Letzte Ausleihe (egal ob zurückgegeben oder nicht)
    returnDate: ausleihe ? ausleihe.geplante_rueckgabe || undefined : undefined,
    location: ausleihe ? ausleihe.verbleib_ort || undefined : undefined,
    borrowingStatus: ausleihe ? ausleihe.status : undefined,
    borrowingId: ausleihe ? ausleihe.id : undefined,
    rueckgabeBeantragtAm: ausleihe ? ausleihe.rueckgabe_beantragt_am || undefined : undefined,
    erlaubteVerbleibOrte: ware.erlaubte_verbleib_orte || [],
    erstelltAm: ware.erstellt_am,
  };
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string>('');
  const [token, setToken] = useState<string | null>(null);
  // Hash-basiertes Routing: initialen View aus URL-Hash lesen
  const getInitialView = (): 'borrow' | 'management' | 'returns' | 'antenna' | 'users' | 'categorySettings' | 'statistics' => {
    const hash = window.location.hash.replace('#/', '').replace('#', '');
    const validViews = ['borrow', 'management', 'returns', 'antenna', 'users', 'categorySettings', 'statistics'] as const;
    return validViews.includes(hash as any) ? (hash as any) : 'borrow';
  };

  const [currentView, setCurrentView] = useState<'borrow' | 'management' | 'returns' | 'antenna' | 'users' | 'categorySettings' | 'statistics'>(getInitialView());

  // Navigation mit Hash-Update
  const navigateToView = useCallback((view: 'borrow' | 'management' | 'returns' | 'antenna' | 'users' | 'categorySettings' | 'statistics') => {
    setCurrentView(view);
    window.location.hash = view === 'borrow' ? '' : `#/${view}`;
  }, []);
  const [authView, setAuthView] = useState<'login' | 'register'>('login');
  const [preFilledCardId, setPreFilledCardId] = useState<string>('');
  const [items, setItems] = useState<Item[]>([]);
  const [historyEntries, setHistoryEntries] = useState<DashboardHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  // Auto-Logout Dialog State
  const [showAutoLogoutDialog, setShowAutoLogoutDialog] = useState(false);
  const [autoLogoutConfig, setAutoLogoutConfig] = useState<{
    title: string;
    message: string;
  } | null>(null);

  // Inaktivitäts-Timer: 5 Minuten (300 Sekunden) für Studenten
  const INACTIVITY_TIMEOUT = 5 * 60 * 1000; // 5 Minuten in Millisekunden
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityRef = useRef<number>(Date.now());

  // Hilfsfunktion: Logout durchführen
  const performLogout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch (e) {
      // Ignorieren - wir loggen trotzdem aus
    }
    // Alle Auth-Daten löschen
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    localStorage.removeItem('remember_me');
    sessionStorage.removeItem('access_token');
    sessionStorage.removeItem('refresh_token');
    sessionStorage.removeItem('user');
    setToken(null);
    setCurrentUser(null);
    setUserRole('');
    navigateToView('borrow');
  }, [navigateToView]);

  // Inaktivität zurücksetzen (bei jeder Benutzeraktion)
  const resetInactivityTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
    
    // Nur für Studenten: Timer starten/resetten
    if (userRole === 'Student') {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
      inactivityTimerRef.current = setTimeout(() => {
        console.log('Inaktivitäts-Timeout: Student wird ausgeloggt');
        performLogout();
      }, INACTIVITY_TIMEOUT);
    }
  }, [userRole, performLogout]);

  // Event-Listener für Benutzeraktivität (NUR für Studenten)
  useEffect(() => {
    // WICHTIG: Nur ausführen wenn eingeloggt UND Student
    if (!token) {
      return;
    }
    
    if (userRole !== 'Student') {
      // Timer stoppen wenn nicht Student
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
      return;
    }

    // Events die Aktivität signalisieren
    const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    
    const handleActivity = () => {
      resetInactivityTimer();
    };

    // Event-Listener hinzufügen
    activityEvents.forEach(event => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    // Initial Timer starten
    resetInactivityTimer();

    // Cleanup
    return () => {
      activityEvents.forEach(event => {
        window.removeEventListener(event, handleActivity);
      });
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
    };
  }, [token, userRole, resetInactivityTimer]);

  // Beim Start: System-Einstellungen vom Server laden und in localStorage speichern
  useEffect(() => {
    const loadSystemSettings = async () => {
      try {
        const settings = await systemEinstellungenApi.getOeffentlich();
        // Server-Einstellungen in localStorage speichern (überschreiben lokale)
        localStorage.setItem('antenna_port', settings.antenna_port);
        localStorage.setItem('antenna_baudrate', settings.antenna_baudrate);
        localStorage.setItem('cardreader_port', settings.cardreader_port);
        localStorage.setItem('cardreader_baudrate', settings.cardreader_baudrate);
      } catch (err) {
        // Falls Server nicht erreichbar: lokale Einstellungen behalten
      }
    };
    loadSystemSettings();
  }, []);

  // Beim Start: Prüfen ob Token vorhanden ist
  useEffect(() => {
    const savedToken = localStorage.getItem('access_token');
    const savedUser = localStorage.getItem('user');
    
    if (savedToken && savedUser) {
      try {
        const user = JSON.parse(savedUser);
        // Token testen vor dem Setzen
        authApi.pingAuth().then(() => {
          setToken(savedToken);
          setCurrentUser(`${user.vorname} ${user.nachname}`);
          setUserRole(user.rolle || '');
          setLoading(false);
        }).catch(() => {
          // Token ungültig/abgelaufen -> ausloggen
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          localStorage.removeItem('user');
          localStorage.removeItem('remember_me');
          setLoading(false);
        });
      } catch {
        // Ungültige Daten, ausloggen
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user');
        localStorage.removeItem('remember_me');
        setLoading(false);
      }
    } else {
      setLoading(false);
    }
  }, []);

  // Daten vom Backend laden (mit Pagination)
  const loadData = async (loadMore: boolean = false) => {
    try {
      setLoading(true);
      setError(null);
      
      // Bestimme Offset basierend auf aktuellen Items
      const offset = loadMore ? items.length : 0;
      const limit = 100; // Lade 100 Waren pro Request
      
      // Parallel laden: Waren (paginiert) und Ausleihen
      const [warenResponse, ausleihen] = await Promise.all([
        warenApi.getAll({ limit, offset }),
        ausleihenApi.getAll(),
      ]);

      // Waren zu Items mappen
      const newItems = warenResponse.waren.map(ware => mapWareToItem(ware, ausleihen));
      
      if (loadMore) {
        // An bestehende Items anhängen
        setItems(prev => [...prev, ...newItems]);
      } else {
        // Items ersetzen
        setItems(newItems);
      }

      // Historie könnte hier auch geladen werden
      setHistoryEntries([]);
      
      // Wenn noch mehr Waren verfügbar sind, automatisch im Hintergrund laden
      if (warenResponse.has_more && !loadMore) {
        // Lade restliche Waren im Hintergrund
        loadRemainingData(warenResponse.total, limit);
      }
    } catch (err) {
      console.error('Fehler beim Laden der Daten:', err);
      const errorMsg = err instanceof Error ? err.message : 'Unbekannter Fehler';
      
      // Bei Session-Timeout: Keine Fehlermeldung, Redirect erfolgt bereits
      if (errorMsg === 'SESSION_EXPIRED') {
        handleLogout();
        return; // Keine Fehlermeldung anzeigen
      }
      
      setError(errorMsg);
      
      // Wenn 401 (nicht autorisiert), ausloggen
      if (errorMsg.includes('401') || errorMsg.includes('Token')) {
        handleLogout();
      }
    } finally {
      setLoading(false);
    }
  };
  
  // Restliche Waren im Hintergrund laden
  const isLoadingRemainingRef = useRef(false);
  
  const loadRemainingData = async (total: number, batchSize: number) => {
    if (isLoadingRemainingRef.current) {
      return;
    }
    
    isLoadingRemainingRef.current = true;
    let offset = batchSize;
    
    try {
      while (offset < total) {
        const response = await warenApi.getAll({ limit: batchSize, offset });
        const ausleihen = await ausleihenApi.getAll();
        
        const newItems = response.waren.map(ware => mapWareToItem(ware, ausleihen));
        
        // Prüfe auf Duplikate vor dem Hinzufügen
        setItems(prev => {
          const existingIds = new Set(prev.map(item => item.id));
          const uniqueNewItems = newItems.filter(item => !existingIds.has(item.id));
          return [...prev, ...uniqueNewItems];
        });
        
        if (!response.has_more) break;
        offset += batchSize;
        
        // Kleine Pause zwischen Requests um UI nicht zu blockieren
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (err) {
      console.error('Fehler beim Laden weiterer Waren:', err);
    } finally {
      isLoadingRemainingRef.current = false;
    }
  };

  // Beim ersten Laden und wenn der User sich einloggt ODER zur Startseite zurückkehrt
  const hasLoadedRef = useRef(false);
  
  useEffect(() => {
    if (currentUser && !hasLoadedRef.current) {
      hasLoadedRef.current = true;
      loadData();
    }
  }, [currentUser]);
  
  // Daten neu laden wenn zur Startseite oder Warenverwaltung zurückgekehrt wird
  const prevViewRef = useRef(currentView);
  useEffect(() => {
    if (currentUser && (currentView === 'borrow' || currentView === 'management') && prevViewRef.current !== currentView && hasLoadedRef.current) {
      loadData();
    }
    prevViewRef.current = currentView;
  }, [currentView]);

  // Hash-Change Listener: reagiert auf Browser-Zurück/Vor-Buttons
  useEffect(() => {
    const handleHashChange = () => {
      const newView = getInitialView();
      setCurrentView(newView);
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleLogin = (username: string, authToken: string, role: string = '') => {
    setCurrentUser(username);
    setToken(authToken);
    setUserRole(role);
    navigateToView('borrow');
    
    // Inaktivitäts-Timer starten wenn Student
    if (role === 'Student') {
      resetInactivityTimer();
    }
  };

  const handleLogout = async () => {
    // Server-seitiges Logout
    try {
      await authApi.logout();
    } catch (e) {
      // Ignorieren - wir loggen trotzdem aus
    }
    
    // Alle Tokens aus allen Speichern entfernen
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    localStorage.removeItem('remember_me');
    sessionStorage.removeItem('access_token');
    sessionStorage.removeItem('refresh_token');
    sessionStorage.removeItem('user');
    
    // Timer stoppen
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
    
    // Auto-Logout Dialog schliessen
    setShowAutoLogoutDialog(false);
    setAutoLogoutConfig(null);
    
    setCurrentUser(null);
    setToken(null);
    setUserRole('');
    navigateToView('borrow');
    setItems([]);
    setHistoryEntries([]);
    hasLoadedRef.current = false;
  };

  const handleAddHistory = (entries: DashboardHistoryEntry[]) => {
    setHistoryEntries(prev => [...entries, ...prev]);
  };

  const handleUpdateItems = async (newItems: Item[]) => {
    // Lokale Aktualisierung
    setItems(newItems);
    // Daten neu laden, um sicherzustellen, dass wir synchron sind
    await loadData();
  };

  // Auto-Logout Dialog anzeigen
  const handleShowAutoLogoutDialog = useCallback((title: string, message: string) => {
    setAutoLogoutConfig({ title, message });
    setShowAutoLogoutDialog(true);
  }, []);

  // Auto-Logout Dialog schliessen (User klickt "Weiter")
  const handleAutoLogoutContinue = useCallback(() => {
    setShowAutoLogoutDialog(false);
    setAutoLogoutConfig(null);
  }, []);

  if (!currentUser) {
    return authView === 'login' ? (
      <LoginForm 
        onLogin={handleLogin} 
        onRegister={(cardId?: string) => {
          if (cardId) {
            setPreFilledCardId(cardId);
          }
          setAuthView('register');
        }}
      />
    ) : (
      <RegisterForm 
        onBackToLogin={() => {
          setPreFilledCardId('');
          setAuthView('login');
        }}
        preFilledCardId={preFilledCardId}
      />
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 to-emerald-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Daten werden geladen...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 to-emerald-50">
        <div className="bg-white p-8 rounded-lg shadow-lg max-w-md">
          <h2 className="text-red-600 mb-4">Verbindungsfehler</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <p className="text-sm text-gray-500 mb-4">
            Stellen Sie sicher, dass das Backend läuft:
            <code className="block bg-gray-100 p-2 mt-2 rounded text-xs">
              python manage.py runserver
            </code>
          </p>
          <button
            onClick={loadData}
            className="w-full px-4 py-2 bg-teal-600 text-white rounded-md hover:bg-teal-700"
          >
            Erneut versuchen
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {currentView === 'borrow' ? (
        <>
          <BorrowView
            username={currentUser}
            userRole={userRole}
            items={items}
            onUpdateItems={handleUpdateItems}
            onLogout={handleLogout}
            onNavigateToManagement={() => navigateToView('management')}
            onNavigateToReturns={() => navigateToView('returns')}
            onNavigateToAntenna={() => navigateToView('antenna')}
            onNavigateToUsers={() => navigateToView('users')}
            onNavigateToStatistics={() => navigateToView('statistics')}
            onEditProfile={() => setIsProfileOpen(true)}
            onShowAutoLogoutDialog={handleShowAutoLogoutDialog}
          />
          <UserProfileDialog 
            isOpen={isProfileOpen} 
            onClose={() => setIsProfileOpen(false)} 
          />
        </>
      ) : currentView === 'returns' ? (
        <ReturnView
          username={currentUser}
          userRole={userRole}
          items={items}
          onUpdateItems={handleUpdateItems}
          onAddHistory={handleAddHistory}
          onBack={() => navigateToView('borrow')}
        />
      ) : currentView === 'antenna' ? (
        userRole === 'Mitarbeiter' || userRole === 'Laborleiter' || userRole === 'Admin' ? (
          <AntennaSettings
            username={currentUser}
            onBack={() => {
              loadData();
              navigateToView('borrow');
            }}
            onCategoriesChanged={loadData}
            onNavigateToCategorySettings={() => navigateToView('categorySettings')}
          />
        ) : (
          <LoginForm onLogin={handleLogin} />
        )
      ) : currentView === 'categorySettings' ? (
        userRole === 'Mitarbeiter' || userRole === 'Laborleiter' || userRole === 'Admin' ? (
          <CategorySettings
            username={currentUser}
            onBack={() => {
              loadData();
              navigateToView('antenna');
            }}
            onCategoriesChanged={loadData}
          />
        ) : (
          <LoginForm onLogin={handleLogin} />
        )
      ) : currentView === 'users' ? (
        <UserManagement
          username={currentUser}
          userRole={userRole}
          onBack={() => navigateToView('borrow')}
        />
      ) : currentView === 'statistics' ? (
        <StatisticsView
          userRole={userRole}
          username={currentUser}
          onBack={() => navigateToView('borrow')}
        />
      ) : (
        <Dashboard
          username={currentUser}
          userRole={userRole}
          items={items}
          historyEntries={historyEntries}
          onUpdateItems={handleUpdateItems}
          onBack={() => navigateToView('borrow')}
        />
      )}

      {/* Auto-Logout Dialog */}
      <AutoLogoutDialog
        isOpen={showAutoLogoutDialog}
        title={autoLogoutConfig?.title || 'Aktion erfolgreich'}
        message={autoLogoutConfig?.message || 'Sie werden in Kürze ausgeloggt.'}
        countdownSeconds={15}
        onContinue={handleAutoLogoutContinue}
        onLogout={handleLogout}
      />
    </>
  );
}
