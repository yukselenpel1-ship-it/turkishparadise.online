import type { VercelRequest, VercelResponse } from '@vercel/node';
import { generateUserToken } from '../../src/server/auth/authMiddleware';
import { verifyGoogleToken } from '../../src/server/auth/googleVerifier';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const { idToken, googleSub, displayName, avatarUrl, email } = req.body || {};

  let verifiedSub: string;
  let verifiedName: string;
  let verifiedEmail: string | null = null;
  let verifiedAvatar: string | null = null;

  if (idToken) {
    try {
      const verified = await verifyGoogleToken(idToken);
      verifiedSub = verified.sub;
      verifiedName = displayName || verified.displayName;
      verifiedEmail = verified.email || email || null;
      verifiedAvatar = verified.avatarUrl || avatarUrl || null;
    } catch (authErr: any) {
      return res.status(401).json({
        error: 'INVALID_GOOGLE_TOKEN',
        message: authErr.message || 'Google token doğrulanamadı.'
      });
    }
  } else if (process.env.NODE_ENV !== 'production' && googleSub) {
    verifiedSub = googleSub;
    verifiedName = displayName || 'Geliştirici';
    verifiedEmail = email || null;
    verifiedAvatar = avatarUrl || null;
  } else {
    return res.status(400).json({
      error: 'ID_TOKEN_REQUIRED',
      message: 'Güvenli giriş için Google id_token zorunludur.'
    });
  }

  try {
    const { syncUserInDB } = await import('../../src/server/db/prisma');
    const user = await syncUserInDB({
      googleSub: verifiedSub,
      displayName: verifiedName,
      avatarUrl: verifiedAvatar,
      email: verifiedEmail
    });

    const token = generateUserToken({
      id: user.id,
      googleSub: user.googleSub,
      email: user.email,
      displayName: user.displayName
    });

    return res.status(200).json({
      success: true,
      user,
      token
    });
  } catch (err: any) {
    console.error('[Vercel Function] Sync user DB error:', err);
    return res.status(500).json({ error: 'DATABASE_ERROR', message: err?.message || 'Internal server error' });
  }
}
