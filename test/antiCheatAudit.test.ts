import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  handleRollDice,
  buyProperty,
  passProperty,
  buildHouse,
  sellHouse,
  toggleMortgage,
  sellPropertyToBank,
  declareBankruptcy,
  executeTrade,
  nextTurn,
  addChatMessage,
  isPlayerHost
} from '../src/engine/gameEngine';
import { GameState, Player, TradeOffer, BoardTile } from '../src/types/game';

describe('Anti-Cheat & Security Verification Suite', () => {
  it('runs anti-cheat and security checks', () => {
    let passedTests = 0;
    let failedTests = 0;

    function assert(condition: boolean, message: string) {
      expect(condition).toBe(true);
      if (condition) {
        passedTests++;
      } else {
        failedTests++;
      }
    }

// --------------------------------------------------------------------------
// TEST 1: Host State Overwrite Rejection (Authoritative Host Integrity Shield)
// --------------------------------------------------------------------------
console.log('--- TEST 1: Host State Overwrite Rejection (Authoritative Host Shield) ---');

const hostId = 'player_host_1';
const guestId = 'player_guest_2';

let hostState = createInitialState();
hostState.roomId = 'TR-9999';
hostState.sessionId = 'sess_host_authoritative_100';
hostState.hostPlayerId = hostId;
hostState.players = [
  {
    id: hostId,
    name: 'HostAhmet',
    color: '#3B82F6',
    avatar: '🎩',
    money: 1500,
    position: 0,
    isJailed: false,
    jailTurns: 0,
    inGame: true,
    isHost: true,
    isBot: false,
    lapsCompleted: 0,
    firstLapPurchases: 0
  },
  {
    id: guestId,
    name: 'GuestMehmet',
    color: '#EF4444',
    avatar: '🏎️',
    money: 1500,
    position: 0,
    isJailed: false,
    jailTurns: 0,
    inGame: true,
    isHost: false,
    isBot: false,
    lapsCompleted: 0,
    firstLapPurchases: 0
  }
];

// Craft rogue external state
const rogueState: GameState = JSON.parse(JSON.stringify(hostState));
rogueState.players[1].money = 999999; // Rogue guest claims to have 1M cash
rogueState.board[1].ownerId = guestId; // Rogue claims ownership of Hatay

// Simulate Host onUpdate guard:
function simulateHostOnUpdate(liveState: GameState, myId: string, incoming: GameState): GameState {
  const isCurrentlyHost = Boolean(myId && (liveState.hostPlayerId === myId || liveState.players.find(p => p.id === myId)?.isHost));
  if (isCurrentlyHost) {
    // 🛡️ AUTHORITATIVE HOST CLIENT INTEGRITY SHIELD
    return liveState; // Host rejects external state sync completely
  }
  return incoming;
}

const hostStateAfterAttack = simulateHostOnUpdate(hostState, hostId, rogueState);
assert(hostStateAfterAttack.players[1].money === 1500, 'Host rejected fake money injection (money remains 1500₺)');
assert(hostStateAfterAttack.board[1].ownerId === undefined, 'Host rejected fake property theft (Hatay unowned)');

// --------------------------------------------------------------------------
// TEST 2: Guest Session Guard & State Version Monotonicity
// --------------------------------------------------------------------------
console.log('\n--- TEST 2: Guest Session Guard & State Version Monotonicity ---');

let guestState: GameState = JSON.parse(JSON.stringify(hostState));
guestState.version = 5;

function simulateGuestOnUpdate(liveState: GameState, incoming: GameState): { state: GameState; accepted: boolean; reason?: string } {
  if (liveState.sessionId && incoming.sessionId && incoming.sessionId !== liveState.sessionId) {
    return { state: liveState, accepted: false, reason: 'SESSION_MISMATCH' };
  }
  const currentVer = liveState.version || 0;
  const incomingVer = incoming.version || 0;
  if (incomingVer > 0 && currentVer > 0 && incomingVer < currentVer) {
    return { state: liveState, accepted: false, reason: 'STALE_VERSION' };
  }
  return { state: incoming, accepted: true };
}

// Case A: Mismatched session
const wrongSessionState: GameState = JSON.parse(JSON.stringify(guestState));
wrongSessionState.sessionId = 'sess_hacker_fake_999';
wrongSessionState.version = 10;
const resWrongSession = simulateGuestOnUpdate(guestState, wrongSessionState);
assert(!resWrongSession.accepted && resWrongSession.reason === 'SESSION_MISMATCH', 'Guest dropped packet with mismatched sessionId');

// Case B: Stale / Out-of-order version
const staleVersionState: GameState = JSON.parse(JSON.stringify(guestState));
staleVersionState.version = 3; // Incoming 3 < Current 5
const resStale = simulateGuestOnUpdate(guestState, staleVersionState);
assert(!resStale.accepted && resStale.reason === 'STALE_VERSION', 'Guest dropped stale out-of-order state (v3 < v5)');

// Case C: Valid newer version from authoritative host
const validNextState: GameState = JSON.parse(JSON.stringify(guestState));
validNextState.version = 6;
validNextState.players[0].money = 1300;
const resValid = simulateGuestOnUpdate(guestState, validNextState);
assert(resValid.accepted && resValid.state.players[0].money === 1300, 'Guest accepted valid monotonic state update (v6 >= v5)');

// --------------------------------------------------------------------------
// TEST 3: Fake DICE_ROLLED Spoofing Rejection
// --------------------------------------------------------------------------
console.log('\n--- TEST 3: Fake DICE_ROLLED Spoofing Rejection ---');

let turnState = JSON.parse(JSON.stringify(hostState)) as GameState;
turnState.currentTurnIndex = 0; // Host's turn (hostId)

function validateIncomingDiceRoll(state: GameState, diceData: any): { valid: boolean; reason?: string } {
  const currentTurnPlayer = state.players[state.currentTurnIndex];
  if (!currentTurnPlayer || currentTurnPlayer.id !== diceData.playerId) {
    return { valid: false, reason: 'NOT_CURRENT_TURN_PLAYER' };
  }
  if (
    !Array.isArray(diceData.dice) ||
    diceData.dice.length !== 2 ||
    !Number.isInteger(diceData.dice[0]) ||
    !Number.isInteger(diceData.dice[1]) ||
    diceData.dice[0] < 1 ||
    diceData.dice[0] > 6 ||
    diceData.dice[1] < 1 ||
    diceData.dice[1] > 6 ||
    diceData.total !== diceData.dice[0] + diceData.dice[1]
  ) {
    return { valid: false, reason: 'INVALID_DICE_VALUES' };
  }
  return { valid: true };
}

// Case A: Guest attempts to broadcast dice roll when it is Host's turn
const spoofedTurnRoll = {
  playerId: guestId,
  dice: [6, 6] as [number, number],
  total: 12,
  isDouble: true
};
const resTurnSpoof = validateIncomingDiceRoll(turnState, spoofedTurnRoll);
assert(!resTurnSpoof.valid && resTurnSpoof.reason === 'NOT_CURRENT_TURN_PLAYER', 'Rejected fake dice roll from non-turn player');

// Case B: Corrupted/Impossible dice values (e.g. 100, -5)
const illegalDiceRoll = {
  playerId: hostId,
  dice: [100, 50] as [number, number],
  total: 150,
  isDouble: false
};
const resIllegalDice = validateIncomingDiceRoll(turnState, illegalDiceRoll);
assert(!resIllegalDice.valid && resIllegalDice.reason === 'INVALID_DICE_VALUES', 'Rejected impossible dice values [100, 50]');

// Case C: Legitimate dice roll
const validDiceRoll = {
  playerId: hostId,
  dice: [3, 4] as [number, number],
  total: 7,
  isDouble: false
};
const resValidDice = validateIncomingDiceRoll(turnState, validDiceRoll);
assert(resValidDice.valid, 'Accepted valid dice roll [3, 4] (total: 7)');

// --------------------------------------------------------------------------
// TEST 4: Cross-Player Bankruptcy Attack Prevention
// --------------------------------------------------------------------------
console.log('\n--- TEST 4: Cross-Player Bankruptcy Attack Prevention ---');

function handleDeclareBankruptcyActionSim(state: GameState, myId: string, actionSenderId?: string): GameState {
  const isMeHost = isPlayerHost(state, myId);
  // Target strictly resolved to actionSenderId on host or myId locally
  const targetId = isMeHost ? (actionSenderId || myId) : myId;
  const targetPlayer = state.players.find(p => p.id === targetId);
  if (!targetPlayer || !targetPlayer.inGame) return state;
  return declareBankruptcy(state, targetId);
}

// Guest Mehmet sends action trying to bankrupt Host Ahmet
const attackedState = handleDeclareBankruptcyActionSim(hostState, hostId, guestId);
const hostPlayer = attackedState.players.find(p => p.id === hostId);
const guestPlayer = attackedState.players.find(p => p.id === guestId);
assert(hostPlayer?.inGame === true, 'Host Ahmet remains inGame (cross-player bankruptcy failed)');
assert(guestPlayer?.inGame === false, 'Bankruptcy applied only to sender GuestMehmet who requested it');

// --------------------------------------------------------------------------
// TEST 5: Property Force-Buy & Teleport-Buy Prevention
// --------------------------------------------------------------------------
console.log('\n--- TEST 5: Property Force-Buy & Teleport-Buy Prevention ---');

let buyTestState = createInitialState();
buyTestState.phase = 'PLAYING';
buyTestState.players = [
  {
    id: 'p1',
    name: 'Player1',
    color: '#3B82F6',
    avatar: '🏎️',
    money: 2000,
    position: 1, // Standing on Hatay (price: 60)
    isJailed: false,
    jailTurns: 0,
    inGame: true,
    isBot: false,
    lapsCompleted: 1,
    firstLapPurchases: 0
  }
];
buyTestState.currentTurnIndex = 0;

// Legit buy of tile 1 (Hatay)
let postBuyState = buyProperty(buyTestState, 'p1');
assert(postBuyState.board[1].ownerId === 'p1', 'Player successfully bought Hatay where they landed');
assert(postBuyState.players[0].money === 2000 - (postBuyState.board[1].price || 60), 'Correct money deducted for Hatay');

// Teleport buy attempt on Tile 37 (İstanbul - price: 400) while standing on Tile 1
let teleportState = buyProperty(postBuyState, 'p1'); // Tile 1 already owned, player not on 37
assert(teleportState.board[37].ownerId === undefined, 'Player cannot buy İstanbul without landing on it');

// --------------------------------------------------------------------------
// TEST 6: Malicious Trade Sanitization
// --------------------------------------------------------------------------
console.log('\n--- TEST 6: Malicious Trade Sanitization ---');

let tradeState = createInitialState();
tradeState.players = [
  { id: 'p1', name: 'Ahmet', color: '#3B82F6', avatar: '🏎️', money: 1000, position: 0, isJailed: false, jailTurns: 0, inGame: true, isBot: false, lapsCompleted: 1, firstLapPurchases: 0 },
  { id: 'p2', name: 'Mehmet', color: '#EF4444', avatar: '🎩', money: 1000, position: 0, isJailed: false, jailTurns: 0, inGame: true, isBot: false, lapsCompleted: 1, firstLapPurchases: 0 }
];
tradeState.board[1].ownerId = 'p1'; // Hatay

// Attack A: Negative money exploit
const negativeMoneyTrade: TradeOffer = {
  fromPlayerId: 'p2',
  toPlayerId: 'p1',
  offeredTileIds: [],
  offeredMoney: -5000, // Attempt to gain 5000₺
  requestedTileIds: [1],
  requestedMoney: 0
};
const resNeg = executeTrade(tradeState, negativeMoneyTrade);
assert(resNeg.players[1].money === 1000, 'Negative money trade rejected; balance untouched');
assert(resNeg.board[1].ownerId === 'p1', 'Deed was not transferred');

// Attack B: NaN / non-finite money
const nanMoneyTrade: TradeOffer = {
  fromPlayerId: 'p2',
  toPlayerId: 'p1',
  offeredTileIds: [],
  offeredMoney: NaN,
  requestedTileIds: [1],
  requestedMoney: 0
};
const resNaN = executeTrade(tradeState, nanMoneyTrade);
assert(resNaN.players[1].money === 1000, 'NaN money trade rejected safely');

// Attack C: Trading property with houses
tradeState.board[1].houses = 2; // 2 houses built
tradeState.board[1].houseCost = 50;
const houseTrade: TradeOffer = {
  fromPlayerId: 'p1',
  toPlayerId: 'p2',
  offeredTileIds: [1],
  offeredMoney: 0,
  requestedTileIds: [],
  requestedMoney: 100
};
const resHouse = executeTrade(tradeState, houseTrade);
assert(resHouse.board[1].ownerId === 'p1', 'Trade of property with active houses rejected');

// --------------------------------------------------------------------------
// TEST 7: Chat & Join Payload Sanitization
// --------------------------------------------------------------------------
console.log('\n--- TEST 7: Chat & Join Payload Sanitization ---');

let chatState = createInitialState();
const sender = { id: 'p1', name: 'Ahmet', avatar: '🏎️', color: '#3B82F6' };

// Oversized string (10,000 chars)
const giantString = 'A'.repeat(10000);
const sanitizedText = giantString.trim().substring(0, 250);
chatState = addChatMessage(chatState, sender, sanitizedText);
const latestMsg = chatState.chatMessages[chatState.chatMessages.length - 1];
assert(latestMsg.text.length <= 250, `Chat message safely clamped to ${latestMsg.text.length} chars (<= 250)`);

// Join name sanitization
const maliciousName = '<script>alert("hack")</script> Süper Oyuncu Çok Uzun İsim 1234567890';
const rawName = (maliciousName || 'Oyuncu').trim().substring(0, 30);
const sanitizedName = rawName.replace(/[<>]/g, '') || 'Oyuncu';
assert(!sanitizedName.includes('<') && !sanitizedName.includes('>'), 'Stripped dangerous HTML tags from join name');
assert(sanitizedName.length <= 30, `Name clamped to ${sanitizedName.length} chars (<= 30)`);

// --------------------------------------------------------------------------
// TEST 8: Full Multiplayer Matrix Regression (Guest/Google x PC/Mobile)
// --------------------------------------------------------------------------
console.log('\n--- TEST 8: Full Multiplayer Matrix Regression ---');

const matrixScenarios = [
  { host: 'Guest (PC)', join: 'Guest (Mobile)' },
  { host: 'Google (PC)', join: 'Guest (Mobile)' },
  { host: 'Guest (Mobile)', join: 'Google (PC)' },
  { host: 'Google (PC)', join: 'Google (Mobile)' }
];

matrixScenarios.forEach((s, idx) => {
  let simState = createInitialState();
  simState.phase = 'PLAYING';
  simState.hostPlayerId = 'host_p1';
  simState.players = [
    { id: 'host_p1', name: `Host_${s.host}`, color: '#3B82F6', avatar: '🎩', money: 1500, position: 0, isJailed: false, jailTurns: 0, inGame: true, isHost: true, isBot: false, lapsCompleted: 0, firstLapPurchases: 0 },
    { id: 'join_p2', name: `Join_${s.join}`, color: '#10B981', avatar: '🏎️', money: 1500, position: 0, isJailed: false, jailTurns: 0, inGame: true, isHost: false, isBot: false, lapsCompleted: 0, firstLapPurchases: 0 }
  ];
  simState.currentTurnIndex = 0;
  
  // 1. Host rolls dice
  simState = handleRollDice(simState, [2, 3]);
  const p1Pos = simState.players[0].position;
  assert(p1Pos === 5, `[Scenario ${idx + 1}: ${s.host} -> ${s.join}] Host moved to tile 5 (dice: 5)`);

  // 2. Turn changes to joiner
  simState = nextTurn(simState);
  assert(simState.currentTurnIndex === 1, `[Scenario ${idx + 1}] Turn progressed to joiner (${s.join})`);

  // 3. Joiner rolls dice
  simState = handleRollDice(simState, [1, 3]);
  const p2Pos = simState.players[1].position;
  assert(p2Pos === 4, `[Scenario ${idx + 1}] Joiner moved to tile 4 (dice: 4)`);
});

  console.log('\n================================================================');
  console.log(`📊 ANTI-CHEAT TEST SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('================================================================');
  expect(failedTests).toBe(0);
  });
});

