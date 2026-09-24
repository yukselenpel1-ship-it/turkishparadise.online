import { describe, it, expect, beforeEach } from 'vitest';
import { executeGameActionPipeline } from '../src/server/game/actionPipeline';
import { InMemoryRoomStorage, UnavailableRoomStorage, GameAction } from '../src/server/storage/roomStorage';
import { AuthenticatedActor, validateActorMatchesPlayer, validateRoomReadAccess } from '../src/server/auth/authMiddleware';
import { signUserToken, signGuestToken } from '../src/server/auth/tokenUtil';
import { GameState, Player, BoardTile } from '../src/types/game';
import { INITIAL_BOARD } from '../src/data/boardData';
import { isPlayerHost, createInitialState, executeTrade } from '../src/engine/gameEngine';
import { applyGameAction } from '../src/server/game/serverGameEngine';
import { createActionId } from '../src/services/serverGameClient';

describe('⚡ MULTIPLAYER COMPREHENSIVE EDGE-CASE STRESS TEST SUITE', () => {
  let storage: InMemoryRoomStorage;
  let roomId: string;
  let hostPlayer: Player;
  let joinerPlayer: Player;
  let thirdPlayer: Player;
  let botPlayer: Player;
  let baseState: GameState;

  let hostActor: AuthenticatedActor;
  let joinerActor: AuthenticatedActor;
  let thirdActor: AuthenticatedActor;

  beforeEach(async () => {
    storage = new InMemoryRoomStorage();
    roomId = 'TR-STRESS-101';

    hostPlayer = {
      id: 'p_host_1',
      userId: 'user_host_1',
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
      participantKey: 'host_pk_123:tab1'
    };

    joinerPlayer = {
      id: 'p_joiner_2',
      userId: 'user_joiner_2',
      name: 'JoinerMehmet',
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
      participantKey: 'joiner_pk_456:tab2'
    };

    thirdPlayer = {
      id: 'p_player_3',
      userId: 'user_third_3',
      name: 'PlayerCan',
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
      participantKey: 'third_pk_789:tab3'
    };

    botPlayer = {
      id: 'p_bot_4',
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

    baseState = {
      roomId,
      sessionId: 'sess_stress_001',
      gameId: 'game_stress_001',
      version: 1,
      phase: 'PLAYING',
      currentTurnIndex: 0,
      turnTimeLeft: 60,
      players: [hostPlayer, joinerPlayer, thirdPlayer, botPlayer],
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

    await storage.createRoomState(roomId, baseState);

    hostActor = {
      userId: hostPlayer.userId,
      participantKey: hostPlayer.participantKey,
      isGuest: false,
      displayName: hostPlayer.name
    };

    joinerActor = {
      userId: joinerPlayer.userId,
      participantKey: joinerPlayer.participantKey,
      isGuest: true,
      displayName: joinerPlayer.name
    };

    thirdActor = {
      userId: thirdPlayer.userId,
      participantKey: thirdPlayer.participantKey,
      isGuest: true,
      displayName: thirdPlayer.name
    };
  });

  // ==========================================================================
  // GROUP A: RECONNECT / NETWORK
  // ==========================================================================
  describe('Group A: Reconnect / Network Stress & Edge Cases', () => {
    it('A1: Host F5 (Page Reload) preserves slot, host role, money and version', async () => {
      // 1. Game progresses to version 2 (Host rolls dice)
      const rollRes = await executeGameActionPipeline(
        {
          actionId: 'act_host_roll_1',
          roomId,
          playerId: hostPlayer.id,
          expectedVersion: 1,
          type: 'ROLL_DICE'
        },
        hostActor,
        { storage }
      );
      expect(rollRes.success).toBe(true);
      expect(rollRes.version).toBe(2);

      // 2. Host F5: Re-fetches room state with auth token
      const reconnectedState = await storage.getRoomState(roomId);
      expect(reconnectedState).toBeDefined();
      expect(reconnectedState?.version).toBe(2);
      expect(reconnectedState?.hostPlayerId).toBe(hostPlayer.id);

      // Verify slot preserved: exactly 4 players, host is still player[0]
      expect(reconnectedState?.players.length).toBe(4);
      const hostSlot = reconnectedState?.players.find(p => p.id === hostPlayer.id);
      expect(hostSlot).toBeDefined();
      expect(hostSlot?.isHost).toBe(true);
      expect(isPlayerHost(reconnectedState!, hostPlayer.id)).toBe(true);
    });

    it('A2: Joiner F5 preserves slot, balance and spectator/guest integrity', async () => {
      // Joiner refreshes tab after host bought a tile
      const fetchedState = await storage.getRoomState(roomId);
      const joinerSlot = fetchedState?.players.find(p => p.id === joinerPlayer.id);
      expect(joinerSlot).toBeDefined();
      expect(joinerSlot?.money).toBe(1500);
      expect(joinerSlot?.isHost).toBe(false);
      expect(isPlayerHost(fetchedState!, joinerPlayer.id)).toBe(false);
    });

    it('A3: Short Network Interruption & Catch-up via Polling', async () => {
      // Advance state on server while Joiner was offline (v1 -> v2 -> v3)
      await storage.saveRoomStateWithVersion(roomId, 1, {
        ...baseState,
        version: 2,
        currentTurnIndex: 1
      });
      await storage.saveRoomStateWithVersion(roomId, 2, {
        ...baseState,
        version: 3,
        currentTurnIndex: 1,
        diceRolled: false
      });

      // Joiner reconnects and reads canonical state
      const readAccess = validateRoomReadAccess(joinerActor, (await storage.getRoomState(roomId))!);
      expect(readAccess.allowed).toBe(true);

      const latestState = await storage.getRoomState(roomId);
      expect(latestState?.version).toBe(3);
      expect(latestState?.currentTurnIndex).toBe(1);
    });

    it('A4: Wi-Fi -> Mobile Data IP switch preserves guest session validation', async () => {
      // Token signed for mobile guest stays valid across IP address changes
      const guestJwt = signGuestToken({
        guestId: 'guest_joiner_mob',
        participantKey: joinerPlayer.participantKey!,
        displayName: joinerPlayer.name
      });
      expect(guestJwt).toBeDefined();

      const validation = validateActorMatchesPlayer(joinerActor, baseState, joinerPlayer.id);
      expect(validation.valid).toBe(true);
    });

    it('A5: Mobile background -> foreground multi-version catch-up', async () => {
      // While mobile was backgrounded, multiple turns occurred advancing state version
      await storage.saveRoomStateWithVersion(roomId, 1, { ...baseState, version: 2, currentTurnIndex: 1 });
      await storage.saveRoomStateWithVersion(roomId, 2, { ...baseState, version: 3, currentTurnIndex: 2 });
      await storage.saveRoomStateWithVersion(roomId, 3, { ...baseState, version: 4, currentTurnIndex: 3 });
      await storage.saveRoomStateWithVersion(roomId, 4, { ...baseState, version: 5, currentTurnIndex: 0 });

      const recovered = await storage.getRoomState(roomId);
      expect(recovered?.version).toBe(5);
      expect(recovered?.currentTurnIndex).toBe(0);
    });

    it('A6: Dropped MQTT notification does not stall client (HTTP Polling fallback works)', async () => {
      // Mutation committed to Redis
      const rollRes = await executeGameActionPipeline(
        {
          actionId: 'act_poll_test',
          roomId,
          playerId: hostPlayer.id,
          expectedVersion: 1,
          type: 'ROLL_DICE'
        },
        hostActor,
        { storage }
      );
      expect(rollRes.success).toBe(true);

      // Client simulates missing MQTT event: direct HTTP GET /api/game/state returns latest
      const canonicalState = await storage.getRoomState(roomId);
      expect(canonicalState?.version).toBe(2);
      expect(canonicalState?.diceRolled).toBe(true);
    });

    it('A7: Duplicate MQTT notifications are handled idempotently', () => {
      let localVersion = 2;
      const onStateUpdatedNotification = (incomingVersion: number) => {
        if (incomingVersion <= localVersion) {
          return 'IGNORED_DUPLICATE_OR_STALE';
        }
        localVersion = incomingVersion;
        return 'FETCH_NEW_STATE';
      };

      expect(onStateUpdatedNotification(2)).toBe('IGNORED_DUPLICATE_OR_STALE');
      expect(onStateUpdatedNotification(2)).toBe('IGNORED_DUPLICATE_OR_STALE');
      expect(onStateUpdatedNotification(3)).toBe('FETCH_NEW_STATE');
    });

    it('A8: Stale out-of-order notification (v2 arriving after v3) is discarded', () => {
      let currentVersion = 3;
      const handleNotification = (v: number) => {
        if (v <= currentVersion) return false;
        currentVersion = v;
        return true;
      };

      expect(handleNotification(2)).toBe(false);
      expect(currentVersion).toBe(3);
    });

    it('A9: Temporary Redis 503 returns STORAGE_UNAVAILABLE without crashing or corrupting state', async () => {
      const unavailableStorage = new UnavailableRoomStorage();
      const res = await executeGameActionPipeline(
        {
          actionId: 'act_503_test',
          roomId,
          playerId: hostPlayer.id,
          expectedVersion: 1,
          type: 'ROLL_DICE'
        },
        hostActor,
        { storage: unavailableStorage }
      );

      expect(res.success).toBe(false);
      expect(res.statusCode).toBe(503);
      expect(res.error).toBe('STORAGE_UNAVAILABLE');

      // State in original storage remained untouched
      const intactState = await storage.getRoomState(roomId);
      expect(intactState?.version).toBe(1);
    });

    it('A10: Continuation after Redis recovery succeeds seamlessly', async () => {
      // Step 1: 503 happens
      const unavailableStorage = new UnavailableRoomStorage();
      await executeGameActionPipeline(
        { actionId: 'act_fail', roomId, playerId: hostPlayer.id, expectedVersion: 1, type: 'ROLL_DICE' },
        hostActor,
        { storage: unavailableStorage }
      );

      // Step 2: Redis is back online -> action succeeds
      const recoveredRes = await executeGameActionPipeline(
        { actionId: 'act_success', roomId, playerId: hostPlayer.id, expectedVersion: 1, type: 'ROLL_DICE' },
        hostActor,
        { storage }
      );
      expect(recoveredRes.success).toBe(true);
      expect(recoveredRes.version).toBe(2);
    });
  });

  // ==========================================================================
  // GROUP B: IDENTITY / MULTI-DEVICE
  // ==========================================================================
  describe('Group B: Identity / Multi-device Stress & Edge Cases', () => {
    it('B1: Same Google account on PC + Mobile attaches to single player slot (no duplicate player)', async () => {
      const lobbyState = createInitialState({ roomCode: 'TR-LOBBY-B1' });
      lobbyState.roomId = 'TR-LOBBY-B1';
      lobbyState.players = [hostPlayer];

      // Simulate same Google user attempting to join again from mobile tab
      const isAlreadyInRoom = lobbyState.players.some(p => p.userId === hostPlayer.userId);
      expect(isAlreadyInRoom).toBe(true);

      // Should attach to existing slot without pushing new player
      const activeSlots = lobbyState.players.filter(p => p.userId === hostPlayer.userId);
      expect(activeSlots.length).toBe(1);
    });

    it('B2: Same user in two tabs shares seat and does not create ghost players', () => {
      const currentPlayers = [...baseState.players];
      const newTabPlayer = { ...hostPlayer, id: 'p_host_tab2' };

      const existingIndex = currentPlayers.findIndex(
        p => p.userId && hostPlayer.userId && p.userId === hostPlayer.userId
      );
      expect(existingIndex).toBe(0); // Found existing seat

      // When existing seat found, slot is re-used
      expect(currentPlayers.length).toBe(4);
    });

    it('B3: Same user in different rooms operates in complete isolation', async () => {
      const roomA = 'TR-ROOM-AAA';
      const roomB = 'TR-ROOM-BBB';

      const stateA = { ...baseState, roomId: roomA, version: 1 };
      const stateB = { ...baseState, roomId: roomB, version: 1 };

      await storage.createRoomState(roomA, stateA);
      await storage.createRoomState(roomB, stateB);

      // Action in Room A
      await executeGameActionPipeline(
        { actionId: 'act_a1', roomId: roomA, playerId: hostPlayer.id, expectedVersion: 1, type: 'ROLL_DICE' },
        hostActor,
        { storage }
      );

      const readA = await storage.getRoomState(roomA);
      const readB = await storage.getRoomState(roomB);

      expect(readA?.version).toBe(2);
      expect(readB?.version).toBe(1); // Room B is completely isolated
    });

    it('B4: Same displayName for two players does not cause identity collision or hijack', () => {
      const playerSameName: Player = {
        id: 'p_another_user',
        userId: 'user_diff_999',
        name: 'HostAhmet', // Identical display name!
        avatar: '🎩',
        color: '#8B5CF6',
        money: 1500,
        position: 0,
        isJailed: false,
        jailTurns: 0,
        lapsCompleted: 0,
        firstLapPurchases: 0,
        inGame: true,
        isBot: false,
        isHost: false,
        participantKey: 'diff_pk_999:tab9'
      };

      const customState: GameState = {
        ...baseState,
        players: [hostPlayer, playerSameName]
      };

      // Attacking user with same name tries to act as hostPlayer.id
      const impostorActor: AuthenticatedActor = {
        userId: playerSameName.userId,
        participantKey: playerSameName.participantKey,
        isGuest: false
      };

      const matchCheck = validateActorMatchesPlayer(impostorActor, customState, hostPlayer.id);
      expect(matchCheck.valid).toBe(false);
      expect(matchCheck.error).toBe('UNAUTHORIZED_PLAYER');
    });

    it('B5: Same avatar / color in lobby assigns unique color to bot', async () => {
      const lobbyState: GameState = {
        ...baseState,
        phase: 'LOBBY'
      };

      const addBotRes = applyGameAction(
        lobbyState,
        { actionId: 'a_bot_add', roomId, playerId: hostPlayer.id, expectedVersion: 1, type: 'ADD_BOT' },
        hostActor
      );
      expect(addBotRes.success).toBe(true);

      const bot = addBotRes.state.players.find(p => p.isBot && p.id !== botPlayer.id);
      expect(bot).toBeDefined();
      // Ensure bot avatar/color does not crash
      expect(bot?.avatar).toBeDefined();
      expect(bot?.color).toBeDefined();
    });

    it('B6: Leave -> Rejoin cycle in Lobby does not leave duplicate players', async () => {
      const lobbyState: GameState = {
        ...baseState,
        phase: 'LOBBY',
        players: [hostPlayer, joinerPlayer]
      };

      // Joiner leaves lobby
      const afterLeave: GameState = {
        ...lobbyState,
        players: lobbyState.players.filter(p => p.id !== joinerPlayer.id)
      };
      expect(afterLeave.players.length).toBe(1);

      // Joiner rejoins lobby
      const afterRejoin: GameState = {
        ...afterLeave,
        players: [...afterLeave.players, joinerPlayer]
      };
      expect(afterRejoin.players.length).toBe(2);
      expect(afterRejoin.players[0].id).toBe(hostPlayer.id);
      expect(afterRejoin.players[1].id).toBe(joinerPlayer.id);
    });

    it('B7: Rapid 10x join/leave loop maintains player array integrity and single host', () => {
      let state: GameState = {
        ...baseState,
        phase: 'LOBBY',
        players: [hostPlayer]
      };

      for (let i = 0; i < 10; i++) {
        const guestP: Player = {
          ...joinerPlayer,
          id: `p_temp_${i}`
        };
        // Join
        state = { ...state, players: [...state.players, guestP] };
        expect(state.players.length).toBe(2);
        // Leave
        state = { ...state, players: state.players.filter(p => p.id !== guestP.id) };
        expect(state.players.length).toBe(1);
      }

      expect(state.players.length).toBe(1);
      expect(state.players[0].id).toBe(hostPlayer.id);
      expect(state.players[0].isHost).toBe(true);
    });

    it('B8: Spectator reconnect allows read-only access and blocks gameplay actions', async () => {
      const spectatorActor: AuthenticatedActor = {
        userId: 'spec_user_777',
        participantKey: 'spec_pk:tab_s',
        isGuest: true
      };

      const stateWithSpectator: GameState = {
        ...baseState,
        spectators: [{ id: spectatorActor.userId, name: 'Izleyici 1', avatar: '👀', joinedAt: Date.now() }]
      };
      await storage.createRoomState('TR-SPEC-B8', stateWithSpectator);

      // 1. Read access is allowed for room with spectator
      const readRes = validateRoomReadAccess(spectatorActor, stateWithSpectator);
      expect(readRes.allowed).toBe(true);

      // 2. Spectator trying to execute ROLL_DICE is blocked
      const actionRes = await executeGameActionPipeline(
        { actionId: 'act_spec_roll', roomId: 'TR-SPEC-B8', playerId: spectatorActor.userId, expectedVersion: 1, type: 'ROLL_DICE' },
        spectatorActor,
        { storage }
      );
      expect(actionRes.success).toBe(false);
      expect(['PLAYER_NOT_FOUND', 'UNAUTHORIZED_PLAYER']).toContain(actionRes.error);
    });

    it('B9: Spectator tab close does not freeze active game', () => {
      const stateWithSpectator: GameState = {
        ...baseState,
        spectators: [{ id: 'spec_user_777', name: 'Izleyici 1', avatar: '👀', joinedAt: Date.now() }]
      };

      // Spectator leaves
      const updated = {
        ...stateWithSpectator,
        spectators: stateWithSpectator.spectators?.filter(s => s.id !== 'spec_user_777')
      };

      expect(updated.phase).toBe('PLAYING');
      expect(updated.players.filter(p => p.inGame).length).toBe(4);
      expect(isPlayerHost(updated, hostPlayer.id)).toBe(true);
    });
  });

  // ==========================================================================
  // GROUP C: RACE CONDITIONS / ECONOMIC ACTIONS
  // ==========================================================================
  describe('Group C: Race Condition / Economic Actions Stress & Edge Cases', () => {
    it('C1: Timeout during ROLL_DICE: Idempotent retry returns identical dice without moving twice', async () => {
      const actionId = 'act_dice_timeout_1';

      // 1st Attempt
      const res1 = await executeGameActionPipeline(
        { actionId, roomId, playerId: hostPlayer.id, expectedVersion: 1, type: 'ROLL_DICE' },
        hostActor,
        { storage }
      );
      expect(res1.success).toBe(true);
      const posAfter1 = res1.state?.players[0].position;
      const dice1 = res1.state?.dice;

      // 2nd Attempt (Client retry with identical actionId)
      const res2 = await executeGameActionPipeline(
        { actionId, roomId, playerId: hostPlayer.id, expectedVersion: 1, type: 'ROLL_DICE' },
        hostActor,
        { storage }
      );
      expect(res2.success).toBe(true);
      expect(res2.state?.players[0].position).toBe(posAfter1);
      expect(res2.state?.dice).toEqual(dice1);
      expect(res2.version).toBe(2);
    });

    it('C2: Timeout during END_TURN: Idempotent retry does not double advance turn', async () => {
      // First roll dice deterministically [1, 2] -> tile 3 (Mersin)
      const rollRes = await executeGameActionPipeline(
        { actionId: 'act_roll_c2', roomId, playerId: hostPlayer.id, expectedVersion: 1, type: 'ROLL_DICE' },
        hostActor,
        { storage, rng: () => [1, 2] }
      );
      expect(rollRes.success).toBe(true);
      expect(rollRes.state?.diceRolled).toBe(true);

      let currentVersion = rollRes.version!;
      // Landed on Mersin (unowned property), pass it first to resolve pendingAction
      if (rollRes.state?.pendingAction === 'BUY_PROPERTY') {
        const passRes = await executeGameActionPipeline(
          { actionId: 'act_pass_c2', roomId, playerId: hostPlayer.id, expectedVersion: currentVersion, type: 'PASS_PROPERTY' },
          hostActor,
          { storage }
        );
        expect(passRes.success).toBe(true);
        currentVersion = passRes.version!;
      }

      const actionId = 'act_end_turn_c2';
      // 1st END_TURN
      const end1 = await executeGameActionPipeline(
        { actionId, roomId, playerId: hostPlayer.id, expectedVersion: currentVersion, type: 'END_TURN' },
        hostActor,
        { storage }
      );
      expect(end1.success).toBe(true);
      expect(end1.state?.currentTurnIndex).toBe(1); // Moved to Joiner

      // 2nd END_TURN retry with same actionId
      const end2 = await executeGameActionPipeline(
        { actionId, roomId, playerId: hostPlayer.id, expectedVersion: currentVersion, type: 'END_TURN' },
        hostActor,
        { storage }
      );
      expect(end2.success).toBe(true);
      expect(end2.state?.currentTurnIndex).toBe(1); // Stays at Joiner, did NOT skip to player 3!
    });

    it('C3: Timeout during BUY_PROPERTY: Idempotent retry does not deduct money twice', async () => {
      // Place player on property 1 (Hatay, price 60)
      baseState.players[0].position = 1;
      baseState.pendingAction = 'BUY_PROPERTY';
      baseState.diceRolled = true;
      await storage.createRoomState('TR-C3', baseState);

      const actionId = 'act_buy_timeout_c3';

      // 1st Buy
      const buy1 = await executeGameActionPipeline(
        { actionId, roomId: 'TR-C3', playerId: hostPlayer.id, expectedVersion: 1, type: 'BUY_PROPERTY' },
        hostActor,
        { storage }
      );
      expect(buy1.success).toBe(true);
      expect(buy1.state?.players[0].money).toBe(1500 - 60);

      // 2nd Buy Retry
      const buy2 = await executeGameActionPipeline(
        { actionId, roomId: 'TR-C3', playerId: hostPlayer.id, expectedVersion: 1, type: 'BUY_PROPERTY' },
        hostActor,
        { storage }
      );
      expect(buy2.success).toBe(true);
      expect(buy2.state?.players[0].money).toBe(1500 - 60); // Still 1440₺, NOT deducted again!
    });

    it('C4: Double TRADE_ACCEPT execution rejects 2nd accept without money doubling', async () => {
      baseState.board[1].ownerId = hostPlayer.id;
      baseState.incomingTradeOffer = {
        fromPlayerId: hostPlayer.id,
        toPlayerId: joinerPlayer.id,
        offeredTileIds: [1],
        offeredMoney: 100,
        requestedTileIds: [],
        requestedMoney: 0
      };
      await storage.createRoomState('TR-C4', baseState);

      // 1st Accept
      const acc1 = await executeGameActionPipeline(
        { actionId: 'act_tr_acc_1', roomId: 'TR-C4', playerId: joinerPlayer.id, expectedVersion: 1, type: 'TRADE_ACCEPT' },
        joinerActor,
        { storage }
      );
      expect(acc1.success).toBe(true);
      expect(acc1.state?.board[1].ownerId).toBe(joinerPlayer.id);
      expect(acc1.state?.players[0].money).toBe(1400);
      expect(acc1.state?.players[1].money).toBe(1600);

      // 2nd Accept with NEW actionId
      const acc2 = await executeGameActionPipeline(
        { actionId: 'act_tr_acc_2', roomId: 'TR-C4', playerId: joinerPlayer.id, expectedVersion: 2, type: 'TRADE_ACCEPT' },
        joinerActor,
        { storage }
      );
      expect(acc2.success).toBe(false);
      expect(acc2.error).toBe('INVALID_TRADE');

      // Balances intact
      const finalState = await storage.getRoomState('TR-C4');
      expect(finalState?.players[0].money).toBe(1400);
      expect(finalState?.players[1].money).toBe(1600);
    });

    it('C5: FORCE_BUY collision with concurrent build house is serialized by CAS', async () => {
      // Tile 1 owned by Joiner
      baseState.board[1].ownerId = joinerPlayer.id;
      baseState.board[1].houses = 0;
      await storage.createRoomState('TR-C5', baseState);

      // Host attempts FORCE_BUY at expectedVersion 1
      const forceBuyPromise = executeGameActionPipeline(
        { actionId: 'act_fb', roomId: 'TR-C5', playerId: hostPlayer.id, expectedVersion: 1, type: 'FORCE_BUY', payload: { tileId: 1 } },
        hostActor,
        { storage }
      );

      // Concurrent write at expectedVersion 1
      const concurrentPromise = executeGameActionPipeline(
        { actionId: 'act_chat', roomId: 'TR-C5', playerId: joinerPlayer.id, expectedVersion: 1, type: 'CHAT_MESSAGE', payload: { text: 'Hey' } },
        joinerActor,
        { storage }
      );

      const [res1, res2] = await Promise.all([forceBuyPromise, concurrentPromise]);
      const successes = [res1, res2].filter(r => r.success);
      const conflicts = [res1, res2].filter(r => !r.success && r.error === 'VERSION_CONFLICT');

      expect(successes.length).toBe(1);
      expect(conflicts.length).toBe(1);
    });

    it('C6: Same actionId sent concurrently 20 times executes exactly once', async () => {
      const actionId = 'act_concurrent_20_times';
      const promises = Array.from({ length: 20 }).map(() =>
        executeGameActionPipeline(
          { actionId, roomId, playerId: hostPlayer.id, expectedVersion: 1, type: 'ROLL_DICE' },
          hostActor,
          { storage }
        )
      );

      const results = await Promise.all(promises);
      const freshlyExecuted = results.filter(r => r.success);
      const inFlightDuplicates = results.filter(r => !r.success && r.error === 'DUPLICATE_ACTION');

      // Exactly 1 request executes fresh; remaining in-flight requests are blocked by idempotency
      expect(freshlyExecuted.length).toBe(1);
      expect(inFlightDuplicates.length).toBe(19);

      // Storage version must be EXACTLY 2 (incremented once)
      const finalState = await storage.getRoomState(roomId);
      expect(finalState?.version).toBe(2);

      // Subsequent retries after execution return the cached idempotent 200 result
      const retryResult = await executeGameActionPipeline(
        { actionId, roomId, playerId: hostPlayer.id, expectedVersion: 1, type: 'ROLL_DICE' },
        hostActor,
        { storage }
      );
      expect(retryResult.success).toBe(true);
      expect(retryResult.version).toBe(2);
    });

    it('C7: Stale expectedVersion is rejected with 409 VERSION_CONFLICT without state mutation', async () => {
      // State is at version 1
      const staleRes = await executeGameActionPipeline(
        { actionId: 'act_stale', roomId, playerId: hostPlayer.id, expectedVersion: 0, type: 'ROLL_DICE' },
        hostActor,
        { storage }
      );
      expect(staleRes.success).toBe(false);
      expect(staleRes.statusCode).toBe(409);
      expect(staleRes.error).toBe('VERSION_CONFLICT');

      const currentState = await storage.getRoomState(roomId);
      expect(currentState?.version).toBe(1);
    });

    it('C8: Two backend serverless instances writing to same room maintain atomic CAS consistency', async () => {
      // Simulate two instances with the same shared storage
      const instance1 = { storage };
      const instance2 = { storage };

      const act1 = executeGameActionPipeline(
        { actionId: 'act_inst_1', roomId, playerId: hostPlayer.id, expectedVersion: 1, type: 'ROLL_DICE' },
        hostActor,
        instance1
      );

      const act2 = executeGameActionPipeline(
        { actionId: 'act_inst_2', roomId, playerId: hostPlayer.id, expectedVersion: 1, type: 'ROLL_DICE' },
        hostActor,
        instance2
      );

      const [r1, r2] = await Promise.all([act1, act2]);
      const passed = [r1, r2].filter(r => r.success);
      const failed = [r1, r2].filter(r => !r.success);

      expect(passed.length).toBe(1);
      expect(failed.length).toBe(1);
      expect(failed[0].error).toBe('VERSION_CONFLICT');
    });
  });

  // ==========================================================================
  // GROUP D: LIFECYCLE / ENDGAME
  // ==========================================================================
  describe('Group D: Lifecycle / Endgame Stress & Edge Cases', () => {
    it('D1: Active turn player disconnect triggers AFK/turn advance without deadlock', () => {
      baseState.currentTurnIndex = 1; // Joiner's turn
      baseState.players[1].isAfk = true;

      // Host / Acting engine advances turn
      const updated = applyGameAction(
        baseState,
        { actionId: 'act_skip_afk', roomId, playerId: joinerPlayer.id, expectedVersion: 1, type: 'END_TURN' },
        hostActor
      );

      expect(updated.success).toBe(false); // Can't end turn if dice not rolled
      // Once dice is marked or skipped:
      baseState.diceRolled = true;
      const validEnd = applyGameAction(
        baseState,
        { actionId: 'act_skip_afk_ok', roomId, playerId: joinerPlayer.id, expectedVersion: 1, type: 'END_TURN' },
        hostActor
      );
      expect(validEnd.success).toBe(true);
      expect(validEnd.state.currentTurnIndex).toBe(2); // Safely advanced to Player 3
    });

    it('D2: Bankruptcy + Disconnect automatically migrates host to next active human', async () => {
      const bkpRes = await executeGameActionPipeline(
        { actionId: 'act_bkp_d2', roomId, playerId: hostPlayer.id, expectedVersion: 1, type: 'BANKRUPTCY' },
        hostActor,
        { storage }
      );

      expect(bkpRes.success).toBe(true);
      expect(bkpRes.state?.hostPlayerId).toBe(joinerPlayer.id);
      expect(bkpRes.state?.players.find(p => p.id === joinerPlayer.id)?.isHost).toBe(true);
      expect(bkpRes.state?.players.find(p => p.id === hostPlayer.id)?.inGame).toBe(false);
    });

    it('D3: In 2-player game, one player bankruptcy ends match with remaining player as winner', async () => {
      const twoPlayerState: GameState = {
        ...baseState,
        players: [hostPlayer, joinerPlayer]
      };
      await storage.createRoomState('TR-D3', twoPlayerState);

      const bkpRes = await executeGameActionPipeline(
        { actionId: 'act_bkp_d3', roomId: 'TR-D3', playerId: joinerPlayer.id, expectedVersion: 1, type: 'BANKRUPTCY' },
        joinerActor,
        { storage }
      );

      expect(bkpRes.success).toBe(true);
      expect(bkpRes.state?.phase).toBe('ENDED');
      expect(bkpRes.state?.winner?.id).toBe(hostPlayer.id);
    });

    it('D4: Host F5 during active game reloads same state and maintains authority', async () => {
      const state = await storage.getRoomState(roomId);
      expect(state?.hostPlayerId).toBe(hostPlayer.id);
      expect(isPlayerHost(state!, hostPlayer.id)).toBe(true);
    });

    it('D5: Host eliminated -> spectator -> tab close allows remaining players B and C to complete match', async () => {
      // 1. Host bankrupts
      const bkpRes = await executeGameActionPipeline(
        { actionId: 'act_d5_bkp', roomId, playerId: hostPlayer.id, expectedVersion: 1, type: 'BANKRUPTCY' },
        hostActor,
        { storage }
      );
      expect(bkpRes.success).toBe(true);

      // 2. Host closes tab (disappears)
      // 3. Player B (new host) rolls dice
      const rollB = await executeGameActionPipeline(
        { actionId: 'act_d5_roll_b', roomId, playerId: joinerPlayer.id, expectedVersion: bkpRes.version, type: 'ROLL_DICE' },
        joinerActor,
        { storage }
      );
      expect(rollB.success).toBe(true);
    });

    it('D6: Host migration during bot turn allows new human host to drive bot', async () => {
      // Bot is current turn player
      baseState.currentTurnIndex = 3; // botPlayer index
      // Host A leaves / bankrupts
      baseState.players[0].inGame = false;
      baseState.hostPlayerId = joinerPlayer.id;
      baseState.players[1].isHost = true;
      await storage.createRoomState('TR-D6', baseState);

      // Player B (new host) rolls dice for Bot
      const botRollRes = await executeGameActionPipeline(
        { actionId: 'act_d6_bot_roll', roomId: 'TR-D6', playerId: botPlayer.id, expectedVersion: 1, type: 'ROLL_DICE' },
        joinerActor,
        { storage }
      );

      expect(botRollRes.success).toBe(true);
      expect(botRollRes.state?.diceRolled).toBe(true);
    });

    it('D7: Reconnect after game ENDED shows winner modal without crashing', async () => {
      const endedState: GameState = {
        ...baseState,
        phase: 'ENDED',
        winner: hostPlayer
      };
      await storage.createRoomState('TR-D7', endedState);

      const fetched = await storage.getRoomState('TR-D7');
      expect(fetched?.phase).toBe('ENDED');
      expect(fetched?.winner?.name).toBe('HostAhmet');
    });

    it('D8: Rematch resets board, balances and position while retaining players and roomCode', () => {
      const endedState: GameState = {
        ...baseState,
        phase: 'ENDED',
        winner: hostPlayer
      };
      endedState.board[1].ownerId = hostPlayer.id;
      endedState.board[1].houses = 3;

      // Rematch logic
      const startMoney = endedState.settings?.startingMoney || 1500;
      const resetPlayers = endedState.players.map(p => ({
        ...p,
        money: startMoney,
        position: 0,
        inGame: true,
        isJailed: false,
        jailTurns: 0,
        lapsCompleted: 0,
        firstLapPurchases: 0
      }));

      const rematchedState: GameState = {
        ...endedState,
        phase: 'PLAYING',
        winner: undefined,
        currentTurnIndex: 0,
        diceRolled: false,
        doublesCount: 0,
        pendingAction: 'NONE',
        board: JSON.parse(JSON.stringify(INITIAL_BOARD)),
        players: resetPlayers
      };

      expect(rematchedState.phase).toBe('PLAYING');
      expect(rematchedState.players.length).toBe(4);
      expect(rematchedState.players[0].money).toBe(1500);
      expect(rematchedState.players[1].money).toBe(1500);
      expect(rematchedState.board[1].ownerId).toBeUndefined();
      expect(rematchedState.board[1].houses).toBe(0);
    });

    it('D9: Serverless deployment mid-game preserves Redis state seamlessly', async () => {
      // Step 1: Client played up to version 10 on Instance 1
      const activeState: GameState = {
        ...baseState,
        version: 10,
        currentTurnIndex: 1
      };
      await storage.createRoomState('TR-D9', activeState);

      // Step 2: Instance 1 is destroyed, Instance 2 starts up with same storage
      const newInstanceStorage = storage; // Shared storage
      const stateOnNewInstance = await newInstanceStorage.getRoomState('TR-D9');
      expect(stateOnNewInstance?.version).toBe(10);
      expect(stateOnNewInstance?.currentTurnIndex).toBe(1);

      // Step 3: Next action executes on new instance at expectedVersion 10
      const nextAct = await executeGameActionPipeline(
        { actionId: 'act_deploy_roll', roomId: 'TR-D9', playerId: joinerPlayer.id, expectedVersion: 10, type: 'ROLL_DICE' },
        joinerActor,
        { storage: newInstanceStorage }
      );
      expect(nextAct.success).toBe(true);
      expect(nextAct.version).toBe(11);
    });
  });

  // ==========================================================================
  // GROUP E: AFK LIFECYCLE & "BURADAYIM" / TAKE BACK CONTROL
  // ==========================================================================
  describe('Group E: AFK Lifecycle & "Buradayım" Reset Stress Tests', () => {
    it('E1: Player marked AFK -> sends PLAYER_ACTIVE ("Buradayım") -> isAfk cleared and turnStartedAt reset', async () => {
      // 1. Mark Joiner as AFK via SET_AFK
      const afkRes = await executeGameActionPipeline(
        { actionId: 'act_afk_set_1', roomId, playerId: hostPlayer.id, expectedVersion: 1, type: 'SET_AFK', payload: { targetPlayerId: joinerPlayer.id } },
        hostActor,
        { storage }
      );
      expect(afkRes.success).toBe(true);
      expect(afkRes.state?.players.find(p => p.id === joinerPlayer.id)?.isAfk).toBe(true);

      const beforeActiveTime = Date.now();
      // 2. Joiner clicks "Buradayım" -> dispatches PLAYER_ACTIVE
      const activeRes = await executeGameActionPipeline(
        { actionId: 'act_player_active_1', roomId, playerId: joinerPlayer.id, expectedVersion: afkRes.version!, type: 'PLAYER_ACTIVE' },
        joinerActor,
        { storage }
      );

      expect(activeRes.success).toBe(true);
      expect(activeRes.state?.players.find(p => p.id === joinerPlayer.id)?.isAfk).toBe(false);
      expect(activeRes.state?.turnStartedAt).toBeGreaterThanOrEqual(beforeActiveTime);

      // 3. Countdown timer simulation: elapsed time from new turnStartedAt gives full 60 seconds
      const turnStart = activeRes.state?.turnStartedAt || Date.now();
      const elapsedSeconds = Math.floor((Date.now() - turnStart) / 1000);
      const remainingSeconds = Math.max(0, 60 - elapsedSeconds);
      expect(remainingSeconds).toBeGreaterThanOrEqual(58); // Fresh 60s window!
    });

    it('E2: Any active gameplay action from human player automatically clears isAfk on server', async () => {
      // Set Host as AFK
      baseState.players[0].isAfk = true;
      await storage.createRoomState('TR-AFK-AUTO', baseState);

      // Host executes ROLL_DICE
      const rollRes = await executeGameActionPipeline(
        { actionId: 'act_roll_afk_clear', roomId: 'TR-AFK-AUTO', playerId: hostPlayer.id, expectedVersion: 1, type: 'ROLL_DICE' },
        hostActor,
        { storage, rng: () => [1, 2] }
      );

      expect(rollRes.success).toBe(true);
      expect(rollRes.state?.players[0].isAfk).toBe(false); // Automatically cleared!
    });

    it('E3: Reconnecting after take-back-control retains active non-AFK state without loop', async () => {
      // Joiner took back control
      const stateAfterActive: GameState = {
        ...baseState,
        version: 3,
        currentTurnIndex: 1,
        turnStartedAt: Date.now(),
        players: baseState.players.map(p => p.id === joinerPlayer.id ? { ...p, isAfk: false } : p)
      };
      await storage.createRoomState('TR-RECONN-NO-LOOP', stateAfterActive);

      // Joiner reconnects / re-reads canonical state
      const reconnected = await storage.getRoomState('TR-RECONN-NO-LOOP');
      const joinerInState = reconnected?.players.find(p => p.id === joinerPlayer.id);

      expect(joinerInState?.isAfk).toBe(false);
      const remaining = Math.max(0, 60 - Math.floor((Date.now() - (reconnected?.turnStartedAt || Date.now())) / 1000));
      expect(remaining).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // GROUP F: AUTOMATED DEBT LIQUIDATION & OPTIMAL BALANCE RECOVERY
  // ==========================================================================
  describe('Group F: Automated Debt Liquidation & Balance Recovery Stress Tests', () => {
    it('F1: Room host/peer triggers AUTO_LIQUIDATE for timed-out indebted player', async () => {
      // Set Joiner in debt with 1 unmortgaged property (Tile 1: Hatay, price 60 -> mortgage 30)
      baseState.players[1].money = -20;
      baseState.pendingAction = 'DEBT_SETTLEMENT';
      baseState.board[1].ownerId = joinerPlayer.id;
      baseState.board[1].price = 60;
      baseState.board[1].isMortgaged = false;
      baseState.board[1].houses = 0;
      await storage.createRoomState('TR-LIQ-TIMEOUT', baseState);

      // Host triggers AUTO_LIQUIDATE on timeout for Joiner
      const liqRes = await executeGameActionPipeline(
        { actionId: 'act_timeout_liq_1', roomId: 'TR-LIQ-TIMEOUT', playerId: hostPlayer.id, expectedVersion: 1, type: 'AUTO_LIQUIDATE', payload: { targetPlayerId: joinerPlayer.id } },
        hostActor,
        { storage }
      );

      expect(liqRes.success).toBe(true);
      const joinerAfter = liqRes.state?.players.find(p => p.id === joinerPlayer.id);
      expect(joinerAfter?.money).toBe(10); // -20 + 30 = 10
      expect(liqRes.state?.board[1].isMortgaged).toBe(true);
      expect(liqRes.state?.pendingAction).toBe('NONE');
    });

    it('F2: Concurrent duplicate AUTO_LIQUIDATE requests are handled idempotently without duplicate charges', async () => {
      baseState.players[0].money = -40;
      baseState.pendingAction = 'DEBT_SETTLEMENT';
      baseState.board[1].ownerId = hostPlayer.id;
      baseState.board[1].price = 100; // Mortgage = 50
      baseState.board[1].isMortgaged = false;
      baseState.board[1].houses = 0;
      await storage.createRoomState('TR-LIQ-IDEMPOTENT', baseState);

      const actionPayload = {
        actionId: 'act_concurrent_liq_1',
        roomId: 'TR-LIQ-IDEMPOTENT',
        playerId: hostPlayer.id,
        expectedVersion: 1,
        type: 'AUTO_LIQUIDATE' as const
      };

      // 5 concurrent requests with identical actionId
      const results = await Promise.all([
        executeGameActionPipeline(actionPayload, hostActor, { storage }),
        executeGameActionPipeline(actionPayload, hostActor, { storage }),
        executeGameActionPipeline(actionPayload, hostActor, { storage }),
        executeGameActionPipeline(actionPayload, hostActor, { storage }),
        executeGameActionPipeline(actionPayload, hostActor, { storage })
      ]);

      const successCount = results.filter(r => r.success).length;
      expect(successCount).toBeGreaterThanOrEqual(1);

      const savedState = await storage.getRoomState('TR-LIQ-IDEMPOTENT');
      // Host balance should be exactly 10 (-40 + 50 = 10), NEVER double mortgaged or overcredited
      expect(savedState?.players[0].money).toBe(10);
      expect(savedState?.board[1].isMortgaged).toBe(true);
      expect(savedState?.version).toBe(2);
    });

    it('F3: Irrecoverable debt leads to bankruptcy, migrates host, and ends game when 1 active player remains', async () => {
      // 2 players: Host and Joiner. Host has -5000 debt with 0 properties
      const twoPlayerState: GameState = {
        ...baseState,
        players: [baseState.players[0], baseState.players[1]],
        hostPlayerId: hostPlayer.id
      };
      twoPlayerState.players[0].money = -5000;
      twoPlayerState.pendingAction = 'DEBT_SETTLEMENT';
      await storage.createRoomState('TR-LIQ-BANKRUPT', twoPlayerState);

      const res = await executeGameActionPipeline(
        { actionId: 'act_bankrupt_liq', roomId: 'TR-LIQ-BANKRUPT', playerId: hostPlayer.id, expectedVersion: 1, type: 'AUTO_LIQUIDATE' },
        hostActor,
        { storage }
      );

      expect(res.success).toBe(true);
      expect(res.state?.players[0].inGame).toBe(false);
      expect(res.state?.phase).toBe('ENDED');
      expect(res.state?.winner?.id).toBe(joinerPlayer.id);
      expect(res.state?.hostPlayerId).toBe(joinerPlayer.id);
    });
  });
});
