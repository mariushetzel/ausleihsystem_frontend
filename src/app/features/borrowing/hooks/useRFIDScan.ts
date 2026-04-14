/**
 * useRFIDScan Hook - RFID-Scanning Logik
 */
import { useState, useCallback, useRef } from 'react';
import { rfidAntennaApi } from '../../../api';
import { generateUUID } from '../../../utils/uuid';

export interface UseRFIDScanReturn {
  isScanning: boolean;
  scannedTagIds: Set<string>;
  scanProgress: number;
  scanError: string | null;
  startScan: (onTagFound?: (tagId: string) => void) => Promise<void>;
  stopScan: () => Promise<void>;
  resetScan: () => void;
}

export function useRFIDScan(): UseRFIDScanReturn {
  const [isScanning, setIsScanning] = useState(false);
  const [scannedTagIds, setScannedTagIds] = useState<Set<string>>(new Set());
  const [scanProgress, setScanProgress] = useState(0);
  const [scanError, setScanError] = useState<string | null>(null);
  
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const sessionIdRef = useRef<string>(generateUUID());

  const stopScan = useCallback(async () => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    
    try {
      await rfidAntennaApi.inventoryStop();
      await rfidAntennaApi.closeDevice();
    } catch (e) {
      // Ignore cleanup errors
    }
    
    setIsScanning(false);
    setScanProgress(0);
  }, []);

  const startScan = useCallback(async (onTagFound?: (tagId: string) => void) => {
    const port = localStorage.getItem('antenna_port');
    const baudrate = localStorage.getItem('antenna_baudrate');
    
    if (!port || !baudrate) {
      setScanError('Antenne nicht konfiguriert');
      return;
    }

    setScanError(null);
    setIsScanning(true);
    setScannedTagIds(new Set());

    try {
      // Prüfe ob jemand anders scannt
      const status = await rfidAntennaApi.getScanningStatus();
      if (status.scanning) {
        setScanError('Ein anderer Benutzer scannt gerade');
        setIsScanning(false);
        return;
      }

      // Öffne Gerät
      const openResult = await rfidAntennaApi.openDevice(port, parseInt(baudrate), sessionIdRef.current);
      if (!openResult.success) {
        throw new Error(openResult.log || 'Konnte Gerät nicht öffnen');
      }

      // Starte Scanning
      await rfidAntennaApi.startCounting();

      // Polling Interval
      scanIntervalRef.current = setInterval(async () => {
        try {
          const tags = await rfidAntennaApi.getTagInfo();
          
          if (tags && tags.length > 0) {
            setScannedTagIds(prev => {
              const newSet = new Set(prev);
              tags.forEach(tag => {
                const tagId = tag.epc.toLowerCase();
                if (!prev.has(tagId)) {
                  newSet.add(tagId);
                  onTagFound?.(tagId);
                }
              });
              return newSet;
            });
          }
        } catch (e) {
          // Ignore polling errors
        }
      }, 500);

    } catch (error: any) {
      setScanError(error.message || 'Scan fehlgeschlagen');
      await stopScan();
    }
  }, [stopScan]);

  const resetScan = useCallback(() => {
    setScannedTagIds(new Set());
    setScanError(null);
    setScanProgress(0);
  }, []);

  return {
    isScanning,
    scannedTagIds,
    scanProgress,
    scanError,
    startScan,
    stopScan,
    resetScan
  };
}

export default useRFIDScan;
