import { describe, it, expect, beforeEach } from 'vitest';
import {
  applyGameAction,
  AuthenticatedActor
} from '../src/server/game/serverGameEngine';
import {
  createInitialState,
  leaveAndReplaceWithBot,
  takeOverReplacementBot
} from '../src/engine/gameEngine';
import { GameState, Player } from '../src/types/game';
import { GameAction } from '../src/server/storage/roomStorage';

function createTestGameState(): GameState {
  const base = createInitialState({ roomCode: 'TR-9999', startingMoney: 1500 });
  const hostPlayer: Player = {
    id: 'p_host',
    userId: 'user_host_123',
    participantKey: 'pk_host_123',
    name: 'Host Player',
    avatar: '👑',
    color: '#EF4444',
    money: 1500,
    position: 5,
    isJailed: false,
    jailTurns: 0,
    inGame: true,
    isHost: true,
    isBot: false,
    lapsCompleted: 1,
    firstLapPurchases: 1
  };

  const guestPlayer: Player = {
    id: 'p_guest_1',
    userId: 'user_guest_123',
    participantKey: 'pk_guest_123',
    name: 'Mehmet',
    avatar: '🎩',
    color: '#3B82F6',
    money: 1200,
    position: 8,
    isJailed: false,
    jailTurns: 0,
    inGame: true,
    isHost: false,
    isBot: false,
    lapsCompleted: 2,
    firstLapPurchases: 2,
    totalRentCollected: 350
  };

  const hostBot: Player = {
    id: 'p_host_bot',
    name: 'Zeki Bot',
    avatar: '🤖',
    color: '#10B981',
    money: 1500,
    position: 0,
    isJailed: false,
    jailTurns: 0,
    inGame: true,
    isHost: false,
    isBot: true,
    botOrigin: 'HOST_ADDED',
    botDifficulty: 'medium',
    lapsCompleted: 0,
    firstLapPurchases: 0
  };

  base.players = [hostPlayer, guestPlayer, hostBot];
  base.phase = 'PLAYING';
  base.hostPlayerId = 'p_host';
  base.currentTurnIndex = 1; // Mehmet's turn

  // Give Mehmet property on board
  base.board[8].ownerId = 'p_guest_1';
  base.board[8].houses = 1;

  return base;
}

describe('Deliberate Leave & Replacement Bot Takeover Suite', () => {
  let state: GameState;
  const guestActor: AuthenticatedActor = {
    userId: 'user_guest_123',
    participantKey: 'pk_guest_123',
    displayName: 'Mehmet',
    isHost: false,
    isGuest: false
  };

  beforeEach(() => {
    state = createTestGameState();
  });

  describe('1. LEAVE_AND_REPLACE_WITH_BOT (Player Deliberately Leaves)', () => {
    it('should convert active human player to replacement bot without deleting seat', () => {
      const action: GameAction = {
        actionId: 'act_leave_1',
        roomId: 'TR-9999',
        playerId: 'p_guest_1',
        type: 'LEAVE_AND_REPLACE_WITH_BOT',
        expectedVersion: 1
      };

      const result = applyGameAction(state, action, guestActor);
      expect(result.success).toBe(true);
      expect(result.state).toBeDefined();

      const players = result.state!.players;
      expect(players.length).toBe(3); // Seat NOT deleted

      const replacedSeat = players.find(p => p.id === 'p_guest_1');
      expect(replacedSeat).toBeDefined();
      expect(replacedSeat!.isBot).toBe(true);
      expect(replacedSeat!.isReplacementBot).toBe(true);
      expect(replacedSeat!.botOrigin).toBe('PLAYER_REPLACEMENT');
      expect(replacedSeat!.replacedPlayerName).toBe('Mehmet');

      // Money, position, properties, laps and stats are preserved
      expect(replacedSeat!.money).toBe(1200);
      expect(replacedSeat!.position).toBe(8);
      expect(replacedSeat!.lapsCompleted).toBe(2);
      expect(replacedSeat!.totalRentCollected).toBe(350);
      expect(result.state!.board[8].ownerId).toBe('p_guest_1');

      // Identity bindings are invalidated
      expect(replacedSeat!.userId).toBeUndefined();
      expect(replacedSeat!.participantKey).toBeUndefined();
      expect(replacedSeat!.clientId).toBeUndefined();
      expect(replacedSeat!.tabId).toBeUndefined();

      // Log is added
      expect(result.state!.logs.some(l => l.text.includes('Mehmet oyundan ayrıldı. Yerini bot devraldı.'))).toBe(true);
    });

    it('should reject when non-owner unauthorized actor tries to leave another player seat', () => {
      const unauthorizedActor: AuthenticatedActor = {
        userId: 'intruder_456',
        participantKey: 'intruder_pk',
        displayName: 'Intruder',
        isHost: false,
        isGuest: true
      };

      const action: GameAction = {
        actionId: 'act_leave_unauth',
        roomId: 'TR-9999',
        playerId: 'p_guest_1',
        type: 'LEAVE_AND_REPLACE_WITH_BOT',
        expectedVersion: 1
      };

      // In production security mode, unauthorized attempts are rejected
      const prevEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        const result = applyGameAction(state, action, unauthorizedActor);
        expect(result.success).toBe(false);
        expect(result.error).toBe('UNAUTHORIZED_PLAYER');
      } finally {
        process.env.NODE_ENV = prevEnv;
      }
    });

    it('should maintain ongoing turn flow when player leaves during active turn', () => {
      state.currentTurnIndex = 1; // Mehmet's turn
      state.diceRolled = true;
      state.pendingAction = 'BUY_PROPERTY';

      const action: GameAction = {
        actionId: 'act_leave_midturn',
        roomId: 'TR-9999',
        playerId: 'p_guest_1',
        type: 'LEAVE_AND_REPLACE_WITH_BOT',
        expectedVersion: 1
      };

      const result = applyGameAction(state, action, guestActor);
      expect(result.success).toBe(true);

      // Turn remains on current seat with pending action intact
      expect(result.state!.currentTurnIndex).toBe(1);
      expect(result.state!.diceRolled).toBe(true);
      expect(result.state!.pendingAction).toBe('BUY_PROPERTY');
      expect(result.state!.players[1].isBot).toBe(true);
    });

    it('should preserve jail status if player leaves while jailed', () => {
      state.players[1].isJailed = true;
      state.players[1].jailTurns = 2;

      const action: GameAction = {
        actionId: 'act_leave_jailed',
        roomId: 'TR-9999',
        playerId: 'p_guest_1',
        type: 'LEAVE_AND_REPLACE_WITH_BOT',
        expectedVersion: 1
      };

      const result = applyGameAction(state, action, guestActor);
      expect(result.success).toBe(true);

      const seat = result.state!.players.find(p => p.id === 'p_guest_1');
      expect(seat!.isJailed).toBe(true);
      expect(seat!.jailTurns).toBe(2);
    });
  });

  describe('2. TAKE_OVER_REPLACEMENT_BOT (New Player Claims Vacant Slot)', () => {
    beforeEach(() => {
      // First convert guest to replacement bot
      state = leaveAndReplaceWithBot(state, 'p_guest_1');
    });

    it('should allow new player to take over replacement bot slot and restore human control', () => {
      const newPlayerActor: AuthenticatedActor = {
        userId: 'user_ahmet_999',
        participantKey: 'pk_ahmet_999',
        displayName: 'Ahmet',
        isHost: false,
        isGuest: false
      };

      const action: GameAction = {
        actionId: 'act_takeover_1',
        roomId: 'TR-9999',
        playerId: 'p_guest_1',
        type: 'TAKE_OVER_REPLACEMENT_BOT',
        payload: {
          targetPlayerId: 'p_guest_1',
          name: 'Ahmet',
          avatar: '🚀',
          color: '#8B5CF6',
          userId: 'user_ahmet_999',
          participantKey: 'pk_ahmet_999',
          clientId: 'client_ahmet',
          tabId: 'tab_ahmet'
        },
        expectedVersion: 1
      };

      const result = applyGameAction(state, action, newPlayerActor);
      expect(result.success).toBe(true);
      expect(result.state).toBeDefined();

      const seat = result.state!.players.find(p => p.id === 'p_guest_1');
      expect(seat).toBeDefined();
      expect(seat!.isBot).toBe(false);
      expect(seat!.isReplacementBot).toBe(false);
      expect(seat!.botOrigin).toBeUndefined();
      expect(seat!.name).toBe('Ahmet');
      expect(seat!.avatar).toBe('🚀');
      expect(seat!.userId).toBe('user_ahmet_999');
      expect(seat!.participantKey).toBe('pk_ahmet_999');

      // Money, position, properties remain preserved for the slot
      expect(seat!.money).toBe(1200);
      expect(seat!.position).toBe(8);
      expect(result.state!.board[8].ownerId).toBe('p_guest_1');

      // Log confirms takeover
      expect(result.state!.logs.some(l => l.text.includes('Ahmet devam eden oyuna katıldı ve bot koltuğunu devraldı.'))).toBe(true);
    });

    it('should reject taking over a normal host-added bot (HOST_ADDED)', () => {
      const newPlayerActor: AuthenticatedActor = {
        userId: 'user_ahmet_999',
        participantKey: 'pk_ahmet_999',
        displayName: 'Ahmet',
        isHost: false,
        isGuest: false
      };

      const action: GameAction = {
        actionId: 'act_takeover_host_bot',
        roomId: 'TR-9999',
        playerId: 'p_host_bot',
        type: 'TAKE_OVER_REPLACEMENT_BOT',
        payload: {
          targetPlayerId: 'p_host_bot',
          name: 'Ahmet',
          avatar: '🚀'
        },
        expectedVersion: 1
      };

      const result = applyGameAction(state, action, newPlayerActor);
      expect(result.success).toBe(false);
      expect(result.error).toBe('INVALID_ACTION');
    });

    it('should prevent double-claiming of the same slot (concurrency protection)', () => {
      const playerA: AuthenticatedActor = {
        userId: 'user_a',
        participantKey: 'pk_a',
        displayName: 'Player A',
        isHost: false,
        isGuest: true
      };

      const playerB: AuthenticatedActor = {
        userId: 'user_b',
        participantKey: 'pk_b',
        displayName: 'Player B',
        isHost: false,
        isGuest: false
      };

      const actionA: GameAction = {
        actionId: 'act_claim_a',
        roomId: 'TR-9999',
        playerId: 'p_guest_1',
        type: 'TAKE_OVER_REPLACEMENT_BOT',
        payload: { targetPlayerId: 'p_guest_1', name: 'Player A' },
        expectedVersion: 1
      };

      const resA = applyGameAction(state, actionA, playerA);
      expect(resA.success).toBe(true);

      // Now Player B tries to claim the same slot from the updated state
      const actionB: GameAction = {
        actionId: 'act_claim_b',
        roomId: 'TR-9999',
        playerId: 'p_guest_1',
        type: 'TAKE_OVER_REPLACEMENT_BOT',
        payload: { targetPlayerId: 'p_guest_1', name: 'Player B' },
        expectedVersion: 2
      };

      const resB = applyGameAction(resA.state!, actionB, playerB);
      expect(resB.success).toBe(false);
      expect(resB.error).toBe('INVALID_ACTION');
    });

    it('should support Guest to Google and Google to Guest takeover', () => {
      // Guest taking over
      const guestTakeover = takeOverReplacementBot(state, 'p_guest_1', {
        name: 'Misafir_44',
        avatar: '🤠',
        userId: 'guest_uid_777',
        participantKey: 'pk_guest_777'
      });

      const guestSeat = guestTakeover.players.find(p => p.id === 'p_guest_1');
      expect(guestSeat!.name).toBe('Misafir_44');
      expect(guestSeat!.isBot).toBe(false);

      // Now guest leaves again -> becomes bot
      const leftAgain = leaveAndReplaceWithBot(guestTakeover, 'p_guest_1');
      expect(leftAgain.players.find(p => p.id === 'p_guest_1')!.isBot).toBe(true);

      // Google user takes over
      const googleTakeover = takeOverReplacementBot(leftAgain, 'p_guest_1', {
        name: 'Zeynep Kaya',
        avatar: '💎',
        userId: 'google_oauth_sub_888',
        participantKey: 'pk_google_888'
      });

      const googleSeat = googleTakeover.players.find(p => p.id === 'p_guest_1');
      expect(googleSeat!.name).toBe('Zeynep Kaya');
      expect(googleSeat!.userId).toBe('google_oauth_sub_888');
      expect(googleSeat!.isBot).toBe(false);
    });
  });
});
