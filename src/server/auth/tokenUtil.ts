import jwt from 'jsonwebtoken';

export interface TokenPayload {
  id: string;
  googleSub: string;
  email?: string | null;
  displayName: string;
}

/**
 * Retrieves the cryptographic JWT signing secret.
 * 🔒 In Production, fails closed with JWT_SECRET_REQUIRED if JWT_SECRET is missing.
 */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.trim().length === 0) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET_REQUIRED: Production environment requires JWT_SECRET to be configured.');
    }
    // Only in non-production local development / test
    return 'dev_testing_jwt_secret_not_for_production';
  }
  return secret.trim();
}

export function signUserToken(payload: TokenPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '30d' });
}

export function verifyUserTokenDirect(token: string): TokenPayload | null {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as TokenPayload;
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
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '7d' });
}

export function verifyGuestToken(token: string): GuestTokenPayload | null {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as GuestTokenPayload;
    if (decoded && decoded.guestId && decoded.participantKey && decoded.isGuest) {
      return decoded;
    }
  } catch (err) {}
  return null;
}

/**
 * Extracts and verifies user identity from Request.
 * 🔒 SECURITY:
 * Requires a cryptographically signed JWT token in Authorization Bearer header, query, or body.
 * Raw header/query/body userId is NEVER accepted in production.
 * In development, raw fallback is only permitted if ALLOW_INSECURE_DEV_AUTH === 'true'.
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

  // 🔒 Raw user ID fallback is strictly restricted to non-production dev opt-in
  if (process.env.NODE_ENV !== 'production' && process.env.ALLOW_INSECURE_DEV_AUTH === 'true') {
    const rawUserId = (req.headers?.['x-user-id'] || req.query?.userId || req.body?.userId) as string;
    if (rawUserId && typeof rawUserId === 'string' && rawUserId.trim().length > 0) {
      const cleanId = rawUserId.trim();
      return {
        id: cleanId,
        googleSub: cleanId.startsWith('google_') ? cleanId : `user_${cleanId}`,
        displayName: (req.headers?.['x-user-name'] || req.body?.displayName || 'Oyuncu') as string
      };
    }
  }

  return null;
}
