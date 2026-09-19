import React from 'react';
import { Player } from '../types/game';
import { Trophy, RotateCcw } from 'lucide-react';

interface WinnerModalProps {
  winner: Player;
  onRestart: () => void;
}

export const WinnerModal: React.FC<WinnerModalProps> = ({ winner, onRestart }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md animate-fade-in">
      <div className="bg-slate-900 border-2 border-amber-500 rounded-3xl max-w-md w-full p-8 text-center shadow-2xl space-y-6">
        
        <div className="inline-flex p-4 bg-amber-500/20 rounded-full border border-amber-500/40 text-amber-400 animate-bounce">
          <Trophy className="w-12 h-12" />
        </div>

        <div>
          <h2 className="text-3xl font-black text-amber-400 tracking-wider">TEBRİKLER!</h2>
          <p className="text-slate-400 text-sm mt-1 font-medium">Pococoly Zaferi</p>
        </div>

        <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 space-y-2">
          <div className="text-5xl">{winner.avatar}</div>
          <div className="text-2xl font-bold text-white">{winner.name}</div>
          <div className="text-emerald-400 font-extrabold text-lg">{winner.money}₺ Bakiye ile Şampiyon!</div>
        </div>

        <button
          onClick={onRestart}
          className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold py-4 rounded-xl shadow-lg transition text-base flex items-center justify-center gap-2"
        >
          <RotateCcw className="w-5 h-5" />
          Yeni Oyun Başlat
        </button>

      </div>
    </div>
  );
};
