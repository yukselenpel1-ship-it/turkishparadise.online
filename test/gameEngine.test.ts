import {
  createInitialState,
  handleRollDice,
  advancePlayerStep,
  finalizePlayerLanding,
  buyProperty,
  passProperty,
  sellPropertyToBank,
  buildHouse,
  sellHouse,
  toggleMortgage,
  applyChanceCard,
  payJailBail,
  nextTurn,
  executeTrade,
  evaluateTradeOfferByBot,
  hasColorGroupMonopoly,
  calculateRent,
  calculatePropertyStrategicValue,
  declareBankruptcy,
  autoLiquidateDebtOrBankrupt,
  TOTAL_TILES,
  JAIL_TILE_INDEX
} from '../src/engine/gameEngine';
import { GameState, Player, BoardTile, TradeOffer } from '../src/types/game';

let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passedTests++;
  } else {
    console.error(`  ❌ FAIL: ${testName}`);
    failedTests++;
  }
}

function runAllTests() {
  console.log('\n=============================================');
  console.log('🧪 RUNNING TURKISH PARADISE GAME ENGINE TESTS');
  console.log('=============================================\n');

  // TEST 1: Initial State Generation
  console.log('--- Test Suite 1: Initial State & Board Setup ---');
  const initState = createInitialState({ startingMoney: 2000, roomCode: 'TR-TEST' });
  assert(initState.board.length === 38, 'Board contains exactly 38 tiles');
  assert(initState.settings.startingMoney === 2000, 'Starting money is configured correctly');
  assert(initState.settings.roomCode === 'TR-TEST', 'Room code is set correctly');
  assert(initState.phase === 'LOBBY', 'Initial phase is LOBBY');

  // TEST 2: Monopoly Detection & Rent Multipliers
  console.log('\n--- Test Suite 2: Monopoly & Rent Calculations ---');
  let state = createInitialState();
  const player1: Player = {
    id: 'p1',
    name: 'Ahmet',
    color: '#EF4444',
    avatar: '🏎️',
    money: 1500,
    position: 0,
    isJailed: false,
    jailTurns: 0,
    inGame: true,
    isBot: false,
    lapsCompleted: 0,
    firstLapPurchases: 0
  };
  const player2: Player = {
    id: 'p2',
    name: 'Mehmet',
    color: '#3B82F6',
    avatar: '🎩',
    money: 1500,
    position: 0,
    isJailed: false,
    jailTurns: 0,
    inGame: true,
    isBot: false,
    lapsCompleted: 0,
    firstLapPurchases: 0
  };
  state.players = [player1, player2];
  state.phase = 'PLAYING';

  // Find brown group tiles (Hatay, Mersin, Adana)
  const hatay = state.board.find(t => t.name.toUpperCase() === 'HATAY')!;
  const mersin = state.board.find(t => t.name.toUpperCase() === 'MERSİN' || t.name.toUpperCase() === 'MERSIN')!;
  const adana = state.board.find(t => t.name.toUpperCase() === 'ADANA')!;
  assert(Boolean(hatay && mersin && adana), 'Hatay, Mersin, and Adana exist on board');

  hatay.ownerId = 'p1';
  mersin.ownerId = 'p1';
  assert(!hasColorGroupMonopoly(state.board, 'brown', 'p1'), '2 of 3 tiles owned is not a monopoly');

  adana.ownerId = 'p1';
  assert(hasColorGroupMonopoly(state.board, 'brown', 'p1'), 'Owning all 3 tiles creates brown monopoly');

  // Rent with monopoly should be base * 2
  const baseRent = hatay.rent ? hatay.rent[0] : 0;
  const monopolyRent = calculateRent(hatay, state.board);
  assert(monopolyRent === baseRent * 2, `Monopoly rent (${monopolyRent}) is double base rent (${baseRent})`);

  // TEST 3: House Building and Rent Progression
  console.log('\n--- Test Suite 3: House Building & Rent Progression ---');
  state = buildHouse(state, hatay.id, 'p1');
  const updatedHatay = state.board.find(t => t.id === hatay.id)!;
  assert(updatedHatay.houses === 1, 'House count incremented to 1');
  assert(state.players[0].money === 1500 - (hatay.houseCost || 50), 'House cost deducted from player money');
  const house1Rent = calculateRent(updatedHatay, state.board);
  assert(house1Rent === (hatay.rent ? hatay.rent[1] : 0), 'Rent equals 1-house rent table value');

  // TEST 4: Station Rent Calculation
  console.log('\n--- Test Suite 4: Station (İskele) Rent Progression ---');
  const stations = state.board.filter(t => t.type === 'station');
  assert(stations.length === 4, 'There are 4 stations on board');
  stations[0].ownerId = 'p2';
  assert(calculateRent(stations[0], state.board) === 50, '1 station owned rent is 50');
  stations[1].ownerId = 'p2';
  assert(calculateRent(stations[0], state.board) === 100, '2 stations owned rent is 100');
  stations[2].ownerId = 'p2';
  assert(calculateRent(stations[0], state.board) === 150, '3 stations owned rent is 150');
  stations[3].ownerId = 'p2';
  assert(calculateRent(stations[0], state.board) === 200, '4 stations owned rent is 200');

  // TEST 5: Trade Execution & Asset Swap
  console.log('\n--- Test Suite 5: Trade Engine & Asset Transfer ---');
  const tradeOffer: TradeOffer = {
    fromPlayerId: 'p1',
    toPlayerId: 'p2',
    offeredTileIds: [hatay.id],
    offeredMoney: 100,
    requestedTileIds: [stations[0].id],
    requestedMoney: 0
  };
  // Before trade, sell houses so property is tradeable
  state = sellHouse(state, hatay.id, 'p1');
  const p1MoneyBefore = state.players[0].money;
  const p2MoneyBefore = state.players[1].money;
  state = executeTrade(state, tradeOffer);
  assert(state.board.find(t => t.id === hatay.id)?.ownerId === 'p2', 'Hatay deed transferred to p2');
  assert(state.board.find(t => t.id === stations[0].id)?.ownerId === 'p1', 'Station deed transferred to p1');
  assert(state.players[0].money === p1MoneyBefore - 100, 'p1 money decreased by 100');
  assert(state.players[1].money === p2MoneyBefore + 100, 'p2 money increased by 100');

  // TEST 6: Bot Trade Evaluation Intelligence
  console.log('\n--- Test Suite 6: Bot Trade AI Valuation ---');
  const botPlayer: Player = {
    id: 'bot1',
    name: 'Zeki Bot',
    color: '#10B981',
    avatar: '🤖',
    money: 1000,
    position: 0,
    isJailed: false,
    jailTurns: 0,
    inGame: true,
    isBot: true,
    botDifficulty: 'hard',
    lapsCompleted: 0,
    firstLapPurchases: 0
  };
  state.players.push(botPlayer);
  const unfairOffer: TradeOffer = {
    fromPlayerId: 'p1',
    toPlayerId: 'bot1',
    offeredTileIds: [],
    offeredMoney: 10,
    requestedTileIds: [mersin.id],
    requestedMoney: 0
  };
  const evalResult = evaluateTradeOfferByBot(state, unfairOffer, botPlayer);
  assert(!evalResult.accepted, 'Hard bot correctly rejects unfair trade offer');

  // TEST 7: Turn Progression & Loop Safety
  console.log('\n--- Test Suite 7: Turn Progression & Loop Safety ---');
  state.currentTurnIndex = 0;
  state = nextTurn(state);
  assert(state.currentTurnIndex === 1, 'Turn progressed to player 2');
  assert(!state.diceRolled, 'Dice rolled state reset for new turn');
  assert(state.doublesCount === 0, 'Doubles streak reset on turn change');

  // TEST 8: Bankruptcy Declaration & Clean Elimination
  console.log('\n--- Test Suite 8: Bankruptcy & Elimination ---');
  state = declareBankruptcy(state, 'p2');
  assert(!state.players.find(p => p.id === 'p2')?.inGame, 'Player 2 is eliminated from active game');
  assert(state.board.filter(t => t.ownerId === 'p2').length === 0, 'Player 2 properties returned to bank');
  assert(state.phase === 'PLAYING', 'Game continues with remaining 2 players (p1 and bot1)');

  state = declareBankruptcy(state, 'bot1');
  assert(state.phase === 'ENDED', 'Game ends when only 1 active player remains');
  assert(state.winner?.id === 'p1', 'Player 1 declared winner');

  // TEST 9: Step Movement & Go Salary
  console.log('\n--- Test Suite 9: Stepping & Passing GO Salary ---');
  const testState = createInitialState({ passGoSalary: 250 });
  const movingPlayer: Player = {
    id: 'm1',
    name: 'Yolcu',
    color: '#F59E0B',
    avatar: '⛵',
    money: 500,
    position: 37, // Last tile before GO
    isJailed: false,
    jailTurns: 0,
    inGame: true,
    isBot: false,
    lapsCompleted: 0,
    firstLapPurchases: 0
  };
  testState.players = [movingPlayer];
  const stepResult = advancePlayerStep(testState, 'm1');
  assert(stepResult.passedGo, 'Passing tile 37 -> 0 triggers passedGo flag');
  assert(stepResult.state.players[0].position === 0, 'Player landed on tile 0 (GO)');
  assert(stepResult.state.players[0].money === 750, 'Pass GO salary (+250) added to player money');
  assert(stepResult.state.players[0].lapsCompleted === 1, 'Laps completed incremented to 1');

  // TEST 10: Jail Bail & Doubles Release
  console.log('\n--- Test Suite 10: Jail & Bail Mechanics ---');
  let jailState = createInitialState();
  const jailedPlayer: Player = {
    id: 'j1',
    name: 'Mahkum',
    color: '#8B5CF6',
    avatar: '🐕',
    money: 1000,
    position: JAIL_TILE_INDEX,
    isJailed: true,
    jailTurns: 1,
    inGame: true,
    isBot: false,
    lapsCompleted: 1,
    firstLapPurchases: 0
  };
  jailState.players = [jailedPlayer];
  jailState.currentTurnIndex = 0;
  jailState = payJailBail(jailState);
  assert(!jailState.players[0].isJailed, 'Paying bail explicitly frees player from jail');
  assert(jailState.players[0].money === 900, '100 bail amount deducted ONLY on explicit bail payment');

  // Test 10B: 3 Turns in Jail -> Free with 0₺ deduction
  let turn3JailState = createInitialState();
  turn3JailState.phase = 'PLAYING';
  turn3JailState.players = [{
    id: 'j2',
    name: 'Mahkum2',
    color: '#3B82F6',
    avatar: '🏎️',
    money: 1000,
    position: JAIL_TILE_INDEX,
    isJailed: true,
    jailTurns: 2, // At 2 turns, next non-double makes it 3 and frees player
    inGame: true,
    isBot: false,
    lapsCompleted: 1,
    firstLapPurchases: 0
  }];
  turn3JailState.currentTurnIndex = 0;
  turn3JailState = handleRollDice(turn3JailState, [1, 2]); // Non-double
  assert(!turn3JailState.players[0].isJailed, 'Completing 3 turns in jail frees player');
  assert(turn3JailState.players[0].money === 1000, 'NO money deducted when completing 3 turns in jail');

  // Test 10C: Rolling Doubles in Jail -> Free with 0₺ deduction
  let doublesJailState = createInitialState();
  doublesJailState.phase = 'PLAYING';
  doublesJailState.players = [{
    id: 'j3',
    name: 'Mahkum3',
    color: '#10B981',
    avatar: '⛵',
    money: 1000,
    position: JAIL_TILE_INDEX,
    isJailed: true,
    jailTurns: 0,
    inGame: true,
    isBot: false,
    lapsCompleted: 1,
    firstLapPurchases: 0
  }];
  doublesJailState.currentTurnIndex = 0;
  doublesJailState = handleRollDice(doublesJailState, [4, 4]); // Double
  assert(!doublesJailState.players[0].isJailed, 'Rolling doubles frees player from jail');
  assert(doublesJailState.players[0].money === 1000, 'NO money deducted when rolling doubles in jail');

  console.log('\n=============================================');
  console.log(`📊 TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('=============================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runAllTests();
