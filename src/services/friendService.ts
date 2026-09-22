import { UserAccount, FriendUser, FriendRequest, UserStats } from '../types/game';
import { database, isFirebaseConfigured, getUserStats, saveUserStats } from './firebase';
import { ref, set, get } from 'firebase/database';
import { syncManager } from './multiplayerSync';

/**
 * Determine Production / Development API Base URL cleanly.
 */
export function getApiBaseUrl(): string {
  try {
    if (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) {
      return (import.meta as any).env.VITE_API_URL.trim().replace(/\/+$/, '');
    }
  } catch (e) {}

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
 * Single Permanent Deterministic User ID Generator
 */
export function getDeterministicUserId(seed: string): string {
  if (!seed) return `usr_${Math.random().toString(36).substring(2, 10)}`;
  const clean = seed.trim().toLowerCase();
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hex = (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(12, '0');
  return `usr_${hex.slice(0, 12)}`;
}

/**
 * Single Permanent Deterministic Friend Code Generator (e.g. TP-HLCBXL)
 */
export function getDeterministicFriendCode(seedInput: string, email?: string | null): string {
  const input = (email && email.trim() ? email.trim() : seedInput).toLowerCase();
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  let num = Math.abs(hash);
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += alphabet.charAt(num % alphabet.length);
    num = Math.floor(num / alphabet.length) + (i * 13) + 7;
  }
  return `TP-${code}`;
}

export function getOrGenerateFriendCode(uid: string, email?: string | null): string {
  return getDeterministicFriendCode(uid, email);
}

/**
 * Publish full account state to MQTT Cloud Retained Topics for 100% Cross-Device Persistence
 */
export function saveAccountToCloud(
  user: UserAccount,
  friends?: FriendUser[],
  stats?: UserStats,
  incomingRequests?: FriendRequest[]
): void {
  if (!user) return;
  const cleanCode = (user.friendCode || getDeterministicFriendCode(user.uid, user.email)).trim().toUpperCase();
  const cleanUid = (user.uid || getDeterministicUserId(user.email || 'user')).trim();
  const myFriends = friends !== undefined ? friends : getFriends(cleanUid);
  const myStats = stats !== undefined ? stats : getUserStats(cleanUid);
  const myRequests = incomingRequests !== undefined ? incomingRequests : getIncomingRequests(cleanUid);

  const payload = {
    uid: cleanUid,
    displayName: user.displayName,
    email: user.email || null,
    photoURL: user.photoURL,
    friendCode: cleanCode,
    provider: user.provider,
    friends: myFriends,
    stats: myStats,
    incomingRequests: myRequests,
    updatedAt: Date.now()
  };

  // 1. Publish retained message to friendCode topic
  if (cleanCode) {
    syncManager.publishRetained(`turkishparadise/account/v1/${cleanCode}`, payload);
    syncManager.publishRetained(`turkishparadise/registry/v1/${cleanCode}`, {
      uid: cleanUid,
      displayName: user.displayName,
      friendCode: cleanCode,
      photoURL: user.photoURL,
      isOnline: true,
      lastSeen: Date.now()
    });
  }

  // 2. Publish retained message to UID topic
  if (cleanUid) {
    syncManager.publishRetained(`turkishparadise/account/v1/${cleanUid}`, payload);
  }
}

/**
 * Local persistent friend & request caching so friends NEVER disappear on refresh or mobile
 */
export function saveFriends(uid: string, friends: FriendUser[]): void {
  try {
    const json = JSON.stringify(friends);
    memoryLocalCache.set(`tp_friends_${uid}`, json);
    memoryLocalCache.set('tp_friends_all', json);
    if (typeof window !== 'undefined' && window.localStorage) {
      if (uid) localStorage.setItem(`tp_friends_${uid}`, json);
      localStorage.setItem('tp_friends_all', json);
      // Also sync current user in local profile
      const rawUser = localStorage.getItem('tp_user_profile');
      if (rawUser) {
        const u = JSON.parse(rawUser);
        if (u.uid === uid || !u.uid) {
          u.friends = friends;
          localStorage.setItem('tp_user_profile', JSON.stringify(u));
          saveAccountToCloud(u, friends);
        }
      }
    }
  } catch (e) {}
}

export function getFriends(uid: string): FriendUser[] {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      if (uid) {
        const raw = localStorage.getItem(`tp_friends_${uid}`);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      }
      const rawAll = localStorage.getItem('tp_friends_all');
      if (rawAll) {
        const parsed = JSON.parse(rawAll);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
      const rawUser = localStorage.getItem('tp_user_profile');
      if (rawUser) {
        const u = JSON.parse(rawUser);
        if (u && Array.isArray(u.friends) && u.friends.length > 0) return u.friends;
      }
    }
    const mem = memoryLocalCache.get(`tp_friends_${uid}`) || memoryLocalCache.get('tp_friends_all');
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
  const deterministicUid = getDeterministicUserId(user.email || user.uid);
  const deterministicCode = getDeterministicFriendCode(deterministicUid, user.email);
  const googleSub = user.uid || deterministicUid;
  const baseUrl = getApiBaseUrl();

  const normalizedUser: UserAccount = {
    ...user,
    uid: deterministicUid,
    friendCode: deterministicCode
  };

  saveUserToPublicRegistry(normalizedUser);
  saveAccountToCloud(normalizedUser);

  try {
    const res = await fetch(`${baseUrl}/api/users/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idToken,
        googleSub,
        displayName: normalizedUser.displayName,
        avatarUrl: normalizedUser.photoURL,
        email: normalizedUser.email
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
        const { friends } = await fetchFriendsFromDB(dbUser.id || deterministicUid);

        const updated: UserAccount = {
          ...normalizedUser,
          uid: dbUser.id || deterministicUid,
          friendCode: dbUser.friendCode || deterministicCode,
          displayName: dbUser.displayName || normalizedUser.displayName,
          photoURL: dbUser.avatarUrl || normalizedUser.photoURL,
          friends: friends && friends.length > 0 ? friends : getFriends(deterministicUid)
        };
        saveUserToPublicRegistry(updated);
        saveFriends(updated.uid, updated.friends || []);
        saveAccountToCloud(updated);
        return updated;
      }
    }
  } catch (err) {
    console.warn('[FriendService] Backend user sync notice:', err);
  }

  return normalizedUser;
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

        // Merge DB friends with locally cached friends so no friend is EVER lost
        const mergedFriends = [...friends];
        for (const cf of cachedFriends) {
          if (
            !mergedFriends.some(
              (f) => (f.uid && f.uid === cf.uid) || (f.friendCode && cf.friendCode && f.friendCode === cf.friendCode)
            )
          ) {
            mergedFriends.push(cf);
          }
        }

        const mergedRequests = [...pendingRequests];
        for (const cr of cachedRequests) {
          if (
            !mergedRequests.some(
              (r) => r.id === cr.id || (r.fromUid && cr.fromUid && r.fromUid === cr.fromUid && r.status === 'PENDING')
            )
          ) {
            mergedRequests.push(cr);
          }
        }

        // Persist merged truth to local cache
        saveFriends(userId, mergedFriends);
        saveIncomingRequests(userId, mergedRequests);

        return { friends: mergedFriends, pendingRequests: mergedRequests };
      }
    }
  } catch (err) {
    console.warn('[FriendService] DB friends fetch notice:', err);
  }

  return { friends: cachedFriends, pendingRequests: cachedRequests };
}

/**
 * Send a Friend Request (Dual Synchronized: Retained Cloud + DB + Realtime MQTT Mesh)
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

  const myCode = (currentUser.friendCode || getDeterministicFriendCode(currentUser.uid, currentUser.email)).toUpperCase();

  if (myCode && cleanCode === myCode) {
    return { success: false, message: 'Kendi arkadaş kodunuzu ekleyemezsiniz!' };
  }

  const existingFriends = getFriends(currentUser.uid);
  if (existingFriends.some(f => f.friendCode && f.friendCode.toUpperCase() === cleanCode)) {
    return { success: false, message: 'Bu oyuncu zaten arkadaş listenizde ekli.' };
  }

  const reqId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const requestPayload: FriendRequest = {
    id: reqId,
    fromUid: currentUser.uid,
    fromDisplayName: currentUser.displayName,
    fromFriendCode: myCode,
    fromPhotoURL: currentUser.photoURL || null,
    toUid: cleanCode,
    toFriendCode: cleanCode,
    status: 'PENDING',
    createdAt: new Date().toISOString()
  };

  // 1. Publish Retained Friend Request to target's mailbox topic (Delivered even if recipient opens app next week)
  syncManager.publishRetained(`turkishparadise/requests/v1/${cleanCode}/${currentUser.uid}`, requestPayload);

  // 2. Broadcast over Realtime MQTT Mesh immediately
  syncManager.sendFriendMessage({
    type: 'FRIEND_REQUEST_SENT',
    requestId: reqId,
    fromUserId: currentUser.uid,
    fromName: currentUser.displayName,
    fromFriendCode: myCode,
    fromPhotoURL: currentUser.photoURL || '',
    targetFriendCode: cleanCode
  });

  // 3. Persist in Backend Database
  const baseUrl = getApiBaseUrl();
  const token = getStoredAuthToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  headers['x-user-id'] = currentUser.uid;
  headers['x-user-name'] = currentUser.displayName;

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
      return { success: true, message: data.message || 'Arkadaşlık isteği başarıyla gönderildi.' };
    }
  } catch (err: any) {
    console.warn('[FriendService] API request notice:', err);
  }

  return { success: true, message: 'Arkadaşlık isteği başarıyla gönderildi.' };
}

/**
 * Accept Friend Request (Dual Synchronized: Retained Cloud + DB + Realtime MQTT Mesh)
 */
export async function acceptFriendRequest(
  userId: string,
  requestId: string,
  fromUser?: { id: string; displayName: string; friendCode?: string; photoURL?: string },
  currentUser?: { id: string; displayName: string; friendCode?: string; photoURL?: string }
): Promise<{ success: boolean; message: string }> {
  const cleanMyCode = (currentUser?.friendCode || getDeterministicFriendCode(userId)).toUpperCase();

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

    // Save full account to cloud retained storage
    if (currentUser) {
      saveAccountToCloud({
        uid: userId,
        displayName: currentUser.displayName,
        friendCode: cleanMyCode,
        isAnonymous: false,
        provider: 'google',
        photoURL: currentUser.photoURL
      }, friends, undefined, currentReqs);
    }

    // Clear pending request retained topic
    syncManager.publishRetained(`turkishparadise/requests/v1/${cleanMyCode}/${fromUser.id}`, {
      status: 'ACCEPTED',
      id: requestId,
      updatedAt: Date.now()
    });

    // Publish Retained Acceptance to sender's acceptance topic
    if (fromUser.friendCode) {
      syncManager.publishRetained(`turkishparadise/acceptance/v1/${fromUser.friendCode.toUpperCase()}`, {
        type: 'FRIEND_REQUEST_ACCEPTED',
        fromUserId: userId,
        fromDisplayName: currentUser?.displayName || 'Oyuncu',
        fromFriendCode: cleanMyCode,
        fromPhotoURL: currentUser?.photoURL || '',
        requestId: requestId,
        targetUserId: fromUser.id,
        targetFriendCode: fromUser.friendCode
      });
    }
  }

  // 2. Broadcast acceptance over Realtime MQTT Mesh
  syncManager.sendFriendMessage({
    type: 'FRIEND_REQUEST_ACCEPTED',
    fromUserId: userId,
    fromDisplayName: currentUser?.displayName || 'Oyuncu',
    fromFriendCode: cleanMyCode,
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

  // 3. Persist in Backend Database
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
 * Remove Friend (Dual Synchronized: Retained Cloud + DB + Realtime MQTT Mesh)
 */
export async function removeFriend(
  userId: string,
  friendUserIdOrCodeOrId: string
): Promise<{ success: boolean; message: string }> {
  const cleanTarget = (friendUserIdOrCodeOrId || '').trim().toUpperCase();

  // 1. Remove from local caches immediately
  const friends = getFriends(userId).filter(
    (f) =>
      f.uid !== friendUserIdOrCodeOrId &&
      f.friendCode?.toUpperCase() !== cleanTarget &&
      f.friendCode?.toUpperCase().replace(/^TP-/, '') !== cleanTarget.replace(/^TP-/, '')
  );
  saveFriends(userId, friends);

  const reqs = getIncomingRequests(userId).filter(
    (r) =>
      r.id !== friendUserIdOrCodeOrId &&
      r.fromUid !== friendUserIdOrCodeOrId &&
      r.fromFriendCode?.toUpperCase() !== cleanTarget
  );
  saveIncomingRequests(userId, reqs);

  // 2. Publish retained deletion event & updated account state
  const myProfile = typeof window !== 'undefined' ? localStorage.getItem('tp_user_profile') : null;
  if (myProfile) {
    try {
      const u = JSON.parse(myProfile);
      saveAccountToCloud(u, friends, undefined, reqs);
    } catch (e) {}
  }

  syncManager.publishRetained(`turkishparadise/friendship_del/v1/${cleanTarget}`, {
    deletedBy: userId,
    target: cleanTarget,
    timestamp: Date.now()
  });

  // 3. Broadcast removal via MQTT Mesh so other side also updates instantly
  syncManager.sendFriendMessage({
    type: 'FRIEND_REMOVED',
    fromUserId: userId,
    targetUserId: friendUserIdOrCodeOrId,
    targetFriendCode: cleanTarget
  });

  // 4. Delete from Backend Database
  const baseUrl = getApiBaseUrl();
  const token = getStoredAuthToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  headers['x-user-id'] = userId;

  try {
    await fetch(`${baseUrl}/api/friends/${encodeURIComponent(friendUserIdOrCodeOrId)}?userId=${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      headers
    });
  } catch (err: any) {
    console.warn('[FriendService] Delete friend DB notice:', err);
  }

  return { success: true, message: 'Arkadaş silindi.' };
}

export function updateUserPresence(
  uid: string,
  friendCode: string,
  displayName: string,
  isOnline: boolean,
  currentRoomId?: string
): void {
  const cleanCode = (friendCode || getDeterministicFriendCode(uid)).trim().toUpperCase();
  const presenceData = {
    type: 'PRESENCE_UPDATE',
    userId: uid,
    friendCode: cleanCode,
    displayName,
    isOnline,
    currentRoomId: currentRoomId || null,
    updatedAt: Date.now()
  };

  // 1. Broadcast real-time MQTT message
  syncManager.sendFriendMessage(presenceData);

  // 2. Publish retained message on presence topic for cross-device persistence (PC <-> Mobile)
  if (cleanCode) {
    syncManager.publishRetained(`turkishparadise/presence/v1/${cleanCode}`, presenceData);
  }
  if (uid) {
    syncManager.publishRetained(`turkishparadise/presence/v1/${uid}`, presenceData);
  }

  // 3. Sync to Firebase Realtime Database if configured
  if (isFirebaseConfigured && database) {
    try {
      const presenceRef = ref(database, `presence/${uid}`);
      set(presenceRef, presenceData).catch(() => {});
    } catch (e) {}
  }
}

/**
 * Unified Real-Time Subscription for BOTH Friends List & Incoming Requests
 * Guarantees that Mobile and PC stay 100% synchronized in real time and across restarts.
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

  const cleanMyCode = (friendCode || getDeterministicFriendCode(uid)).trim().toUpperCase();

  const safeNotify = (friends: FriendUser[], reqs: FriendRequest[]) => {
    if (active && typeof callback === 'function') {
      try {
        callback({ friends, requests: reqs });
      } catch (err) {
        console.warn('[FriendService] Full sync callback notice:', err);
      }
    }
  };

  const processIncomingAccountData = (data: any) => {
    if (!data || !active) return;
    let hasChanges = false;
    const currentFriends = getFriends(uid);
    let mergedFriends = [...currentFriends];

    if (Array.isArray(data.friends) && data.friends.length > 0) {
      for (const incoming of data.friends) {
        if (!incoming || !incoming.uid) continue;
        if (incoming.uid === uid) continue;
        if (!mergedFriends.some(f => (f.uid && f.uid === incoming.uid) || (incoming.friendCode && f.friendCode && f.friendCode === incoming.friendCode))) {
          mergedFriends.push(incoming);
          hasChanges = true;
        }
      }
    }

    const currentRequests = getIncomingRequests(uid);
    let mergedRequests = [...currentRequests];
    if (Array.isArray(data.incomingRequests) && data.incomingRequests.length > 0) {
      for (const req of data.incomingRequests) {
        if (!req || !req.id || req.status !== 'PENDING') continue;
        if (req.fromUid === uid) continue;
        if (!mergedRequests.some(r => r.id === req.id || r.fromUid === req.fromUid)) {
          mergedRequests.push(req);
          hasChanges = true;
        }
      }
    }

    if (data.stats && typeof data.stats.gamesPlayed === 'number') {
      const localStats = getUserStats(uid);
      if (data.stats.gamesPlayed > localStats.gamesPlayed) {
        saveUserStats(uid, data.stats);
      }
    }

    if (hasChanges) {
      saveFriends(uid, mergedFriends);
      saveIncomingRequests(uid, mergedRequests);
      safeNotify(mergedFriends, mergedRequests);
    }
  };

  // 1. Initial local load
  safeNotify(getFriends(uid), getIncomingRequests(uid));

  // 2. Initial DB fetch
  const refreshAll = async () => {
    if (!active || !uid) return;
    try {
      const { friends, pendingRequests } = await fetchFriendsFromDB(uid);
      safeNotify(friends, pendingRequests);
    } catch (err) {
      safeNotify(getFriends(uid), getIncomingRequests(uid));
    }
  };
  refreshAll();

  // 3. Subscribe to Cloud Retained Topics (Instant sync across Mobile, PC, and all devices)
  const unsubs: Array<() => void> = [];

  // Retained presence topics across all friends
  unsubs.push(
    syncManager.subscribeTopic('turkishparadise/presence/v1/#', (presencePayload) => {
      if (!presencePayload || !active || !uid) return;
      if (presencePayload.userId && presenceDataMatched(presencePayload, uid)) {
        const currentFriends = getFriends(uid);
        let updated = false;
        const nextFriends = currentFriends.map((f) => {
          if (f.uid === presencePayload.userId || (presencePayload.friendCode && f.friendCode === presencePayload.friendCode)) {
            updated = true;
            return {
              ...f,
              isOnline: Boolean(presencePayload.isOnline),
              activeRoomId: presencePayload.currentRoomId || undefined
            };
          }
          return f;
        });
        if (updated) {
          saveFriends(uid, nextFriends);
          safeNotify(nextFriends, getIncomingRequests(uid));
        }
      }
    })
  );

  function presenceDataMatched(data: any, myUid: string): boolean {
    return data.userId !== myUid;
  }

  if (cleanMyCode) {
    // Retained account state for my friendCode
    unsubs.push(
      syncManager.subscribeTopic(`turkishparadise/account/v1/${cleanMyCode}`, (payload) => {
        processIncomingAccountData(payload);
      })
    );

    // Retained friend requests addressed to my friendCode
    unsubs.push(
      syncManager.subscribeTopic(`turkishparadise/requests/v1/${cleanMyCode}/#`, (payload) => {
        if (payload && payload.fromUid && payload.fromUid !== uid && payload.status === 'PENDING') {
          const current = getIncomingRequests(uid);
          if (!current.some(r => r.id === payload.id || r.fromUid === payload.fromUid)) {
            current.push(payload);
            saveIncomingRequests(uid, current);
            safeNotify(getFriends(uid), current);
          }
        }
      })
    );

    // Retained acceptances addressed to my friendCode
    unsubs.push(
      syncManager.subscribeTopic(`turkishparadise/acceptance/v1/${cleanMyCode}`, (payload) => {
        if (payload && payload.fromUserId && payload.fromUserId !== uid) {
          const current = getFriends(uid);
          if (!current.some(f => f.uid === payload.fromUserId || (payload.fromFriendCode && f.friendCode === payload.fromFriendCode))) {
            current.push({
              uid: payload.fromUserId,
              displayName: payload.fromDisplayName || 'Arkadaş',
              friendCode: payload.fromFriendCode || 'TP-FRIEND',
              photoURL: payload.fromPhotoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${payload.fromUserId}`,
              isOnline: true,
              addedAt: new Date().toISOString()
            });
            saveFriends(uid, current);
            safeNotify(current, getIncomingRequests(uid));
          }
        }
      })
    );
  }

  if (uid) {
    unsubs.push(
      syncManager.subscribeTopic(`turkishparadise/account/v1/${uid}`, (payload) => {
        processIncomingAccountData(payload);
      })
    );
  }

  // 4. Real-Time MQTT Broadcast Listener
  unsubs.push(
    syncManager.subscribeToFriendChannel((data) => {
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
      } else if (data.type === 'FRIEND_REMOVED') {
        const cleanFromId = (data.fromUserId || '').trim().toUpperCase();
        const cleanTargetId = (data.targetUserId || '').trim().toUpperCase();
        const cleanTargetCode = (data.targetFriendCode || '').trim().toUpperCase();

        const isTargetForMe =
          cleanTargetId === uid.toUpperCase() ||
          cleanTargetId === cleanMyCode ||
          (cleanMyCode && (cleanTargetCode === cleanMyCode || cleanTargetCode === `TP-${cleanMyCode}`));

        if (isTargetForMe || cleanFromId === uid.toUpperCase()) {
          const toRemove = isTargetForMe ? cleanFromId : cleanTargetId;
          const nextFriends = getFriends(uid).filter(
            (f) =>
              f.uid?.toUpperCase() !== toRemove &&
              f.friendCode?.toUpperCase() !== toRemove &&
              f.friendCode?.toUpperCase().replace(/^TP-/, '') !== toRemove.replace(/^TP-/, '')
          );
          saveFriends(uid, nextFriends);
          safeNotify(nextFriends, getIncomingRequests(uid));
        }
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
                activeRoomId: data.currentRoomId || undefined
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
    })
  );

  // 5. Periodic Background Polling (fallback)
  const interval = setInterval(refreshAll, 3000);

  return () => {
    active = false;
    clearInterval(interval);
    unsubs.forEach((unsub) => {
      try {
        unsub();
      } catch (e) {}
    });
  };
}

export function subscribeToFriendRequests(
  uid: string,
  arg2: string | undefined | ((requests: FriendRequest[]) => void),
  arg3?: (requests: FriendRequest[]) => void
): () => void {
  let friendCode: string | undefined;
  let callback: ((requests: FriendRequest[]) => void) | undefined;

  if (typeof arg2 === 'function') {
    callback = arg2;
    friendCode = undefined;
  } else {
    friendCode = typeof arg2 === 'string' ? arg2 : undefined;
    callback = typeof arg3 === 'function' ? arg3 : undefined;
  }

  return subscribeToFriendsAndRequests(uid, friendCode, ({ requests }) => {
    if (callback) callback(requests);
  });
}
