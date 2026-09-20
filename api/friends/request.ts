import type { VercelRequest, VercelResponse } from '@vercel/node';
import { extractUserFromRequest } from '../../src/server/auth/tokenUtil';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, x-user-id, x-user-name'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const user = extractUserFromRequest(req);
  if (!user) {
    return res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Giriş doğrulama simgesi (token) gerekli.'
    });
  }

  const { targetFriendCode } = req.body || {};
  if (!targetFriendCode || typeof targetFriendCode !== 'string') {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'targetFriendCode zorunludur.' });
  }

  try {
    const { sendFriendRequestInDB } = await import('../../src/server/db/prisma');
    const outcome = await sendFriendRequestInDB(user.id, targetFriendCode);
    return res.status(outcome.status || 200).json(outcome);
  } catch (err: any) {
    console.error('[Vercel Function] Send friend request DB error:', err);
    return res.status(500).json({ error: 'DATABASE_ERROR', message: err?.message || 'İstek işlenirken sunucu hatası oluştu.' });
  }
}
