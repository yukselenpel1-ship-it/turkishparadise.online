import type { VercelRequest, VercelResponse } from '@vercel/node';
import { resolveAuthenticatedActor } from '../../src/server/auth/authMiddleware';
import { executeGameActionPipeline } from '../../src/server/game/actionPipeline';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 1. CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, x-participant-key, x-user-id, x-user-name'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'METHOD_NOT_ALLOWED',
      message: 'Yalnızca POST istekleri desteklenir.'
    });
  }

  // 2. Authentication & Actor Resolution
  const authRes = resolveAuthenticatedActor(req);
  if (!authRes.success || !authRes.actor) {
    return res.status(401).json({
      success: false,
      error: authRes.error || 'UNAUTHORIZED',
      message: authRes.message || 'Kimlik doğrulama başarısız.'
    });
  }

  // 3. Action Execution Pipeline
  try {
    const result = await executeGameActionPipeline(req.body, authRes.actor);

    if (result.success) {
      return res.status(result.statusCode || 200).json({
        success: true,
        roomId: result.roomId,
        actionId: result.actionId,
        version: result.version,
        state: result.state,
        events: result.events
      });
    } else {
      return res.status(result.statusCode || 400).json({
        success: false,
        error: result.error,
        message: result.message,
        currentVersion: result.currentVersion
      });
    }
  } catch (err: any) {
    console.error('[Action Endpoint Error]:', err);
    return res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: 'Sunucu tarafında beklenmeyen bir hata oluştu.'
    });
  }
}
