import crypto from 'crypto';
import { IRoomStorage, roomStorage, GameAction } from '../storage/roomStorage';
import { applyGameAction, EngineOptions } from './serverGameEngine';
import { AuthenticatedActor, validateActorMatchesPlayer } from '../auth/authMiddleware';
import { validateActionRequest, ValidatedGameActionRequest } from '../validation/actionSchema';
import { publishRoomStateUpdateNotification } from '../notification/mqttNotifier';
import { GameState, Player } from '../../types/game';
import { createInitialState } from '../../engine/gameEngine';

export interface ActionPipelineResult {
  success: boolean;
  statusCode: number;
  roomId?: string;
  actionId?: string;
  version?: number;
  currentVersion?: number;
  state?: GameState;
  events?: any[];
  error?: string;
  message?: string;
}

export interface PipelineOptions extends EngineOptions {
  storage?: IRoomStorage;
}

/**
 * Robust, production-ready Server-Side Action Pipeline
 * Executes the full Lifecycle:
 * Validate -> Fingerprint/Idempotency -> Load -> Apply -> Atomic CAS -> Record -> Notify -> Response
 */
export async function executeGameActionPipeline(
  body: any,
  actor: AuthenticatedActor,
  options?: PipelineOptions
): Promise<ActionPipelineResult> {
  const storage = options?.storage || roomStorage;
  const now = options?.now || Date.now();

  // --------------------------------------------------------------------------
  // 1. REQUEST SCHEMA VALIDATION
  // --------------------------------------------------------------------------
  const schemaRes = validateActionRequest(body);
  if (!schemaRes.valid || !schemaRes.action) {
    return {
      success: false,
      statusCode: 400,
      error: schemaRes.error || 'INVALID_ACTION',
      message: schemaRes.message || 'Geçersiz eylem verisi.'
    };
  }

  const validAction: ValidatedGameActionRequest = schemaRes.action;
  const { roomId, actionId, playerId, expectedVersion, type, payload } = validAction;

  // --------------------------------------------------------------------------
  // 2. IDEMPOTENCY & FINGERPRINT CHECK
  // --------------------------------------------------------------------------
  const actionFingerprint = crypto
    .createHash('sha256')
    .update(JSON.stringify({ roomId, playerId, type, payload }))
    .digest('hex');

  try {
    const idempotency = await storage.checkAndRecordActionIdempotency(roomId, actionId, actionFingerprint);
    if (idempotency.isDuplicate) {
      if (idempotency.isFingerprintMismatch) {
        return {
          success: false,
          statusCode: 400,
          error: 'INVALID_ACTION',
          message: 'Aynı actionId farklı parametreler veya eylem türü ile tekrar kullanılamaz.'
        };
      }
      if (idempotency.status === 'PROCESSED' && idempotency.cachedResult) {
        return {
          success: true,
          statusCode: 200,
          ...idempotency.cachedResult
        };
      }
      return {
        success: false,
        statusCode: 409,
        error: 'DUPLICATE_ACTION',
        message: `Bu eylem (${actionId}) zaten işlendi veya devam ediyor.`
      };
    }
  } catch (err: any) {
    if (err?.message?.includes('STORAGE_UNAVAILABLE')) {
      return {
        success: false,
        statusCode: 503,
        error: 'STORAGE_UNAVAILABLE',
        message: 'Depolama servisine ulaşılamıyor.'
      };
    }
  }

  // --------------------------------------------------------------------------
  // 3. LOAD CANONICAL STATE FROM STORAGE
  // --------------------------------------------------------------------------
  let currentState: GameState | null = null;
  try {
    currentState = await storage.getRoomState(roomId);
  } catch (err: any) {
    if (err?.message?.includes('STORAGE_UNAVAILABLE')) {
      return {
        success: false,
        statusCode: 503,
        error: 'STORAGE_UNAVAILABLE',
        message: 'Depolama servisine ulaşılamıyor.'
      };
    }
    return {
      success: false,
      statusCode: 500,
      error: 'STORAGE_ERROR',
      message: 'Oda durumu yüklenirken sunucu hatası oluştu.'
    };
  }

  if (!currentState) {
    if (type === 'CREATE_ROOM' || type === 'INIT_ROOM') {
      const rawSettings = payload || {};
      const startingMoney = typeof rawSettings.startingMoney === 'number' && rawSettings.startingMoney >= 500 && rawSettings.startingMoney <= 5000
        ? rawSettings.startingMoney
        : 1500;
      const isPublic = typeof rawSettings.isPublic === 'boolean' ? rawSettings.isPublic : false;

      const hostP: Player = {
        id: playerId,
        userId: actor.userId,
        participantKey: actor.participantKey,
        name: actor.displayName || 'Oda Kurucusu',
        avatar: '🎩',
        color: '#3B82F6',
        money: startingMoney,
        position: 0,
        isJailed: false,
        jailTurns: 0,
        inGame: true,
        isBot: false,
        isHost: true,
        lapsCompleted: 0,
        firstLapPurchases: 0
      };

      const newInitialState = createInitialState({
        roomCode: roomId,
        startingMoney,
        isPublic
      });
      newInitialState.roomId = roomId;
      newInitialState.hostPlayerId = playerId;
      newInitialState.players = [hostP];
      newInitialState.version = 1;

      try {
        const savedState = await storage.createRoomState(roomId, newInitialState);
        await storage.recordActionCompletion(roomId, actionId, actionFingerprint, {
          roomId,
          actionId,
          version: savedState.version,
          state: savedState
        });

        await publishRoomStateUpdateNotification(roomId, savedState.version ?? 1, now);

        return {
          success: true,
          statusCode: 200,
          roomId,
          actionId,
          version: savedState.version,
          state: savedState
        };
      } catch (err: any) {
        if (err?.message?.includes('STORAGE_UNAVAILABLE')) {
          return { success: false, statusCode: 503, error: 'STORAGE_UNAVAILABLE', message: 'Depolama servisine ulaşılamıyor.' };
        }
        return { success: false, statusCode: 500, error: 'STORAGE_ERROR', message: 'Oda oluşturulamadı.' };
      }
    }

    return {
      success: false,
      statusCode: 404,
      error: 'ROOM_NOT_FOUND',
      message: `"${roomId}" kodlu oda bulunamadı.`
    };
  }

  // --------------------------------------------------------------------------
  // 4. IDENTITY & ACTOR-TO-PLAYER VALIDATION
  // --------------------------------------------------------------------------
  const matchResult = validateActorMatchesPlayer(actor, currentState, playerId);
  if (!matchResult.valid) {
    return {
      success: false,
      statusCode: 403,
      error: matchResult.error || 'UNAUTHORIZED_PLAYER',
      message: matchResult.message || 'Yetkisiz oyuncu eylemi.'
    };
  }

  // --------------------------------------------------------------------------
  // 5. EXECUTE PURE SERVER GAME ENGINE
  // --------------------------------------------------------------------------
  const gameAction: GameAction = {
    actionId,
    roomId,
    playerId,
    expectedVersion,
    type,
    payload,
    timestamp: now
  };

  const engineRes = applyGameAction(currentState, gameAction, actor, options);
  if (!engineRes.success || !engineRes.state) {
    return {
      success: false,
      statusCode: 400,
      error: engineRes.error || 'INVALID_ACTION',
      message: engineRes.errorMessage || 'Eylem kural hatası.',
      currentVersion: currentState.version
    };
  }

  // --------------------------------------------------------------------------
  // 6. ATOMIC CAS COMMIT (Compare-And-Swap)
  // --------------------------------------------------------------------------
  const casResult = await storage.saveRoomStateWithVersion(roomId, expectedVersion, engineRes.state);
  if (!casResult.success) {
    if (casResult.error === 'VERSION_CONFLICT') {
      return {
        success: false,
        statusCode: 409,
        error: 'VERSION_CONFLICT',
        message: 'Oda durumu değişmiş. Lütfen güncel durumu alıp işlemi tekrar deneyin.',
        currentVersion: casResult.currentVersion || currentState.version
      };
    }
    if (casResult.error === 'STORAGE_UNAVAILABLE') {
      return {
        success: false,
        statusCode: 503,
        error: 'STORAGE_UNAVAILABLE',
        message: 'Depolama servisine ulaşılamıyor.'
      };
    }
    return {
      success: false,
      statusCode: 500,
      error: casResult.error || 'CAS_ERROR',
      message: 'Oda durumu kaydedilemedi.'
    };
  }

  const nextVersion = casResult.currentVersion || expectedVersion + 1;

  // --------------------------------------------------------------------------
  // 7. RECORD ACTION COMPLETION CACHE
  // --------------------------------------------------------------------------
  const successResponse = {
    roomId,
    actionId,
    version: nextVersion,
    state: casResult.state,
    events: engineRes.events
  };

  await storage.recordActionCompletion(roomId, actionId, actionFingerprint, successResponse);

  // --------------------------------------------------------------------------
  // 8. LIGHTWEIGHT MQTT NOTIFICATION BROADCAST
  // --------------------------------------------------------------------------
  await publishRoomStateUpdateNotification(roomId, nextVersion, now);

  // --------------------------------------------------------------------------
  // 9. RETURN SANITIZED SUCCESS RESULT
  // --------------------------------------------------------------------------
  return {
    success: true,
    statusCode: 200,
    ...successResponse
  };
}
