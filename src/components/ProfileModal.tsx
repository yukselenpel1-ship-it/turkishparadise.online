import React, { useState, useEffect } from 'react';
import { UserAccount, FriendUser, FriendRequest } from '../types/game';
import {
  Trophy,
  Award,
  TrendingUp,
  DollarSign,
  Mail,
  X,
  LogOut,
  Sparkles,
  XCircle,
  History,
  Users,
  Copy,
  Check,
  UserPlus,
  Trash2,
  Share2,
  Gamepad2,
  Loader2,
  ShieldCheck,
  UserCheck,
  UserX,
  LogIn,
  Radio,
  ArrowRight,
  Inbox,
  Send,
  Plus
} from 'lucide-react';
import {
  sendFriendRequest,
  acceptFriendRequest,
  removeFriend,
  fetchFriendsFromDB,
  subscribeToFriendRequests
} from '../services/friendService';

export type ProfileTab = 'stats' | 'friends' | 'requests' | 'add';

interface ProfileModalProps {
  userAccount: UserAccount;
  onClose: () => void;
  onLogout: () => void;
  onUpdateUserAccount?: (updated: UserAccount) => void;
  onGoogleLogin?: () => Promise<void>;
  onJoinRoom?: (targetRoomId: string) => void;
  roomId?: string;
  initialTab?: ProfileTab;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({
  userAccount,
  onClose,
  onLogout,
  onUpdateUserAccount,
  onGoogleLogin,
  onJoinRoom,
  roomId = 'TR-1001',
  initialTab = 'stats'
}) => {
  const [activeTab, setActiveTab] = useState<ProfileTab>(initialTab);
  const [copiedId, setCopiedId] = useState(false);
  const [targetCode, setTargetCode] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [copiedInviteCode, setCopiedInviteCode] = useState<string | null>(null);
  const [incomingRequests, setIncomingRequests] = useState<FriendRequest[]>([]);
  const [friendsList, setFriendsList] = useState<FriendUser[]>([]);

  // Subscribe to Real-Time Incoming Friend Requests & Presence (Database Backend API)
  useEffect(() => {
    if (!userAccount.uid) return;

    const loadDbFriends = async () => {
      const { friends, pendingRequests } = await fetchFriendsFromDB(userAccount.uid);
      setFriendsList(friends);
      setIncomingRequests(pendingRequests);
    };

    loadDbFriends();
    const interval = setInterval(loadDbFriends, 3000);

    return () => {
      clearInterval(interval);
    };
  }, [userAccount.uid]);

  const stats = userAccount.stats || { gamesWon: 0, gamesLost: 0, gamesPlayed: 0, totalMoneyEarned: 0, history: [] };
  const totalPlayed = stats.gamesPlayed || (stats.gamesWon + (stats.gamesLost || 0));
  const winRate = totalPlayed > 0 ? Math.round((stats.gamesWon / totalPlayed) * 100) : 0;
  const history = stats.history || [];
  const isGoogleUser = userAccount.provider === 'google';

  // Title rank based on wins
  const getRank = (wins: number) => {
    if (wins >= 15) return { title: 'Boğaz & Türkiye İmparatoru 👑', color: 'from-amber-300 via-amber-400 to-yellow-200' };
    if (wins >= 8) return { title: 'Büyük Gayrimenkul Kralı 💎', color: 'from-sky-400 via-indigo-300 to-teal-300' };
    if (wins >= 4) return { title: 'Usta Emlakçı & Yatırımcı 🥈', color: 'from-emerald-400 to-teal-200' };
    if (wins >= 1) return { title: 'Geleceğin Milyoneri 🥉', color: 'from-amber-500 to-amber-300' };
    return { title: 'Çaylak Yatırımcı 🎲', color: 'from-slate-400 to-slate-200' };
  };

  const rank = getRank(stats.gamesWon);

  // Copy Special ID
  const handleCopyId = () => {
    if (!userAccount.friendCode) return;
    try {
      navigator.clipboard.writeText(userAccount.friendCode);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    } catch (e) {
      console.warn('Copy failed:', e);
    }
  };

  // Send friend request by Special ID
  const handleSendRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetCode.trim()) return;

    setIsAdding(true);
    setStatusMessage(null);

    try {
      const res = await sendFriendRequest(userAccount, targetCode);
      if (res.success) {
        setStatusMessage({ text: res.message, type: 'success' });
        setTargetCode('');
        const { friends, pendingRequests } = await fetchFriendsFromDB(userAccount.uid);
        setFriendsList(friends);
        setIncomingRequests(pendingRequests);
      } else {
        setStatusMessage({ text: res.message, type: 'error' });
      }
    } catch (err: any) {
      setStatusMessage({ text: 'İstek gönderilirken bir hata oluştu.', type: 'error' });
    } finally {
      setIsAdding(false);
    }
  };

  // Accept incoming friend request
  const handleAcceptRequest = async (req: FriendRequest) => {
    try {
      const res = await acceptFriendRequest(userAccount.uid, req.id);
      if (res.success) {
        const { friends, pendingRequests } = await fetchFriendsFromDB(userAccount.uid);
        setFriendsList(friends);
        setIncomingRequests(pendingRequests);
        setStatusMessage({ text: `🎉 "${req.fromDisplayName}" ile artık arkadaşsınız!`, type: 'success' });
        setTimeout(() => setStatusMessage(null), 3000);
      } else {
        setStatusMessage({ text: res.message || 'İstek kabul edilemedi.', type: 'error' });
      }
    } catch (e) {
      setStatusMessage({ text: 'İstek kabul edilemedi.', type: 'error' });
    }
  };

  // Decline incoming friend request
  const handleDeclineRequest = async (reqId: string) => {
    try {
      await removeFriend(userAccount.uid, reqId);
      const { pendingRequests } = await fetchFriendsFromDB(userAccount.uid);
      setIncomingRequests(pendingRequests);
      setStatusMessage({ text: 'Arkadaşlık isteği reddedildi.', type: 'error' });
      setTimeout(() => setStatusMessage(null), 2500);
    } catch (e) {}
  };

  // Remove friend
  const handleRemoveFriend = async (friendUid: string) => {
    try {
      const res = await removeFriend(userAccount.uid, friendUid);
      if (res.success) {
        const { friends } = await fetchFriendsFromDB(userAccount.uid);
        setFriendsList(friends);
        setStatusMessage({ text: 'Arkadaş listenizden çıkarıldı.', type: 'success' });
      } else {
        setStatusMessage({ text: res.message || 'Arkadaş çıkarılamadı.', type: 'error' });
      }
    } catch (e) {
      setStatusMessage({ text: 'Arkadaş çıkarılamadı.', type: 'error' });
    }
    setTimeout(() => setStatusMessage(null), 2500);
  };

  // Invite friend to current room
  const handleInviteFriend = (friend: FriendUser) => {
    try {
      const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
      navigator.clipboard.writeText(inviteUrl);
      setCopiedInviteCode(friend.friendCode);
      setStatusMessage({ text: `📋 ${friend.displayName} için "${roomId}" oda davet bağlantısı panoya kopyalandı!`, type: 'success' });
      setTimeout(() => {
        setCopiedInviteCode(null);
        setStatusMessage(null);
      }, 3000);
    } catch (e) {
      console.warn('Invite copy failed:', e);
    }
  };

  // Direct Join Friend's Room
  const handleJoinFriendRoom = (targetRoomId?: string) => {
    if (!targetRoomId) return;
    if (onJoinRoom) {
      onJoinRoom(targetRoomId);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in font-['Plus_Jakarta_Sans',sans-serif] select-none">
      <div className="bg-[#0a1020]/95 border border-amber-500/40 rounded-3xl max-w-lg w-full p-3.5 sm:p-6 text-left shadow-2xl relative overflow-hidden ring-1 ring-amber-500/20 space-y-3 max-h-[92dvh] flex flex-col">
        
        {/* Top Glow Accent */}
        <div className="absolute -top-20 -right-20 w-48 h-48 bg-amber-500/15 rounded-full blur-2xl pointer-events-none" />

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-3.5 right-3.5 sm:top-4 sm:right-4 p-2 rounded-full bg-slate-900/80 text-slate-400 hover:text-white border border-slate-800 transition cursor-pointer z-10 active:scale-95"
          title="Kapat"
        >
          <X className="w-4 h-4" />
        </button>

        {/* 1. Header Profile Info */}
        <div className="flex items-center gap-3 pr-8 border-b border-slate-800/80 pb-2.5 shrink-0">
          <div className="relative shrink-0">
            {userAccount.photoURL ? (
              <img
                src={userAccount.photoURL}
                alt={userAccount.displayName}
                className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl object-cover border-2 border-amber-400/80 shadow-lg shadow-amber-500/20"
              />
            ) : (
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-700 text-slate-950 font-black text-xl flex items-center justify-center border-2 border-amber-300 shadow-lg shadow-amber-500/20">
                {userAccount.displayName.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="absolute -bottom-1 -right-1 bg-emerald-500 w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full border-2 border-slate-950 ring-1 ring-emerald-400" title="Çevrimiçi" />
          </div>

          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="flex items-center gap-2">
              <h3 className="text-sm sm:text-base font-black text-white truncate leading-tight">
                {userAccount.displayName}
              </h3>
              {isGoogleUser && (
                <span className="text-[9px] bg-sky-500/20 text-sky-300 border border-sky-500/30 px-1.5 py-0.2 rounded-full font-bold shrink-0">
                  Google
                </span>
              )}
            </div>
            
            <p className={`text-[10.5px] sm:text-xs font-bold bg-gradient-to-r ${rank.color} bg-clip-text text-transparent truncate`}>
              {rank.title}
            </p>
            
            {userAccount.friendCode && (
              <div className="flex items-center gap-1.5 pt-0.5">
                <span className="text-[9.5px] text-slate-400 font-medium">Özel ID:</span>
                <span className="text-[10.5px] font-mono font-black text-amber-300 bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.2 rounded">
                  {userAccount.friendCode}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* 2. Top Tab Navigation: 4 Accessible Tabs */}
        <div className="flex items-center gap-1 p-1 bg-slate-900/90 rounded-2xl border border-slate-800 overflow-x-auto no-scrollbar shrink-0">
          <button
            onClick={() => {
              setActiveTab('stats');
              setStatusMessage(null);
            }}
            className={`flex-1 min-w-[70px] flex items-center justify-center gap-1 py-1.5 px-2 rounded-xl font-bold text-[11px] sm:text-xs transition cursor-pointer whitespace-nowrap ${
              activeTab === 'stats'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Trophy className="w-3.5 h-3.5 shrink-0" />
            <span>İstatistik</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('friends');
              setStatusMessage(null);
            }}
            className={`flex-1 min-w-[80px] flex items-center justify-center gap-1 py-1.5 px-2 rounded-xl font-bold text-[11px] sm:text-xs transition cursor-pointer whitespace-nowrap ${
              activeTab === 'friends'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Users className="w-3.5 h-3.5 shrink-0" />
            <span>Arkadaşlar ({friendsList.length})</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('requests');
              setStatusMessage(null);
            }}
            className={`flex-1 min-w-[85px] flex items-center justify-center gap-1 py-1.5 px-2 rounded-xl font-bold text-[11px] sm:text-xs transition cursor-pointer whitespace-nowrap relative ${
              activeTab === 'requests'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : incomingRequests.length > 0
                ? 'text-amber-300 bg-amber-500/10 border border-amber-500/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Inbox className="w-3.5 h-3.5 shrink-0" />
            <span>Gelen İstek</span>
            {incomingRequests.length > 0 && (
              <span className="bg-rose-500 text-white text-[9px] font-black rounded-full px-1.5 py-0.2 animate-bounce shadow">
                {incomingRequests.length}
              </span>
            )}
          </button>

          <button
            onClick={() => {
              setActiveTab('add');
              setStatusMessage(null);
            }}
            className={`flex-1 min-w-[70px] flex items-center justify-center gap-1 py-1.5 px-2 rounded-xl font-bold text-[11px] sm:text-xs transition cursor-pointer whitespace-nowrap ${
              activeTab === 'add'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5 shrink-0" />
            <span>Ekle</span>
          </button>
        </div>

        {/* Status Notification Banner */}
        {statusMessage && (
          <div className={`p-2.5 rounded-xl text-xs font-bold animate-fade-in flex items-center gap-1.5 border shrink-0 ${
            statusMessage.type === 'success'
              ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-200'
              : 'bg-rose-950/80 border-rose-500/50 text-rose-200'
          }`}>
            {statusMessage.type === 'success' ? <Check className="w-4 h-4 text-emerald-400 shrink-0" /> : <XCircle className="w-4 h-4 text-rose-400 shrink-0" />}
            <span className="flex-1">{statusMessage.text}</span>
          </div>
        )}

        {/* TAB 1: İstatistikler & Geçmiş */}
        {activeTab === 'stats' && (
          <div className="overflow-y-auto pr-0.5 space-y-3 flex-1">
            
            {/* 4 Stat Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="bg-[#070b14] border border-amber-500/30 rounded-2xl p-2 sm:p-2.5 text-center space-y-0.5">
                <span className="text-[10px] text-amber-400 font-bold block uppercase tracking-wide">Zaferler</span>
                <span className="text-lg sm:text-xl font-black text-amber-300">{stats.gamesWon}</span>
                <span className="text-[9px] text-slate-500 block font-semibold">1.lik</span>
              </div>

              <div className="bg-[#070b14] border border-slate-800 rounded-2xl p-2 sm:p-2.5 text-center space-y-0.5">
                <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wide">Kazanma %</span>
                <span className="text-lg sm:text-xl font-black text-white">%{winRate}</span>
                <span className="text-[9px] text-slate-500 block font-semibold">{totalPlayed} Maç</span>
              </div>

              <div className="bg-[#070b14] border border-slate-800 rounded-2xl p-2 sm:p-2.5 text-center space-y-0.5">
                <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wide">Mağlubiyet</span>
                <span className="text-lg sm:text-xl font-black text-rose-400">{stats.gamesLost || 0}</span>
                <span className="text-[9px] text-slate-500 block font-semibold">İflas & Kayıp</span>
              </div>

              <div className="bg-[#070b14] border border-emerald-500/30 rounded-2xl p-2 sm:p-2.5 text-center space-y-0.5">
                <span className="text-[10px] text-emerald-400 font-bold block uppercase tracking-wide">Toplam Kazanç</span>
                <span className="text-sm sm:text-base font-black text-emerald-300 truncate block">₺{stats.totalMoneyEarned.toLocaleString('tr-TR')}</span>
                <span className="text-[9px] text-slate-500 block font-semibold">Servet</span>
              </div>
            </div>

            {/* Match History */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-black uppercase tracking-wide text-slate-300">
                <span className="flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5 text-amber-400" /> Son Maç Geçmişi
                </span>
                <span className="text-[10px] text-slate-500 font-bold">{history.length} Oyun</span>
              </div>

              {history.length === 0 ? (
                <div className="p-4 rounded-2xl bg-[#070b14] border border-slate-800 text-center text-xs text-slate-500">
                  Henüz tamamlanmış bir maç kaydı bulunmuyor.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-0.5">
                  {history.map((record) => {
                    const isWin = record.result === 'WIN';
                    return (
                      <div
                        key={record.id}
                        className={`p-2.5 rounded-xl border flex items-center justify-between text-xs transition ${
                          isWin
                            ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200'
                            : 'bg-rose-950/20 border-rose-500/30 text-rose-200'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-base">{isWin ? '🏆' : '❌'}</span>
                          <div className="min-w-0">
                            <div className="font-bold text-white flex items-center gap-1.5 truncate">
                              <span>{isWin ? 'ZAFER (1.)' : record.result === 'BANKRUPTCY' ? 'İFLAS ETTİ' : 'MAĞLUBİYET'}</span>
                              <span className="text-[10px] text-slate-400 font-normal">({record.roomId})</span>
                            </div>
                            <div className="text-[10px] text-slate-400 flex items-center gap-2">
                              <span>{record.date}</span>
                              <span>•</span>
                              <span className="flex items-center gap-0.5">
                                <Users className="w-2.5 h-2.5" /> {record.opponentsCount} Oyuncu
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <span className={`font-black text-xs block ${isWin ? 'text-emerald-400' : 'text-slate-400'}`}>
                            {isWin ? `+₺${record.moneyEarned.toLocaleString('tr-TR')}` : `₺${record.moneyEarned.toLocaleString('tr-TR')}`}
                          </span>
                          <span className="text-[9px] text-slate-500 uppercase font-semibold">
                            {isWin ? 'Kazanılan Ödül' : 'Bakiye'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        )}

        {/* TAB 2: Arkadaşlarım */}
        {activeTab === 'friends' && (
          <div className="overflow-y-auto pr-0.5 space-y-3 flex-1">
            
            {/* Özel ID Kartı */}
            {isGoogleUser && userAccount.friendCode && (
              <div className="bg-gradient-to-r from-amber-500/15 via-[#0e172e] to-sky-500/10 border border-amber-500/40 rounded-2xl p-2.5 sm:p-3 space-y-1.5 relative overflow-hidden">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-amber-400 flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5" /> Size Özel Arkadaş ID'niz
                    </span>
                    <p className="text-[11px] text-slate-300 font-medium">
                      Arkadaşlarınız sizi eklemek için bu kodu kullanabilir:
                    </p>
                  </div>
                  <button
                    onClick={handleCopyId}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition cursor-pointer shadow-md active:scale-95 shrink-0"
                  >
                    {copiedId ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedId ? 'Kopyalandı' : 'Kopyala'}</span>
                  </button>
                </div>
                <div className="flex items-center gap-2 bg-slate-950/80 px-3 py-1 rounded-xl border border-amber-500/30">
                  <span className="text-base sm:text-lg font-mono font-black text-amber-300 tracking-wider">
                    {userAccount.friendCode}
                  </span>
                </div>
              </div>
            )}

            {/* Arkadaş Listesi */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-black uppercase tracking-wide text-slate-300">
                <span className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-amber-400" /> Ekli Arkadaşlar ({friendsList.length})
                </span>
                <button
                  onClick={() => setActiveTab('add')}
                  className="text-[10px] text-amber-400 hover:text-amber-300 font-bold flex items-center gap-0.5 cursor-pointer"
                >
                  <Plus className="w-3 h-3" /> Arkadaş Ekle
                </button>
              </div>

              {friendsList.length === 0 ? (
                <div className="p-4 rounded-2xl bg-[#070b14] border border-slate-800 text-center space-y-2.5">
                  <div className="w-10 h-10 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto text-slate-500">
                    <Users className="w-5 h-5" />
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-xs text-slate-300 font-bold">Henüz ekli bir arkadaşınız yok</p>
                    <p className="text-[10.5px] text-slate-500 max-w-xs mx-auto">
                      Arkadaşınızın Özel ID'sini (Örn: TP-849201) girerek hemen istek gönderebilirsiniz.
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveTab('add')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition cursor-pointer shadow active:scale-95"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Arkadaş Ekle</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-0.5">
                  {friendsList.map((friend) => {
                    const friendStats = friend.stats || { gamesWon: 0, gamesPlayed: 0 };
                    const isOnline = Boolean(friend.isOnline);
                    const inActiveRoom = Boolean(friend.activeRoomId);

                    return (
                      <div
                        key={friend.friendCode}
                        className="p-2 sm:p-2.5 rounded-xl bg-[#070b14] border border-slate-800 hover:border-slate-700 flex items-center justify-between gap-2 text-xs transition group"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="relative shrink-0">
                            {friend.photoURL ? (
                              <img
                                src={friend.photoURL}
                                alt={friend.displayName}
                                className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl object-cover border border-amber-400/40 shrink-0"
                              />
                            ) : (
                              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-amber-500/20 text-amber-400 font-black text-sm flex items-center justify-center border border-amber-500/40 shrink-0">
                                {friend.displayName.charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div
                              className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-slate-950 ${
                                isOnline ? 'bg-emerald-400 ring-1 ring-emerald-300' : 'bg-slate-600'
                              }`}
                              title={isOnline ? 'Çevrimiçi' : 'Çevrimdışı'}
                            />
                          </div>

                          <div className="min-w-0 space-y-0.5">
                            <div className="font-bold text-white flex items-center gap-1.5 truncate">
                              <span className="truncate">{friend.displayName}</span>
                              {isOnline && (
                                <span className="text-[8.5px] bg-emerald-500/20 text-emerald-300 font-bold px-1.5 py-0.2 rounded border border-emerald-500/30 shrink-0 flex items-center gap-0.5">
                                  <Radio className="w-2.5 h-2.5 animate-pulse" /> Çevrimiçi
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-slate-400">
                              <span className="font-mono text-amber-300 font-bold">{friend.friendCode}</span>
                              <span>•</span>
                              {inActiveRoom ? (
                                <span className="text-sky-300 font-bold">🎮 Oda: {friend.activeRoomId}</span>
                              ) : (
                                <span className="text-slate-500">
                                  <Trophy className="w-2.5 h-2.5 inline text-amber-400" /> {friendStats.gamesWon} Zafer
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 shrink-0">
                          {inActiveRoom && friend.activeRoomId && onJoinRoom ? (
                            <button
                              onClick={() => handleJoinFriendRoom(friend.activeRoomId)}
                              className="flex items-center gap-1 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-black text-[11px] transition cursor-pointer shadow-md shadow-emerald-500/20 active:scale-95 animate-pulse"
                              title={`Doğrudan "${friend.activeRoomId}" Odasına Katıl`}
                            >
                              <LogIn className="w-3.5 h-3.5" />
                              <span>Odaya Katıl</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => handleInviteFriend(friend)}
                              className="flex items-center gap-1 px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-sky-300 font-bold text-[11px] transition cursor-pointer active:scale-95"
                              title="Mevcut Odaya Davet Linki Kopyala"
                            >
                              {copiedInviteCode === friend.friendCode ? (
                                <Check className="w-3 h-3 text-emerald-400" />
                              ) : (
                                <Share2 className="w-3 h-3 text-sky-400" />
                              )}
                              <span className="hidden sm:inline">
                                {copiedInviteCode === friend.friendCode ? 'Kopyalandı' : 'Davet Et'}
                              </span>
                            </button>
                          )}

                          <button
                            onClick={() => handleRemoveFriend(friend.friendCode)}
                            className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 transition cursor-pointer active:scale-95"
                            title="Arkadaşı Sil"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        )}

        {/* TAB 3: GELEN ARKADAŞLIK İSTEKLERİ (ALWAYS VISIBLE & ACCESSIBLE) */}
        {activeTab === 'requests' && (
          <div className="overflow-y-auto pr-0.5 space-y-3 flex-1">
            
            <div className="flex items-center justify-between text-xs font-black uppercase tracking-wide text-slate-300 border-b border-slate-800 pb-2">
              <span className="flex items-center gap-1.5 text-amber-400">
                <Inbox className="w-4 h-4" /> Gelen Arkadaşlık İstekleri
              </span>
              <span className="text-[10.5px] bg-amber-500/20 text-amber-300 border border-amber-500/30 font-black px-2 py-0.5 rounded-full">
                {incomingRequests.length} Bekleyen
              </span>
            </div>

            {incomingRequests.length === 0 ? (
              <div className="p-4 sm:p-5 rounded-2xl bg-[#070b14] border border-slate-800 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-400 shadow-lg shadow-amber-500/10">
                  <Mail className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-xs font-black text-white">Bekleyen Arkadaşlık İsteğiniz Yok</h4>
                  <p className="text-[11px] text-slate-400 max-w-sm mx-auto leading-relaxed">
                    Arkadaşlarınız size Özel ID numaranız üzerinden istek gönderdiğinde burada gerçek zamanlı olarak anında listelenir ve tek dokunuşla kabul edebilirsiniz.
                  </p>
                </div>

                {userAccount.friendCode && (
                  <div className="pt-2 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-2 bg-slate-900/60 p-2.5 rounded-xl">
                    <div className="text-left">
                      <span className="text-[9.5px] uppercase font-bold text-slate-400 block">Sizin Özel Kodunuz</span>
                      <span className="text-xs font-mono font-black text-amber-300">{userAccount.friendCode}</span>
                    </div>
                    <button
                      onClick={handleCopyId}
                      className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition cursor-pointer shadow active:scale-95"
                    >
                      {copiedId ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedId ? 'Kopyalandı!' : 'Kodu Kopyala'}</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {incomingRequests.map((req) => (
                  <div
                    key={req.id}
                    className="p-3 rounded-2xl bg-[#070b14] border border-amber-500/40 hover:border-amber-400 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs shadow-md transition"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {req.fromPhotoURL ? (
                        <img src={req.fromPhotoURL} alt="" className="w-10 h-10 rounded-xl object-cover border border-amber-400/40 shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/30 to-amber-700/30 text-amber-400 font-black text-base flex items-center justify-center border border-amber-500/40 shrink-0">
                          {req.fromDisplayName.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 space-y-0.5">
                        <p className="font-black text-white text-sm truncate">{req.fromDisplayName}</p>
                        <div className="flex items-center gap-2 text-[10px] text-slate-400">
                          <span className="font-mono text-amber-300 font-bold bg-amber-500/10 px-1 rounded">{req.fromFriendCode}</span>
                          <span>•</span>
                          <span>{req.createdAt || 'Az önce'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-slate-800">
                      <button
                        onClick={() => handleAcceptRequest(req)}
                        className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs transition cursor-pointer shadow-md shadow-emerald-500/20 active:scale-95"
                        title="İsteği Kabul Et"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Kabul Et</span>
                      </button>
                      <button
                        onClick={() => handleDeclineRequest(req.id)}
                        className="flex items-center justify-center gap-1 px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 font-bold text-xs transition cursor-pointer active:scale-95"
                        title="İsteği Reddet"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span className="sm:hidden">Reddet</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

          </div>
        )}

        {/* TAB 4: ARKADAŞ EKLE */}
        {activeTab === 'add' && (
          <div className="overflow-y-auto pr-0.5 space-y-3 flex-1">
            
            {/* Özel ID Kartım */}
            {isGoogleUser && userAccount.friendCode && (
              <div className="bg-gradient-to-r from-amber-500/15 via-[#0e172e] to-sky-500/10 border border-amber-500/40 rounded-2xl p-3 space-y-1.5 relative overflow-hidden">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-amber-400 flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5" /> Sizin Arkadaş ID Numaranız
                    </span>
                    <p className="text-[11px] text-slate-300">
                      Arkadaşlarınıza bu kodu vererek sizi eklemelerini sağlayabilirsiniz:
                    </p>
                  </div>
                  <button
                    onClick={handleCopyId}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition cursor-pointer shadow-md active:scale-95 shrink-0"
                  >
                    {copiedId ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedId ? 'Kopyalandı' : 'Kopyala'}</span>
                  </button>
                </div>
                <div className="flex items-center gap-2 bg-slate-950/80 px-3 py-1.5 rounded-xl border border-amber-500/30">
                  <span className="text-base sm:text-lg font-mono font-black text-amber-300 tracking-wider">
                    {userAccount.friendCode}
                  </span>
                </div>
              </div>
            )}

            {/* İstek Gönderme Formu */}
            {isGoogleUser ? (
              <form onSubmit={handleSendRequest} className="space-y-2 bg-[#070b14] border border-slate-800 rounded-2xl p-3.5">
                <label className="text-xs font-black text-slate-200 flex items-center gap-1.5">
                  <UserPlus className="w-4 h-4 text-amber-400" />
                  <span>Özel ID ile Arkadaşlık İsteği Gönder</span>
                </label>
                <p className="text-[11px] text-slate-400">
                  Arkadaşınızın 6 haneli kodunu girin. İstek karşı tarafa anında iletilir.
                </p>
                <div className="flex flex-col sm:flex-row gap-2 pt-1">
                  <input
                    type="text"
                    value={targetCode}
                    onChange={(e) => setTargetCode(e.target.value.toUpperCase())}
                    placeholder="Örn: TP-849201"
                    className="flex-1 bg-slate-950 border border-slate-700 focus:border-amber-400 rounded-xl px-3.5 py-2.5 text-xs font-mono font-bold text-white placeholder-slate-600 outline-none transition uppercase"
                  />
                  <button
                    type="submit"
                    disabled={isAdding || !targetCode.trim()}
                    className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:pointer-events-none text-slate-950 font-black text-xs transition cursor-pointer shadow active:scale-95 shrink-0"
                  >
                    {isAdding ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    <span>İstek Gönder</span>
                  </button>
                </div>
              </form>
            ) : (
              <div className="bg-gradient-to-r from-amber-500/10 to-rose-500/10 border border-amber-500/30 rounded-2xl p-4 text-center space-y-2.5">
                <Users className="w-8 h-8 text-amber-400 mx-auto" />
                <div className="space-y-0.5">
                  <h4 className="text-xs font-black text-white">Google ile Giriş Yapın</h4>
                  <p className="text-[11px] text-slate-300">
                    Özel ID almak ve arkadaş ekleyip davet edebilmek için Google hesabınızla giriş yapmanız gerekmektedir.
                  </p>
                </div>
                {onGoogleLogin && (
                  <button
                    onClick={onGoogleLogin}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-900 font-black text-xs transition cursor-pointer shadow active:scale-95"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                    </svg>
                    <span>Google ile Giriş Yap</span>
                  </button>
                )}
              </div>
            )}

          </div>
        )}

        {/* Action Buttons */}
        <div className="pt-2 shrink-0 border-t border-slate-800/80">
          <button
            onClick={() => {
              onLogout();
              onClose();
            }}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 font-bold text-xs transition cursor-pointer active:scale-95"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Oturumu Kapat (Çıkış Yap)</span>
          </button>
        </div>

      </div>
    </div>
  );
};
