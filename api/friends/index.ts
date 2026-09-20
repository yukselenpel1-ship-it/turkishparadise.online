import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyUserToken } from '../../src/server/auth/authMiddleware';
import { getFriendsFromDB } from '../../src/server/db/prisma';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, x-user-id'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  // Auth Extraction
  let token: string | undefined;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.query.token && typeof req.query.token === 'string') {
    token = req.query.token;
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

  try {
    const result = await getFriendsFromDB(verifiedUser.id);
    const annotatedFriends = result.friends.map((f: any) => ({
      ...f,
      isOnline: false
    }));

    return res.status(200).json({
      success: true,
      friends: annotatedFriends,
      pendingIncoming: result.incomingRequests,
      pendingOutgoing: result.outgoingRequests
    });
  } catch (err: any) {
    console.error('[Vercel Function] Get friends error:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: err?.message || 'Internal server error' });
  }
}
