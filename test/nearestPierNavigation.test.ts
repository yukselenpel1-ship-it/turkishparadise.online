import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  getNextForwardStationIndex,
  applyChanceCard,
  runBotTurn,
  calculateRent,
  TOTAL_TILES
} from '../src/engine/gameEngine';
import { applyGameAction } from '../src/server/game/serverGameEngine';
import { CHANCE_CARDS } from '../src/data/chanceCards';
import { GameState, Player, BoardTile, ChanceCard } from '../src/types/game';

describe('Nearest Pier Forward Movement & Wrap-Around Suite', () => {
  const c10Card = CHANCE_CARDS.find((c) => c.id === 'c10')!;

  it('nearestPierChoosesNextForwardPier: properly chooses first station ahead in movement direction', () => {
    const state = createInitialState({ startingMoney: 1500 });
    const board = state.board;

    // Station positions: 4 (Kadıköy), 13 (Kabataş), 23 (Beşiktaş), 32 (Üsküdar)

    // 1. From Start (tile 0) -> First station ahead is Kadıköy (4)
    expect(getNextForwardStationIndex(board, 0)).toBe(4);

    // 2. From Hatay/Mersin/Adana (tiles 1, 2, 3) -> Next station ahead is Kadıköy (4)
    expect(getNextForwardStationIndex(board, 1)).toBe(4);
    expect(getNextForwardStationIndex(board, 2)).toBe(4);
    expect(getNextForwardStationIndex(board, 3)).toBe(4);

    // 3. From Kadıköy (tile 4) -> Next station ahead is Kabataş (13)
    expect(getNextForwardStationIndex(board, 4)).toBe(13);

    // 4. From Şans 1 (tile 5) -> Next station ahead is Kabataş (13)
    expect(getNextForwardStationIndex(board, 5)).toBe(13);

    // 5. From Kabataş (tile 13) -> Next station ahead is Beşiktaş (23)
    expect(getNextForwardStationIndex(board, 13)).toBe(23);

    // 6. From Kamu Fonu 1 (tile 14) -> Next station ahead is Beşiktaş (23)
    expect(getNextForwardStationIndex(board, 14)).toBe(23);

    // 7. From Beşiktaş (tile 23) -> Next station ahead is Üsküdar (32)
    expect(getNextForwardStationIndex(board, 23)).toBe(32);

    // 8. From Şans 2 (tile 24) -> Next station ahead is Üsküdar (32)
    expect(getNextForwardStationIndex(board, 24)).toBe(32);

    // Test applyChanceCard in gameEngine from position 5 (Şans 1)
    state.phase = 'PLAYING';
    state.currentTurnIndex = 0;
    state.players = [
      {
        id: 'p1',
        name: 'Gezgin',
        color: '#EF4444',
        avatar: '⛵',
        money: 1500,
        position: 5, // At ŞANS 1
        isJailed: false,
        jailTurns: 0,
        inGame: true,
        lapsCompleted: 0
      }
    ];
    state.activeCard = { ...c10Card };
    state.pendingAction = 'CHANCE_CARD';

    const afterCard = applyChanceCard(state);
    expect(afterCard.players[0].position).toBe(13); // Landed on Kabataş (13)
    expect(afterCard.players[0].money).toBe(1500); // No passGoSalary awarded because no wrap
    expect(afterCard.players[0].lapsCompleted).toBe(0);
    expect(afterCard.pendingAction).toBe('BUY_PROPERTY'); // Unowned station prompt
  });

  it('nearestPierNeverChoosesPreviousPier: never chooses behind/previous station by absolute distance', () => {
    const state = createInitialState({ startingMoney: 1500 });
    const board = state.board;

    // SCENARIO 1: Player at position 5 (Şans 1)
    // Distance to Kadıköy (tile 4): |5 - 4| = 1 tile (behind)
    // Distance to Kabataş (tile 13): |13 - 5| = 8 tiles (ahead)
    // Absolute nearest is 4, but movement direction MUST choose 13 (Kabataş)
    const targetAt5 = getNextForwardStationIndex(board, 5);
    expect(targetAt5).not.toBe(4);
    expect(targetAt5).toBe(13);

    // SCENARIO 2: Player at position 14 (Kamu Fonu 1)
    // Distance to Kabataş (tile 13): |14 - 13| = 1 tile (behind)
    // Distance to Beşiktaş (tile 23): |23 - 14| = 9 tiles (ahead)
    const targetAt14 = getNextForwardStationIndex(board, 14);
    expect(targetAt14).not.toBe(13);
    expect(targetAt14).toBe(23);

    // SCENARIO 3: Player at position 24 (Şans 2)
    // Distance to Beşiktaş (tile 23): |24 - 23| = 1 tile (behind)
    // Distance to Üsküdar (tile 32): |32 - 24| = 8 tiles (ahead)
    const targetAt24 = getNextForwardStationIndex(board, 24);
    expect(targetAt24).not.toBe(23);
    expect(targetAt24).toBe(32);

    // SCENARIO 4: Player at position 33 (Kamu Fonu 2)
    // Distance to Üsküdar (tile 32): |33 - 32| = 1 tile (behind)
    // Next forward with wrap-around is Kadıköy (tile 4)
    const targetAt33 = getNextForwardStationIndex(board, 33);
    expect(targetAt33).not.toBe(32);
    expect(targetAt33).toBe(4);
  });

  it('nearestPierWrapsAroundBoardCorrectly: wraps around board, passes start, and awards passGoSalary', () => {
    const state = createInitialState({ startingMoney: 1000, passGoSalary: 300 });
    const board = state.board;

    // 1. From Üsküdar (tile 32) -> wraps to Kadıköy (4)
    expect(getNextForwardStationIndex(board, 32)).toBe(4);

    // 2. From Kamu Fonu 2 (tile 33) -> wraps to Kadıköy (4)
    expect(getNextForwardStationIndex(board, 33)).toBe(4);

    // 3. From İstanbul (tile 37) -> wraps to Kadıköy (4)
    expect(getNextForwardStationIndex(board, 37)).toBe(4);

    // Verify engine execution with wrap-around from position 33
    state.phase = 'PLAYING';
    state.currentTurnIndex = 0;
    state.settings.passGoSalary = 300;
    state.players = [
      {
        id: 'p1',
        name: 'Kaptan',
        color: '#3B82F6',
        avatar: '🏎️',
        money: 1000,
        position: 33, // At Kamu Fonu 2
        isJailed: false,
        jailTurns: 0,
        inGame: true,
        lapsCompleted: 0
      }
    ];
    state.activeCard = { ...c10Card };
    state.pendingAction = 'CHANCE_CARD';

    const result = applyChanceCard(state);
    expect(result.players[0].position).toBe(4); // Moved to Kadıköy (4)
    expect(result.players[0].money).toBe(1300); // 1000 + 300 passGoSalary
    expect(result.players[0].lapsCompleted).toBe(1); // Completed 1 lap
    expect(result.pendingAction).toBe('BUY_PROPERTY');
  });

  it('serverAuthoritativeExecution: server confirms nearest pier card with forward motion and salary on wrap', () => {
    const serverState = createInitialState({ startingMoney: 1200, passGoSalary: 250 });
    serverState.phase = 'PLAYING';
    serverState.currentTurnIndex = 0;
    serverState.settings.passGoSalary = 250;
    serverState.players = [
      {
        id: 'p1',
        name: 'ServerPlayer',
        color: '#10B981',
        avatar: '🎩',
        money: 1200,
        position: 5, // At Şans 1
        isJailed: false,
        jailTurns: 0,
        inGame: true,
        lapsCompleted: 0
      }
    ];
    serverState.activeCard = { ...c10Card, targetTileId: getNextForwardStationIndex(serverState.board, 5) };
    serverState.pendingAction = 'CHANCE_CARD';

    // 1. Confirm from position 5 (Forward to 13, no wrap)
    const res1 = applyGameAction(
      serverState,
      { id: 'act_1', type: 'CONFIRM_CHANCE', playerId: 'p1', payload: {}, timestamp: Date.now() },
      { userId: 'p1', isHost: true }
    );

    expect(res1.success).toBe(true);
    expect(res1.state.players[0].position).toBe(13); // Kabataş
    expect(res1.state.players[0].money).toBe(1200); // No salary
    expect(res1.state.players[0].lapsCompleted).toBe(0);
    expect(res1.state.pendingAction).toBe('BUY_PROPERTY');

    // 2. Confirm from position 33 (Forward with wrap-around to 4)
    res1.state.players[0].position = 33;
    res1.state.activeCard = { ...c10Card, targetTileId: getNextForwardStationIndex(res1.state.board, 33) };
    res1.state.pendingAction = 'CHANCE_CARD';

    const res2 = applyGameAction(
      res1.state,
      { id: 'act_2', type: 'CONFIRM_CHANCE', playerId: 'p1', payload: {}, timestamp: Date.now() },
      { userId: 'p1', isHost: true }
    );

    expect(res2.success).toBe(true);
    expect(res2.state.players[0].position).toBe(4); // Kadıköy
    expect(res2.state.players[0].money).toBe(1450); // 1200 + 250
    expect(res2.state.players[0].lapsCompleted).toBe(1);
    expect(res2.state.pendingAction).toBe('BUY_PROPERTY');
  });

  it('botTurnAutoResolvesNearestPierCard: bot safely processes forward station chance card', () => {
    const botState = createInitialState({ startingMoney: 2000 });
    botState.phase = 'PLAYING';
    botState.currentTurnIndex = 0;
    botState.diceRolled = true; // Bot already rolled to land on the chance tile
    botState.players = [
      {
        id: 'bot-1',
        name: 'Bot Denizci',
        color: '#F59E0B',
        avatar: '🤖',
        money: 2000,
        position: 5,
        isBot: true,
        botDifficulty: 'medium',
        isJailed: false,
        jailTurns: 0,
        inGame: true,
        lapsCompleted: 0
      }
    ];
    botState.activeCard = { ...c10Card, targetTileId: getNextForwardStationIndex(botState.board, 5) };
    botState.pendingAction = 'CHANCE_CARD';

    const afterBot = runBotTurn(botState);
    expect(afterBot.players[0].position).toBe(13); // Advanced to Kabataş
    expect(afterBot.players[0].inGame).toBe(true);
  });
});
