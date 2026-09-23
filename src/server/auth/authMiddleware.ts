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
 * 1. Bearer JWT Token in Authorization header (Google authenticated user)
 * 2. x-participant-key header (Guest isolated tab/device identifier)
 * 3. x-user-id header / body participantKey fallback
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
  if (guestTokenHeader) {
    const verifiedGuest = verifyGuestToken(guestTokenHeader);
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
  }

  // 3. Check Guest Participant Key Header (Isolated Browser Profile)
  const participantKey = (
    headers['x-participant-key'] ||
    headers['x-participantkey'] ||
    req.body?.participantKey ||
    req.query?.participantKey
  ) as string | undefined;

  if (participantKey && typeof participantKey === 'string' && participantKey.trim().length >= 3) {
    const cleanKey = participantKey.trim();
    const guestUserId = (headers['x-user-id'] || req.body?.userId || `guest_${cleanKey.replace(/[^a-zA-Z0-9]/g, '').slice(0, 16)}`) as string;
    const displayName = (headers['x-user-name'] || req.body?.displayName || 'Misafir Oyuncu') as string;

    return {
      success: true,
      actor: {
        userId: guestUserId,
        participantKey: cleanKey,
        displayName,
        isGuest: true
      }
    };
  }

  // 4. Check raw x-user-id Header (Resilient Guest Identification)
  const rawUserId = (headers['x-user-id'] || req.query?.userId || req.body?.userId) as string | undefined;
  if (rawUserId && typeof rawUserId === 'string' && rawUserId.trim().length >= 2) {
    const cleanId = rawUserId.trim();
    return {
      success: true,
      actor: {
        userId: cleanId,
        participantKey: cleanId,
        displayName: (headers['x-user-name'] || req.body?.displayName || 'Oyuncu') as string,
        isGuest: true
      }
    };
  }

  return {
    success: false,
    error: 'UNAUTHORIZED',
    message: 'İşlem için geçerli bir kimlik doğrulaması (JWT veya participantKey) gereklidir.'
  };
}

/**
 * Verifies that the authenticated actor matches the requested playerId inside roomState.
 * Prevents malicious players from submitting actions on behalf of other players.
 */
export function validateActorMatchesPlayer(
  actor: AuthenticatedActor,
  roomState: GameState,
  playerId: string
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

  // 4. Check if actor is host
  if (roomState.hostPlayerId === actor.userId || actor.isHost) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: 'FORBIDDEN_PRIVATE_ROOM'
  };
}

/**
 * Sanitizes GameState before exposing via GET /api/game/state.
 * 🔒 SECURITY:
 * - Masks or strips participantKey of opponent players so malicious users cannot forge them.
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
          (p.participantKey && p.participantKey === requestingActor.participantKey));

      return {
        ...p,
        // Only keep participantKey for the player themselves, mask for opponents
        participantKey: isOwnPlayer ? p.participantKey : undefined
      };
    });
  }

  if (Array.isArray(sanitized.spectators)) {
    sanitized.spectators = sanitized.spectators.map(s => {
      const isOwnSpectator =
        requestingActor &&
        (s.id === requestingActor.userId ||
          (s.userId && s.userId === requestingActor.userId) ||
          (s.participantKey && s.participantKey === requestingActor.participantKey));

      return {
        ...s,
        participantKey: isOwnSpectator ? s.participantKey : undefined
      };
    });
  }

  return sanitized;
}
