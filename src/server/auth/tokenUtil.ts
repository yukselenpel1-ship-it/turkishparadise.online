import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'tp_jwt_secret_super_secure_key_2026';

export interface TokenPayload {
  id: string;
  googleSub: string;
  email?: string | null;
  displayName: string;
}

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

/**
 * Extracts and verifies token or fallback user identity from Vercel Request
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

  // Resilient fallback for connected users: x-user-id header or userId param
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
