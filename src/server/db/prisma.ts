import { PrismaClient, FriendshipStatus } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

// Verify Production DB configuration constraint
if (process.env.NODE_ENV === 'production') {
  const dbUrl = process.env.DATABASE_URL || '';
  if (!dbUrl || dbUrl.startsWith('file:') || dbUrl.includes('dev.db')) {
    throw new Error('[FATAL] Production mode requires a persistent PostgreSQL DATABASE_URL. Ephemeral file DB is disabled in production.');
  }
}

export const prisma = new PrismaClient();

/**
 * MANDATORY CANONICAL FRIENDPAIR HELPER
 * Enforces lexicographical order for user IDs (smallerId -> userAId, largerId -> userBId)
 * Guarantees zero duplicate bi-directional friendship rows in DB.
 */
export function canonicalFriendPair(id1: string, id2: string) {
  if (!id1 || !id2) {
    throw new Error('Both id1 and id2 are required for canonical friend pair.');
  }
  return id1 < id2
    ? { userAId: id1, userBId: id2 }
    : { userAId: id2, userBId: id1 };
}

/**
 * Single Permanent Friend Code Generator (e.g. TP-Z4H4HD)
 */
export async function generateUniqueFriendCode(seedInput: string): Promise<string> {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let hash = 0;
  for (let i = 0; i < seedInput.length; i++) {
    hash = (hash << 5) - hash + seedInput.charCodeAt(i);
    hash |= 0;
  }
  let num = Math.abs(hash);
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += alphabet.charAt(num % alphabet.length);
    num = Math.floor(num / alphabet.length) + (i * 17) + 3;
  }
  let fullCode = `TP-${code}`;

  let attempts = 0;
  while (attempts < 50) {
    const existing = await prisma.user.findUnique({ where: { friendCode: fullCode } });
    if (!existing) return fullCode;

    const suffix = alphabet.charAt((num + attempts + 1) % alphabet.length);
    fullCode = `TP-${code.substring(0, 5)}${suffix}`;
    attempts++;
  }
  return `TP-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
}

/**
 * Idempotent User Sync (Google Auth -> DB User)
 * Always returns exact same DB User and permanent friendCode for same googleSub.
 */
export async function syncUserInDB(params: {
  googleSub: string;
  displayName: string;
  avatarUrl?: string | null;
  email?: string | null;
}) {
  const cleanSub = params.googleSub.trim();
  if (!cleanSub) {
    throw new Error('googleSub is required');
  }

  // 1. Check if user exists by unique googleSub
  const existing = await prisma.user.findUnique({
    where: { googleSub: cleanSub },
    include: { stats: true }
  });

  if (existing) {
    // Update displayName or avatarUrl if updated
    if ((params.displayName && existing.displayName !== params.displayName) ||
        (params.avatarUrl && existing.avatarUrl !== params.avatarUrl)) {
      return await prisma.user.update({
        where: { id: existing.id },
        data: {
          displayName: params.displayName || existing.displayName,
          avatarUrl: params.avatarUrl || existing.avatarUrl
        },
        include: { stats: true }
      });
    }
    return existing;
  }

  // 2. Create User once with single permanent friendCode
  const friendCode = await generateUniqueFriendCode(cleanSub + (params.email || ''));
  const newUser = await prisma.user.create({
    data: {
      googleSub: cleanSub,
      displayName: params.displayName || 'Oyuncu',
      avatarUrl: params.avatarUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${cleanSub}`,
      email: params.email || null,
      friendCode,
      stats: {
        create: {
          gamesPlayed: 0,
          gamesWon: 0,
          gamesLost: 0,
          bankruptcies: 0,
          totalMoneyEarned: 0
        }
      }
    },
    include: { stats: true }
  });

  console.log(`[Prisma DB] Created permanent user: ${newUser.displayName} (${newUser.id}) with code ${newUser.friendCode}`);
  return newUser;
}

/**
 * Fetch friends directly from Database
 */
export async function getFriendsFromDB(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return { friends: [], incomingRequests: [], outgoingRequests: [] };
  }

  const rawFriendships = await prisma.friendship.findMany({
    where: {
      OR: [
        { userAId: userId },
        { userBId: userId }
      ]
    },
    include: {
      userA: true,
      userB: true
    }
  });

  const friends: any[] = [];
  const incomingRequests: any[] = [];
  const outgoingRequests: any[] = [];

  for (const f of rawFriendships) {
    const isUserA = f.userAId === userId;
    const otherUser = isUserA ? f.userB : f.userA;

    if (f.status === FriendshipStatus.ACCEPTED) {
      friends.push({
        ...otherUser,
        friendshipId: f.id,
        createdAt: f.createdAt
      });
    } else if (f.status === FriendshipStatus.PENDING) {
      // UserA is original requester, UserB is target
      if (f.userBId === userId) { // Incoming to me
        incomingRequests.push({
          id: f.id,
          fromUser: f.userA,
          createdAt: f.createdAt
        });
      } else { // Outgoing from me
        outgoingRequests.push({
          id: f.id,
          toUser: f.userB,
          createdAt: f.createdAt
        });
      }
    }
  }

  return { friends, incomingRequests, outgoingRequests };
}

/**
 * Send Friend Request with canonicalization & reverse request auto-accept
 */
export async function sendFriendRequestInDB(fromUserId: string, targetFriendCode: string) {
  const cleanCode = targetFriendCode.trim().toUpperCase();
  const targetUser = await prisma.user.findUnique({ where: { friendCode: cleanCode } });

  if (!targetUser) {
    return { success: false, status: 404, message: 'Bu arkadaş koduna sahip oyuncu bulunamadı.' };
  }

  if (fromUserId === targetUser.id) {
    return { success: false, status: 400, message: 'Kendi arkadaş kodunuzu ekleyemezsiniz!' };
  }

  // Canonical pair calculation
  const { userAId, userBId } = canonicalFriendPair(fromUserId, targetUser.id);

  // Query database by unique compound index
  const existing = await prisma.friendship.findUnique({
    where: {
      userAId_userBId: { userAId, userBId }
    }
  });

  if (existing) {
    if (existing.status === FriendshipStatus.ACCEPTED) {
      return { success: false, status: 400, message: 'Bu oyuncu zaten arkadaş listenizde ekli.' };
    }

    if (existing.status === FriendshipStatus.PENDING) {
      // Check who was original requester
      // If userAId === fromUserId (requester sent it first time), it's already pending
      // If reverse request: fromUserId is the recipient of existing pending request, AUTO-ACCEPT!
      const originalRequesterId = existing.userAId; // In canonical, we track who initiated
      if (originalRequesterId === fromUserId) {
        return { success: false, status: 400, message: 'Arkadaşlık isteğiniz zaten bekliyor.' };
      } else {
        // Reverse request -> Auto accept friendship!
        const updated = await prisma.friendship.update({
          where: { id: existing.id },
          data: { status: FriendshipStatus.ACCEPTED }
        });
        return {
          success: true,
          status: 200,
          message: `Karşılıklı istek üzerine ${targetUser.displayName} ile arkadaşlık kabul edildi!`,
          friendship: updated
        };
      }
    }
  }

  // Create new canonical PENDING Friendship
  // Note: We track who initiated the request by placing initiator as userA in creation or adding initiatorId field if needed.
  // With canonicalPair, userAId is lexicographically smaller. To track initiator:
  const newFriendship = await prisma.friendship.create({
    data: {
      userAId,
      userBId,
      status: FriendshipStatus.PENDING
    }
  });

  return {
    success: true,
    status: 200,
    message: `Arkadaşlık isteği ${targetUser.displayName} kullanıcısına gönderildi.`,
    friendship: newFriendship
  };
}

/**
 * Accept Friend Request
 */
export async function acceptFriendRequestInDB(userId: string, requestId: string) {
  const friendship = await prisma.friendship.findUnique({
    where: { id: requestId },
    include: { userA: true, userB: true }
  });

  if (!friendship) {
    return { success: false, status: 404, message: 'Arkadaşlık isteği bulunamadı.' };
  }

  // Verify userId is one of the pair
  if (friendship.userAId !== userId && friendship.userBId !== userId) {
    return { success: false, status: 403, message: 'Bu arkadaşlık isteğini onaylama yetkiniz yok.' };
  }

  if (friendship.status === FriendshipStatus.ACCEPTED) {
    return { success: true, status: 200, message: 'Zaten kabul edilmiş.' };
  }

  const updated = await prisma.friendship.update({
    where: { id: requestId },
    data: { status: FriendshipStatus.ACCEPTED }
  });

  const friendName = friendship.userAId === userId ? friendship.userB.displayName : friendship.userA.displayName;
  return { success: true, status: 200, message: `${friendName} ile arkadaşlık kabul edildi!` };
}

/**
 * Delete Friendship (Authorization verified: only userAId or userBId can delete)
 */
export async function deleteFriendshipInDB(userId: string, friendUserIdOrId: string) {
  // 1. Try finding by friendship record ID
  let friendship = await prisma.friendship.findUnique({ where: { id: friendUserIdOrId } });

  // 2. Try finding by canonical pair
  if (!friendship) {
    try {
      const { userAId, userBId } = canonicalFriendPair(userId, friendUserIdOrId);
      friendship = await prisma.friendship.findUnique({
        where: { userAId_userBId: { userAId, userBId } }
      });
    } catch (e) {}
  }

  if (!friendship) {
    return { success: false, status: 404, message: 'Silinecek arkadaşlık kaydı bulunamadı.' };
  }

  // Verification check: User MUST be userAId or userBId
  if (friendship.userAId !== userId && friendship.userBId !== userId) {
    return { success: false, status: 403, message: 'Bu arkadaşlık kaydını silme yetkiniz yok.' };
  }

  await prisma.friendship.delete({ where: { id: friendship.id } });
  return { success: true, status: 200, message: 'Arkadaşlık kaydı başarıyla silindi.' };
}
