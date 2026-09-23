import { TOTAL_TILES } from '../../engine/gameEngine';

export const ALLOWED_ACTION_TYPES = [
  'CREATE_ROOM',
  'INIT_ROOM',
  'JOIN_ROOM',
  'START_GAME',
  'ROLL_DICE',
  'BUY_PROPERTY',
  'PASS_PROPERTY',
  'END_TURN',
  'PAY_JAIL',
  'BUILD_HOUSE',
  'SELL_HOUSE',
  'MORTGAGE',
  'UNMORTGAGE',
  'SELL_TO_BANK',
  'CONFIRM_CHANCE',
  'TRADE_OFFER',
  'TRADE_ACCEPT',
  'ACCEPT_TRADE',
  'TRADE_DECLINE',
  'DECLINE_TRADE',
  'FORCE_BUY',
  'ADD_BOT',
  'REMOVE_BOT',
  'UPDATE_SETTINGS',
  'CHAT_MESSAGE',
  'BANKRUPTCY',
  'PLAYER_ACTIVE',
  'SET_AFK'
] as const;

export type ValidActionType = typeof ALLOWED_ACTION_TYPES[number];

export const MAX_REQUEST_BODY_BYTES = 16 * 1024; // 16 KB

export interface ValidatedGameActionRequest {
  actionId: string;
  roomId: string;
  playerId: string;
  expectedVersion: number;
  type: ValidActionType;
  payload?: Record<string, any>;
}

export interface SchemaValidationResult {
  valid: boolean;
  action?: ValidatedGameActionRequest;
  error?: string;
  message?: string;
}

/**
 * Validates incoming POST /api/game/action JSON body against strict schema.
 */
export function validateActionRequest(body: any): SchemaValidationResult {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {
      valid: false,
      error: 'INVALID_ACTION',
      message: 'İstek gövdesi (body) geçerli bir JSON nesnesi olmalıdır.'
    };
  }

  // Check request size bounds
  try {
    const rawLen = JSON.stringify(body).length;
    if (rawLen > MAX_REQUEST_BODY_BYTES) {
      return {
        valid: false,
        error: 'INVALID_ACTION',
        message: `İstek boyutu izin verilen maksimum sınırı (${MAX_REQUEST_BODY_BYTES} byte) aşıyor.`
      };
    }
  } catch {
    return {
      valid: false,
      error: 'INVALID_ACTION',
      message: 'İstek serileştirilemedi.'
    };
  }

  const { actionId, roomId, playerId, expectedVersion, type, payload } = body;

  // 1. Validate actionId
  if (
    !actionId ||
    typeof actionId !== 'string' ||
    actionId.trim().length === 0 ||
    actionId.length > 100 ||
    !/^[a-zA-Z0-9_\-.:]+$/.test(actionId.trim())
  ) {
    return {
      valid: false,
      error: 'INVALID_ACTION',
      message: 'actionId zorunludur, 1-100 karakter arası alfanümerik olmalıdır.'
    };
  }

  // 2. Validate roomId
  if (
    !roomId ||
    typeof roomId !== 'string' ||
    roomId.trim().length === 0 ||
    roomId.length > 50 ||
    !/^[a-zA-Z0-9_\-]+$/.test(roomId.trim())
  ) {
    return {
      valid: false,
      error: 'INVALID_ACTION',
      message: 'roomId zorunludur ve geçerli bir oda kodu olmalıdır.'
    };
  }

  // 3. Validate playerId
  if (
    !playerId ||
    typeof playerId !== 'string' ||
    playerId.trim().length === 0 ||
    playerId.length > 64
  ) {
    return {
      valid: false,
      error: 'INVALID_ACTION',
      message: 'playerId zorunludur ve geçerli bir oyuncu kimliği olmalıdır.'
    };
  }

  // 4. Validate expectedVersion
  if (
    typeof expectedVersion !== 'number' ||
    !Number.isInteger(expectedVersion) ||
    expectedVersion < 0
  ) {
    return {
      valid: false,
      error: 'INVALID_ACTION',
      message: 'expectedVersion zorunludur ve pozitif bir tam sayı olmalıdır.'
    };
  }

  // 5. Validate action type
  if (!type || typeof type !== 'string' || !ALLOWED_ACTION_TYPES.includes(type as ValidActionType)) {
    return {
      valid: false,
      error: 'INVALID_ACTION',
      message: `Tanımlanmamış veya geçersiz eylem türü: "${type}". İzin verilenler: ${ALLOWED_ACTION_TYPES.join(', ')}`
    };
  }

  // 6. Validate payload structure per action type
  let sanitizedPayload: Record<string, any> | undefined = undefined;

  if (
    type === 'BUILD_HOUSE' ||
    type === 'SELL_HOUSE' ||
    type === 'MORTGAGE' ||
    type === 'UNMORTGAGE' ||
    type === 'SELL_TO_BANK' ||
    type === 'FORCE_BUY'
  ) {
    if (!payload || typeof payload !== 'object') {
      return {
        valid: false,
        error: 'INVALID_PROPERTY',
        message: `${type} eylemi için tileId parametresi içeren payload zorunludur.`
      };
    }
    const tileId = payload.tileId;
    if (typeof tileId !== 'number' || !Number.isInteger(tileId) || tileId < 0 || tileId >= TOTAL_TILES) {
      return {
        valid: false,
        error: 'INVALID_PROPERTY',
        message: `Geçersiz tileId: ${tileId}. 0 ile ${TOTAL_TILES - 1} arasında olmalıdır.`
      };
    }
    sanitizedPayload = { tileId };
  } else if (type === 'TRADE_OFFER') {
    if (!payload || typeof payload !== 'object') {
      return { valid: false, error: 'INVALID_TRADE', message: 'Takas teklif verisi eksik.' };
    }
    const toPlayerId = payload.toPlayerId;
    const offeredTileIds = Array.isArray(payload.offeredTileIds) ? payload.offeredTileIds.filter((x: any) => typeof x === 'number') : [];
    const requestedTileIds = Array.isArray(payload.requestedTileIds) ? payload.requestedTileIds.filter((x: any) => typeof x === 'number') : [];
    const offeredMoney = typeof payload.offeredMoney === 'number' && payload.offeredMoney >= 0 ? payload.offeredMoney : 0;
    const requestedMoney = typeof payload.requestedMoney === 'number' && payload.requestedMoney >= 0 ? payload.requestedMoney : 0;

    if (!toPlayerId || typeof toPlayerId !== 'string') {
      return { valid: false, error: 'INVALID_TRADE', message: 'Takas hedef oyuncusu (toPlayerId) zorunludur.' };
    }
    sanitizedPayload = {
      fromPlayerId: playerId.trim(),
      toPlayerId: toPlayerId.trim(),
      offeredTileIds,
      requestedTileIds,
      offeredMoney,
      requestedMoney
    };
  } else if (type === 'CHAT_MESSAGE') {
    if (!payload || typeof payload.text !== 'string') {
      return { valid: false, error: 'INVALID_ACTION', message: 'Sohbet mesajı metni zorunludur.' };
    }
    const text = payload.text.trim().substring(0, 250);
    sanitizedPayload = { text };
  } else if (type === 'ADD_BOT') {
    const difficulty = payload?.difficulty === 'easy' || payload?.difficulty === 'hard' ? payload.difficulty : 'medium';
    sanitizedPayload = { difficulty };
  } else if (type === 'REMOVE_BOT') {
    const botId = typeof payload?.botId === 'string' ? payload.botId.trim() : undefined;
    sanitizedPayload = { botId };
  } else if (type === 'UPDATE_SETTINGS') {
    sanitizedPayload = payload && typeof payload === 'object' ? payload : {};
  } else if (type === 'SET_AFK') {
    const targetPlayerId = typeof payload?.targetPlayerId === 'string' ? payload.targetPlayerId.trim() : undefined;
    sanitizedPayload = { targetPlayerId };
  } else if (payload && typeof payload === 'object') {
    sanitizedPayload = {};
  }

  return {
    valid: true,
    action: {
      actionId: actionId.trim(),
      roomId: roomId.trim().toUpperCase(),
      playerId: playerId.trim(),
      expectedVersion,
      type: type as ValidActionType,
      payload: sanitizedPayload
    }
  };
}
