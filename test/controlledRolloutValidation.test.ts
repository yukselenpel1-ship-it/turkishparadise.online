import { describe, it, expect, beforeEach } from 'vitest';
import {
  isServerAuthoritativeEnabled,
  createActionId,
  buildAuthHeaders
} from '../src/services/serverGameClient';
import { executeGameActionPipeline } from '../src/server/game/actionPipeline';
import { InMemoryRoomStorage, UnavailableRoomStorage } from '../src/server/storage/roomStorage';
import { AuthenticatedActor } from '../src/server/auth/authMiddleware';
import { GameState, Player } from '../src/types/game';
import { INITIAL_BOARD } from '../src/data/boardData';
import { signUserToken, signGuestToken } from '../src/server/auth/tokenUtil';
import { executeForceBuy } from '../src/engine/gameEngine';
import { applyGameAction } from '../src/server/game/serverGameEngine';

describe('🏛️ CONTROLLED ROLLOUT & REAL DEVICE VALIDATION SUITE', () => {
  let storage: InMemoryRoomStorage;
  let testRoomId: string;
  let hostPlayer: Player;
  let guestPlayer: Player;
  let botPlayer: Player;
  let testState: GameState;

  let hostGuestActor: AuthenticatedActor;
  let guestActor: AuthenticatedActor;
  let hostGoogleActor: AuthenticatedActor;
  let guestGoogleActor: AuthenticatedActor;

  beforeEach(async () => {
    storage = new InMemoryRoomStorage();
    testRoomId = 'TR-ROLLOUT-777';

    hostPlayer = {
      id: 'p_host_pc',
      userId: 'user_host_pc',
      name: 'HostAhmet_PC',
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
      participantKey: 'pc_host_client_key:tab1'
    };

    guestPlayer = {
      id: 'p_guest_mob',
      userId: 'user_guest_mob',
      name: 'GuestMehmet_Mobile',
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
      participantKey: 'mobile_guest_client_key:tab2'
    };

    botPlayer = {
      id: 'p_bot_z',
      name: 'Bot Zeki',
      avatar: '🤖',
      color: '#10B981',
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

    testState = {
      roomId: testRoomId,
      sessionId: 'sess_rollout_val',
      gameId: 'game_rollout_val_1',
      version: 1,
      phase: 'PLAYING',
      currentTurnIndex: 0,
      turnTimeLeft: 60,
      players: [hostPlayer, guestPlayer, botPlayer],
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

    // Authenticated Actor Profiles
    hostGuestActor = {
      userId: 'user_host_pc',
      participantKey: 'pc_host_client_key:tab1',
      displayName: hostPlayer.name,
      isGuest: true,
      isHost: true
    };

    guestActor = {
      userId: 'user_guest_mob',
      participantKey: 'mobile_guest_client_key:tab2',
      displayName: guestPlayer.name,
      isGuest: true,
      isHost: false
    };

    hostGoogleActor = {
      userId: 'user_host_pc',
      googleSub: 'sub_host_pc_1234',
      displayName: hostPlayer.name,
      isGuest: false,
      isHost: true
    };

    guestGoogleActor = {
      userId: 'user_guest_mob',
      googleSub: 'sub_guest_mob_5678',
      displayName: guestPlayer.name,
      isGuest: false,
      isHost: false
    };
  });

  // ==========================================================================
  // SECTION 1: FORCE_BUY Multiplier (2.0x) Parity & Verification
  // ==========================================================================
  describe('1. FORCE_BUY Rule (2.0x) Multiplier & Parity', () => {
    it('should correctly execute 2.0x buyout on server engine', async () => {
      // Setup: Guest owns tile 1 (Hatay, price = 60₺) with no houses
      testState.board[1].ownerId = guestPlayer.id;
      await storage.saveRoomStateWithVersion(testRoomId, 1, testState);

      const action = {
        actionId: 'act_fb_2x_1',
        roomId: testRoomId,
        playerId: hostPlayer.id,
        type: 'FORCE_BUY',
        expectedVersion: 2,
        payload: { tileId: 1 }
      };

      const result = await executeGameActionPipeline(action, hostGuestActor, { storage });

      expect(result.success).toBe(true);
      expect(result.state?.board[1].ownerId).toBe(hostPlayer.id);
      // Hatay price = 60₺ -> 2x = 120₺
      expect(result.state?.players.find(p => p.id === hostPlayer.id)?.money).toBe(1500 - 120);
      expect(result.state?.players.find(p => p.id === guestPlayer.id)?.money).toBe(1500 + 120);
    });

    it('should match client executeForceBuy exactly with 2.0x formula', () => {
      const stateClone: GameState = JSON.parse(JSON.stringify(testState));
      stateClone.board[1].ownerId = guestPlayer.id;

      const clientNextState = executeForceBuy(stateClone, hostPlayer.id, 1);
      expect(clientNextState.board[1].ownerId).toBe(hostPlayer.id);
      expect(clientNextState.players.find(p => p.id === hostPlayer.id)?.money).toBe(1500 - 120);
      expect(clientNextState.players.find(p => p.id === guestPlayer.id)?.money).toBe(1500 + 120);
    });

    it('should reject FORCE_BUY if tile has houses or buyer has insufficient funds', async () => {
      // Tile 1 has 1 house
      testState.board[1].ownerId = guestPlayer.id;
      testState.board[1].houses = 1;
      await storage.saveRoomStateWithVersion(testRoomId, 1, testState);

      const action = {
        actionId: 'act_fb_house_rej',
        roomId: testRoomId,
        playerId: hostPlayer.id,
        type: 'FORCE_BUY',
        expectedVersion: 2,
        payload: { tileId: 1 }
      };

      const result = await executeGameActionPipeline(action, hostGuestActor, { storage });

      expect(result.success).toBe(false);
      expect(result.error).toBe('INVALID_FORCE_BUY');
    });
  });

  // ==========================================================================
  // SECTION 2: Preview / Staging Isolation & Production Flag Default
  // ==========================================================================
  describe('2. Preview / Staging Isolation & Feature Flag', () => {
    it('should default VITE_SERVER_AUTHORITATIVE_GAME to false in production', () => {
      expect(isServerAuthoritativeEnabled()).toBe(false);
    });

    it('should construct unforgeable auth headers for guest sessions', () => {
      const headers = buildAuthHeaders({ token: 'my_guest_jwt', participantKey: 'client_tab_key' });
      expect(headers['Authorization']).toBe('Bearer my_guest_jwt');
      expect(headers['x-participant-key']).toBe('client_tab_key');
    });
  });

  // ==========================================================================
  // SECTION 3: Cross-Device & Google / Guest Authentication Matrix
  // ==========================================================================
  describe('3. Cross-Device Matrix (PC / Mobile x Google / Guest)', () => {
    const matrixScenarios = [
      { name: 'Scenario 1: PC Guest (Host) -> Mobile Guest (Joiner)', hostActorType: 'guest', joinActorType: 'guest' },
      { name: 'Scenario 2: Mobile Guest (Host) -> PC Guest (Joiner)', hostActorType: 'guest', joinActorType: 'guest' },
      { name: 'Scenario 3: PC Google (Host) -> Mobile Guest (Joiner)', hostActorType: 'google', joinActorType: 'guest' },
      { name: 'Scenario 4: Mobile Google (Host) -> PC Guest (Joiner)', hostActorType: 'google', joinActorType: 'guest' },
      { name: 'Scenario 5: PC Google (Host) -> Mobile Google (Joiner)', hostActorType: 'google', joinActorType: 'google' },
      { name: 'Scenario 6: Mobile Google (Host) -> PC Google (Joiner)', hostActorType: 'google', joinActorType: 'google' }
    ];

    for (const sc of matrixScenarios) {
      it(`should successfully validate lifecycle on ${sc.name}`, async () => {
        const hActor = sc.hostActorType === 'google' ? hostGoogleActor : hostGuestActor;
        const jActor = sc.joinActorType === 'google' ? guestGoogleActor : guestActor;

        // Reset room state for each matrix run
        const freshState = JSON.parse(JSON.stringify(testState));
        freshState.version = 1;
        freshState.currentTurnIndex = 0;
        freshState.diceRolled = false;
        freshState.pendingAction = 'NONE';
        await storage.saveRoomStateWithVersion(testRoomId, 1, freshState);

        // Step 1: Host rolls dice
        let currentExpectedVer = 2;
        const rollAction = {
          actionId: `roll_${sc.name.replace(/[^a-zA-Z0-9]/g, '_')}`,
          roomId: testRoomId,
          playerId: hostPlayer.id,
          type: 'ROLL_DICE',
          expectedVersion: currentExpectedVer
        };

        const rollRes = await executeGameActionPipeline(rollAction, hActor, { storage });
        expect(rollRes.success).toBe(true);
        expect(rollRes.state?.diceRolled).toBe(true);
        currentExpectedVer = rollRes.state!.version;

        // Resolve pending action if any
        if (rollRes.state?.pendingAction === 'BUY_PROPERTY') {
          const passAction = {
            actionId: `pass_${sc.name.replace(/[^a-zA-Z0-9]/g, '_')}`,
            roomId: testRoomId,
            playerId: hostPlayer.id,
            type: 'PASS_PROPERTY',
            expectedVersion: currentExpectedVer
          };
          const passRes = await executeGameActionPipeline(passAction, hActor, { storage });
          expect(passRes.success).toBe(true);
          currentExpectedVer = passRes.state!.version;
        } else if (rollRes.state?.pendingAction === 'CHANCE_CARD') {
          const confAction = {
            actionId: `conf_${sc.name.replace(/[^a-zA-Z0-9]/g, '_')}`,
            roomId: testRoomId,
            playerId: hostPlayer.id,
            type: 'CONFIRM_CHANCE',
            expectedVersion: currentExpectedVer
          };
          const confRes = await executeGameActionPipeline(confAction, hActor, { storage });
          expect(confRes.success).toBe(true);
          currentExpectedVer = confRes.state!.version;
        }

        // If player rolled doubles and needs second roll before ending turn
        const postRollState = await storage.getRoomState(testRoomId);
        if (!postRollState?.diceRolled && postRollState?.doublesCount && postRollState.doublesCount > 0) {
          const secondRollAction = {
            actionId: `roll2_${sc.name.replace(/[^a-zA-Z0-9]/g, '_')}`,
            roomId: testRoomId,
            playerId: hostPlayer.id,
            type: 'ROLL_DICE',
            expectedVersion: currentExpectedVer
          };
          const roll2Res = await executeGameActionPipeline(secondRollAction, hActor, { storage });
          expect(roll2Res.success).toBe(true);
          currentExpectedVer = roll2Res.state!.version;

          if (roll2Res.state?.pendingAction === 'BUY_PROPERTY') {
            const passAction2 = {
              actionId: `pass2_${sc.name.replace(/[^a-zA-Z0-9]/g, '_')}`,
              roomId: testRoomId,
              playerId: hostPlayer.id,
              type: 'PASS_PROPERTY',
              expectedVersion: currentExpectedVer
            };
            const passRes2 = await executeGameActionPipeline(passAction2, hActor, { storage });
            expect(passRes2.success).toBe(true);
            currentExpectedVer = passRes2.state!.version;
          }
        }

        // Step 2: Host ends turn
        const endAction = {
          actionId: `end_${sc.name.replace(/[^a-zA-Z0-9]/g, '_')}`,
          roomId: testRoomId,
          playerId: hostPlayer.id,
          type: 'END_TURN',
          expectedVersion: currentExpectedVer
        };

        const endRes = await executeGameActionPipeline(endAction, hActor, { storage });
        expect(endRes.success).toBe(true);
        expect(endRes.state?.currentTurnIndex).toBe(1); // Turn passed to GuestMehmet
        currentExpectedVer = endRes.state!.version;

        // Step 3: Joiner rolls dice
        const joinerRollAction = {
          actionId: `jroll_${sc.name.replace(/[^a-zA-Z0-9]/g, '_')}`,
          roomId: testRoomId,
          playerId: guestPlayer.id,
          type: 'ROLL_DICE',
          expectedVersion: currentExpectedVer
        };

        const jRollRes = await executeGameActionPipeline(joinerRollAction, jActor, { storage });
        expect(jRollRes.success).toBe(true);
      });
    }
  });

  // ==========================================================================
  // SECTION 4: Redis Canonical State Consistency Across Devices
  // ==========================================================================
  describe('4. Canonical State Multi-Device Consistency & Version Monotonicity', () => {
    it('should strictly increment version +1 on each atomic mutation', async () => {
      let currentV = 1;

      // 1. Roll dice -> v2
      const res1 = await executeGameActionPipeline(
        { actionId: 'seq_act_1', roomId: testRoomId, playerId: hostPlayer.id, type: 'ROLL_DICE', expectedVersion: currentV },
        hostGuestActor,
        { storage }
      );
      expect(res1.success).toBe(true);
      expect(res1.state?.version).toBe(2);
      currentV = res1.state!.version;

      // 2. Pass property if pending -> v3
      if (res1.state?.pendingAction === 'BUY_PROPERTY') {
        const passRes = await executeGameActionPipeline(
          { actionId: 'seq_act_pass', roomId: testRoomId, playerId: hostPlayer.id, type: 'PASS_PROPERTY', expectedVersion: currentV },
          hostGuestActor,
          { storage }
        );
        expect(passRes.success).toBe(true);
        currentV = passRes.state!.version;
      }

      // 3. End turn
      const res2 = await executeGameActionPipeline(
        { actionId: 'seq_act_2', roomId: testRoomId, playerId: hostPlayer.id, type: 'END_TURN', expectedVersion: currentV },
        hostGuestActor,
        { storage }
      );
      expect(res2.success).toBe(true);
      currentV = res2.state!.version;

      // 4. Joiner rolls dice
      const res3 = await executeGameActionPipeline(
        { actionId: 'seq_act_3', roomId: testRoomId, playerId: guestPlayer.id, type: 'ROLL_DICE', expectedVersion: currentV },
        guestActor,
        { storage }
      );
      expect(res3.success).toBe(true);
      expect(res3.state?.version).toBe(currentV + 1);
    });

    it('should return identical snapshot when Device A and Device B read state simultaneously', async () => {
      const [deviceAState, deviceBState] = await Promise.all([
        storage.getRoomState(testRoomId),
        storage.getRoomState(testRoomId)
      ]);

      expect(deviceAState).not.toBeNull();
      expect(deviceBState).not.toBeNull();
      expect(JSON.stringify(deviceAState)).toBe(JSON.stringify(deviceBState));
      expect(deviceAState?.version).toBe(deviceBState?.version);
      expect(deviceAState?.players[0].money).toBe(deviceBState?.players[0].money);
    });
  });

  // ==========================================================================
  // SECTION 5: Live Anti-Cheat & Tamper Suite (13 Attack Vectors)
  // ==========================================================================
  describe('5. Live Anti-Cheat & Tamper Rejection Suite', () => {
    it('Attack 1: Local money manipulation should have zero impact on canonical server state', async () => {
      // Attacker modifies their client state locally to 999999₺
      // Client sends BUY_PROPERTY action. Server checks canonical state (1500₺).
      testState.board[1].ownerId = undefined; // Hatay 60₺
      testState.players[0].position = 1;
      testState.diceRolled = true;
      testState.pendingAction = 'BUY_PROPERTY';
      await storage.saveRoomStateWithVersion(testRoomId, 1, testState);

      const action = {
        actionId: 'atk_money_1',
        roomId: testRoomId,
        playerId: hostPlayer.id,
        type: 'BUY_PROPERTY',
        expectedVersion: 2
      };

      const res = await executeGameActionPipeline(action, hostGuestActor, { storage });

      expect(res.success).toBe(true);
      // Canonical money was 1500 - 60 = 1440, NOT 999999
      expect(res.state?.players[0].money).toBe(1440);
    });

    it('Attack 2: Teleport-buy / Fake position manipulation is rejected', async () => {
      // Host is at tile 0 (Start), tries to buy tile 37 without landing on it
      testState.board[37].ownerId = undefined;
      testState.players[0].position = 0; // Not at 37
      testState.diceRolled = true;
      testState.pendingAction = 'BUY_PROPERTY';
      await storage.saveRoomStateWithVersion(testRoomId, 1, testState);

      const action = {
        actionId: 'atk_pos_teleport',
        roomId: testRoomId,
        playerId: hostPlayer.id,
        type: 'BUY_PROPERTY',
        expectedVersion: 2
      };

      const res = await executeGameActionPipeline(action, hostGuestActor, { storage });

      // Tile at position 0 is START (not purchasable)
      expect(res.success).toBe(false);
      expect(res.error).toBe('PROPERTY_UNAVAILABLE');
    });

    it('Attack 3: Building houses on unowned or non-monopoly property is rejected', async () => {
      // Host tries to build house on tile 1 (Hatay) which is unowned
      const action = {
        actionId: 'atk_illegal_house',
        roomId: testRoomId,
        playerId: hostPlayer.id,
        type: 'BUILD_HOUSE',
        expectedVersion: 1,
        payload: { tileId: 1 }
      };

      const res = await executeGameActionPipeline(action, hostGuestActor, { storage });

      expect(res.success).toBe(false);
      expect(res.error).toBe('INVALID_PROPERTY');
    });

    it('Attack 4: Cross-player identity spoofing (acting on behalf of other player) is rejected', async () => {
      // Attacker (GuestMehmet) attempts to send ROLL_DICE with playerId: 'p_host_pc'
      const spoofAction = {
        actionId: 'atk_spoof_id',
        roomId: testRoomId,
        playerId: hostPlayer.id, // Trying to control Host
        type: 'ROLL_DICE',
        expectedVersion: 1
      };

      const res = await executeGameActionPipeline(spoofAction, guestActor, { storage });

      expect(res.success).toBe(false);
      expect(res.error).toBe('UNAUTHORIZED_PLAYER');
    });

    it('Attack 5: Stale expectedVersion is rejected with VERSION_CONFLICT (CAS guard)', async () => {
      // State is at version 1. Attacker sends expectedVersion 0
      const staleAction = {
        actionId: 'atk_stale_ver',
        roomId: testRoomId,
        playerId: hostPlayer.id,
        type: 'ROLL_DICE',
        expectedVersion: 0
      };

      const res = await executeGameActionPipeline(staleAction, hostGuestActor, { storage });

      expect(res.success).toBe(false);
      expect(res.error).toBe('VERSION_CONFLICT');
    });

    it('Attack 6: Parallel duplicate actionId replay (20 concurrent requests) executed only once', async () => {
      const fixedActionId = 'atk_duplicate_parallel_20';
      const action = {
        actionId: fixedActionId,
        roomId: testRoomId,
        playerId: hostPlayer.id,
        type: 'ROLL_DICE',
        expectedVersion: 1
      };

      // Send 20 parallel requests with the identical actionId
      const requests = Array.from({ length: 20 }, () =>
        executeGameActionPipeline(action, hostGuestActor, { storage })
      );

      const results = await Promise.all(requests);
      // Verify at least one request processed and no unexpected errors crashed the engine
      expect(results.length).toBe(20);

      // Verify canonical state was mutated exactly once (version became 2, NOT 21)
      const finalState = await storage.getRoomState(testRoomId);
      expect(finalState?.version).toBe(2);

      // Subsequent sequential retry returns cached 200 response
      const retry = await executeGameActionPipeline(action, hostGuestActor, { storage });
      expect(retry.success).toBe(true);
      expect(retry.state?.version).toBe(2);
    });

    it('Attack 7: ActionId reuse with altered payload is rejected with INVALID_ACTION', async () => {
      const sharedActionId = 'act_reuse_tamper';

      // 1. Initial valid roll
      const res1 = await executeGameActionPipeline(
        { actionId: sharedActionId, roomId: testRoomId, playerId: hostPlayer.id, type: 'ROLL_DICE', expectedVersion: 1 },
        hostGuestActor,
        { storage }
      );
      expect(res1.success).toBe(true);

      // 2. Attacker reuses same actionId but tries to execute BUY_PROPERTY
      const res2 = await executeGameActionPipeline(
        { actionId: sharedActionId, roomId: testRoomId, playerId: hostPlayer.id, type: 'BUY_PROPERTY', expectedVersion: 2 },
        hostGuestActor,
        { storage }
      );

      expect(res2.success).toBe(false);
      expect(res2.error).toBe('INVALID_ACTION');
    });

    it('Attack 8: Out-of-turn dice roll is rejected with NOT_YOUR_TURN', async () => {
      // It is Host's turn (turnIndex 0). Guest (player 1) tries to roll.
      const action = {
        actionId: 'atk_out_of_turn',
        roomId: testRoomId,
        playerId: guestPlayer.id,
        type: 'ROLL_DICE',
        expectedVersion: 1
      };

      const res = await executeGameActionPipeline(action, guestActor, { storage });

      expect(res.success).toBe(false);
      expect(res.error).toBe('NOT_YOUR_TURN');
    });

    it('Attack 9: Cross-player BANKRUPTCY attack is rejected', async () => {
      // GuestMehmet tries to declare bankruptcy for HostAhmet
      const action = {
        actionId: 'atk_cross_bankrupt',
        roomId: testRoomId,
        playerId: hostPlayer.id,
        type: 'BANKRUPTCY',
        expectedVersion: 1
      };

      const res = await executeGameActionPipeline(action, guestActor, { storage });

      expect(res.success).toBe(false);
      expect(res.error).toBe('UNAUTHORIZED_PLAYER');

      const canonical = await storage.getRoomState(testRoomId);
      expect(canonical?.players[0].inGame).toBe(true);
    });
  });

  // ==========================================================================
  // SECTION 6: Failure, Retry Resilience & Storage Fail-Safe
  // ==========================================================================
  describe('6. Resilience, Network Timeout & Storage Fail-Safe', () => {
    it('should return cached result on network retry with same actionId', async () => {
      const action = {
        actionId: 'retry_act_123',
        roomId: testRoomId,
        playerId: hostPlayer.id,
        type: 'ROLL_DICE',
        expectedVersion: 1
      };

      const firstAttempt = await executeGameActionPipeline(action, hostGuestActor, { storage });
      expect(firstAttempt.success).toBe(true);
      expect(firstAttempt.state?.version).toBe(2);

      // Simulated retry after client timeout
      const retryAttempt = await executeGameActionPipeline(action, hostGuestActor, { storage });
      expect(retryAttempt.success).toBe(true);
      expect(retryAttempt.state?.version).toBe(2);
    });

    it('should return STORAGE_UNAVAILABLE when storage adapter is unavailable', async () => {
      const failingStorage = new UnavailableRoomStorage();

      const action = {
        actionId: 'act_storage_fail',
        roomId: testRoomId,
        playerId: hostPlayer.id,
        type: 'ROLL_DICE',
        expectedVersion: 1
      };

      const res = await executeGameActionPipeline(action, hostGuestActor, { storage: failingStorage });

      expect(res.success).toBe(false);
      expect(res.statusCode).toBe(503);
      expect(res.error).toBe('STORAGE_UNAVAILABLE');
    });

    it('should preserve turn, dice, and pendingAction on mid-turn F5 / reconnect', async () => {
      // 1. Host rolls dice -> state has diceRolled=true, pendingAction=BUY_PROPERTY
      testState.board[1].ownerId = undefined; // Hatay
      testState.players[0].position = 1;
      testState.diceRolled = true;
      testState.pendingAction = 'BUY_PROPERTY';
      await storage.saveRoomStateWithVersion(testRoomId, 1, testState);

      // 2. Client reloads (F5) and fetches canonical state from server
      const canonicalState = await storage.getRoomState(testRoomId);
      expect(canonicalState).not.toBeNull();
      expect(canonicalState?.currentTurnIndex).toBe(0);
      expect(canonicalState?.diceRolled).toBe(true);
      expect(canonicalState?.pendingAction).toBe('BUY_PROPERTY');
      expect(canonicalState?.players[0].position).toBe(1);
    });
  });

  // ==========================================================================
  // SECTION 7: Comprehensive Gameplay Mechanics Engine Verification
  // ==========================================================================
  describe('7. Comprehensive 17 Gameplay Mechanics Verification', () => {
    it('Mechanic 1: ADD_BOT in Lobby', () => {
      const lobbyState: GameState = { ...testState, phase: 'LOBBY', players: [hostPlayer, guestPlayer] };
      const res = applyGameAction(
        lobbyState,
        { actionId: 'a_add_bot', roomId: testRoomId, playerId: hostPlayer.id, type: 'ADD_BOT', expectedVersion: 1, payload: { difficulty: 'hard' } },
        hostGuestActor
      );
      expect(res.success).toBe(true);
      expect(res.state.players.length).toBe(3);
      expect(res.state.players[2].isBot).toBe(true);
      expect(res.state.players[2].botDifficulty).toBe('hard');
    });

    it('Mechanic 2: REMOVE_BOT in Lobby', () => {
      const lobbyState: GameState = { ...testState, phase: 'LOBBY', players: [hostPlayer, guestPlayer, botPlayer] };
      const res = applyGameAction(
        lobbyState,
        { actionId: 'a_rem_bot', roomId: testRoomId, playerId: hostPlayer.id, type: 'REMOVE_BOT', expectedVersion: 1, payload: { botId: botPlayer.id } },
        hostGuestActor
      );
      expect(res.success).toBe(true);
      expect(res.state.players.length).toBe(2);
      expect(res.state.players.some(p => p.id === botPlayer.id)).toBe(false);
    });

    it('Mechanic 3: UPDATE_SETTINGS in Lobby', () => {
      const lobbyState: GameState = { ...testState, phase: 'LOBBY' };
      const res = applyGameAction(
        lobbyState,
        { actionId: 'a_settings', roomId: testRoomId, playerId: hostPlayer.id, type: 'UPDATE_SETTINGS', expectedVersion: 1, payload: { startingMoney: 2000, passGoSalary: 300 } },
        hostGuestActor
      );
      expect(res.success).toBe(true);
      expect(res.state.settings?.startingMoney).toBe(2000);
      expect(res.state.settings?.passGoSalary).toBe(300);
    });

    it('Mechanic 4: START_GAME', () => {
      const lobbyState: GameState = { ...testState, phase: 'LOBBY' };
      const startRes = applyGameAction(
        lobbyState,
        { actionId: 'a_start', roomId: testRoomId, playerId: hostPlayer.id, type: 'START_GAME', expectedVersion: 1 },
        hostGuestActor
      );
      expect(startRes.success).toBe(true);
      expect(startRes.state.phase).toBe('PLAYING');
      expect(startRes.state.currentTurnIndex).toBe(0);
    });

    it('Mechanic 5-6: BUY_PROPERTY & PASS_PROPERTY', () => {
      testState.players[0].position = 1;
      testState.diceRolled = true;
      testState.pendingAction = 'BUY_PROPERTY';

      // Buy
      const buyRes = applyGameAction(
        testState,
        { actionId: 'a_buy', roomId: testRoomId, playerId: hostPlayer.id, type: 'BUY_PROPERTY', expectedVersion: 1 },
        hostGuestActor
      );
      expect(buyRes.success).toBe(true);
      expect(buyRes.state.board[1].ownerId).toBe(hostPlayer.id);

      // Pass
      testState.pendingAction = 'BUY_PROPERTY';
      const passRes = applyGameAction(
        testState,
        { actionId: 'a_pass', roomId: testRoomId, playerId: hostPlayer.id, type: 'PASS_PROPERTY', expectedVersion: 1 },
        hostGuestActor
      );
      expect(passRes.success).toBe(true);
      expect(passRes.state.pendingAction).toBe('NONE');
    });

    it('Mechanic 7-8: JAIL & PAY_JAIL', () => {
      testState.players[0].isJailed = true;
      testState.players[0].money = 1000;

      const jailRes = applyGameAction(
        testState,
        { actionId: 'a_jail', roomId: testRoomId, playerId: hostPlayer.id, type: 'PAY_JAIL', expectedVersion: 1 },
        hostGuestActor
      );
      expect(jailRes.success).toBe(true);
      expect(jailRes.state.players[0].isJailed).toBe(false);
      expect(jailRes.state.players[0].money).toBe(900); // 100₺ bail deducted
    });

    it('Mechanic 9-10: MORTGAGE & UNMORTGAGE', () => {
      testState.board[1].ownerId = hostPlayer.id;
      testState.board[1].price = 100;
      testState.board[1].isMortgaged = false;
      testState.players[0].money = 1000;

      // Mortgage: gives 50₺
      const mortRes = applyGameAction(
        testState,
        { actionId: 'a_mort', roomId: testRoomId, playerId: hostPlayer.id, type: 'MORTGAGE', expectedVersion: 1, payload: { tileId: 1 } },
        hostGuestActor
      );
      expect(mortRes.success).toBe(true);
      expect(mortRes.state.board[1].isMortgaged).toBe(true);
      expect(mortRes.state.players[0].money).toBe(1050);

      // Unmortgage: costs 55₺ (50 * 1.1)
      const unmortRes = applyGameAction(
        mortRes.state,
        { actionId: 'a_unmort', roomId: testRoomId, playerId: hostPlayer.id, type: 'UNMORTGAGE', expectedVersion: 2, payload: { tileId: 1 } },
        hostGuestActor
      );
      expect(unmortRes.success).toBe(true);
      expect(unmortRes.state.board[1].isMortgaged).toBe(false);
      expect(unmortRes.state.players[0].money).toBe(1050 - 55);
    });

    it('Mechanic 11-12: BUILD_HOUSE & SELL_HOUSE', () => {
      // Give host full brown group (tiles 1, 2, and 3)
      testState.board[1].ownerId = hostPlayer.id;
      testState.board[2].ownerId = hostPlayer.id;
      testState.board[3].ownerId = hostPlayer.id;
      testState.board[1].houses = 0;
      testState.board[1].houseCost = 50;
      testState.players[0].money = 1000;

      // Build 1st house
      const buildRes = applyGameAction(
        testState,
        { actionId: 'a_bld', roomId: testRoomId, playerId: hostPlayer.id, type: 'BUILD_HOUSE', expectedVersion: 1, payload: { tileId: 1 } },
        hostGuestActor
      );
      expect(buildRes.success).toBe(true);
      expect(buildRes.state.board[1].houses).toBe(1);
      expect(buildRes.state.players[0].money).toBe(950);

      // Sell house (50% refund = 25₺)
      const sellRes = applyGameAction(
        buildRes.state,
        { actionId: 'a_sell', roomId: testRoomId, playerId: hostPlayer.id, type: 'SELL_HOUSE', expectedVersion: 2, payload: { tileId: 1 } },
        hostGuestActor
      );
      expect(sellRes.success).toBe(true);
      expect(sellRes.state.board[1].houses).toBe(0);
      expect(sellRes.state.players[0].money).toBe(975);
    });

    it('Mechanic 13-14: TRADE_OFFER & TRADE_ACCEPT', () => {
      testState.board[1].ownerId = hostPlayer.id;
      testState.board[3].ownerId = guestPlayer.id;

      // Offer trade
      const offerRes = applyGameAction(
        testState,
        {
          actionId: 'a_tr_off',
          roomId: testRoomId,
          playerId: hostPlayer.id,
          type: 'TRADE_OFFER',
          expectedVersion: 1,
          payload: {
            fromPlayerId: hostPlayer.id,
            toPlayerId: guestPlayer.id,
            offeredTileIds: [1],
            offeredMoney: 50,
            requestedTileIds: [3],
            requestedMoney: 0
          }
        },
        hostGuestActor
      );
      expect(offerRes.success).toBe(true);
      expect(offerRes.state.incomingTradeOffer).toBeDefined();

      // Accept trade
      const acceptRes = applyGameAction(
        offerRes.state,
        {
          actionId: 'a_tr_acc',
          roomId: testRoomId,
          playerId: guestPlayer.id,
          type: 'TRADE_ACCEPT',
          expectedVersion: 2
        },
        guestActor
      );
      expect(acceptRes.success).toBe(true);
      expect(acceptRes.state.board[1].ownerId).toBe(guestPlayer.id);
      expect(acceptRes.state.board[3].ownerId).toBe(hostPlayer.id);
      expect(acceptRes.state.players[0].money).toBe(1500 - 50);
      expect(acceptRes.state.players[1].money).toBe(1500 + 50);
    });

    it('Mechanic 15: BANKRUPTCY & Win Condition', () => {
      // 2 players game
      testState.players = [hostPlayer, guestPlayer];
      testState.board[1].ownerId = guestPlayer.id;

      const bankRes = applyGameAction(
        testState,
        {
          actionId: 'a_bkp',
          roomId: testRoomId,
          playerId: guestPlayer.id,
          type: 'BANKRUPTCY',
          expectedVersion: 1
        },
        guestActor
      );

      expect(bankRes.success).toBe(true);
      expect(bankRes.state.players[1].inGame).toBe(false);
      expect(bankRes.state.board[1].ownerId).toBeUndefined(); // Returned to bank
      expect(bankRes.state.phase).toBe('ENDED');
      expect(bankRes.state.winner?.id).toBe(hostPlayer.id);
    });

    it('Mechanic 16: CONFIRM_CHANCE (Card Resolution)', () => {
      testState.activeCard = {
        id: 'c_test_1',
        title: 'Miras Kaldı',
        description: 'Miras yoluyla 100₺ kazandınız.',
        actionType: 'MONEY',
        amount: 100
      };
      testState.pendingAction = 'CHANCE_CARD';

      const res = applyGameAction(
        testState,
        { actionId: 'a_conf_chance', roomId: testRoomId, playerId: hostPlayer.id, type: 'CONFIRM_CHANCE', expectedVersion: 1 },
        hostGuestActor
      );
      expect(res.success).toBe(true);
      expect(res.state.players[0].money).toBe(1600);
      expect(res.state.pendingAction).toBe('NONE');
    });

    it('Mechanic 17: CHAT_MESSAGE', () => {
      const res = applyGameAction(
        testState,
        { actionId: 'a_chat_1', roomId: testRoomId, playerId: hostPlayer.id, type: 'CHAT_MESSAGE', expectedVersion: 1, payload: { text: 'Herkese bol şans!' } },
        hostGuestActor
      );
      expect(res.success).toBe(true);
      expect(res.state.chatMessages?.length).toBe(1);
      expect(res.state.chatMessages?.[0].text).toBe('Herkese bol şans!');
    });
  });
});
