import { GameState } from '../types/game';
import { getParticipantKey } from './identityService';

export interface ClientAuthOptions {
  token?: string | null;
  guestToken?: string | null;
  participantKey?: string;
  userId?: string;
}

export interface SendActionResult {
  success: boolean;
  roomId?: string;
  actionId?: string;
  version?: number;
  state?: GameState;
  events?: any[];
  error?: string;
  errorMessage?: string;
  message?: string;
  currentVersion?: number;
}

export interface FetchStateResult {
  success: boolean;
  roomId?: string;
  version?: number;
  state?: GameState;
  error?: string;
  errorMessage?: string;
  message?: string;
}

const STORAGE_GUEST_TOKEN_KEY = 'tp_guest_jwt_token';

/**
 * Get locally stored signed guest token if present
 */
export function getStoredGuestToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(STORAGE_GUEST_TOKEN_KEY) || sessionStorage.getItem(STORAGE_GUEST_TOKEN_KEY);
  } catch {
    return null;
  }
}

/**
 * Save signed guest token locally
 */
export function setStoredGuestToken(token: string): void {
  if (typeof window === 'undefined' || !token) return;
  try {
    localStorage.setItem(STORAGE_GUEST_TOKEN_KEY, token);
    sessionStorage.setItem(STORAGE_GUEST_TOKEN_KEY, token);
  } catch {}
}

/**
 * Acquire and persist signed guest JWT token from /api/auth/guest
 */
export async function fetchOrCreateGuestToken(
  participantKey?: string,
  displayName?: string,
  roomId?: string
): Promise<string | null> {
  const existing = getStoredGuestToken();
  if (existing) return existing;

  const pKey = participantKey || getParticipantKey();
  if (!pKey) return null;

  try {
    const res = await fetch('/api/auth/guest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participantKey: pKey, displayName, roomId })
    });
    if (res.ok) {
      const data = await res.json();
      if (data.token) {
        setStoredGuestToken(data.token);
        return data.token;
      }
    }
  } catch (err) {
    console.warn('[ServerGameClient] Failed to acquire guest token:', err);
  }
  return null;
}

/**
 * Generate unique, deterministic actionId for idempotency
 */
export function createActionId(type: string, playerId?: string): string {
  const p = (playerId || 'actor').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8);
  const t = (type || 'act').toLowerCase().slice(0, 10);
  return `act_${t}_${p}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Feature Flag Check:
 * Returns true only when VITE_SERVER_AUTHORITATIVE_GAME is explicitly set to 'true'.
 * Default: false (100% preserves existing production client-authoritative multiplayer).
 */
export function isServerAuthoritativeEnabled(): boolean {
  try {
    return (
      (typeof import.meta !== 'undefined' &&
        import.meta.env?.VITE_SERVER_AUTHORITATIVE_GAME === 'true') ||
      (typeof process !== 'undefined' &&
        process.env?.VITE_SERVER_AUTHORITATIVE_GAME === 'true')
    );
  } catch {
    return false;
  }
}

/**
 * Build authentication headers for server API requests
 */
export function buildAuthHeaders(auth?: ClientAuthOptions): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  if (auth?.token) {
    headers['Authorization'] = `Bearer ${auth.token}`;
  }

  const guestToken = auth?.guestToken || getStoredGuestToken();
  if (guestToken) {
    headers['x-guest-token'] = guestToken;
  }

  const pKey = auth?.participantKey || getParticipantKey();
  if (pKey) {
    headers['x-participant-key'] = pKey;
  }

  if (auth?.userId) {
    headers['x-user-id'] = auth.userId;
  }

  return headers;
}

/**
 * Send an authoritative action to /api/game/action
 */
export async function sendServerGameAction(
  action: {
    actionId: string;
    roomId: string;
    playerId: string;
    expectedVersion: number;
    type: string;
    payload?: any;
  },
  auth?: ClientAuthOptions
): Promise<SendActionResult> {
  const headers = buildAuthHeaders(auth);

  try {
    const response = await fetch('/api/game/action', {
      method: 'POST',
      headers,
      body: JSON.stringify(action)
    });

    const data = await response.json();
    return data;
  } catch (err: any) {
    console.warn('[ServerGameClient] Action network error:', err);
    return {
      success: false,
      error: 'NETWORK_ERROR',
      message: err?.message || 'Sunucuya bağlanılamadı.'
    };
  }
}

/**
 * Fetch canonical room state from /api/game/state
 */
export async function fetchServerGameState(
  roomId: string,
  auth?: ClientAuthOptions
): Promise<FetchStateResult> {
  const headers = buildAuthHeaders(auth);
  const cleanId = encodeURIComponent((roomId || '').trim().toUpperCase());

  try {
    const response = await fetch(`/api/game/state?roomId=${cleanId}`, {
      method: 'GET',
      headers
    });

    const data = await response.json();
    return data;
  } catch (err: any) {
    console.warn('[ServerGameClient] State fetch network error:', err);
    return {
      success: false,
      error: 'NETWORK_ERROR',
      message: err?.message || 'Oda durumu alınamadı.'
    };
  }
}
