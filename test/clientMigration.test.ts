import { describe, it, expect, beforeEach } from 'vitest';
import {
  isServerAuthoritativeEnabled,
  createActionId,
  buildAuthHeaders
} from '../src/services/serverGameClient';
import { executeGameActionPipeline } from '../src/server/game/actionPipeline';
import { InMemoryRoomStorage, GameAction } from '../src/server/storage/roomStorage';
import { GameState, Player } from '../src/types/game';
import { INITIAL_BOARD } from '../src/data/boardData';
import { signUserToken, signGuestToken } from '../src/server/auth/tokenUtil';
import { executeForceBuy } from '../src/engine/gameEngine';

describe('🚀 ADIM 4 — CLIENT MIGRATION & FEATURE FLAG VERIFICATION', () => {
  let storage: InMemoryRoomStorage;
  let testRoomId: string;
  let hostPlayer: Player;
  let guestPlayer: Player;
  let testState: GameState;
  let guestToken: string;
  let googleToken: string;

  beforeEach(async () => {
    storage = new InMemoryRoomStorage();
    testRoomId = 'TR-MIGRATION-400';

    hostPlayer = {
      id: 'p_host123',
      name: 'HostAhmet',
      avatar: '🎩',
      color: '#3B82F6',
      money: 1500,
      position: 0,
      isJailed: false,
      jailTurns: 0,
      lapsCompleted: 0,
      firstLapPurchases: 0,
      inGame: true,
      isBot: false,
      isHost: true,
      participantKey: 'host_client:tab1'
    };

    guestPlayer = {
      id: 'p_guest456',
      name: 'GuestMehmet',
      avatar: '🚀',
      color: '#EF4444',
      money: 1500,
      position: 0,
      isJailed: false,
      jailTurns: 0,
      lapsCompleted: 0,
      firstLapPurchases: 0,
      inGame: true,
      isBot: false,
      isHost: false,
      participantKey: 'guest_client:tab2'
    };

    testState = {
      roomId: testRoomId,
      sessionId: 'sess_migration_test',
      gameId: 'game_migration_1',
      version: 1,
      phase: 'PLAYING',
      currentTurnIndex: 0,
      turnTimeLeft: 60,
      players: [hostPlayer, guestPlayer],
      board: JSON.parse(JSON.stringify(INITIAL_BOARD)),
      hostPlayerId: hostPlayer.id,
      dice: [1, 2],
      diceRolled: false,
      doublesCount: 0,
      pendingAction: 'NONE',
      logs: [],
      chatMessages: [],
      transactions: []
    };

    await storage.createRoomState(testRoomId, testState);

    guestToken = signGuestToken({
      guestId: 'guest_p_guest456',
      participantKey: 'guest_client:tab2',
      displayName: 'GuestMehmet'
    });

    googleToken = signUserToken({
      id: 'user_host_123',
      email: 'host@turkishparadise.online',
      displayName: 'HostAhmet',
      googleSub: 'google_sub_host123'
    });
  });

  // --------------------------------------------------------------------------
  // TEST 1: Feature Flag & Rollback Safety
  // --------------------------------------------------------------------------
  describe('1. Feature Flag & Rollback Behavior', () => {
    it('should report false by default when VITE_SERVER_AUTHORITATIVE_GAME is not set to true', () => {
      delete process.env.VITE_SERVER_AUTHORITATIVE_GAME;
      expect(isServerAuthoritativeEnabled()).toBe(false);
    });

    it('should report true when VITE_SERVER_AUTHORITATIVE_GAME is explicitly "true"', () => {
      process.env.VITE_SERVER_AUTHORITATIVE_GAME = 'true';
      expect(isServerAuthoritativeEnabled()).toBe(true);
      delete process.env.VITE_SERVER_AUTHORITATIVE_GAME;
    });

    it('should generate unique action IDs formatted for idempotency and actor attribution', () => {
      const id1 = createActionId('ROLL_DICE', 'p_guest456');
      const id2 = createActionId('ROLL_DICE', 'p_guest456');
      expect(id1).toMatch(/^act_roll_dice_pguest45_\d+_[a-z0-9]+$/);
      expect(id1).not.toBe(id2);
    });
  });

  // --------------------------------------------------------------------------
  // TEST 2: Client Action Dispatching (Intent Only) & Server Execution
  // --------------------------------------------------------------------------
  describe('2. Client Intent-Only Action Execution', () => {
    it('ROLL_DICE: Client sends intent without precomputed dice; server computes dice and position', async () => {
      const action: GameAction = {
        actionId: 'act_roll_01',
        roomId: testRoomId,
        playerId: hostPlayer.id,
        expectedVersion: 1,
        type: 'ROLL_DICE'
      };

      const result = await executeGameActionPipeline(
        action,
        { userId: hostPlayer.id, participantKey: hostPlayer.participantKey, isHost: true },
        { storage }
      );

      expect(result.success).toBe(true);
      expect(result.version).toBe(2);
      expect(result.state?.diceRolled).toBe(true);
      expect(result.state?.dice).toBeDefined();
      expect(Array.isArray(result.state?.dice)).toBe(true);
      expect(result.state?.dice?.[0]).toBeGreaterThanOrEqual(1);
      expect(result.state?.dice?.[0]).toBeLessThanOrEqual(6);
      expect(result.state?.players[0].position).toBeGreaterThan(0);
    });

    it('BUY_PROPERTY: Client sends intent; server validates balance, deducts money, assigns deed', async () => {
      // Setup: host lands on tile 1 (Adana, price 60)
      testState.version = 1;
      testState.diceRolled = true;
      testState.players[0].position = 1;
      testState.pendingAction = 'BUY_PROPERTY';
      await storage.saveRoomStateWithVersion(testRoomId, 1, testState);

      const action: GameAction = {
        actionId: 'act_buy_01',
        roomId: testRoomId,
        playerId: hostPlayer.id,
        expectedVersion: 2,
        type: 'BUY_PROPERTY'
      };

      const result = await executeGameActionPipeline(
        action,
        { userId: hostPlayer.id, participantKey: hostPlayer.participantKey, isHost: true },
        { storage }
      );

      expect(result.success).toBe(true);
      expect(result.version).toBe(3);
      expect(result.state?.board[1].ownerId).toBe(hostPlayer.id);
      expect(result.state?.players[0].money).toBe(1500 - 60);
      expect(result.state?.pendingAction).toBe('NONE');
    });

    it('END_TURN: Progresses turn index cleanly and increments laps if passed GO', async () => {
      testState.version = 2;
      testState.diceRolled = true;
      testState.pendingAction = 'NONE';
      await storage.saveRoomStateWithVersion(testRoomId, 1, testState);

      const action: GameAction = {
        actionId: 'act_end_01',
        roomId: testRoomId,
        playerId: hostPlayer.id,
        expectedVersion: 2,
        type: 'END_TURN'
      };

      const result = await executeGameActionPipeline(
        action,
        { userId: hostPlayer.id, participantKey: hostPlayer.participantKey, isHost: true },
        { storage }
      );

      expect(result.success).toBe(true);
      expect(result.version).toBe(3);
      expect(result.state?.currentTurnIndex).toBe(1); // Turn passed to GuestMehmet
      expect(result.state?.diceRolled).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // TEST 3: Force Buy 2.0x Parity Between Server & Client Engine
  // --------------------------------------------------------------------------
  describe('3. Force Buy (Zorla Satın Alma) 2.0x Parity Check', () => {
    it('Client gameEngine and Server gameEngine calculate identical 2.0x buyout cost and deed transfer', async () => {
      // Give Tile 1 (Adana, price 60) to Guest
      testState.board[1].ownerId = guestPlayer.id;
      testState.board[1].houses = 0;
      testState.version = 1;
      await storage.saveRoomStateWithVersion(testRoomId, 1, testState);

      // 1. Client engine calculation:
      const clientCalculated = executeForceBuy(testState, hostPlayer.id, 1);
      expect(clientCalculated.board[1].ownerId).toBe(hostPlayer.id);
      expect(clientCalculated.players.find(p => p.id === hostPlayer.id)?.money).toBe(1500 - 120); // 2x of 60 = 120
      expect(clientCalculated.players.find(p => p.id === guestPlayer.id)?.money).toBe(1500 + 120);

      // 2. Server engine execution via pipeline:
      const action: GameAction = {
        actionId: 'act_forcebuy_01',
        roomId: testRoomId,
        playerId: hostPlayer.id,
        expectedVersion: 2,
        type: 'FORCE_BUY',
        payload: { tileId: 1 }
      };

      const serverResult = await executeGameActionPipeline(
        action,
        { userId: hostPlayer.id, participantKey: hostPlayer.participantKey, isHost: true },
        { storage }
      );

      expect(serverResult.success).toBe(true);
      expect(serverResult.state?.board[1].ownerId).toBe(hostPlayer.id);
      expect(serverResult.state?.players[0].money).toBe(1500 - 120);
      expect(serverResult.state?.players[1].money).toBe(1500 + 120);
    });
  });

  // --------------------------------------------------------------------------
  // TEST 4: Idempotency & Network Retry Protection
  // --------------------------------------------------------------------------
  describe('4. Idempotency & Network Retry Protection', () => {
    it('Rapid retry of identical actionId returns cached success without re-executing or double charging', async () => {
      const action: GameAction = {
        actionId: 'act_idempotent_test_01',
        roomId: testRoomId,
        playerId: hostPlayer.id,
        expectedVersion: 1,
        type: 'ROLL_DICE'
      };

      const firstCall = await executeGameActionPipeline(
        action,
        { userId: hostPlayer.id, participantKey: hostPlayer.participantKey, isHost: true },
        { storage }
      );

      expect(firstCall.success).toBe(true);
      const versionAfterFirst = firstCall.version;

      // Simulated network retry with identical actionId & payload
      const retryCall = await executeGameActionPipeline(
        action,
        { userId: hostPlayer.id, participantKey: hostPlayer.participantKey, isHost: true },
        { storage }
      );

      expect(retryCall.success).toBe(true);
      expect(retryCall.version).toBe(versionAfterFirst); // Version was NOT incremented again
    });

    it('Reusing actionId with altered payload is rejected with 400 INVALID_ACTION', async () => {
      const action1: GameAction = {
        actionId: 'act_tamper_id_01',
        roomId: testRoomId,
        playerId: hostPlayer.id,
        expectedVersion: 1,
        type: 'CHAT_MESSAGE',
        payload: { text: 'Hello' }
      };

      const res1 = await executeGameActionPipeline(
        action1,
        { userId: hostPlayer.id, participantKey: hostPlayer.participantKey, isHost: true },
        { storage }
      );
      expect(res1.success).toBe(true);

      // Alter payload with same actionId
      const actionTampered: GameAction = {
        actionId: 'act_tamper_id_01',
        roomId: testRoomId,
        playerId: hostPlayer.id,
        expectedVersion: res1.version || 2,
        type: 'CHAT_MESSAGE',
        payload: { text: 'Tampered different payload' }
      };

      const res2 = await executeGameActionPipeline(
        actionTampered,
        { userId: hostPlayer.id, participantKey: hostPlayer.participantKey, isHost: true },
        { storage }
      );

      expect(res2.success).toBe(false);
      expect(res2.error).toBe('INVALID_ACTION');
    });
  });

  // --------------------------------------------------------------------------
  // TEST 5: VERSION_CONFLICT Safety (No Auto-Replay of Economic Actions)
  // --------------------------------------------------------------------------
  describe('5. Version Conflict Handling', () => {
    it('Returns VERSION_CONFLICT when client sends stale expectedVersion without mutating state', async () => {
      // Setup state so action itself is valid
      testState.version = 1;
      testState.diceRolled = true;
      testState.players[0].position = 1;
      testState.pendingAction = 'BUY_PROPERTY';
      await storage.saveRoomStateWithVersion(testRoomId, 1, testState);

      const staleAction: GameAction = {
        actionId: 'act_stale_01',
        roomId: testRoomId,
        playerId: hostPlayer.id,
        expectedVersion: 999, // Stale / mismatched version
        type: 'BUY_PROPERTY'
      };

      const result = await executeGameActionPipeline(
        staleAction,
        { userId: hostPlayer.id, participantKey: hostPlayer.participantKey, isHost: true },
        { storage }
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('VERSION_CONFLICT');
      expect(result.currentVersion).toBe(2);

      // Verify canonical state was untouched
      const canonical = await storage.getRoomState(testRoomId);
      expect(canonical?.version).toBe(2);
    });
  });

  // --------------------------------------------------------------------------
  // TEST 6: Anti-Cheat & Malicious Client Tampering Rejection
  // --------------------------------------------------------------------------
  describe('6. Anti-Cheat Client Tamper Rejection', () => {
    it('Rogue player trying to roll dice or buy property out of turn is rejected with NOT_YOUR_TURN', async () => {
      // Turn is index 0 (Host), Guest tries to roll
      const rogueAction: GameAction = {
        actionId: 'act_rogue_01',
        roomId: testRoomId,
        playerId: guestPlayer.id,
        expectedVersion: 1,
        type: 'ROLL_DICE'
      };

      const result = await executeGameActionPipeline(
        rogueAction,
        { userId: guestPlayer.id, participantKey: guestPlayer.participantKey, isGuest: true },
        { storage }
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('NOT_YOUR_TURN');
    });

    it('Rogue actor claiming to be another player is rejected with UNAUTHORIZED_PLAYER', async () => {
      const spoofAction: GameAction = {
        actionId: 'act_spoof_01',
        roomId: testRoomId,
        playerId: hostPlayer.id, // Claiming to act as Host
        expectedVersion: 1,
        type: 'ROLL_DICE'
      };

      // Authenticated actor is actually Guest
      const result = await executeGameActionPipeline(
        spoofAction,
        { userId: 'intruder_guest_id', participantKey: 'intruder_client:tab9', isGuest: true },
        { storage }
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('UNAUTHORIZED_PLAYER');
    });

    it('Cross-player bankruptcy attack (Guest trying to bankrupt Host) is rejected', async () => {
      const rogueBankrupt: GameAction = {
        actionId: 'act_bankrupt_attack_01',
        roomId: testRoomId,
        playerId: hostPlayer.id,
        expectedVersion: 1,
        type: 'BANKRUPTCY',
        payload: { playerId: hostPlayer.id }
      };

      const result = await executeGameActionPipeline(
        rogueBankrupt,
        { userId: guestPlayer.id, participantKey: guestPlayer.participantKey, isGuest: true },
        { storage }
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('UNAUTHORIZED_PLAYER');

      const canonical = await storage.getRoomState(testRoomId);
      expect(canonical?.players.find(p => p.id === hostPlayer.id)?.inGame).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // TEST 8: Chat Unread Notification Badge Logic
  // --------------------------------------------------------------------------
  describe('8. Chat Unread Notification Badge Logic', () => {
    it('should increment unread count only for other players when chat is closed and reset on open', () => {
      const myId = 'p_mobile_me';
      let unreadCount = 0;
      let isChatOpen = false;
      let prevCount = 0;

      const simulateIncomingMessages = (allMessages: Array<{ id: string; senderId: string; text: string; isSystem?: boolean }>) => {
        const currentLen = allMessages.length;
        if (currentLen > prevCount) {
          if (!isChatOpen) {
            const newMessages = allMessages.slice(prevCount);
            const unreadFromOthers = newMessages.filter(
              (m) => m && m.senderId && m.senderId !== myId && !m.isSystem
            ).length;
            unreadCount += unreadFromOthers;
          }
        } else if (isChatOpen) {
          unreadCount = 0;
        }
        prevCount = currentLen;
      };

      const messages: Array<{ id: string; senderId: string; text: string; isSystem?: boolean }> = [];

      // 1. Other player sends 1st message -> unread = 1
      messages.push({ id: 'msg1', senderId: 'p_pc_other', text: 'Selam!' });
      simulateIncomingMessages(messages);
      expect(unreadCount).toBe(1);

      // 2. Other player sends 2nd message -> unread = 2
      messages.push({ id: 'msg2', senderId: 'p_pc_other', text: 'Zar atacak mısın?' });
      simulateIncomingMessages(messages);
      expect(unreadCount).toBe(2);

      // 3. User sends own message -> unread stays 2 (does not increment)
      messages.push({ id: 'msg3', senderId: myId, text: 'Geldim!' });
      simulateIncomingMessages(messages);
      expect(unreadCount).toBe(2);

      // 4. User opens chat -> unread resets to 0
      isChatOpen = true;
      unreadCount = 0;
      simulateIncomingMessages(messages);
      expect(unreadCount).toBe(0);

      // 5. Incoming message while chat is open -> unread stays 0
      messages.push({ id: 'msg4', senderId: 'p_pc_other', text: 'Tamamdır' });
      simulateIncomingMessages(messages);
      expect(unreadCount).toBe(0);

      // 6. User closes chat and new message arrives -> unread = 1
      isChatOpen = false;
      messages.push({ id: 'msg5', senderId: 'p_pc_other', text: 'Hadi başlayalım' });
      simulateIncomingMessages(messages);
      expect(unreadCount).toBe(1);
    });
  });

  // --------------------------------------------------------------------------
  // TEST 9: Host Bankruptcy & Disconnect Tab Close Game Continuity Test
  // --------------------------------------------------------------------------
  describe('9. Host Bankruptcy & Disconnect Tab Close Game Continuity', () => {
    it('should seamlessly continue gameplay for remaining players when original host bankrupts and closes tab', async () => {
      const pC: Player = {
        id: 'p_guest789',
        name: 'GuestCan',
        avatar: '🚗',
        color: '#10B981',
        money: 1500,
        position: 0,
        isJailed: false,
        jailTurns: 0,
        lapsCompleted: 0,
        firstLapPurchases: 0,
        inGame: true,
        isBot: false,
        isHost: false,
        participantKey: 'guest_can:tab3'
      };

      const botP: Player = {
        id: 'p_bot_helper',
        name: 'Zeki Bot 🤖',
        avatar: '🤖',
        color: '#F59E0B',
        money: 1500,
        position: 0,
        isJailed: false,
        jailTurns: 0,
        lapsCompleted: 0,
        firstLapPurchases: 0,
        inGame: true,
        isBot: true,
        isHost: false
      };

      const threePlayerState: GameState = {
        roomId: 'TR-NO-FREEZE-999',
        sessionId: 'sess_freeze_test',
        gameId: 'game_freeze_1',
        version: 1,
        phase: 'PLAYING',
        currentTurnIndex: 0,
        turnTimeLeft: 60,
        players: [hostPlayer, guestPlayer, pC, botP],
        board: JSON.parse(JSON.stringify(INITIAL_BOARD)),
        hostPlayerId: hostPlayer.id,
        dice: [1, 2],
        diceRolled: false,
        doublesCount: 0,
        pendingAction: 'NONE',
        logs: [],
        chatMessages: [],
        transactions: []
      };

      await storage.createRoomState('TR-NO-FREEZE-999', threePlayerState);

      const actorA: AuthenticatedActor = {
        userId: hostPlayer.id,
        participantKey: hostPlayer.participantKey,
        isGuest: true
      };

      const actorB: AuthenticatedActor = {
        userId: guestPlayer.id,
        participantKey: guestPlayer.participantKey,
        isGuest: true
      };

      const actorC: AuthenticatedActor = {
        userId: pC.id,
        participantKey: pC.participantKey,
        isGuest: true
      };

      // 1. Host A goes bankrupt
      const bkpRes = await executeGameActionPipeline(
        {
          actionId: 'act_bkp_host',
          roomId: 'TR-NO-FREEZE-999',
          playerId: hostPlayer.id,
          expectedVersion: 1,
          type: 'BANKRUPTCY'
        },
        actorA,
        { storage }
      );

      expect(bkpRes.success).toBe(true);
      if (!bkpRes.success) return;

      // 2. Verify Host is migrated to Player B (next active human)
      expect(bkpRes.state.hostPlayerId).toBe(guestPlayer.id);
      expect(bkpRes.state.players.find(p => p.id === guestPlayer.id)?.isHost).toBe(true);
      expect(bkpRes.state.players.find(p => p.id === hostPlayer.id)?.inGame).toBe(false);
      expect(bkpRes.state.players.find(p => p.id === hostPlayer.id)?.isHost).toBe(false);

      // 3. Player A closes browser tab completely.
      // Player B (now host) rolls dice
      const rollResB = await executeGameActionPipeline(
        {
          actionId: 'act_roll_b',
          roomId: 'TR-NO-FREEZE-999',
          playerId: guestPlayer.id,
          expectedVersion: bkpRes.state.version,
          type: 'ROLL_DICE'
        },
        actorB,
        { storage, rng: () => [1, 2] }
      );
      expect(rollResB.success).toBe(true);
      if (!rollResB.success) return;

      // If pendingAction is BUY_PROPERTY, pass it
      let currentV = rollResB.state.version;
      if (rollResB.state.pendingAction === 'BUY_PROPERTY') {
        const passRes = await executeGameActionPipeline(
          {
            actionId: 'act_pass_b',
            roomId: 'TR-NO-FREEZE-999',
            playerId: guestPlayer.id,
            expectedVersion: currentV,
            type: 'PASS_PROPERTY'
          },
          actorB,
          { storage }
        );
        expect(passRes.success).toBe(true);
        if (!passRes.success) return;
        currentV = passRes.state.version;
      }

      // Player B ends turn
      const endTurnResB = await executeGameActionPipeline(
        {
          actionId: 'act_end_b',
          roomId: 'TR-NO-FREEZE-999',
          playerId: guestPlayer.id,
          expectedVersion: currentV,
          type: 'END_TURN'
        },
        actorB,
        { storage }
      );
      expect(endTurnResB.success).toBe(true);
      if (!endTurnResB.success) return;

      // Turn is now on Player C
      expect(endTurnResB.state.players[endTurnResB.state.currentTurnIndex].id).toBe(pC.id);

      // Player C rolls dice
      const rollResC = await executeGameActionPipeline(
        {
          actionId: 'act_roll_c',
          roomId: 'TR-NO-FREEZE-999',
          playerId: pC.id,
          expectedVersion: endTurnResB.state.version,
          type: 'ROLL_DICE'
        },
        actorC,
        { storage, rng: () => [1, 2] }
      );
      expect(rollResC.success).toBe(true);
      if (!rollResC.success) return;

      // Player B (new host) can also advance bot actions without 403 error
      const botActionRes = await executeGameActionPipeline(
        {
          actionId: 'act_bot_roll',
          roomId: 'TR-NO-FREEZE-999',
          playerId: botP.id,
          expectedVersion: 999, // Intentional mismatch test or direct state check
          type: 'ROLL_DICE'
        },
        actorB,
        { storage }
      );
      // Fails only on version / turn, NOT UNAUTHORIZED_PLAYER
      if (!botActionRes.success) {
        expect(botActionRes.error).not.toBe('UNAUTHORIZED_PLAYER');
      }

      // Verify canonical state in storage is healthy
      const finalState = await storage.getRoomState('TR-NO-FREEZE-999');
      expect(finalState?.phase).toBe('PLAYING');
      expect(finalState?.hostPlayerId).toBe(guestPlayer.id);
    });
  });
});
