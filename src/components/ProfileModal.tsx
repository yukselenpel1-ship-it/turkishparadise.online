import React, { useState } from 'react';
import { UserAccount, FriendUser } from '../types/game';
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
  ShieldCheck
} from 'lucide-react';
import { addFriendByCode, removeFriendByCode } from '../services/friendService';

interface ProfileModalProps {
  userAccount: UserAccount;
  onClose: () => void;
  onLogout: () => void;
  onUpdateUserAccount?: (updated: UserAccount) => void;
  onGoogleLogin?: () => Promise<void>;
  roomId?: string;
  initialTab?: 'stats' | 'friends';
}

export const ProfileModal: React.FC<ProfileModalProps> = ({
  userAccount,
  onClose,
  onLogout,
  onUpdateUserAccount,
  onGoogleLogin,
  roomId = 'TR-1001',
  initialTab = 'stats'
}) => {
  const [activeTab, setActiveTab] = useState<'stats' | 'friends'>(initialTab);
  const [copiedId, setCopiedId] = useState(false);
  const [targetCode, setTargetCode] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [copiedInviteCode, setCopiedInviteCode] = useState<string | null>(null);

  const stats = userAccount.stats || { gamesWon: 0, gamesLost: 0, gamesPlayed: 0, totalMoneyEarned: 0, history: [] };
  const totalPlayed = stats.gamesPlayed || (stats.gamesWon + (stats.gamesLost || 0));
  const winRate = totalPlayed > 0 ? Math.round((stats.gamesWon / totalPlayed) * 100) : 0;
  const history = stats.history || [];
  const friends = userAccount.friends || [];
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

  // Add friend by Special ID
  const handleAddFriend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetCode.trim()) return;

    setIsAdding(true);
    setStatusMessage(null);

    try {
      const res = await addFriendByCode(userAccount, targetCode);
      if (res.success) {
        setStatusMessage({ text: res.message, type: 'success' });
        setTargetCode('');
        const updatedAcc: UserAccount = { ...userAccount, friends: res.friends };
        if (onUpdateUserAccount) {
          onUpdateUserAccount(updatedAcc);
        }
      } else {
        setStatusMessage({ text: res.message, type: 'error' });
      }
    } catch (err: any) {
      setStatusMessage({ text: 'Arkadaş eklenirken bir hata oluştu.', type: 'error' });
    } finally {
      setIsAdding(false);
    }
  };

  // Remove friend
  const handleRemoveFriend = (friendCode: string) => {
    const updated = removeFriendByCode(userAccount.uid, friendCode);
    const updatedAcc: UserAccount = { ...userAccount, friends: updated };
    if (onUpdateUserAccount) {
      onUpdateUserAccount(updatedAcc);
    }
    setStatusMessage({ text: 'Arkadaş listenizden çıkarıldı.', type: 'success' });
    setTimeout(() => setStatusMessage(null), 2500);
  };

  // Invite friend to room
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in font-['Plus_Jakarta_Sans',sans-serif] select-none">
      <div className="bg-[#0a1020]/95 border border-amber-500/40 rounded-3xl max-w-lg w-full p-4 sm:p-6 text-left shadow-2xl relative overflow-hidden ring-1 ring-amber-500/20 space-y-3.5 max-h-[92vh] flex flex-col">
        
        {/* Top Glow Accent */}
        <div className="absolute -top-20 -right-20 w-48 h-48 bg-amber-500/15 rounded-full blur-2xl pointer-events-none" />

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full bg-slate-900/80 text-slate-400 hover:text-white border border-slate-800 transition cursor-pointer z-10"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Profile Header */}
        <div className="flex items-center gap-3.5 sm:gap-4 shrink-0">
          <div className="relative shrink-0">
            {userAccount.photoURL ? (
              <img
                src={userAccount.photoURL}
                alt={userAccount.displayName}
                className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl object-cover border-2 border-amber-400 shadow-lg shadow-amber-500/20"
              />
            ) : (
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-tr from-amber-500 to-amber-300 text-slate-950 font-black text-xl sm:text-2xl flex items-center justify-center shadow-lg shadow-amber-500/20">
                {userAccount.displayName.charAt(0).toUpperCase()}
              </div>
            )}
            {isGoogleUser && (
              <div
                className="absolute -bottom-1 -right-1 bg-white p-1 rounded-full shadow-md"
                title="Doğrulanmış Google Hesabı"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
              </div>
            )}
          </div>

          <div className="space-y-1 min-w-0 flex-1">
            <h3 className="text-base sm:text-lg font-black text-white flex items-center gap-1.5 leading-tight truncate">
              <span className="truncate">{userAccount.displayName}</span>
            </h3>

            {/* Friend Code / Special ID Badge */}
            {userAccount.friendCode ? (
              <div className="flex items-center gap-2">
                <div
                  onClick={handleCopyId}
                  className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 text-[11px] font-mono font-black cursor-pointer transition active:scale-95 group/copy"
                  title="Özel Arkadaş ID'nizi Kopyalamak İçin Tıklayın"
                >
                  <span>Özel ID: {userAccount.friendCode}</span>
                  {copiedId ? (
                    <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                  ) : (
                    <Copy className="w-3 h-3 text-amber-400/80 group-hover/copy:text-amber-300 shrink-0" />
                  )}
                </div>
                {copiedId && (
                  <span className="text-[10px] text-emerald-400 font-bold animate-fade-in">
                    Kopyalandı!
                  </span>
                )}
              </div>
            ) : (
              userAccount.email && (
                <p className="text-[11px] text-slate-400 font-medium flex items-center gap-1 truncate">
                  <Mail className="w-3 h-3 text-slate-500 shrink-0" />
                  <span className="truncate">{userAccount.email}</span>
                </p>
              )
            )}

            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-900 border border-slate-800 text-[10px] font-bold">
              <Sparkles className="w-3 h-3 text-amber-400 shrink-0" />
              <span className={`bg-gradient-to-r ${rank.color} bg-clip-text text-transparent font-black truncate`}>
                {rank.title}
              </span>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center p-1 bg-slate-950/80 rounded-2xl border border-slate-800 shrink-0">
          <button
            onClick={() => {
              setActiveTab('stats');
              setStatusMessage(null);
            }}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-black transition cursor-pointer ${
              activeTab === 'stats'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Trophy className="w-3.5 h-3.5" />
            <span>İstatistikler & Maçlar</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('friends');
              setStatusMessage(null);
            }}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-black transition cursor-pointer relative ${
              activeTab === 'friends'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Arkadaşlarım & Özel ID</span>
            {friends.length > 0 && (
              <span
                className={`text-[9px] px-1.5 py-0.2 rounded-full font-black ${
                  activeTab === 'friends' ? 'bg-slate-950 text-amber-400' : 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                }`}
              >
                {friends.length}
              </span>
            )}
          </button>
        </div>

        {/* Status Toast Message */}
        {statusMessage && (
          <div
            className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-between animate-fade-in ${
              statusMessage.type === 'success'
                ? 'bg-emerald-950/80 border border-emerald-500/40 text-emerald-300'
                : 'bg-rose-950/80 border border-rose-500/40 text-rose-300'
            }`}
          >
            <span>{statusMessage.text}</span>
            <button onClick={() => setStatusMessage(null)} className="text-slate-400 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* TAB 1: İstatistikler & Geçmiş */}
        {activeTab === 'stats' && (
          <div className="overflow-y-auto pr-0.5 space-y-3.5 flex-1">
            
            {/* Main Stats Card Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              
              {/* Total Wins */}
              <div className="bg-[#070b14] border border-amber-500/40 rounded-2xl p-3 space-y-0.5 relative overflow-hidden">
                <div className="flex items-center justify-between text-slate-400 text-[11px] font-semibold">
                  <span>Zaferler (Win)</span>
                  <Trophy className="w-3.5 h-3.5 text-amber-400" />
                </div>
                <div className="text-xl sm:text-2xl font-black text-amber-300">
                  {stats.gamesWon}
                </div>
                <span className="text-[9px] text-emerald-400 font-bold block">
                  🏆 Birinci Olunan
                </span>
              </div>

              {/* Total Losses */}
              <div className="bg-[#070b14] border border-rose-500/30 rounded-2xl p-3 space-y-0.5">
                <div className="flex items-center justify-between text-slate-400 text-[11px] font-semibold">
                  <span>Mağlubiyet (Lose)</span>
                  <XCircle className="w-3.5 h-3.5 text-rose-400" />
                </div>
                <div className="text-xl sm:text-2xl font-black text-rose-300">
                  {stats.gamesLost || 0}
                </div>
                <span className="text-[9px] text-rose-400 font-bold block">
                  ❌ İflas / Elenme
                </span>
              </div>

              {/* Total Matches Played */}
              <div className="bg-[#070b14] border border-slate-800 rounded-2xl p-3 space-y-0.5 col-span-2 sm:col-span-1">
                <div className="flex items-center justify-between text-slate-400 text-[11px] font-semibold">
                  <span>Toplam Maç</span>
                  <Award className="w-3.5 h-3.5 text-sky-400" />
                </div>
                <div className="text-xl sm:text-2xl font-black text-white">
                  {totalPlayed}
                </div>
                <span className="text-[9px] text-slate-400 font-bold block">
                  🎲 Tamamlanan
                </span>
              </div>

              {/* Win Rate */}
              <div className="bg-[#070b14] border border-emerald-500/30 rounded-2xl p-3 space-y-1 col-span-1 sm:col-span-2">
                <div className="flex items-center justify-between text-slate-400 text-[11px] font-semibold">
                  <span>Kazanma Oranı (Win Rate)</span>
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-xl sm:text-2xl font-black text-emerald-400">
                    %{winRate}
                  </span>
                  <span className="text-[10px] text-slate-400 font-semibold">
                    {stats.gamesWon}G / {totalPlayed}M
                  </span>
                </div>
                <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full rounded-full transition-all duration-500"
                    style={{ width: `${winRate}%` }}
                  />
                </div>
              </div>

              {/* Total Wealth Earned */}
              <div className="bg-[#070b14] border border-slate-800 rounded-2xl p-3 space-y-0.5">
                <div className="flex items-center justify-between text-slate-400 text-[11px] font-semibold">
                  <span>Kazanılan Servet</span>
                  <DollarSign className="w-3.5 h-3.5 text-amber-400" />
                </div>
                <div className="text-lg sm:text-xl font-black text-amber-300 truncate">
                  {stats.totalMoneyEarned.toLocaleString('tr-TR')} ₺
                </div>
                <span className="text-[9px] text-amber-400/80 font-bold block">
                  💰 Toplam Kazanç
                </span>
              </div>

            </div>

            {/* Match History (Son Maçlar Geçmişi) */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between text-xs font-black uppercase tracking-wide text-slate-300">
                <span className="flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5 text-amber-400" /> Son Karşılaşmalar Geçmişi
                </span>
                <span className="text-[10px] text-slate-500 font-bold">
                  {history.length} Maç Kaydı
                </span>
              </div>

              {history.length === 0 ? (
                <div className="p-4 rounded-2xl bg-[#070b14] border border-slate-800/80 text-center space-y-1">
                  <p className="text-xs text-slate-400 font-semibold">Henüz tamamlanan bir oyun bulunmuyor.</p>
                  <p className="text-[10px] text-slate-500">Oyuna girip bir maç tamamladığınızda sonuçlar burada listelenecektir.</p>
                </div>
              ) : (
                <div className="space-y-1.5 max-h-44 overflow-y-auto pr-0.5">
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

        {/* TAB 2: Arkadaşlarım & Özel ID */}
        {activeTab === 'friends' && (
          <div className="overflow-y-auto pr-0.5 space-y-3.5 flex-1">
            
            {/* 1. Özel ID Tanıtım Kartı */}
            {isGoogleUser && userAccount.friendCode ? (
              <div className="bg-gradient-to-r from-amber-500/20 via-[#0e172e] to-sky-500/10 border border-amber-500/40 rounded-2xl p-3.5 space-y-2 relative overflow-hidden">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-amber-400 flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5" /> Size Özel Arkadaş ID'niz
                    </span>
                    <p className="text-xs text-slate-300 font-medium">
                      Arkadaşlarınız sizi eklemek için bu kodu kullanabilir:
                    </p>
                  </div>
                  <button
                    onClick={handleCopyId}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition cursor-pointer shadow-md shadow-amber-500/20 active:scale-95 shrink-0"
                  >
                    {copiedId ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedId ? 'Kopyalandı' : 'Kopyala'}</span>
                  </button>
                </div>
                <div className="flex items-center gap-2 bg-slate-950/80 px-3 py-2 rounded-xl border border-amber-500/30">
                  <span className="text-lg sm:text-xl font-mono font-black text-amber-300 tracking-wider">
                    {userAccount.friendCode}
                  </span>
                </div>
              </div>
            ) : (
              <div className="bg-gradient-to-r from-amber-500/10 to-rose-500/10 border border-amber-500/30 rounded-2xl p-4 text-center space-y-2.5">
                <Users className="w-8 h-8 text-amber-400 mx-auto" />
                <div className="space-y-1">
                  <h4 className="text-sm font-black text-white">Google ile Giriş Yapın</h4>
                  <p className="text-xs text-slate-300">
                    Özel ID almak ve arkadaş ekleyip davet edebilmek için Google hesabınızla giriş yapmanız gerekmektedir.
                  </p>
                </div>
                {onGoogleLogin && (
                  <button
                    onClick={onGoogleLogin}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-900 font-black text-xs transition cursor-pointer shadow active:scale-95"
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

            {/* 2. Arkadaş Ekleme Formu */}
            {isGoogleUser && (
              <form onSubmit={handleAddFriend} className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
                  <UserPlus className="w-3.5 h-3.5 text-amber-400" />
                  <span>Özel ID ile Arkadaş Ekle</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={targetCode}
                    onChange={(e) => setTargetCode(e.target.value.toUpperCase())}
                    placeholder="Örn: TP-849201"
                    className="flex-1 bg-[#070b14] border border-slate-800 focus:border-amber-400 rounded-xl px-3.5 py-2 text-xs font-mono font-bold text-white placeholder-slate-600 outline-none transition uppercase"
                  />
                  <button
                    type="submit"
                    disabled={isAdding || !targetCode.trim()}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:pointer-events-none text-slate-950 font-black text-xs transition cursor-pointer shadow active:scale-95 shrink-0"
                  >
                    {isAdding ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <UserPlus className="w-3.5 h-3.5" />
                    )}
                    <span>Ekle</span>
                  </button>
                </div>
              </form>
            )}

            {/* 3. Arkadaş Listesi */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between text-xs font-black uppercase tracking-wide text-slate-300">
                <span className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-amber-400" /> Arkadaşlarım
                </span>
                <span className="text-[10px] text-slate-500 font-bold">
                  {friends.length} Arkadaş
                </span>
              </div>

              {friends.length === 0 ? (
                <div className="p-4 rounded-2xl bg-[#070b14] border border-slate-800/80 text-center space-y-1">
                  <p className="text-xs text-slate-400 font-semibold">Henüz ekli bir arkadaşınız yok.</p>
                  <p className="text-[10px] text-slate-500">
                    Arkadaşlarınızın size verdiği Özel ID'yi (Örn: TP-849201) yukarıdaki alana yazarak listenize ekleyebilirsiniz.
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-52 overflow-y-auto pr-0.5">
                  {friends.map((friend) => {
                    const friendStats = friend.stats || { gamesWon: 0, gamesPlayed: 0 };
                    return (
                      <div
                        key={friend.friendCode}
                        className="p-2.5 rounded-xl bg-[#070b14] border border-slate-800 hover:border-slate-700 flex items-center justify-between gap-2.5 text-xs transition group"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {friend.photoURL ? (
                            <img
                              src={friend.photoURL}
                              alt={friend.displayName}
                              className="w-9 h-9 rounded-xl object-cover border border-amber-400/40 shrink-0"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 font-black text-sm flex items-center justify-center border border-amber-500/40 shrink-0">
                              {friend.displayName.charAt(0).toUpperCase()}
                            </div>
                          )}

                          <div className="min-w-0 space-y-0.5">
                            <div className="font-bold text-white flex items-center gap-1.5 truncate">
                              <span className="truncate">{friend.displayName}</span>
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-slate-400">
                              <span className="font-mono text-amber-300 font-bold">{friend.friendCode}</span>
                              <span>•</span>
                              <span className="flex items-center gap-0.5 text-emerald-400 font-semibold">
                                <Trophy className="w-2.5 h-2.5" /> {friendStats.gamesWon} Win
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => handleInviteFriend(friend)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-sky-300 font-bold text-[11px] transition cursor-pointer active:scale-95"
                            title="Mevcut Odaya Davet Linki Kopyala"
                          >
                            {copiedInviteCode === friend.friendCode ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Gamepad2 className="w-3 h-3 text-sky-400" />
                            )}
                            <span className="hidden sm:inline">
                              {copiedInviteCode === friend.friendCode ? 'Kopyalandı' : 'Odaya Davet Et'}
                            </span>
                          </button>

                          <button
                            onClick={() => handleRemoveFriend(friend.friendCode)}
                            className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 transition cursor-pointer"
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
