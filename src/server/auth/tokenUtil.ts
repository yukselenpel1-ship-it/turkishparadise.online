import jwt from 'jsonwebtoken';

export interface TokenPayload {
  id: string;
  googleSub: string;
  email?: string | null;
  displayName: string;
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('FATAL_AUTH_CONFIG: JWT_SECRET environment variable is missing in production.');
    }
    return 'tp_dev_secret_key_only_for_local_tests_99281726';
  }
  return secret;
}

export function signUserToken(payload: TokenPayload): string {
  const secret = getJwtSecret();
  return jwt.sign(payload, secret, { expiresIn: '30d' });
}

export function verifyUserTokenDirect(token: string): TokenPayload | null {
  if (!token) return null;
  try {
    const secret = getJwtSecret();
    const decoded = jwt.verify(token, secret) as TokenPayload;
    if (decoded && decoded.id && decoded.googleSub) {
      return decoded;
    }
  } catch (err) {}
  return null;
}

/**
 * Extracts and verifies token from Request.
 * In production: ONLY a valid signed JWT is accepted.
 * In development: Dev fallback header x-user-id is permitted for local tests only.
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

  // Development-only fallback: Strictly forbidden in production
  if (process.env.NODE_ENV !== 'production') {
    const rawUserId = (req.headers?.['x-user-id'] || req.query?.userId || req.body?.userId) as string;
    if (rawUserId && typeof rawUserId === 'string' && rawUserId.trim().length > 0) {
      const cleanId = rawUserId.trim();
      return {
        id: cleanId,
        googleSub: cleanId.startsWith('google_') ? cleanId : `dev_${cleanId}`,
        displayName: (req.headers?.['x-user-name'] || req.body?.displayName || 'DevUser') as string
      };
    }
  }

  return null;
}
