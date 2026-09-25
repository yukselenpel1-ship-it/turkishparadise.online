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
  'SET_AFK',
  'AUTO_LIQUIDATE',
  'LEAVE_AND_REPLACE_WITH_BOT',
  'TAKE_OVER_REPLACEMENT_BOT',
  'CLAIM_REPLACEMENT_SEAT'
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
    if (!payload || typeof payload !== 'object') {
      return { valid: false, error: 'INVALID_SETTINGS', message: 'Oda ayarları verisi geçersiz.' };
    }
    const sanitized: Record<string, any> = {};

    if (payload.passGoSalary !== undefined) {
      if (typeof payload.passGoSalary !== 'number' || Number.isNaN(payload.passGoSalary) || ![200, 300, 400, 500].includes(payload.passGoSalary)) {
        return {
          valid: false,
          error: 'INVALID_SETTINGS',
          message: 'Başlangıç geçiş ödülü yalnızca 200, 300, 400 veya 500 olabilir.'
        };
      }
      sanitized.passGoSalary = payload.passGoSalary;
    }

    if (payload.firstLapBuyLimit !== undefined) {
      if (typeof payload.firstLapBuyLimit !== 'number' || Number.isNaN(payload.firstLapBuyLimit) || ![0, 1, 2, 3, 4].includes(payload.firstLapBuyLimit)) {
        return {
          valid: false,
          error: 'INVALID_SETTINGS',
          message: 'İlk tur alım limiti geçersiz (0, 1, 2, 3 veya 4 olmalıdır).'
        };
      }
      sanitized.firstLapBuyLimit = payload.firstLapBuyLimit;
    }

    if (payload.startingMoney !== undefined) {
      if (typeof payload.startingMoney !== 'number' || Number.isNaN(payload.startingMoney) || ![1000, 1500, 2000, 2500, 3000].includes(payload.startingMoney)) {
        return {
          valid: false,
          error: 'INVALID_SETTINGS',
          message: 'Başlangıç parası geçersiz (1000, 1500, 2000, 2500 veya 3000 olmalıdır).'
        };
      }
      sanitized.startingMoney = payload.startingMoney;
    }

    if (payload.botDifficulty !== undefined) {
      if (!['easy', 'medium', 'hard'].includes(payload.botDifficulty)) {
        return {
          valid: false,
          error: 'INVALID_SETTINGS',
          message: 'Bot zorluk seviyesi geçersiz.'
        };
      }
      sanitized.botDifficulty = payload.botDifficulty;
    }

    if (payload.isPublic !== undefined) {
      if (typeof payload.isPublic !== 'boolean') {
        return {
          valid: false,
          error: 'INVALID_SETTINGS',
          message: 'Oda görünürlük ayarı (isPublic) boolean olmalıdır.'
        };
      }
      sanitized.isPublic = payload.isPublic;
    }

    sanitizedPayload = sanitized;
  } else if (type === 'SET_AFK' || type === 'AUTO_LIQUIDATE') {
    const targetPlayerId = typeof payload?.targetPlayerId === 'string' ? payload.targetPlayerId.trim() : undefined;
    sanitizedPayload = { targetPlayerId };
  } else if (type === 'CONFIRM_CHANCE') {
    const targetPlayerId = typeof payload?.targetPlayerId === 'string' && payload.targetPlayerId.trim().length > 0
      ? payload.targetPlayerId.trim()
      : undefined;
    const tileId = typeof payload?.tileId === 'number' && Number.isInteger(payload.tileId) && payload.tileId >= 0 && payload.tileId < TOTAL_TILES
      ? payload.tileId
      : undefined;
    sanitizedPayload = { targetPlayerId, tileId };
  } else if (type === 'TAKE_OVER_REPLACEMENT_BOT' || type === 'CLAIM_REPLACEMENT_SEAT') {
    const targetPlayerId = typeof payload?.targetPlayerId === 'string' ? payload.targetPlayerId.trim() : undefined;
    const name = typeof payload?.name === 'string' ? payload.name.trim().substring(0, 30) : undefined;
    const avatar = typeof payload?.avatar === 'string' ? payload.avatar.trim() : undefined;
    const color = typeof payload?.color === 'string' ? payload.color.trim() : undefined;
    const userId = typeof payload?.userId === 'string' ? payload.userId.trim() : undefined;
    const participantKey = typeof payload?.participantKey === 'string' ? payload.participantKey.trim() : undefined;
    const clientId = typeof payload?.clientId === 'string' ? payload.clientId.trim() : undefined;
    const tabId = typeof payload?.tabId === 'string' ? payload.tabId.trim() : undefined;
    sanitizedPayload = { targetPlayerId, name, avatar, color, userId, participantKey, clientId, tabId };
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
