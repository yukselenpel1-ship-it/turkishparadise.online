import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { z } from 'zod';
import {
  getDatabaseStatus,
  syncUserInDB,
  getFriendsFromDB,
  sendFriendRequestInDB,
  acceptFriendRequestInDB,
  deleteFriendshipInDB
} from './db/prisma';
import {
  generateUserToken,
  requireAuth,
  AuthenticatedRequest
} from './auth/authMiddleware';
import { verifyGoogleToken } from './auth/googleVerifier';

dotenv.config();

const app = express();

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:3001',
  'https://turkishparadise.online',
  'https://www.turkishparadise.online',
  'https://api.turkishparadise.online'
];

if (process.env.CORS_ORIGIN) {
  allowedOrigins.push(process.env.CORS_ORIGIN);
}

const checkOrigin = (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
  if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
    callback(null, true);
  } else {
    callback(null, true);
  }
};

app.use(cors({ origin: checkOrigin, credentials: true }));
app.use(express.json());

// Zod Schemas for Input Validation
const SyncUserSchema = z.object({
  idToken: z.string().optional(),
  // Fallback for dev / mock testing environments only
  googleSub: z.string().optional(),
  displayName: z.string().optional(),
  avatarUrl: z.string().optional().nullable(),
  email: z.string().optional().nullable()
});

const FriendRequestSchema = z.object({
  targetFriendCode: z.string().min(3)
});

const AcceptRequestSchema = z.object({
  requestId: z.string().optional(),
  fromUserId: z.string().optional(),
  fromFriendCode: z.string().optional()
});

// Router definition for API endpoints
const apiRouter = express.Router();

// --------------------------------------------------------------------------
// 1. TOP-LEVEL DATABASE-INDEPENDENT HEALTH ENDPOINT
// Returns 200 OK unconditionally {"status": "ok"}
// --------------------------------------------------------------------------
apiRouter.get('/health', (_req, res) => {
  return res.status(200).json({
    status: 'ok',
    database: getDatabaseStatus()
  });
});

/**
 * POST /users/sync (or /api/users/sync)
 * Server-Side Verified Google Identity Sync.
 * Backend verifies the Google id_token with Google servers before trusting identity.
 */
apiRouter.post('/users/sync', async (req, res) => {
  try {
    const parseResult = SyncUserSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'INVALID_INPUT', details: parseResult.error.format() });
    }

    const { idToken, googleSub, displayName, avatarUrl, email } = parseResult.data;

    let verifiedSub: string;
    let verifiedName: string;
    let verifiedEmail: string | null = null;
    let verifiedAvatar: string | null = null;

    if (idToken) {
      // 1. Mandatory Server-Side Google Token Verification
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
      // Allow raw googleSub only in local development / unit tests
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

    // 2. Upsert verified identity into Database
    const user = await syncUserInDB({
      googleSub: verifiedSub,
      displayName: verifiedName,
      avatarUrl: verifiedAvatar,
      email: verifiedEmail
    });

    // 3. Issue signed JWT session token
    const token = generateUserToken({
      id: user.id,
      googleSub: user.googleSub,
      email: user.email,
      displayName: user.displayName
    });

    return res.json({
      success: true,
      user,
      token
    });
  } catch (err: any) {
    console.error('[API] Sync user error:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message || 'Internal server error' });
  }
});

/**
 * GET /friends (or /api/friends)
 * Protected Endpoint: Fetches friends & requests for authenticated user from Prisma DB.
 * Unauthenticated requests return HTTP 401 Unauthorized JSON response.
 */
apiRouter.get('/friends', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const result = await getFriendsFromDB(userId);

    const annotatedFriends = result.friends.map(f => ({
      ...f,
      isOnline: false
    }));

    return res.json({
      success: true,
      friends: annotatedFriends,
      pendingIncoming: result.incomingRequests,
      pendingOutgoing: result.outgoingRequests
    });
  } catch (err: any) {
    console.error('[API] Get friends error:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

/**
 * POST /friends/request (or /api/friends/request)
 * Protected Endpoint: Send friend request by friendCode.
 */
apiRouter.post('/friends/request', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const parseResult = FriendRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'INVALID_INPUT', details: parseResult.error.format() });
    }

    const fromUserId = req.user!.id;
    const { targetFriendCode } = parseResult.data;

    const outcome = await sendFriendRequestInDB(fromUserId, targetFriendCode);
    if (!outcome.success) {
      return res.status(outcome.status || 400).json({ error: outcome.message });
    }

    return res.json(outcome);
  } catch (err: any) {
    console.error('[API] Send friend request error:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

/**
 * POST /friends/accept (or /api/friends/accept)
 * Protected Endpoint: Accept a pending friend request.
 */
apiRouter.post('/friends/accept', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const parseResult = AcceptRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'INVALID_INPUT', details: parseResult.error.format() });
    }

    const userId = req.user!.id;
    const { requestId, fromUserId, fromFriendCode } = parseResult.data;
    const targetIdentifier = requestId || fromUserId;

    if (!targetIdentifier) {
      return res.status(400).json({ error: 'INVALID_INPUT', message: 'requestId veya fromUserId zorunludur.' });
    }

    const outcome = await acceptFriendRequestInDB(userId, targetIdentifier, fromFriendCode);
    if (!outcome.success) {
      return res.status(outcome.status || 400).json({ error: outcome.message });
    }

    return res.json(outcome);
  } catch (err: any) {
    console.error('[API] Accept friend request error:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

/**
 * DELETE /friends/:friendId (or /api/friends/:friendId)
 * Protected Endpoint: Delete a friendship record.
 */
apiRouter.delete('/friends/:friendId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const friendId = req.params.friendId;
    const userId = req.user!.id;

    const outcome = await deleteFriendshipInDB(userId, friendId);
    if (!outcome.success) {
      return res.status(outcome.status || 400).json({ error: outcome.message });
    }

    return res.json(outcome);
  } catch (err: any) {
    console.error('[API] Delete friend error:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// Mount router on both /api and /
app.use('/api', apiRouter);
app.use('/', apiRouter);

export default app;
export { app };
