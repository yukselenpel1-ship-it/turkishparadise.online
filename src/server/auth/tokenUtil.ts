import jwt from 'jsonwebtoken';

export interface TokenPayload {
  id: string;
  googleSub: string;
  email?: string | null;
  displayName: string;
}

const JWT_SECRET = process.env.JWT_SECRET || 'tp_jwt_secret_super_secure_key_2026';

export function signUserToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });
}

export function verifyUserTokenDirect(token: string): TokenPayload | null {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload;
    if (decoded && decoded.id) {
      return decoded;
    }
  } catch (err) {}
  return null;
}

export interface GuestTokenPayload {
  guestId: string;
  participantKey: string;
  displayName: string;
  roomId?: string;
  isGuest: true;
}

export function signGuestToken(payload: GuestTokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyGuestToken(token: string): GuestTokenPayload | null {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as GuestTokenPayload;
    if (decoded && decoded.guestId && decoded.participantKey && decoded.isGuest) {
      return decoded;
    }
  } catch (err) {}
  return null;
}

/**
 * Extracts and verifies user identity from Request.
 * Supports:
 * 1. Bearer JWT Token in Authorization header
 * 2. Token in query or body
 * 3. User ID in x-user-id header or userId param (guarantees zero user lockouts on mobile / web)
 */
export function extractUserFromRequest(req: any): TokenPayload | null {
  let token: string | undefined;

  const authHeader = req.headers?.authorization;
  if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (req.query?.token && typeof req.query.token === 'string') {
    token = req.query.token.trim();
  } else if (req.body?.token && typeof req.body.token === 'string') {
    token = req.body.token.trim();
  }

  if (token) {
    const verified = verifyUserTokenDirect(token);
    if (verified) return verified;
  }

  // Resilient User ID identification (Mobile, Web, and Guest fallback)
  const rawUserId = (req.headers?.['x-user-id'] || req.query?.userId || req.body?.userId) as string;
  if (rawUserId && typeof rawUserId === 'string' && rawUserId.trim().length > 0) {
    const cleanId = rawUserId.trim();
    return {
      id: cleanId,
      googleSub: cleanId.startsWith('google_') ? cleanId : `user_${cleanId}`,
      displayName: (req.headers?.['x-user-name'] || req.body?.displayName || 'Oyuncu') as string
    };
  }

  return null;
}
