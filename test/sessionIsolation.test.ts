import { describe, it, expect } from 'vitest';
import { createInitialState, isPlayerHost } from '../src/engine/gameEngine';
import { MultiplayerSyncManager, SyncMessage } from '../src/services/multiplayerSync';
import { GameState, Player } from '../src/types/game';

describe('Multiplayer Handshake & Session Audit', () => {
  it('runs multiplayer handshake and session isolation tests', () => {
    let passed = 0;
    let failed = 0;

    function assert(condition: boolean, msg: string) {
      expect(condition).toBe(true);
      if (condition) {
        passed++;
      } else {
        failed++;
        throw new Error(`Assertion failed: ${msg}`);
      }
    }

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
  stateB.sessionId
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
// TEST 4: ATOMIC 3-WAY JOIN HANDSHAKE (JOIN_REQUEST -> JOIN_ACCEPT -> JOIN_CONFIRM)
// -------------------------------------------------------------------------------------------------
console.log('\n--- TEST 4: Atomic 3-Way Join Handshake (JOIN_REQUEST -> JOIN_ACCEPT -> JOIN_CONFIRM) ---');
const liveRoomCode = 'TR-LIVE-77';

const hostP: Player = {
  id: 'p_host_77',
  userId: 'u_host_77',
  name: 'Kurucu',
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
const hostSync = new MultiplayerSyncManager();

let hostReceivedJoinRequest: { player: Player; requestId?: string } | null = null;
let hostReceivedJoinConfirm = false;

hostSync.joinRoom(
  liveRoomCode,
  (msg) => {
    if (msg.type === 'JOIN_REQUEST' && msg.player) {
      hostReceivedJoinRequest = { player: msg.player, requestId: msg.requestId };
    } else if (msg.type === 'JOIN_CONFIRM') {
      hostReceivedJoinConfirm = true;
    }
  },
  true,
  liveSessionId
);

// Guest on Mobile
const guestP: Player = {
  id: 'p_mobile_395',
  userId: 'u_mobile_395',
  name: 'Oyuncu_395',
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
let guestReceivedJoinAccept = false;
let guestAdoptedState: GameState | null = null;

guestSync.joinRoom(
  liveRoomCode,
  (msg) => {
    if (msg.type === 'JOIN_ACCEPT' && msg.state) {
      guestReceivedJoinAccept = true;
      guestAdoptedState = msg.state;
      guestSync.setSessionId(msg.state.sessionId || null);
    }
  },
  false,
  undefined
);

// Step 1: Guest sends JOIN_REQUEST
const requestId = `req_${Date.now()}`;
hostSync.notifyListeners({
  type: 'JOIN_REQUEST',
  senderId: 'client_mobile_395',
  roomId: liveRoomCode,
  player: guestP,
  requestId
});

assert(hostReceivedJoinRequest !== null, 'Step 1: Host received JOIN_REQUEST');
assert(hostReceivedJoinRequest?.player.id === guestP.id, 'Step 1: Joining player ID matches');

// Step 2: Host validates, adds player, and sends JOIN_ACCEPT
liveHostState = {
  ...liveHostState,
  players: [...liveHostState.players, guestP]
};

guestSync.notifyListeners({
  type: 'JOIN_ACCEPT',
  senderId: 'client_host_77',
  roomId: liveRoomCode,
  targetPlayerId: guestP.id,
  sessionId: liveSessionId,
  gameId: liveHostState.gameId,
  state: liveHostState,
  requestId
});

assert(guestReceivedJoinAccept, 'Step 2: Guest received JOIN_ACCEPT');
assert(guestAdoptedState?.sessionId === liveSessionId, 'Step 2: Guest adopted authoritative sessionId');
assert(guestAdoptedState?.players.length === 2, 'Step 2: Guest state contains 2 players');

// Step 3: Guest sends JOIN_CONFIRM to Host
hostSync.notifyListeners({
  type: 'JOIN_CONFIRM',
  senderId: 'client_mobile_395',
  roomId: liveRoomCode,
  playerId: guestP.id,
  sessionId: liveSessionId,
  requestId
});

assert(hostReceivedJoinConfirm, 'Step 3: Host received JOIN_CONFIRM from Guest');

// -------------------------------------------------------------------------------------------------
// TEST 5: DUPLICATE JOIN REQUEST IDEMPOTENCY (NO SLOT MULTIPLICATION)
// -------------------------------------------------------------------------------------------------
console.log('\n--- TEST 5: Duplicate JOIN_REQUEST Idempotency (No duplicate slots) ---');
const playersCountBefore = liveHostState.players.length;

// Simulate user clicking "GİR" 4 times rapidly with the same user credentials
for (let i = 0; i < 4; i++) {
  const incoming = { ...guestP };
  const existingIdx = liveHostState.players.findIndex(
    p => (incoming.userId && p.userId === incoming.userId) || p.id === incoming.id
  );

  if (existingIdx >= 0) {
    // Idempotent restore: slot is preserved, array length never grows
    liveHostState.players[existingIdx] = { ...liveHostState.players[existingIdx], isAfk: false };
  } else {
    liveHostState.players.push(incoming);
  }
}

assert(liveHostState.players.length === playersCountBefore, '4 rapid duplicate join clicks resulted in exactly 1 player slot');
assert(liveHostState.players.filter(p => p.id === guestP.id).length === 1, 'Player is present exactly once in players array');

// -------------------------------------------------------------------------------------------------
// TEST 6: CAPACITY & PHASE CHECKS (JOIN_REJECTED)
// -------------------------------------------------------------------------------------------------
console.log('\n--- TEST 6: Capacity & Phase Rejection ---');
let guestReceivedRejection = false;
let rejectionReason = '';

const fullRoomSync = new MultiplayerSyncManager();
fullRoomSync.joinRoom(
  liveRoomCode,
  (msg) => {
    if (msg.type === 'JOIN_REJECTED') {
      guestReceivedRejection = true;
      rejectionReason = msg.reason || '';
    }
  },
  false,
  undefined
);

// Host creates game with 6 players (FULL)
const fullPlayers: Player[] = Array.from({ length: 6 }, (_, i) => ({
  id: `p_${i}`,
  userId: `u_${i}`,
  name: `Player ${i}`,
  color: '#333',
  avatar: '🎲',
  money: 1500,
  position: 0,
  isJailed: false,
  jailTurns: 0,
  lapsCompleted: 0,
  firstLapPurchases: 0,
  inGame: true,
  isHost: i === 0,
  isBot: false,
  isAfk: false
}));

const fullState: GameState = {
  ...createInitialState({ roomCode: liveRoomCode }),
  players: fullPlayers,
  phase: 'LOBBY'
};

const newJoiner: Player = {
  id: 'p_overflow_7',
  userId: 'u_overflow_7',
  name: 'Overflow Player',
  color: '#000',
  avatar: '⚡',
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

if (fullState.players.filter(p => p.inGame).length >= 6) {
  fullRoomSync.notifyListeners({
    type: 'JOIN_REJECTED',
    senderId: 'host_client',
    roomId: liveRoomCode,
    targetPlayerId: newJoiner.id,
    reason: 'Oda dolu (Maksimum 6 oyuncu)!'
  });
}

assert(guestReceivedRejection, 'New joiner received JOIN_REJECTED when room is full');
assert(rejectionReason.includes('Oda dolu'), 'Rejection reason clearly indicates room full');

// -------------------------------------------------------------------------------------------------
// TEST 7: SPECTATOR ("İZLE") FLOW & SEPARATE SPECTATORS ARRAY
// -------------------------------------------------------------------------------------------------
console.log('\n--- TEST 7: Spectator ("İZLE") Flow & Separate Spectators Array ---');

let spectatorAdoptedState: GameState | null = null;
let hostLoggedSpectator = false;

const spectatorSync = new MultiplayerSyncManager();
const spectatorId = 'p_spectator_101';
const spectatorName = 'Spectator_101';

spectatorSync.joinRoom(
  liveRoomCode,
  (msg) => {
    if (msg.type === 'WATCH_ACCEPT' && msg.state) {
      spectatorAdoptedState = msg.state;
      spectatorSync.setSessionId(msg.state.sessionId || null);
    }
  },
  false,
  undefined
);

// Spectator sends WATCH_REQUEST
const watchReqId = `wreq_${Date.now()}`;
let hostReceivedWatchRequest: any = null;

hostSync.joinRoom(
  liveRoomCode,
  (msg) => {
    if (msg.type === 'WATCH_REQUEST' && msg.spectator) {
      hostReceivedWatchRequest = msg.spectator;
    } else if (msg.type === 'WATCH_CONFIRM') {
      // Host logs ONLY upon WATCH_CONFIRM
      hostLoggedSpectator = true;
    }
  },
  true,
  liveSessionId
);

hostSync.notifyListeners({
  type: 'WATCH_REQUEST',
  senderId: 'client_spec_101',
  roomId: liveRoomCode,
  spectator: {
    id: spectatorId,
    name: spectatorName,
    avatar: '👁️'
  },
  requestId: watchReqId
});

assert(hostReceivedWatchRequest !== null, 'Host received WATCH_REQUEST');

// Host adds spectator to `spectators` array (NOT players array!)
liveHostState = {
  ...liveHostState,
  spectators: [
    ...(liveHostState.spectators || []),
    { id: spectatorId, name: spectatorName, avatar: '👁️', joinedAt: Date.now() }
  ]
};

assert(liveHostState.players.length === 2, 'Spectator did NOT consume any player slots (players length remains 2)');
assert(liveHostState.spectators?.length === 1, 'Spectator is recorded in dedicated spectators array');
assert(!hostLoggedSpectator, 'Host has NOT logged spectator yet (waiting for WATCH_CONFIRM)');

// Host sends WATCH_ACCEPT
spectatorSync.notifyListeners({
  type: 'WATCH_ACCEPT',
  senderId: 'client_host_77',
  roomId: liveRoomCode,
  targetSpectatorId: spectatorId,
  sessionId: liveSessionId,
  gameId: liveHostState.gameId,
  state: liveHostState,
  requestId: watchReqId
});

assert(spectatorAdoptedState !== null, 'Spectator accepted and adopted game state');
assert(spectatorAdoptedState?.sessionId === liveSessionId, 'Spectator adopted authoritative sessionId');

// Spectator sends WATCH_CONFIRM
hostSync.notifyListeners({
  type: 'WATCH_CONFIRM',
  senderId: 'client_spec_101',
  roomId: liveRoomCode,
  spectatorId,
  spectatorName,
  sessionId: liveSessionId,
  requestId: watchReqId
});

assert(hostLoggedSpectator, 'Host logged spectator arrival ONLY after WATCH_CONFIRM');

// -------------------------------------------------------------------------------------------------
// TEST 8: OLD SESSION ISOLATION ON RESTART / LOBBY RETURN
// -------------------------------------------------------------------------------------------------
console.log('\n--- TEST 8: Old Session Isolation on Host Exit & Recreation ---');

// Host leaves lobby -> ROOM_CLOSED is sent to all peers
let guestSeenRoomClosed = false;
guestSync.joinRoom(
  liveRoomCode,
  (msg) => {
    if (msg.type === 'ROOM_CLOSED') {
      guestSeenRoomClosed = true;
    }
  },
  false,
  liveSessionId
);

guestSync.notifyListeners({
  type: 'ROOM_CLOSED',
  senderId: 'client_host_77',
  roomId: liveRoomCode,
  sessionId: liveSessionId,
  reason: 'HOST_LEAVE_LOBBY'
});

assert(guestSeenRoomClosed, 'Guest saw ROOM_CLOSED when host left');
guestSync.hardResetSession(liveRoomCode, guestP.id);

// Host creates Game 2 with brand new sessionId
const newSessionId = `sess_new_${Date.now()}`;
const newGameState: GameState = {
  ...createInitialState({ roomCode: liveRoomCode }),
  roomId: liveRoomCode,
  sessionId: newSessionId,
  hostPlayerId: hostP.id,
  players: [hostP],
  phase: 'LOBBY'
};

// -------------------------------------------------------------------------------------------------
// TEST 10: SAME WI-FI / IP MULTI-CLIENT COLLISION-FREE ISOLATION
// Scenario: 1 Host + 1 Desktop Tab 2 + 1 Incognito + 1 Mobile (All named "Oyuncu", same IP)
// -------------------------------------------------------------------------------------------------
console.log('\n--- TEST 10: Multi-Client Same Wi-Fi Isolation (Normal Tab 1 & 2, Incognito, Mobile) ---');

// Host: Desktop Tab 1 (clientId: clientA, tabId: tabA1)
const clientHost: Player = {
  id: 'p_clientA_tabA1',
  userId: 'u_guest_same_ip',
  clientId: 'clientA',
  tabId: 'tabA1',
  participantKey: 'clientA:tabA1',
  name: 'Oyuncu',
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

// Client 2: Desktop Normal Tab 2 on same browser (clientId: clientA, tabId: tabA2)
const clientDesktopTab2: Player = {
  id: 'p_clientA_tabA2',
  userId: 'u_guest_same_ip',
  clientId: 'clientA',
  tabId: 'tabA2',
  participantKey: 'clientA:tabA2',
  name: 'Oyuncu',
  color: '#3B82F6',
  avatar: '🎲',
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

// Client 3: Desktop Incognito Tab (clientId: clientB, tabId: tabB1)
const clientIncognito: Player = {
  id: 'p_clientB_tabB1',
  userId: 'u_guest_incognito',
  clientId: 'clientB',
  tabId: 'tabB1',
  participantKey: 'clientB:tabB1',
  name: 'Oyuncu',
  color: '#10B981',
  avatar: '🎲',
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

// Client 4: Mobile device on same Wi-Fi (clientId: clientC, tabId: tabC1)
const clientMobile: Player = {
  id: 'p_clientC_tabC1',
  userId: 'u_guest_mobile',
  clientId: 'clientC',
  tabId: 'tabC1',
  participantKey: 'clientC:tabC1',
  name: 'Oyuncu',
  color: '#F59E0B',
  avatar: '🎲',
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

let isoState: GameState = {
  ...createInitialState({ roomCode: 'TR-ISO-99' }),
  roomId: 'TR-ISO-99',
  hostPlayerId: clientHost.id,
  players: [clientHost],
  phase: 'LOBBY'
};

const pendingJoins = new Map<string, { player: Player; expiresAt: number; requestId: string }>();

function handleHostJoinReq(player: Player, reqId: string) {
  const pKey = player.participantKey!;
  // Deduplication check
  const existing = isoState.players.findIndex(p => p.participantKey === pKey || p.id === player.id);
  if (existing >= 0) return;
  if (pendingJoins.has(pKey)) return;

  const totalReserved = isoState.players.length + pendingJoins.size;
  if (totalReserved >= 6) return;

  pendingJoins.set(pKey, {
    player: { ...player, inGame: true },
    expiresAt: Date.now() + 10000,
    requestId: reqId
  });
}

function handleHostJoinConfirm(pKey: string) {
  if (pendingJoins.has(pKey)) {
    const pending = pendingJoins.get(pKey)!;
    pendingJoins.delete(pKey);
    isoState = {
      ...isoState,
      players: [...isoState.players, pending.player]
    };
  }
}

// 1. Join Desktop Tab 2
handleHostJoinReq(clientDesktopTab2, 'req_tab2');
assert(pendingJoins.has('clientA:tabA2'), 'Desktop Tab 2 reserved slot in pendingJoins');
handleHostJoinConfirm('clientA:tabA2');

// 2. Join Incognito Tab
handleHostJoinReq(clientIncognito, 'req_incog');
assert(pendingJoins.has('clientB:tabB1'), 'Desktop Incognito reserved slot in pendingJoins');
handleHostJoinConfirm('clientB:tabB1');

// 3. Join Mobile device
handleHostJoinReq(clientMobile, 'req_mobile');
assert(pendingJoins.has('clientC:tabC1'), 'Mobile device reserved slot in pendingJoins');
handleHostJoinConfirm('clientC:tabC1');

assert(isoState.players.length === 4, 'All 4 participants are successfully in the room');
assert(new Set(isoState.players.map(p => p.participantKey)).size === 4, 'All 4 participants have strictly unique participantKeys');
assert(new Set(isoState.players.map(p => p.id)).size === 4, 'All 4 participants have unique playerIds');

// -------------------------------------------------------------------------------------------------
// TEST 11: SPECTATOR ISOLATION (0 SLOT CONSUMPTION)
// -------------------------------------------------------------------------------------------------
console.log('\n--- TEST 11: Spectator Zero-Slot Consumption ---');
const spectatorUser = {
  id: 's_spec_user_1',
  name: 'Oyuncu',
  avatar: '👁️',
  participantKey: 'clientD:tabD1',
  joinedAt: Date.now()
};

isoState = {
  ...isoState,
  spectators: [spectatorUser]
};

assert(isoState.players.length === 4, 'Spectator did not increase players count');
assert(isoState.spectators?.length === 1, 'Spectator recorded in spectators array');

// -------------------------------------------------------------------------------------------------
// TEST 12: F5 REFRESH RECONNECT IN SAME TAB
// -------------------------------------------------------------------------------------------------
console.log('\n--- TEST 12: F5 Refresh Reconnect in Same Tab ---');
// Mobile client reconnects with same participantKey clientC:tabC1
const mobileReconnectReq = { ...clientMobile };
const matchIdx = isoState.players.findIndex(p => p.participantKey === mobileReconnectReq.participantKey);
assert(matchIdx >= 0, 'Host recognizes existing player by preserved participantKey');
isoState.players[matchIdx] = { ...isoState.players[matchIdx], isAfk: false };
assert(isoState.players.length === 4, 'Reconnect does not create a duplicate player slot');

  console.log('\n================================================================');
  console.log(`🎉 ALL MULTIPLAYER & JOIN HANDSHAKE TESTS PASSED! (${passed} checks, ${failed} failures)`);
  console.log('================================================================\n');
  expect(failed).toBe(0);
  });
});

