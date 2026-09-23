import type { VercelRequest, VercelResponse } from '@vercel/node';
import { signGuestToken } from '../../src/server/auth/tokenUtil';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, x-participant-key, x-guest-token, x-user-id, x-user-name'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const { participantKey, displayName, roomId } = req.body || {};
  const pKey = (
    typeof participantKey === 'string' && participantKey.trim().length >= 3
      ? participantKey.trim()
      : (req.headers['x-participant-key'] as string)
  );

  if (!pKey || typeof pKey !== 'string' || pKey.trim().length < 3) {
    return res.status(400).json({
      error: 'PARTICIPANT_KEY_REQUIRED',
      message: 'Misafir oturum anahtarı (participantKey) zorunludur.'
    });
  }

  const cleanKey = pKey.trim();
  const guestId = `guest_${cleanKey.replace(/[^a-zA-Z0-9]/g, '').slice(0, 16)}`;
  const cleanName = (
    typeof displayName === 'string' && displayName.trim().length > 0
      ? displayName.trim().substring(0, 30)
      : (req.headers['x-user-name'] as string) || 'Misafir Oyuncu'
  );

  const token = signGuestToken({
    guestId,
    participantKey: cleanKey,
    displayName: cleanName,
    roomId: typeof roomId === 'string' ? roomId.trim() : undefined,
    isGuest: true
  });

  return res.status(200).json({
    success: true,
    token,
    guestId,
    participantKey: cleanKey,
    displayName: cleanName
  });
}
