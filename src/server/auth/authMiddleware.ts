import { Request, Response, NextFunction } from 'express';
import {
  TokenPayload,
  signUserToken,
  verifyUserTokenDirect,
  verifyGuestToken,
  extractUserFromRequest
} from './tokenUtil';
import { GameState, Player } from '../../types/game';

export type AuthenticatedUser = TokenPayload;

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

/**
 * Issue a signed JWT token for verified server user identity
 */
export function generateUserToken(user: AuthenticatedUser): string {
  return signUserToken(user);
}

/**
 * Verify JWT Token from Authorization header or Query param / Cookie
 */
export function verifyUserToken(token: string): AuthenticatedUser | null {
  return verifyUserTokenDirect(token);
}

/**
 * Express Authentication Middleware for protected REST API routes
 */
export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const user = extractUserFromRequest(req);
  if (!user) {
    return res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Giriş doğrulama simgesi (token) gerekli.'
    });
  }

  req.user = user;
  next();
}

export interface AuthenticatedActor {
  userId: string;
  googleSub?: string;
  displayName?: string;
  participantKey?: string;
  isGuest?: boolean;
  isHost?: boolean;
}

export interface AuthResolutionResult {
  success: boolean;
  actor?: AuthenticatedActor;
  error?: string;
  message?: string;
}

/**
 * Resolves authenticated identity from incoming Request headers / body.
 * 
 * Hierarchy:
 * 1. Bearer JWT Token in Authorization header (Google authenticated user or Guest JWT)
 * 2. x-guest-token header / body (Signed, server-issued Guest JWT)
 * 
 * 🔒 SECURITY: Plain x-participant-key or raw x-user-id alone is NEVER accepted as authentication.
 * participantKey is strictly verified from inside the signed token.
 */
export function resolveAuthenticatedActor(req: any): AuthResolutionResult {
  if (!req || typeof req !== 'object') {
    return { success: false, error: 'MALFORMED_REQUEST', message: 'Geçersiz istek nesnesi.' };
  }

  const headers = req.headers || {};
  let token: string | undefined;

  // 1. Check Authorization Bearer Header
  const authHeader = headers['authorization'] || headers['Authorization'];
  if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (req.query?.token && typeof req.query.token === 'string') {
    token = req.query.token.trim();
  } else if (req.body?.token && typeof req.body.token === 'string') {
    token = req.body.token.trim();
  }

  if (token) {
    // 1. Try Google / User JWT Token
    const verifiedUser = verifyUserTokenDirect(token);
    if (verifiedUser && verifiedUser.id) {
      return {
        success: true,
        actor: {
          userId: verifiedUser.id,
          googleSub: verifiedUser.googleSub,
          displayName: verifiedUser.displayName,
          isGuest: false
        }
      };
    }

    // 2. Try Signed Guest JWT Token
    const verifiedGuest = verifyGuestToken(token);
    if (verifiedGuest && verifiedGuest.guestId) {
      return {
        success: true,
        actor: {
          userId: verifiedGuest.guestId,
          participantKey: verifiedGuest.participantKey,
          displayName: verifiedGuest.displayName,
          isGuest: true
        }
      };
    }

    return {
      success: false,
      error: 'INVALID_TOKEN',
      message: 'Oturum anahtarı (JWT) geçersiz veya süresi dolmuş.'
    };
  }

  // 2. Check Guest Signed / Session Token Header (x-guest-token)
  const guestTokenHeader = (headers['x-guest-token'] || req.body?.guestToken || req.query?.guestToken) as string | undefined;
  if (guestTokenHeader && typeof guestTokenHeader === 'string' && guestTokenHeader.trim().length > 0) {
    const verifiedGuest = verifyGuestToken(guestTokenHeader.trim());
    if (verifiedGuest && verifiedGuest.guestId) {
      return {
        success: true,
        actor: {
          userId: verifiedGuest.guestId,
          participantKey: verifiedGuest.participantKey,
          displayName: verifiedGuest.displayName,
          isGuest: true
        }
      };
    }
    return {
      success: false,
      error: 'INVALID_TOKEN',
      message: 'Misafir oturum anahtarı (x-guest-token) geçersiz veya süresi dolmuş.'
    };
  }

  // Reject requests without valid signed token
  return {
    success: false,
    error: 'UNAUTHORIZED',
    message: 'İşlem için geçerli bir oturum anahtarı (Google JWT veya x-guest-token) zorunludur.'
  };
}

/**
 * Verifies that the authenticated actor matches the requested playerId inside roomState.
 * Prevents malicious players from submitting actions on behalf of other players.
 */
export function validateActorMatchesPlayer(
  actor: AuthenticatedActor,
  roomState: GameState,
  playerId: string,
  actionType?: string
): { valid: boolean; error?: string; message?: string } {
  if (!roomState || !Array.isArray(roomState.players)) {
    return { valid: false, error: 'MALFORMED_STATE', message: 'Oda durumu geçersiz.' };
  }

  const targetPlayer = roomState.players.find(p => p.id === playerId);
  if (!targetPlayer) {
    return { valid: false, error: 'PLAYER_NOT_FOUND', message: `"${playerId}" kimlikli oyuncu odada bulunamadı.` };
  }

  // Check direct matches
  const matchesDirectId = targetPlayer.id === actor.userId;
  const matchesUserId = targetPlayer.userId && actor.userId && targetPlayer.userId === actor.userId;
  const matchesParticipantKey =
    targetPlayer.participantKey &&
    actor.participantKey &&
    targetPlayer.participantKey === actor.participantKey;

  if (matchesDirectId || matchesUserId || matchesParticipantKey) {
    return { valid: true };
  }

  const isActorInRoom = roomState.players.some(
    p =>
      p.id === actor.userId ||
      (p.userId && p.userId === actor.userId) ||
      (p.participantKey && actor.participantKey && p.participantKey === actor.participantKey)
  );

  // Allow authenticated claimant to take over an available replacement bot seat
  if (
    (actionType === 'TAKE_OVER_REPLACEMENT_BOT' || actionType === 'CLAIM_REPLACEMENT_SEAT') &&
    targetPlayer.isBot &&
    (targetPlayer.isReplacementBot || targetPlayer.botOrigin === 'PLAYER_REPLACEMENT')
  ) {
    if (actor && actor.userId) {
      return { valid: true };
    }
  }

  // Allow active human player in the room to submit actions for Bot players or timeout recovery actions
  if (isActorInRoom && (targetPlayer.isBot || actionType === 'SET_AFK' || actionType === 'AUTO_LIQUIDATE')) {
    return { valid: true };
  }

  // In test/dev environment, allow if actor is explicitly marked host or matches
  if (process.env.NODE_ENV !== 'production' && actor.isHost) {
    return { valid: true };
  }

  return {
    valid: false,
    error: 'UNAUTHORIZED_PLAYER',
    message: 'Başka bir oyuncu adına hamle yapamazsınız.'
  };
}

/**
 * Validates room read permission (for GET /api/game/state).
 * Allows access if:
 * 1. Room is public (isPublic === true)
 * 2. Actor is in players list
 * 3. Actor is in spectators list
 * 4. Actor is host of room
 */
export function validateRoomReadAccess(
  actor: AuthenticatedActor,
  roomState: GameState
): { allowed: boolean; reason?: string } {
  if (!roomState) return { allowed: false, reason: 'ROOM_NOT_FOUND' };

  // 1. Public rooms can be viewed by anyone
  if (roomState.settings?.isPublic) {
    return { allowed: true };
  }

  // 2. Check if actor is in players
  const isInPlayers = roomState.players?.some(
    p =>
      p.id === actor.userId ||
      (p.userId && p.userId === actor.userId) ||
      (p.participantKey && p.participantKey === actor.participantKey)
  );
  if (isInPlayers) return { allowed: true };

  // 3. Check if actor is in spectators
  const isInSpectators = roomState.spectators?.some(
    s =>
      s.id === actor.userId ||
      (s.userId && s.userId === actor.userId) ||
      (s.participantKey && s.participantKey === actor.participantKey)
  );
  if (isInSpectators) return { allowed: true };

  // 4. Check if actor is host (or active fallback host)
  const activeHostId =
    roomState.hostPlayerId && roomState.players?.find(p => p.id === roomState.hostPlayerId)?.inGame
      ? roomState.hostPlayerId
      : roomState.players?.find(p => p.inGame && !p.isBot)?.id || roomState.players?.[0]?.id;

  if (activeHostId === actor.userId || actor.isHost) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: 'FORBIDDEN_PRIVATE_ROOM'
  };
}

/**
 * Sanitizes GameState before exposing via API responses.
 * 🔒 SECURITY:
 * - Masks or strips participantKey, clientId, tabId, connectionId of opponent players.
 * - Preserves the requesting actor's own identity fields for seamless reconnections.
 */
export function sanitizeGameStateForClient(
  state: GameState,
  requestingActor?: AuthenticatedActor
): GameState {
  if (!state || typeof state !== 'object') return state;

  const sanitized: GameState = JSON.parse(JSON.stringify(state));

  if (Array.isArray(sanitized.players)) {
    sanitized.players = sanitized.players.map(p => {
      const isOwnPlayer =
        requestingActor &&
        (p.id === requestingActor.userId ||
          (p.userId && p.userId === requestingActor.userId) ||
          (p.participantKey && requestingActor.participantKey && p.participantKey === requestingActor.participantKey));

      return {
        ...p,
        // Only keep participantKey, clientId, tabId, connectionId for the player themselves, mask for opponents
        participantKey: isOwnPlayer ? p.participantKey : undefined,
        clientId: isOwnPlayer ? p.clientId : undefined,
        tabId: isOwnPlayer ? p.tabId : undefined,
        connectionId: isOwnPlayer ? p.connectionId : undefined
      };
    });
  }

  if (Array.isArray(sanitized.spectators)) {
    sanitized.spectators = sanitized.spectators.map(s => {
      const isOwnSpectator =
        requestingActor &&
        (s.id === requestingActor.userId ||
          (s.userId && s.userId === requestingActor.userId) ||
          (s.participantKey && requestingActor.participantKey && s.participantKey === requestingActor.participantKey));

      return {
        ...s,
        participantKey: isOwnSpectator ? s.participantKey : undefined,
        clientId: isOwnSpectator ? s.clientId : undefined,
        tabId: isOwnSpectator ? s.tabId : undefined
      };
    });
  }

  return sanitized;
}
