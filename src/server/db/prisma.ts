import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

export const FriendshipStatus = {
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED'
} as const;

export type FriendshipStatus = typeof FriendshipStatus[keyof typeof FriendshipStatus];

let prismaInstance: any = null;
let prismaInitError: string | null = null;

export function isPostgresConfigured(): boolean {
  const url = (process.env.DATABASE_URL || '').trim();
  return url.startsWith('postgresql://') || url.startsWith('postgres://');
}

/**
 * Lazy Prisma Client Getter with resilient error isolation.
 */
export async function getPrisma(): Promise<any> {
  if (prismaInstance) {
    return prismaInstance;
  }

  if (!isPostgresConfigured()) {
    return null; // Signals to use memory/local repository
  }

  try {
    const { PrismaClient } = await import('@prisma/client');
    prismaInstance = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error']
    });

    prismaInitError = null;
    return prismaInstance;
  } catch (err: any) {
    prismaInitError = err?.message || 'Prisma client initialization failed.';
    console.error('[Prisma Error] Failed to initialize PrismaClient:', prismaInitError);
    return null;
  }
}

export function getDatabaseStatus(): { ok: boolean; message: string } {
  if (prismaInitError) {
    return { ok: false, message: prismaInitError };
  }
  const configured = isPostgresConfigured();
  return {
    ok: configured,
    message: configured ? 'PostgreSQL Database Configured' : 'Running with local fallback storage'
  };
}

// In-Memory / File Fallback Store for Local Development & Testing
interface LocalUser {
  id: string;
  googleSub: string;
  email: string | null;
  displayName: string;
  avatarUrl: string | null;
  friendCode: string;
  createdAt: string;
  updatedAt: string;
  stats?: any;
}

interface LocalFriendship {
  id: string;
  userAId: string;
  userBId: string;
  status: FriendshipStatus;
  createdAt: string;
  updatedAt: string;
}

const memoryUsers = new Map<string, LocalUser>();
const memoryFriendships = new Map<string, LocalFriendship>();

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
    try {
      const prisma = await getPrisma();
      if (prisma) {
        const existing = await prisma.user.findUnique({ where: { friendCode: fullCode } });
        if (!existing) return fullCode;
      } else {
        const existing = Array.from(memoryUsers.values()).find(u => u.friendCode === fullCode);
        if (!existing) return fullCode;
      }
    } catch (e) {
      return fullCode;
    }

    const suffix = alphabet.charAt((num + attempts + 1) % alphabet.length);
    fullCode = `TP-${code.substring(0, 5)}${suffix}`;
    attempts++;
  }
  return `TP-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
}

/**
 * Resolves a User record by either `id` (cuid), `googleSub`, or `friendCode`
 */
export async function resolveUser(userIdOrSub: string, defaultName = 'Oyuncu'): Promise<any> {
  if (!userIdOrSub) return null;
  const clean = userIdOrSub.trim();
  const prisma = await getPrisma();

  if (prisma) {
    let user = await prisma.user.findUnique({ where: { id: clean } });
    if (!user) {
      user = await prisma.user.findUnique({ where: { googleSub: clean } });
    }
    if (!user && clean.startsWith('google_')) {
      const stripped = clean.replace(/^google_/, '');
      user = await prisma.user.findUnique({ where: { googleSub: stripped } });
    }
    if (!user && clean.startsWith('user_')) {
      const stripped = clean.replace(/^user_/, '');
      user = await prisma.user.findUnique({ where: { googleSub: stripped } });
    }
    if (!user && clean.startsWith('TP-')) {
      user = await prisma.user.findUnique({ where: { friendCode: clean.toUpperCase() } });
    }
    if (!user) {
      user = await syncUserInDB({ googleSub: clean, displayName: defaultName });
    }
    return user;
  }

  // Fallback memory resolver
  let user =
    memoryUsers.get(clean) ||
    Array.from(memoryUsers.values()).find(
      (u) =>
        u.googleSub === clean ||
        u.id === clean ||
        (clean.startsWith('google_') && u.googleSub === clean.replace(/^google_/, '')) ||
        (clean.startsWith('user_') && u.googleSub === clean.replace(/^user_/, '')) ||
        (clean.startsWith('TP-') && u.friendCode.toUpperCase() === clean.toUpperCase())
    );
  if (!user) {
    user = await syncUserInDB({ googleSub: clean, displayName: defaultName });
  }
  return user;
}

/**
 * Idempotent User Sync (Server-Verified Google Auth -> DB User)
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

  const prisma = await getPrisma();

  if (prisma) {
    const existing = await prisma.user.findUnique({
      where: { googleSub: cleanSub },
      include: { stats: true }
    });

    if (existing) {
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

  // Fallback memory repository
  const existing = Array.from(memoryUsers.values()).find(u => u.googleSub === cleanSub);
  if (existing) {
    if (params.displayName) existing.displayName = params.displayName;
    if (params.avatarUrl) existing.avatarUrl = params.avatarUrl;
    return existing;
  }

  const id = `usr_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
  const friendCode = await generateUniqueFriendCode(cleanSub + (params.email || ''));
  const newUser: LocalUser = {
    id,
    googleSub: cleanSub,
    displayName: params.displayName || 'Oyuncu',
    avatarUrl: params.avatarUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${cleanSub}`,
    email: params.email || null,
    friendCode,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    stats: { gamesPlayed: 0, gamesWon: 0, gamesLost: 0, bankruptcies: 0, totalMoneyEarned: 0 }
  };
  memoryUsers.set(id, newUser);
  memoryUsers.set(cleanSub, newUser);
  return newUser;
}

/**
 * Fetch friends directly from Database
 */
export async function getFriendsFromDB(userIdOrSub: string) {
  const user = await resolveUser(userIdOrSub);
  if (!user) {
    return { friends: [], incomingRequests: [], outgoingRequests: [] };
  }

  const userId = user.id;
  const userSub = user.googleSub;
  const userFriendCode = user.friendCode;
  const prisma = await getPrisma();

  if (prisma) {
    const matchingUsers = await prisma.user.findMany({
      where: {
        OR: [
          { id: userId },
          { googleSub: userSub },
          { friendCode: userFriendCode }
        ]
      },
      select: { id: true }
    });
    const userIds = matchingUsers.map((u: any) => u.id);
    if (!userIds.includes(userId)) userIds.push(userId);

    const rawFriendships = await prisma.friendship.findMany({
      where: {
        OR: [
          { userAId: { in: userIds } },
          { userBId: { in: userIds } }
        ]
      },
      include: {
        userA: true,
        userB: true
      }
    });

    const friendsMap = new Map<string, any>();
    const incomingRequests: any[] = [];
    const outgoingRequests: any[] = [];

    for (const f of rawFriendships) {
      const isUserA = userIds.includes(f.userAId);
      const isUserB = userIds.includes(f.userBId);
      const otherUser = isUserA ? f.userB : f.userA;
      if (!otherUser) continue;

      if (f.status === FriendshipStatus.ACCEPTED) {
        if (!friendsMap.has(otherUser.id) && !friendsMap.has(otherUser.friendCode)) {
          friendsMap.set(otherUser.id, {
            ...otherUser,
            friendshipId: f.id,
            createdAt: f.createdAt
          });
        }
      } else if (f.status === FriendshipStatus.PENDING) {
        // userB is the recipient / target user
        if (isUserB) {
          incomingRequests.push({
            id: f.id,
            fromUser: f.userA,
            createdAt: f.createdAt
          });
        } else if (isUserA) {
          outgoingRequests.push({
            id: f.id,
            toUser: f.userB,
            createdAt: f.createdAt
          });
        }
      }
    }

    return {
      friends: Array.from(friendsMap.values()),
      incomingRequests,
      outgoingRequests
    };
  }

  // Fallback memory repository
  const friendsMap = new Map<string, any>();
  const incomingRequests: any[] = [];
  const outgoingRequests: any[] = [];

  for (const f of memoryFriendships.values()) {
    const isUserA = f.userAId === userId || f.userAId === userSub;
    const isUserB = f.userBId === userId || f.userBId === userSub;
    if (!isUserA && !isUserB) continue;

    const otherId = isUserA ? f.userBId : f.userAId;
    const otherUser =
      memoryUsers.get(otherId) ||
      Array.from(memoryUsers.values()).find((u) => u.id === otherId || u.googleSub === otherId);
    if (!otherUser) continue;

    if (f.status === FriendshipStatus.ACCEPTED) {
      if (!friendsMap.has(otherUser.id)) {
        friendsMap.set(otherUser.id, {
          ...otherUser,
          friendshipId: f.id,
          createdAt: f.createdAt
        });
      }
    } else if (f.status === FriendshipStatus.PENDING) {
      if (isUserB) {
        incomingRequests.push({ id: f.id, fromUser: otherUser, createdAt: f.createdAt });
      } else if (isUserA) {
        outgoingRequests.push({ id: f.id, toUser: otherUser, createdAt: f.createdAt });
      }
    }
  }

  return {
    friends: Array.from(friendsMap.values()),
    incomingRequests,
    outgoingRequests
  };
}

/**
 * Send Friend Request with direct sender (userAId) -> receiver (userBId) semantics
 * and automatic mutual accept if reverse request exists
 */
export async function sendFriendRequestInDB(fromUserIdOrSub: string, targetFriendCode: string) {
  const cleanCode = targetFriendCode.trim().toUpperCase();
  const prisma = await getPrisma();

  const fromUser = await resolveUser(fromUserIdOrSub);
  if (!fromUser) {
    return { success: false, status: 400, message: 'Gönderici profili bulunamadı.' };
  }

  let targetUser: any = null;
  if (prisma) {
    targetUser = await prisma.user.findFirst({
      where: {
        OR: [
          { friendCode: cleanCode },
          { friendCode: cleanCode.replace(/^TP-/, '') },
          { friendCode: `TP-${cleanCode.replace(/^TP-/, '')}` }
        ]
      }
    });
  } else {
    targetUser = Array.from(memoryUsers.values()).find(
      (u) =>
        u.friendCode.toUpperCase() === cleanCode ||
        u.friendCode.toUpperCase() === cleanCode.replace(/^TP-/, '') ||
        u.friendCode.toUpperCase() === `TP-${cleanCode.replace(/^TP-/, '')}`
    );
  }

  if (!targetUser) {
    targetUser = await syncUserInDB({
      googleSub: `code_${cleanCode}`,
      displayName: 'Oyuncu'
    });
    if (prisma) {
      try {
        await prisma.user.update({
          where: { id: targetUser.id },
          data: { friendCode: cleanCode }
        });
        targetUser.friendCode = cleanCode;
      } catch (e) {}
    }
  }

  if (fromUser.id === targetUser.id) {
    return { success: false, status: 400, message: 'Kendi arkadaş kodunuzu ekleyemezsiniz!' };
  }

  const senderId = fromUser.id;
  const receiverId = targetUser.id;

  if (prisma) {
    // Check if any friendship or pending request already exists between these two users
    const existing = await prisma.friendship.findFirst({
      where: {
        OR: [
          { userAId: senderId, userBId: receiverId },
          { userAId: receiverId, userBId: senderId }
        ]
      }
    });

    if (existing) {
      if (existing.status === FriendshipStatus.ACCEPTED) {
        return { success: false, status: 400, message: 'Bu oyuncu zaten arkadaş listenizde ekli.' };
      }

      if (existing.status === FriendshipStatus.PENDING) {
        if (existing.userAId === senderId) {
          return { success: false, status: 400, message: 'Arkadaşlık isteğiniz zaten bekliyor.' };
        } else {
          // The other user had already sent a request to me -> Auto-Accept!
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

    const newFriendship = await prisma.friendship.create({
      data: {
        userAId: senderId,
        userBId: receiverId,
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

  // Fallback memory repository
  for (const f of memoryFriendships.values()) {
    if (
      (f.userAId === senderId && f.userBId === receiverId) ||
      (f.userAId === receiverId && f.userBId === senderId)
    ) {
      if (f.status === FriendshipStatus.ACCEPTED) {
        return { success: false, status: 400, message: 'Bu oyuncu zaten arkadaş listenizde ekli.' };
      }
      if (f.status === FriendshipStatus.PENDING) {
        if (f.userAId === senderId) {
          return { success: false, status: 400, message: 'Arkadaşlık isteğiniz zaten bekliyor.' };
        } else {
          f.status = FriendshipStatus.ACCEPTED;
          return {
            success: true,
            status: 200,
            message: `Karşılıklı istek üzerine ${targetUser.displayName} ile arkadaşlık kabul edildi!`,
            friendship: f
          };
        }
      }
    }
  }

  const fId = `fr_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
  const newF: LocalFriendship = {
    id: fId,
    userAId: senderId,
    userBId: receiverId,
    status: FriendshipStatus.PENDING,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  memoryFriendships.set(fId, newF);

  return {
    success: true,
    status: 200,
    message: `Arkadaşlık isteği ${targetUser.displayName} kullanıcısına gönderildi.`,
    friendship: newF
  };
}

/**
 * Accept Friend Request
 */
export async function acceptFriendRequestInDB(
  userIdOrSub: string,
  requestIdOrFromUser: string,
  fromFriendCode?: string
) {
  const user = await resolveUser(userIdOrSub);
  if (!user) {
    return { success: false, status: 400, message: 'Kullanıcı bulunamadı.' };
  }
  const userId = user.id;

  const prisma = await getPrisma();
  if (prisma) {
    // 1. Try finding by direct Friendship ID
    let friendship = await prisma.friendship.findUnique({
      where: { id: requestIdOrFromUser },
      include: { userA: true, userB: true }
    });

    // 2. Try finding pending friendship where target is current user and sender is requestIdOrFromUser
    if (!friendship) {
      try {
        const fromUser = await resolveUser(requestIdOrFromUser);
        if (fromUser) {
          friendship = await prisma.friendship.findFirst({
            where: {
              OR: [
                { userAId: fromUser.id, userBId: userId },
                { userAId: userId, userBId: fromUser.id }
              ]
            },
            include: { userA: true, userB: true }
          });
        }
      } catch (e) {}
    }

    // 3. Try finding pending friendship by sender friendCode
    if (!friendship && fromFriendCode) {
      try {
        const cleanFCode = fromFriendCode.trim().toUpperCase();
        const fromUser = await prisma.user.findUnique({ where: { friendCode: cleanFCode } });
        if (fromUser) {
          friendship = await prisma.friendship.findFirst({
            where: {
              OR: [
                { userAId: fromUser.id, userBId: userId },
                { userAId: userId, userBId: fromUser.id }
              ]
            },
            include: { userA: true, userB: true }
          });
        }
      } catch (e) {}
    }

    if (!friendship) {
      return { success: false, status: 404, message: 'Arkadaşlık isteği bulunamadı.' };
    }

    if (friendship.userAId !== userId && friendship.userBId !== userId) {
      return { success: false, status: 403, message: 'Bu arkadaşlık isteğini onaylama yetkiniz yok.' };
    }

    if (friendship.status === FriendshipStatus.ACCEPTED) {
      return { success: true, status: 200, message: 'Zaten kabul edilmiş.' };
    }

    const updated = await prisma.friendship.update({
      where: { id: friendship.id },
      data: { status: FriendshipStatus.ACCEPTED }
    });

    const friendName = friendship.userAId === userId ? friendship.userB.displayName : friendship.userA.displayName;
    return { success: true, status: 200, message: `${friendName} ile arkadaşlık kabul edildi!` };
  }

  // Fallback memory repository
  let friendship = memoryFriendships.get(requestIdOrFromUser);
  if (!friendship) {
    for (const f of memoryFriendships.values()) {
      if (
        (f.userAId === userId && f.userBId === requestIdOrFromUser) ||
        (f.userBId === userId && f.userAId === requestIdOrFromUser)
      ) {
        friendship = f;
        break;
      }
    }
  }

  if (!friendship) {
    return { success: false, status: 404, message: 'Arkadaşlık isteği bulunamadı.' };
  }
  if (friendship.userAId !== userId && friendship.userBId !== userId) {
    return { success: false, status: 403, message: 'Bu arkadaşlık isteğini onaylama yetkiniz yok.' };
  }
  friendship.status = FriendshipStatus.ACCEPTED;
  const otherId = friendship.userAId === userId ? friendship.userBId : friendship.userAId;
  const otherUser = memoryUsers.get(otherId);
  const friendName = otherUser ? otherUser.displayName : 'Oyuncu';
  return { success: true, status: 200, message: `${friendName} ile arkadaşlık kabul edildi!` };
}

/**
 * Delete Friendship
 */
export async function deleteFriendshipInDB(userIdOrSub: string, friendUserIdOrId: string) {
  const user = await resolveUser(userIdOrSub);
  if (!user) {
    return { success: false, status: 400, message: 'Kullanıcı bulunamadı.' };
  }
  const userId = user.id;

  const prisma = await getPrisma();
  if (prisma) {
    let friendship = await prisma.friendship.findUnique({ where: { id: friendUserIdOrId } });

    if (!friendship) {
      try {
        const friendUser = await resolveUser(friendUserIdOrId);
        if (friendUser) {
          friendship = await prisma.friendship.findFirst({
            where: {
              OR: [
                { userAId: userId, userBId: friendUser.id },
                { userAId: friendUser.id, userBId: userId }
              ]
            }
          });
        }
      } catch (e) {}
    }

    if (!friendship) {
      return { success: false, status: 404, message: 'Silinecek arkadaşlık kaydı bulunamadı.' };
    }

    if (friendship.userAId !== userId && friendship.userBId !== userId) {
      return { success: false, status: 403, message: 'Bu arkadaşlık kaydını silme yetkiniz yok.' };
    }

    await prisma.friendship.delete({ where: { id: friendship.id } });
    return { success: true, status: 200, message: 'Arkadaşlık kaydı başarıyla silindi.' };
  }

  // Fallback memory repository
  for (const [id, f] of memoryFriendships.entries()) {
    if (id === friendUserIdOrId || f.userAId === friendUserIdOrId || f.userBId === friendUserIdOrId) {
      memoryFriendships.delete(id);
    }
  }
  return { success: true, status: 200, message: 'Arkadaşlık kaydı başarıyla silindi.' };
}
