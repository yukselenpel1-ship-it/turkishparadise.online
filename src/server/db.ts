import fs from 'fs';
import path from 'path';

export interface UserRecord {
  id: string;
  googleSub: string;
  friendCode: string;
  displayName: string;
  avatarUrl?: string;
  email?: string;
  createdAt: string;
}

export interface FriendshipRecord {
  id: string;
  userAId: string; // Request sender
  userBId: string; // Request recipient
  status: 'PENDING' | 'ACCEPTED';
  createdAt: string;
  updatedAt: string;
}

interface DatabaseSchema {
  users: Record<string, UserRecord>;
  usersByGoogleSub: Record<string, string>; // googleSub -> userId
  usersByFriendCode: Record<string, string>; // friendCode -> userId
  friendships: Record<string, FriendshipRecord>;
}

const DB_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.resolve(DB_DIR, 'database.json');

class PersistentDatabase {
  private data: DatabaseSchema = {
    users: {},
    usersByGoogleSub: {},
    usersByFriendCode: {},
    friendships: {}
  };

  constructor() {
    this.init();
  }

  private init() {
    try {
      if (!fs.existsSync(DB_DIR)) {
        fs.mkdirSync(DB_DIR, { recursive: true });
      }
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        this.data = {
          users: parsed.users || {},
          usersByGoogleSub: parsed.usersByGoogleSub || {},
          usersByFriendCode: parsed.usersByFriendCode || {},
          friendships: parsed.friendships || {}
        };
        console.log(`[Database] Loaded persistent data: ${Object.keys(this.data.users).length} users, ${Object.keys(this.data.friendships).length} friendships.`);
      } else {
        this.save();
      }
    } catch (err) {
      console.error('[Database] Failed to load database file:', err);
    }
  }

  private save() {
    try {
      if (!fs.existsSync(DB_DIR)) {
        fs.mkdirSync(DB_DIR, { recursive: true });
      }
      fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (err) {
      console.error('[Database] Failed to save database file:', err);
    }
  }

  /**
   * Helper to generate permanent deterministic/unique 6-char Friend Code (e.g. TP-Z4H4HD)
   */
  private generateFriendCode(seedInput: string): string {
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

    // Ensure global uniqueness
    let counter = 1;
    while (this.data.usersByFriendCode[fullCode]) {
      const suffix = alphabet.charAt((num + counter) % alphabet.length);
      fullCode = `TP-${code.substring(0, 5)}${suffix}`;
      counter++;
    }
    return fullCode;
  }

  /**
   * Idempotent User Sync / Creation
   * Matches Google Sub permanently. Same Google account always returns the exact same UserRecord.
   */
  public syncUser(params: {
    googleSub: string;
    displayName: string;
    avatarUrl?: string;
    email?: string;
  }): UserRecord {
    const cleanSub = params.googleSub.trim();
    if (!cleanSub) {
      throw new Error('googleSub is required');
    }

    // 1. Check if user already exists for this googleSub
    const existingUserId = this.data.usersByGoogleSub[cleanSub];
    if (existingUserId && this.data.users[existingUserId]) {
      const user = this.data.users[existingUserId];
      // Update display name or avatar if changed
      let updated = false;
      if (params.displayName && user.displayName !== params.displayName) {
        user.displayName = params.displayName;
        updated = true;
      }
      if (params.avatarUrl && user.avatarUrl !== params.avatarUrl) {
        user.avatarUrl = params.avatarUrl;
        updated = true;
      }
      if (updated) {
        this.save();
      }
      return user;
    }

    // 2. Create new permanent User Record
    const userId = `usr_${Math.random().toString(36).substring(2, 9)}_${Date.now().toString(36)}`;
    const friendCode = this.generateFriendCode(cleanSub + (params.email || ''));

    const newUser: UserRecord = {
      id: userId,
      googleSub: cleanSub,
      friendCode: friendCode.toUpperCase(),
      displayName: params.displayName || 'Oyuncu',
      avatarUrl: params.avatarUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${cleanSub}`,
      email: params.email,
      createdAt: new Date().toISOString()
    };

    this.data.users[userId] = newUser;
    this.data.usersByGoogleSub[cleanSub] = userId;
    this.data.usersByFriendCode[newUser.friendCode] = userId;
    this.save();

    console.log(`[Database] Created permanent user: ${newUser.displayName} (${newUser.id}) with code ${newUser.friendCode}`);
    return newUser;
  }

  public getUserById(userId: string): UserRecord | null {
    return this.data.users[userId] || null;
  }

  public getUserByFriendCode(friendCode: string): UserRecord | null {
    const clean = friendCode.trim().toUpperCase();
    const userId = this.data.usersByFriendCode[clean];
    if (userId) {
      return this.data.users[userId] || null;
    }
    // Fallback search
    for (const u of Object.values(this.data.users)) {
      if (u.friendCode.toUpperCase() === clean) {
        return u;
      }
    }
    return null;
  }

  /**
   * Get all active friends and pending requests for a user
   */
  public getFriendsForUser(userId: string) {
    const user = this.getUserById(userId);
    if (!user) {
      return { friends: [], pendingIncoming: [], pendingOutgoing: [] };
    }

    const friends: Array<UserRecord & { friendshipId: string }> = [];
    const pendingIncoming: Array<UserRecord & { requestId: string; createdAt: string }> = [];
    const pendingOutgoing: Array<UserRecord & { requestId: string; createdAt: string }> = [];

    for (const f of Object.values(this.data.friendships)) {
      if (f.status === 'ACCEPTED') {
        if (f.userAId === userId) {
          const target = this.getUserById(f.userBId);
          if (target) friends.push({ ...target, friendshipId: f.id });
        } else if (f.userBId === userId) {
          const target = this.getUserById(f.userAId);
          if (target) friends.push({ ...target, friendshipId: f.id });
        }
      } else if (f.status === 'PENDING') {
        if (f.userBId === userId) { // Incoming to me
          const sender = this.getUserById(f.userAId);
          if (sender) pendingIncoming.push({ ...sender, requestId: f.id, createdAt: f.createdAt });
        } else if (f.userAId === userId) { // Outgoing from me
          const target = this.getUserById(f.userBId);
          if (target) pendingOutgoing.push({ ...target, requestId: f.id, createdAt: f.createdAt });
        }
      }
    }

    return { friends, pendingIncoming, pendingOutgoing };
  }

  /**
   * Send a Friend Request (Prevent self-friend & duplicates)
   */
  public sendFriendRequest(fromUserId: string, targetFriendCode: string): { success: boolean; message: string; friendship?: FriendshipRecord } {
    const sender = this.getUserById(fromUserId);
    if (!sender) {
      return { success: false, message: 'Gönderen kullanıcı bulunamadı.' };
    }

    const cleanCode = targetFriendCode.trim().toUpperCase();
    const target = this.getUserByFriendCode(cleanCode);
    if (!target) {
      return { success: false, message: 'Bu arkadaş koduna sahip oyuncu bulunamadı.' };
    }

    if (sender.id === target.id) {
      return { success: false, message: 'Kendi arkadaş kodunuzu ekleyemezsiniz!' };
    }

    // Check existing friendship in either direction (A->B or B->A)
    for (const f of Object.values(this.data.friendships)) {
      const isPair = (f.userAId === sender.id && f.userBId === target.id) ||
                     (f.userAId === target.id && f.userBId === sender.id);
      if (isPair) {
        if (f.status === 'ACCEPTED') {
          return { success: false, message: 'Bu oyuncu zaten arkadaş listenizde ekli.' };
        } else {
          return { success: false, message: 'Bu oyuncu ile zaten bekleyen bir arkadaşlık isteği var.' };
        }
      }
    }

    // Create PENDING friendship
    const id = `fr_${Math.random().toString(36).substring(2, 9)}_${Date.now().toString(36)}`;
    const newFriendship: FriendshipRecord = {
      id,
      userAId: sender.id,
      userBId: target.id,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.data.friendships[id] = newFriendship;
    this.save();
    return { success: true, message: `Arkadaşlık isteği ${target.displayName} kullanıcısına gönderildi.`, friendship: newFriendship };
  }

  /**
   * Accept Friend Request (Only recipient userBId can accept)
   */
  public acceptFriendRequest(userId: string, requestId: string): { success: boolean; message: string } {
    const friendship = this.data.friendships[requestId];
    if (!friendship) {
      return { success: false, message: 'Arkadaşlık isteği bulunamadı.' };
    }

    if (friendship.userBId !== userId) {
      return { success: false, message: 'Bu arkadaşlık isteğini kabul etme yetkiniz yok.' };
    }

    if (friendship.status === 'ACCEPTED') {
      return { success: true, message: 'Zaten kabul edilmiş.' };
    }

    friendship.status = 'ACCEPTED';
    friendship.updatedAt = new Date().toISOString();
    this.save();

    const sender = this.getUserById(friendship.userAId);
    return { success: true, message: `${sender?.displayName || 'Oyuncu'} ile arkadaşlık kabul edildi!` };
  }

  /**
   * Delete Friendship (Only userAId or userBId can delete)
   */
  public deleteFriendship(userId: string, friendshipIdOrTargetId: string): { success: boolean; message: string } {
    let targetFriendship: FriendshipRecord | null = null;

    // Check if passed string is direct friendship ID
    if (this.data.friendships[friendshipIdOrTargetId]) {
      targetFriendship = this.data.friendships[friendshipIdOrTargetId];
    } else {
      // Find friendship matching (userId, friendshipIdOrTargetId)
      for (const f of Object.values(this.data.friendships)) {
        if ((f.userAId === userId && f.userBId === friendshipIdOrTargetId) ||
            (f.userBId === userId && f.userAId === friendshipIdOrTargetId)) {
          targetFriendship = f;
          break;
        }
      }
    }

    if (!targetFriendship) {
      return { success: false, message: 'Silinecek arkadaşlık kaydı bulunamadı.' };
    }

    if (targetFriendship.userAId !== userId && targetFriendship.userBId !== userId) {
      return { success: false, message: 'Bu arkadaşlık kaydını silme yetkiniz yok.' };
    }

    delete this.data.friendships[targetFriendship.id];
    this.save();
    return { success: true, message: 'Arkadaşlık kaydı silindi.' };
  }
}

export const db = new PersistentDatabase();
