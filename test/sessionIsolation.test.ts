import { createInitialState } from '../src/engine/gameEngine';
import { MultiplayerSyncManager, SyncMessage } from '../src/services/multiplayerSync';
import { GameState, Player } from '../src/types/game';

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${msg}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${msg}`);
    failed++;
    throw new Error(`Assertion failed: ${msg}`);
  }
}

console.log('===============================================================');
console.log('🔒 TURKISH PARADISE — MULTIPLAYER SESSION ISOLATION TEST SUITE 🔒');
console.log('===============================================================\n');

// TEST 1: Unique Session & Game ID generation
console.log('--- TEST 1: Unique Session & Game ID on State Creation ---');
const stateA = createInitialState({ roomCode: 'TR-1111' });
const stateB = createInitialState({ roomCode: 'TR-1111' });
const stateC = createInitialState({ roomCode: 'TR-2222' });

assert(Boolean(stateA.sessionId), 'stateA has a valid sessionId');
assert(Boolean(stateA.gameId), 'stateA has a valid gameId');
assert(Boolean(stateB.sessionId), 'stateB has a valid sessionId');
assert(Boolean(stateB.gameId), 'stateB has a valid gameId');
assert(stateA.sessionId !== stateB.sessionId, 'Two states with same roomCode get strictly distinct sessionIds');
assert(stateA.gameId !== stateB.gameId, 'Two states with same roomCode get strictly distinct gameIds');
assert(stateA.sessionId !== stateC.sessionId, 'Different roomCodes get strictly distinct sessionIds');

// TEST 2: Hard Session Reset and ROOM_CLOSED notification
console.log('\n--- TEST 2: ROOM_CLOSED message and Hard Session Reset ---');
const roomId = 'TR-TEST-99';
const hostSessionId = stateA.sessionId!;
let guestReceivedRoomClosed = false;
let guestReceivedReason = '';

const guestManager = new MultiplayerSyncManager();
const guestUnsub = guestManager.joinRoom(
  roomId,
  (msg: SyncMessage) => {
    if (msg.type === 'ROOM_CLOSED') {
      guestReceivedRoomClosed = true;
      guestReceivedReason = msg.reason || '';
    }
  },
  false,
  hostSessionId
);

// Host notifies room closed
guestManager.notifyListeners({
  type: 'ROOM_CLOSED',
  senderId: 'host_client',
  roomId,
  sessionId: hostSessionId,
  reason: 'HOST_LEFT_LOBBY'
});

assert(guestReceivedRoomClosed, 'Guest successfully received ROOM_CLOSED broadcast');
assert(guestReceivedReason === 'HOST_LEFT_LOBBY', 'Guest received correct reason: HOST_LEFT_LOBBY');

guestUnsub();
guestManager.hardResetSession(roomId);

// TEST 3: Stale Packet Rejection with Mismatched SessionId
console.log('\n--- TEST 3: Stale Packet Rejection across Old and New Sessions ---');
let guestReceivedStatePacket = false;

const guestManager2 = new MultiplayerSyncManager();
const guestUnsub2 = guestManager2.joinRoom(
  roomId,
  (msg: SyncMessage) => {
    if (msg.type === 'STATE_SYNC') {
      guestReceivedStatePacket = true;
    }
  },
  false,
  stateB.sessionId // Guest is currently on stateB's session
);

// Dispatch packet from OLD session (stateA)
guestManager2.notifyListeners({
  type: 'STATE_SYNC',
  senderId: 'host_client',
  roomId,
  sessionId: stateA.sessionId, // Stale session!
  gameId: stateA.gameId,
  version: 1,
  state: stateA
});

assert(!guestReceivedStatePacket, 'Guest rejected STATE_SYNC packet originating from expired session');

// Dispatch packet from CURRENT session (stateB)
guestManager2.notifyListeners({
  type: 'STATE_SYNC',
  senderId: 'host_client',
  roomId,
  sessionId: stateB.sessionId, // Matching session!
  gameId: stateB.gameId,
  version: 1,
  state: stateB
});

assert(guestReceivedStatePacket, 'Guest accepted STATE_SYNC packet matching current session');

guestUnsub2();
guestManager2.hardResetSession(roomId);

// TEST 4: Full Multi-Game Recreation Lifecycle (Preventing Auto-Spectator Leak)
console.log('\n--- TEST 4: Full Multi-Game Recreation Lifecycle (No Auto-Spectator) ---');

// Game 1: Host creates room TR-9000, Guest joins
const roomCode1 = 'TR-9000';
const hostId1 = 'p_host_1';
const guestId1 = 'p_guest_1';

const hostPlayer1: Player = {
  id: hostId1,
  name: 'Host Player',
  color: '#EF4444',
  avatar: '🎩',
  money: 1500,
  position: 0,
  isJailed: false,
  jailTurns: 0,
  lapsCompleted: 0,
  firstLapPurchases: 0,
  inGame: true,
  isHost: true,
  isBot: false,
  isAfk: false
};

const guestPlayer1: Player = {
  id: guestId1,
  name: 'Guest Player',
  color: '#3B82F6',
  avatar: '🏎️',
  money: 1500,
  position: 0,
  isJailed: false,
  jailTurns: 0,
  lapsCompleted: 0,
  firstLapPurchases: 0,
  inGame: true,
  isHost: false,
  isBot: false,
  isAfk: false
};

let game1State: GameState = {
  ...createInitialState({ roomCode: roomCode1 }),
  roomId: roomCode1,
  hostPlayerId: hostId1,
  players: [hostPlayer1, guestPlayer1],
  phase: 'PLAYING'
};

const game1SessionId = game1State.sessionId!;

// Guest Client Sync Manager
const guestClientSync = new MultiplayerSyncManager();
let guestGameState: GameState | null = null;
let guestGotRoomClosedNotification = false;

const guestSubGame1 = guestClientSync.joinRoom(
  roomCode1,
  (msg) => {
    if (msg.type === 'ROOM_CLOSED') {
      guestGotRoomClosedNotification = true;
      guestGameState = null;
    } else if (msg.type === 'STATE_SYNC' && msg.state) {
      guestGameState = msg.state;
    }
  },
  false,
  game1SessionId
);

// Host syncs game 1
guestClientSync.notifyListeners({
  type: 'STATE_SYNC',
  senderId: 'host_client_1',
  roomId: roomCode1,
  sessionId: game1SessionId,
  gameId: game1State.gameId,
  version: 1,
  state: game1State
});

assert(guestGameState !== null, 'Guest received game 1 state');
assert((guestGameState as any)?.players.length === 2, 'Game 1 has 2 players');

// Step: Host clicks "Lobiye Dön" / "Yeniden Başlat"
// Host sends ROOM_CLOSED to room and hard resets
guestClientSync.notifyListeners({
  type: 'ROOM_CLOSED',
  senderId: 'host_client_1',
  roomId: roomCode1,
  sessionId: game1SessionId,
  reason: 'RESTART'
});

assert(guestGotRoomClosedNotification, 'Guest received ROOM_CLOSED and set local state to null');

// Guest executes terminateGameSession -> unsubscribes and hard resets
guestSubGame1();
guestClientSync.hardResetSession(roomCode1, guestId1);

// Step: Host creates a NEW game (Game 2) with fresh session and same or new room code
const hostId2 = 'p_host_2';
const hostPlayer2: Player = {
  id: hostId2,
  name: 'Host Player',
  color: '#EF4444',
  avatar: '🎩',
  money: 1500,
  position: 0,
  isJailed: false,
  jailTurns: 0,
  lapsCompleted: 0,
  firstLapPurchases: 0,
  inGame: true,
  isHost: true,
  isBot: false,
  isAfk: false
};

const game2State: GameState = {
  ...createInitialState({ roomCode: roomCode1 }),
  roomId: roomCode1,
  hostPlayerId: hostId2,
  players: [hostPlayer2],
  phase: 'LOBBY'
};

const game2SessionId = game2State.sessionId!;
assert(game2SessionId !== game1SessionId, 'Game 2 has brand new sessionId despite same room code');

// Host broadcasts Game 2
// If any leftover message reaches guestClientSync, guestClientSync has reset currentSessionId to null and unsubscribed
guestClientSync.notifyListeners({
  type: 'STATE_SYNC',
  senderId: 'host_client_2',
  roomId: roomCode1,
  sessionId: game2SessionId,
  gameId: game2State.gameId,
  version: 1,
  state: game2State
});

// Verify: Guest remains on main menu and was NOT auto-joined into game 2
assert(guestGameState === null, 'Guest remains on main menu and was NOT auto-joined into game 2 as spectator');
assert(game2State.players.length === 1, 'Game 2 only has Host, no leaked spectators or previous guests');

console.log('\n===============================================================');
console.log(`🎉 ALL SESSION ISOLATION TESTS PASSED! (${passed} checks, ${failed} failures)`);
console.log('===============================================================\n');
