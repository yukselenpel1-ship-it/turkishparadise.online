import { UserAccount } from '../types/game';
import { getUserStats } from './firebase';

const OAUTH_STATE_KEY = 'tp_oauth_state';
const LOCAL_USER_KEY = 'tp_user_profile';

/**
 * Get Google OAuth Client ID from Vite environment variable
 */
export function getGoogleClientId(): string {
  return import.meta.env.VITE_GOOGLE_CLIENT_ID || '251712645663-jicouarovrlern4ksn7ifvpn41ju6qle.apps.googleusercontent.com';
}

/**
 * Check if Google OAuth Client ID is configured
 */
export function isGoogleOAuthConfigured(): boolean {
  const clientId = getGoogleClientId();
  return Boolean(clientId && clientId.trim().length > 0 && clientId !== 'YOUR_GOOGLE_CLIENT_ID');
}

/**
 * Get the authorized redirect URI matching Google Cloud Console configuration
 */
export function getAuthorizedRedirectUri(): string {
  if (import.meta.env.VITE_GOOGLE_REDIRECT_URI) {
    return import.meta.env.VITE_GOOGLE_REDIRECT_URI;
  }
  // Default to the current origin (e.g., https://turkishparadise.online or https://turkishparadise-online.vercel.app)
  return window.location.origin;
}

/**
 * Generate cryptographically secure random string for OAuth state verification
 */
function generateSecureRandomState(): string {
  const array = new Uint8Array(24);
  window.crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Initiates the official Google OAuth 2.0 Account Selection & Login Flow
 */
export function initiateGoogleOAuthRedirect(): void {
  const clientId = getGoogleClientId();

  if (!clientId) {
    console.warn('[Google OAuth] VITE_GOOGLE_CLIENT_ID environment variable is missing.');
    alert(
      'Google ile Giriş yapabilmek için Google Cloud Console üzerinden oluşturduğunuz OAuth 2.0 Client ID değerini Vercel ortam değişkenlerine (VITE_GOOGLE_CLIENT_ID) eklemeniz gerekmektedir.\n\nAuthorized Redirect URI olarak: ' +
        getAuthorizedRedirectUri() +
        ' eklemeyi unutmayın.'
    );
    return;
  }

  // 1. Generate and store state for CSRF protection
  const state = generateSecureRandomState();
  sessionStorage.setItem(OAUTH_STATE_KEY, state);

  // 2. Generate nonce for OpenID Connect
  const nonce = generateSecureRandomState();

  const redirectUri = getAuthorizedRedirectUri();

  // 3. Build Google OAuth 2.0 Authorization Endpoint URL
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'token id_token',
    scope: 'openid email profile',
    state: state,
    nonce: nonce,
    prompt: 'select_account',
    include_granted_scopes: 'true'
  });

  // 4. Redirect browser to official Google Accounts login page
  const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  window.location.href = googleAuthUrl;
}

/**
 * Decode JWT Token payload without external dependencies
 */
function parseJwt(token: string): any {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      window
        .atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    console.error('[Google OAuth] JWT decode error:', e);
    return null;
  }
}

/**
 * Process OAuth 2.0 Redirect / Callback on app startup
 */
export async function handleGoogleOAuthCallback(): Promise<UserAccount | null> {
  // Check if hash contains OAuth response (#access_token=... or #id_token=...)
  const hash = window.location.hash ? window.location.hash.substring(1) : '';
  if (!hash) return null;

  const hashParams = new URLSearchParams(hash);
  const accessToken = hashParams.get('access_token');
  const idToken = hashParams.get('id_token');
  const returnedState = hashParams.get('state');
  const error = hashParams.get('error');

  if (error) {
    console.error('[Google OAuth] Error from Google:', error);
    // Clean hash
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    return null;
  }

  if (!accessToken && !idToken) {
    return null;
  }

  // Verify OAuth state to prevent CSRF attacks
  const savedState = sessionStorage.getItem(OAUTH_STATE_KEY);
  sessionStorage.removeItem(OAUTH_STATE_KEY);

  if (!savedState || returnedState !== savedState) {
    console.error('[Google OAuth] State verification failed! Potential CSRF detected.');
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    return null;
  }

  try {
    let googleId = '';
    let name = 'Google Oyuncusu';
    let email = '';
    let photoURL = '';

    // Option A: Extract from decoded id_token
    if (idToken) {
      const payload = parseJwt(idToken);
      if (payload) {
        googleId = payload.sub || '';
        name = payload.name || payload.given_name || 'Google Oyuncusu';
        email = payload.email || '';
        photoURL = payload.picture || '';
      }
    }

    // Option B: Fetch directly from Google UserInfo API using access_token
    if (accessToken) {
      try {
        const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (res.ok) {
          const userInfo = await res.json();
          googleId = userInfo.sub || googleId;
          name = userInfo.name || name;
          email = userInfo.email || email;
          photoURL = userInfo.picture || photoURL;
        }
      } catch (err) {
        console.warn('[Google OAuth] UserInfo fetch warning:', err);
      }
    }

    if (!googleId && !email) {
      return null;
    }

    const uid = googleId || `google_${email.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const stats = getUserStats(uid);

    const userAccount: UserAccount = {
      uid,
      displayName: name,
      email: email || null,
      photoURL: photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${uid}`,
      isAnonymous: false,
      provider: 'google',
      stats: stats
    };

    // Save user session in localStorage
    localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(userAccount));

    // Clean hash from URL for a pristine browser experience
    window.history.replaceState(null, '', window.location.pathname + window.location.search);

    return userAccount;
  } catch (err) {
    console.error('[Google OAuth] Callback processing error:', err);
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    return null;
  }
}
