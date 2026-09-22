import { PublicRoomInfo, GameState } from '../types/game';
import { syncManager, LOCAL_CLIENT_ID } from './multiplayerSync';
import { database, isFirebaseConfigured } from './firebase';
import { ref, set, remove, onValue, off, onDisconnect } from 'firebase/database';

const PUBLIC_ROOMS_GLOBAL_TOPIC = 'turkishparadise/global/public_rooms';
const ROOM_TTL_MS = 7000; // 7 seconds strict TTL for live rooms

// Live in-memory rooms registry
const roomsMap = new Map<string, PublicRoomInfo>();

// Active Host Room provider callback (if this client is hosting a room)
let activeHostRoomProvider: (() => PublicRoomInfo | null) | null = null;

export function setActiveHostRoomProvider(provider: (() => PublicRoomInfo | null) | null): void {
  activeHostRoomProvider = provider;
}

/**
 * Broadcast / announce an active public room to all players worldwide (Live Heartbeat)
 */
export function publishPublicRoom(room: PublicRoomInfo): void {
  if (!room.roomId) return;

  const roomData: PublicRoomInfo = {
    ...room,
    isPublic: room.isPublic !== false,
    updatedAt: Date.now(),
  };

  roomsMap.set(room.roomId, roomData);

  // 1. Broadcast global live announcement across all connected devices (transient, non-retained)
  syncManager.broadcastGlobal(PUBLIC_ROOMS_GLOBAL_TOPIC, {
    type: 'ROOM_ANNOUNCE',
    room: roomData,
    senderId: LOCAL_CLIENT_ID,
  });

  // 2. Sync via Firebase Realtime Database with automatic onDisconnect cleanup
  if (isFirebaseConfigured && database) {
    try {
      const roomRef = ref(database, `public_rooms/${room.roomId}`);
      set(roomRef, roomData).catch((e) => console.warn('[Firebase] Public room publish failed:', e));
      try {
        onDisconnect(roomRef).remove();
      } catch (e) {}
    } catch (e) {}
  }
}

/**
 * Unpublish / Remove a room from public directory (e.g. game ended, host left, or room closed)
 */
export function unpublishPublicRoom(roomId: string): void {
  if (!roomId) return;

  roomsMap.delete(roomId);

  // 1. Broadcast room closed event globally to immediately remove from all clients
  syncManager.broadcastGlobal(PUBLIC_ROOMS_GLOBAL_TOPIC, {
    type: 'ROOM_CLOSED',
    roomId,
    senderId: LOCAL_CLIENT_ID,
  });

  // 2. Remove from Firebase Realtime Database
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
  // Clear any legacy local storage cache
  try {
    localStorage.removeItem('tp_public_rooms_cache');
  } catch (e) {}

  const emitCleanRooms = () => {
    const now = Date.now();
    const activeRooms: PublicRoomInfo[] = [];

    roomsMap.forEach((room, id) => {
      // Strictly enforce TTL (<= 7s), public status, non-ended phase, and at least 1 player
      if (
        now - room.updatedAt <= ROOM_TTL_MS &&
        room.isPublic &&
        room.phase !== 'ENDED' &&
        room.playerCount > 0
      ) {
        activeRooms.push(room);
      } else {
        roomsMap.delete(id);
      }
    });

    // Sort by: LOBBY first, then player count descending, then newest
    activeRooms.sort((a, b) => {
      if (a.phase === 'LOBBY' && b.phase !== 'LOBBY') return -1;
      if (a.phase !== 'LOBBY' && b.phase === 'LOBBY') return 1;
      if (b.playerCount !== a.playerCount) return b.playerCount - a.playerCount;
      return b.updatedAt - a.updatedAt;
    });

    callback([...activeRooms]);
  };

  // Initial clean emit
  emitCleanRooms();

  // 1. Global Public Rooms Channel Listener (Instant Ping-Pong & Announcements)
  const unsubscribeGlobal = syncManager.subscribeTopic(PUBLIC_ROOMS_GLOBAL_TOPIC, (payload) => {
    if (!payload || typeof payload !== 'object') return;

    if (payload.type === 'ROOM_ANNOUNCE' && payload.room && payload.room.roomId) {
      const room = payload.room as PublicRoomInfo;
      const isFresh = !room.updatedAt || Date.now() - room.updatedAt <= ROOM_TTL_MS;

      if (isFresh && room.isPublic && room.phase !== 'ENDED' && room.playerCount > 0) {
        roomsMap.set(room.roomId, {
          ...room,
          updatedAt: Date.now(),
        });
      } else {
        roomsMap.delete(room.roomId);
      }
      emitCleanRooms();
    } else if (payload.type === 'ROOM_CLOSED' && payload.roomId) {
      roomsMap.delete(payload.roomId);
      emitCleanRooms();
    } else if (payload.type === 'DISCOVERY_PING') {
      // If this client is an active host of a public room, answer the discovery ping immediately
      if (activeHostRoomProvider) {
        try {
          const myRoom = activeHostRoomProvider();
          if (
            myRoom &&
            myRoom.roomId &&
            myRoom.isPublic &&
            myRoom.phase !== 'ENDED' &&
            myRoom.playerCount > 0
          ) {
            publishPublicRoom(myRoom);
          }
        } catch (e) {}
      }
    }
  });

  // 2. Firebase Database listener if configured
  let unsubscribeFirebase = () => {};
  if (isFirebaseConfigured && database) {
    try {
      const publicRoomsRef = ref(database, 'public_rooms');
      const listener = (snapshot: any) => {
        const val = snapshot.val();
        if (val && typeof val === 'object') {
          const now = Date.now();
          Object.values(val).forEach((room: any) => {
            if (
              room &&
              room.roomId &&
              room.isPublic &&
              room.phase !== 'ENDED' &&
              room.playerCount > 0 &&
              now - (room.updatedAt || 0) <= ROOM_TTL_MS
            ) {
              roomsMap.set(room.roomId, { ...room, updatedAt: room.updatedAt || now });
            }
          });
          emitCleanRooms();
        }
      };
      onValue(publicRoomsRef, listener);
      unsubscribeFirebase = () => off(publicRoomsRef, 'value', listener);
    } catch (e) {}
  }

  // Request fresh discovery pings immediately on subscription
  requestPublicRoomsRefresh();
  setTimeout(requestPublicRoomsRefresh, 600);
  setTimeout(requestPublicRoomsRefresh, 1800);

  // Periodic discovery ping & cleanup interval (every 2.5 seconds)
  const discoveryInterval = setInterval(() => {
    emitCleanRooms();
    requestPublicRoomsRefresh();
  }, 2500);

  return () => {
    clearInterval(discoveryInterval);
    unsubscribeGlobal();
    unsubscribeFirebase();
  };
}
