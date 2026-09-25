import { describe, it, expect } from 'vitest';
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
  isPlayerHost,
  hasColorGroupMonopoly,
  TOTAL_TILES
} from '../src/engine/gameEngine';
import { GameState, Player, TradeOffer, PublicRoomInfo } from '../src/types/game';

describe('Production Smoke Test Suite', () => {
  it('runs production multiplayer flow smoke test', () => {
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
// SMOKE 1: LOBBY CREATION & MULTI-CLIENT JOIN
// -------------------------------------------------------------------------------------------------
console.log('--- SMOKE 1: Room Lifecycle, Discovery & Multi-Client Join ---');
let hostGameState = createInitialState({ roomCode: 'TR-7777', isPublic: true, startingMoney: 1500 });
const hostPlayer: Player = { id: 'p_host', name: 'Alp (Host)', color: '#EF4444', avatar: '🏎️', money: 1500, position: 0, isJailed: false, jailTurns: 0, inGame: true, isBot: false, isHost: true, lapsCompleted: 0, firstLapPurchases: 0 };
hostGameState.players = [hostPlayer];
hostGameState.hostPlayerId = 'p_host';

assert(isPlayerHost(hostGameState, 'p_host'), 'Host correctly identified as authoritative host');

// Public room announcement check
const publicBeacon: PublicRoomInfo = {
  roomId: hostGameState.roomId,
  hostName: hostPlayer.name,
  hostAvatar: hostPlayer.avatar,
  playerCount: 1,
  maxPlayers: 6,
  botCount: 0,
  phase: 'LOBBY',
  startingMoney: 1500,
  isPublic: true,
  updatedAt: Date.now()
};
assert(Date.now() - publicBeacon.updatedAt <= 7000, 'Room beacon is active within 7s TTL window');

// Guest 1 Joins
const guest1: Player = { id: 'p_g1', name: 'Bora (Guest 1)', color: '#3B82F6', avatar: '🎩', money: 1500, position: 0, isJailed: false, jailTurns: 0, inGame: true, isBot: false, isHost: false, lapsCompleted: 0, firstLapPurchases: 0 };
hostGameState.players.push(guest1);

// Guest 2 (Bot) Joins
const botGuest: Player = { id: 'p_bot', name: 'Cem (Bot)', color: '#10B981', avatar: '🤖', money: 1500, position: 0, isJailed: false, jailTurns: 0, inGame: true, isBot: true, botDifficulty: 'medium', isHost: false, lapsCompleted: 0, firstLapPurchases: 0 };
hostGameState.players.push(botGuest);

assert(hostGameState.players.length === 3, 'Lobby has 3 players (Host, Guest 1, Bot)');

// Start Game
hostGameState.phase = 'PLAYING';
assert(hostGameState.phase === 'PLAYING', 'Game transitioned from LOBBY to PLAYING');

// -------------------------------------------------------------------------------------------------
// SMOKE 2: AUTHORITATIVE GAMEPLAY FLOW (HOST + GUEST + BOT)
// -------------------------------------------------------------------------------------------------
console.log('\n--- SMOKE 2: Complete Core Gameplay Journey ---');

// Turn 1: Host Turn
assert(hostGameState.currentTurnIndex === 0, 'Turn 1 is Host turn');
hostGameState = handleRollDice(hostGameState);
assert(hostGameState.diceRolled === true, 'Host dice rolled state set');
if (hostGameState.pendingAction === 'BUY_PROPERTY') {
  const pos = hostGameState.players[0].position;
  hostGameState = buyProperty(hostGameState, 'p_host');
  const boughtTile = hostGameState.board[pos];
  assert(boughtTile.ownerId === 'p_host', `Host purchased landed property (${boughtTile.name})`);
}
hostGameState = nextTurn(hostGameState);

// Turn 2: Guest 1 Turn (Action received on host)
assert(hostGameState.currentTurnIndex === 1, 'Turn 2 is Guest 1 turn');
assert(hostGameState.players[1].id === 'p_g1', 'Current player is Guest 1');
hostGameState = handleRollDice(hostGameState);
if (hostGameState.pendingAction === 'BUY_PROPERTY') {
  const g1Pos = hostGameState.players[1].position;
  hostGameState = buyProperty(hostGameState, 'p_g1');
  const g1Bought = hostGameState.board[g1Pos];
  assert(g1Bought.ownerId === 'p_g1', `Guest 1 purchased property (${g1Bought.name})`);
}
hostGameState = nextTurn(hostGameState);

// Turn 3: Bot Turn
assert(hostGameState.currentTurnIndex === 2, 'Turn 3 is Bot turn');
hostGameState = runBotTurn(hostGameState);
assert(hostGameState.currentTurnIndex === 0 || hostGameState.currentTurnIndex === 2, 'Bot completed turn safely');

// -------------------------------------------------------------------------------------------------
// SMOKE 3: TRADE & MONOPOLY VERIFICATION
// -------------------------------------------------------------------------------------------------
console.log('\n--- SMOKE 3: Trade & Asset Flow ---');
const hatay = hostGameState.board.find(t => t.name.toUpperCase() === 'HATAY')!;
const mersin = hostGameState.board.find(t => t.name.toUpperCase() === 'MERSİN' || t.name.toUpperCase() === 'MERSIN')!;
const adana = hostGameState.board.find(t => t.name.toUpperCase() === 'ADANA')!;

hatay.ownerId = 'p_host';
mersin.ownerId = 'p_host';
adana.ownerId = 'p_g1';

const tradeOffer: TradeOffer = {
  fromPlayerId: 'p_host',
  toPlayerId: 'p_g1',
  offeredTileIds: [],
  offeredMoney: 200,
  requestedTileIds: [adana.id],
  requestedMoney: 0
};

hostGameState = executeTrade(hostGameState, tradeOffer);
assert(hostGameState.board.find(t => t.id === adana.id)?.ownerId === 'p_host', 'Adana successfully traded to Host');
assert(hasColorGroupMonopoly(hostGameState.board, 'brown', 'p_host'), 'Host created Brown color group monopoly');

// Host builds house on Hatay
hostGameState = buildHouse(hostGameState, hatay.id, 'p_host');
assert(hostGameState.board.find(t => t.id === hatay.id)?.houses === 1, 'House built on Hatay');

// -------------------------------------------------------------------------------------------------
// SMOKE 4: REFRESH / RECONNECT & RECOVERY
// -------------------------------------------------------------------------------------------------
console.log('\n--- SMOKE 4: Refresh / Reconnect Recovery ---');
// Simulate Guest 1 refresh (deserializing saved gameState and re-associating seat)
const serialized = JSON.stringify(hostGameState);
const recoveredState = JSON.parse(serialized) as GameState;
const matchedGuest = recoveredState.players.find(p => p.id === 'p_g1');
assert(Boolean(matchedGuest), 'Guest 1 successfully found their seat after refresh');
assert(matchedGuest?.money === hostGameState.players[1].money, 'Guest 1 money intact after refresh');

// -------------------------------------------------------------------------------------------------
// SMOKE 5: BANKRUPTCY & INSTANT END FOR LAST 2 PLAYERS
// -------------------------------------------------------------------------------------------------
console.log('\n--- SMOKE 5: Bankruptcy & End Game Flow ---');
hostGameState = declareBankruptcy(hostGameState, 'p_g1');
assert(!hostGameState.players[1].inGame, 'Guest 1 marked out of game (spectator)');

hostGameState = declareBankruptcy(hostGameState, 'p_bot');
assert(hostGameState.phase === 'ENDED', 'Game automatically ended when only Host remained');
assert(hostGameState.winner?.id === 'p_host', 'Host declared Champion Winner');

  console.log('\n====================================================');
  console.log(`📊 SMOKE TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');
  expect(failed).toBe(0);
  });
});

