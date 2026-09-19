import React from 'react';
import { ChanceCard } from '../types/game';
import { Sparkles } from 'lucide-react';

interface ChanceModalProps {
  card: ChanceCard;
  onConfirm: () => void;
}

export const ChanceModal: React.FC<ChanceModalProps> = ({ card, onConfirm }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border-2 border-amber-500/60 rounded-3xl max-w-sm w-full p-6 text-center shadow-2xl space-y-4">
        
        <div className="inline-flex p-3 bg-amber-500/10 rounded-full border border-amber-500/30 text-amber-400">
          <Sparkles className="w-8 h-8 animate-pulse" />
        </div>

        <h3 className="text-xl font-black text-amber-400">{card.title}</h3>

        <p className="text-sm text-slate-200 bg-slate-950 p-4 rounded-xl border border-slate-800 leading-relaxed font-medium">
          {card.description}
        </p>

        <button
          onClick={onConfirm}
          className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold py-3 rounded-xl shadow-lg transition text-sm"
        >
          Tamam 👍
        </button>

      </div>
    </div>
  );
};
