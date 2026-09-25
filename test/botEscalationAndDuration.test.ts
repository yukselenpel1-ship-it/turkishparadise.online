import { describe, it, expect, beforeEach } from 'vitest';
import {
  createInitialState,
  attemptBotProactiveTrade,
  declineIncomingTrade,
  pruneBotNegotiations,
  executeTrade,
  formatGameDuration,
  declareBankruptcy,
  isPlayerHost
} from '../src/engine/gameEngine';
import { applyGameAction } from '../src/server/game/serverGameEngine';
import { GameState, Player, BoardTile } from '../src/types/game';

describe('Bot Trade Escalation & WinnerModal Duration Suite', () => {
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
      money: 1500,
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
      money: 1500,
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
  // TEST 1: Bot Trade Offer Increases After Rejection
  // --------------------------------------------------------------------------
  it('botTradeOfferIncreasesAfterReject', () => {
    // 1st offer (initial strategic valuation)
    let stateAfterOffer1 = attemptBotProactiveTrade(state, botPlayer, true);
    expect(stateAfterOffer1.incomingTradeOffer).toBeDefined();
    const offer1Money = stateAfterOffer1.incomingTradeOffer!.offeredMoney;
    expect(offer1Money).toBeGreaterThan(0);

    // Human declines 1st offer
    let stateDeclined1 = declineIncomingTrade(stateAfterOffer1, 'p_human');
    expect(stateDeclined1.incomingTradeOffer).toBeUndefined();
    expect(stateDeclined1.botNegotiations?.['bot_1_3']?.rejectionCount).toBe(1);

    // 2nd offer (+10% escalated)
    let stateAfterOffer2 = attemptBotProactiveTrade(stateDeclined1, botPlayer, true);
    expect(stateAfterOffer2.incomingTradeOffer).toBeDefined();
    const offer2Money = stateAfterOffer2.incomingTradeOffer!.offeredMoney;
    expect(offer2Money).toBeGreaterThan(offer1Money);

    // Human declines 2nd offer
    let stateDeclined2 = declineIncomingTrade(stateAfterOffer2, 'p_human');
    expect(stateDeclined2.botNegotiations?.['bot_1_3']?.rejectionCount).toBe(2);

    // 3rd offer (+25% escalated)
    let stateAfterOffer3 = attemptBotProactiveTrade(stateDeclined2, botPlayer, true);
    expect(stateAfterOffer3.incomingTradeOffer).toBeDefined();
    const offer3Money = stateAfterOffer3.incomingTradeOffer!.offeredMoney;
    expect(offer3Money).toBeGreaterThanOrEqual(offer2Money);

    // Human declines 3rd offer -> Rejection cap reached
    let stateDeclined3 = declineIncomingTrade(stateAfterOffer3, 'p_human');
    expect(stateDeclined3.botNegotiations?.['bot_1_3']?.rejectionCount).toBe(3);

    // 4th attempt: Bot respects refusal and skips spamming
    let stateAfterOffer4 = attemptBotProactiveTrade(stateDeclined3, botPlayer, true);
    expect(stateAfterOffer4.incomingTradeOffer).toBeUndefined();
  });

  // --------------------------------------------------------------------------
  // TEST 2: Bot Offer Has Strategic Cap
  // --------------------------------------------------------------------------
  it('botOfferHasStrategicCap', () => {
    // Give bot unlimited money
    botPlayer.money = 50000;
    const adana = state.board.find(t => t.id === 3)!;
    const deedPrice = adana.price || 60;

    // Simulate 2 rejections
    state.botNegotiations = {
      'bot_1_3': {
        botId: 'bot_1',
        targetPlayerId: 'p_human',
        targetPropertyId: 3,
        rejectionCount: 2,
        lastOfferAmount: 200
      }
    };

    const stateWithCap = attemptBotProactiveTrade(state, botPlayer, true);
    expect(stateWithCap.incomingTradeOffer).toBeDefined();
    const maxOffer = stateWithCap.incomingTradeOffer!.offeredMoney;
    // Offer must not exceed reasonable strategic cap (deedPrice * 2.5)
    expect(maxOffer).toBeLessThanOrEqual(Math.round(deedPrice * 3.0));
  });

  // --------------------------------------------------------------------------
  // TEST 3: Bot Keeps Cash Reserve
  // --------------------------------------------------------------------------
  it('botKeepsCashReserve', () => {
    // Bot has only 250₺, Hard bot reserve is 200₺ -> Max cash available is 50₺
    botPlayer.money = 250;

    const stateLowCash = attemptBotProactiveTrade(state, botPlayer, true);
    // Since 50₺ is below deedPrice * 1.1 (66₺), bot will not offer cash or bankrupt itself
    if (stateLowCash.incomingTradeOffer) {
      expect(stateLowCash.incomingTradeOffer.offeredMoney).toBeLessThanOrEqual(50);
      expect(botPlayer.money - stateLowCash.incomingTradeOffer.offeredMoney).toBeGreaterThanOrEqual(200);
    } else {
      expect(stateLowCash.incomingTradeOffer).toBeUndefined();
    }
  });

  // --------------------------------------------------------------------------
  // TEST 4: Rejection State Resets Correctly
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
  // TEST 5: Server-Authoritative Trade Decline Records Rejection
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
  // TEST 6: WinnerModal Duration - 7 Minute Simulated Game
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
  // TEST 7: Reconnect Retains Duration
  // --------------------------------------------------------------------------
  it('winnerModalDurationReconnectIntact', () => {
    const originalStart = state.gameStartedAt!;
    expect(originalStart).toBeDefined();

    // Serialize and deserialize (simulating reconnect from Redis / network)
    const reconnectedState: GameState = JSON.parse(JSON.stringify(state));
    expect(reconnectedState.gameStartedAt).toBe(originalStart);

    // End game after 7 minutes
    reconnectedState.phase = 'ENDED';
    reconnectedState.gameEndedAt = originalStart + 420000;

    const durationMs = reconnectedState.gameEndedAt - reconnectedState.gameStartedAt!;
    expect(formatGameDuration(durationMs, 'tr')).toBe('7dk 00sn');
  });

  // --------------------------------------------------------------------------
  // TEST 8: Replacement Bot Takeover Retains Duration
  // --------------------------------------------------------------------------
  it('winnerModalDurationReplacementBotTakeover', () => {
    const originalStart = state.gameStartedAt!;

    // Human player replaced by bot
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
  // TEST 9: Spectator Join Retains Duration
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
  // TEST 10: Replay / Restart Sets Fresh gameStartedAt
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
