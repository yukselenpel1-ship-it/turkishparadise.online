import React from 'react';
import { UserAccount } from '../types/game';
import { Trophy, Award, TrendingUp, DollarSign, Mail, X, LogOut, Sparkles, XCircle, History, Users } from 'lucide-react';

interface ProfileModalProps {
  userAccount: UserAccount;
  onClose: () => void;
  onLogout: () => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({
  userAccount,
  onClose,
  onLogout,
}) => {
  const stats = userAccount.stats || { gamesWon: 0, gamesLost: 0, gamesPlayed: 0, totalMoneyEarned: 0, history: [] };
  const totalPlayed = stats.gamesPlayed || (stats.gamesWon + (stats.gamesLost || 0));
  const winRate = totalPlayed > 0 ? Math.round((stats.gamesWon / totalPlayed) * 100) : 0;
  const history = stats.history || [];

  // Title rank based on wins
  const getRank = (wins: number) => {
    if (wins >= 15) return { title: 'Boğaz & Türkiye İmparatoru 👑', color: 'from-amber-300 via-amber-400 to-yellow-200' };
    if (wins >= 8) return { title: 'Büyük Gayrimenkul Kralı 💎', color: 'from-sky-400 via-indigo-300 to-teal-300' };
    if (wins >= 4) return { title: 'Usta Emlakçı & Yatırımcı 🥈', color: 'from-emerald-400 to-teal-200' };
    if (wins >= 1) return { title: 'Geleceğin Milyoneri 🥉', color: 'from-amber-500 to-amber-300' };
    return { title: 'Çaylak Yatırımcı 🎲', color: 'from-slate-400 to-slate-200' };
  };

  const rank = getRank(stats.gamesWon);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in font-['Plus_Jakarta_Sans',sans-serif] select-none">
      <div className="bg-[#0a1020]/95 border border-amber-500/40 rounded-3xl max-w-lg w-full p-5 sm:p-7 text-left shadow-2xl relative overflow-hidden ring-1 ring-amber-500/20 space-y-4 max-h-[92vh] flex flex-col">
        
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
            {userAccount.provider === 'google' && (
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

          <div className="space-y-0.5 min-w-0">
            <h3 className="text-base sm:text-lg font-black text-white flex items-center gap-1.5 leading-tight truncate">
              <span className="truncate">{userAccount.displayName}</span>
            </h3>
            {userAccount.email && (
              <p className="text-[11px] text-slate-400 font-medium flex items-center gap-1 truncate">
                <Mail className="w-3 h-3 text-slate-500 shrink-0" />
                <span className="truncate">{userAccount.email}</span>
              </p>
            )}
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-900 border border-slate-800 text-[10px] font-bold">
              <Sparkles className="w-3 h-3 text-amber-400 shrink-0" />
              <span className={`bg-gradient-to-r ${rank.color} bg-clip-text text-transparent font-black truncate`}>
                {rank.title}
              </span>
            </div>
          </div>
        </div>

        {/* Scrollable Body: Stats Grid & Match History */}
        <div className="overflow-y-auto pr-0.5 space-y-4 flex-1">
          
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
              <div className="p-5 rounded-2xl bg-[#070b14] border border-slate-800/80 text-center space-y-1">
                <p className="text-xs text-slate-400 font-semibold">Henüz tamamlanan bir oyun bulunmuyor.</p>
                <p className="text-[10px] text-slate-500">Oyuna girip bir maç tamamladığınızda sonuçlar burada listelenecektir.</p>
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

        {/* Action Buttons */}
        <div className="pt-2 shrink-0 border-t border-slate-800/80">
          <button
            onClick={() => {
              onLogout();
              onClose();
            }}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 font-bold text-xs transition cursor-pointer active:scale-95"
          >
            <LogOut className="w-4 h-4" />
            <span>Oturumu Kapat (Çıkış Yap)</span>
          </button>
        </div>

      </div>
    </div>
  );
};
