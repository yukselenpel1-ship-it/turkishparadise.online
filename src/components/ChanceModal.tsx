import React, { useState, useEffect, useRef } from 'react';
import { ChanceCard } from '../types/game';
import { Sparkles, Clock } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

interface ChanceModalProps {
  card: ChanceCard;
  onConfirm: () => void;
  autoConfirmSeconds?: number;
}

export const ChanceModal: React.FC<ChanceModalProps> = ({
  card,
  onConfirm,
  autoConfirmSeconds = 10
}) => {
  const { translateChanceCard, language } = useLanguage();
  const translated = translateChanceCard(card);
  const [secondsLeft, setSecondsLeft] = useState<number>(autoConfirmSeconds);
  const onConfirmRef = useRef(onConfirm);

  useEffect(() => {
    onConfirmRef.current = onConfirm;
  }, [onConfirm]);

  useEffect(() => {
    setSecondsLeft(autoConfirmSeconds);
    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          onConfirmRef.current();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [card, autoConfirmSeconds]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border-2 border-amber-500/60 rounded-3xl max-w-sm w-full p-6 text-center shadow-2xl space-y-4 relative overflow-hidden">
        
        {/* Top Timer Progress Bar */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-slate-800">
          <div
            className="h-full bg-gradient-to-r from-amber-400 to-amber-600 transition-all duration-1000 ease-linear"
            style={{ width: `${(secondsLeft / autoConfirmSeconds) * 100}%` }}
          />
        </div>

        <div className="inline-flex p-3 bg-amber-500/10 rounded-full border border-amber-500/30 text-amber-400 mt-1">
          <Sparkles className="w-8 h-8 animate-pulse" />
        </div>

        <h3 className="text-xl font-black text-amber-400">{translated.title}</h3>

        <p className="text-sm text-slate-200 bg-slate-950 p-4 rounded-xl border border-slate-800 leading-relaxed font-medium">
          {translated.description}
        </p>

        <button
          onClick={onConfirm}
          className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black py-3 px-4 rounded-xl shadow-lg transition text-sm cursor-pointer active:scale-95 flex items-center justify-center gap-2"
        >
          <span>{language === 'en' ? 'OK' : 'Tamam'} 🔥</span>
          <span className="inline-flex items-center gap-1 bg-slate-950/30 text-slate-900 font-mono text-xs px-2 py-0.5 rounded-full border border-slate-950/20">
            <Clock className="w-3 h-3" />
            <span>{secondsLeft}s</span>
          </span>
        </button>

      </div>
    </div>
  );
};
