import { GameState, Player, BoardTile, GameSettings, ActionType, ChanceCard, TradeOffer, GameLog, ChatMessage, FinancialTransaction } from '../../types/game';

export interface GameAction {
  actionId: string;
  roomId: string;
  playerId: string;
  userId?: string;
  expectedVersion?: number;
  type: string;
  payload?: any;
  timestamp?: number;
}

export interface SaveStateResult {
  success: boolean;
  state?: GameState;
  currentVersion?: number;
  error?: string;
}

export interface IdempotencyResult {
  isDuplicate: boolean;
  recordedAt?: number;
}

// TTL Configurations
export const GAME_STATE_TTL_SECONDS = 7200; // 2 hours of inactivity
export const ACTION_IDEMPOTENCY_TTL_SECONDS = 60; // 60 seconds duplicate protection

// Maximum array lengths in canonical state to avoid Redis memory bloat
const MAX_LOGS_COUNT = 30;
const MAX_CHAT_MESSAGES_COUNT = 50;
const MAX_TRANSACTIONS_COUNT = 50;

/**
 * Clean & normalize roomId (e.g. 'tr-1001 ' -> 'TR-1001')
 */
export function normalizeRoomId(roomId: string): string {
  if (!roomId || typeof roomId !== 'string') return '';
  return roomId.trim().toUpperCase();
}

/**
 * Generate Redis key for canonical room state
 */
export function getRoomStateKey(roomId: string): string {
  return `tp:room:${normalizeRoomId(roomId)}:state`;
}

/**
 * Generate Redis key for action idempotency
 */
export function getActionIdempotencyKey(roomId: string, actionId: string): string {
  return `tp:room:${normalizeRoomId(roomId)}:action:${actionId.trim()}`;
}

/**
 * Sanitize and bound arrays inside GameState before persisting
 */
export function sanitizeGameStateForStorage(state: GameState): GameState {
  const sanitized = { ...state };

  if (Array.isArray(sanitized.logs)) {
    sanitized.logs = sanitized.logs.slice(0, MAX_LOGS_COUNT);
  }
  if (Array.isArray(sanitized.chatMessages)) {
    sanitized.chatMessages = sanitized.chatMessages.slice(-MAX_CHAT_MESSAGES_COUNT);
  }
  if (Array.isArray(sanitized.transactions)) {
    sanitized.transactions = sanitized.transactions.slice(0, MAX_TRANSACTIONS_COUNT);
  }

  return sanitized;
}

/**
 * Interface defining Redis / Memory storage operations
 */
export interface IRoomStorage {
  getRoomState(roomId: string): Promise<GameState | null>;
  createRoomState(roomId: string, state: GameState): Promise<GameState>;
  saveRoomStateWithVersion(roomId: string, expectedVersion: number, newState: GameState): Promise<SaveStateResult>;
  deleteRoomState(roomId: string): Promise<boolean>;
  touchRoom(roomId: string): Promise<boolean>;
  checkAndRecordActionIdempotency(roomId: string, actionId: string, ttlSeconds?: number): Promise<IdempotencyResult>;
  clearAll(): Promise<void>; // For testing
}

/**
 * In-Memory Atomic CAS Storage Implementation
 * Provides 100% specification compliance for local testing, CI, and fallback
 */
export class InMemoryRoomStorage implements IRoomStorage {
  private states = new Map<string, { state: GameState; expiresAt: number }>();
  private actions = new Map<string, { recordedAt: number; expiresAt: number }>();

  public async getRoomState(roomId: string): Promise<GameState | null> {
    const cleanId = normalizeRoomId(roomId);
    if (!cleanId) return null;

    const entry = this.states.get(cleanId);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.states.delete(cleanId);
      return null;
    }

    return JSON.parse(JSON.stringify(entry.state));
  }

  public async createRoomState(roomId: string, state: GameState): Promise<GameState> {
    const cleanId = normalizeRoomId(roomId);
    if (!cleanId) throw new Error('INVALID_ROOM_ID');
    if (!state || typeof state !== 'object') throw new Error('MALFORMED_STATE');

    const cleanState = sanitizeGameStateForStorage(state);
    const initialVersion = typeof cleanState.version === 'number' && cleanState.version > 0 ? cleanState.version : 1;
    cleanState.version = initialVersion;
    cleanState.roomId = cleanId;
    cleanState.updatedAt = Date.now();

    this.states.set(cleanId, {
      state: JSON.parse(JSON.stringify(cleanState)),
      expiresAt: Date.now() + GAME_STATE_TTL_SECONDS * 1000
    });

    return JSON.parse(JSON.stringify(cleanState));
  }

  public async saveRoomStateWithVersion(
    roomId: string,
    expectedVersion: number,
    newState: GameState
  ): Promise<SaveStateResult> {
    const cleanId = normalizeRoomId(roomId);
    if (!cleanId) return { success: false, error: 'INVALID_ROOM_ID' };
    if (!newState || typeof newState !== 'object') return { success: false, error: 'MALFORMED_STATE' };

    const entry = this.states.get(cleanId);
    if (!entry || Date.now() > entry.expiresAt) {
      return { success: false, error: 'ROOM_NOT_FOUND' };
    }

    const currentVersion = entry.state.version || 0;

    // 🛡️ ATOMIC CAS / VERSION GUARD
    if (expectedVersion !== currentVersion) {
      return {
        success: false,
        error: 'VERSION_CONFLICT',
        currentVersion
      };
    }

    const cleanState = sanitizeGameStateForStorage(newState);
    const nextVersion = currentVersion + 1;
    cleanState.version = nextVersion;
    cleanState.roomId = cleanId;
    cleanState.updatedAt = Date.now();

    this.states.set(cleanId, {
      state: JSON.parse(JSON.stringify(cleanState)),
      expiresAt: Date.now() + GAME_STATE_TTL_SECONDS * 1000
    });

    return {
      success: true,
      state: JSON.parse(JSON.stringify(cleanState)),
      currentVersion: nextVersion
    };
  }

  public async deleteRoomState(roomId: string): Promise<boolean> {
    const cleanId = normalizeRoomId(roomId);
    if (!cleanId) return false;
    return this.states.delete(cleanId);
  }

  public async touchRoom(roomId: string): Promise<boolean> {
    const cleanId = normalizeRoomId(roomId);
    if (!cleanId) return false;

    const entry = this.states.get(cleanId);
    if (!entry || Date.now() > entry.expiresAt) return false;

    entry.expiresAt = Date.now() + GAME_STATE_TTL_SECONDS * 1000;
    return true;
  }

  public async checkAndRecordActionIdempotency(
    roomId: string,
    actionId: string,
    ttlSeconds = ACTION_IDEMPOTENCY_TTL_SECONDS
  ): Promise<IdempotencyResult> {
    const cleanId = normalizeRoomId(roomId);
    const cleanActionId = (actionId || '').trim();
    if (!cleanId || !cleanActionId) return { isDuplicate: false };

    const key = `${cleanId}:${cleanActionId}`;
    const now = Date.now();
    const existing = this.actions.get(key);

    if (existing && now <= existing.expiresAt) {
      return { isDuplicate: true, recordedAt: existing.recordedAt };
    }

    this.actions.set(key, {
      recordedAt: now,
      expiresAt: now + ttlSeconds * 1000
    });

    return { isDuplicate: false, recordedAt: now };
  }

  public async clearAll(): Promise<void> {
    this.states.clear();
    this.actions.clear();
  }
}

/**
 * Upstash / Redis REST Storage Implementation
 */
export class UpstashRedisRoomStorage implements IRoomStorage {
  private restUrl: string;
  private restToken: string;

  constructor(restUrl: string, restToken: string) {
    this.restUrl = restUrl.replace(/\/$/, '');
    this.restToken = restToken;
  }

  private async executeCommand(command: string[]): Promise<any> {
    const response = await fetch(`${this.restUrl}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.restToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(command)
    });

    if (!response.ok) {
      throw new Error(`Upstash HTTP ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    if (data.error) {
      throw new Error(`Upstash Redis error: ${data.error}`);
    }
    return data.result;
  }

  public async getRoomState(roomId: string): Promise<GameState | null> {
    const key = getRoomStateKey(roomId);
    try {
      const raw = await this.executeCommand(['GET', key]);
      if (!raw) return null;
      return typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (err) {
      console.warn('[RedisStorage] getRoomState error:', err);
      return null;
    }
  }

  public async createRoomState(roomId: string, state: GameState): Promise<GameState> {
    const cleanId = normalizeRoomId(roomId);
    if (!cleanId) throw new Error('INVALID_ROOM_ID');
    if (!state || typeof state !== 'object') throw new Error('MALFORMED_STATE');

    const cleanState = sanitizeGameStateForStorage(state);
    const initialVersion = typeof cleanState.version === 'number' && cleanState.version > 0 ? cleanState.version : 1;
    cleanState.version = initialVersion;
    cleanState.roomId = cleanId;
    cleanState.updatedAt = Date.now();

    const key = getRoomStateKey(roomId);
    const payload = JSON.stringify(cleanState);

    await this.executeCommand(['SET', key, payload, 'EX', GAME_STATE_TTL_SECONDS.toString()]);
    return cleanState;
  }

  /**
   * Atomic CAS implementation via Redis Lua Script
   */
  public async saveRoomStateWithVersion(
    roomId: string,
    expectedVersion: number,
    newState: GameState
  ): Promise<SaveStateResult> {
    const cleanId = normalizeRoomId(roomId);
    if (!cleanId) return { success: false, error: 'INVALID_ROOM_ID' };
    if (!newState || typeof newState !== 'object') return { success: false, error: 'MALFORMED_STATE' };

    const key = getRoomStateKey(roomId);
    const cleanState = sanitizeGameStateForStorage(newState);
    const nextVersion = expectedVersion + 1;
    cleanState.version = nextVersion;
    cleanState.roomId = cleanId;
    cleanState.updatedAt = Date.now();
    const payload = JSON.stringify(cleanState);

    // Redis Lua script for Atomic CAS (Compare-And-Swap on version)
    const luaScript = `
      local current = redis.call('GET', KEYS[1])
      if not current then
        return {0, 'ROOM_NOT_FOUND', 0}
      end
      local data = cjson.decode(current)
      local currentVer = data['version'] or 0
      if tonumber(currentVer) ~= tonumber(ARGV[1]) then
        return {0, 'VERSION_CONFLICT', currentVer}
      end
      redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
      return {1, 'OK', ARGV[4]}
    `;

    try {
      const result = await this.executeCommand([
        'EVAL',
        luaScript,
        '1',
        key,
        expectedVersion.toString(),
        payload,
        GAME_STATE_TTL_SECONDS.toString(),
        nextVersion.toString()
      ]);

      if (Array.isArray(result)) {
        const successCode = Number(result[0]);
        const statusMsg = result[1];
        const ver = Number(result[2]);

        if (successCode === 1) {
          return {
            success: true,
            state: cleanState,
            currentVersion: nextVersion
          };
        } else {
          return {
            success: false,
            error: statusMsg || 'VERSION_CONFLICT',
            currentVersion: ver
          };
        }
      }
    } catch (err: any) {
      console.warn('[RedisStorage] saveRoomStateWithVersion error:', err);
      return { success: false, error: err?.message || 'REDIS_ERROR' };
    }

    return { success: false, error: 'UNKNOWN_CAS_ERROR' };
  }

  public async deleteRoomState(roomId: string): Promise<boolean> {
    const key = getRoomStateKey(roomId);
    try {
      const res = await this.executeCommand(['DEL', key]);
      return res > 0;
    } catch {
      return false;
    }
  }

  public async touchRoom(roomId: string): Promise<boolean> {
    const key = getRoomStateKey(roomId);
    try {
      const res = await this.executeCommand(['EXPIRE', key, GAME_STATE_TTL_SECONDS.toString()]);
      return res === 1;
    } catch {
      return false;
    }
  }

  public async checkAndRecordActionIdempotency(
    roomId: string,
    actionId: string,
    ttlSeconds = ACTION_IDEMPOTENCY_TTL_SECONDS
  ): Promise<IdempotencyResult> {
    const key = getActionIdempotencyKey(roomId, actionId);
    const now = Date.now();
    try {
      // SET key value NX EX ttl (Atomic Set if Not Exists)
      const res = await this.executeCommand(['SET', key, now.toString(), 'NX', 'EX', ttlSeconds.toString()]);
      const isNew = res === 'OK' || res === 1;
      return {
        isDuplicate: !isNew,
        recordedAt: now
      };
    } catch (err) {
      console.warn('[RedisStorage] idempotency error:', err);
      return { isDuplicate: false, recordedAt: now };
    }
  }

  public async clearAll(): Promise<void> {
    // No-op for remote redis in production
  }
}

/**
 * Storage Factory / Singleton:
 * Automatically uses Upstash Redis if environment variables exist,
 * or fallback in-memory CAS storage for unit testing / local development.
 */
function createRoomStorage(): IRoomStorage {
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

  if (upstashUrl && upstashToken) {
    console.log('[Storage] Initializing Upstash Redis Room Storage');
    return new UpstashRedisRoomStorage(upstashUrl, upstashToken);
  }

  return new InMemoryRoomStorage();
}

export const roomStorage = createRoomStorage();
