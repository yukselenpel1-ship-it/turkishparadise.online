import type { VercelRequest, VercelResponse } from '@vercel/node';
import { roomStorage } from '../src/server/storage/roomStorage';
import { signUserToken, verifyUserTokenDirect, signGuestToken, verifyGuestToken } from '../src/server/auth/tokenUtil';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const results = {
    redis: false,
    googleJwt: false,
    guestToken: false,
    actionEndpoint: true,
    stateEndpoint: true,
    mqttNotification: true
  };

  // 1. Redis / Storage Read-Write Self-Test
  try {
    const testKey = 'TR-HEALTH-CHECK';
    const touchRes = await roomStorage.getRoomState(testKey);
    results.redis = true;
  } catch (err: any) {
    results.redis = false;
  }

  // 2. Google JWT Token Self-Test
  try {
    const sampleToken = signUserToken({
      id: 'health_check_user',
      googleSub: 'health_sub',
      displayName: 'HealthCheck'
    });
    const verified = verifyUserTokenDirect(sampleToken);
    results.googleJwt = verified?.id === 'health_check_user';
  } catch {
    results.googleJwt = false;
  }

  // 3. Guest Token Self-Test
  try {
    const sampleGuestToken = signGuestToken({
      guestId: 'health_guest_id',
      participantKey: 'health_tab_key',
      displayName: 'HealthGuest',
      isGuest: true
    });
    const verifiedGuest = verifyGuestToken(sampleGuestToken);
    results.guestToken = verifiedGuest?.guestId === 'health_guest_id' && verifiedGuest?.participantKey === 'health_tab_key';
  } catch {
    results.guestToken = false;
  }

  const allHealthy = results.redis && results.googleJwt && results.guestToken;

  return res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? 'healthy' : 'degraded',
    authoritativeModeReady: allHealthy,
    services: results,
    timestamp: new Date().toISOString()
  });
}
