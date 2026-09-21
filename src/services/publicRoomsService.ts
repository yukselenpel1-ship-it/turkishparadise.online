import { PublicRoomInfo, GameState } from '../types/game';
import { syncManager } from './multiplayerSync';
import { database, isFirebaseConfigured } from './firebase';
import { ref, set, remove, onValue, off } from 'firebase/database';

const PUBLIC_ROOMS_TOPIC_PREFIX = 'tp/public_rooms/';
const LOCAL_STORAGE_PUBLIC_ROOMS = 'tp_public_rooms_cache';

// In-memory rooms cache
const roomsMap = new Map<string, PublicRoomInfo>();

/**
 * Publish / Update a room in the public rooms directory
 */
export function publishPublicRoom(room: PublicRoomInfo): void {
  if (!room.roomId) return;

  const roomData: PublicRoomInfo = {
    ...room,
    updatedAt: Date.now(),
  };

  roomsMap.set(room.roomId, roomData);
  persistLocalCache();

  // 1. Publish via MQTT (Retained message)
  syncManager.publishRetained(`${PUBLIC_ROOMS_TOPIC_PREFIX}${room.roomId}`, roomData);

  // 2. Publish via Firebase Realtime Database if configured
  if (isFirebaseConfigured && database) {
    try {
      const roomRef = ref(database, `public_rooms/${room.roomId}`);
      set(roomRef, roomData).catch((e) => console.warn('[Firebase] Public room publish failed:', e));
    } catch (e) {}
  }
}

/**
 * Unpublish / Remove a room from public directory (e.g. game ended or room closed)
 */
export function unpublishPublicRoom(roomId: string): void {
  if (!roomId) return;

  roomsMap.delete(roomId);
  persistLocalCache();

  // 1. MQTT remove retained
  syncManager.publishRetained(`${PUBLIC_ROOMS_TOPIC_PREFIX}${roomId}`, '');

  // 2. Firebase remove
  if (isFirebaseConfigured && database) {
    try {
      const roomRef = ref(database, `public_rooms/${roomId}`);
      remove(roomRef).catch((e) => console.warn('[Firebase] Public room remove failed:', e));
    } catch (e) {}
  }
}

/**
 * Extract public room info from a GameState
 */
export function createPublicRoomInfoFromState(state: GameState, isPublic = true): PublicRoomInfo {
  const hostPlayer = state.players.find((p) => p.isHost) || state.players[0];
  const botCount = state.players.filter((p) => p.isBot).length;

  return {
    roomId: state.roomId || state.settings?.roomCode || 'TR-1001',
    hostName: hostPlayer?.name || 'Kurucu',
    hostAvatar: hostPlayer?.avatar || '👑',
    playerCount: state.players.length,
    maxPlayers: 6,
    botCount,
    phase: state.phase,
    startingMoney: state.settings?.startingMoney || 1500,
    isPublic: isPublic !== false,
    updatedAt: Date.now(),
  };
}

/**
 * Subscribe to real-time public rooms updates
 */
export function subscribeToPublicRooms(callback: (rooms: PublicRoomInfo[]) => void): () => void {
  loadLocalCache();

  const emitCleanRooms = () => {
    const now = Date.now();
    const activeRooms: PublicRoomInfo[] = [];

    roomsMap.forEach((room, id) => {
      // Exclude rooms stale for more than 2 minutes or unlisted
      if (now - room.updatedAt < 120000 && room.isPublic) {
        activeRooms.push(room);
      } else if (now - room.updatedAt >= 120000) {
        roomsMap.delete(id);
      }
    });

    // Sort by: LOBBY first, then most recent
    activeRooms.sort((a, b) => {
      if (a.phase === 'LOBBY' && b.phase !== 'LOBBY') return -1;
      if (a.phase !== 'LOBBY' && b.phase === 'LOBBY') return 1;
      return b.updatedAt - a.updatedAt;
    });

    callback([...activeRooms]);
  };

  // Initial emit
  emitCleanRooms();

  // 1. MQTT Topic Subscription for tp/public_rooms/#
  const unsubscribeMqtt = syncManager.subscribeTopic(`${PUBLIC_ROOMS_TOPIC_PREFIX}+`, (payload, topic) => {
    const roomId = topic.replace(PUBLIC_ROOMS_TOPIC_PREFIX, '').trim();
    if (!roomId) return;

    if (!payload || payload === '') {
      roomsMap.delete(roomId);
    } else {
      try {
        const roomInfo = typeof payload === 'string' ? JSON.parse(payload) : payload;
        if (roomInfo && roomInfo.roomId) {
          roomsMap.set(roomInfo.roomId, { ...roomInfo, updatedAt: Date.now() });
        }
      } catch (e) {}
    }
    emitCleanRooms();
  });

  // 2. Firebase Database listener if configured
  let unsubscribeFirebase = () => {};
  if (isFirebaseConfigured && database) {
    try {
      const publicRoomsRef = ref(database, 'public_rooms');
      const listener = (snapshot: any) => {
        const val = snapshot.val();
        if (val && typeof val === 'object') {
          Object.values(val).forEach((room: any) => {
            if (room && room.roomId) {
              roomsMap.set(room.roomId, { ...room, updatedAt: Date.now() });
            }
          });
          emitCleanRooms();
        }
      };
      onValue(publicRoomsRef, listener);
      unsubscribeFirebase = () => off(publicRoomsRef, 'value', listener);
    } catch (e) {}
  }

  // Periodic prune interval (every 10s)
  const pruneInterval = setInterval(emitCleanRooms, 10000);

  return () => {
    clearInterval(pruneInterval);
    unsubscribeMqtt();
    unsubscribeFirebase();
  };
}

function persistLocalCache() {
  try {
    const arr = Array.from(roomsMap.values());
    localStorage.setItem(LOCAL_STORAGE_PUBLIC_ROOMS, JSON.stringify(arr));
  } catch (e) {}
}

function loadLocalCache() {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_PUBLIC_ROOMS);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        arr.forEach((r) => {
          if (r && r.roomId) roomsMap.set(r.roomId, r);
        });
      }
    }
  } catch (e) {}
}
