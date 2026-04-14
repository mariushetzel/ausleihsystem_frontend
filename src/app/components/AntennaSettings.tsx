import { useState, useEffect } from 'react';
import { ArrowLeft, Radio, Wifi, Usb, Server, Power, RefreshCw, Check, Loader2, Shield, MapPin, Settings2, AtSign, Plus, Edit, Trash2, X } from 'lucide-react';
import { rfidAntennaApi, emailDomainApi, systemEinstellungenApi, type EmailDomain } from '../api';

interface AntennaSettingsProps {
  username: string;
  onBack: () => void;
  onCategoriesChanged?: () => void;
  onNavigateToCategorySettings?: () => void;
}

// Rollen für Kategorie-Berechtigungen - verwendet in CategorySettings
const ROLES = [
  { value: 'Student', label: 'Student' },
  { value: 'Mitarbeiter', label: 'Mitarbeiter' },
  { value: 'Laborleiter', label: 'Laborleiter' },
  { value: 'Admin', label: 'Admin' },
];

// Region-Optionen laut User Manual 2.2.8
const REGIONS = [
  { value: 0, label: 'Benutzerdefiniert (Custom)', startFreq: 920.125, endFreq: 924.875, isCustom: true },
  { value: 1, label: 'US [902.75~927.25]', startFreq: 902.75, endFreq: 927.25 },
  { value: 2, label: 'Korea [917.1~923.5]', startFreq: 917.1, endFreq: 923.5 },
  { value: 3, label: 'EU [865.1~868.1]', startFreq: 865.1, endFreq: 868.1 },
  { value: 4, label: 'Japan [952.2~953.6]', startFreq: 952.2, endFreq: 953.6 },
  { value: 5, label: 'Malaysia [919.5~922.5]', startFreq: 919.5, endFreq: 922.5 },
  { value: 6, label: 'EU3 [865.7~867.5]', startFreq: 865.7, endFreq: 867.5 },
  { value: 7, label: 'China Band 1 [840.125~844.875]', startFreq: 840.125, endFreq: 844.875 },
  { value: 8, label: 'China Band 2 [920.125~924.875]', startFreq: 920.125, endFreq: 924.875 },
];

// Frequenzschritt-Optionen (KHz)
const STEP_FREQUENCIES = [125, 200, 250, 500, 600];

// Baudrate-Optionen
const BAUDRATES = ['9600', '19200', '38400', '57600', '115200'];

// Storage Keys
const STORAGE_KEYS = {
  ANT_PORT: 'antenna_port',
  ANT_BAUDRATE: 'antenna_baudrate',
  CARD_PORT: 'cardreader_port',
  CARD_BAUDRATE: 'cardreader_baudrate',
  BACKEND_IP: 'backend_ip',
};

// Bereinigt Fehlermeldungen - entfernt HTML-Stacktraces und kürzt auf lesbare Länge
const formatErrorMessage = (error: string | Error): string => {
  let msg = error instanceof Error ? error.message : String(error);
  
  // HTML-Stacktraces erkennen und entfernen (Django Debug-Seite)
  if (msg.includes('<!DOCTYPE') || msg.includes('<html')) {
    const apiMatch = msg.match(/\/api\/\w+/);
    if (apiMatch) {
      return `Serverfehler bei ${apiMatch[0]} - Gerät antwortet nicht korrekt`;
    }
    return 'Serverfehler - Verbindung zum Gerät nicht möglich';
  }
  
  // UnicodeDecodeError speziell behandeln
  if (msg.includes('UnicodeDecodeError')) {
    return 'Falsches Gerät - Dieser Port scheint nicht die RFID-Antenne zu sein';
  }
  
  // Lange Fehlermeldungen kürzen
  if (msg.length > 150) {
    msg = msg.substring(0, 150) + '...';
  }
  
  return msg;
};

// Speichert Einstellungen lokal und serverseitig (falls möglich)
const saveSetting = async (schluessel: string, wert: string, beschreibung?: string) => {
  // Lokal speichern
  const localKeyMap: Record<string, string> = {
    'antenna_port': STORAGE_KEYS.ANT_PORT,
    'antenna_baudrate': STORAGE_KEYS.ANT_BAUDRATE,
    'cardreader_port': STORAGE_KEYS.CARD_PORT,
    'cardreader_baudrate': STORAGE_KEYS.CARD_BAUDRATE,
  };
  
  if (localKeyMap[schluessel]) {
    localStorage.setItem(localKeyMap[schluessel], wert);
  }
  
  // Serverseitig speichern (im Hintergrund, Fehler ignorieren)
  try {
    await systemEinstellungenApi.set(schluessel, wert, beschreibung);
  } catch (err) {
    // Server-Fehler ignorieren - lokale Einstellung hat Priorität
  }
};

// Erkennt verfügbare Antennen-Ports
const loadAvailablePortsFromBackend = async (): Promise<string[]> => {
  try {
    const result = await rfidAntennaApi.getPorts();
    return result.ports || [];
  } catch {
    return [];
  }
};

export function AntennaSettings({ username, onBack, onCategoriesChanged, onNavigateToCategorySettings }: AntennaSettingsProps) {
  // Antenna Serial Settings
  const [antPort, setAntPort] = useState('/dev/ttyUSB2');
  const [antBaudrate, setAntBaudrate] = useState('115200');
  const [availablePorts, setAvailablePorts] = useState<string[]>([]);
  
  // Card Reader Serial Settings
  const [cardPort, setCardPort] = useState('/dev/ttyUSB0');
  const [cardBaudrate, setCardBaudrate] = useState('9600');
  
  // Backend Settings
  const [backendIp, setBackendIp] = useState('localhost:8000');
  
  // RF Settings
  const [rfPower, setRfPower] = useState<number | null>(null);
  const [rssiThreshold, setRssiThreshold] = useState<number | null>(null);
  const [region, setRegion] = useState<number | null>(null);
  const [buzzerEnabled, setBuzzerEnabled] = useState<boolean>(false);
  
  // E-Mail Domain Verwaltung
  const [emailDomains, setEmailDomains] = useState<EmailDomain[]>([]);
  const [isLoadingEmailDomains, setIsLoadingEmailDomains] = useState(false);
  const [newEmailDomain, setNewEmailDomain] = useState('');
  const [newEmailDomainDesc, setNewEmailDomainDesc] = useState('');
  const [editingEmailDomain, setEditingEmailDomain] = useState<EmailDomain | null>(null);
  const [editingEmailDomainError, setEditingEmailDomainError] = useState<string | null>(null);
  const [startFreq, setStartFreq] = useState<number | null>(null);
  const [endFreq, setEndFreq] = useState<number | null>(null);
  
  // Custom Frequenz-Einstellungen (für Region 0)
  const [customStartFreq, setCustomStartFreq] = useState<number>(920.125);
  const [customStepFreq, setCustomStepFreq] = useState<number>(125);
  const [customCN, setCustomCN] = useState<number>(19);
  

  
  // Loading State
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Auto-hide toast after 3 seconds
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => {
        setMessage(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  // Beim ersten Laden
  useEffect(() => {
    const init = async () => {
      try {
        const ports = await loadAvailablePortsFromBackend();
        const availablePortsList = ports.length > 0 ? ports : ['/dev/ttyUSB0', '/dev/ttyUSB1', '/dev/ttyUSB2'];
        setAvailablePorts(availablePortsList);
        
        const savedAntPort = localStorage.getItem(STORAGE_KEYS.ANT_PORT);
        const savedAntBaudrate = localStorage.getItem(STORAGE_KEYS.ANT_BAUDRATE);
        
        const targetPort = savedAntPort && availablePortsList.includes(savedAntPort) 
          ? savedAntPort 
          : availablePortsList[0] || '/dev/ttyUSB0';
        const targetBaudrate = savedAntBaudrate || '115200';
        
        setAntPort(targetPort);
        setAntBaudrate(targetBaudrate);
        
        if (!savedAntPort || savedAntPort !== targetPort) {
          localStorage.setItem(STORAGE_KEYS.ANT_PORT, targetPort);
        }
        if (!savedAntBaudrate || savedAntBaudrate !== targetBaudrate) {
          localStorage.setItem(STORAGE_KEYS.ANT_BAUDRATE, targetBaudrate);
        }
        
        const savedCardPort = localStorage.getItem(STORAGE_KEYS.CARD_PORT) || '/dev/ttyUSB0';
        const savedCardBaudrate = localStorage.getItem(STORAGE_KEYS.CARD_BAUDRATE) || '9600';
        setCardPort(savedCardPort);
        setCardBaudrate(savedCardBaudrate);
        
        const savedBackendIp = localStorage.getItem(STORAGE_KEYS.BACKEND_IP) || 'localhost:8000';
        setBackendIp(savedBackendIp);
        
        try {
          await loadDeviceParams(targetPort, targetBaudrate);
        } catch {
          setMessage({ 
            type: 'error', 
            text: `Port ${targetPort} nicht erreichbar. Bitte wählen Sie den richtigen Port aus der Liste.` 
          });
        }
        
        // E-Mail Domains laden
        await loadEmailDomains();
        
      } catch (err) {
        setMessage({ type: 'error', text: formatErrorMessage(err instanceof Error ? err : new Error('Fehler beim Laden der Ports')) });
      }
    };
    
    init();
  }, []);


  // Geräteparameter laden
  const loadDeviceParams = async (port: string = antPort, baudrate: string = antBaudrate) => {
    if (!port || !baudrate) {
      setMessage({ type: 'error', text: 'Port oder Baudrate nicht gesetzt' });
      setIsLoading(false);
      return;
    }
    
    setIsLoading(true);
    setMessage(null);
    
    let hComm: number | null = null;
    
    try {
      const openResult = await rfidAntennaApi.openDevice(port, parseInt(baudrate));
      if (!openResult.success) {
        setMessage({ type: 'error', text: formatErrorMessage('Fehler beim Öffnen: ' + openResult.log) });
        setIsLoading(false);
        return;
      }
      
      hComm = openResult.hComm;
      
      const params = await rfidAntennaApi.getDevicePara(hComm);
      
      setRfPower(params.RFIDPOWER);
      setRssiThreshold(params.RSSITHRESHOLD || -75);
      setRegion(params.REGION);
      setBuzzerEnabled(params.BUZZERTIME > 0);
      
      // Frequenzwerte laden (mit STRATFRED für präzise Frequenz)
      if (params.STRATFREI !== undefined) {
        const stratfrei = parseFloat(params.STRATFREI);
        const stratfred = parseFloat(params.STRATFRED || 0);
        const actualStartFreq = stratfrei + (stratfred / 1000);
        setStartFreq(actualStartFreq);
        setCustomStartFreq(actualStartFreq);
      }
      if (params.STEPFRE && params.CN) {
        const stepFreq = parseFloat(params.STEPFRE);
        const cn = parseInt(params.CN);
        const calculatedEnd = parseFloat(params.STRATFREI) + (cn * stepFreq / 1000);
        setEndFreq(calculatedEnd);
        setCustomStepFreq(stepFreq);
        setCustomCN(cn);
      }
      
    } catch (e) {
      setMessage({ type: 'error', text: formatErrorMessage(e instanceof Error ? e : new Error('Unbekannter Fehler beim Laden')) });
    } finally {
      if (hComm !== null) {
        try {
          await rfidAntennaApi.closeDevice(hComm);
        } catch (closeErr) {
          // Schließen-Fehler ignorieren
        }
      }
      setIsLoading(false);
    }
  };

  // Wenn Port im Dropdown geändert wird
  const handlePortChange = async (newPort: string) => {
    setAntPort(newPort);
    await saveSetting('antenna_port', newPort, 'RFID Antennen Port');
    await loadDeviceParams(newPort, antBaudrate);
  };

  const handleBaudrateChange = async (newBaudrate: string) => {
    setAntBaudrate(newBaudrate);
    await saveSetting('antenna_baudrate', newBaudrate, 'RFID Antennen Baudrate');
    loadDeviceParams(antPort, newBaudrate);
  };

  // Einstellungen anwenden
  const applySettings = async (andGoBack: boolean = false) => {
    setIsSaving(true);
    setMessage(null);
    
    let hComm: number | null = null;
    
    try {
      const currentPort = antPort;
      const currentBaudrate = antBaudrate;
      
      // Einstellungen lokal und serverseitig speichern
      await saveSetting('antenna_port', currentPort, 'RFID Antennen Port');
      await saveSetting('antenna_baudrate', currentBaudrate, 'RFID Antennen Baudrate');
      
      const openResult = await rfidAntennaApi.openDevice(currentPort, parseInt(currentBaudrate));
      if (!openResult.success) {
        setMessage({ type: 'error', text: formatErrorMessage('Fehler beim Öffnen: ' + openResult.log) });
        setIsSaving(false);
        return;
      }
      
      hComm = openResult.hComm;
      
      const currentParams = await rfidAntennaApi.getDevicePara(hComm);
      
      // Frequenzparameter berechnen
      const isCustomRegion = region === 0;
      const actualStartFreq = isCustomRegion ? customStartFreq : (startFreq || 920);
      const actualStepFreq = isCustomRegion ? customStepFreq : 250;
      const actualCN = isCustomRegion ? customCN : Math.min(Math.round(((endFreq || 928) - (actualStartFreq)) * 1000 / actualStepFreq) + 1, 255);
      
      // STRATFREI und STRATFRED berechnen (Startfrequenz = STRATFREI + STRATFRED/1000)
      const stratfrei = Math.floor(actualStartFreq);
      const stratfred = Math.round((actualStartFreq - stratfrei) * 1000);
      
      const newParams = {
        hComm: hComm,
        DEVICEARRD: currentParams.DEVICEARRD,
        RFIDPRO: currentParams.RFIDPRO,
        WORKMODE: currentParams.WORKMODE,
        INTERFACE: currentParams.INTERFACE,
        BAUDRATE: parseInt(currentBaudrate),
        WGSET: currentParams.WGSET,
        ANT: currentParams.ANT,
        REGION: region ?? 1,
        STRATFREI: stratfrei,
        STRATFRED: stratfred,
        STEPFRE: actualStepFreq,
        CN: actualCN,
        RFIDPOWER: rfPower ?? 30,
        INVENTORYAREA: currentParams.INVENTORYAREA,
        QVALUE: currentParams.QVALUE,
        SESSION: currentParams.SESSION,
        ACSADDR: currentParams.ACSADDR,
        ACSDATALEN: currentParams.ACSDATALEN,
        FILTERTIME: currentParams.FILTERTIME,
        TRIGGLETIME: currentParams.TRIGGLETIME,
        BUZZERTIME: buzzerEnabled ? 1 : 0,
        INTERNELTIME: currentParams.INTERNELTIME,
      };
      
      const result = await rfidAntennaApi.setDevicePara(hComm, newParams);
      
      // HINWEIS: RSSI Filter setzen funktioniert aktuell nicht korrekt mit der Hardware.
      // Das Gerät speichert den Wert nicht (immer Rückgabe von 0xB100 = -20224).
      // Der Slider zeigt daher nur den aktuellen Wert an, ohne ihn zu speichern.
      
      if (result.success) {
        setMessage({ type: 'success', text: 'Einstellungen erfolgreich angewendet' });
        if (andGoBack) {
          onBack();
        }
      } else {
        setMessage({ type: 'error', text: formatErrorMessage('Fehler beim Anwenden: ' + result.log) });
      }
      
    } catch (e) {
      setMessage({ type: 'error', text: formatErrorMessage(e instanceof Error ? e : new Error('Unbekannter Fehler')) });
    } finally {
      if (hComm !== null) {
        try {
          await rfidAntennaApi.closeDevice(hComm);
        } catch (closeErr) {
          // Schließen-Fehler ignorieren
        }
      }
      setIsSaving(false);
    }
  };

  // Gerät rebooten
  const handleReboot = async () => {
    setIsSaving(true);
    setMessage(null);
    
    let hComm: number | null = null;
    
    try {
      const openResult = await rfidAntennaApi.openDevice(antPort, parseInt(antBaudrate));
      if (!openResult.success) {
        setMessage({ type: 'error', text: formatErrorMessage('Fehler beim Öffnen: ' + openResult.log) });
        setIsSaving(false);
        return;
      }
      
      hComm = openResult.hComm;
      const result = await rfidAntennaApi.rebootDevice(hComm);
      
      if (result.success) {
        setMessage({ type: 'success', text: 'Gerät erfolgreich neu gestartet' });
      } else {
        setMessage({ type: 'error', text: formatErrorMessage('Fehler beim Reboot: ' + result.log) });
      }
      
    } catch (e) {
      setMessage({ type: 'error', text: formatErrorMessage(e instanceof Error ? e : new Error('Unbekannter Fehler')) });
    } finally {
      if (hComm !== null) {
        try {
          await rfidAntennaApi.closeDevice(hComm);
        } catch (closeErr) {
          // Schließen-Fehler ignorieren
        }
      }
      setIsSaving(false);
    }
  };

  // Region ändern -> Frequenz automatisch anpassen (außer bei Custom)
  const handleRegionChange = (newRegion: number) => {
    setRegion(newRegion);
    const selectedRegion = REGIONS.find(r => r.value === newRegion);
    if (selectedRegion && !selectedRegion.isCustom) {
      setStartFreq(selectedRegion.startFreq);
      setEndFreq(selectedRegion.endFreq);
    }
  };

  // E-Mail Domains laden
  const loadEmailDomains = async () => {
    setIsLoadingEmailDomains(true);
    try {
      const domains = await emailDomainApi.getAll();
      setEmailDomains(domains);
    } catch (err) {
      // Domains-Ladefehler ignorieren
    } finally {
      setIsLoadingEmailDomains(false);
    }
  };

  // Neue E-Mail Domain erstellen
  const handleCreateEmailDomain = async () => {
    if (!newEmailDomain.trim()) return;
    
    // Stelle sicher, dass Domain mit @ beginnt
    let domain = newEmailDomain.trim().toLowerCase();
    if (!domain.startsWith('@')) {
      domain = '@' + domain;
    }
    
    try {
      const result = await emailDomainApi.create(domain, '');
      
      if (result.existing) {
        setMessage({ type: 'error', text: `Domain "${result.domain}" existiert bereits` });
      } else {
        setMessage({ type: 'success', text: `Domain "${result.domain}" erstellt` });
        setNewEmailDomain('');
        setNewEmailDomainDesc('');
        await loadEmailDomains();
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: `Fehler: ${err.message || 'Unbekannter Fehler'}` });
    }
  };

  // E-Mail Domain aktualisieren
  const handleUpdateEmailDomain = async () => {
    if (!editingEmailDomain) return;
    
    try {
      await emailDomainApi.update(editingEmailDomain.id, {
        domain: editingEmailDomain.domain,
        beschreibung: editingEmailDomain.beschreibung,
      });
      
      setMessage({ type: 'success', text: `Domain "${editingEmailDomain.domain}" aktualisiert` });
      setEditingEmailDomain(null);
      setEditingEmailDomainError(null);
      await loadEmailDomains();
    } catch (err: any) {
      setEditingEmailDomainError(err.message || 'Unbekannter Fehler');
    }
  };

  // E-Mail Domain löschen
  const handleDeleteEmailDomain = async (domain: EmailDomain) => {
    if (!confirm(`Domain "${domain.domain}" wirklich löschen?`)) return;
    
    try {
      await emailDomainApi.delete(domain.id);
      setMessage({ type: 'success', text: `Domain "${domain.domain}" gelöscht` });
      await loadEmailDomains();
    } catch (err: any) {
      setMessage({ type: 'error', text: `Fehler: ${err.message || 'Unbekannter Fehler'}` });
    }
  };

  // Lade-Anzeige
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-teal-50 to-emerald-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-teal-600 mx-auto mb-4" />
          <p className="text-gray-600">Lade Geräteparameter...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-emerald-50">
      <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-50">
        <div className="w-full px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Radio className="w-8 h-8 text-teal-600" />
            <h1 className="text-teal-700">Ausleihsystem - Einstellungen</h1>
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

      {/* Toast Notification */}
      {message && (
        <div className={`fixed top-20 right-4 z-50 px-6 py-4 rounded-lg shadow-lg text-white font-medium flex items-center gap-3 ${message.type === 'success' ? 'bg-emerald-500' : 'bg-red-500'}`}>
          <span>{message.text}</span>
          <button
            onClick={() => setMessage(null)}
            className="hover:opacity-80 transition-opacity"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <main className="w-full px-6 lg:px-8 py-8 overflow-y-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Spalte 1: Antenna, Reboot, Card Reader */}
          <div className="space-y-6">
            {/* Antenna Serial Connect */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <Wifi className="w-5 h-5 text-teal-600" />
                Antenna Serial Connect
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Port</label>
                  <select
                    value={antPort}
                    onChange={(e) => handlePortChange(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
                  >
                    {availablePorts.map(port => (
                      <option key={port} value={port}>{port}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Baudrate</label>
                  <select
                    value={antBaudrate}
                    onChange={(e) => handleBaudrateChange(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
                  >
                    {BAUDRATES.map(rate => (
                      <option key={rate} value={rate}>{rate}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Reboot Antenne */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <button
                onClick={handleReboot}
                disabled={isSaving}
                className="w-full px-4 py-3 bg-red-50 text-red-700 border border-red-200 rounded-md hover:bg-red-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Reboot Antenne
              </button>
            </div>

            {/* Card Reader Serial Connect */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <Usb className="w-5 h-5 text-teal-600" />
                Card Reader Serial Connect
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Port</label>
                  <select
                    value={cardPort}
                    onChange={async (e) => {
                      setCardPort(e.target.value);
                      await saveSetting('cardreader_port', e.target.value, 'Card Reader Port');
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
                  >
                    {availablePorts.map(port => (
                      <option key={port} value={port}>{port}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Baudrate</label>
                  <select
                    value={cardBaudrate}
                    onChange={async (e) => {
                      setCardBaudrate(e.target.value);
                      await saveSetting('cardreader_baudrate', e.target.value, 'Card Reader Baudrate');
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
                  >
                    {BAUDRATES.map(rate => (
                      <option key={rate} value={rate}>{rate}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Spalte 2: RF-Power/RSSI, Frequenz */}
          <div className="space-y-6">
            {/* RF-Power / RSSI Threshold */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <Power className="w-5 h-5 text-teal-600" />
                RF-Power / RSSI Threshold
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    RF-Power: {rfPower} dBm
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="33"
                    value={rfPower ?? 30}
                    onChange={(e) => setRfPower(parseInt(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-teal-600"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>0 dBm</span>
                    <span>33 dBm</span>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    RSSI Threshold: {rssiThreshold ?? -75} dBm
                  </label>
                  <input
                    type="range"
                    min="-100"
                    max="-30"
                    value={rssiThreshold ?? -75}
                    onChange={(e) => setRssiThreshold(parseInt(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-teal-600"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>-100 dBm</span>
                    <span>-30 dBm</span>
                  </div>
                </div>
                
                {/* Buzzer (Audio Feedback) */}
                <div className="pt-4 border-t border-gray-200">
                  <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors">
                    <input
                      type="checkbox"
                      checked={buzzerEnabled}
                      onChange={(e) => setBuzzerEnabled(e.target.checked)}
                      className="w-8 h-8 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                    />
                    <div className="flex-1">
                      <span className="block text-sm font-medium text-gray-700">Buzzer aktiviert</span>
                      <span className="block text-xs text-gray-500">
                        {buzzerEnabled ? 'Audio-Feedback beim Scannen eingeschaltet' : 'Audio-Feedback beim Scannen ausgeschaltet'}
                      </span>
                    </div>
                  </label>
                </div>
              </div>
            </div>

            {/* Frequenz */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <Radio className="w-5 h-5 text-teal-600" />
                Frequenz
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Region</label>
                  <select
                    value={region ?? 1}
                    onChange={(e) => handleRegionChange(parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
                  >
                    {REGIONS.map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>
                
                {region === 0 ? (
                  /* Custom Frequenz-Einstellungen */
                  <div className="space-y-4 p-4 bg-amber-50 rounded-lg border border-amber-200">
                    <h3 className="text-sm font-medium text-amber-800 flex items-center gap-2">
                      <Settings2 className="w-4 h-4" />
                      Benutzerdefinierte Frequenz
                    </h3>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Start-Frequenz (MHz)
                        <span className="text-xs text-gray-500 ml-1">(Format: 920.125)</span>
                      </label>
                      <input
                        type="number"
                        step="0.001"
                        min="840"
                        max="960"
                        value={customStartFreq}
                        onChange={(e) => setCustomStartFreq(parseFloat(e.target.value))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        STRATFREI: {Math.floor(customStartFreq)} + STRATFRED: {Math.round((customStartFreq - Math.floor(customStartFreq)) * 1000)}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Frequenzschritt (KHz)
                        </label>
                        <select
                          value={customStepFreq}
                          onChange={(e) => setCustomStepFreq(parseInt(e.target.value))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
                        >
                          {STEP_FREQUENCIES.map(step => (
                            <option key={step} value={step}>{step} KHz</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Anzahl Kanäle (CN)
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="255"
                          value={customCN}
                          onChange={(e) => setCustomCN(Math.min(255, Math.max(1, parseInt(e.target.value) || 1)))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
                        />
                      </div>
                    </div>
                    <div className="text-xs text-amber-700 bg-amber-100 p-2 rounded">
                      <p>Berechneter Bereich:</p>
                      <p className="font-mono mt-1">
                        {customStartFreq.toFixed(3)} MHz - {(customStartFreq + (customCN * customStepFreq / 1000)).toFixed(3)} MHz
                      </p>
                      <p className="mt-1">
                        (Fmax = {customStartFreq.toFixed(3)} + {customCN} × {customStepFreq}/1000)
                      </p>
                    </div>
                  </div>
                ) : (
                  /* Standard-Anzeige für vordefinierte Regionen */
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Start-Frequenz (MHz)</label>
                      <input
                        type="number"
                        step="0.1"
                        min="840"
                        max="960"
                        value={startFreq ?? 920}
                        disabled
                        className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100 text-gray-600"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">End-Frequenz (MHz)</label>
                      <input
                        type="number"
                        step="0.1"
                        min="840"
                        max="960"
                        value={endFreq ?? 928}
                        disabled
                        className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100 text-gray-600"
                      />
                    </div>
                  </div>
                )}
                
                {region !== 0 && (
                  <p className="text-xs text-gray-500">
                    Frequenzbereich: {(startFreq ?? 920).toFixed(3)} - {(endFreq ?? 928).toFixed(3)} MHz
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Spalte 3: Backend IP, E-Mail Domains, Weitere Einstellungen */}
          <div className="space-y-6">
            {/* Backend IP */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <Server className="w-5 h-5 text-teal-600" />
                Backend
              </h2>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">IP / URL</label>
                <input
                  type="text"
                  value={backendIp}
                  onChange={(e) => {
                    setBackendIp(e.target.value);
                    localStorage.setItem(STORAGE_KEYS.BACKEND_IP, e.target.value);
                    // Backend-URL ist client-spezifisch, daher nur lokal speichern
                  }}
                  placeholder="localhost:8000"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>

            {/* E-Mail Domain Verwaltung */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <AtSign className="w-5 h-5 text-teal-600" />
                E-Mail Domains
              </h2>
              <p className="text-xs text-gray-500 mb-3">
                Nur Benutzer mit diesen E-Mail-Endungen können sich registrieren.
              </p>
              
              {/* Neue Domain erstellen */}
              <div className="flex items-center gap-2 mb-4">
                <input
                  type="text"
                  value={newEmailDomain}
                  onChange={(e) => setNewEmailDomain(e.target.value)}
                  placeholder="@th-koeln.de"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
                />
                <button
                  onClick={handleCreateEmailDomain}
                  disabled={!newEmailDomain.trim() || isLoadingEmailDomains}
                  className="p-2 bg-teal-600 text-white rounded-md hover:bg-teal-700 disabled:opacity-50 flex items-center justify-center"
                  title="Domain hinzufügen"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              {/* Domains-Liste */}
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {isLoadingEmailDomains ? (
                  <p className="text-sm text-gray-500 text-center py-2">Lade Domains...</p>
                ) : emailDomains.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-2">Keine Domains konfiguriert</p>
                ) : (
                  emailDomains.map(domain => (
                    <div
                      key={domain.id}
                      className="flex items-center justify-between p-2 bg-gray-50 rounded hover:bg-gray-100"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{domain.domain}</p>
                        {domain.beschreibung && (
                          <span className="text-xs text-gray-500">{domain.beschreibung}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setEditingEmailDomain(domain)}
                          className="p-1 text-gray-400 hover:text-teal-600"
                          title="Bearbeiten"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteEmailDomain(domain)}
                          className="p-1 text-gray-400 hover:text-red-600"
                          title="Löschen"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Kategorien & Verbleib-Orte Button */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <Settings2 className="w-5 h-5 text-teal-600" />
                Verwaltung
              </h2>
              <button
                onClick={onNavigateToCategorySettings}
                className="w-full px-4 py-3 bg-teal-50 text-teal-700 border border-teal-200 rounded-md hover:bg-teal-100 transition-colors flex items-center justify-center gap-2"
              >
                <Shield className="w-4 h-4" />
                Kategorien & Verbleib-Orte
              </button>
              <p className="text-xs text-gray-500 mt-2">
                Verwalten Sie Warenkategorien und Verbleib-Orte für die Ausleihe.
              </p>
            </div>
          </div>
        </div>

        {/* Aktions-Buttons */}
        <div className="mt-8 flex justify-center gap-4">
          <button
            onClick={onBack}
            className="px-6 py-2 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
          >
            Abbrechen
          </button>
          <button
            onClick={() => applySettings(false)}
            disabled={isSaving}
            className="px-6 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            {isSaving ? 'Wird angewendet...' : 'Parameter anwenden'}
          </button>
          <button
            onClick={() => applySettings(true)}
            disabled={isSaving}
            className="px-6 py-2 bg-teal-600 text-white rounded-md hover:bg-teal-700 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            <Check className="w-4 h-4" />
            {isSaving ? 'Wird angewendet...' : 'OK'}
          </button>
        </div>
      </main>

      {/* Edit Email Domain Dialog */}
      {editingEmailDomain && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">E-Mail Domain bearbeiten</h3>
            
            {/* Fehleranzeige im Dialog */}
            {editingEmailDomainError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <span className="text-red-700 text-sm">{editingEmailDomainError}</span>
              </div>
            )}
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Domain</label>
                <input
                  type="text"
                  value={editingEmailDomain.domain}
                  onChange={(e) => {
                    setEditingEmailDomain({ ...editingEmailDomain, domain: e.target.value });
                    setEditingEmailDomainError(null);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Beschreibung</label>
                <input
                  type="text"
                  value={editingEmailDomain.beschreibung}
                  onChange={(e) => setEditingEmailDomain({ ...editingEmailDomain, beschreibung: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setEditingEmailDomain(null);
                  setEditingEmailDomainError(null);
                }}
                className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Abbrechen
              </button>
              <button
                onClick={handleUpdateEmailDomain}
                className="px-4 py-2 bg-teal-600 text-white rounded-md hover:bg-teal-700"
              >
                Speichern
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
