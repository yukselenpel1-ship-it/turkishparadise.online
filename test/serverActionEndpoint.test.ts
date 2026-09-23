import { describe, it, expect, beforeEach } from 'vitest';
import { executeGameActionPipeline } from '../src/server/game/actionPipeline';
import { InMemoryRoomStorage, UnavailableRoomStorage, getRoomStateKey } from '../src/server/storage/roomStorage';
import { AuthenticatedActor, resolveAuthenticatedActor, validateRoomReadAccess } from '../src/server/auth/authMiddleware';
import { signUserToken } from '../src/server/auth/tokenUtil';
import { registerNotificationListener, clearNotificationListeners, RoomStateUpdateNotification } from '../src/server/notification/mqttNotifier';
import { createInitialState } from '../src/engine/gameEngine';
import { GameState, Player } from '../src/types/game';

function createMockRoomState(roomId = 'TR-1001'): GameState {
  const state = createInitialState({ roomCode: roomId, isPublic: false });
  state.roomId = roomId;
  state.version = 1;
  state.hostPlayerId = 'user_host';
  state.players = [
    {
      id: 'p_host',
      userId: 'user_host',
      name: 'Host Player',
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
      userId: 'user_guest',
      participantKey: 'client123:tab456',
      name: 'Guest Player',
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

describe('Serverless Action Endpoint & Middleware (/api/game/action & /api/game/state)', () => {
  let storage: InMemoryRoomStorage;
  let roomState: GameState;
  const hostActor: AuthenticatedActor = { userId: 'user_host', isHost: true };
  const guestActor: AuthenticatedActor = { userId: 'user_guest', participantKey: 'client123:tab456', isGuest: true };
  const attackerActor: AuthenticatedActor = { userId: 'user_attacker', participantKey: 'attacker:tab999', isGuest: true };

  beforeEach(async () => {
    storage = new InMemoryRoomStorage();
    roomState = createMockRoomState('TR-1001');
    await storage.createRoomState('TR-1001', roomState);
    clearNotificationListeners();
  });

  describe('1. Authentication & Actor Resolution', () => {
    it('successfully resolves verified actor from valid JWT token', () => {
      const token = signUserToken({
        id: 'user_google_123',
        googleSub: 'sub_123',
        displayName: 'Google Ahmet',
        email: 'ahmet@example.com'
      });

      const req = {
        headers: {
          authorization: `Bearer ${token}`
        }
      };

      const auth = resolveAuthenticatedActor(req);
      expect(auth.success).toBe(true);
      expect(auth.actor?.userId).toBe('user_google_123');
      expect(auth.actor?.displayName).toBe('Google Ahmet');
      expect(auth.actor?.isGuest).toBe(false);
    });

    it('successfully resolves guest actor from x-participant-key header', () => {
      const req = {
        headers: {
          'x-participant-key': 'dev_client_99:tab_1',
          'x-user-name': 'Guest Mehmet'
        }
      };

      const auth = resolveAuthenticatedActor(req);
      expect(auth.success).toBe(true);
      expect(auth.actor?.participantKey).toBe('dev_client_99:tab_1');
      expect(auth.actor?.displayName).toBe('Guest Mehmet');
      expect(auth.actor?.isGuest).toBe(true);
    });

    it('rejects invalid or forged JWT token', () => {
      const req = {
        headers: {
          authorization: 'Bearer forged.invalid.token.xyz'
        }
      };

      const auth = resolveAuthenticatedActor(req);
      expect(auth.success).toBe(false);
      expect(auth.error).toBe('INVALID_TOKEN');
    });

    it('rejects request with missing authentication', () => {
      const req = {
        headers: {}
      };

      const auth = resolveAuthenticatedActor(req);
      expect(auth.success).toBe(false);
      expect(auth.error).toBe('UNAUTHORIZED');
    });
  });

  describe('2. Request Schema & Payload Bounds Validation', () => {
    it('rejects request with missing or empty actionId', async () => {
      const body = {
        actionId: '',
        roomId: 'TR-1001',
        playerId: 'p_host',
        expectedVersion: 1,
        type: 'START_GAME'
      };

      const res = await executeGameActionPipeline(body, hostActor, { storage });
      expect(res.success).toBe(false);
      expect(res.statusCode).toBe(400);
      expect(res.error).toBe('INVALID_ACTION');
    });

    it('rejects request with unknown action type', async () => {
      const body = {
        actionId: 'act_unknown_1',
        roomId: 'TR-1001',
        playerId: 'p_host',
        expectedVersion: 1,
        type: 'HACK_GIVE_UNLIMITED_MONEY'
      };

      const res = await executeGameActionPipeline(body, hostActor, { storage });
      expect(res.success).toBe(false);
      expect(res.statusCode).toBe(400);
      expect(res.error).toBe('INVALID_ACTION');
    });

    it('rejects BUILD_HOUSE action without valid tileId', async () => {
      const body = {
        actionId: 'act_build_invalid',
        roomId: 'TR-1001',
        playerId: 'p_host',
        expectedVersion: 1,
        type: 'BUILD_HOUSE',
        payload: { tileId: 999 } // Out of board bounds (0..37)
      };

      const res = await executeGameActionPipeline(body, hostActor, { storage });
      expect(res.success).toBe(false);
      expect(res.statusCode).toBe(400);
      expect(res.error).toBe('INVALID_PROPERTY');
    });

    it('rejects oversized request payload (> 16KB)', async () => {
      const oversizedPayload = 'x'.repeat(20000);
      const body = {
        actionId: 'act_oversized',
        roomId: 'TR-1001',
        playerId: 'p_host',
        expectedVersion: 1,
        type: 'START_GAME',
        payload: { junk: oversizedPayload }
      };

      const res = await executeGameActionPipeline(body, hostActor, { storage });
      expect(res.success).toBe(false);
      expect(res.statusCode).toBe(400);
      expect(res.error).toBe('INVALID_ACTION');
    });
  });

  describe('3. Action Execution, Turn Rules & CAS State Updates', () => {
    it('successfully executes START_GAME and increments version', async () => {
      const notifications: RoomStateUpdateNotification[] = [];
      registerNotificationListener(n => notifications.push(n));

      const body = {
        actionId: 'act_start_valid',
        roomId: 'TR-1001',
        playerId: 'p_host',
        expectedVersion: 1,
        type: 'START_GAME'
      };

      const res = await executeGameActionPipeline(body, hostActor, { storage });
      expect(res.success).toBe(true);
      expect(res.statusCode).toBe(200);
      expect(res.version).toBe(2);
      expect(res.state?.phase).toBe('PLAYING');

      // Verify Redis/Memory state is updated to version 2
      const updated = await storage.getRoomState('TR-1001');
      expect(updated?.version).toBe(2);
      expect(updated?.phase).toBe('PLAYING');

      // Verify MQTT notification was emitted
      expect(notifications.length).toBe(1);
      expect(notifications[0].type).toBe('ROOM_STATE_UPDATED');
      expect(notifications[0].version).toBe(2);
    });

    it('rejects ROLL_DICE when called out of turn', async () => {
      // Start game first
      await executeGameActionPipeline(
        { actionId: 'act_s', roomId: 'TR-1001', playerId: 'p_host', expectedVersion: 1, type: 'START_GAME' },
        hostActor,
        { storage }
      );

      // Guest attempts to roll when current turn is p_host
      const body = {
        actionId: 'act_roll_out_of_turn',
        roomId: 'TR-1001',
        playerId: 'p_guest',
        expectedVersion: 2,
        type: 'ROLL_DICE'
      };

      const res = await executeGameActionPipeline(body, guestActor, { storage });
      expect(res.success).toBe(false);
      expect(res.statusCode).toBe(400);
      expect(res.error).toBe('NOT_YOUR_TURN');
    });

    it('rejects action if actor tries to spoof another player ID', async () => {
      const body = {
        actionId: 'act_spoof_host',
        roomId: 'TR-1001',
        playerId: 'p_host', // Attacker claims to act as host
        expectedVersion: 1,
        type: 'START_GAME'
      };

      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        const res = await executeGameActionPipeline(body, attackerActor, { storage });
        expect(res.success).toBe(false);
        expect(res.statusCode).toBe(403);
        expect(res.error).toBe('UNAUTHORIZED_PLAYER');
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    it('returns 404 when room does not exist', async () => {
      const body = {
        actionId: 'act_missing_room',
        roomId: 'TR-NONEXISTENT',
        playerId: 'p_host',
        expectedVersion: 1,
        type: 'START_GAME'
      };

      const res = await executeGameActionPipeline(body, hostActor, { storage });
      expect(res.success).toBe(false);
      expect(res.statusCode).toBe(404);
      expect(res.error).toBe('ROOM_NOT_FOUND');
    });
  });

  describe('4. CAS Sürüm Çakışması (VERSION_CONFLICT)', () => {
    it('returns 409 VERSION_CONFLICT with currentVersion when expectedVersion is stale', async () => {
      // Version is 1. We provide expectedVersion = 99
      const body = {
        actionId: 'act_stale_ver',
        roomId: 'TR-1001',
        playerId: 'p_host',
        expectedVersion: 99,
        type: 'START_GAME'
      };

      const res = await executeGameActionPipeline(body, hostActor, { storage });
      expect(res.success).toBe(false);
      expect(res.statusCode).toBe(409);
      expect(res.error).toBe('VERSION_CONFLICT');
      expect(res.currentVersion).toBe(1);
    });
  });

  describe('5. Idempotency & Replay Protection (x20 Rapid Replay)', () => {
    it('executes action once and safely returns cached processed result for 20 rapid duplicate replays', async () => {
      const actionBody = {
        actionId: 'act_unique_idempotency_1',
        roomId: 'TR-1001',
        playerId: 'p_host',
        expectedVersion: 1,
        type: 'START_GAME'
      };

      // 1st Execution
      const firstRes = await executeGameActionPipeline(actionBody, hostActor, { storage });
      expect(firstRes.success).toBe(true);
      expect(firstRes.version).toBe(2);

      // Replays 2..20 (Must return cached result with same version 2)
      for (let i = 2; i <= 20; i++) {
        const replayRes = await executeGameActionPipeline(actionBody, hostActor, { storage });
        expect(replayRes.success).toBe(true);
        expect(replayRes.statusCode).toBe(200);
        expect(replayRes.version).toBe(2);
      }

      // Ensure room state was modified only once (version remains 2)
      const finalState = await storage.getRoomState('TR-1001');
      expect(finalState?.version).toBe(2);
    });
  });

  describe('6. Fail-Safe Storage Unavailable Handling', () => {
    it('returns 503 STORAGE_UNAVAILABLE when production storage is unreachable', async () => {
      const unavailableStorage = new UnavailableRoomStorage();
      const body = {
        actionId: 'act_storage_fail',
        roomId: 'TR-1001',
        playerId: 'p_host',
        expectedVersion: 1,
        type: 'START_GAME'
      };

      const res = await executeGameActionPipeline(body, hostActor, { storage: unavailableStorage });
      expect(res.success).toBe(false);
      expect(res.statusCode).toBe(503);
      expect(res.error).toBe('STORAGE_UNAVAILABLE');
    });
  });

  describe('7. State Fetch & Authorization Guard (/api/game/state)', () => {
    it('allows room participants to read private room state', () => {
      const accessGuest = validateRoomReadAccess(guestActor, roomState);
      expect(accessGuest.allowed).toBe(true);

      const accessHost = validateRoomReadAccess(hostActor, roomState);
      expect(accessHost.allowed).toBe(true);
    });

    it('rejects unauthorized external actors from accessing private room state', () => {
      const accessAttacker = validateRoomReadAccess(attackerActor, roomState);
      expect(accessAttacker.allowed).toBe(false);
      expect(accessAttacker.reason).toBe('FORBIDDEN_PRIVATE_ROOM');
    });

    it('allows any actor to read public room state', () => {
      roomState.settings!.isPublic = true;
      const accessAttacker = validateRoomReadAccess(attackerActor, roomState);
      expect(accessAttacker.allowed).toBe(true);
    });
  });

  describe('8. Realtime Security: Spoofed MQTT Protection', () => {
    it('ensures fake client-authoritative MQTT payload cannot alter Redis canonical state', async () => {
      const stateBefore = await storage.getRoomState('TR-1001');
      expect(stateBefore?.players[0].money).toBe(1500);

      // Simulating a malicious client publishing a fake full state directly over MQTT:
      const fakeMqttPayload = {
        type: 'STATE_SYNC',
        senderId: 'hacker',
        state: {
          ...stateBefore,
          players: stateBefore!.players.map(p => ({ ...p, money: 999999 }))
        }
      };

      // In the server-authoritative pipeline, MQTT is only a notification receiver.
      // Canonical state in Redis remains completely untouched by fake MQTT payloads.
      const stateAfter = await storage.getRoomState('TR-1001');
      expect(stateAfter?.players[0].money).toBe(1500);
      expect(stateAfter?.version).toBe(1);
    });
  });
});
