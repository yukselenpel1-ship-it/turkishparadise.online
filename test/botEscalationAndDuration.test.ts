import { describe, it, expect, beforeEach } from 'vitest';
import {
  createInitialState,
  attemptBotProactiveTrade,
  declineIncomingTrade,
  pruneBotNegotiations,
  executeTrade,
  formatGameDuration,
  getGroupEscalationRate,
  isPlayerHost
} from '../src/engine/gameEngine';
import { applyGameAction } from '../src/server/game/serverGameEngine';
import { GameState, Player, BoardTile } from '../src/types/game';

describe('Bot Trade Dynamic Escalation & WinnerModal Duration Suite', () => {
  let state: GameState;
  let botPlayer: Player;
  let humanPlayer: Player;

  beforeEach(() => {
    state = createInitialState({ roomCode: 'TR-TEST-ESC' });
    state.phase = 'PLAYING';
    state.gameStartedAt = Date.now() - 420000; // 7 minutes ago
    state.gameEndedAt = undefined;

    botPlayer = {
      id: 'bot_1',
      name: 'Zeki Bot',
      avatar: '🤖',
      color: '#8B5CF6',
      money: 5000,
      position: 0,
      isJailed: false,
      jailTurns: 0,
      inGame: true,
      isBot: true,
      botDifficulty: 'hard',
      isHost: false,
      lapsCompleted: 1,
      firstLapPurchases: 1
    };

    humanPlayer = {
      id: 'p_human',
      name: 'Ahmet',
      avatar: '🎩',
      color: '#3B82F6',
      money: 5000,
      position: 0,
      isJailed: false,
      jailTurns: 0,
      inGame: true,
      isBot: false,
      isHost: true,
      lapsCompleted: 1,
      firstLapPurchases: 1
    };

    state.players = [humanPlayer, botPlayer];

    // Setup: Brown color group (Hatay: id 1, Mersin: id 2, Adana: id 3)
    const hatay = state.board.find(t => t.id === 1)!;
    const mersin = state.board.find(t => t.id === 2)!;
    const adana = state.board.find(t => t.id === 3)!;

    hatay.ownerId = 'bot_1';
    mersin.ownerId = 'bot_1';
    adana.ownerId = 'p_human';
  });

  // --------------------------------------------------------------------------
  // TEST 1: High Value Set Escalates More Aggressively
  // --------------------------------------------------------------------------
  it('highValueSetEscalatesMoreAggressively', () => {
    const lowRate = getGroupEscalationRate('brown', 'hard', true);
    const midRate = getGroupEscalationRate('pink', 'hard', true);
    const highRate = getGroupEscalationRate('blue', 'hard', true);

    // High rent sets (Green, Blue) escalate significantly more aggressively
    expect(highRate).toBeGreaterThan(midRate);
    expect(midRate).toBeGreaterThan(lowRate);
    expect(highRate).toBeGreaterThanOrEqual(0.30); // ~35% on hard bot
    expect(lowRate).toBeLessThanOrEqual(0.15); // ~12% on brown
  });

  // --------------------------------------------------------------------------
  // TEST 2: Low Value Set Escalates Conservatively
  // --------------------------------------------------------------------------
  it('lowValueSetEscalatesConservatively', () => {
    const brownRate = getGroupEscalationRate('brown', 'medium', true);
    const lightblueRate = getGroupEscalationRate('lightblue', 'medium', true);

    expect(brownRate).toBeLessThanOrEqual(0.12);
    expect(lightblueRate).toBeLessThanOrEqual(0.12);
  });

  // --------------------------------------------------------------------------
  // TEST 3: No Hard Three Offer Limit (Can proceed to 4th and 5th offer until cap)
  // --------------------------------------------------------------------------
  it('noHardThreeOfferLimit', () => {
    // Setup Dark Blue set (Kadikoy: id 36, Bebek: id 37)
    const kadikoy = state.board.find(t => t.id === 36)!;
    const bebek = state.board.find(t => t.id === 37)!;
    kadikoy.ownerId = 'bot_1';
    bebek.ownerId = 'p_human';

    // Clear brown setup to isolate Blue set test
    state.board.find(t => t.id === 1)!.ownerId = undefined;
    state.board.find(t => t.id === 2)!.ownerId = undefined;

    let currentState = state;
    let lastOffer = 0;

    // Simulate 4 consecutive rejections
    for (let rejection = 1; rejection <= 4; rejection++) {
      currentState = attemptBotProactiveTrade(currentState, botPlayer, true);
      expect(currentState.incomingTradeOffer).toBeDefined();
      const currentOffer = currentState.incomingTradeOffer!.offeredMoney;
      expect(currentOffer).toBeGreaterThan(lastOffer);
      lastOffer = currentOffer;

      currentState = declineIncomingTrade(currentState, 'p_human');
      expect(currentState.botNegotiations?.['bot_1_37']?.rejectionCount).toBe(rejection);
    }

    // 5th attempt still produces an escalated offer without hard-coded 3-rejection cutoff
    const fifthAttempt = attemptBotProactiveTrade(currentState, botPlayer, true);
    expect(fifthAttempt.incomingTradeOffer).toBeDefined();
    expect(fifthAttempt.incomingTradeOffer!.offeredMoney).toBeGreaterThanOrEqual(lastOffer);
  });

  // --------------------------------------------------------------------------
  // TEST 4: Stops At Strategic Cap
  // --------------------------------------------------------------------------
  it('stopsAtStrategicCap', () => {
    botPlayer.money = 50000;

    // Simulate bot reaching the maximum strategic valuation cap
    state.botNegotiations = {
      'bot_1_3': {
        botId: 'bot_1',
        targetPlayerId: 'p_human',
        targetPropertyId: 3,
        rejectionCount: 8,
        lastOfferAmount: 600, // Above strategic cap for Adana (deed 60)
        strategicMaxOffer: 500
      }
    };

    // Bot stops offering because it reached the strategic maximum
    const stateAfterCap = attemptBotProactiveTrade(state, botPlayer, true);
    expect(stateAfterCap.incomingTradeOffer).toBeUndefined();
  });

  // --------------------------------------------------------------------------
  // TEST 5: Cooldown Prevents Spam
  // --------------------------------------------------------------------------
  it('cooldownPreventsSpam', () => {
    // 1st offer
    const stateWithOffer = attemptBotProactiveTrade(state, botPlayer, { ignoreRandomChance: true, ignoreCooldown: false });
    expect(stateWithOffer.incomingTradeOffer).toBeDefined();

    // Human rejects the offer in current turn (e.g. currentTurnIndex = 0)
    stateWithOffer.currentTurnIndex = 0;
    const stateDeclined = declineIncomingTrade(stateWithOffer, 'p_human');
    expect(stateDeclined.botNegotiations?.['bot_1_3']?.lastOfferTurn).toBe(0);

    // Attempting another offer in the SAME turn without cooldown bypass is blocked
    const stateSameTurn = attemptBotProactiveTrade(stateDeclined, botPlayer, { ignoreRandomChance: true, ignoreCooldown: false });
    expect(stateSameTurn.incomingTradeOffer).toBeUndefined();

    // Once turn advances (currentTurnIndex = 1), cooldown expires and bot can propose escalated offer
    stateDeclined.currentTurnIndex = 1;
    const stateNextTurn = attemptBotProactiveTrade(stateDeclined, botPlayer, { ignoreRandomChance: true, ignoreCooldown: false });
    expect(stateNextTurn.incomingTradeOffer).toBeDefined();
  });

  // --------------------------------------------------------------------------
  // TEST 6: Bot Trade Offer Increases After Rejection
  // --------------------------------------------------------------------------
  it('botTradeOfferIncreasesAfterReject', () => {
    let stateAfterOffer1 = attemptBotProactiveTrade(state, botPlayer, true);
    expect(stateAfterOffer1.incomingTradeOffer).toBeDefined();
    const offer1Money = stateAfterOffer1.incomingTradeOffer!.offeredMoney;

    let stateDeclined1 = declineIncomingTrade(stateAfterOffer1, 'p_human');
    expect(stateDeclined1.botNegotiations?.['bot_1_3']?.rejectionCount).toBe(1);

    let stateAfterOffer2 = attemptBotProactiveTrade(stateDeclined1, botPlayer, true);
    expect(stateAfterOffer2.incomingTradeOffer).toBeDefined();
    const offer2Money = stateAfterOffer2.incomingTradeOffer!.offeredMoney;
    expect(offer2Money).toBeGreaterThan(offer1Money);
  });

  // --------------------------------------------------------------------------
  // TEST 7: Bot Keeps Cash Reserve
  // --------------------------------------------------------------------------
  it('botKeepsCashReserve', () => {
    // Bot has only 250₺, Hard bot reserve is 200₺ -> Max cash available is 50₺
    botPlayer.money = 250;

    const stateLowCash = attemptBotProactiveTrade(state, botPlayer, true);
    if (stateLowCash.incomingTradeOffer) {
      expect(stateLowCash.incomingTradeOffer.offeredMoney).toBeLessThanOrEqual(50);
      expect(botPlayer.money - stateLowCash.incomingTradeOffer.offeredMoney).toBeGreaterThanOrEqual(200);
    } else {
      expect(stateLowCash.incomingTradeOffer).toBeUndefined();
    }
  });

  // --------------------------------------------------------------------------
  // TEST 8: Rejection State Resets Correctly
  // --------------------------------------------------------------------------
  it('rejectionStateResetsCorrectly', () => {
    state.botNegotiations = {
      'bot_1_3': {
        botId: 'bot_1',
        targetPlayerId: 'p_human',
        targetPropertyId: 3,
        rejectionCount: 2,
        lastOfferAmount: 150
      }
    };

    // Case 1: Target player sells or loses property to another player
    const adana = state.board.find(t => t.id === 3)!;
    adana.ownerId = 'p_other_player';

    const pruned = pruneBotNegotiations(state);
    expect(pruned.botNegotiations?.['bot_1_3']).toBeUndefined();

    // Case 2: Trade executed -> monopoly completed
    state.botNegotiations = {
      'bot_1_3': {
        botId: 'bot_1',
        targetPlayerId: 'p_human',
        targetPropertyId: 3,
        rejectionCount: 2,
        lastOfferAmount: 150
      }
    };
    adana.ownerId = 'p_human';

    const tradeOffer = {
      fromPlayerId: 'bot_1',
      toPlayerId: 'p_human',
      offeredTileIds: [],
      offeredMoney: 200,
      requestedTileIds: [3],
      requestedMoney: 0
    };
    const tradedState = executeTrade(state, tradeOffer);
    expect(tradedState.botNegotiations?.['bot_1_3']).toBeUndefined();
  });

  // --------------------------------------------------------------------------
  // TEST 9: Server-Authoritative Trade Decline Records Rejection
  // --------------------------------------------------------------------------
  it('serverAuthoritativeDeclineRecordsRejection', () => {
    state.incomingTradeOffer = {
      fromPlayerId: 'bot_1',
      fromPlayerName: 'Zeki Bot',
      fromPlayerAvatar: '🤖',
      toPlayerId: 'p_human',
      offeredTileIds: [],
      offeredMoney: 100,
      requestedTileIds: [3],
      requestedMoney: 0
    };

    const action = {
      actionId: 'act_decline_trade',
      roomId: 'TR-TEST-ESC',
      playerId: 'p_human',
      expectedVersion: 1,
      type: 'DECLINE_TRADE'
    };

    const actor = {
      userId: 'p_human',
      participantKey: 'key_human:tab1',
      displayName: 'Ahmet'
    };

    const res = applyGameAction(state, action, actor);
    expect(res.success).toBe(true);
    expect(res.state?.incomingTradeOffer).toBeUndefined();
    expect(res.state?.botNegotiations?.['bot_1_3']?.rejectionCount).toBe(1);
    expect(res.state?.botNegotiations?.['bot_1_3']?.lastOfferAmount).toBe(100);
  });

  // --------------------------------------------------------------------------
  // TEST 10: WinnerModal Duration - 7 Minute Simulated Game
  // --------------------------------------------------------------------------
  it('winnerModalDurationSimulatedGame', () => {
    const startTime = 1700000000000;
    const endTime = startTime + (7 * 60 * 1000); // 7 minutes later (420,000 ms)

    const durationMs = endTime - startTime;
    const durationTr = formatGameDuration(durationMs, 'tr');
    const durationEn = formatGameDuration(durationMs, 'en');

    expect(durationTr).toBe('7dk 00sn');
    expect(durationEn).toBe('7m 00s');
  });

  // --------------------------------------------------------------------------
  // TEST 11: Reconnect Retains Duration
  // --------------------------------------------------------------------------
  it('winnerModalDurationReconnectIntact', () => {
    const originalStart = state.gameStartedAt!;
    expect(originalStart).toBeDefined();

    const reconnectedState: GameState = JSON.parse(JSON.stringify(state));
    expect(reconnectedState.gameStartedAt).toBe(originalStart);

    reconnectedState.phase = 'ENDED';
    reconnectedState.gameEndedAt = originalStart + 420000;

    const durationMs = reconnectedState.gameEndedAt - reconnectedState.gameStartedAt!;
    expect(formatGameDuration(durationMs, 'tr')).toBe('7dk 00sn');
  });

  // --------------------------------------------------------------------------
  // TEST 12: Replacement Bot Takeover Retains Duration
  // --------------------------------------------------------------------------
  it('winnerModalDurationReplacementBotTakeover', () => {
    const originalStart = state.gameStartedAt!;

    const takeoverAction = {
      actionId: 'act_leave_rep',
      roomId: 'TR-TEST-ESC',
      playerId: 'p_human',
      expectedVersion: 1,
      type: 'LEAVE_AND_REPLACE_WITH_BOT'
    };
    const actor = {
      userId: 'p_human',
      participantKey: 'key_human:tab1'
    };

    const res = applyGameAction(state, takeoverAction, actor);
    expect(res.success).toBe(true);
    expect(res.state?.gameStartedAt).toBe(originalStart);
  });

  // --------------------------------------------------------------------------
  // TEST 13: Spectator Join Retains Duration
  // --------------------------------------------------------------------------
  it('winnerModalDurationSpectatorIntact', () => {
    const originalStart = state.gameStartedAt!;

    const stateWithSpectator: GameState = {
      ...state,
      spectators: [
        {
          id: 'spec_1',
          name: 'İzleyici',
          avatar: '👁️',
          joinedAt: Date.now()
        }
      ]
    };

    expect(stateWithSpectator.gameStartedAt).toBe(originalStart);
  });

  // --------------------------------------------------------------------------
  // TEST 14: Replay / Restart Sets Fresh gameStartedAt
  // --------------------------------------------------------------------------
  it('winnerModalDurationReplayFreshStart', () => {
    const oldStartTime = state.gameStartedAt!;
    state.phase = 'ENDED';
    state.gameEndedAt = oldStartTime + 420000;

    const restartAction = {
      actionId: 'act_restart_match',
      roomId: 'TR-TEST-ESC',
      playerId: 'p_human',
      expectedVersion: 1,
      type: 'START_GAME'
    };
    const actor = {
      userId: 'p_human',
      isHost: true
    };

    const newTime = Date.now() + 5000;
    const res = applyGameAction(state, restartAction, actor, { now: newTime });
    expect(res.success).toBe(true);
    expect(res.state?.phase).toBe('PLAYING');
    expect(res.state?.gameStartedAt).toBe(newTime);
    expect(res.state?.gameEndedAt).toBeUndefined();
  });
});
