import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import {
  Language,
  TranslationDictionary,
  translations,
  CHANCE_CARDS_TRANSLATIONS,
  TILE_TRANSLATIONS
} from './translations';
import { ChanceCard, BoardTile } from '../types/game';
import { Globe, Check } from 'lucide-react';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  t: (key: keyof TranslationDictionary, params?: Record<string, string | number>) => string;
  translateChanceCard: (card: ChanceCard) => { title: string; description: string };
  translateTile: (tile: BoardTile) => { name: string; subtitle?: string };
  formatMoney: (amount: number) => string;
}

const STORAGE_KEY = 'tp_selected_language';

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    try {
      if (typeof window !== 'undefined') {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved === 'tr' || saved === 'en') {
          return saved;
        }
        // Auto-detect browser language if English
        const navLang = navigator.language?.toLowerCase() || '';
        if (navLang.startsWith('en')) {
          return 'en';
        }
      }
    } catch (e) {}
    return 'tr';
  });

  const setLanguage = (newLang: Language) => {
    setLanguageState(newLang);
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, newLang);
      }
    } catch (e) {}
  };

  const toggleLanguage = () => {
    setLanguage(language === 'tr' ? 'en' : 'tr');
  };

  const t = (key: keyof TranslationDictionary, params?: Record<string, string | number>): string => {
    const dict = translations[language] || translations.tr;
    let text = dict[key] || translations.tr[key] || String(key);
    if (params) {
      Object.entries(params).forEach(([paramKey, paramVal]) => {
        text = text.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(paramVal));
      });
    }
    return text;
  };

  const translateChanceCard = (card: ChanceCard): { title: string; description: string } => {
    const cardDict = CHANCE_CARDS_TRANSLATIONS[language]?.[card.id];
    if (cardDict) {
      return {
        title: cardDict.title,
        description: cardDict.description
      };
    }
    return {
      title: card.title,
      description: card.description
    };
  };

  const translateTile = (tile: BoardTile): { name: string; subtitle?: string } => {
    const tileDict = TILE_TRANSLATIONS[language]?.[tile.name];
    return {
      name: tileDict?.name || tile.name,
      subtitle: tileDict?.subtitle || tile.subtitle
    };
  };

  const formatMoney = (amount: number): string => {
    const symbol = language === 'en' ? '$' : '₺';
    const formatted = Math.abs(amount).toLocaleString(language === 'en' ? 'en-US' : 'tr-TR');
    if (language === 'en') {
      return `${amount < 0 ? '-' : ''}${symbol}${formatted}`;
    }
    return `${amount < 0 ? '-' : ''}${symbol}${formatted}`;
  };

  return (
    <LanguageContext.Provider
      value={{
        language,
        setLanguage,
        toggleLanguage,
        t,
        translateChanceCard,
        translateTile,
        formatMoney
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};

interface LanguageSwitcherProps {
  compact?: boolean;
  className?: string;
  align?: 'left' | 'right';
}

export const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({ compact = false, className = '', align = 'right' }) => {
  const { language, setLanguage } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className={`relative inline-block text-left ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl bg-slate-900/95 hover:bg-slate-800 border border-slate-700 hover:border-amber-400 text-xs font-bold text-slate-100 transition cursor-pointer shadow-lg active:scale-95 shrink-0 select-none ring-1 ring-white/5"
        title="Dili Değiştir / Change Language"
      >
        <span className="text-sm shrink-0">{language === 'tr' ? '🇹🇷' : '🇬🇧'}</span>
        <span className="font-black tracking-wide">{language.toUpperCase()}</span>
        <span className="text-[10px] text-amber-400 font-bold">▾</span>
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-[99998]"
            onClick={() => setIsOpen(false)}
          />
          <div
            className={`absolute ${
              align === 'left' ? 'left-0' : 'right-0'
            } top-full mt-2 w-44 rounded-2xl bg-[#070e1f] border-2 border-amber-400 shadow-[0_20px_60px_rgba(0,0,0,1)] z-[99999] p-2 animate-fade-in divide-y divide-slate-850 select-none ring-2 ring-amber-500/20`}
          >
            <button
              type="button"
              onClick={() => {
                setLanguage('tr');
                setIsOpen(false);
              }}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer mb-1 ${
                language === 'tr'
                  ? 'bg-amber-500/25 text-amber-300 font-black border border-amber-500/50 shadow-sm'
                  : 'text-slate-200 hover:bg-slate-800/90 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span className="text-lg shrink-0">🇹🇷</span>
                <span className="tracking-wide text-sm font-bold">Türkçe</span>
              </div>
              {language === 'tr' && <Check className="w-4 h-4 text-amber-400 shrink-0" />}
            </button>

            <button
              type="button"
              onClick={() => {
                setLanguage('en');
                setIsOpen(false);
              }}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer mt-1 ${
                language === 'en'
                  ? 'bg-amber-500/25 text-amber-300 font-black border border-amber-500/50 shadow-sm'
                  : 'text-slate-200 hover:bg-slate-800/90 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span className="text-lg shrink-0">🇬🇧</span>
                <span className="tracking-wide text-sm font-bold">English</span>
              </div>
              {language === 'en' && <Check className="w-4 h-4 text-amber-400 shrink-0" />}
            </button>
          </div>
        </>
      )}
    </div>
  );
};
