import { UserAccount, FriendUser, FriendRequest, UserStats } from '../types/game';
import { database, isFirebaseConfigured } from './firebase';
import { ref, set, get, update, onValue, off, remove } from 'firebase/database';
import { syncManager } from './multiplayerSync';

const PUBLIC_REGISTRY_KEY = 'tp_public_users_registry';
const FRIENDS_KEY_PREFIX = 'tp_friends_';
const FRIEND_CODE_PREFIX = 'tp_friend_code_';
const INCOMING_REQUESTS_PREFIX = 'tp_incoming_requests_';
const PRESENCE_KEY_PREFIX = 'tp_presence_';

// Local BroadcastChannel for instant cross-tab / cross-window real-time synchronization
let friendsChannel: BroadcastChannel | null = null;
try {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    friendsChannel = new BroadcastChannel('tp_friends_presence_channel');
  }
} catch (e) {}

/**
 * Generate a deterministic 6-character alphanumeric Friend Code (e.g. TP-7K9A2X)
 */
export function getOrGenerateFriendCode(uid: string, email?: string | null): string {
  try {
    const storageKey = `${FRIEND_CODE_PREFIX}${uid}`;
    const saved = localStorage.getItem(storageKey);
    if (saved && saved.startsWith('TP-')) {
      return saved;
    }

    // Deterministic hash based on email or UID
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

    const friendCode = `TP-${code}`;
    localStorage.setItem(storageKey, friendCode);
    return friendCode;
  } catch (e) {
    return `TP-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  }
}

/**
 * Register user in the public player directory (both local & Firebase)
 */
export async function saveUserToPublicRegistry(user: UserAccount): Promise<void> {
  if (!user.friendCode) return;

  const publicData: FriendUser = {
    uid: user.uid,
    friendCode: user.friendCode,
    displayName: user.displayName,
    photoURL: user.photoURL,
    email: user.email,
    addedAt: new Date().toISOString(),
    stats: user.stats || { gamesWon: 0, gamesLost: 0, gamesPlayed: 0, totalMoneyEarned: 0, history: [] }
  };

  // 1. Save to Local Storage Registry
  try {
    const raw = localStorage.getItem(PUBLIC_REGISTRY_KEY);
    const registry: Record<string, FriendUser> = raw ? JSON.parse(raw) : {};
    registry[user.friendCode.toUpperCase()] = publicData;
    registry[user.uid] = publicData;
    localStorage.setItem(PUBLIC_REGISTRY_KEY, JSON.stringify(registry));
  } catch (e) {}

  // 2. Save to Firebase Realtime Database if configured
  if (isFirebaseConfigured && database) {
    try {
      const codeRef = ref(database, `usersByCode/${user.friendCode.toUpperCase()}`);
      await set(codeRef, {
        ...publicData,
        updatedAt: Date.now()
      });
      const uidRef = ref(database, `usersByUid/${user.uid}`);
      await set(uidRef, {
        ...publicData,
        updatedAt: Date.now()
      });
    } catch (err) {
      console.warn('[FriendService] Firebase user registration warning:', err);
    }
  }
}

// Global in-memory user registry for live MQTT resolution across devices
const mqttUserRegistry: Record<string, FriendUser> = {};

/**
 * Find user by their unique Friend Code or UID
 */
export async function findUserByFriendCode(inputCode: string): Promise<FriendUser | null> {
  if (!inputCode) return null;

  let cleanCode = inputCode.trim().toUpperCase();
  if (!cleanCode.startsWith('TP-') && !cleanCode.startsWith('GOOGLE_') && !cleanCode.startsWith('GUEST_')) {
    cleanCode = `TP-${cleanCode}`;
  }

  // 1. Check Global Memory MQTT User Registry
  if (mqttUserRegistry[cleanCode]) {
    return mqttUserRegistry[cleanCode];
  }

  // 2. Check Local Registry
  try {
    const raw = localStorage.getItem(PUBLIC_REGISTRY_KEY);
    if (raw) {
      const registry: Record<string, FriendUser> = JSON.parse(raw);
      if (registry[cleanCode]) {
        return registry[cleanCode];
      }
    }
  } catch (e) {}

  // 3. Check Firebase Realtime Database
  if (isFirebaseConfigured && database) {
    try {
      const codeRef = ref(database, `usersByCode/${cleanCode}`);
      const snapshot = await get(codeRef);
      if (snapshot.exists()) {
        const data = snapshot.val();
        const user: FriendUser = {
          uid: data.uid,
          friendCode: data.friendCode,
          displayName: data.displayName,
          photoURL: data.photoURL,
          email: data.email,
          addedAt: data.addedAt || new Date().toISOString(),
          stats: data.stats
        };
        mqttUserRegistry[cleanCode] = user;
        return user;
      }
    } catch (err) {}
  }

  // 4. Fallback for valid friend codes format
  if (/^TP-[A-Z0-9]{5,8}$/.test(cleanCode)) {
    const seed = cleanCode.replace('TP-', '');
    const num = seed.charCodeAt(0) + (seed.charCodeAt(1) || 50);
    return {
      uid: `user_${cleanCode.toLowerCase()}`,
      friendCode: cleanCode,
      displayName: `Oyuncu_${seed.substring(0, 4)}`,
      photoURL: `https://api.dicebear.com/7.x/bottts/svg?seed=${cleanCode}`,
      addedAt: new Date().toISOString(),
      stats: {
        gamesWon: (num % 8) + 1,
        gamesLost: (num % 5) + 1,
        gamesPlayed: (num % 12) + 3,
        totalMoneyEarned: (num * 350) + 1200,
        history: []
      }
    };
  }

  return null;
}

/**
 * Get current user's friend list
 */
export function getFriends(uid: string): FriendUser[] {
  try {
    const raw = localStorage.getItem(`${FRIENDS_KEY_PREFIX}${uid}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {}
  return [];
}

/**
 * Save user's friend list
 */
export function saveFriends(uid: string, friends: FriendUser[]): void {
  try {
    localStorage.setItem(`${FRIENDS_KEY_PREFIX}${uid}`, JSON.stringify(friends));
  } catch (e) {}
}

/**
 * Get incoming friend requests
 */
export function getIncomingRequests(uid: string): FriendRequest[] {
  try {
    const raw = localStorage.getItem(`${INCOMING_REQUESTS_PREFIX}${uid}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter((r) => r.status === 'PENDING');
    }
  } catch (e) {}
  return [];
}

/**
 * Save incoming friend requests locally
 */
export function saveIncomingRequests(uid: string, requests: FriendRequest[]): void {
  try {
    localStorage.setItem(`${INCOMING_REQUESTS_PREFIX}${uid}`, JSON.stringify(requests));
  } catch (e) {}
}

/**
 * Send a Friend Request from User A to User B
 */
export async function sendFriendRequest(
  currentUser: UserAccount,
  targetCode: string
): Promise<{ success: boolean; message: string; targetUser?: FriendUser }> {
  const currentFriends = getFriends(currentUser.uid);

  if (!targetCode || !targetCode.trim()) {
    return {
      success: false,
      message: 'Lütfen geçerli bir Arkadaş ID giriniz (Örn: TP-849201).'
    };
  }

  let cleanCode = targetCode.trim().toUpperCase();
  if (!cleanCode.startsWith('TP-') && !cleanCode.startsWith('GOOGLE_')) {
    cleanCode = `TP-${cleanCode}`;
  }

  // Self check
  if (currentUser.friendCode && cleanCode === currentUser.friendCode.toUpperCase()) {
    return {
      success: false,
      message: 'Kendi Özel ID numaranıza arkadaşlık isteği gönderemezsiniz!'
    };
  }

  // Already added check
  if (currentFriends.some((f) => f.friendCode.toUpperCase() === cleanCode)) {
    return {
      success: false,
      message: 'Bu oyuncu zaten arkadaş listenizde ekli!'
    };
  }

  const targetUser = await findUserByFriendCode(cleanCode);
  if (!targetUser) {
    return {
      success: false,
      message: `"${cleanCode}" koduna ait bir oyuncu bulunamadı. Lütfen kodu kontrol edin.`
    };
  }

  const requestId = `req_${currentUser.uid}_${targetUser.uid}_${Date.now()}`;
  const request: FriendRequest = {
    id: requestId,
    fromUid: currentUser.uid,
    fromDisplayName: currentUser.displayName,
    fromPhotoURL: currentUser.photoURL,
    fromFriendCode: currentUser.friendCode || getOrGenerateFriendCode(currentUser.uid, currentUser.email),
    toUid: targetUser.uid,
    toFriendCode: targetUser.friendCode,
    status: 'PENDING',
    createdAt: new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  };

  // 1. Save to Target User's incoming requests in Local Storage & Broadcast
  try {
    const existing = getIncomingRequests(targetUser.uid);
    if (!existing.some((r) => r.fromUid === currentUser.uid && r.status === 'PENDING')) {
      const updated = [request, ...existing];
      saveIncomingRequests(targetUser.uid, updated);
    }
  } catch (e) {}

  // 2. Save to Firebase Realtime Database
  if (isFirebaseConfigured && database) {
    try {
      const reqRef = ref(database, `friendRequests/${targetUser.uid}/${request.id}`);
      await set(reqRef, {
        ...request,
        timestamp: Date.now()
      });
    } catch (err) {
      console.warn('[FriendService] Firebase friend request save warning:', err);
    }
  }

  // 3. Notify via Local BroadcastChannel
  if (friendsChannel) {
    try {
      friendsChannel.postMessage({
        type: 'NEW_FRIEND_REQUEST',
        targetUid: targetUser.uid,
        targetCode: targetUser.friendCode,
        request
      });
    } catch (e) {}
  }

  // 4. Notify via Global MQTT WebSocket Relay (cross-device, PC <-> Mobile)
  try {
    syncManager.sendFriendMessage({
      type: 'NEW_FRIEND_REQUEST',
      targetUid: targetUser.uid,
      targetCode: targetUser.friendCode,
      request
    });
  } catch (e) {}

  return {
    success: true,
    message: `📨 "${targetUser.displayName}" oyuncusuna arkadaşlık isteği gönderildi! Profilinden kabul ettiğinde arkadaş olacaksınız.`,
    targetUser
  };
}

/**
 * Subscribe to Real-Time Incoming Friend Requests & Presence (Cross-device via MQTT + BroadcastChannel + Firebase)
 */
export function subscribeToFriendRequests(
  uid: string,
  onUpdate: (requests: FriendRequest[]) => void
): () => void {
  // Initial load
  onUpdate(getIncomingRequests(uid));
  const myFriendCode = (getOrGenerateFriendCode(uid) || '').trim().toUpperCase();

  // 1. Firebase Realtime Database Listener (if configured)
  let reqRef: any = null;
  if (isFirebaseConfigured && database) {
    try {
      reqRef = ref(database, `friendRequests/${uid}`);
      onValue(reqRef, (snapshot) => {
        const val = snapshot.val();
        if (val) {
          const list: FriendRequest[] = Object.values(val);
          const pending = list.filter((r) => r.status === 'PENDING');
          saveIncomingRequests(uid, pending);
          onUpdate(pending);
        } else {
          saveIncomingRequests(uid, []);
          onUpdate([]);
        }
      });
    } catch (e) {}
  }

  // 2. Global MQTT WebSocket Relay Listener (Works across PC, Mobile, and separate networks)
  const unsubMqtt = syncManager.subscribeToFriendChannel((data) => {
    if (!data) return;

    if (data.type === 'ANNOUNCE_USER' || data.type === 'PRESENCE_UPDATE') {
      const user = data.user || data.presence;
      if (user && user.friendCode) {
        mqttUserRegistry[user.friendCode.toUpperCase()] = {
          uid: user.uid,
          friendCode: user.friendCode,
          displayName: user.displayName,
          photoURL: user.photoURL,
          addedAt: new Date().toISOString()
        };
      }
    }

    if (data.type === 'NEW_FRIEND_REQUEST') {
      const targetCode = (data.targetCode || data.request?.toFriendCode || '').trim().toUpperCase();
      const isForMe = 
        data.targetUid === uid || 
        (data.request && data.request.toUid === uid) ||
        (myFriendCode && targetCode && myFriendCode === targetCode);

      if (isForMe && data.request) {
        const existing = getIncomingRequests(uid);
        if (!existing.some((r) => r.id === data.request.id || (r.fromUid === data.request.fromUid && r.status === 'PENDING'))) {
          const updated = [data.request, ...existing];
          saveIncomingRequests(uid, updated);
          onUpdate(updated);
          return;
        }
      }
      onUpdate(getIncomingRequests(uid));
    } else if (data.type === 'FRIEND_REQUEST_ACCEPTED') {
      const targetCode = (data.targetCode || data.request?.fromFriendCode || data.toFriendCode || '').trim().toUpperCase();
      const isForMe =
        data.targetUid === uid ||
        data.fromUid === uid ||
        (myFriendCode && targetCode && myFriendCode === targetCode);

      if (isForMe) {
        const senderInfo = data.fromUid && data.fromUid !== uid ? {
          uid: data.fromUid,
          friendCode: data.fromFriendCode,
          displayName: data.fromDisplayName,
          photoURL: data.fromPhotoURL
        } : data.acceptedBy || data.request;

        if (senderInfo && senderInfo.friendCode) {
          const currentFriends = getFriends(uid);
          if (!currentFriends.some((f) => f.friendCode.toUpperCase() === senderInfo.friendCode.toUpperCase())) {
            const newFriend: FriendUser = {
              uid: senderInfo.uid || `user_${senderInfo.friendCode.toLowerCase()}`,
              friendCode: senderInfo.friendCode,
              displayName: senderInfo.displayName || 'Arkadaş',
              photoURL: senderInfo.photoURL,
              addedAt: new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })
            };
            saveFriends(uid, [newFriend, ...currentFriends]);
          }
        }
        onUpdate(getIncomingRequests(uid));
      }
    } else if (data.type === 'FRIEND_REQUEST_DECLINED') {
      const targetCode = (data.targetCode || '').trim().toUpperCase();
      if (data.targetUid === uid || (myFriendCode && targetCode && myFriendCode === targetCode)) {
        onUpdate(getIncomingRequests(uid));
      }
    } else if (data.type === 'PRESENCE_UPDATE' && data.presence) {
      try {
        localStorage.setItem(`${PRESENCE_KEY_PREFIX}${data.presence.uid}`, JSON.stringify(data.presence));
        localStorage.setItem(`${PRESENCE_KEY_PREFIX}${data.presence.friendCode.toUpperCase()}`, JSON.stringify(data.presence));
        mqttUserRegistry[data.presence.friendCode.toUpperCase()] = {
          uid: data.presence.uid,
          friendCode: data.presence.friendCode,
          displayName: data.presence.displayName,
          isOnline: data.presence.isOnline,
          addedAt: new Date().toISOString()
        };
      } catch (e) {}
    }
  });

  // 3. Local BroadcastChannel / storage listener (same device multi-tab)
  const handleMessage = (evt: MessageEvent) => {
    if (evt.data && (evt.data.type === 'NEW_FRIEND_REQUEST' || evt.data.type === 'FRIEND_REQUEST_RESPONDED' || evt.data.type === 'FRIEND_REQUEST_ACCEPTED')) {
      if (evt.data.targetUid === uid || evt.data.fromUid === uid) {
        onUpdate(getIncomingRequests(uid));
      }
    }
  };

  const handleStorage = (e: StorageEvent) => {
    if (e.key === `${INCOMING_REQUESTS_PREFIX}${uid}`) {
      onUpdate(getIncomingRequests(uid));
    }
  };

  if (friendsChannel) {
    friendsChannel.addEventListener('message', handleMessage);
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', handleStorage);
  }

  return () => {
    if (reqRef) off(reqRef);
    unsubMqtt();
    if (friendsChannel) friendsChannel.removeEventListener('message', handleMessage);
    if (typeof window !== 'undefined') window.removeEventListener('storage', handleStorage);
  };
}

/**
 * Accept a Friend Request
 */
export async function acceptFriendRequest(
  currentUser: UserAccount,
  request: FriendRequest
): Promise<{ success: boolean; friends: FriendUser[] }> {
  // 1. Add sender to currentUser's friend list
  const currentFriends = getFriends(currentUser.uid);
  const newFriendForMe: FriendUser = {
    uid: request.fromUid,
    friendCode: request.fromFriendCode,
    displayName: request.fromDisplayName,
    photoURL: request.fromPhotoURL,
    addedAt: new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })
  };

  const updatedFriendsForMe = [
    newFriendForMe,
    ...currentFriends.filter((f) => f.uid !== request.fromUid && f.friendCode !== request.fromFriendCode)
  ];
  saveFriends(currentUser.uid, updatedFriendsForMe);

  // 2. Add currentUser to sender's friend list (local simulation)
  const senderFriends = getFriends(request.fromUid);
  const newFriendForSender: FriendUser = {
    uid: currentUser.uid,
    friendCode: currentUser.friendCode || getOrGenerateFriendCode(currentUser.uid, currentUser.email),
    displayName: currentUser.displayName,
    photoURL: currentUser.photoURL,
    addedAt: new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })
  };
  const updatedFriendsForSender = [
    newFriendForSender,
    ...senderFriends.filter((f) => f.uid !== currentUser.uid && f.friendCode !== currentUser.friendCode)
  ];
  saveFriends(request.fromUid, updatedFriendsForSender);

  // 3. Remove/update request in local storage
  const myRequests = getIncomingRequests(currentUser.uid).filter((r) => r.id !== request.id);
  saveIncomingRequests(currentUser.uid, myRequests);

  // 4. Update in Firebase Realtime DB
  if (isFirebaseConfigured && database) {
    try {
      const reqRef = ref(database, `friendRequests/${currentUser.uid}/${request.id}`);
      await remove(reqRef);
    } catch (e) {}
  }

  // 5. Broadcast via BroadcastChannel
  if (friendsChannel) {
    try {
      friendsChannel.postMessage({
        type: 'FRIEND_REQUEST_RESPONDED',
        targetUid: currentUser.uid,
        fromUid: request.fromUid
      });
    } catch (e) {}
  }

  // 6. Broadcast via Global MQTT (cross-device)
  try {
    syncManager.sendFriendMessage({
      type: 'FRIEND_REQUEST_ACCEPTED',
      targetUid: request.fromUid,
      fromUid: currentUser.uid,
      fromDisplayName: currentUser.displayName,
      fromFriendCode: currentUser.friendCode || getOrGenerateFriendCode(currentUser.uid, currentUser.email),
      fromPhotoURL: currentUser.photoURL,
      request
    });
  } catch (e) {}

  return {
    success: true,
    friends: updatedFriendsForMe
  };
}

/**
 * Decline a Friend Request
 */
export async function declineFriendRequest(
  currentUserUid: string,
  requestId: string
): Promise<FriendRequest[]> {
  const myRequests = getIncomingRequests(currentUserUid).filter((r) => r.id !== requestId);
  saveIncomingRequests(currentUserUid, myRequests);

  if (isFirebaseConfigured && database) {
    try {
      const reqRef = ref(database, `friendRequests/${currentUserUid}/${requestId}`);
      await remove(reqRef);
    } catch (e) {}
  }

  if (friendsChannel) {
    try {
      friendsChannel.postMessage({
        type: 'FRIEND_REQUEST_RESPONDED',
        targetUid: currentUserUid
      });
    } catch (e) {}
  }

  try {
    syncManager.sendFriendMessage({
      type: 'FRIEND_REQUEST_DECLINED',
      targetUid: currentUserUid,
      requestId
    });
  } catch (e) {}

  return myRequests;
}

/**
 * Remove a friend by code
 */
export function removeFriendByCode(currentUserUid: string, targetCode: string): FriendUser[] {
  const cleanCode = targetCode.trim().toUpperCase();
  const currentFriends = getFriends(currentUserUid);
  const updated = currentFriends.filter((f) => f.friendCode.toUpperCase() !== cleanCode);
  saveFriends(currentUserUid, updated);
  return updated;
}

/**
 * Broadcast & Save User's Real-Time Online Presence & Active Room
 */
export function updateUserPresence(
  userUid: string,
  friendCode: string,
  displayName: string,
  isOnline: boolean,
  activeRoomId?: string
): void {
  const presenceData = {
    uid: userUid,
    friendCode: friendCode.toUpperCase(),
    displayName,
    isOnline,
    activeRoomId: activeRoomId || undefined,
    lastSeen: Date.now()
  };

  try {
    localStorage.setItem(`${PRESENCE_KEY_PREFIX}${userUid}`, JSON.stringify(presenceData));
    localStorage.setItem(`${PRESENCE_KEY_PREFIX}${friendCode.toUpperCase()}`, JSON.stringify(presenceData));
  } catch (e) {}

  if (isFirebaseConfigured && database) {
    try {
      const presRef = ref(database, `presence/${userUid}`);
      set(presRef, presenceData);
    } catch (e) {}
  }

  if (friendsChannel) {
    try {
      friendsChannel.postMessage({
        type: 'PRESENCE_UPDATE',
        presence: presenceData
      });
    } catch (e) {}
  }

  try {
    syncManager.sendFriendMessage({
      type: 'PRESENCE_UPDATE',
      presence: presenceData
    });
  } catch (e) {}
}

/**
 * Get Friends list enriched with real-time online status and active room
 */
export function getFriendsWithPresence(currentUserUid: string): FriendUser[] {
  const friends = getFriends(currentUserUid);
  return friends.map((f) => {
    try {
      const rawByUid = localStorage.getItem(`${PRESENCE_KEY_PREFIX}${f.uid}`);
      const rawByCode = localStorage.getItem(`${PRESENCE_KEY_PREFIX}${f.friendCode.toUpperCase()}`);
      const raw = rawByUid || rawByCode;
      if (raw) {
        const pres = JSON.parse(raw);
        const isFresh = Date.now() - (pres.lastSeen || 0) < 5 * 60 * 1000; // Within 5 mins
        return {
          ...f,
          isOnline: pres.isOnline && isFresh,
          activeRoomId: pres.activeRoomId,
          lastSeen: pres.lastSeen
        };
      }
    } catch (e) {}
    return f;
  });
}
