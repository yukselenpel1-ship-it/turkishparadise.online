import { UserAccount, FriendUser, FriendRequest, UserStats } from '../types/game';
import { database, isFirebaseConfigured } from './firebase';
import { ref, set, get } from 'firebase/database';
import { syncManager } from './multiplayerSync';

/**
 * Determine Production / Development API Base URL cleanly.
 */
export function getApiBaseUrl(): string {
  if (import.meta.env.VITE_API_URL && import.meta.env.VITE_API_URL.trim()) {
    return import.meta.env.VITE_API_URL.trim().replace(/\/+$/, '');
  }

  if (typeof window !== 'undefined') {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return 'http://localhost:3001';
    }
    return '';
  }

  return 'http://localhost:3001';
}

const AUTH_TOKEN_KEY = 'tp_auth_token';

export function getStoredAuthToken(): string | null {
  try {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(AUTH_TOKEN_KEY) || sessionStorage.getItem(AUTH_TOKEN_KEY);
    }
  } catch (e) {}
  return null;
}

export function saveAuthToken(token: string): void {
  try {
    if (typeof window !== 'undefined' && token) {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
      sessionStorage.setItem(AUTH_TOKEN_KEY, token);
    }
  } catch (e) {}
}

const memoryLocalCache = new Map<string, string>();

/**
 * Local persistent friend & request caching so friends NEVER disappear on refresh or mobile
 */
export function saveFriends(uid: string, friends: FriendUser[]): void {
  try {
    const json = JSON.stringify(friends);
    memoryLocalCache.set(`tp_friends_${uid}`, json);
    if (typeof window !== 'undefined' && window.localStorage && uid) {
      localStorage.setItem(`tp_friends_${uid}`, json);
    }
  } catch (e) {}
}

export function getFriends(uid: string): FriendUser[] {
  try {
    if (typeof window !== 'undefined' && window.localStorage && uid) {
      const raw = localStorage.getItem(`tp_friends_${uid}`);
      if (raw) return JSON.parse(raw);
    }
    const mem = memoryLocalCache.get(`tp_friends_${uid}`);
    if (mem) return JSON.parse(mem);
  } catch (e) {}
  return [];
}

export function saveIncomingRequests(uid: string, requests: FriendRequest[]): void {
  try {
    const json = JSON.stringify(requests);
    memoryLocalCache.set(`tp_requests_${uid}`, json);
    if (typeof window !== 'undefined' && window.localStorage && uid) {
      localStorage.setItem(`tp_requests_${uid}`, json);
    }
  } catch (e) {}
}

export function getIncomingRequests(uid: string): FriendRequest[] {
  try {
    if (typeof window !== 'undefined' && window.localStorage && uid) {
      const raw = localStorage.getItem(`tp_requests_${uid}`);
      if (raw) return JSON.parse(raw);
    }
    const mem = memoryLocalCache.get(`tp_requests_${uid}`);
    if (mem) return JSON.parse(mem);
  } catch (e) {}
  return [];
}

export function saveUserToPublicRegistry(user: UserAccount): void {
  try {
    if (user?.friendCode) {
      const registryKey = `tp_reg_${user.friendCode.toUpperCase()}`;
      const json = JSON.stringify({
        uid: user.uid,
        displayName: user.displayName,
        friendCode: user.friendCode,
        photoURL: user.photoURL,
        email: user.email
      });
      memoryLocalCache.set(registryKey, json);
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(registryKey, json);
      }
    }
  } catch (e) {}
}

export function lookupUserByFriendCode(code: string): { uid: string; displayName: string; friendCode: string; photoURL?: string } | null {
  try {
    if (code) {
      const clean = code.trim().toUpperCase();
      const registryKey = `tp_reg_${clean}`;
      if (typeof window !== 'undefined' && window.localStorage) {
        const raw = localStorage.getItem(registryKey);
        if (raw) return JSON.parse(raw);
      }
      const mem = memoryLocalCache.get(registryKey);
      if (mem) return JSON.parse(mem);
    }
  } catch (e) {}
  return null;
}

/**
 * Idempotently sync user with backend database and load persistent friends.
 */
export async function syncUserWithBackend(user: UserAccount, idToken?: string): Promise<UserAccount> {
  const googleSub = user.uid;
  const baseUrl = getApiBaseUrl();

  saveUserToPublicRegistry(user);

  try {
    const res = await fetch(`${baseUrl}/api/users/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idToken,
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

        // Immediately fetch persistent friends from PostgreSQL database for this account
        const { friends } = await fetchFriendsFromDB(dbUser.id);

        const updated: UserAccount = {
          ...user,
          uid: dbUser.id,
          friendCode: dbUser.friendCode,
          displayName: dbUser.displayName || user.displayName,
          photoURL: dbUser.avatarUrl || user.photoURL,
          friends: friends || []
        };
        saveUserToPublicRegistry(updated);
        saveFriends(dbUser.id, updated.friends || []);
        return updated;
      }
    }
  } catch (err) {
    console.warn('[FriendService] Backend user sync notice:', err);
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
 * Fetch friends from DB & cached local store
 */
export async function fetchFriendsFromDB(userId: string): Promise<{
  friends: FriendUser[];
  pendingRequests: FriendRequest[];
}> {
  if (!userId) return { friends: [], pendingRequests: [] };

  const cachedFriends = getFriends(userId);
  const cachedRequests = getIncomingRequests(userId);

  const baseUrl = getApiBaseUrl();
  const token = getStoredAuthToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  headers['x-user-id'] = userId;

  try {
    const res = await fetch(`${baseUrl}/api/friends?userId=${encodeURIComponent(userId)}`, { headers });
    if (res.ok) {
      const data = await res.json();
      if (data.success) {
        const friends: FriendUser[] = (data.friends || []).map((f: any) => ({
          uid: f.id || f.googleSub,
          friendCode: f.friendCode,
          displayName: f.displayName,
          photoURL: f.avatarUrl,
          email: f.email,
          isOnline: Boolean(f.isOnline),
          addedAt: f.createdAt
        }));

        const pendingRequests: FriendRequest[] = (data.pendingIncoming || []).map((req: any) => ({
          id: req.id,
          fromUid: req.fromUser?.id || req.fromUser?.googleSub || 'unknown',
          fromDisplayName: req.fromUser?.displayName || 'Oyuncu',
          fromPhotoURL: req.fromUser?.avatarUrl || null,
          fromFriendCode: req.fromUser?.friendCode || '',
          toUid: userId,
          toFriendCode: '',
          status: 'PENDING',
          createdAt: req.createdAt || new Date().toISOString()
        }));

        // Persist database truth to local cache
        saveFriends(userId, friends);
        saveIncomingRequests(userId, pendingRequests);

        return { friends, pendingRequests };
      }
    }
  } catch (err) {
    console.warn('[FriendService] DB friends fetch notice:', err);
  }

  return { friends: cachedFriends, pendingRequests: cachedRequests };
}

/**
 * Send a Friend Request (Dual Synchronized: DB + Realtime MQTT Mesh)
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

  if (currentUser.friendCode && cleanCode === currentUser.friendCode.toUpperCase()) {
    return { success: false, message: 'Kendi arkadaş kodunuzu ekleyemezsiniz!' };
  }

  const existingFriends = getFriends(currentUser.uid);
  if (existingFriends.some(f => f.friendCode && f.friendCode.toUpperCase() === cleanCode)) {
    return { success: false, message: 'Bu oyuncu zaten arkadaş listenizde ekli.' };
  }

  const baseUrl = getApiBaseUrl();
  const token = getStoredAuthToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  headers['x-user-id'] = currentUser.uid;
  headers['x-user-name'] = currentUser.displayName;

  // 1. Persist in Backend Database first to obtain persistent CUID
  let dbFriendshipId: string | undefined;
  try {
    const res = await fetch(`${baseUrl}/api/friends/request`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ targetFriendCode: cleanCode })
    });

    let data: any = null;
    try {
      data = await res.json();
    } catch (e) {}

    if (res.ok && data?.success) {
      dbFriendshipId = data?.friendship?.id;
      // Broadcast over Realtime MQTT Mesh with persistent DB friendship ID
      syncManager.sendFriendMessage({
        type: 'FRIEND_REQUEST_SENT',
        requestId: dbFriendshipId,
        fromUserId: currentUser.uid,
        fromName: currentUser.displayName,
        fromFriendCode: currentUser.friendCode || 'TP-PLAYER',
        fromPhotoURL: currentUser.photoURL || '',
        targetFriendCode: cleanCode
      });
      return { success: true, message: data.message || 'Arkadaşlık isteği başarıyla gönderildi.' };
    } else {
      if (res.status === 404) {
        return { success: false, message: 'Bu arkadaş koduna sahip oyuncu bulunamadı.' };
      }
      return { success: false, message: data?.message || 'Arkadaşlık isteği gönderilemedi.' };
    }
  } catch (err: any) {
    console.warn('[FriendService] API request notice (delivered via realtime mesh):', err);
    syncManager.sendFriendMessage({
      type: 'FRIEND_REQUEST_SENT',
      fromUserId: currentUser.uid,
      fromName: currentUser.displayName,
      fromFriendCode: currentUser.friendCode || 'TP-PLAYER',
      fromPhotoURL: currentUser.photoURL || '',
      targetFriendCode: cleanCode
    });
    return { success: true, message: 'Arkadaşlık isteği başarıyla gönderildi.' };
  }
}

/**
 * Accept Friend Request (Dual Synchronized: DB + Realtime MQTT Mesh)
 */
export async function acceptFriendRequest(
  userId: string,
  requestId: string,
  fromUser?: { id: string; displayName: string; friendCode?: string; photoURL?: string },
  currentUser?: { id: string; displayName: string; friendCode?: string; photoURL?: string }
): Promise<{ success: boolean; message: string }> {
  // 1. Update local cache immediately for current user (User B)
  if (fromUser) {
    const friends = getFriends(userId);
    if (!friends.some(f => f.uid === fromUser.id || (fromUser.friendCode && f.friendCode === fromUser.friendCode))) {
      friends.push({
        uid: fromUser.id,
        displayName: fromUser.displayName,
        friendCode: fromUser.friendCode || 'TP-FRIEND',
        photoURL: fromUser.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${fromUser.id}`,
        isOnline: true,
        addedAt: new Date().toISOString()
      });
      saveFriends(userId, friends);
    }

    const currentReqs = getIncomingRequests(userId).filter(r => r.id !== requestId && r.fromUid !== fromUser.id);
    saveIncomingRequests(userId, currentReqs);
  }

  // 2. Broadcast acceptance over Realtime MQTT Mesh WITH CURRENT USER METADATA
  syncManager.sendFriendMessage({
    type: 'FRIEND_REQUEST_ACCEPTED',
    fromUserId: userId,
    fromDisplayName: currentUser?.displayName || 'Oyuncu',
    fromFriendCode: currentUser?.friendCode || '',
    fromPhotoURL: currentUser?.photoURL || '',
    requestId: requestId,
    targetUserId: fromUser?.id,
    targetFriendCode: fromUser?.friendCode
  });

  const baseUrl = getApiBaseUrl();
  const token = getStoredAuthToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  headers['x-user-id'] = userId;

  // 3. Persist in Backend Database with robust fallback identifier resolution
  try {
    const res = await fetch(`${baseUrl}/api/friends/accept`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        requestId,
        fromUserId: fromUser?.id,
        fromFriendCode: fromUser?.friendCode
      })
    });

    let data: any = null;
    try {
      data = await res.json();
    } catch (e) {}

    if (res.ok && data?.success) {
      await fetchFriendsFromDB(userId);
      return { success: true, message: data.message || 'Arkadaşlık kabul edildi.' };
    }
  } catch (err: any) {
    console.warn('[FriendService] Accept DB notice:', err);
  }

  return { success: true, message: 'Arkadaşlık kabul edildi.' };
}

/**
 * Remove Friend
 */
export async function removeFriend(
  userId: string,
  friendUserIdOrRequestId: string
): Promise<{ success: boolean; message: string }> {
  // Remove from local cache
  const friends = getFriends(userId).filter(f => f.uid !== friendUserIdOrRequestId && f.friendCode !== friendUserIdOrRequestId);
  saveFriends(userId, friends);

  const reqs = getIncomingRequests(userId).filter(r => r.id !== friendUserIdOrRequestId && r.fromUid !== friendUserIdOrRequestId);
  saveIncomingRequests(userId, reqs);

  const baseUrl = getApiBaseUrl();
  const token = getStoredAuthToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  headers['x-user-id'] = userId;

  try {
    await fetch(`${baseUrl}/api/friends/${encodeURIComponent(friendUserIdOrRequestId)}?userId=${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      headers
    });
  } catch (err: any) {}

  return { success: true, message: 'Arkadaş silindi.' };
}

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

/**
 * Subscribe to Friend Requests via Polling + Real-Time MQTT Mesh
 * Supports both (uid, callback) and (uid, friendCode, callback) signatures seamlessly.
 */
export function subscribeToFriendRequests(
  uid: string,
  callback: (requests: FriendRequest[]) => void
): () => void;
export function subscribeToFriendRequests(
  uid: string,
  friendCode: string | undefined,
  callback: (requests: FriendRequest[]) => void
): () => void;
export function subscribeToFriendRequests(
  uid: string,
  arg2: string | undefined | ((requests: FriendRequest[]) => void),
  arg3?: (requests: FriendRequest[]) => void
): () => void {
  let active = true;

  let friendCode: string | undefined;
  let callback: ((requests: FriendRequest[]) => void) | undefined;

  if (typeof arg2 === 'function') {
    callback = arg2;
    friendCode = undefined;
  } else {
    friendCode = typeof arg2 === 'string' ? arg2 : undefined;
    callback = typeof arg3 === 'function' ? arg3 : undefined;
  }

  // Attempt to resolve friendCode from localStorage user profile if not passed
  if (!friendCode && typeof window !== 'undefined') {
    try {
      const rawUser = localStorage.getItem('tp_user_profile');
      if (rawUser) {
        const u = JSON.parse(rawUser);
        if (u && u.friendCode) friendCode = u.friendCode;
      }
    } catch (e) {}
  }

  const cleanMyCode = (friendCode || '').trim().toUpperCase();

  const safeNotify = (reqs: FriendRequest[]) => {
    if (active && typeof callback === 'function') {
      try {
        callback(reqs);
      } catch (err) {
        console.warn('[FriendService] Callback execution notice:', err);
      }
    }
  };

  const refreshRequests = async () => {
    if (!active || !uid) return;
    try {
      const { pendingRequests } = await fetchFriendsFromDB(uid);
      safeNotify(pendingRequests);
    } catch (err) {}
  };

  // 1. Initial load
  refreshRequests();

  // 2. Real-Time MQTT Friend Message Listener
  const unsubscribeMqtt = syncManager.subscribeToFriendChannel((data) => {
    if (!active || !uid) return;

    if (data.type === 'FRIEND_REQUEST_SENT') {
      const targetCode = (data.targetFriendCode || '').trim().toUpperCase();

      if (cleanMyCode && (targetCode === cleanMyCode || targetCode === `TP-${cleanMyCode}`)) {
        const newReq: FriendRequest = {
          id: data.requestId || `req_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          fromUid: data.fromUserId || 'unknown',
          fromDisplayName: data.fromName || 'Oyuncu',
          fromPhotoURL: data.fromPhotoURL || null,
          fromFriendCode: data.fromFriendCode || '',
          toUid: uid,
          toFriendCode: cleanMyCode,
          status: 'PENDING',
          createdAt: new Date().toISOString()
        };

        const current = getIncomingRequests(uid);
        if (!current.some(r => r.fromUid === newReq.fromUid)) {
          current.push(newReq);
          saveIncomingRequests(uid, current);
          safeNotify(current);
        }
      }
    } else if (data.type === 'FRIEND_REQUEST_ACCEPTED') {
      const isTargetForMe =
        (data.targetUserId && (data.targetUserId === uid || data.targetUserId.includes(uid))) ||
        (data.targetFriendCode && cleanMyCode && (data.targetFriendCode === cleanMyCode || data.targetFriendCode === `TP-${cleanMyCode}`));

      if (isTargetForMe && data.fromUserId) {
        const friendId = data.fromUserId;
        const friendCode = data.fromFriendCode || 'TP-FRIEND';
        const friendName = data.fromDisplayName || 'Arkadaş';
        const friendPhoto = data.fromPhotoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${friendId}`;

        const friends = getFriends(uid);
        if (!friends.some(f => f.uid === friendId || (friendCode && f.friendCode === friendCode))) {
          friends.push({
            uid: friendId,
            displayName: friendName,
            friendCode: friendCode,
            photoURL: friendPhoto,
            isOnline: true,
            addedAt: new Date().toISOString()
          });
          saveFriends(uid, friends);
        }
      }
      refreshRequests();
    }
  });

  // 3. Periodic Background Sync (every 3 seconds)
  const interval = setInterval(refreshRequests, 3000);

  return () => {
    active = false;
    clearInterval(interval);
    unsubscribeMqtt();
  };
}

/**
 * Unified Real-Time Subscription for BOTH Friends List & Incoming Requests
 * Guarantees that sender & receiver UI update instantly when requests are accepted.
 */
export function subscribeToFriendsAndRequests(
  uid: string,
  friendCode: string | undefined,
  callback: (data: { friends: FriendUser[]; requests: FriendRequest[] }) => void
): () => void {
  let active = true;

  if (!friendCode && typeof window !== 'undefined') {
    try {
      const rawUser = localStorage.getItem('tp_user_profile');
      if (rawUser) {
        const u = JSON.parse(rawUser);
        if (u && u.friendCode) friendCode = u.friendCode;
      }
    } catch (e) {}
  }

  const cleanMyCode = (friendCode || '').trim().toUpperCase();

  const safeNotify = (friends: FriendUser[], reqs: FriendRequest[]) => {
    if (active && typeof callback === 'function') {
      try {
        callback({ friends, requests: reqs });
      } catch (err) {
        console.warn('[FriendService] Full sync callback notice:', err);
      }
    }
  };

  const refreshAll = async () => {
    if (!active || !uid) return;
    try {
      const { friends, pendingRequests } = await fetchFriendsFromDB(uid);
      safeNotify(friends, pendingRequests);
    } catch (err) {
      safeNotify(getFriends(uid), getIncomingRequests(uid));
    }
  };

  // 1. Initial load
  refreshAll();

  // 2. Real-Time MQTT Listener
  const unsubscribeMqtt = syncManager.subscribeToFriendChannel((data) => {
    if (!active || !uid) return;

    if (data.type === 'FRIEND_REQUEST_SENT') {
      const targetCode = (data.targetFriendCode || '').trim().toUpperCase();

      if (cleanMyCode && (targetCode === cleanMyCode || targetCode === `TP-${cleanMyCode}`)) {
        const newReq: FriendRequest = {
          id: data.requestId || `req_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          fromUid: data.fromUserId || 'unknown',
          fromDisplayName: data.fromName || 'Oyuncu',
          fromPhotoURL: data.fromPhotoURL || null,
          fromFriendCode: data.fromFriendCode || '',
          toUid: uid,
          toFriendCode: cleanMyCode,
          status: 'PENDING',
          createdAt: new Date().toISOString()
        };

        const current = getIncomingRequests(uid);
        if (!current.some(r => r.fromUid === newReq.fromUid)) {
          current.push(newReq);
          saveIncomingRequests(uid, current);
          safeNotify(getFriends(uid), current);
        }
      }
    } else if (data.type === 'FRIEND_REQUEST_ACCEPTED') {
      // If I am the original sender, targetUserId or targetFriendCode matches me!
      const isTargetForMe =
        (data.targetUserId && (data.targetUserId === uid || data.targetUserId.includes(uid))) ||
        (data.targetFriendCode && cleanMyCode && (data.targetFriendCode === cleanMyCode || data.targetFriendCode === `TP-${cleanMyCode}`));

      if (isTargetForMe && data.fromUserId) {
        const friendId = data.fromUserId;
        const fCode = data.fromFriendCode || 'TP-FRIEND';
        const fName = data.fromDisplayName || 'Arkadaş';
        const fPhoto = data.fromPhotoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${friendId}`;

        const currentFriends = getFriends(uid);
        if (!currentFriends.some(f => f.uid === friendId || (fCode && f.friendCode === fCode))) {
          currentFriends.push({
            uid: friendId,
            displayName: fName,
            friendCode: fCode,
            photoURL: fPhoto,
            isOnline: true,
            addedAt: new Date().toISOString()
          });
          saveFriends(uid, currentFriends);
          safeNotify(currentFriends, getIncomingRequests(uid));
        }
      }
      refreshAll();
    } else if (data.type === 'PRESENCE_UPDATE') {
      if (data.userId && data.userId !== uid) {
        const currentFriends = getFriends(uid);
        let updated = false;
        const nextFriends = currentFriends.map((f) => {
          if (f.uid === data.userId || (data.friendCode && f.friendCode === data.friendCode)) {
            updated = true;
            return {
              ...f,
              isOnline: Boolean(data.isOnline),
              activeRoomId: data.currentRoomId || f.activeRoomId
            };
          }
          return f;
        });
        if (updated) {
          saveFriends(uid, nextFriends);
          safeNotify(nextFriends, getIncomingRequests(uid));
        }
      }
    }
  });

  // 3. Periodic Background Polling
  const interval = setInterval(refreshAll, 3000);

  return () => {
    active = false;
    clearInterval(interval);
    unsubscribeMqtt();
  };
}
