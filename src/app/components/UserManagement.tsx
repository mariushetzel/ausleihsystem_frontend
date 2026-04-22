import { useState, useEffect, useRef } from 'react';
import { generateUUID } from '../utils/uuid';
import { ArrowLeft, Users, Search, Save, X, Loader2, Shield, User, AlertCircle, UserPlus, CreditCard, Lock, Unlock, Radio, Edit } from 'lucide-react';
import { authApi, benutzerApi, publicCardReaderApi, type Benutzer } from '../api';

interface UserManagementProps {
  username: string;
  userRole: string;
  onBack: () => void;
}

// Rollen-Hierarchie (höher = mehr Rechte)
const ROLE_HIERARCHY: Record<string, number> = {
  'Student': 1,
  'Mitarbeiter': 2,
  'Laborleiter': 3,
  'Admin': 4
};

const ROLE_OPTIONS = [
  { value: 'Student', label: 'Student', level: 1 },
  { value: 'Mitarbeiter', label: 'Mitarbeiter', level: 2 },
  { value: 'Laborleiter', label: 'Laborleiter', level: 3 },
  { value: 'Admin', label: 'Admin', level: 4 }
];

// Bereinigt Fehlermeldungen
const formatErrorMessage = (error: string | Error): string => {
  let msg = error instanceof Error ? error.message : String(error);
  if (msg.length > 150) {
    msg = msg.substring(0, 150) + '...';
  }
  return msg;
};

export function UserManagement({ username, userRole, onBack }: UserManagementProps) {
  const [users, setUsers] = useState<Benutzer[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<Benutzer[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Bearbeiten-Modal
  const [editingUser, setEditingUser] = useState<Benutzer | null>(null);
  const [editForm, setEditForm] = useState({
    vorname: '',
    nachname: '',
    email: '',
    rolle: ''
  });
  const [editUserRfid, setEditUserRfid] = useState<string | null>(null);
  const [editUserOriginalRfid, setEditUserOriginalRfid] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  // Neuer Benutzer-Modal
  const [isCreating, setIsCreating] = useState(false);
  const [createForm, setCreateForm] = useState({
    vorname: '',
    nachname: '',
    email: '',
    rolle: 'Student'
  });
  const [newUserRfid, setNewUserRfid] = useState<string | null>(null);
  
  // Modus für Card Reader (create oder edit)
  const [cardScanMode, setCardScanMode] = useState<'create' | 'edit'>('create');
  
  // Card Reader States (wie im Profil)
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanError, setScanError] = useState<string | null>(null);
  const [cardTakenError, setCardTakenError] = useState<string | null>(null);
  
  // Refs für Card Reader
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isCleaningRef = useRef(false);
  const cardReaderPort = useRef<string>('/dev/ttyUSB0');
  const sessionIdRef = useRef<string>(generateUUID());
  const userIdRef = useRef<string>(`user_mgmt_${username}`);

  const currentUserLevel = ROLE_HIERARCHY[userRole] || 0;
  
  // Card Reader Port laden
  useEffect(() => {
    const savedPort = localStorage.getItem('cardreader_port');
    if (savedPort) {
      cardReaderPort.current = savedPort;
    }
  }, []);
  
  // Cleanup Card Reader beim Schließen des Modals
  useEffect(() => {
    if (!isCreating) {
      stopScanning();
      setNewUserRfid(null);
      setScanError(null);
      setCardTakenError(null);
      setScanProgress(0);
    }
  }, [isCreating]);
  
  // Cleanup Card Reader beim Schließen des Edit-Modals
  useEffect(() => {
    if (!editingUser) {
      stopScanning();
      setEditUserRfid(null);
      setEditUserOriginalRfid(null);
      setScanError(null);
      setCardTakenError(null);
      setScanProgress(0);
    }
  }, [editingUser]);

  // Benutzer laden
  useEffect(() => {
    loadUsers();
  }, []);

  // Filter anwenden
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredUsers(users);
      return;
    }
    
    const query = searchQuery.toLowerCase();
    const filtered = users.filter(user => 
      user.vorname.toLowerCase().includes(query) ||
      user.nachname.toLowerCase().includes(query) ||
      user.email.toLowerCase().includes(query) ||
      user.rolle.toLowerCase().includes(query)
    );
    setFilteredUsers(filtered);
  }, [searchQuery, users]);

  const loadUsers = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const data = await benutzerApi.getAll();
      setUsers(data);
      setFilteredUsers(data);
    } catch (err) {
      const msg = formatErrorMessage(err instanceof Error ? err : new Error('Unbekannter Fehler'));
      // Session-Timeout wird automatisch vom apiCall gehandhabt
      if (msg === 'SESSION_EXPIRED') return;
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  // Prüfen ob aktueller User diesen Benutzer bearbeiten darf
  const canEditUser = (targetUser: Benutzer): boolean => {
    const targetLevel = ROLE_HIERARCHY[targetUser.rolle] || 0;
    // Darf nur bearbeiten wenn eigene Rolle höher ist
    return currentUserLevel > targetLevel;
  };

  // Verfügbare Rollen für Dropdown (nur niedrigere als eigene)
  const getAvailableRoles = () => {
    return ROLE_OPTIONS.filter(role => role.level < currentUserLevel);
  };

  const handleEditClick = async (user: Benutzer) => {
    if (!canEditUser(user)) return;
    
    setEditingUser(user);
    setEditForm({
      vorname: user.vorname,
      nachname: user.nachname,
      email: user.email,
      rolle: user.rolle
    });
    
    // Bestehende RFID laden (wenn vorhanden)
    try {
      const userDetails = await benutzerApi.getById(user.id);
      const rfid = userDetails.rfid_karte || null;
      setEditUserRfid(rfid);
      setEditUserOriginalRfid(rfid);
    } catch (e) {
      // Falls API fehlschlägt, einfach ohne RFID starten
      setEditUserRfid(null);
      setEditUserOriginalRfid(null);
    }
    
    setCardScanMode('edit');
  };

  const handleSaveUser = async () => {
    if (!editingUser) return;
    
    // Validierung
    if (!editForm.vorname.trim() || !editForm.nachname.trim() || !editForm.email.trim()) {
      setError('Alle Felder müssen ausgefüllt sein');
      return;
    }
    
    // E-Mail Domain prüfen
    if (!validateEmail(editForm.email)) {
      setError('Nur E-Mail-Adressen der TH Köln (@th-koeln.de oder @smail.th-koeln.de) sind erlaubt');
      return;
    }
    
    // Prüfen ob Rolle erlaubt ist
    const newRoleLevel = ROLE_HIERARCHY[editForm.rolle];
    if (newRoleLevel >= currentUserLevel) {
      setError('Sie können keine Rolle vergeben, die gleich oder höher ist als Ihre eigene');
      return;
    }
    
    setIsSaving(true);
    setError(null);
    
    try {
      // RFID nur senden wenn sie sich geändert hat
      const rfidToSend = editUserRfid !== editUserOriginalRfid ? editUserRfid : undefined;
      
      await benutzerApi.update(editingUser.id, {
        vorname: editForm.vorname,
        nachname: editForm.nachname,
        email: editForm.email,
        rolle: editForm.rolle,
        rfid_karte: rfidToSend
      });
      
      // Erfolg
      setSuccess('Benutzer erfolgreich aktualisiert');
      setEditingUser(null);
      await loadUsers(); // Liste neu laden
      
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      const msg = formatErrorMessage(err instanceof Error ? err : new Error('Unbekannter Fehler'));
      if (msg !== 'SESSION_EXPIRED') {
        setError(msg);
      }
    } finally {
      setIsSaving(false);
    }
  };
  
  // RFID Scan Funktionen (wie im Profil)
  const stopScanning = async () => {
    if (isCleaningRef.current) {
      // Bereits am Aufräumen - warte kurz und versuche es nochmal
      await new Promise(resolve => setTimeout(resolve, 100));
      if (isCleaningRef.current) return;
    }
    
    isCleaningRef.current = true;
    
    try {
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      
      try {
        await publicCardReaderApi.stop(sessionIdRef.current, userIdRef.current);
      } catch (e) {
        // Ignorieren
      }
      
      setIsScanning(false);
      setScanProgress(0);
    } finally {
      isCleaningRef.current = false;
    }
  };

  const handleScanRFID = async (mode: 'create' | 'edit' = 'create') => {
    if (isScanning) {
      await stopScanning();
      return;
    }
    
    setCardScanMode(mode);
    
    // Token aktualisieren
    await authApi.ping().catch(() => {});
    
    setIsScanning(true);
    setScanError(null);
    setCardTakenError(null);
    setScanProgress(0);
    
    try {
      const result = await publicCardReaderApi.start(cardReaderPort.current, 9600, sessionIdRef.current, userIdRef.current);
      if (result.session_id) {
        sessionIdRef.current = result.session_id;
      }
      if (!result.success) {
        throw new Error(result.error || 'Fehler beim Starten des Kartenlesers');
      }
      
      const startTime = Date.now();
      
      // Timeout nach 20 Sekunden
      timeoutRef.current = setTimeout(async () => {
        await stopScanning();
        setScanError('Timeout: Keine Karte innerhalb von 20 Sekunden gefunden');
      }, 20000);
      
      // Alle 500ms pollen
      scanIntervalRef.current = setInterval(async () => {
        try {
          const elapsed = Date.now() - startTime;
          const progress = Math.min((elapsed / 20000) * 100, 100);
          setScanProgress(progress);
          
          const result = await publicCardReaderApi.getData(sessionIdRef.current, userIdRef.current);
          if (result.success && result.code && result.code !== 'None' && result.code !== ' ' && result.code !== '') {
            const cleanCode = result.code.replace(/\0/g, '').trim();
            if (cleanCode) {
              // Prüfen ob Karte bereits vergeben ist (aber ignorieren wenn es der aktuelle User ist im Edit-Modus)
              const checkResult = await benutzerApi.checkCard(cleanCode);
              if (checkResult.vergeben) {
                // Im Edit-Modus: Prüfen ob die Karte dem aktuellen User gehört
                if (mode === 'edit' && editingUser && checkResult.benutzer.id === editingUser.id) {
                  // Gleiche Karte wie vorher - OK
                  setEditUserRfid(cleanCode);
                  await stopScanning();
                } else {
                  await stopScanning();
                  setCardTakenError(`Diese Karte ist bereits vergeben an: ${checkResult.benutzer.vorname} ${checkResult.benutzer.nachname}`);
                }
              } else {
                // Karte ist frei
                if (mode === 'edit') {
                  setEditUserRfid(cleanCode);
                } else {
                  setNewUserRfid(cleanCode);
                }
                await stopScanning();
              }
            }
          }
        } catch (e) {
          // Ignorieren
        }
      }, 500);
      
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Scan-Fehler');
      setIsScanning(false);
      setScanProgress(0);
    }
  };

  const clearCard = (mode: 'create' | 'edit' = 'create') => {
    if (mode === 'edit') {
      setEditUserRfid(null);
    } else {
      setNewUserRfid(null);
    }
    setCardTakenError(null);
  };

  // E-Mail Validierung (nur TH-Köln Domains)
  const validateEmail = (email: string): boolean => {
    const allowedDomains = ['@th-koeln.de', '@smail.th-koeln.de'];
    const emailLower = email.toLowerCase().trim();
    return allowedDomains.some(domain => emailLower.endsWith(domain));
  };

  const handleCreateUser = async () => {
    // Validierung
    if (!createForm.vorname.trim() || !createForm.nachname.trim() || !createForm.email.trim()) {
      setError('Alle Felder müssen ausgefüllt sein');
      return;
    }
    
    // E-Mail Domain prüfen
    if (!validateEmail(createForm.email)) {
      setError('Nur E-Mail-Adressen der TH Köln (@th-koeln.de oder @smail.th-koeln.de) sind erlaubt');
      return;
    }
    
    // Prüfen ob Rolle erlaubt ist
    const newRoleLevel = ROLE_HIERARCHY[createForm.rolle];
    if (newRoleLevel >= currentUserLevel) {
      setError('Sie können keine Rolle vergeben, die gleich oder höher ist als Ihre eigene');
      return;
    }
    
    setIsSaving(true);
    setError(null);
    
    // Safety timeout - reset isSaving after 30 seconds in case something hangs
    const safetyTimeout = setTimeout(() => {
      setIsSaving(false);
      setError('Zeitüberschreitung - bitte versuchen Sie es erneut');
    }, 30000);
    
    try {
      // Card Reader stoppen falls aktiv
      if (isScanning) {
        await stopScanning();
      }
      
      // API Call zum Erstellen des Benutzers
      await benutzerApi.create({
        vorname: createForm.vorname,
        nachname: createForm.nachname,
        email: createForm.email,
        rolle: createForm.rolle,
        rfid_karte: newUserRfid || undefined
        // Kein Passwort - User meldet sich per Karte an und setzt später Passwort
      });
      
      // Erfolg
      clearTimeout(safetyTimeout);
      setSuccess(`Benutzer "${createForm.vorname} ${createForm.nachname}" erstellt. ${newUserRfid ? 'Login mit Karte oder später mit Passwort möglich.' : 'Login per Karte möglich (Karte beim Admin hinterlegen!).'}`);
      setIsCreating(false);
      setCreateForm({
        vorname: '',
        nachname: '',
        email: '',
        rolle: 'Student'
      });
      setNewUserRfid(null);
      await loadUsers(); // Liste neu laden
      
      setTimeout(() => setSuccess(null), 5000);
    } catch (err) {
      clearTimeout(safetyTimeout);
      const msg = formatErrorMessage(err instanceof Error ? err : new Error('Unbekannter Fehler'));
      if (msg !== 'SESSION_EXPIRED') {
        setError(msg);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const getRoleBadgeColor = (rolle: string) => {
    switch (rolle) {
      case 'Admin': return 'bg-purple-100 text-purple-700';
      case 'Laborleiter': return 'bg-blue-100 text-blue-700';
      case 'Mitarbeiter': return 'bg-teal-100 text-teal-700';
      case 'Student': return 'bg-gray-100 text-gray-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-emerald-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="w-full px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Users className="w-8 h-8 text-teal-600" />
            <h1 className="text-teal-700">Ausleihsystem - Benutzerverwaltung</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">
              Angemeldet als: <span className="font-medium text-teal-700">{username}</span>
              <span className="ml-2 px-2 py-0.5 bg-teal-100 text-teal-700 text-xs rounded-full">
                {userRole}
              </span>
            </span>
            <button
              onClick={onBack}
              className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Zurück
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full px-6 lg:px-8 py-8">
        {/* Info-Box */}
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-md">
          <div className="flex items-start gap-3">
            <Shield className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800">
              <p className="font-medium">Berechtigungen</p>
              {userRole === 'Mitarbeiter' ? (
                <p>
                  Als Mitarbeiter können Sie nur <strong>Studenten</strong> sehen, anlegen und bearbeiten. 
                  Sie können keine Benutzer mit höherer oder gleicher Rolle verwalten.
                </p>
              ) : (
                <p>
                  Sie können nur Benutzer mit niedrigerer Rolle als Ihre eigene ({userRole}) bearbeiten. 
                  Sie können Rollen vergeben, die unter Ihrer eigenen Rolle liegen.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Status-Meldungen */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <span className="text-red-700">{error}</span>
          </div>
        )}
        
        {success && (
          <div className="mb-4 p-4 bg-emerald-50 border border-emerald-200 rounded-md text-emerald-700">
            {success}
          </div>
        )}

        {/* Legende */}
        <div className="mb-4 flex items-center gap-6 text-sm text-gray-600">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-emerald-600" />
            <span>Passwort gesetzt</span>
          </div>
          <div className="flex items-center gap-2">
            <Unlock className="w-4 h-4 text-gray-400" />
            <span>Nur Karten-Login</span>
          </div>
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-emerald-600" />
            <span>Karte hinterlegt</span>
          </div>
        </div>

        {/* Suchleiste */}
        <div className="mb-6 flex justify-between items-center flex-wrap gap-4">
          <div>
            <h2 className="text-teal-700">Alle Benutzer</h2>
            <p className="text-gray-600 mt-1">
              {searchQuery ? `${filteredUsers.length} von ${users.length} Benutzern gefunden` : `${users.length} Benutzer insgesamt`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Benutzer suchen..."
                className="pl-9 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm w-64"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <button
              onClick={() => setIsCreating(true)}
              className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-md hover:bg-teal-700 transition-colors shadow-sm"
            >
              <UserPlus className="w-4 h-4" />
              Neuer Benutzer
            </button>
          </div>
        </div>

        {/* Benutzer-Tabelle */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              {searchQuery ? 'Keine Benutzer gefunden' : 'Keine Benutzer vorhanden'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-teal-50 border-b border-teal-100">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm text-teal-700">Name</th>
                    <th className="px-6 py-3 text-left text-sm text-teal-700">E-Mail</th>
                    <th className="px-6 py-3 text-left text-sm text-teal-700">Rolle</th>
                    <th className="px-6 py-3 text-center text-sm text-teal-700">Passwort</th>
                    <th className="px-6 py-3 text-center text-sm text-teal-700">Karte</th>
                    <th className="px-6 py-3 text-right text-sm text-teal-700">Aktionen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-teal-50/50">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-gray-400" />
                          <span className="font-medium">{user.vorname} {user.nachname}</span>
                          {user.email === username && (
                            <span className="text-xs text-teal-600">(Sie)</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-gray-600">{user.email}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-block px-2 py-1 text-xs rounded-full ${getRoleBadgeColor(user.rolle)}`}>
                          {user.rolle}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        {user.hat_passwort ? (
                          <Lock className="w-4 h-4 text-emerald-600 mx-auto" title="Passwort gesetzt" />
                        ) : (
                          <Unlock className="w-4 h-4 text-gray-400 mx-auto" title="Nur Karten-Login" />
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {user.hat_karte ? (
                          <CreditCard className="w-4 h-4 text-emerald-600 mx-auto" title="Karte hinterlegt" />
                        ) : (
                          <span className="text-gray-300 text-xs" title="Keine Karte">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {canEditUser(user) ? (
                          <button
                            onClick={() => handleEditClick(user)}
                            className="p-2 text-gray-600 hover:text-teal-600 transition-colors"
                            title="Bearbeiten"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                        ) : (
                          <span className="text-xs text-gray-400">Keine Berechtigung</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Bearbeiten-Modal */}
      {editingUser && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50" onClick={(e) => { if (e.target === e.currentTarget) setEditingUser(null); }}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-teal-700">Benutzer bearbeiten</h3>
              <button 
                onClick={() => setEditingUser(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Vorname</label>
                  <input
                    type="text"
                    value={editForm.vorname}
                    onChange={(e) => setEditForm({...editForm, vorname: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nachname</label>
                  <input
                    type="text"
                    value={editForm.nachname}
                    onChange={(e) => setEditForm({...editForm, nachname: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">E-Mail</label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({...editForm, email: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rolle</label>
                <select
                  value={editForm.rolle}
                  onChange={(e) => setEditForm({...editForm, rolle: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  {getAvailableRoles().map(role => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Sie können nur Rollen unterhalb Ihrer eigenen ({userRole}) vergeben.
                </p>
              </div>
              
              {/* Karte scannen - wie bei Neuanlage */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                  <CreditCard className="w-4 h-4" />
                  Mitarbeiterkarte
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={editUserRfid || ''}
                    onChange={(e) => setEditUserRfid(e.target.value || null)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm font-mono"
                    placeholder="z.B. KARTE001"
                    readOnly={isScanning}
                  />
                  <button
                    onClick={() => handleScanRFID('edit')}
                    disabled={isSaving}
                    className={`px-3 py-2 rounded-md transition-colors flex items-center gap-2 text-sm ${
                      isScanning && cardScanMode === 'edit'
                        ? 'bg-teal-600 text-white animate-pulse'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {isScanning && cardScanMode === 'edit' ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Scanning...
                      </>
                    ) : (
                      <>
                        <CreditCard className="w-4 h-4" />
                        Scannen
                      </>
                    )}
                  </button>
                </div>
                
                {cardTakenError && (
                  <p className="text-xs text-red-600 mt-1">{cardTakenError}</p>
                )}
                {scanError && (
                  <p className="text-xs text-red-600 mt-1">{scanError}</p>
                )}
                
                {isScanning && cardScanMode === 'edit' && (
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
                
                {editUserRfid && !isScanning && (
                  <button
                    type="button"
                    onClick={() => clearCard('edit')}
                    className="mt-2 text-xs text-gray-500 hover:text-gray-700 underline"
                  >
                    Karte entfernen
                  </button>
                )}
                
                {!editUserRfid && !isScanning && (
                  <p className="text-xs text-gray-500 mt-1">
                    {editingUser?.hat_karte 
                      ? 'Aktuell ist eine andere Karte hinterlegt. Scannen Sie eine neue Karte oder lassen Sie das Feld leer.'
                      : 'Optional: Karte für Login ohne Passwort hinterlegen.'}
                  </p>
                )}
              </div>
            </div>
            
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setEditingUser(null)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Abbrechen
              </button>
              <button
                onClick={handleSaveUser}
                disabled={isSaving}
                className="px-4 py-2 bg-teal-600 text-white rounded-md hover:bg-teal-700 flex items-center gap-2 disabled:opacity-50"
              >
                {isSaving ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Speichern...</>
                ) : (
                  <><Save className="w-4 h-4" /> Speichern</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Neuer Benutzer-Modal */}
      {isCreating && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50" onClick={(e) => { if (e.target === e.currentTarget) setIsCreating(false); }}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-teal-700">Neuen Benutzer anlegen</h3>
              <button 
                onClick={() => setIsCreating(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Vorname *</label>
                  <input
                    type="text"
                    value={createForm.vorname}
                    onChange={(e) => setCreateForm({...createForm, vorname: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nachname *</label>
                  <input
                    type="text"
                    value={createForm.nachname}
                    onChange={(e) => setCreateForm({...createForm, nachname: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">E-Mail *</label>
                <input
                  type="email"
                  value={createForm.email}
                  onChange={(e) => setCreateForm({...createForm, email: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              
              {/* Karte scannen - wie im Profil */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                  <CreditCard className="w-4 h-4" />
                  Mitarbeiterkarte
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newUserRfid || ''}
                    onChange={(e) => setNewUserRfid(e.target.value || null)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm font-mono"
                    placeholder="z.B. KARTE001"
                    readOnly={isScanning}
                  />
                  <button
                    onClick={() => handleScanRFID('create')}
                    disabled={isSaving}
                    className={`px-3 py-2 rounded-md transition-colors flex items-center gap-2 text-sm ${
                      isScanning && cardScanMode === 'create'
                        ? 'bg-teal-600 text-white animate-pulse'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {isScanning && cardScanMode === 'create' ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Scanning...
                      </>
                    ) : (
                      <>
                        <CreditCard className="w-4 h-4" />
                        Scannen
                      </>
                    )}
                  </button>
                </div>
                
                {cardTakenError && (
                  <p className="text-xs text-red-600 mt-1">{cardTakenError}</p>
                )}
                {scanError && (
                  <p className="text-xs text-red-600 mt-1">{scanError}</p>
                )}
                
                {isScanning && cardScanMode === 'create' && (
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
                
                {newUserRfid && !isScanning && (
                  <button
                    type="button"
                    onClick={() => clearCard('create')}
                    className="mt-2 text-xs text-gray-500 hover:text-gray-700 underline"
                  >
                    Karte entfernen
                  </button>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rolle</label>
                <select
                  value={createForm.rolle}
                  onChange={(e) => setCreateForm({...createForm, rolle: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  {getAvailableRoles().map(role => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Sie können nur Rollen unterhalb Ihrer eigenen ({userRole}) vergeben.
                </p>
              </div>
            </div>
            
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setIsCreating(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Abbrechen
              </button>
              <button
                onClick={handleCreateUser}
                disabled={isSaving}
                className="px-4 py-2 bg-teal-600 text-white rounded-md hover:bg-teal-700 flex items-center gap-2 disabled:opacity-50"
              >
                {isSaving ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Erstellen...</>
                ) : (
                  <><UserPlus className="w-4 h-4" /> Benutzer anlegen</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
