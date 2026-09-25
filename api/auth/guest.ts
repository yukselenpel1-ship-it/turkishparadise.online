import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import { signGuestToken } from '../../src/server/auth/tokenUtil';
import { handleCors } from '../../src/server/auth/corsUtil';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res, 'POST,OPTIONS')) {
    return;
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
  // 🔒 Server-generated cryptographic guest identity
  const guestRandom = typeof crypto.randomUUID === 'function' 
    ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
    : crypto.randomBytes(8).toString('hex');
  const guestId = `guest_${guestRandom}`;

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
