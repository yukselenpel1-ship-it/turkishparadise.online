export const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:3001',
  'https://turkishparadise.digital',
  'https://www.turkishparadise.digital',
  'https://api.turkishparadise.digital',
  'https://turkishparadise.online',
  'https://www.turkishparadise.online',
  'https://api.turkishparadise.online',
  'https://turkishparadise.xyz',
  'https://www.turkishparadise.xyz',
  'https://api.turkishparadise.xyz'
];

/**
 * Checks if a given request origin is allowed
 */
export function isOriginAllowed(origin?: string | null): boolean {
  if (!origin) return true; // Direct server-to-server or same-origin requests
  const cleanOrigin = origin.trim();

  if (ALLOWED_ORIGINS.includes(cleanOrigin)) {
    return true;
  }

  if (process.env.CORS_ORIGIN && process.env.CORS_ORIGIN.trim() === cleanOrigin) {
    return true;
  }

  // Allow Vercel preview deployments (e.g. https://pococoly-git-main-xxx.vercel.app)
  if (/^https:\/\/[a-zA-Z0-9_-]+\.vercel\.app$/.test(cleanOrigin)) {
    return true;
  }

  if (process.env.NODE_ENV !== 'production') {
    return true;
  }

  return false;
}

/**
 * Applies strict, standard-compliant CORS headers to Vercel/Express response.
 * Returns true if request was an OPTIONS preflight and was handled.
 */
export function handleCors(req: any, res: any, methods = 'GET,POST,OPTIONS'): boolean {
  const origin = req.headers?.origin || req.headers?.Origin;

  if (origin && isOriginAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, x-participant-key, x-guest-token, x-user-id, x-user-name'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return true;
  }

  return false;
}
