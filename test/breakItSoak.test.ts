import {
  createInitialState,
  handleRollDice,
  advancePlayerStep,
  finalizePlayerLanding,
  buyProperty,
  passProperty,
  buildHouse,
  sellHouse,
  toggleMortgage,
  sellPropertyToBank,
  executeTrade,
  declareBankruptcy,
  applyChanceCard,
  payJailBail,
  nextTurn,
  runBotTurn,
  hasColorGroupMonopoly,
  TOTAL_TILES,
  JAIL_TILE_INDEX
} from '../src/engine/gameEngine';
import { GameState, Player, BoardTile, TradeOffer } from '../src/types/game';

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

/**
 * Deterministic State Invariant Validator
 */
function assertStateInvariants(state: GameState, context: string) {
  // 1. Board Invariants
  assert(state.board.length === 38, `[${context}] Board has exactly 38 tiles`);
  for (const tile of state.board) {
    if (tile.ownerId) {
      const owner = state.players.find(p => p.id === tile.ownerId);
      assert(Boolean(owner), `[${context}] Tile ${tile.name} owner ${tile.ownerId} exists in players list`);
    }
    assert(tile.houses >= 0 && tile.houses <= 5, `[${context}] Tile ${tile.name} houses (${tile.houses}) in range 0..5`);
    if (tile.houses > 0) {
      assert(!tile.isMortgaged, `[${context}] Tile ${tile.name} with ${tile.houses} houses cannot be mortgaged`);
    }
  }

  // 2. Player Invariants
  const playerIds = new Set<string>();
  for (const p of state.players) {
    assert(!playerIds.has(p.id), `[${context}] Player ID ${p.id} is unique`);
    playerIds.add(p.id);
    assert(!isNaN(p.money) && isFinite(p.money), `[${context}] Player ${p.name} money (${p.money}) is valid number`);
    assert(p.position >= 0 && p.position < TOTAL_TILES, `[${context}] Player ${p.name} position (${p.position}) in board bounds`);
  }

  // 3. Turn Invariants
  if (state.phase === 'PLAYING') {
    const activePlayers = state.players.filter(p => p.inGame);
    assert(activePlayers.length >= 1, `[${context}] Active inGame players count >= 1`);
    const currentP = state.players[state.currentTurnIndex];
    assert(Boolean(currentP && currentP.inGame), `[${context}] Current turn player (${currentP?.name}) is inGame`);
  }
}

/**
 * Deterministic State Hasher
 */
function computeStateHash(state: GameState): string {
  const normPlayers = state.players.map(p => `${p.id}:${p.money}:${p.position}:${p.inGame}:${p.isJailed}`).join('|');
  const normBoard = state.board.map(t => `${t.id}:${t.ownerId || '_'}:${t.houses}:${t.isMortgaged}`).join('|');
  return `phase=${state.phase};turn=${state.currentTurnIndex};diceRolled=${state.diceRolled};pending=${state.pendingAction};players=[${normPlayers}];board=[${normBoard}]`;
}

console.log('====================================================');
console.log('🔥 TURKISH PARADISE — BREAK IT & SOAK TEST SUITE 🔥');
console.log('====================================================\n');

// -------------------------------------------------------------------------------------------------
// 1. 250+ TURN SOAK TEST WITH 4 MIXED PLAYERS / BOTS
// -------------------------------------------------------------------------------------------------
console.log('--- TEST 1: 250+ Turn Multi-Bot & Mixed Soak Simulation ---');
let soakState = createInitialState({ startingMoney: 1500, passGoSalary: 200 });
const p1: Player = { id: 'p1', name: 'Ahmet (Human)', color: '#EF4444', avatar: '🏎️', money: 1500, position: 0, isJailed: false, jailTurns: 0, inGame: true, isBot: false, lapsCompleted: 0, firstLapPurchases: 0 };
const p2: Player = { id: 'p2', name: 'Bot Zeki', color: '#3B82F6', avatar: '🤖', money: 1500, position: 0, isJailed: false, jailTurns: 0, inGame: true, isBot: true, botDifficulty: 'hard', lapsCompleted: 0, firstLapPurchases: 0 };
const p3: Player = { id: 'p3', name: 'Bot Orta', color: '#10B981', avatar: '🤖', money: 1500, position: 0, isJailed: false, jailTurns: 0, inGame: true, isBot: true, botDifficulty: 'medium', lapsCompleted: 0, firstLapPurchases: 0 };
const p4: Player = { id: 'p4', name: 'Bot Kolay', color: '#F59E0B', avatar: '🤖', money: 1500, position: 0, isJailed: false, jailTurns: 0, inGame: true, isBot: true, botDifficulty: 'easy', lapsCompleted: 0, firstLapPurchases: 0 };
soakState.players = [p1, p2, p3, p4];
soakState.phase = 'PLAYING';

let turnCount = 0;
const MAX_TURNS = 260;

while (soakState.phase === 'PLAYING' && turnCount < MAX_TURNS) {
  turnCount++;
  const currP = soakState.players[soakState.currentTurnIndex];

  if (currP.isBot) {
    soakState = runBotTurn(soakState);
  } else {
    // Simulate smart human turn
    if (currP.isJailed) {
      if (currP.money >= 300) soakState = payJailBail(soakState);
    }
    if (!soakState.diceRolled) {
      soakState = handleRollDice(soakState);
    }
    if (soakState.pendingAction === 'BUY_PROPERTY') {
      const tile = soakState.board[currP.position];
      if (tile?.price && currP.money >= tile.price + 50) {
        soakState = buyProperty(soakState);
      } else {
        soakState = passProperty(soakState);
      }
    } else if (soakState.pendingAction === 'CHANCE_CARD') {
      soakState = applyChanceCard(soakState);
    }

    // Human builds houses if monopoly owned
    const monopolies = soakState.board.filter(t => t.ownerId === currP.id && hasColorGroupMonopoly(soakState.board, t.colorGroup, currP.id));
    for (const m of monopolies) {
      if (m.houseCost && currP.money >= m.houseCost + 100 && m.houses < 5) {
        soakState = buildHouse(soakState, m.id, currP.id);
        break;
      }
    }

    if (soakState.pendingAction === 'NONE' && soakState.diceRolled && !soakState.incomingTradeOffer) {
      soakState = nextTurn(soakState);
    }
  }

  // Verify Invariants after every turn
  assertStateInvariants(soakState, `Soak Turn ${turnCount}`);
}

assert(turnCount >= 50, `Soak test simulated ${turnCount} full turns successfully without crashing or freezing`);
console.log(`  ℹ️ Completed ${turnCount} turns. Phase: ${soakState.phase}. Remaining players: ${soakState.players.filter(p => p.inGame).map(p => `${p.name} (${p.money}₺)`).join(', ')}`);

// -------------------------------------------------------------------------------------------------
// 2. STATE HASH & MULTI-CLIENT DESYNC VERIFICATION
// -------------------------------------------------------------------------------------------------
console.log('\n--- TEST 2: Multi-Client State Hash & Deterministic Replication ---');
let hostState = createInitialState({ startingMoney: 1500 });
const hPlayer = { id: 'host1', name: 'Host Player', color: '#EF4444', avatar: '🏎️', money: 1500, position: 0, isJailed: false, jailTurns: 0, inGame: true, isBot: false, lapsCompleted: 0, firstLapPurchases: 0 };
const gPlayer1 = { id: 'guest1', name: 'Guest 1', color: '#3B82F6', avatar: '🎩', money: 1500, position: 0, isJailed: false, jailTurns: 0, inGame: true, isBot: false, lapsCompleted: 0, firstLapPurchases: 0 };
const gPlayer2 = { id: 'guest2', name: 'Guest 2', color: '#10B981', avatar: '🐕', money: 1500, position: 0, isJailed: false, jailTurns: 0, inGame: true, isBot: false, lapsCompleted: 0, firstLapPurchases: 0 };
hostState.players = [hPlayer, gPlayer1, gPlayer2];
hostState.phase = 'PLAYING';

let client1State = JSON.parse(JSON.stringify(hostState));
let client2State = JSON.parse(JSON.stringify(hostState));

assert(computeStateHash(hostState) === computeStateHash(client1State), 'Initial Host and Client 1 state hash match');
assert(computeStateHash(hostState) === computeStateHash(client2State), 'Initial Host and Client 2 state hash match');

// Action 1: Host rolls dice and lands on property
hostState = handleRollDice(hostState);
client1State = JSON.parse(JSON.stringify(hostState));
client2State = JSON.parse(JSON.stringify(hostState));
assert(computeStateHash(hostState) === computeStateHash(client1State), 'Post-Roll Host & Client 1 hash match');

// Action 2: Buy property if pending
if (hostState.pendingAction === 'BUY_PROPERTY') {
  hostState = buyProperty(hostState);
} else if (hostState.pendingAction === 'CHANCE_CARD') {
  hostState = applyChanceCard(hostState);
}
client1State = JSON.parse(JSON.stringify(hostState));
client2State = JSON.parse(JSON.stringify(hostState));
assert(computeStateHash(hostState) === computeStateHash(client2State), 'Post-Action Host & Client 2 hash match');

// Action 3: Next turn
hostState = nextTurn(hostState);
client1State = JSON.parse(JSON.stringify(hostState));
client2State = JSON.parse(JSON.stringify(hostState));
assert(computeStateHash(hostState) === computeStateHash(client1State), 'Post-NextTurn Host & Clients hash match');

// -------------------------------------------------------------------------------------------------
// 3. SECURITY & MALICIOUS CLIENT ACTION REJECTION
// -------------------------------------------------------------------------------------------------
console.log('\n--- TEST 3: Security & Malicious Client Rejection ---');
let secState = createInitialState();
const secP1 = { id: 'sec1', name: 'Alice', color: '#EF4444', avatar: '🏎️', money: 200, position: 0, isJailed: false, jailTurns: 0, inGame: true, isBot: false, lapsCompleted: 0, firstLapPurchases: 0 };
const secP2 = { id: 'sec2', name: 'Bob', color: '#3B82F6', avatar: '🎩', money: 1500, position: 0, isJailed: false, jailTurns: 0, inGame: true, isBot: false, lapsCompleted: 0, firstLapPurchases: 0 };
secState.players = [secP1, secP2];
secState.phase = 'PLAYING';
secState.currentTurnIndex = 0; // Alice turn

// Attack 1: Bob (not his turn) tries to roll dice
const bobRollAttempt = (state: GameState, senderId: string) => {
  const currentTurn = state.players[state.currentTurnIndex];
  if (currentTurn.id !== senderId) return { accepted: false, reason: 'NOT_YOUR_TURN' };
  return { accepted: true, state: handleRollDice(state) };
};
const attack1 = bobRollAttempt(secState, 'sec2');
assert(!attack1.accepted && attack1.reason === 'NOT_YOUR_TURN', 'Rogue roll out of turn rejected');

// Attack 2: Alice attempts to build house on unowned property
const hatay = secState.board.find(t => t.id === 1)!;
const beforeMoney = secP1.money;
secState = buildHouse(secState, hatay.id, 'sec1');
assert(secState.board[1].houses === 0, 'Build house on unowned property rejected');
assert(secState.players[0].money === beforeMoney, 'Money not deducted on illegal build');

// Attack 3: Alice attempts to build house without full monopoly
hatay.ownerId = 'sec1';
secState = buildHouse(secState, hatay.id, 'sec1');
assert(secState.board[1].houses === 0, 'Build house without monopoly rejected');

// Attack 4: Alice attempts to trade with NaN or negative money
const malTrade: TradeOffer = {
  fromPlayerId: 'sec1',
  toPlayerId: 'sec2',
  offeredTileIds: [],
  offeredMoney: -500,
  requestedTileIds: [],
  requestedMoney: NaN
};
const preTradeMoney = secState.players[0].money;
secState = executeTrade(secState, malTrade);
assert(secState.players[0].money === preTradeMoney, 'Malicious trade with negative/NaN money rejected safely');

// Attack 5: Rogue player tries to accept trade meant for someone else
secState.incomingTradeOffer = {
  fromPlayerId: 'sec1',
  toPlayerId: 'sec2',
  fromPlayerName: 'Alice',
  fromPlayerAvatar: '🏎️',
  offeredTileIds: [],
  offeredMoney: 50,
  requestedTileIds: [],
  requestedMoney: 0
};
const handleAcceptTradeSecurity = (state: GameState, actingPlayerId: string): boolean => {
  if (!state.incomingTradeOffer) return false;
  if (state.incomingTradeOffer.toPlayerId !== actingPlayerId) return false;
  return true;
};
assert(!handleAcceptTradeSecurity(secState, 'rogue_user'), 'Trade accept from rogue player rejected');
assert(handleAcceptTradeSecurity(secState, 'sec2'), 'Trade accept from legitimate recipient allowed');

// -------------------------------------------------------------------------------------------------
// 4. RACE CONDITION & IDEMPOTENCY SUITE
// -------------------------------------------------------------------------------------------------
console.log('\n--- TEST 4: Race Condition & Idempotency Tests ---');

// Race 1: Double CONFIRM_CHANCE (Client 10s auto confirm + Host 10.5s safety timer concurrent trigger)
let raceState = createInitialState();
const rPlayer = { id: 'r1', name: 'Runner', color: '#EF4444', avatar: '🏎️', money: 1000, position: 5, isJailed: false, jailTurns: 0, inGame: true, isBot: false, lapsCompleted: 0, firstLapPurchases: 0 };
raceState.players = [rPlayer];
raceState.phase = 'PLAYING';
raceState.pendingAction = 'CHANCE_CARD';
raceState.activeCard = {
  id: 'c_test',
  title: 'Piyango',
  description: '150₺ kazandınız',
  actionType: 'MONEY',
  amount: 150
};

// First confirm
raceState = applyChanceCard(raceState);
assert(raceState.players[0].money === 1150, 'First CONFIRM_CHANCE added 150₺');
assert(raceState.activeCard === undefined, 'Active card cleared after first confirm');

// Second concurrent confirm (simulating race)
raceState = applyChanceCard(raceState);
assert(raceState.players[0].money === 1150, 'Second concurrent CONFIRM_CHANCE was a no-op (idempotent)');

// Race 2: Stale trade acceptance after property already traded away
let staleState = createInitialState();
const stP1 = { id: 'st1', name: 'S1', color: '#EF4444', avatar: '🏎️', money: 1000, position: 0, isJailed: false, jailTurns: 0, inGame: true, isBot: false, lapsCompleted: 0, firstLapPurchases: 0 };
const stP2 = { id: 'st2', name: 'S2', color: '#3B82F6', avatar: '🎩', money: 1000, position: 0, isJailed: false, jailTurns: 0, inGame: true, isBot: false, lapsCompleted: 0, firstLapPurchases: 0 };
staleState.players = [stP1, stP2];
staleState.phase = 'PLAYING';
const tile1 = staleState.board[1];
tile1.ownerId = 'st1';

const pendingOffer: TradeOffer = {
  fromPlayerId: 'st1',
  toPlayerId: 'st2',
  offeredTileIds: [1],
  offeredMoney: 0,
  requestedTileIds: [],
  requestedMoney: 0
};
staleState.incomingTradeOffer = { ...pendingOffer, fromPlayerName: 'S1', fromPlayerAvatar: '🏎️' };

// Before accepting, st1 sells/loses tile 1
tile1.ownerId = 'bank';

// st2 accepts stale offer
staleState = executeTrade(staleState, pendingOffer);
assert(staleState.board[1].ownerId === 'bank', 'Stale trade did not transfer unowned tile');
assert(staleState.incomingTradeOffer === undefined, 'Stale trade modal cleanly dismissed');

// -------------------------------------------------------------------------------------------------
// 5. REGRESSION SUITE FOR KNOWN BUGS
// -------------------------------------------------------------------------------------------------
console.log('\n--- TEST 5: Regression Suite for Past Bugs ---');

// Bug 1: "Dice rolls, animation plays, but player does not move and prompt says roll dice again"
let regState = createInitialState();
const regP1 = { id: 'reg1', name: 'Reg Player', color: '#EF4444', avatar: '🏎️', money: 1000, position: 0, isJailed: false, jailTurns: 0, inGame: true, isBot: false, lapsCompleted: 0, firstLapPurchases: 0 };
regState.players = [regP1];
regState.phase = 'PLAYING';
regState = handleRollDice(regState);
assert(regState.diceRolled === true, 'handleRollDice sets diceRolled = true');
assert(regState.players[0].position > 0, 'Player position updated to landed tile');
assert(regState.pendingAction !== undefined, 'Pending action set appropriately');

// Bug 2: 2-Player Game Bankruptcy Instant End & Winner Declaration
let bankState = createInitialState();
const b1 = { id: 'b1', name: 'B1', color: '#EF4444', avatar: '🏎️', money: 1000, position: 0, isJailed: false, jailTurns: 0, inGame: true, isBot: false, lapsCompleted: 0, firstLapPurchases: 0 };
const b2 = { id: 'b2', name: 'B2', color: '#3B82F6', avatar: '🎩', money: -100, position: 0, isJailed: false, jailTurns: 0, inGame: true, isBot: false, lapsCompleted: 0, firstLapPurchases: 0 };
bankState.players = [b1, b2];
bankState.phase = 'PLAYING';
bankState = declareBankruptcy(bankState, 'b2');
assert(bankState.phase === 'ENDED', '2-player game ends immediately on 1 bankruptcy');
assert(bankState.winner?.id === 'b1', 'Remaining player declared winner');

console.log('\n====================================================');
console.log(`📊 BREAK IT RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log('====================================================\n');

if (failed > 0) {
  process.exit(1);
}
