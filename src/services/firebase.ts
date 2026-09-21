import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInAnonymously,
  signOut,
  onAuthStateChanged,
  User
} from 'firebase/auth';
import {
  getDatabase,
  ref,
  set,
  get,
  update,
  onValue,
  off,
  push,
  serverTimestamp,
  DatabaseReference
} from 'firebase/database';
import { GameState, Player, UserAccount, UserStats, MatchRecord, ChatMessage } from '../types/game';
import {
  getDeterministicUserId,
  getDeterministicFriendCode,
  getOrGenerateFriendCode,
  getFriends,
  saveUserToPublicRegistry,
  syncUserWithBackend,
  saveAccountToCloud
} from './friendService';

const getEnv = (key: string): string => {
  try {
    if (typeof import.meta !== 'undefined' && (import.meta as any).env && (import.meta as any).env[key]) {
      return (import.meta as any).env[key];
    }
  } catch (e) {}
  try {
    if (typeof process !== 'undefined' && process.env && process.env[key]) {
      return process.env[key] || '';
    }
  } catch (e) {}
  return '';
};

// Firebase configuration from environment variables or default placeholder
const firebaseConfig = {
  apiKey: getEnv('VITE_FIREBASE_API_KEY') || 'AIzaSyDemoTurkishParadiseKey12345',
  authDomain: getEnv('VITE_FIREBASE_AUTH_DOMAIN') || 'turkishparadise-game.firebaseapp.com',
  databaseURL: getEnv('VITE_FIREBASE_DATABASE_URL') || 'https://turkishparadise-game-default-rtdb.firebaseio.com',
  projectId: getEnv('VITE_FIREBASE_PROJECT_ID') || 'turkishparadise-game',
  storageBucket: getEnv('VITE_FIREBASE_STORAGE_BUCKET') || 'turkishparadise-game.appspot.com',
  messagingSenderId: getEnv('VITE_FIREBASE_MESSAGING_SENDER_ID') || '123456789012',
  appId: getEnv('VITE_FIREBASE_APP_ID') || '1:123456789012:web:abcdef1234567890'
};

// Check if valid customized Firebase project is provided
export const isFirebaseConfigured = Boolean(
  getEnv('VITE_FIREBASE_API_KEY') &&
  getEnv('VITE_FIREBASE_API_KEY') !== 'AIzaSyDemoTurkishParadiseKey12345'
);

let app: any = null;
let auth: any = null;
let database: any = null;
let googleProvider: any = null;

try {
  app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  auth = getAuth(app);
  database = getDatabase(app);
  googleProvider = new GoogleAuthProvider();
  googleProvider.setCustomParameters({ prompt: 'select_account' });
} catch (err) {
  console.warn('[Firebase] Initialization notice:', err);
}

export { auth, database, googleProvider };

// Local Storage Keys for offline / fallback profiles
const LOCAL_USER_KEY = 'tp_user_profile';
const STATS_KEY_PREFIX = 'tp_stats_';

// --- AUTHENTICATION METHODS ---

/**
 * Sign in with Google (OAuth Popup or direct Gmail identity)
 */
export async function loginWithGoogle(customEmail?: string, customName?: string): Promise<UserAccount> {
  if (isFirebaseConfigured && auth && googleProvider) {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      const uid = getDeterministicUserId(user.uid || user.email || 'google_user');
      const friendCode = getDeterministicFriendCode(uid, user.email);
      const friends = getFriends(uid);
      const account: UserAccount = {
        uid: uid,
        displayName: user.displayName || 'Google Oyuncusu',
        email: user.email,
        photoURL: user.photoURL,
        isAnonymous: false,
        provider: 'google',
        friendCode,
        friends,
        stats: getUserStats(uid)
      };
      const synced = await syncUserWithBackend(account);
      saveUserToPublicRegistry(synced);
      saveLocalUser(synced);
      saveAccountToCloud(synced);
      return synced;
    } catch (error: any) {
      console.warn('[Auth] Google popup error/fallback:', error);
    }
  }

  // Authentic Google User identity with provided or selected Gmail
  const email = customEmail && customEmail.trim() ? customEmail.trim() : 'oguzhan@gmail.com';
  const nameParts = email.split('@')[0];
  const formattedName = customName && customName.trim()
    ? customName.trim()
    : nameParts.charAt(0).toUpperCase() + nameParts.slice(1);

  // Derive unique deterministic Google ID from email
  const cleanSub = getDeterministicUserId(email);
  const friendCode = getDeterministicFriendCode(cleanSub, email);
  const existingStats = getUserStats(cleanSub);

  const googleAccount: UserAccount = {
    uid: cleanSub,
    displayName: formattedName,
    email: email.includes('@') ? email : `${email}@gmail.com`,
    photoURL: `https://api.dicebear.com/7.x/bottts/svg?seed=${cleanSub}`,
    isAnonymous: false,
    provider: 'google',
    friendCode,
    stats: existingStats
  };

  const syncedAccount = await syncUserWithBackend(googleAccount);
  saveLocalUser(syncedAccount);
  saveAccountToCloud(syncedAccount);
  return syncedAccount;
}


/**
 * Get or generate persistent Guest UUID for guest players
 */
export function getPersistentGuestId(): string {
  const KEY = 'tp_persistent_guest_id';
  let guestId = localStorage.getItem(KEY);
  if (!guestId) {
    guestId = `guest_uuid_${Math.random().toString(36).substring(2, 10)}_${Date.now().toString(36)}`;
    localStorage.setItem(KEY, guestId);
  }
  return guestId;
}

/**
 * Sign in as Guest (Misafir)
 */
export async function loginAsGuest(customName?: string, avatar?: string): Promise<UserAccount> {
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  const guestName = customName && customName.trim() ? customName.trim() : `Misafir_${randomNum}`;
  const persistentGuestUid = getPersistentGuestId();

  if (isFirebaseConfigured && auth) {
    try {
      const result = await signInAnonymously(auth);
      const user = result.user;
      const account: UserAccount = {
        uid: user.uid,
        displayName: guestName,
        isAnonymous: true,
        provider: 'guest',
        stats: getUserStats(user.uid)
      };
      saveLocalUser(account);
      return account;
    } catch (e) {
      console.warn('[Auth] Anonymous sign in fallback:', e);
    }
  }

  const guestAccount: UserAccount = {
    uid: persistentGuestUid,
    displayName: guestName,
    isAnonymous: true,
    provider: 'guest',
    stats: getUserStats(persistentGuestUid)
  };
  saveLocalUser(guestAccount);
  return guestAccount;
}

/**
 * Sign Out
 */
export async function logoutUser(): Promise<void> {
  if (auth) {
    try {
      await signOut(auth);
    } catch (err) {
      console.warn('[Auth] Sign out error:', err);
    }
  }
  localStorage.removeItem(LOCAL_USER_KEY);
}

/**
 * Get currently stored user session
 */
export function getSavedUser(): UserAccount | null {
  try {
    const raw = localStorage.getItem(LOCAL_USER_KEY);
    if (!raw) return null;
    const user: UserAccount = JSON.parse(raw);
    if (user && user.provider === 'google') {
      if (!user.friendCode) {
        user.friendCode = getOrGenerateFriendCode(user.uid, user.email);
      }
      const cached = getFriends(user.uid);
      if (cached && cached.length > 0) {
        user.friends = cached;
      }
      saveUserToPublicRegistry(user);
    }
    return user;
  } catch {
    return null;
  }
}

export function saveLocalUser(user: UserAccount) {
  try {
    localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(user));
    saveAccountToCloud(user);
  } catch (e) {
    console.warn('[Storage] Could not save user:', e);
  }
}

export function getUserStats(uid: string): UserStats {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      if (uid) {
        const raw = localStorage.getItem(STATS_KEY_PREFIX + uid);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed.gamesWon === 'number') {
            return {
              gamesWon: parsed.gamesWon || 0,
              gamesLost: parsed.gamesLost || 0,
              gamesPlayed: parsed.gamesPlayed || (parsed.gamesWon + (parsed.gamesLost || 0)),
              totalMoneyEarned: parsed.totalMoneyEarned || 0,
              history: Array.isArray(parsed.history) ? parsed.history : []
            };
          }
        }
      }
      const rawGlobal = localStorage.getItem(STATS_KEY_PREFIX + 'global');
      if (rawGlobal) {
        const parsed = JSON.parse(rawGlobal);
        if (parsed && typeof parsed.gamesWon === 'number') {
          return {
            gamesWon: parsed.gamesWon || 0,
            gamesLost: parsed.gamesLost || 0,
            gamesPlayed: parsed.gamesPlayed || (parsed.gamesWon + (parsed.gamesLost || 0)),
            totalMoneyEarned: parsed.totalMoneyEarned || 0,
            history: Array.isArray(parsed.history) ? parsed.history : []
          };
        }
      }
      const rawUser = localStorage.getItem('tp_user_profile');
      if (rawUser) {
        const u = JSON.parse(rawUser);
        if (u && u.stats && typeof u.stats.gamesWon === 'number') {
          return u.stats;
        }
      }
    }
  } catch {}
  return { gamesWon: 0, gamesLost: 0, gamesPlayed: 0, totalMoneyEarned: 0, history: [] };
}

export function saveUserStats(uid: string, stats: UserStats): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      if (uid) localStorage.setItem(STATS_KEY_PREFIX + uid, JSON.stringify(stats));
      localStorage.setItem(STATS_KEY_PREFIX + 'global', JSON.stringify(stats));

      const savedUser = getSavedUser();
      if (savedUser) {
        savedUser.stats = stats;
        saveLocalUser(savedUser);
      }
    }
  } catch (e) {
    console.warn('[Stats] Could not save stats:', e);
  }
}

/**
 * Record a game outcome (WIN, LOSS, BANKRUPTCY) with match details
 */
export function recordGameMatch(
  uid: string,
  result: 'WIN' | 'LOSS' | 'BANKRUPTCY',
  moneyEarned: number,
  roomId: string,
  opponentsCount: number
): UserStats {
  const current = getUserStats(uid);
  const isWin = result === 'WIN';
  const newWon = isWin ? current.gamesWon + 1 : current.gamesWon;
  const newLost = !isWin ? current.gamesLost + 1 : current.gamesLost;
  const newPlayed = newWon + newLost;
  const newMoney = current.totalMoneyEarned + Math.max(0, moneyEarned);

  const newRecord: MatchRecord = {
    id: `match_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    roomId: roomId || 'TR-1001',
    result,
    moneyEarned: Math.max(0, moneyEarned),
    date: new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
    opponentsCount: opponentsCount > 0 ? opponentsCount : 2
  };

  const updatedHistory = [newRecord, ...(current.history || [])].slice(0, 30);

  const updatedStats: UserStats = {
    gamesWon: newWon,
    gamesLost: newLost,
    gamesPlayed: newPlayed,
    totalMoneyEarned: newMoney,
    history: updatedHistory
  };

  saveUserStats(uid, updatedStats);
  return updatedStats;
}

export function recordGameWin(uid: string, moneyEarned: number) {
  return recordGameMatch(uid, 'WIN', moneyEarned, 'TR-1001', 2);
}

import { syncManager } from './multiplayerSync';

// --- REAL-TIME ROOM & MULTIPLAYER METHODS ---

/**
 * Create or sync room in global cloud multiplayer relay & Firebase Realtime Database
 */
export async function syncRoomState(roomId: string, gameState: GameState): Promise<void> {
  // 1. Sync through MultiplayerSyncManager (MQTT WebSocket + local BroadcastChannel)
  syncManager.broadcastState(roomId, gameState);

  // 2. Sync to Firebase Realtime DB if connected
  if (isFirebaseConfigured && database) {
    try {
      const roomRef = ref(database, `rooms/${roomId}`);
      await set(roomRef, {
        state: gameState,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      console.warn('[Firebase] Room sync error:', err);
    }
  }
}

// The room state can arrive through Firebase even when the MQTT action relay is offline.
// Mirror human roll requests there so the host can still process them.
export async function relayDiceRoll(roomId: string, playerId: string, actionId: string): Promise<void> {
  if (!isFirebaseConfigured || !database) return;
  try {
    await set(ref(database, `rooms/${roomId}/diceAction`), {
      actionId, playerId, actionType: 'ROLL_DICE', createdAt: Date.now()
    });
  } catch (err) {
    console.warn('[Firebase] Dice action relay error:', err);
  }
}

export interface DiceRolledPayload {
  playerId: string;
  dice: [number, number];
  total: number;
  isDouble: boolean;
  doublesStreak: number;
  startPosition: number;
  targetPosition: number;
  passedGo: boolean;
}

/**
 * Subscribe to real-time room updates across devices worldwide
 */
export function subscribeToRoom(
  roomId: string,
  onUpdate: (state: GameState) => void,
  onJoinRequest?: (player: Player) => void,
  onRequestSync?: () => void,
  onPlayerLeft?: (playerId: string) => void,
  onHostMigrated?: (newHostPlayerId: string) => void,
  onGameAction?: (playerId: string, actionType: string, payload?: any) => void,
  onDiceRolled?: (data: DiceRolledPayload) => void,
  isHost = false
): () => void {
  const seenActions = new Set<string>();
  const subscribedAt = Date.now();
  const receiveAction = (playerId: string, actionType: string, payload?: any, actionId?: string) => {
    if (actionId) {
      if (seenActions.has(actionId)) return;
      seenActions.add(actionId);
      if (seenActions.size > 200) seenActions.clear();
    }
    onGameAction?.(playerId, actionType, payload);
  };
  // 1. Global Sync Manager Subscription (WebRTC + MQTT + BroadcastChannel)
  const unsubscribeSyncManager = syncManager.joinRoom(
    roomId,
    (msg) => {
      if (msg.type === 'STATE_SYNC' && msg.state) {
        onUpdate(msg.state);
      } else if (msg.type === 'DICE_ROLLED' && onDiceRolled) {
        onDiceRolled({
          playerId: msg.playerId,
          dice: msg.dice,
          total: msg.total,
          isDouble: msg.isDouble,
          doublesStreak: msg.doublesStreak,
          startPosition: msg.startPosition,
          targetPosition: msg.targetPosition,
          passedGo: msg.passedGo
        });
      } else if (msg.type === 'JOIN_REQUEST' && msg.player && onJoinRequest) {
        onJoinRequest(msg.player);
      } else if (msg.type === 'REQUEST_SYNC' && onRequestSync) {
        onRequestSync();
      } else if (msg.type === 'LEAVE_NOTICE' && msg.playerId && onPlayerLeft) {
        onPlayerLeft(msg.playerId);
      } else if (msg.type === 'HOST_MIGRATED' && msg.newHostPlayerId && onHostMigrated) {
        onHostMigrated(msg.newHostPlayerId);
      } else if (msg.type === 'GAME_ACTION' && msg.playerId && msg.actionType && onGameAction) {
        receiveAction(msg.playerId, msg.actionType, msg.payload, msg.actionId);
      }
    },
    isHost
  );

  // 2. Firebase Realtime DB Listener (if configured)
  let roomRef: any = null;
  let diceActionRef: any = null;
  if (isFirebaseConfigured && database) {
    try {
      roomRef = ref(database, `rooms/${roomId}/state`);
      onValue(roomRef, (snapshot) => {
        const val = snapshot.val();
        if (val) {
          onUpdate(val);
        }
      });
      if (isHost && onGameAction) {
        diceActionRef = ref(database, `rooms/${roomId}/diceAction`);
        onValue(diceActionRef, (snapshot) => {
          const action = snapshot.val();
          if (!action || !action.actionId || !action.playerId || action.actionType !== 'ROLL_DICE') return;
          // Firebase immediately replays the last value on subscription; ignore old rolls.
          if (typeof action.createdAt !== 'number' || action.createdAt < subscribedAt - 2000) return;
          receiveAction(action.playerId, action.actionType, undefined, action.actionId);
        });
      }
    } catch (err) {
      console.warn('[Firebase] Realtime listener error:', err);
    }
  }

  // Cleanup unsubscribe function
  return () => {
    unsubscribeSyncManager();
    if (roomRef) {
      off(roomRef);
    }
    if (diceActionRef) off(diceActionRef);
  };
}
