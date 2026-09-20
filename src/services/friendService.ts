import { UserAccount, FriendUser, FriendRequest, UserStats } from '../types/game';
import { database, isFirebaseConfigured } from './firebase';
import { ref, set, get } from 'firebase/database';
import { syncManager } from './multiplayerSync';

const API_BASE_URL = typeof window !== 'undefined'
  ? (window.location.port === '3001' ? '' : 'http://localhost:3001')
  : 'http://localhost:3001';

const AUTH_TOKEN_KEY = 'tp_auth_token';

export function getStoredAuthToken(): string | null {
  try {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem(AUTH_TOKEN_KEY) || localStorage.getItem(AUTH_TOKEN_KEY);
    }
  } catch (e) {}
  return null;
}

export function saveAuthToken(token: string): void {
  try {
    if (typeof window !== 'undefined' && token) {
      sessionStorage.setItem(AUTH_TOKEN_KEY, token);
      localStorage.setItem(AUTH_TOKEN_KEY, token);
    }
  } catch (e) {}
}

/**
 * Idempotently sync user with backend database.
 * Returns exact same DB User and single permanent friendCode across all devices.
 */
export async function syncUserWithBackend(user: UserAccount): Promise<UserAccount> {
  const googleSub = user.uid;
  try {
    const res = await fetch(`${API_BASE_URL}/api/users/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        googleSub,
        displayName: user.displayName,
        avatarUrl: user.photoURL,
        email: user.email
      })
    });

    if (res.ok) {
      const data = await res.json();
      if (data.success && data.user) {
        if (data.token) {
          saveAuthToken(data.token);
        }
        const dbUser = data.user;
        const updated: UserAccount = {
          ...user,
          uid: dbUser.id, // Permanent DB User ID (cuid)
          friendCode: dbUser.friendCode,
          displayName: dbUser.displayName || user.displayName,
          photoURL: dbUser.avatarUrl || user.photoURL
        };
        return updated;
      }
    }
  } catch (err) {
    console.warn('[FriendService] Backend user sync error:', err);
  }

  const friendCode = user.friendCode || getOrGenerateFriendCode(user.uid, user.email);
  return { ...user, friendCode };
}

/**
 * Deterministic Fallback Friend Code Generator
 */
export function getOrGenerateFriendCode(uid: string, email?: string | null): string {
  try {
    const seed = (email || uid || 'user').toLowerCase();
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = (hash << 5) - hash + seed.charCodeAt(i);
      hash |= 0;
    }
    const positiveHash = Math.abs(hash);
    const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let code = '';
    let num = positiveHash;
    for (let i = 0; i < 6; i++) {
      code += alphabet.charAt(num % alphabet.length);
      num = Math.floor(num / alphabet.length) + (i * 13) + 7;
    }
    return `TP-${code}`;
  } catch (e) {
    return `TP-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  }
}

/**
 * Fetch friends directly from Prisma Database via Authenticated REST API
 */
export async function fetchFriendsFromDB(userId: string): Promise<{
  friends: FriendUser[];
  pendingRequests: FriendRequest[];
}> {
  if (!userId) return { friends: [], pendingRequests: [] };

  const token = getStoredAuthToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  headers['x-user-id'] = userId;

  try {
    const res = await fetch(`${API_BASE_URL}/api/friends?userId=${encodeURIComponent(userId)}`, { headers });
    if (res.ok) {
      const data = await res.json();
      if (data.success) {
        const friends: FriendUser[] = (data.friends || []).map((f: any) => ({
          uid: f.id,
          friendCode: f.friendCode,
          displayName: f.displayName,
          photoURL: f.avatarUrl,
          email: f.email,
          isOnline: Boolean(f.isOnline),
          addedAt: f.createdAt
        }));

        const pendingRequests: FriendRequest[] = (data.pendingIncoming || []).map((req: any) => ({
          id: req.id,
          fromUid: req.fromUser.id,
          fromDisplayName: req.fromUser.displayName,
          fromPhotoURL: req.fromUser.avatarUrl || null,
          fromFriendCode: req.fromUser.friendCode,
          toUid: userId,
          toFriendCode: '',
          status: 'PENDING',
          createdAt: req.createdAt || new Date().toISOString()
        }));

        return { friends, pendingRequests };
      }
    }
  } catch (err) {
    console.warn('[FriendService] DB friends fetch warning:', err);
  }

  return { friends: [], pendingRequests: [] };
}

/**
 * Send a Friend Request (Backend Database REST API)
 * Note: If target code is invalid/unknown, returns 404 USER_NOT_FOUND. No fake dummy users created!
 */
export async function sendFriendRequest(
  currentUser: UserAccount,
  targetCodeInput: string
): Promise<{ success: boolean; message: string }> {
  if (!currentUser?.uid) {
    return { success: false, message: 'Lütfen önce giriş yapın.' };
  }

  let cleanCode = targetCodeInput.trim().toUpperCase();
  if (!cleanCode.startsWith('TP-')) {
    cleanCode = `TP-${cleanCode}`;
  }

  const token = getStoredAuthToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  headers['x-user-id'] = currentUser.uid;

  try {
    const res = await fetch(`${API_BASE_URL}/api/friends/request`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ targetFriendCode: cleanCode })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      syncManager.sendFriendMessage({
        type: 'FRIEND_REQUEST_SENT',
        fromUserId: currentUser.uid,
        fromName: currentUser.displayName,
        targetFriendCode: cleanCode
      });
      return { success: true, message: data.message || 'Arkadaşlık isteği gönderildi.' };
    } else {
      return { success: false, message: data.error || data.message || 'Arkadaşlık isteği gönderilemedi.' };
    }
  } catch (err: any) {
    return { success: false, message: 'Sunucuya bağlanılamadı.' };
  }
}

/**
 * Accept Friend Request
 */
export async function acceptFriendRequest(
  userId: string,
  requestId: string
): Promise<{ success: boolean; message: string }> {
  const token = getStoredAuthToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  headers['x-user-id'] = userId;

  try {
    const res = await fetch(`${API_BASE_URL}/api/friends/accept`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ requestId })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      return { success: true, message: data.message || 'Arkadaşlık kabul edildi.' };
    } else {
      return { success: false, message: data.error || data.message || 'İstek kabul edilemedi.' };
    }
  } catch (err: any) {
    return { success: false, message: 'Sunucuya bağlanılamadı.' };
  }
}

/**
 * Remove Friend
 */
export async function removeFriend(
  userId: string,
  friendUserId: string
): Promise<{ success: boolean; message: string }> {
  const token = getStoredAuthToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  headers['x-user-id'] = userId;

  try {
    const res = await fetch(`${API_BASE_URL}/api/friends/${encodeURIComponent(friendUserId)}?userId=${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      headers
    });

    const data = await res.json();
    if (res.ok && data.success) {
      return { success: true, message: data.message || 'Arkadaş silindi.' };
    } else {
      return { success: false, message: data.error || data.message || 'Arkadaş silinemedi.' };
    }
  } catch (err: any) {
    return { success: false, message: 'Sunucuya bağlanılamadı.' };
  }
}

export function saveUserToPublicRegistry(user: UserAccount): void {}
export function getFriends(uid: string): FriendUser[] { return []; }
export function saveFriends(uid: string, friends: FriendUser[]): void {}
export function getIncomingRequests(uid: string): FriendRequest[] { return []; }
export function saveIncomingRequests(uid: string, requests: FriendRequest[]): void {}

export function updateUserPresence(
  uid: string,
  friendCode: string,
  displayName: string,
  isOnline: boolean,
  currentRoomId?: string
): void {
  syncManager.sendFriendMessage({
    type: 'PRESENCE_UPDATE',
    userId: uid,
    friendCode,
    displayName,
    isOnline,
    currentRoomId
  });
}

export function subscribeToFriendRequests(
  uid: string,
  callback: (requests: FriendRequest[]) => void
): () => void {
  let active = true;
  const poll = async () => {
    if (!active || !uid) return;
    const { pendingRequests } = await fetchFriendsFromDB(uid);
    callback(pendingRequests);
  };

  poll();
  const interval = setInterval(poll, 3000);
  return () => {
    active = false;
    clearInterval(interval);
  };
}
