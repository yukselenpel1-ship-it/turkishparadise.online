import { PublicRoomInfo, GameState } from '../types/game';
import { syncManager, LOCAL_CLIENT_ID } from './multiplayerSync';
import { database, isFirebaseConfigured } from './firebase';
import { ref, set, remove, onValue, off } from 'firebase/database';

const PUBLIC_ROOMS_GLOBAL_TOPIC = 'turkishparadise/global/public_rooms';
const PUBLIC_ROOMS_TOPIC_PREFIX = 'tp/public_rooms/';
const LOCAL_STORAGE_PUBLIC_ROOMS = 'tp_public_rooms_cache';

// In-memory rooms cache
const roomsMap = new Map<string, PublicRoomInfo>();

// Active Host Room provider callback (if this client is host of a room)
let activeHostRoomProvider: (() => PublicRoomInfo | null) | null = null;

export function setActiveHostRoomProvider(provider: (() => PublicRoomInfo | null) | null): void {
  activeHostRoomProvider = provider;
}

/**
 * Broadcast / announce an active public room to all players worldwide
 */
export function publishPublicRoom(room: PublicRoomInfo): void {
  if (!room.roomId) return;

  const roomData: PublicRoomInfo = {
    ...room,
    isPublic: room.isPublic !== false,
    updatedAt: Date.now(),
  };

  roomsMap.set(room.roomId, roomData);
  persistLocalCache();

  // 1. Broadcast global announcement across all connected devices
  syncManager.broadcastGlobal(PUBLIC_ROOMS_GLOBAL_TOPIC, {
    type: 'ROOM_ANNOUNCE',
    room: roomData,
    senderId: LOCAL_CLIENT_ID,
  });

  // 2. Publish retained MQTT message for newly connecting clients
  syncManager.publishRetained(`${PUBLIC_ROOMS_TOPIC_PREFIX}${room.roomId}`, roomData);

  // 3. Publish via Firebase Realtime Database if configured
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

  // 1. Broadcast room closed event globally
  syncManager.broadcastGlobal(PUBLIC_ROOMS_GLOBAL_TOPIC, {
    type: 'ROOM_CLOSED',
    roomId,
    senderId: LOCAL_CLIENT_ID,
  });

  // 2. MQTT remove retained
  syncManager.publishRetained(`${PUBLIC_ROOMS_TOPIC_PREFIX}${roomId}`, '');

  // 3. Firebase remove
  if (isFirebaseConfigured && database) {
    try {
      const roomRef = ref(database, `public_rooms/${roomId}`);
      remove(roomRef).catch((e) => console.warn('[Firebase] Public room remove failed:', e));
    } catch (e) {}
  }
}

/**
 * Send a discovery query ping asking all active hosts to announce their rooms
 */
export function requestPublicRoomsRefresh(): void {
  syncManager.broadcastGlobal(PUBLIC_ROOMS_GLOBAL_TOPIC, {
    type: 'DISCOVERY_PING',
    senderId: LOCAL_CLIENT_ID,
    timestamp: Date.now(),
  });
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
 * Subscribe to real-time public rooms updates across all platforms (PC, Mobile, Guest, Google)
 */
export function subscribeToPublicRooms(callback: (rooms: PublicRoomInfo[]) => void): () => void {
  loadLocalCache();

  const emitCleanRooms = () => {
    const now = Date.now();
    const activeRooms: PublicRoomInfo[] = [];

    roomsMap.forEach((room, id) => {
      // Exclude rooms stale for more than 35 seconds, private or ended
      if (now - room.updatedAt < 35000 && room.isPublic && room.phase !== 'ENDED' && room.playerCount > 0) {
        activeRooms.push(room);
      } else if (now - room.updatedAt >= 35000 || room.phase === 'ENDED' || !room.isPublic || room.playerCount === 0) {
        roomsMap.delete(id);
      }
    });

    // Sort by: LOBBY first, then player count, then most recent
    activeRooms.sort((a, b) => {
      if (a.phase === 'LOBBY' && b.phase !== 'LOBBY') return -1;
      if (a.phase !== 'LOBBY' && b.phase === 'LOBBY') return 1;
      if (b.playerCount !== a.playerCount) return b.playerCount - a.playerCount;
      return b.updatedAt - a.updatedAt;
    });

    callback([...activeRooms]);
  };

  // Initial emit from local cache
  emitCleanRooms();

  // 1. Global Public Rooms Channel Listener (Instant Ping-Pong & Announcements)
  const unsubscribeGlobal = syncManager.subscribeTopic(PUBLIC_ROOMS_GLOBAL_TOPIC, (payload) => {
    if (!payload || typeof payload !== 'object') return;

    if (payload.type === 'ROOM_ANNOUNCE' && payload.room && payload.room.roomId) {
      if (payload.room.isPublic && payload.room.phase !== 'ENDED' && payload.room.playerCount > 0) {
        roomsMap.set(payload.room.roomId, {
          ...payload.room,
          updatedAt: Date.now(),
        });
      } else {
        roomsMap.delete(payload.room.roomId);
      }
      persistLocalCache();
      emitCleanRooms();
    } else if (payload.type === 'ROOM_CLOSED' && payload.roomId) {
      roomsMap.delete(payload.roomId);
      persistLocalCache();
      emitCleanRooms();
    } else if (payload.type === 'DISCOVERY_PING') {
      // If this client is an active host of a public room, answer the discovery ping immediately
      if (activeHostRoomProvider) {
        try {
          const myRoom = activeHostRoomProvider();
          if (myRoom && myRoom.roomId && myRoom.isPublic && myRoom.phase !== 'ENDED' && myRoom.playerCount > 0) {
            publishPublicRoom(myRoom);
          }
        } catch (e) {}
      }
    }
  });

  // 2. Retained Topic Subscription for tp/public_rooms/#
  const unsubscribeRetained = syncManager.subscribeTopic(`${PUBLIC_ROOMS_TOPIC_PREFIX}+`, (payload, topic) => {
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

  // 3. Firebase Database listener if configured
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

  // Request fresh discovery immediately on subscription
  requestPublicRoomsRefresh();
  setTimeout(requestPublicRoomsRefresh, 1000);
  setTimeout(requestPublicRoomsRefresh, 3000);

  // Periodic discovery ping & cleanup interval (every 5 seconds)
  const discoveryInterval = setInterval(() => {
    emitCleanRooms();
    requestPublicRoomsRefresh();
  }, 5000);

  return () => {
    clearInterval(discoveryInterval);
    unsubscribeGlobal();
    unsubscribeRetained();
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
