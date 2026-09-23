import type { VercelRequest, VercelResponse } from '@vercel/node';
import { resolveAuthenticatedActor, validateRoomReadAccess, sanitizeGameStateForClient } from '../../src/server/auth/authMiddleware';
import { roomStorage, normalizeRoomId } from '../../src/server/storage/roomStorage';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 1. CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, x-participant-key, x-guest-token, x-user-id, x-user-name'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'METHOD_NOT_ALLOWED',
      message: 'Yalnızca GET istekleri desteklenir.'
    });
  }

  // 2. Query validation
  const rawRoomId = (req.query?.roomId || req.query?.id) as string;
  const cleanId = normalizeRoomId(rawRoomId);
  if (!cleanId) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_ROOM_ID',
      message: 'roomId parametresi zorunludur.'
    });
  }

  // 3. Authentication & Actor Resolution
  const authRes = resolveAuthenticatedActor(req);
  if (!authRes.success || !authRes.actor) {
    return res.status(401).json({
      success: false,
      error: authRes.error || 'UNAUTHORIZED',
      message: authRes.message || 'Kimlik doğrulama başarısız.'
    });
  }

  // 4. Fetch Canonical State from Storage
  try {
    const state = await roomStorage.getRoomState(cleanId);
    if (!state) {
      return res.status(404).json({
        success: false,
        error: 'ROOM_NOT_FOUND',
        message: `"${cleanId}" kodlu oda bulunamadı.`
      });
    }

    // 5. Room Access Authorization Guard
    const accessCheck = validateRoomReadAccess(authRes.actor, state);
    if (!accessCheck.allowed) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN_PRIVATE_ROOM',
        message: 'Bu özel odaya erişim yetkiniz bulunmuyor.'
      });
    }

    const clientState = sanitizeGameStateForClient(state, authRes.actor);

    return res.status(200).json({
      success: true,
      roomId: cleanId,
      version: clientState.version || 1,
      state: clientState
    });
  } catch (err: any) {
    if (err?.message?.includes('STORAGE_UNAVAILABLE')) {
      return res.status(503).json({
        success: false,
        error: 'STORAGE_UNAVAILABLE',
        message: 'Depolama servisine ulaşılamıyor.'
      });
    }

    console.error('[State Endpoint Error]:', err);
    return res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: 'Oda durumu alınırken hata oluştu.'
    });
  }
}
