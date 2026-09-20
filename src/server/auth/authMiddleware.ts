import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'tp_dev_secret_key_99281726';

export interface AuthenticatedUser {
  id: string;
  googleSub: string;
  email?: string | null;
  displayName: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

/**
 * Issue a signed JWT token for verified server user identity
 */
export function generateUserToken(user: AuthenticatedUser): string {
  return jwt.sign(
    {
      id: user.id,
      googleSub: user.googleSub,
      email: user.email,
      displayName: user.displayName
    },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

/**
 * Verify JWT Token from Authorization header or Query param / Cookie
 */
export function verifyUserToken(token: string): AuthenticatedUser | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthenticatedUser;
    if (decoded && decoded.id && decoded.googleSub) {
      return decoded;
    }
  } catch (err) {}
  return null;
}

/**
 * Express Authentication Middleware for protected REST API routes
 */
export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  let token: string | undefined;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.query.token && typeof req.query.token === 'string') {
    token = req.query.token;
  } else if (req.body && req.body.token) {
    token = req.body.token;
  }

  if (!token) {
    // If fallback dev mode without token, check for userId in header/query for transparent transition
    const userIdHeader = (req.headers['x-user-id'] || req.query.userId || req.body.userId) as string;
    if (userIdHeader) {
      req.user = {
        id: userIdHeader,
        googleSub: `dev_${userIdHeader}`,
        displayName: 'DevUser'
      };
      return next();
    }
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Giriş doğrulama simgesi (token) gerekli.' });
  }

  const verified = verifyUserToken(token);
  if (!verified) {
    return res.status(401).json({ error: 'INVALID_TOKEN', message: 'Geçersiz veya süresi dolmuş oturum simgesi.' });
  }

  req.user = verified;
  next();
}
