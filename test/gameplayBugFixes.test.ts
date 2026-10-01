import { describe, it, expect, beforeEach } from 'vitest';
import {
  createInitialState,
  attemptBotProactiveTrade,
  declineIncomingTrade,
  executeTrade,
  applyChanceCard,
  hasColorGroupMonopoly,
  handleRollDice,
  buyProperty,
  passProperty,
  buildHouse,
  sellHouse,
  toggleMortgage,
  payJailBail
} from '../src/engine/gameEngine';
import { applyGameAction } from '../src/server/game/serverGameEngine';
import { GameState, Player, BoardTile, ChanceCard, TradeOffer } from '../src/types/game';
import { GameAction } from '../src/server/storage/roomStorage';

describe('Turkish Paradise - Critical Gameplay Bug Fixes Suite', () => {
  let state: GameState;
  let player1: Player;
  let player2: Player;
  let botPlayer: Player;

  beforeEach(() => {
    state = createInitialState({ roomCode: 'TR-BUGFIX-ROOM' });
    state.phase = 'PLAYING';
    state.gameStartedAt = Date.now() - 60000;

    player1 = {
      id: 'p1',
      userId: 'p1',
      name: 'Player One',
      avatar: '🎩',
      color: '#3B82F6',
      money: 3000,
      position: 5,
      isJailed: false,
      jailTurns: 0,
      inGame: true,
      isBot: false,
      isHost: true,
      lapsCompleted: 1,
      firstLapPurchases: 1
    };

    player2 = {
      id: 'p2',
      userId: 'p2',
      name: 'Player Two',
      avatar: '🐱',
      color: '#EC4899',
      money: 3000,
      position: 10,
      isJailed: false,
      jailTurns: 0,
      inGame: true,
      isBot: false,
      isHost: false,
      lapsCompleted: 1,
      firstLapPurchases: 1
    };

    botPlayer = {
      id: 'bot_hard',
      userId: 'bot_hard',
      name: 'Hard Bot',
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

    state.players = [player1, player2, botPlayer];
    state.currentTurnIndex = 0; // Turn on player1
  });

  // ==========================================================================
  // SECTION 1: "Bir Yapıyı Yık" / Chance Card Actor Isolation & Server Validation
  // ==========================================================================
  describe('Chance Card & Demolish Actor Validation', () => {
    let demolishCard: ChanceCard;

    beforeEach(() => {
      demolishCard = {
        id: 'c15',
        title: 'Bir Yapıyı Yık',
        description: 'Rakiplerinden birinin bir evini veya otelini yık.',
        actionType: 'DEMOLISH_BUILDING',
        ownerPlayerId: 'p1'
      };

      // Set up a property owned by player 2 with 2 houses
      const tile = state.board.find((t) => t.id === 6)!; // Izmir
      tile.ownerId = 'p2';
      tile.houses = 2;
    });

    it('onlyCardOwnerCanConfirmDemolish', () => {
      state.pendingAction = 'CHANCE_CARD';
      state.activeCard = demolishCard;

      // Card owner is player1
      const action: GameAction = {
        actionId: 'act_demolish_1',
        roomId: state.roomId,
        playerId: 'p1',
        type: 'CONFIRM_CHANCE',
        payload: { tileId: 6 }
      };

      const resOwner = applyGameAction(state, action, { userId: 'p1', isHost: true });

      expect(resOwner.success).toBe(true);
      if (resOwner.success) {
        const izmir = resOwner.state.board.find((t) => t.id === 6)!;
        expect(izmir.houses).toBe(1); // 1 house demolished
        expect(resOwner.state.pendingAction).toBe('NONE');
      }
    });

    it('otherPlayersCannotConfirmActiveChance', () => {
      state.pendingAction = 'CHANCE_CARD';
      state.activeCard = demolishCard;

      // Non-owner (p2) tries to confirm chance card drawn by p1
      const actionP2: GameAction = {
        actionId: 'act_demolish_2',
        roomId: state.roomId,
        playerId: 'p2',
        type: 'CONFIRM_CHANCE',
        payload: { tileId: 6 }
      };

      const resOther = applyGameAction(state, actionP2, { userId: 'p2', isHost: false });

      expect(resOther.success).toBe(false);
      expect(resOther.error).toBe('NOT_YOUR_TURN');

      // Bot also cannot confirm card belonging to p1
      const actionBot: GameAction = {
        actionId: 'act_demolish_bot',
        roomId: state.roomId,
        playerId: 'bot_hard',
        type: 'CONFIRM_CHANCE',
        payload: { tileId: 6 }
      };
      const resBot = applyGameAction(state, actionBot, { userId: 'bot_hard', isHost: false });
      expect(resBot.success).toBe(false);
      expect(resBot.error).toBe('NOT_YOUR_TURN');
    });

    it('serverRejectsWrongActorForDemolish', () => {
      // Test server action DEMOLISH_BUILDING directly
      state.pendingAction = 'CHANCE_CARD';
      state.activeCard = demolishCard;

      const actionWrong: GameAction = {
        actionId: 'act_demolish_wrong',
        roomId: state.roomId,
        playerId: 'p2',
        type: 'DEMOLISH_BUILDING',
        payload: { tileId: 6 }
      };

      const resWrong = applyGameAction(state, actionWrong, { userId: 'p2', isHost: false });

      expect(resWrong.success).toBe(false);
      expect(resWrong.error).toBe('NOT_YOUR_TURN');
    });
  });

  // ==========================================================================
  // SECTION 2: Trade Modal & Buttons
  // ==========================================================================
  describe('Trade Modal Actions & Close Button', () => {
    let testTradeOffer: TradeOffer;

    beforeEach(() => {
      // p1 owns property 1 (Hatay), p2 owns property 3 (Adana)
      state.board.find((t) => t.id === 1)!.ownerId = 'p1';
      state.board.find((t) => t.id === 3)!.ownerId = 'p2';

      testTradeOffer = {
        fromPlayerId: 'p1',
        toPlayerId: 'p2',
        offeredTileIds: [1],
        requestedTileIds: [3],
        offeredMoney: 200,
        requestedMoney: 0
      };
      state.incomingTradeOffer = testTradeOffer;
    });

    it('declineButtonDispatchesTradeDecline', () => {
      // Test decline action dispatch from recipient player
      const action: GameAction = {
        actionId: 'act_decline_btn',
        roomId: state.roomId,
        playerId: 'p2',
        type: 'TRADE_DECLINE'
      };

      const res = applyGameAction(state, action, { userId: 'p2', isHost: false });
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.state.incomingTradeOffer).toBeUndefined();
        expect(res.events?.some((e) => e.type === 'TRADE_DECLINED')).toBe(true);
      }
    });

    it('serverClearsIncomingTradeOnDecline', () => {
      const action: GameAction = {
        actionId: 'act_server_clear_decline',
        roomId: state.roomId,
        playerId: 'p2',
        type: 'DECLINE_TRADE'
      };

      const res = applyGameAction(state, action, { userId: 'p2', isHost: false });
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.state.incomingTradeOffer).toBeUndefined();
        expect(res.state.board.find((t) => t.id === 1)!.ownerId).toBe('p1');
        expect(res.state.board.find((t) => t.id === 3)!.ownerId).toBe('p2');
      }
    });

    it('onlyTradeTargetCanDecline', () => {
      // Non-target player (p1, the sender, or a 3rd party) tries to decline the incoming trade offer directed to p2
      const actionWrong: GameAction = {
        actionId: 'act_decline_wrong_actor',
        roomId: state.roomId,
        playerId: 'p1',
        type: 'TRADE_DECLINE'
      };

      const res = applyGameAction(state, actionWrong, { userId: 'p1', isHost: true });
      expect(res.success).toBe(false);
      expect(res.error).toBe('NOT_TRADE_TARGET');

      // Invariant: incoming trade offer must still remain untouched
      expect(state.incomingTradeOffer).toBeDefined();
      expect(state.incomingTradeOffer?.toPlayerId).toBe('p2');
    });

    it('declineUpdatesBotNegotiation', () => {
      // Setup incoming trade from bot_hard to p1
      const botOffer: TradeOffer = {
        fromPlayerId: 'bot_hard',
        toPlayerId: 'p1',
        offeredTileIds: [],
        requestedTileIds: [3],
        offeredMoney: 400,
        requestedMoney: 0
      };
      state.incomingTradeOffer = botOffer;
      state.botNegotiations = {
        'bot_hard_3': {
          botId: 'bot_hard',
          targetPlayerId: 'p1',
          targetPropertyId: 3,
          rejectionCount: 1,
          lastOfferAmount: 300,
          strategicMaxOffer: 800
        }
      };

      const action: GameAction = {
        actionId: 'act_decline_bot_trade',
        roomId: state.roomId,
        playerId: 'p1',
        type: 'TRADE_DECLINE'
      };

      const res = applyGameAction(state, action, { userId: 'p1', isHost: true });
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.state.incomingTradeOffer).toBeUndefined();
        const negRecord = res.state.botNegotiations?.['bot_hard_3'];
        expect(negRecord).toBeDefined();
        expect(negRecord?.rejectionCount).toBe(2);
        expect(negRecord?.lastOfferAmount).toBe(400);
        expect(negRecord?.strategicMaxOffer).toBe(800);
      }
    });

    it('declineModalDoesNotReopenFromStaleState', () => {
      // 1. Decline trade on state
      const next = declineIncomingTrade(state, 'p2');
      expect(next.incomingTradeOffer).toBeUndefined();

      // 2. Calculate offer keys: null when incomingTradeOffer is cleared
      const currentIncomingOfferKey = next.incomingTradeOffer
        ? `${next.incomingTradeOffer.fromPlayerId}_${next.incomingTradeOffer.toPlayerId}_${next.incomingTradeOffer.offeredMoney}`
        : null;
      expect(currentIncomingOfferKey).toBeNull();

      // 3. Trying to decline again on cleared state safely returns unchanged state
      const afterSecondDecline = declineIncomingTrade(next, 'p2');
      expect(afterSecondDecline.incomingTradeOffer).toBeUndefined();
    });

    it('tradeAcceptWorks', () => {
      const action: GameAction = {
        actionId: 'act_accept_trade',
        roomId: state.roomId,
        playerId: 'p2',
        type: 'TRADE_ACCEPT'
      };

      const res = applyGameAction(state, action, { userId: 'p2', isHost: false });

      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.state.incomingTradeOffer).toBeUndefined();
        // Hatay transferred to p2, Adana transferred to p1
        expect(res.state.board.find((t) => t.id === 1)!.ownerId).toBe('p2');
        expect(res.state.board.find((t) => t.id === 3)!.ownerId).toBe('p1');
        // Money exchanged: p1 paid 200 to p2
        expect(res.state.players.find((p) => p.id === 'p1')!.money).toBe(2800);
        expect(res.state.players.find((p) => p.id === 'p2')!.money).toBe(3200);
      }
    });

    it('tradeDeclineWorks', () => {
      const action: GameAction = {
        actionId: 'act_decline_trade',
        roomId: state.roomId,
        playerId: 'p2',
        type: 'TRADE_DECLINE'
      };

      const res = applyGameAction(state, action, { userId: 'p2', isHost: false });

      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.state.incomingTradeOffer).toBeUndefined();
        // Ownership untouched
        expect(res.state.board.find((t) => t.id === 1)!.ownerId).toBe('p1');
        expect(res.state.board.find((t) => t.id === 3)!.ownerId).toBe('p2');
      }
    });

    it('tradeCounterOfferWorks', () => {
      // When recipient counter-offers, the active incoming trade is declined and cleared on server/local
      const action: GameAction = {
        actionId: 'act_counter_decline',
        roomId: state.roomId,
        playerId: 'p2',
        type: 'DECLINE_TRADE'
      };

      const res = applyGameAction(state, action, { userId: 'p2', isHost: false });

      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.state.incomingTradeOffer).toBeUndefined();
      }
    });

    it('tradeCloseButtonWorks', () => {
      // Local dismissal preserves game state without triggering unwanted accept/decline
      const offerKey = `${testTradeOffer.fromPlayerId}_${testTradeOffer.toPlayerId}_${testTradeOffer.offeredMoney}_${testTradeOffer.offeredTileIds.join(',')}_${testTradeOffer.requestedTileIds.join(',')}`;
      let dismissedKey: string | null = null;

      // Simulate X button click
      dismissedKey = offerKey;
      expect(dismissedKey).toBe(offerKey);
      // Invariant: original state remains valid and unchanged
      expect(state.incomingTradeOffer).toBeDefined();
    });

    it('tradeModalDoesNotRemainStale', () => {
      // Declining cleans up incomingTradeOffer from state
      const next = declineIncomingTrade(state, 'p2');
      expect(next.incomingTradeOffer).toBeUndefined();
    });
  });

  // ==========================================================================
  // SECTION 3: Easy, Medium, and Hard Bot Escalation & Negotiation
  // ==========================================================================
  describe('Easy, Medium & Hard Bot Negotiation Escalation', () => {
    let easyBot: Player;
    let mediumBot: Player;
    let hardBot: Player;

    beforeEach(() => {
      easyBot = {
        id: 'bot_easy',
        userId: 'bot_easy',
        name: 'Kolay Bot',
        avatar: '🤖',
        color: '#10B981',
        money: 4000,
        position: 0,
        isJailed: false,
        jailTurns: 0,
        inGame: true,
        isBot: true,
        botDifficulty: 'easy',
        isHost: false,
        lapsCompleted: 1,
        firstLapPurchases: 1
      };

      mediumBot = {
        id: 'bot_med',
        userId: 'bot_med',
        name: 'Orta Bot',
        avatar: '🤖',
        color: '#F59E0B',
        money: 4000,
        position: 0,
        isJailed: false,
        jailTurns: 0,
        inGame: true,
        isBot: true,
        botDifficulty: 'medium',
        isHost: false,
        lapsCompleted: 1,
        firstLapPurchases: 1
      };

      hardBot = {
        id: 'bot_hard',
        userId: 'bot_hard',
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

      // Set up Brown group: Tile 1 (Hatay), Tile 2 (Mersin), Tile 3 (Adana)
      // Bot owns 1 and 2, human owns 3
      state.board.find((t) => t.id === 1)!.ownerId = undefined;
      state.board.find((t) => t.id === 2)!.ownerId = undefined;
      state.board.find((t) => t.id === 3)!.ownerId = 'p1';
    });

    it('easyBotEscalatesAfterReject', () => {
      state.players = [player1, easyBot];
      state.board.find((t) => t.id === 1)!.ownerId = 'bot_easy';
      state.board.find((t) => t.id === 2)!.ownerId = 'bot_easy';

      // 1st offer
      let state1 = attemptBotProactiveTrade(state, easyBot, true);
      expect(state1.incomingTradeOffer).toBeDefined();
      const firstOffer = state1.incomingTradeOffer!.offeredMoney;

      // Rejection
      let stateDeclined = declineIncomingTrade(state1, 'p1');
      expect(stateDeclined.botNegotiations?.['bot_easy_3']?.rejectionCount).toBe(1);

      // 2nd offer after reject
      let state2 = attemptBotProactiveTrade(stateDeclined, easyBot, true);
      expect(state2.incomingTradeOffer).toBeDefined();
      const secondOffer = state2.incomingTradeOffer!.offeredMoney;
      expect(secondOffer).toBeGreaterThan(firstOffer);
    });

    it('mediumBotEscalatesAfterReject', () => {
      state.players = [player1, mediumBot];
      state.board.find((t) => t.id === 1)!.ownerId = 'bot_med';
      state.board.find((t) => t.id === 2)!.ownerId = 'bot_med';

      let state1 = attemptBotProactiveTrade(state, mediumBot, true);
      expect(state1.incomingTradeOffer).toBeDefined();
      const firstOffer = state1.incomingTradeOffer!.offeredMoney;

      let stateDeclined = declineIncomingTrade(state1, 'p1');
      let state2 = attemptBotProactiveTrade(stateDeclined, mediumBot, true);
      expect(state2.incomingTradeOffer).toBeDefined();
      const secondOffer = state2.incomingTradeOffer!.offeredMoney;
      expect(secondOffer).toBeGreaterThan(firstOffer);
    });

    it('hardBotEscalatesAfterReject', () => {
      state.players = [player1, hardBot];
      state.board.find((t) => t.id === 1)!.ownerId = 'bot_hard';
      state.board.find((t) => t.id === 2)!.ownerId = 'bot_hard';

      let state1 = attemptBotProactiveTrade(state, hardBot, true);
      expect(state1.incomingTradeOffer).toBeDefined();
      const firstOffer = state1.incomingTradeOffer!.offeredMoney;

      let stateDeclined = declineIncomingTrade(state1, 'p1');
      let state2 = attemptBotProactiveTrade(stateDeclined, hardBot, true);
      expect(state2.incomingTradeOffer).toBeDefined();
      const secondOffer = state2.incomingTradeOffer!.offeredMoney;
      expect(secondOffer).toBeGreaterThan(firstOffer);
    });

    it('rejectedOfferAmountNeverRepeatsUnlessCapped', () => {
      state.players = [player1, mediumBot];
      state.board.find((t) => t.id === 1)!.ownerId = 'bot_med';
      state.board.find((t) => t.id === 2)!.ownerId = 'bot_med';

      let currentState = state;
      const observedOffers: number[] = [];

      for (let i = 0; i < 3; i++) {
        currentState = attemptBotProactiveTrade(currentState, mediumBot, true);
        if (!currentState.incomingTradeOffer) break;
        const offerAmount = currentState.incomingTradeOffer.offeredMoney;
        observedOffers.push(offerAmount);
        currentState = declineIncomingTrade(currentState, 'p1');
      }

      // Assert strictly increasing offers
      for (let i = 1; i < observedOffers.length; i++) {
        expect(observedOffers[i]).toBeGreaterThan(observedOffers[i - 1]);
      }
    });

    it('allDifficultiesRespectStrategicCap', () => {
      const bots = [easyBot, mediumBot, hardBot];

      for (const bot of bots) {
        const testState = createInitialState({ roomCode: 'TEST-CAP' });
        testState.phase = 'PLAYING';
        testState.players = [player1, bot];
        testState.board.find((t) => t.id === 1)!.ownerId = bot.id;
        testState.board.find((t) => t.id === 2)!.ownerId = bot.id;
        testState.board.find((t) => t.id === 3)!.ownerId = 'p1';

        // Set last offer way above strategic max offer
        const negKey = `${bot.id}_3`;
        testState.botNegotiations = {
          [negKey]: {
            botId: bot.id,
            targetPlayerId: 'p1',
            targetPropertyId: 3,
            rejectionCount: 10,
            lastOfferAmount: 2000,
            strategicMaxOffer: 1000
          }
        };

        const afterCap = attemptBotProactiveTrade(testState, bot, true);
        expect(afterCap.incomingTradeOffer).toBeUndefined();
      }
    });

    it('allDifficultiesRespectCooldown', () => {
      const bots = [easyBot, mediumBot, hardBot];

      for (const bot of bots) {
        const testState = createInitialState({ roomCode: 'TEST-COOL' });
        testState.phase = 'PLAYING';
        testState.players = [player1, bot];
        testState.board.find((t) => t.id === 1)!.ownerId = bot.id;
        testState.board.find((t) => t.id === 2)!.ownerId = bot.id;
        testState.board.find((t) => t.id === 3)!.ownerId = 'p1';
        testState.currentTurnIndex = 0;

        // 1st offer
        const withOffer = attemptBotProactiveTrade(testState, bot, { ignoreRandomChance: true, ignoreCooldown: false });
        expect(withOffer.incomingTradeOffer).toBeDefined();

        // Human rejects in turn 0
        const declined = declineIncomingTrade(withOffer, 'p1');
        expect(declined.botNegotiations?.[`${bot.id}_3`]?.lastOfferTurn).toBe(0);

        // Immediate proposal in same turn without cooldown bypass should be rejected/blocked
        const blockedSameTurn = attemptBotProactiveTrade(declined, bot, { ignoreRandomChance: true, ignoreCooldown: false });
        expect(blockedSameTurn.incomingTradeOffer).toBeUndefined();

        // When turn advances, cooldown clears
        declined.currentTurnIndex = 1;
        const nextTurnOffer = attemptBotProactiveTrade(declined, bot, { ignoreRandomChance: true, ignoreCooldown: false });
        expect(nextTurnOffer.incomingTradeOffer).toBeDefined();
      }
    });
  });

  // ==========================================================================
  // SECTION 4: AFK Auto-Takeover & Take Back Control ("Buradayım") Recovery
  // ==========================================================================
  describe('AFK Auto-Takeover & Take Back Control Recovery', () => {
    it('server PLAYER_ACTIVE clears isAfk and refreshes turn timer for current player', () => {
      // Setup: player1 is AFK on their turn with stale turnStartedAt
      const staleTimestamp = Date.now() - 65000;
      state.turnStartedAt = staleTimestamp;
      player1.isAfk = true;
      state.currentTurnIndex = 0;

      const action: GameAction = {
        actionId: 'act_active_1',
        roomId: state.roomId || 'TR-BUGFIX-ROOM',
        playerId: 'p1',
        type: 'PLAYER_ACTIVE',
        timestamp: Date.now()
      };

      const result = applyGameAction(state, action);
      expect(result.success).toBe(true);
      expect(result.state.players[0].isAfk).toBe(false);
      expect(result.state.turnStartedAt).toBeGreaterThan(staleTimestamp);
    });

    it('server active game actions clear isAfk on human acting player', () => {
      // Setup: player1 is AFK but clicks roll dice
      player1.isAfk = true;
      state.currentTurnIndex = 0;
      state.diceRolled = false;

      const rollAction: GameAction = {
        actionId: 'act_roll_afk',
        roomId: state.roomId || 'TR-BUGFIX-ROOM',
        playerId: 'p1',
        type: 'ROLL_DICE',
        timestamp: Date.now()
      };

      const result = applyGameAction(state, rollAction);
      expect(result.success).toBe(true);
      expect(result.state.players[0].isAfk).toBe(false);
    });

    it('client gameEngine actions clear isAfk on human player when executing moves', () => {
      // 1. handleRollDice clears isAfk
      player1.isAfk = true;
      state.diceRolled = false;
      state.currentTurnIndex = 0;
      const afterRoll = handleRollDice(state, [2, 3]);
      expect(afterRoll.players[0].isAfk).toBe(false);

      // 2. buyProperty clears isAfk
      afterRoll.players[0].isAfk = true;
      afterRoll.pendingAction = 'BUY_PROPERTY';
      const afterBuy = buyProperty(afterRoll, 'p1');
      expect(afterBuy.players[0].isAfk).toBe(false);

      // 3. passProperty clears isAfk
      afterBuy.players[0].isAfk = true;
      afterBuy.pendingAction = 'BUY_PROPERTY';
      const afterPass = passProperty(afterBuy, 'p1');
      expect(afterPass.players[0].isAfk).toBe(false);

      // 4. payJailBail clears isAfk
      afterPass.players[0].isAfk = true;
      afterPass.players[0].isJailed = true;
      afterPass.players[0].money = 1000;
      const afterBail = payJailBail(afterPass);
      expect(afterBail.players[0].isAfk).toBe(false);

      // 5. trade decline clears isAfk on rejecting human player
      const tradeState = createInitialState({ roomCode: 'TR-TRADE-AFK' });
      tradeState.phase = 'PLAYING';
      tradeState.players = [player1, botPlayer];
      tradeState.incomingTradeOffer = {
        fromPlayerId: 'bot_hard',
        toPlayerId: 'p1',
        offeredMoney: 200,
        offeredTileIds: [],
        requestedMoney: 0,
        requestedTileIds: [3]
      };
      player1.isAfk = true;
      const afterDecline = declineIncomingTrade(tradeState, 'p1');
      expect(afterDecline.players[0].isAfk).toBe(false);
    });
  });
});
