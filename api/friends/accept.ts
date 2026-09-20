import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyUserToken } from '../../src/server/auth/authMiddleware';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, x-user-id'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  let token: string | undefined;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  }

  let verifiedUser: { id: string; googleSub: string; displayName: string } | null = null;
  if (token) {
    verifiedUser = verifyUserToken(token);
  } else if (process.env.NODE_ENV !== 'production' && req.headers['x-user-id']) {
    const uid = String(req.headers['x-user-id']);
    verifiedUser = { id: uid, googleSub: `dev_${uid}`, displayName: 'DevUser' };
  }

  if (!verifiedUser) {
    return res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Giriş doğrulama simgesi (token) gerekli.'
    });
  }

  const { requestId } = req.body || {};
  if (!requestId || typeof requestId !== 'string') {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'requestId zorunludur.' });
  }

  try {
    const { acceptFriendRequestInDB } = await import('../../src/server/db/prisma');
    const outcome = await acceptFriendRequestInDB(verifiedUser.id, requestId);
    return res.status(outcome.status || 200).json(outcome);
  } catch (err: any) {
    console.error('[Vercel Function] Accept friend request DB error:', err);
    return res.status(500).json({ error: 'DATABASE_ERROR', message: err?.message });
  }
}
