/**
 * UUID-Generierung, die auch in nicht-secure contexts funktioniert (HTTP statt HTTPS).
 * crypto.randomUUID() ist nur in secure contexts verfügbar.
 */

/**
 * Generiert eine UUID v4.
 * Verwendet crypto.randomUUID() wenn verfügbar, sonst einen Fallback.
 */
export function generateUUID(): string {
  // Versuche crypto.randomUUID() (nur in secure contexts verfügbar)
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    try {
      return crypto.randomUUID();
    } catch {
      // Falls es fehlschlägt (nicht-secure context), Fallback verwenden
    }
  }
  
  // Fallback: Manuelle UUID v4 Generierung
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}
