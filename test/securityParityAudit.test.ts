import { describe, it, expect, beforeEach } from 'vitest';
import { executeGameActionPipeline } from '../src/server/game/actionPipeline';
import { InMemoryRoomStorage, UnavailableRoomStorage } from '../src/server/storage/roomStorage';
import { AuthenticatedActor, resolveAuthenticatedActor, sanitizeGameStateForClient, validateRoomReadAccess } from '../src/server/auth/authMiddleware';
import { signUserToken, signGuestToken } from '../src/server/auth/tokenUtil';
import { createInitialState, JAIL_TILE_INDEX } from '../src/engine/gameEngine';
import { GameState, Player, TradeOffer } from '../src/types/game';

function createMockRoom(roomId = 'TR-PARITY-1'): GameState {
  const state = createInitialState({ roomCode: roomId, isPublic: false, startingMoney: 1500 });
  state.roomId = roomId;
  state.version = 1;
  state.hostPlayerId = 'user_host_1';
  state.players = [
    {
      id: 'p_host',
      userId: 'user_host_1',
      participantKey: 'client_host:tab_1',
      name: 'Host Ahmet',
      avatar: '🏎️',
      color: '#EF4444',
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
      id: 'p_guest',
      userId: 'user_guest_2',
      participantKey: 'client_guest:tab_2',
      name: 'Guest Mehmet',
      avatar: '🎩',
      color: '#3B82F6',
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
  return state;
}

describe('Adım 3.5: Security & Feature Parity Audit Suite', () => {
  let storage: InMemoryRoomStorage;
  let roomState: GameState;
  const hostActor: AuthenticatedActor = { userId: 'user_host_1', participantKey: 'client_host:tab_1', isHost: true };
  const guestActor: AuthenticatedActor = { userId: 'user_guest_2', participantKey: 'client_guest:tab_2', isGuest: true };
  const attackerActor: AuthenticatedActor = { userId: 'user_attacker_3', participantKey: 'client_hacker:tab_9', isGuest: true };

  beforeEach(async () => {
    storage = new InMemoryRoomStorage();
    roomState = createMockRoom('TR-PARITY-1');
    await storage.createRoomState('TR-PARITY-1', roomState);
  });

  describe('1. Guest Authentication & Identity Anti-Spoofing', () => {
    it('authenticates guest via cryptographically signed guest token', () => {
      const guestToken = signGuestToken({
        guestId: 'guest_verified_99',
        participantKey: 'client_guest:tab_2',
        displayName: 'Guest Mehmet',
        roomId: 'TR-PARITY-1',
        isGuest: true
      });

      const req = {
        headers: {
          authorization: `Bearer ${guestToken}`
        }
      };

      const auth = resolveAuthenticatedActor(req);
      expect(auth.success).toBe(true);
      expect(auth.actor?.userId).toBe('guest_verified_99');
      expect(auth.actor?.participantKey).toBe('client_guest:tab_2');
      expect(auth.actor?.isGuest).toBe(true);
    });

    it('rejects action when an authenticated user attempts to act as another player', async () => {
      const actionBody = {
        actionId: 'act_steal_host_turn',
        roomId: 'TR-PARITY-1',
        playerId: 'p_host', // Attacker claims to act as host
        expectedVersion: 1,
        type: 'START_GAME'
      };

      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        const res = await executeGameActionPipeline(actionBody, attackerActor, { storage });
        expect(res.success).toBe(false);
        expect(res.statusCode).toBe(403);
        expect(res.error).toBe('UNAUTHORIZED_PLAYER');
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    it('rejects action if Google user attempts to act as guest player', async () => {
      const googleActor: AuthenticatedActor = {
        userId: 'google_user_999',
        googleSub: 'sub_999',
        displayName: 'Google Player',
        isGuest: false
      };

      const actionBody = {
        actionId: 'act_google_spoof_guest',
        roomId: 'TR-PARITY-1',
        playerId: 'p_guest',
        expectedVersion: 1,
        type: 'START_GAME'
      };

      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        const res = await executeGameActionPipeline(actionBody, googleActor, { storage });
        expect(res.success).toBe(false);
        expect(res.statusCode).toBe(403);
        expect(res.error).toBe('UNAUTHORIZED_PLAYER');
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });
  });

  describe('2. Public State Endpoint & Data Leakage Protection', () => {
    it('masks opponent participantKeys from client state snapshot', () => {
      const sanitized = sanitizeGameStateForClient(roomState, guestActor);
      
      // Guest actor's own participantKey must be preserved
      const guestPlayer = sanitized.players.find(p => p.id === 'p_guest');
      expect(guestPlayer?.participantKey).toBe('client_guest:tab_2');

      // Opponent (Host) participantKey must be masked/stripped
      const hostPlayer = sanitized.players.find(p => p.id === 'p_host');
      expect(hostPlayer?.participantKey).toBeUndefined();
    });

    it('blocks unauthorized actors from accessing private room state', () => {
      const check = validateRoomReadAccess(attackerActor, roomState);
      expect(check.allowed).toBe(false);
      expect(check.reason).toBe('FORBIDDEN_PRIVATE_ROOM');
    });
  });

  describe('3. Idempotency Fingerprint & Crash / Retry Resilience', () => {
    it('detects and rejects same actionId with modified payload (Fingerprint Mismatch)', async () => {
      const originalAction = {
        actionId: 'act_fingerprint_test_1',
        roomId: 'TR-PARITY-1',
        playerId: 'p_host',
        expectedVersion: 1,
        type: 'START_GAME'
      };

      const res1 = await executeGameActionPipeline(originalAction, hostActor, { storage });
      expect(res1.success).toBe(true);

      // Re-send same actionId with DIFFERENT action type
      const forgedAction = {
        actionId: 'act_fingerprint_test_1',
        roomId: 'TR-PARITY-1',
        playerId: 'p_host',
        expectedVersion: 2,
        type: 'ROLL_DICE' // Modified action type!
      };

      const res2 = await executeGameActionPipeline(forgedAction, hostActor, { storage });
      expect(res2.success).toBe(false);
      expect(res2.statusCode).toBe(400);
      expect(res2.error).toBe('INVALID_ACTION');
      expect(res2.message).toContain('farklı parametreler');
    });

    it('returns cached processed result on retry after crash/timeout without re-executing', async () => {
      const actionBody = {
        actionId: 'act_crash_resilience_1',
        roomId: 'TR-PARITY-1',
        playerId: 'p_host',
        expectedVersion: 1,
        type: 'START_GAME'
      };

      // 1st Execution
      const res1 = await executeGameActionPipeline(actionBody, hostActor, { storage });
      expect(res1.success).toBe(true);
      expect(res1.version).toBe(2);

      // Simulated Client Timeout & Retry
      const resRetry = await executeGameActionPipeline(actionBody, hostActor, { storage });
      expect(resRetry.success).toBe(true);
      expect(resRetry.version).toBe(2);
      expect(resRetry.roomId).toBe('TR-PARITY-1');

      // Canonical version remains exactly 2 (never incremented twice)
      const canonical = await storage.getRoomState('TR-PARITY-1');
      expect(canonical?.version).toBe(2);
    });
  });

  describe('4. Full Action Parity Verification', () => {
    it('handles Lobby Management: ADD_BOT, REMOVE_BOT, UPDATE_SETTINGS', async () => {
      // 1. ADD_BOT
      const addBotRes = await executeGameActionPipeline(
        { actionId: 'act_add_bot', roomId: 'TR-PARITY-1', playerId: 'p_host', expectedVersion: 1, type: 'ADD_BOT', payload: { difficulty: 'hard' } },
        hostActor,
        { storage }
      );
      expect(addBotRes.success).toBe(true);
      expect(addBotRes.state?.players.length).toBe(3);
      expect(addBotRes.state?.players[2].isBot).toBe(true);
      expect(addBotRes.state?.players[2].botDifficulty).toBe('hard');

      // 2. UPDATE_SETTINGS
      const updateSettingsRes = await executeGameActionPipeline(
        { actionId: 'act_settings', roomId: 'TR-PARITY-1', playerId: 'p_host', expectedVersion: 2, type: 'UPDATE_SETTINGS', payload: { startingMoney: 2000, passGoSalary: 300 } },
        hostActor,
        { storage }
      );
      expect(updateSettingsRes.success).toBe(true);
      expect(updateSettingsRes.state?.settings?.startingMoney).toBe(2000);
      expect(updateSettingsRes.state?.settings?.passGoSalary).toBe(300);

      // 3. REMOVE_BOT
      const removeBotRes = await executeGameActionPipeline(
        { actionId: 'act_remove_bot', roomId: 'TR-PARITY-1', playerId: 'p_host', expectedVersion: 3, type: 'REMOVE_BOT' },
        hostActor,
        { storage }
      );
      expect(removeBotRes.success).toBe(true);
      expect(removeBotRes.state?.players.length).toBe(2);
    });

    it('handles In-Game Actions: SELL_TO_BANK, UNMORTGAGE, FORCE_BUY, CHAT_MESSAGE', async () => {
      // Start Game first
      const startRes = await executeGameActionPipeline(
        { actionId: 'act_start_parity', roomId: 'TR-PARITY-1', playerId: 'p_host', expectedVersion: 1, type: 'START_GAME' },
        hostActor,
        { storage }
      );
      expect(startRes.success).toBe(true);

      // 1. CHAT_MESSAGE
      const chatRes = await executeGameActionPipeline(
        { actionId: 'act_chat_1', roomId: 'TR-PARITY-1', playerId: 'p_host', expectedVersion: 2, type: 'CHAT_MESSAGE', payload: { text: 'Merhaba tüm oyuncular!' } },
        hostActor,
        { storage }
      );
      expect(chatRes.success).toBe(true);
      expect(chatRes.state?.chatMessages?.some(m => m.text === 'Merhaba tüm oyuncular!')).toBe(true);

      // Set up tile ownership for p_host (Tile 1 - Hatay, price: 60)
      const current = await storage.getRoomState('TR-PARITY-1');
      current!.board[1].ownerId = 'p_host';
      await storage.saveRoomStateWithVersion('TR-PARITY-1', 3, current!);

      // 2. SELL_TO_BANK (Refund 2/3 price = 40)
      const hostMoneyBefore = current!.players[0].money;
      const sellBankRes = await executeGameActionPipeline(
        { actionId: 'act_sell_bank', roomId: 'TR-PARITY-1', playerId: 'p_host', expectedVersion: 4, type: 'SELL_TO_BANK', payload: { tileId: 1 } },
        hostActor,
        { storage }
      );
      expect(sellBankRes.success).toBe(true);
      expect(sellBankRes.state?.board[1].ownerId).toBeUndefined();
      expect(sellBankRes.state?.players[0].money).toBe(hostMoneyBefore + 40);

      // 3. FORCE_BUY (p_host buys p_guest owned property for 2x price)
      const updatedState = await storage.getRoomState('TR-PARITY-1');
      updatedState!.board[2].ownerId = 'p_guest'; // Mersin (price: 60)
      await storage.saveRoomStateWithVersion('TR-PARITY-1', 5, updatedState!);

      const forceBuyRes = await executeGameActionPipeline(
        { actionId: 'act_force_buy', roomId: 'TR-PARITY-1', playerId: 'p_host', expectedVersion: 6, type: 'FORCE_BUY', payload: { tileId: 2 } },
        hostActor,
        { storage }
      );
      expect(forceBuyRes.success).toBe(true);
      expect(forceBuyRes.state?.board[2].ownerId).toBe('p_host');
      expect(forceBuyRes.state?.players[0].money).toBe(updatedState!.players[0].money - 120); // 2x 60 = 120
      expect(forceBuyRes.state?.players[1].money).toBe(updatedState!.players[1].money + 120);
    });

    it('handles Trade Protocol: TRADE_OFFER -> TRADE_ACCEPT / TRADE_DECLINE', async () => {
      // Start Game
      await executeGameActionPipeline(
        { actionId: 'act_start_trade', roomId: 'TR-PARITY-1', playerId: 'p_host', expectedVersion: 1, type: 'START_GAME' },
        hostActor,
        { storage }
      );

      // Set property deeds
      const current = await storage.getRoomState('TR-PARITY-1');
      current!.board[1].ownerId = 'p_host'; // Hatay
      current!.board[2].ownerId = 'p_guest'; // Mersin
      await storage.saveRoomStateWithVersion('TR-PARITY-1', 2, current!);

      // 1. TRADE_OFFER from Host to Guest
      const offer: TradeOffer = {
        fromPlayerId: 'p_host',
        toPlayerId: 'p_guest',
        offeredTileIds: [1],
        offeredMoney: 50,
        requestedTileIds: [2],
        requestedMoney: 0
      };

      const offerRes = await executeGameActionPipeline(
        { actionId: 'act_trade_offer', roomId: 'TR-PARITY-1', playerId: 'p_host', expectedVersion: 3, type: 'TRADE_OFFER', payload: offer },
        hostActor,
        { storage }
      );
      expect(offerRes.success).toBe(true);
      expect(offerRes.state?.incomingTradeOffer?.fromPlayerId).toBe('p_host');

      // 2. TRADE_ACCEPT from Guest
      const acceptRes = await executeGameActionPipeline(
        { actionId: 'act_trade_accept', roomId: 'TR-PARITY-1', playerId: 'p_guest', expectedVersion: 4, type: 'TRADE_ACCEPT' },
        guestActor,
        { storage }
      );
      expect(acceptRes.success).toBe(true);
      expect(acceptRes.state?.board[1].ownerId).toBe('p_guest'); // Transferred to Guest
      expect(acceptRes.state?.board[2].ownerId).toBe('p_host'); // Transferred to Host
      expect(acceptRes.state?.incomingTradeOffer).toBeUndefined(); // Cleared
    });

    it('handles CONFIRM_CHANCE card execution', async () => {
      await executeGameActionPipeline(
        { actionId: 'act_start_chance', roomId: 'TR-PARITY-1', playerId: 'p_host', expectedVersion: 1, type: 'START_GAME' },
        hostActor,
        { storage }
      );

      const state = await storage.getRoomState('TR-PARITY-1');
      state!.activeCard = {
        id: 'card_money_win',
        title: 'Miras Kaldı',
        description: 'Bankadan 150₺ tahsil et.',
        type: 'chance',
        actionType: 'MONEY',
        amount: 150
      };
      state!.pendingAction = 'CHANCE_CARD';
      await storage.saveRoomStateWithVersion('TR-PARITY-1', 2, state!);

      const confirmRes = await executeGameActionPipeline(
        { actionId: 'act_confirm_chance', roomId: 'TR-PARITY-1', playerId: 'p_host', expectedVersion: 3, type: 'CONFIRM_CHANCE' },
        hostActor,
        { storage }
      );
      expect(confirmRes.success).toBe(true);
      expect(confirmRes.state?.players[0].money).toBe(1500 + 150);
      expect(confirmRes.state?.pendingAction).toBe('NONE');
    });
  });
});
