import React from 'react';
import { Player, BoardTile, FinancialTransaction } from '../types/game';
import { Trophy, RotateCcw, Home, Coins, Building2, TrendingUp, Clock, Crown, Skull } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import {
  calculatePlayerNetWorth,
  calculatePlayerRentIncome,
  formatGameDuration,
  calculateFinalRankings
} from '../engine/gameEngine';

interface WinnerModalProps {
  winner: Player;
  currentPlayer?: Player;
  players: Player[];
  board: BoardTile[];
  transactions?: FinancialTransaction[];
  gameStartedAt?: number;
  gameEndedAt?: number;
  isHost?: boolean;
  onRestart: () => void;
  onMainMenu: () => void;
  onOpenProfile?: () => void;
}

export const WinnerModal: React.FC<WinnerModalProps> = ({
  winner,
  currentPlayer,
  players = [],
  board = [],
  transactions = [],
  gameStartedAt,
  gameEndedAt,
  isHost = true,
  onRestart,
  onMainMenu,
  onOpenProfile
}) => {
  const { t, language, formatMoney } = useLanguage();
  const isMeWinner = currentPlayer ? currentPlayer.id === winner.id : false;

  // 1. Calculate Winner Metrics
  const winnerNetWorth = calculatePlayerNetWorth(winner, board);
  const winnerPropertiesCount = board.filter((tile) => tile.ownerId === winner.id).length;
  const winnerRentIncome = calculatePlayerRentIncome(winner, transactions, players);

  // 2. Calculate Game Duration
  const now = Date.now();
  const startTime = gameStartedAt || (now - 60000);
  const endTime = gameEndedAt || now;
  const durationMs = Math.max(1000, endTime - startTime);
  const durationText = formatGameDuration(durationMs, language === 'en' ? 'en' : 'tr');

  // 3. Deterministic Final Rankings
  const rankings = calculateFinalRankings(players, board, winner.id);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 pt-[max(calc(1rem+env(safe-area-inset-top,0px)),1rem)] pb-[max(calc(1rem+env(safe-area-inset-bottom,0px)),1rem)] bg-slate-950/90 backdrop-blur-md animate-fade-in font-['Plus_Jakarta_Sans',sans-serif] select-none">
      <div className="bg-[#070b16] border border-amber-500/40 rounded-3xl max-w-md w-full max-h-[calc(90dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))] overflow-y-auto p-5 sm:p-7 text-center shadow-2xl space-y-5 relative ring-1 ring-amber-500/20">
        
        {/* Subtle Ambient Gold Glow */}
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-64 h-32 bg-amber-500/15 rounded-full blur-3xl pointer-events-none" />

        {/* Header Badge */}
        <div className="space-y-1.5 pt-1">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[11px] font-bold tracking-widest uppercase shadow-sm">
            <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>{t('championTitle')}</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-100 tracking-tight">
            {isMeWinner ? t('congratsWon') : t('gameOver')}
          </h2>
        </div>

        {/* Winner Spotlight Card */}
        <div className="bg-gradient-to-b from-[#0e1629] to-[#0a101f] p-5 rounded-2xl border border-amber-500/30 space-y-3 shadow-inner relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-400/5 rounded-full blur-2xl pointer-events-none" />

          {/* Winner Avatar & Name */}
          <div className="flex flex-col items-center justify-center gap-2">
            <div className="relative inline-flex items-center justify-center">
              <div className="text-5xl sm:text-6xl p-3 bg-slate-950/70 rounded-2xl border border-amber-500/40 shadow-lg shadow-amber-500/10 transform transition duration-300 hover:scale-105">
                {winner.avatar || '👑'}
              </div>
              <div className="absolute -top-2 -right-2 bg-amber-500 text-slate-950 p-1.5 rounded-full shadow-md">
                <Trophy className="w-4 h-4" />
              </div>
            </div>

            <div className="flex items-center justify-center gap-2 flex-wrap">
              <span className="text-xl sm:text-2xl font-black text-white tracking-tight">
                {winner.name}
              </span>
              {isMeWinner && (
                <span className="text-[10px] bg-amber-500 text-slate-950 font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                  {t('youBadge')}
                </span>
              )}
            </div>
          </div>

          {/* Total Net Worth Highlight */}
          <div className="bg-slate-950/80 py-2.5 px-4 rounded-xl border border-amber-500/20 text-center">
            <span className="text-[11px] uppercase tracking-wider font-bold text-slate-400 block mb-0.5">
              {t('totalNetWorth')}
            </span>
            <span className="text-2xl sm:text-3xl font-black text-amber-400 font-mono tracking-tight">
              {formatMoney(winnerNetWorth)}
            </span>
          </div>
        </div>

        {/* 4 Key Winner Stats Grid */}
        <div className="grid grid-cols-2 gap-2.5 text-left">
          {/* 1. Cash */}
          <div className="bg-[#090e1c] border border-slate-800/90 rounded-2xl p-3 space-y-1 shadow-sm">
            <div className="flex items-center gap-1.5 text-slate-400 text-xs font-semibold">
              <Coins className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>{t('cashStat')}</span>
            </div>
            <div className="text-sm sm:text-base font-bold text-slate-100 font-mono">
              {formatMoney(winner.money)}
            </div>
          </div>

          {/* 2. Properties Owned Count */}
          <div className="bg-[#090e1c] border border-slate-800/90 rounded-2xl p-3 space-y-1 shadow-sm">
            <div className="flex items-center gap-1.5 text-slate-400 text-xs font-semibold">
              <Building2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <span>{t('propertiesCountStat')}</span>
            </div>
            <div className="text-sm sm:text-base font-bold text-slate-100 font-mono">
              {winnerPropertiesCount} {language === 'en' ? 'Deeds' : 'Adet'}
            </div>
          </div>

          {/* 3. Total Rent Income */}
          <div className="bg-[#090e1c] border border-slate-800/90 rounded-2xl p-3 space-y-1 shadow-sm">
            <div className="flex items-center gap-1.5 text-slate-400 text-xs font-semibold">
              <TrendingUp className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>{t('rentIncomeStat')}</span>
            </div>
            <div className="text-sm sm:text-base font-bold text-amber-300 font-mono">
              {formatMoney(winnerRentIncome)}
            </div>
          </div>

          {/* 4. Game Duration */}
          <div className="bg-[#090e1c] border border-slate-800/90 rounded-2xl p-3 space-y-1 shadow-sm">
            <div className="flex items-center gap-1.5 text-slate-400 text-xs font-semibold">
              <Clock className="w-3.5 h-3.5 text-purple-400 shrink-0" />
              <span>{t('durationStat')}</span>
            </div>
            <div className="text-sm sm:text-base font-bold text-slate-100 font-mono">
              {durationText}
            </div>
          </div>
        </div>

        {/* Final Ranking Section */}
        <div className="space-y-2 text-left pt-1">
          <div className="flex items-center justify-between px-1">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              {t('finalRankingTitle')}
            </span>
          </div>

          <div className="bg-[#090e1c] border border-slate-800/90 rounded-2xl divide-y divide-slate-800/60 overflow-hidden shadow-inner max-h-48 overflow-y-auto">
            {rankings.map((item) => {
              const isItemMe = currentPlayer && currentPlayer.id === item.player.id;
              return (
                <div
                  key={item.player.id}
                  className={`flex items-center justify-between px-3.5 py-2.5 text-xs sm:text-sm transition ${
                    item.isWinner
                      ? 'bg-amber-500/10 text-amber-300 font-bold'
                      : isItemMe
                      ? 'bg-slate-800/40 text-slate-200 font-semibold'
                      : 'text-slate-300 font-medium'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-slate-400 font-bold w-4 text-center">
                      {item.rank === 1 ? '🥇' : item.rank === 2 ? '🥈' : item.rank === 3 ? '🥉' : `${item.rank}.`}
                    </span>
                    <span className="text-base shrink-0">{item.player.avatar || '👤'}</span>
                    <span className="truncate">{item.player.name}</span>
                    {item.player.isBot && (
                      <span className="text-[9px] bg-slate-800 text-slate-400 px-1 py-0.2 rounded shrink-0">
                        BOT
                      </span>
                    )}
                    {isItemMe && (
                      <span className="text-[9px] bg-amber-500/30 text-amber-300 px-1 py-0.2 rounded font-bold shrink-0">
                        {t('youBadge')}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {item.isBankrupt ? (
                      <span className="inline-flex items-center gap-1 text-[11px] text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20 font-semibold">
                        <Skull className="w-3 h-3" />
                        <span>{t('bankruptBadge')}</span>
                      </span>
                    ) : (
                      <span className="font-mono font-bold text-slate-200">
                        {formatMoney(item.netWorth)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Action Buttons: TEKRAR OYNA & ANA MENÜ */}
        <div className="space-y-2.5 pt-2">
          <button
            onClick={onRestart}
            className="w-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 hover:from-amber-300 hover:to-amber-500 text-slate-950 font-black py-3.5 px-4 rounded-xl shadow-xl shadow-amber-500/20 transition transform active:scale-95 text-sm uppercase tracking-wide flex items-center justify-center gap-2 cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            <span>{t('playAgainBtn')}</span>
          </button>

          <button
            onClick={onMainMenu}
            className="w-full bg-[#0a0f1d] hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/80 font-bold py-3 px-4 rounded-xl transition text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer active:scale-95"
          >
            <Home className="w-4 h-4 text-slate-400" />
            <span>{t('mainMenuBtn')}</span>
          </button>
        </div>

      </div>
    </div>
  );
};
