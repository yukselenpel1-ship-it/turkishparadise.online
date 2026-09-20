import { OAuth2Client } from 'google-auth-library';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || '251712645663-jicouarovrlern4ksn7ifvpn41ju6qle.apps.googleusercontent.com';

let oauth2Client: OAuth2Client | null = null;

function getOAuth2Client(): OAuth2Client {
  if (!oauth2Client) {
    oauth2Client = new OAuth2Client(GOOGLE_CLIENT_ID);
  }
  return oauth2Client;
}

export interface VerifiedGoogleUser {
  sub: string;
  email?: string | null;
  displayName: string;
  avatarUrl?: string | null;
}

/**
 * Server-side Google ID Token Verification.
 * Backend NEVER trusts raw client-supplied googleSub, email, or displayName.
 */
export async function verifyGoogleToken(idToken: string): Promise<VerifiedGoogleUser> {
  const cleanToken = (idToken || '').trim();
  if (!cleanToken) {
    throw new Error('Google ID Token is missing');
  }

  // 1. Check for automated testing / dev mock tokens
  if (process.env.NODE_ENV !== 'production' && cleanToken.startsWith('mock_test_token_')) {
    const parts = cleanToken.replace('mock_test_token_', '').split(':');
    const mockSub = parts[0] || 'mock_sub_123';
    const mockName = parts[1] || 'Mock Tester';
    const mockEmail = parts[2] || `${mockSub}@test.com`;
    return {
      sub: mockSub,
      email: mockEmail,
      displayName: mockName,
      avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${mockSub}`
    };
  }

  // 2. Primary: Verify with official google-auth-library
  try {
    const client = getOAuth2Client();
    const ticket = await client.verifyIdToken({
      idToken: cleanToken,
      audience: GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.sub) {
      throw new Error('Invalid token payload: sub missing');
    }

    return {
      sub: payload.sub,
      email: payload.email || null,
      displayName: payload.name || payload.given_name || 'Google Oyuncusu',
      avatarUrl: payload.picture || null
    };
  } catch (libraryErr: any) {
    console.warn('[Google Auth Library] Library verification notice:', libraryErr?.message);
    
    // 3. Fallback: Verify via Google TokenInfo HTTP Endpoint
    try {
      const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(cleanToken)}`);
      if (response.ok) {
        const info = await response.json();
        if (info && info.sub) {
          return {
            sub: info.sub,
            email: info.email || null,
            displayName: info.name || info.given_name || 'Google Oyuncusu',
            avatarUrl: info.picture || null
          };
        }
      }
    } catch (httpErr) {}

    throw new Error(`Google kimlik doğrulaması başarısız: ${libraryErr?.message || 'Geçersiz token'}`);
  }
}
