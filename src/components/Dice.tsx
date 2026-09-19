import React, { useState, useEffect, useRef } from 'react';
import { Sparkles } from 'lucide-react';

interface DiceProps {
  dice: [number, number];
  disabled: boolean;
  onRoll: () => void;
  onEndTurn: () => void;
  canEndTurn: boolean;
  currentTurnName: string;
  isMyTurn: boolean;
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
            <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-gradient-to-br from-red-600 to-rose-700 shadow-inner ring-1 ring-red-400/50" />
          </div>
        );
      case 2:
        return (
          <div className="w-full h-full flex justify-between p-2 sm:p-2.5">
            <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-gradient-to-br from-slate-900 to-slate-800 shadow-inner self-start" />
            <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-gradient-to-br from-slate-900 to-slate-800 shadow-inner self-end" />
          </div>
        );
      case 3:
        return (
          <div className="w-full h-full flex justify-between p-2 sm:p-2.5">
            <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-gradient-to-br from-slate-900 to-slate-800 shadow-inner self-start" />
            <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-gradient-to-br from-slate-900 to-slate-800 shadow-inner self-center" />
            <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-gradient-to-br from-slate-900 to-slate-800 shadow-inner self-end" />
          </div>
        );
      case 4:
        return (
          <div className="w-full h-full grid grid-cols-2 grid-rows-2 p-2 sm:p-2.5 gap-2 place-items-center">
            <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-gradient-to-br from-slate-900 to-slate-800 shadow-inner" />
            <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-gradient-to-br from-slate-900 to-slate-800 shadow-inner" />
            <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-gradient-to-br from-slate-900 to-slate-800 shadow-inner" />
            <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-gradient-to-br from-slate-900 to-slate-800 shadow-inner" />
          </div>
        );
      case 5:
        return (
          <div className="w-full h-full relative p-2 sm:p-2.5">
            <div className="absolute top-2 left-2 w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-gradient-to-br from-slate-900 to-slate-800 shadow-inner" />
            <div className="absolute top-2 right-2 w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-gradient-to-br from-slate-900 to-slate-800 shadow-inner" />
            <div className="absolute inset-0 m-auto w-4 h-4 sm:w-4.5 sm:h-4.5 rounded-full bg-gradient-to-br from-red-600 to-rose-700 shadow-inner ring-1 ring-red-400/50" />
            <div className="absolute bottom-2 left-2 w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-gradient-to-br from-slate-900 to-slate-800 shadow-inner" />
            <div className="absolute bottom-2 right-2 w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-gradient-to-br from-slate-900 to-slate-800 shadow-inner" />
          </div>
        );
      case 6:
        return (
          <div className="w-full h-full grid grid-cols-2 grid-rows-3 p-1.5 sm:p-2 gap-1.5 place-items-center">
            <div className="w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full bg-gradient-to-br from-slate-900 to-slate-800 shadow-inner" />
            <div className="w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full bg-gradient-to-br from-slate-900 to-slate-800 shadow-inner" />
            <div className="w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full bg-gradient-to-br from-slate-900 to-slate-800 shadow-inner" />
            <div className="w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full bg-gradient-to-br from-slate-900 to-slate-800 shadow-inner" />
            <div className="w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full bg-gradient-to-br from-slate-900 to-slate-800 shadow-inner" />
            <div className="w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full bg-gradient-to-br from-slate-900 to-slate-800 shadow-inner" />
          </div>
        );
      default:
        return null;
    }
  };

  const rollClass = isRolling
    ? rollIndex === 0
      ? 'rotate-[-360deg] scale-110 -translate-y-3'
      : 'rotate-[360deg] scale-110 -translate-y-3'
    : 'hover:-translate-y-1 hover:scale-105';

  return (
    <div
      className={`w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br from-white via-slate-50 to-slate-200 border-2 border-slate-100 transition-all duration-100 relative select-none cursor-pointer ${rollClass}`}
      style={{
        boxShadow: isRolling
          ? '0 24px 35px -4px rgba(0, 0, 0, 0.9), inset 0 2px 4px rgba(255, 255, 255, 0.95), inset 0 -3px 6px rgba(0, 0, 0, 0.15)'
          : '0 12px 24px -4px rgba(0, 0, 0, 0.75), inset 0 2px 4px rgba(255, 255, 255, 0.9), inset 0 -3px 6px rgba(0, 0, 0, 0.12)',
      }}
    >
      {/* 3D Glossy Light Reflection */}
      <div className="absolute top-1 left-2 right-2 h-3.5 rounded-t-xl bg-gradient-to-b from-white/90 to-transparent pointer-events-none" />
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
}) => {
  const [isRolling, setIsRolling] = useState(false);
  const [displayDice, setDisplayDice] = useState<[number, number]>(dice);
  const rollIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isRolling) {
      setDisplayDice(dice);
    }
  }, [dice, isRolling]);

  const handleRollClick = () => {
    if (disabled || isRolling) return;

    setIsRolling(true);

    let count = 0;
    rollIntervalRef.current = window.setInterval(() => {
      setDisplayDice([
        Math.floor(Math.random() * 6) + 1,
        Math.floor(Math.random() * 6) + 1,
      ]);
      count += 1;
      if (count > 12) {
        if (rollIntervalRef.current) clearInterval(rollIntervalRef.current);
        setIsRolling(false);
        onRoll();
      }
    }, 50);
  };

  return (
    <div className="flex flex-col items-center justify-center space-y-3">
      {/* Turn Indicator Banner */}
      <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-900/90 border border-amber-400/40 shadow-xl backdrop-blur-md">
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
        <span className="text-xs font-bold text-slate-200">
          Sıra:{' '}
          <strong className="text-amber-400 font-extrabold">{currentTurnName}</strong>{' '}
          {isMyTurn && <span className="text-rose-400 font-black">(Siz)</span>}
        </span>
      </div>

      {/* 3D Realistic White Dice Pair */}
      <div className="flex items-center justify-center gap-5 p-1">
        <RealisticDieFace value={displayDice[0]} isRolling={isRolling} rollIndex={0} />
        <RealisticDieFace value={displayDice[1]} isRolling={isRolling} rollIndex={1} />
      </div>

      {/* Luxury Golden "ZAR AT" Button & Turn Controls */}
      <div className="w-full max-w-xs flex flex-col items-center gap-2.5">
        <button
          onClick={handleRollClick}
          disabled={disabled || !isMyTurn || isRolling}
          className="w-full bg-gradient-to-b from-[#fde68a] via-[#f59e0b] to-[#b45309] hover:from-[#fef08a] hover:to-[#d97706] disabled:from-slate-800 disabled:via-slate-850 disabled:to-slate-900 disabled:text-slate-600 text-slate-950 font-black py-3 px-8 rounded-2xl shadow-xl transition-all duration-200 transform active:scale-95 disabled:scale-100 border-2 border-amber-300/80 text-sm sm:text-base tracking-wider uppercase flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
          style={{
            boxShadow: disabled
              ? 'none'
              : '0 10px 25px -4px rgba(245, 158, 11, 0.5), inset 0 2px 4px rgba(255, 255, 255, 0.8)',
          }}
        >
          <span className="text-xl">🎲</span>
          <span>{isRolling ? 'ZAR ATILIYOR...' : 'ZAR AT'}</span>
        </button>

        {canEndTurn && isMyTurn && (
          <button
            onClick={onEndTurn}
            className="w-full bg-slate-900/90 hover:bg-slate-850 text-amber-300 hover:text-white font-bold py-2.5 px-6 rounded-xl border border-amber-500/40 hover:border-amber-400 transition-all text-xs tracking-wider uppercase flex items-center justify-center gap-2 shadow-lg cursor-pointer"
          >
            <span>TURU BİTİR</span>
            <span className="text-base font-black">➔</span>
          </button>
        )}
      </div>
    </div>
  );
};
