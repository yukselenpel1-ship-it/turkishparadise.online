import React, { useState, useEffect, useRef } from 'react';
import { Sparkles } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

interface DiceProps {
  dice: [number, number];
  disabled: boolean;
  onRoll: () => void;
  onEndTurn: () => void;
  canEndTurn: boolean;
  currentTurnName: string;
  isMyTurn: boolean;
  turnSecondsRemaining?: number;
  isAfk?: boolean;
  onTakeBackControl?: () => void;
}

// Realistic 3D White Cubic Die Face
const RealisticDieFace: React.FC<{ value: number; isRolling: boolean; rollIndex: number }> = ({
  value,
  isRolling,
  rollIndex,
}) => {
  const renderPips = () => {
    switch (value) {
      case 1:
        return (
          <div className="w-full h-full flex items-center justify-center">
            <div className="w-3.5 h-3.5 sm:w-6 sm:h-6 rounded-full bg-gradient-to-br from-red-600 to-rose-700 shadow-inner ring-1 ring-red-400/50" />
          </div>
        );
      case 2:
        return (
          <div className="w-full h-full flex justify-between p-1.5 sm:p-2.5">
            <div className="w-2.5 h-2.5 sm:w-4 sm:h-4 rounded-full bg-gradient-to-br from-slate-900 to-slate-800 shadow-inner self-start" />
            <div className="w-2.5 h-2.5 sm:w-4 sm:h-4 rounded-full bg-gradient-to-br from-slate-900 to-slate-800 shadow-inner self-end" />
          </div>
        );
      case 3:
        return (
          <div className="w-full h-full flex justify-between p-1.5 sm:p-2.5">
            <div className="w-2.5 h-2.5 sm:w-4 sm:h-4 rounded-full bg-gradient-to-br from-slate-900 to-slate-800 shadow-inner self-start" />
            <div className="w-2.5 h-2.5 sm:w-4 sm:h-4 rounded-full bg-gradient-to-br from-slate-900 to-slate-800 shadow-inner self-center" />
            <div className="w-2.5 h-2.5 sm:w-4 sm:h-4 rounded-full bg-gradient-to-br from-slate-900 to-slate-800 shadow-inner self-end" />
          </div>
        );
      case 4:
        return (
          <div className="w-full h-full grid grid-cols-2 grid-rows-2 p-1.5 sm:p-2.5 gap-1.5 sm:gap-2 place-items-center">
            <div className="w-2.5 h-2.5 sm:w-4 sm:h-4 rounded-full bg-gradient-to-br from-slate-900 to-slate-800 shadow-inner" />
            <div className="w-2.5 h-2.5 sm:w-4 sm:h-4 rounded-full bg-gradient-to-br from-slate-900 to-slate-800 shadow-inner" />
            <div className="w-2.5 h-2.5 sm:w-4 sm:h-4 rounded-full bg-gradient-to-br from-slate-900 to-slate-800 shadow-inner" />
            <div className="w-2.5 h-2.5 sm:w-4 sm:h-4 rounded-full bg-gradient-to-br from-slate-900 to-slate-800 shadow-inner" />
          </div>
        );
      case 5:
        return (
          <div className="w-full h-full relative p-1.5 sm:p-2.5">
            <div className="absolute top-1.5 sm:top-2 left-1.5 sm:left-2 w-2.5 h-2.5 sm:w-4 sm:h-4 rounded-full bg-gradient-to-br from-slate-900 to-slate-800 shadow-inner" />
            <div className="absolute top-1.5 sm:top-2 right-1.5 sm:right-2 w-2.5 h-2.5 sm:w-4 sm:h-4 rounded-full bg-gradient-to-br from-slate-900 to-slate-800 shadow-inner" />
            <div className="absolute inset-0 m-auto w-3 h-3 sm:w-4.5 sm:h-4.5 rounded-full bg-gradient-to-br from-red-600 to-rose-700 shadow-inner ring-1 ring-red-400/50" />
            <div className="absolute bottom-1.5 sm:bottom-2 left-1.5 sm:left-2 w-2.5 h-2.5 sm:w-4 sm:h-4 rounded-full bg-gradient-to-br from-slate-900 to-slate-800 shadow-inner" />
            <div className="absolute bottom-1.5 sm:bottom-2 right-1.5 sm:right-2 w-2.5 h-2.5 sm:w-4 sm:h-4 rounded-full bg-gradient-to-br from-slate-900 to-slate-800 shadow-inner" />
          </div>
        );
      case 6:
        return (
          <div className="w-full h-full grid grid-cols-2 grid-rows-3 p-1 sm:p-2 gap-1 sm:gap-1.5 place-items-center">
            <div className="w-2 h-2 sm:w-3.5 sm:h-3.5 rounded-full bg-gradient-to-br from-slate-900 to-slate-800 shadow-inner" />
            <div className="w-2 h-2 sm:w-3.5 sm:h-3.5 rounded-full bg-gradient-to-br from-slate-900 to-slate-800 shadow-inner" />
            <div className="w-2 h-2 sm:w-3.5 sm:h-3.5 rounded-full bg-gradient-to-br from-slate-900 to-slate-800 shadow-inner" />
            <div className="w-2 h-2 sm:w-3.5 sm:h-3.5 rounded-full bg-gradient-to-br from-slate-900 to-slate-800 shadow-inner" />
            <div className="w-2 h-2 sm:w-3.5 sm:h-3.5 rounded-full bg-gradient-to-br from-slate-900 to-slate-800 shadow-inner" />
            <div className="w-2 h-2 sm:w-3.5 sm:h-3.5 rounded-full bg-gradient-to-br from-slate-900 to-slate-800 shadow-inner" />
          </div>
        );
      default:
        return null;
    }
  };

  const rollClass = isRolling
    ? rollIndex === 0
      ? 'rotate-[-360deg] scale-110 -translate-y-2'
      : 'rotate-[360deg] scale-110 -translate-y-2'
    : 'hover:-translate-y-1 hover:scale-105';

  return (
    <div
      className={`w-10 h-10 xs:w-12 xs:h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl bg-gradient-to-br from-white via-slate-50 to-slate-200 border sm:border-2 border-slate-100 transition-all duration-100 relative select-none cursor-pointer ${rollClass}`}
      style={{
        boxShadow: isRolling
          ? '0 16px 25px -4px rgba(0, 0, 0, 0.9), inset 0 2px 4px rgba(255, 255, 255, 0.95), inset 0 -2px 4px rgba(0, 0, 0, 0.15)'
          : '0 8px 16px -4px rgba(0, 0, 0, 0.75), inset 0 2px 4px rgba(255, 255, 255, 0.9), inset 0 -2px 4px rgba(0, 0, 0, 0.12)',
      }}
    >
      {/* 3D Glossy Light Reflection */}
      <div className="absolute top-0.5 sm:top-1 left-1.5 right-1.5 sm:left-2 sm:right-2 h-2 sm:h-3.5 rounded-t-lg sm:rounded-t-xl bg-gradient-to-b from-white/90 to-transparent pointer-events-none" />
      {renderPips()}
    </div>
  );
};

export const Dice: React.FC<DiceProps> = ({
  dice,
  disabled,
  onRoll,
  onEndTurn,
  canEndTurn,
  currentTurnName,
  isMyTurn,
  turnSecondsRemaining,
  isAfk,
  onTakeBackControl,
}) => {
  const { t, language } = useLanguage();
  const [isRolling, setIsRolling] = useState(false);
  const [displayDice, setDisplayDice] = useState<[number, number]>(dice);
  const rollIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isRolling) {
      setDisplayDice(dice);
    }
  }, [dice, isRolling]);

  const handleRollClick = () => {
    if (disabled || !isMyTurn || isRolling) return;
    if (isAfk && onTakeBackControl) {
      onTakeBackControl();
    }

    setIsRolling(true);

    let count = 0;
    rollIntervalRef.current = window.setInterval(() => {
      setDisplayDice([
        Math.floor(Math.random() * 6) + 1,
        Math.floor(Math.random() * 6) + 1,
      ]);
      count += 1;
      if (count > 7) {
        if (rollIntervalRef.current) clearInterval(rollIntervalRef.current);
        setIsRolling(false);
        onRoll();
      }
    }, 40);
  };

  const timerValue = typeof turnSecondsRemaining === 'number' ? turnSecondsRemaining : 60;
  const isTimeCritical = timerValue <= 15;

  return (
    <div className="flex flex-col items-center justify-center space-y-1.5 sm:space-y-3 w-full">
      {/* Turn Indicator Banner & Countdown Timer */}
      <div className="inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-1 sm:py-1.5 rounded-full bg-slate-900/90 border border-amber-400/40 shadow-xl backdrop-blur-md">
        <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-emerald-400 animate-ping" />
        <span className="text-[10px] sm:text-xs font-bold text-slate-200">
          {language === 'en' ? 'Turn: ' : 'Sıra: '}
          <strong className="text-amber-400 font-extrabold">{currentTurnName}</strong>{' '}
          {isMyTurn && <span className="text-rose-400 font-black">({t('youBadge')})</span>}
        </span>
        {/* Turn Timer Badge */}
        <span
          className={`text-[9px] sm:text-[10px] font-mono font-black px-1.5 sm:px-2 py-0.2 sm:py-0.5 rounded-full border transition flex items-center gap-0.5 sm:gap-1 ${
            isTimeCritical
              ? 'bg-rose-500/20 text-rose-400 border-rose-500/50 animate-pulse'
              : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
          }`}
          title={t('turnCountdownTooltip')}
        >
          <span>⏳</span>
          <span>{timerValue}s</span>
        </span>
      </div>

      {/* AFK Mode Active Alert & Take Back Control Button */}
      {isMyTurn && isAfk && (
        <div className="w-full max-w-[260px] sm:max-w-xs bg-amber-500/20 border border-amber-400 rounded-xl p-1.5 sm:p-2 text-center animate-bounce shadow-lg backdrop-blur-md">
          <p className="text-[10px] sm:text-[11px] text-amber-200 font-bold mb-1 leading-tight">
            {t('afkBotAlert')}
          </p>
          {onTakeBackControl && (
            <button
              onClick={onTakeBackControl}
              className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black py-1 px-2.5 rounded-lg text-[10px] sm:text-xs shadow-md transition cursor-pointer"
            >
              {t('takeBackControl')}
            </button>
          )}
        </div>
      )}

      {/* 3D Realistic White Dice Pair */}
      <div className="flex items-center justify-center gap-3 sm:gap-5 p-0.5 sm:p-1">
        <RealisticDieFace value={displayDice[0]} isRolling={isRolling} rollIndex={0} />
        <RealisticDieFace value={displayDice[1]} isRolling={isRolling} rollIndex={1} />
      </div>

      {/* Luxury Golden "ZAR AT" Button & Turn Controls */}
      <div className="w-full max-w-[240px] sm:max-w-xs flex flex-col items-center gap-1.5 sm:gap-2">
        <button
          onClick={handleRollClick}
          disabled={disabled || !isMyTurn || isRolling}
          className="w-full bg-gradient-to-b from-[#fde68a] via-[#f59e0b] to-[#b45309] hover:from-[#fef08a] hover:to-[#d97706] disabled:from-slate-800 disabled:via-slate-850 disabled:to-slate-900 disabled:text-slate-600 text-slate-950 font-black py-2 sm:py-3 px-4 sm:px-8 rounded-xl sm:rounded-2xl shadow-xl transition-all duration-200 transform active:scale-95 disabled:scale-100 border sm:border-2 border-amber-300/80 text-xs sm:text-base tracking-wider uppercase flex items-center justify-center gap-1.5 sm:gap-2 cursor-pointer disabled:cursor-not-allowed min-h-[38px] sm:min-h-[46px]"
          style={{
            boxShadow: disabled
              ? 'none'
              : '0 8px 20px -4px rgba(245, 158, 11, 0.5), inset 0 2px 4px rgba(255, 255, 255, 0.8)',
          }}
        >
          <span className="text-base sm:text-xl">🎲</span>
          <span>{isRolling ? t('rollingDice') : t('rollDice')}</span>
        </button>

        {canEndTurn && isMyTurn && (
          <button
            onClick={() => {
              if (isAfk && onTakeBackControl) onTakeBackControl();
              onEndTurn();
            }}
            className="w-full bg-slate-900/90 hover:bg-slate-850 text-amber-300 hover:text-white font-bold py-1.5 sm:py-2.5 px-4 sm:px-6 rounded-lg sm:rounded-xl border border-amber-500/40 hover:border-amber-400 transition-all text-[11px] sm:text-xs tracking-wider uppercase flex items-center justify-center gap-1.5 shadow-lg cursor-pointer min-h-[34px] sm:min-h-[40px]"
          >
            <span>{t('endTurn')}</span>
            <span className="text-sm sm:text-base font-black">➔</span>
          </button>
        )}
      </div>
    </div>
  );
};
