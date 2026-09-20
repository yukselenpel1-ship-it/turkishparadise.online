import type { VercelRequest, VercelResponse } from '@vercel/node';
import { extractUserFromRequest } from '../../src/server/auth/tokenUtil';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'DELETE,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, x-user-id, x-user-name'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const user = extractUserFromRequest(req);
  if (!user) {
    return res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Giriş doğrulama simgesi (token) gerekli.'
    });
  }

  const friendId = (req.query.friendId || req.query.id) as string;
  if (!friendId) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'friendId zorunludur.' });
  }

  try {
    const { deleteFriendshipInDB } = await import('../../src/server/db/prisma');
    const outcome = await deleteFriendshipInDB(user.id, friendId);
    return res.status(outcome.status || 200).json(outcome);
  } catch (err: any) {
    console.error('[Vercel Function] Delete friend DB error:', err);
    return res.status(500).json({ error: 'DATABASE_ERROR', message: err?.message });
  }
}
