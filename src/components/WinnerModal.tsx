import React from 'react';
import { Player } from '../types/game';
import { Trophy, RotateCcw, Sparkles, User, Award } from 'lucide-react';

interface WinnerModalProps {
  winner: Player;
  currentPlayer?: Player;
  onRestart: () => void;
  onOpenProfile?: () => void;
}

export const WinnerModal: React.FC<WinnerModalProps> = ({
  winner,
  currentPlayer,
  onRestart,
  onOpenProfile
}) => {
  const isMeWinner = currentPlayer
    ? (currentPlayer.id === winner.id || Boolean(currentPlayer.userId && winner.userId && currentPlayer.userId === winner.userId))
    : false;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/90 backdrop-blur-md animate-fade-in font-['Plus_Jakarta_Sans',sans-serif] select-none">
      <div className="bg-[#0b1325] border-2 border-amber-500/80 rounded-3xl max-w-md w-full p-6 sm:p-8 text-center shadow-2xl space-y-5 relative overflow-hidden ring-2 ring-amber-500/30">
        
        {/* Glow Effect */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-amber-500/20 rounded-full blur-3xl pointer-events-none" />

        {/* Big Icon */}
        <div className="inline-flex p-4 bg-amber-500/20 rounded-3xl border border-amber-500/40 text-amber-400 shadow-xl shadow-amber-500/20 animate-bounce">
          <Trophy className="w-12 h-12" />
        </div>

        {/* Title */}
        <div className="space-y-1">
          <h2 className="text-2xl sm:text-3xl font-black text-amber-400 tracking-wider">
            {isMeWinner ? '🎉 TEBRİKLER, KAZANDINIZ!' : '🏆 OYUN TAMAMLANDI!'}
          </h2>
          <p className="text-slate-400 text-xs sm:text-sm font-semibold">
            {isMeWinner ? 'Tüm rakiplerinizi eleyerek Turkish Paradise şampiyonu oldunuz!' : 'Turkish Paradise Maç Sonucu'}
          </p>
        </div>

        {/* Winner Card */}
        <div className="bg-[#070b14] p-5 rounded-2xl border border-amber-500/30 space-y-2 shadow-inner">
          <div className="text-5xl transform hover:scale-110 transition duration-300">{winner.avatar}</div>
          <div className="text-xl sm:text-2xl font-black text-white flex items-center justify-center gap-1.5">
            <span>{winner.name}</span>
            {isMeWinner && (
              <span className="text-[10px] bg-amber-500 text-slate-950 font-black px-2 py-0.5 rounded-full">
                SİZ
              </span>
            )}
          </div>
          <div className="text-emerald-400 font-black text-base sm:text-lg">
            ₺{winner.money.toLocaleString('tr-TR')} Bakiye ile Şampiyon!
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2.5 pt-1">
          <button
            onClick={onRestart}
            className="w-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 hover:from-amber-300 hover:to-amber-500 text-slate-950 font-black py-3.5 rounded-xl shadow-xl transition transform active:scale-95 text-sm uppercase tracking-wide flex items-center justify-center gap-2 cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Yeni Oyun Başlat</span>
          </button>

          {onOpenProfile && (
            <button
              onClick={onOpenProfile}
              className="w-full bg-slate-900 hover:bg-slate-800 text-amber-300 border border-amber-500/40 font-bold py-3 rounded-xl transition text-xs flex items-center justify-center gap-2 cursor-pointer active:scale-95"
            >
              <Award className="w-4 h-4 text-amber-400" />
              <span>Profil ve Zafer İstatistiklerimi Gör</span>
            </button>
          )}
        </div>

      </div>
    </div>
  );
};
