import { describe, it, expect, beforeEach } from 'vitest';
import { executeGameActionPipeline } from '../src/server/game/actionPipeline';
import {
  InMemoryRoomStorage,
  UpstashRedisRoomStorage,
  UnavailableRoomStorage
} from '../src/server/storage/roomStorage';
import {
  AuthenticatedActor,
  resolveAuthenticatedActor,
  sanitizeGameStateForClient,
  validateRoomReadAccess
} from '../src/server/auth/authMiddleware';
import {
  getJwtSecret,
  signUserToken,
  signGuestToken,
  extractUserFromRequest
} from '../src/server/auth/tokenUtil';
import { validateActionRequest } from '../src/server/validation/actionSchema';
import { applyGameAction } from '../src/server/game/serverGameEngine';
import { createInitialState, leaveAndReplaceWithBot } from '../src/engine/gameEngine';
import { GameState, Player } from '../src/types/game';
import { getStoredGuestToken, setStoredGuestToken } from '../src/services/serverGameClient';

function createMockRoom(roomId = 'TR-AUDIT-1'): GameState {
  const state = createInitialState({ roomCode: roomId, isPublic: false, startingMoney: 1500 });
  state.roomId = roomId;
  state.version = 1;
  state.hostPlayerId = 'p_host';
  state.players = [
    {
      id: 'p_host',
      userId: 'user_host_1',
      clientId: 'client_host_uuid',
      tabId: 'tab_host_1',
      participantKey: 'client_host_uuid:tab_host_1',
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
      clientId: 'client_guest_uuid',
      tabId: 'tab_guest_2',
      participantKey: 'client_guest_uuid:tab_guest_2',
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

describe('Release-Blocker Security & Multiplayer Integrity Audit', () => {
  let storage: InMemoryRoomStorage;
  let roomState: GameState;
  const hostActor: AuthenticatedActor = {
    userId: 'user_host_1',
    participantKey: 'client_host_uuid:tab_host_1',
    displayName: 'Host Ahmet',
    isHost: true
  };
  const guestActor: AuthenticatedActor = {
    userId: 'user_guest_2',
    participantKey: 'client_guest_uuid:tab_guest_2',
    displayName: 'Guest Mehmet',
    isGuest: true
  };

  beforeEach(async () => {
    storage = new InMemoryRoomStorage();
    roomState = createMockRoom('TR-AUDIT-1');
    await storage.createRoomState('TR-AUDIT-1', roomState);
  });

  // 1. /api/game/action response sanitization
  it('actionResponseDoesNotLeakOpponentIdentity', async () => {
    const actionBody = {
      actionId: 'act_sanitize_check',
      roomId: 'TR-AUDIT-1',
      playerId: 'p_host',
      expectedVersion: 1,
      type: 'START_GAME'
    };

    const res = await executeGameActionPipeline(actionBody, hostActor, { storage });
    expect(res.success).toBe(true);

    const clientState = sanitizeGameStateForClient(res.state!, hostActor);

    // Requesting actor's (Host) fields are preserved
    const hostPlayer = clientState.players.find(p => p.id === 'p_host');
    expect(hostPlayer?.participantKey).toBe('client_host_uuid:tab_host_1');
    expect(hostPlayer?.clientId).toBe('client_host_uuid');
    expect(hostPlayer?.tabId).toBe('tab_host_1');

    // Opponent's (Guest) sensitive identity fields MUST be stripped
    const guestPlayer = clientState.players.find(p => p.id === 'p_guest');
    expect(guestPlayer?.participantKey).toBeUndefined();
    expect(guestPlayer?.clientId).toBeUndefined();
    expect(guestPlayer?.tabId).toBeUndefined();
    expect(guestPlayer?.connectionId).toBeUndefined();
  });

  // 2. Guest token security (server-generated guest identity)
  it('guestMintCannotClaimArbitraryParticipantKey', () => {
    const guestToken = signGuestToken({
      guestId: 'guest_random_uuid_777',
      participantKey: 'client_guest_uuid:tab_guest_2',
      displayName: 'Guest Player',
      roomId: 'TR-AUDIT-1',
      isGuest: true
    });

    const verified = resolveAuthenticatedActor({
      headers: { authorization: `Bearer ${guestToken}` }
    });

    expect(verified.success).toBe(true);
    expect(verified.actor?.userId).toBe('guest_random_uuid_777');
    expect(verified.actor?.isGuest).toBe(true);

    // Knowing a participantKey alone cannot authenticate
    const forgedAttempt = resolveAuthenticatedActor({
      headers: { 'x-participant-key': 'client_guest_uuid:tab_guest_2' }
    });
    expect(forgedAttempt.success).toBe(false);
    expect(forgedAttempt.error).toBe('UNAUTHORIZED');
  });

  // 3. JWT fallback secret removal
  it('productionRequiresJwtSecret', () => {
    const originalEnv = process.env.NODE_ENV;
    const originalSecret = process.env.JWT_SECRET;
    try {
      process.env.NODE_ENV = 'production';
      delete process.env.JWT_SECRET;

      expect(() => getJwtSecret()).toThrow('JWT_SECRET_REQUIRED');
    } finally {
      process.env.NODE_ENV = originalEnv;
      if (originalSecret !== undefined) {
        process.env.JWT_SECRET = originalSecret;
      }
    }
  });

  // 4. x-user-id / body / query userId fallback removal
  it('rawUserIdIsNotAuthentication', () => {
    const originalEnv = process.env.NODE_ENV;
    const originalDevAuth = process.env.ALLOW_INSECURE_DEV_AUTH;
    try {
      process.env.NODE_ENV = 'production';
      delete process.env.ALLOW_INSECURE_DEV_AUTH;

      const reqWithRawHeader = {
        headers: { 'x-user-id': 'user_victim_123', 'x-user-name': 'Victim' }
      };

      const extracted = extractUserFromRequest(reqWithRawHeader);
      expect(extracted).toBeNull();

      const authRes = resolveAuthenticatedActor(reqWithRawHeader);
      expect(authRes.success).toBe(false);
      expect(authRes.error).toBe('UNAUTHORIZED');
    } finally {
      process.env.NODE_ENV = originalEnv;
      if (originalDevAuth !== undefined) {
        process.env.ALLOW_INSECURE_DEV_AUTH = originalDevAuth;
      }
    }
  });

  // 5. Google server-authoritative auth wiring
  it('googleActionUsesSignedBackendJwt', () => {
    const signedGoogleJwt = signUserToken({
      id: 'google_user_555',
      googleSub: 'sub_555',
      displayName: 'Google Player',
      email: 'player@example.com'
    });

    const validReq = {
      headers: { authorization: `Bearer ${signedGoogleJwt}` }
    };

    const authRes = resolveAuthenticatedActor(validReq);
    expect(authRes.success).toBe(true);
    expect(authRes.actor?.userId).toBe('google_user_555');
    expect(authRes.actor?.isGuest).toBe(false);

    // Raw unauthenticated google UID without signed JWT is rejected
    const rawUidReq = {
      headers: { authorization: 'Bearer google_user_555' }
    };
    const rejectedRes = resolveAuthenticatedActor(rawUidReq);
    expect(rejectedRes.success).toBe(false);
  });

  // 6. Guest token tab isolation
  it('guestTokenIsTabScoped', () => {
    const fakeSessionStorage: Record<string, string> = {};
    const fakeLocalStorage: Record<string, string> = {};

    // Mock sessionStorage and localStorage
    const origWindow = globalThis.window;
    (globalThis as any).window = {
      sessionStorage: {
        getItem: (k: string) => fakeSessionStorage[k] || null,
        setItem: (k: string, v: string) => { fakeSessionStorage[k] = v; },
        removeItem: (k: string) => { delete fakeSessionStorage[k]; }
      },
      localStorage: {
        getItem: (k: string) => fakeLocalStorage[k] || null,
        setItem: (k: string, v: string) => { fakeLocalStorage[k] = v; },
        removeItem: (k: string) => { delete fakeLocalStorage[k]; }
      }
    };

    try {
      setStoredGuestToken('token_for_tab_1', 'participant_tab_1');
      expect(getStoredGuestToken('participant_tab_1')).toBe('token_for_tab_1');
      // Must NOT be stored in localStorage
      expect(fakeLocalStorage['tp_guest_jwt_token']).toBeUndefined();
    } finally {
      (globalThis as any).window = origWindow;
    }
  });

  // 7. Replacement bot takeover identity bug
  it('takeoverBindsClaimantNotHost', () => {
    let playState = createMockRoom('TR-AUDIT-1');
    playState.phase = 'PLAYING';
    playState = leaveAndReplaceWithBot(playState, 'p_guest');

    const claimantActor: AuthenticatedActor = {
      userId: 'user_claimant_888',
      participantKey: 'client_claimant:tab_77',
      displayName: 'Yeni Oyuncu Burak',
      isGuest: true
    };

    const takeoverAction = {
      actionId: 'act_claim_seat',
      roomId: 'TR-AUDIT-1',
      playerId: 'p_guest',
      expectedVersion: 1,
      type: 'TAKE_OVER_REPLACEMENT_BOT',
      payload: {
        targetPlayerId: 'p_guest',
        name: 'Burak',
        avatar: '🦁',
        color: '#10B981',
        clientId: 'client_claimant',
        tabId: 'tab_77'
      }
    };

    const res = applyGameAction(playState, takeoverAction, claimantActor);
    expect(res.success).toBe(true);

    const seat = res.state?.players.find(p => p.id === 'p_guest');
    expect(seat).toBeDefined();
    // 🔒 Must bind to claimant's verified signed actor identity, NEVER to host
    expect(seat?.userId).toBe('user_claimant_888');
    expect(seat?.participantKey).toBe('client_claimant:tab_77');
    expect(seat?.isBot).toBe(false);
    expect(seat?.isReplacementBot).toBe(false);
    expect(seat?.name).toBe('Burak');
    expect(seat?.avatar).toBe('🦁');
    // Financial and position state remains preserved
    expect(seat?.money).toBe(1500);
    expect(seat?.position).toBe(0);
  });

  // 7.2 Takeover CAS Race
  it('takeoverCASRace', async () => {
    let playState = createMockRoom('TR-AUDIT-1');
    playState.phase = 'PLAYING';
    playState = leaveAndReplaceWithBot(playState, 'p_guest');
    await storage.createRoomState('TR-AUDIT-1', playState);

    const claimantA: AuthenticatedActor = {
      userId: 'user_claimant_A',
      participantKey: 'client_A:tab_1',
      displayName: 'Claimant A',
      isGuest: true
    };

    const claimantB: AuthenticatedActor = {
      userId: 'user_claimant_B',
      participantKey: 'client_B:tab_2',
      displayName: 'Claimant B',
      isGuest: true
    };

    const actionA = {
      actionId: 'act_claim_a',
      roomId: 'TR-AUDIT-1',
      playerId: 'p_guest',
      expectedVersion: 1,
      type: 'TAKE_OVER_REPLACEMENT_BOT',
      payload: { targetPlayerId: 'p_guest', name: 'Claimant A' }
    };

    const actionB = {
      actionId: 'act_claim_b',
      roomId: 'TR-AUDIT-1',
      playerId: 'p_guest',
      expectedVersion: 1, // Same expected version (concurrent race)
      type: 'TAKE_OVER_REPLACEMENT_BOT',
      payload: { targetPlayerId: 'p_guest', name: 'Claimant B' }
    };

    // First claim succeeds
    const resA = await executeGameActionPipeline(actionA, claimantA, { storage });
    expect(resA.success).toBe(true);

    // Second concurrent claim fails due to CAS version conflict
    const resB = await executeGameActionPipeline(actionB, claimantB, { storage });
    expect(resB.success).toBe(false);
    expect(resB.statusCode).toBe(409);
    expect(resB.error).toBe('VERSION_CONFLICT');
  });

  // 9. Redis outage returns 503 not 404
  it('redisOutageIs503Not404', async () => {
    const failingStorage = new UnavailableRoomStorage();
    const actionBody = {
      actionId: 'act_outage_test',
      roomId: 'TR-AUDIT-1',
      playerId: 'p_host',
      expectedVersion: 1,
      type: 'ROLL_DICE'
    };

    const res = await executeGameActionPipeline(actionBody, hostActor, { storage: failingStorage });
    expect(res.success).toBe(false);
    expect(res.statusCode).toBe(503);
    expect(res.error).toBe('STORAGE_UNAVAILABLE');
    // Must NOT be 404 ROOM_NOT_FOUND
    expect(res.error).not.toBe('ROOM_NOT_FOUND');
  });

  // 10. Idempotency acquisition is atomic
  it('idempotencyClaimIsAtomic', async () => {
    const memoryStorage = new InMemoryRoomStorage();
    const idRes1 = await memoryStorage.checkAndRecordActionIdempotency('TR-AUDIT-1', 'act_atomic_1', 'fp_123');
    expect(idRes1.isDuplicate).toBe(false);
    expect(idRes1.status).toBe('IN_FLIGHT');

    // Second call with same actionId is detected as duplicate
    const idRes2 = await memoryStorage.checkAndRecordActionIdempotency('TR-AUDIT-1', 'act_atomic_1', 'fp_123');
    expect(idRes2.isDuplicate).toBe(true);
  });

  // 12.1 Room settings strict validation (passGoSalary)
  it('settingsRejectOutOfRangeSalary', () => {
    // 201 is invalid
    const invalidReq1 = validateActionRequest({
      actionId: 'act_bad_settings_1',
      roomId: 'TR-AUDIT-1',
      playerId: 'p_host',
      expectedVersion: 1,
      type: 'UPDATE_SETTINGS',
      payload: { passGoSalary: 201 }
    });
    expect(invalidReq1.valid).toBe(false);
    expect(invalidReq1.error).toBe('INVALID_SETTINGS');

    // 999999 is invalid
    const invalidReq2 = validateActionRequest({
      actionId: 'act_bad_settings_2',
      roomId: 'TR-AUDIT-1',
      playerId: 'p_host',
      expectedVersion: 1,
      type: 'UPDATE_SETTINGS',
      payload: { passGoSalary: 999999 }
    });
    expect(invalidReq2.valid).toBe(false);

    // -1 is invalid
    const invalidReq3 = validateActionRequest({
      actionId: 'act_bad_settings_3',
      roomId: 'TR-AUDIT-1',
      playerId: 'p_host',
      expectedVersion: 1,
      type: 'UPDATE_SETTINGS',
      payload: { passGoSalary: -1 }
    });
    expect(invalidReq3.valid).toBe(false);

    // Valid salaries: 200, 300, 400, 500
    for (const validSalary of [200, 300, 400, 500]) {
      const validReq = validateActionRequest({
        actionId: `act_good_settings_${validSalary}`,
        roomId: 'TR-AUDIT-1',
        playerId: 'p_host',
        expectedVersion: 1,
        type: 'UPDATE_SETTINGS',
        payload: { passGoSalary: validSalary }
      });
      expect(validReq.valid).toBe(true);
      expect(validReq.action?.payload?.passGoSalary).toBe(validSalary);
    }
  });

  // 12.2 Room settings strict validation (firstLapBuyLimit)
  it('settingsRejectInvalidFirstLapLimit', () => {
    // 99 is invalid
    const invalidLimit1 = validateActionRequest({
      actionId: 'act_bad_limit_1',
      roomId: 'TR-AUDIT-1',
      playerId: 'p_host',
      expectedVersion: 1,
      type: 'UPDATE_SETTINGS',
      payload: { firstLapBuyLimit: 99 }
    });
    expect(invalidLimit1.valid).toBe(false);
    expect(invalidLimit1.error).toBe('INVALID_SETTINGS');

    // -1 is invalid
    const invalidLimit2 = validateActionRequest({
      actionId: 'act_bad_limit_2',
      roomId: 'TR-AUDIT-1',
      playerId: 'p_host',
      expectedVersion: 1,
      type: 'UPDATE_SETTINGS',
      payload: { firstLapBuyLimit: -1 }
    });
    expect(invalidLimit2.valid).toBe(false);

    // 5 is invalid (only 0..4 allowed)
    const invalidLimit3 = validateActionRequest({
      actionId: 'act_bad_limit_3',
      roomId: 'TR-AUDIT-1',
      playerId: 'p_host',
      expectedVersion: 1,
      type: 'UPDATE_SETTINGS',
      payload: { firstLapBuyLimit: 5 }
    });
    expect(invalidLimit3.valid).toBe(false);

    // Valid limits: 0, 1, 2, 3, 4
    for (const validLimit of [0, 1, 2, 3, 4]) {
      const validReq = validateActionRequest({
        actionId: `act_good_limit_${validLimit}`,
        roomId: 'TR-AUDIT-1',
        playerId: 'p_host',
        expectedVersion: 1,
        type: 'UPDATE_SETTINGS',
        payload: { firstLapBuyLimit: validLimit }
      });
      expect(validReq.valid).toBe(true);
      expect(validReq.action?.payload?.firstLapBuyLimit).toBe(validLimit);
    }
  });
});
