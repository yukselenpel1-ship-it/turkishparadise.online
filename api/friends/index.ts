import type { VercelRequest, VercelResponse } from '@vercel/node';
import { extractUserFromRequest } from '../../src/server/auth/tokenUtil';
import { handleCors } from '../../src/server/auth/corsUtil';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res, 'GET,OPTIONS')) {
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const user = extractUserFromRequest(req);
  if (!user) {
    return res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Giriş doğrulama simgesi (token) gerekli.'
    });
  }

  try {
    const { getFriendsFromDB } = await import('../../src/server/db/prisma');
    const result = await getFriendsFromDB(user.id);
    const annotatedFriends = (result.friends || []).map((f: any) => ({
      ...f,
      isOnline: false
    }));

    return res.status(200).json({
      success: true,
      friends: annotatedFriends,
      pendingIncoming: result.incomingRequests || [],
      pendingOutgoing: result.outgoingRequests || []
    });
  } catch (err: any) {
    console.error('[Vercel Function] Get friends DB error:', err);
    return res.status(500).json({
      error: 'DATABASE_ERROR',
      message: err?.message || 'Veritabanı hatası oluştu.'
    });
  }
}
