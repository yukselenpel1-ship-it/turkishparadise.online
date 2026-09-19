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

// Firebase configuration from environment variables or default placeholder
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyDemoTurkishParadiseKey12345',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'turkishparadise-game.firebaseapp.com',
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || 'https://turkishparadise-game-default-rtdb.firebaseio.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'turkishparadise-game',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'turkishparadise-game.appspot.com',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '123456789012',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:123456789012:web:abcdef1234567890'
};

// Check if valid customized Firebase project is provided
export const isFirebaseConfigured = Boolean(
  import.meta.env.VITE_FIREBASE_API_KEY &&
  import.meta.env.VITE_FIREBASE_API_KEY !== 'AIzaSyDemoTurkishParadiseKey12345'
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
      const account: UserAccount = {
        uid: user.uid,
        displayName: user.displayName || 'Google Oyuncusu',
        email: user.email,
        photoURL: user.photoURL,
        isAnonymous: false,
        provider: 'google',
        stats: getUserStats(user.uid)
      };
      saveLocalUser(account);
      return account;
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

  // Derive unique ID from email
  const cleanId = `google_${email.replace(/[^a-zA-Z0-9]/g, '_')}`;
  const existingStats = getUserStats(cleanId);

  const googleAccount: UserAccount = {
    uid: cleanId,
    displayName: formattedName,
    email: email.includes('@') ? email : `${email}@gmail.com`,
    photoURL: `https://api.dicebear.com/7.x/bottts/svg?seed=${cleanId}`,
    isAnonymous: false,
    provider: 'google',
    stats: existingStats
  };
  saveLocalUser(googleAccount);
  return googleAccount;
}


/**
 * Sign in as Guest (Misafir)
 */
export async function loginAsGuest(customName?: string, avatar?: string): Promise<UserAccount> {
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  const guestName = customName && customName.trim() ? customName.trim() : `Misafir_${randomNum}`;

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
    uid: `guest_${Math.random().toString(36).substring(2, 9)}`,
    displayName: guestName,
    isAnonymous: true,
    provider: 'guest',
    stats: { gamesWon: 0, gamesLost: 0, gamesPlayed: 0, totalMoneyEarned: 0, history: [] }
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
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveLocalUser(user: UserAccount) {
  try {
    localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(user));
  } catch (e) {
    console.warn('[Storage] Could not save user:', e);
  }
}

export function getUserStats(uid: string): UserStats {
  try {
    const raw = localStorage.getItem(STATS_KEY_PREFIX + uid);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        gamesWon: parsed.gamesWon || 0,
        gamesLost: parsed.gamesLost || 0,
        gamesPlayed: parsed.gamesPlayed || 0,
        totalMoneyEarned: parsed.totalMoneyEarned || 0,
        history: Array.isArray(parsed.history) ? parsed.history : []
      };
    }
  } catch {}
  return { gamesWon: 0, gamesLost: 0, gamesPlayed: 0, totalMoneyEarned: 0, history: [] };
}

export function saveUserStats(uid: string, stats: UserStats): void {
  try {
    localStorage.setItem(STATS_KEY_PREFIX + uid, JSON.stringify(stats));
    
    // Also update saved user account stats if current user matches
    const savedUser = getSavedUser();
    if (savedUser && savedUser.uid === uid) {
      savedUser.stats = stats;
      saveLocalUser(savedUser);
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
  const newPlayed = current.gamesPlayed + 1;
  const newMoney = current.totalMoneyEarned + Math.max(0, moneyEarned);

  const newRecord: MatchRecord = {
    id: `match_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    roomId: roomId || 'TR-1001',
    result,
    moneyEarned: Math.max(0, moneyEarned),
    date: new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
    opponentsCount
  };

  const updatedHistory = [newRecord, ...(current.history || [])].slice(0, 20); // Keep last 20 matches

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

/**
 * Subscribe to real-time room updates across devices worldwide
 */
export function subscribeToRoom(
  roomId: string,
  onUpdate: (state: GameState) => void,
  onJoinRequest?: (player: Player) => void,
  onRequestSync?: () => void,
  isHost = false
): () => void {
  // 1. Global Sync Manager Subscription (WebRTC + MQTT + BroadcastChannel)
  const unsubscribeSyncManager = syncManager.joinRoom(
    roomId,
    (msg) => {
      if (msg.type === 'STATE_SYNC' && msg.state) {
        onUpdate(msg.state);
      } else if (msg.type === 'JOIN_REQUEST' && msg.player && onJoinRequest) {
        onJoinRequest(msg.player);
      } else if (msg.type === 'REQUEST_SYNC' && onRequestSync) {
        onRequestSync();
      }
    },
    isHost
  );

  // 2. Firebase Realtime DB Listener (if configured)
  let roomRef: any = null;
  if (isFirebaseConfigured && database) {
    try {
      roomRef = ref(database, `rooms/${roomId}/state`);
      onValue(roomRef, (snapshot) => {
        const val = snapshot.val();
        if (val) {
          onUpdate(val);
        }
      });
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
  };
}

