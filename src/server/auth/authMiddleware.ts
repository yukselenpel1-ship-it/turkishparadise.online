import { Request, Response, NextFunction } from 'express';
import {
  TokenPayload,
  signUserToken,
  verifyUserTokenDirect,
  extractUserFromRequest
} from './tokenUtil';

export type AuthenticatedUser = TokenPayload;

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

export function generateUserToken(user: AuthenticatedUser): string {
  return signUserToken(user);
}

export function verifyUserToken(token: string): AuthenticatedUser | null {
  return verifyUserTokenDirect(token);
}

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
