/**
 * Turkish Paradise — Identity & Session Isolation Service
 * 
 * Provides strict multi-tenant isolation across devices, tabs, incognito windows,
 * and networks (same Wi-Fi/IP independent).
 * 
 * Hierarchy:
 * - clientId: Storage profile (localStorage, persists across sessions)
 * - tabId: Specific window/tab context (sessionStorage, persists across F5 in same tab)
 * - participantKey: clientId + ":" + tabId (exact unique participant identifier)
 * - connectionId: Runtime transport ephemeral ID
 * - playerId / spectatorId: Host-assigned game participants
 */

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch (e) {}
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const STORAGE_CLIENT_ID_KEY = 'tp_client_id';
const STORAGE_TAB_ID_KEY = 'tp_tab_id';

let inMemoryClientId: string | null = null;
let inMemoryTabId: string | null = null;

/**
 * Get or create unique browser profile client ID
 * Stored in localStorage, NEVER cleared on game session reset
 */
export function getClientId(): string {
  if (inMemoryClientId) return inMemoryClientId;
  if (typeof window !== 'undefined') {
    try {
      let stored = localStorage.getItem(STORAGE_CLIENT_ID_KEY);
      if (!stored || typeof stored !== 'string' || stored.length < 8) {
        stored = generateUUID();
        localStorage.setItem(STORAGE_CLIENT_ID_KEY, stored);
      }
      inMemoryClientId = stored;
      return stored;
    } catch (e) {}
  }
  if (!inMemoryClientId) inMemoryClientId = generateUUID();
  return inMemoryClientId;
}

/**
 * Get or create unique browser tab ID
 * Stored in sessionStorage, persists across F5 reloads in the same tab, unique per tab
 */
export function getTabId(): string {
  if (inMemoryTabId) return inMemoryTabId;
  if (typeof window !== 'undefined') {
    try {
      let stored = sessionStorage.getItem(STORAGE_TAB_ID_KEY);
      if (!stored || typeof stored !== 'string' || stored.length < 8) {
        stored = generateUUID();
        sessionStorage.setItem(STORAGE_TAB_ID_KEY, stored);
      }
      inMemoryTabId = stored;
      return stored;
    } catch (e) {}
  }
  if (!inMemoryTabId) inMemoryTabId = generateUUID();
  return inMemoryTabId;
}

/**
 * Participant Key: Unique per browser profile + tab
 * e.g. "a1b2c3d4-xxxx:e5f6g7h8-yyyy"
 */
export function getParticipantKey(): string {
  return `${getClientId()}:${getTabId()}`;
}

/**
 * Generate unique handshake transaction requestId
 */
export function createRequestId(prefix = 'req'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Deterministically create playerId from participantKey
 */
export function createPlayerId(participantKey?: string): string {
  const key = participantKey || getParticipantKey();
  const clean = key.replace(/[^a-zA-Z0-9]/g, '').slice(0, 16);
  return `p_${clean}`;
}

/**
 * Deterministically create spectatorId from participantKey
 */
export function createSpectatorId(participantKey?: string): string {
  const key = participantKey || getParticipantKey();
  const clean = key.replace(/[^a-zA-Z0-9]/g, '').slice(0, 16);
  return `s_${clean}`;
}

/**
 * Structured debug telemetry logger
 */
export function logIdentityTelemetry(event: string, meta: Record<string, any>): void {
  const cId = getClientId().slice(0, 8);
  const tId = getTabId().slice(0, 8);
  console.log(`[TP Telemetry] 🌐 [${event}] (client:${cId} tab:${tId})`, meta);
}
