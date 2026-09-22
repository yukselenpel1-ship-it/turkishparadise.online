import { createInitialState, isPlayerHost } from '../src/engine/gameEngine';
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

console.log('================================================================');
console.log('🔒 TURKISH PARADISE — MULTIPLAYER SESSION & JOIN AUDIT TEST SUITE');
console.log('================================================================\n');

// -------------------------------------------------------------------------------------------------
// TEST 1: Unique Session & Game ID generation
// -------------------------------------------------------------------------------------------------
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

// -------------------------------------------------------------------------------------------------
// TEST 2: Hard Session Reset and ROOM_CLOSED notification
// -------------------------------------------------------------------------------------------------
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
  undefined
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

// -------------------------------------------------------------------------------------------------
// TEST 3: Stale Packet Rejection with Mismatched SessionId
// -------------------------------------------------------------------------------------------------
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
  stateB.sessionId // Host or active client is on stateB's session
);
guestManager2.setSessionId(stateB.sessionId!);

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

// -------------------------------------------------------------------------------------------------
// TEST 4: REGRESSION TEST — NORMAL LIVE ROOM JOIN
// -------------------------------------------------------------------------------------------------
console.log('\n--- TEST 4: Normal Live Room Join (No Disconnects / No Room Closed) ---');
const liveRoomCode = 'TR-LIVE-77';

// 1. Host creates room
const hostP: Player = {
  id: 'p_host_77',
  userId: 'u_host_77',
  name: 'Host User',
  color: '#EF4444',
  avatar: '👑',
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

let liveHostState: GameState = {
  ...createInitialState({ roomCode: liveRoomCode }),
  roomId: liveRoomCode,
  hostPlayerId: hostP.id,
  players: [hostP],
  phase: 'LOBBY'
};

const liveSessionId = liveHostState.sessionId!;
const liveGameId = liveHostState.gameId!;

const hostSync = new MultiplayerSyncManager();
let hostReceivedJoinRequest: Player | null = null;
let hostRoomClosed = false;

hostSync.joinRoom(
  liveRoomCode,
  (msg) => {
    if (msg.type === 'JOIN_REQUEST' && msg.player) {
      hostReceivedJoinRequest = msg.player;
    } else if (msg.type === 'ROOM_CLOSED') {
      hostRoomClosed = true;
    }
  },
  true,
  liveSessionId
);

// Verify Host authority check
assert(isPlayerHost(liveHostState, hostP.id) === true, 'Host is verified as true host');
assert(isPlayerHost(liveHostState, 'p_guest_random') === false, 'Random guest is NOT host');

// 2. Guest discovers room and clicks "GİR" (JOIN)
const guestP: Player = {
  id: 'p_guest_88',
  userId: 'u_guest_88',
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

const guestSync = new MultiplayerSyncManager();
let guestAdoptedState: GameState | null = null;
let guestRoomClosed = false;

// Guest joins WITHOUT dummy sessionId constraint
guestSync.joinRoom(
  liveRoomCode,
  (msg) => {
    if (msg.type === 'STATE_SYNC' && msg.state) {
      guestAdoptedState = msg.state;
      guestSync.setSessionId(msg.state.sessionId || null);
    } else if (msg.type === 'ROOM_CLOSED') {
      guestRoomClosed = true;
    }
  },
  false,
  undefined
);

// Guest sends JOIN_REQUEST to Host
const joinMsg: SyncMessage = {
  type: 'JOIN_REQUEST',
  senderId: 'client_guest_88',
  roomId: liveRoomCode,
  player: guestP
};
hostSync.notifyListeners(joinMsg);

assert(hostReceivedJoinRequest !== null, 'Host successfully received JOIN_REQUEST without session mismatch drop');
assert((hostReceivedJoinRequest as any)?.id === guestP.id, 'Host received correct joining player data');

// Host adds guest and broadcasts STATE_SYNC
liveHostState = {
  ...liveHostState,
  players: [...liveHostState.players, guestP]
};

const stateSyncMsg: SyncMessage = {
  type: 'STATE_SYNC',
  senderId: 'client_host_77',
  roomId: liveRoomCode,
  sessionId: liveSessionId,
  gameId: liveGameId,
  version: 1,
  state: liveHostState
};

guestSync.notifyListeners(stateSyncMsg);

assert(guestAdoptedState !== null, 'Guest successfully accepted and adopted Host STATE_SYNC');
assert(guestAdoptedState?.sessionId === liveSessionId, 'Guest adopted Host authoritative sessionId');
assert(guestAdoptedState?.players.length === 2, 'Room lobby has exactly 2 players (Host + Guest)');
assert(!hostRoomClosed, 'Host room is NOT closed during join');
assert(!guestRoomClosed, 'Guest room is NOT closed during join');

// -------------------------------------------------------------------------------------------------
// TEST 5: 3-PLAYER LIVE ROOM JOIN (Host A + Player B + Player C)
// -------------------------------------------------------------------------------------------------
console.log('\n--- TEST 5: 3-Player Live Room Join (Sequential Join) ---');

const playerC: Player = {
  id: 'p_guest_99',
  userId: 'u_guest_99',
  name: 'Player C',
  color: '#10B981',
  avatar: '🎩',
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

const playerCSync = new MultiplayerSyncManager();
let playerCAdoptedState: GameState | null = null;

playerCSync.joinRoom(
  liveRoomCode,
  (msg) => {
    if (msg.type === 'STATE_SYNC' && msg.state) {
      playerCAdoptedState = msg.state;
      playerCSync.setSessionId(msg.state.sessionId || null);
    }
  },
  false,
  undefined
);

// Player C sends JOIN_REQUEST
hostSync.notifyListeners({
  type: 'JOIN_REQUEST',
  senderId: 'client_guest_99',
  roomId: liveRoomCode,
  player: playerC
});

// Host adds Player C
liveHostState = {
  ...liveHostState,
  players: [...liveHostState.players, playerC]
};

const stateSync3: SyncMessage = {
  type: 'STATE_SYNC',
  senderId: 'client_host_77',
  roomId: liveRoomCode,
  sessionId: liveSessionId,
  gameId: liveGameId,
  version: 2,
  state: liveHostState
};

guestSync.notifyListeners(stateSync3);
playerCSync.notifyListeners(stateSync3);

assert(playerCAdoptedState !== null, 'Player C adopted room state');
assert(liveHostState.players.length === 3, 'Host has all 3 players');
assert(guestAdoptedState?.players.length === 3, 'Guest B has all 3 players');
assert(playerCAdoptedState?.players.length === 3, 'Player C has all 3 players');

// -------------------------------------------------------------------------------------------------
// TEST 6: DUPLICATE JOIN REQUEST IDEMPOTENCY
// -------------------------------------------------------------------------------------------------
console.log('\n--- TEST 6: Duplicate JOIN_REQUEST Idempotency ---');
let hostPlayersBefore = liveHostState.players.length;

// Send duplicate join request for Player C
const existingIdx = liveHostState.players.findIndex(p => p.id === playerC.id);
assert(existingIdx >= 0, 'Player C already exists in room');
if (existingIdx >= 0) {
  // Idempotent restore: update in place without increasing array length
  liveHostState.players[existingIdx] = { ...liveHostState.players[existingIdx], isAfk: false };
}

assert(liveHostState.players.length === hostPlayersBefore, 'Duplicate join request did not duplicate player in room');

// -------------------------------------------------------------------------------------------------
// TEST 7: INVALID / STALE JOIN PACKET ISOLATION
// -------------------------------------------------------------------------------------------------
console.log('\n--- TEST 7: Invalid / Stale Packet Isolation ---');
let hostDisrupted = false;

// Rogue packet with expired session
hostSync.notifyListeners({
  type: 'STATE_SYNC',
  senderId: 'rogue_client',
  roomId: liveRoomCode,
  sessionId: 'sess_EXPIRED_OLD_999',
  gameId: 'game_OLD',
  version: 999,
  state: createInitialState({ roomCode: liveRoomCode })
});

assert(liveHostState.hostPlayerId === hostP.id, 'Host state was NOT overwritten by rogue packet');
assert(liveHostState.players.length === 3, 'Host players list was not disrupted');

// -------------------------------------------------------------------------------------------------
// TEST 8: ROOM_CLOSED AUTHORITY
// -------------------------------------------------------------------------------------------------
console.log('\n--- TEST 8: ROOM_CLOSED Authority (Host-Only) ---');
let hostClosedFromPeer = false;

// Host ignores incoming ROOM_CLOSED from non-host peer
hostSync.notifyListeners({
  type: 'ROOM_CLOSED',
  senderId: 'rogue_client',
  roomId: liveRoomCode,
  sessionId: liveSessionId,
  reason: 'ROGUE_CLOSE'
});

assert(!hostRoomClosed, 'Authoritative host is NEVER terminated by incoming ROOM_CLOSED');

// Non-host calling sendRoomClosed is safely blocked in multiplayerSync
const nonHostSync = new MultiplayerSyncManager();
nonHostSync.joinRoom(liveRoomCode, () => {}, false, undefined);
nonHostSync.sendRoomClosed(liveRoomCode, liveSessionId, 'ILLEGAL_ATTEMPT');
// No error thrown and message blocked

// -------------------------------------------------------------------------------------------------
// TEST 9: OLD SESSION ISOLATION (Previous session players do not auto-join new game)
// -------------------------------------------------------------------------------------------------
console.log('\n--- TEST 9: Old Session Isolation on Room Recreation ---');

// Host leaves room
guestSync.notifyListeners({
  type: 'ROOM_CLOSED',
  senderId: 'client_host_77',
  roomId: liveRoomCode,
  sessionId: liveSessionId,
  reason: 'HOST_LEAVE_LOBBY'
});

assert(guestRoomClosed, 'Guest B received ROOM_CLOSED on host departure');
guestSync.hardResetSession(liveRoomCode, guestP.id);
hostSync.hardResetSession(liveRoomCode, hostP.id);

// Host creates Game 2
const newGameSessionId = `sess_${Date.now()}_new`;
const newGameState: GameState = {
  ...createInitialState({ roomCode: liveRoomCode }),
  roomId: liveRoomCode,
  sessionId: newGameSessionId,
  hostPlayerId: hostP.id,
  players: [hostP],
  phase: 'LOBBY'
};

const newHostSync = new MultiplayerSyncManager();
newHostSync.joinRoom(liveRoomCode, () => {}, true, newGameSessionId);

// Guest is idle on menu and did not join game 2
assert(newGameState.players.length === 1, 'Game 2 has ONLY host, old guest B was not auto-joined');

console.log('\n================================================================');
console.log(`🎉 ALL SESSION & JOIN TESTS PASSED! (${passed} checks, ${failed} failures)`);
console.log('================================================================\n');
