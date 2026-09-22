import React from 'react';
import { useLanguage } from '../i18n/LanguageContext';

interface DiceLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  className?: string;
}

export const DiceLogo: React.FC<DiceLogoProps> = ({
  size = 'md',
  showText = true,
  className = ''
}) => {
  const { language } = useLanguage();

  const sizeStyles = {
    sm: 'w-8 h-8 sm:w-9 sm:h-9',
    md: 'w-10 h-10 sm:w-12 sm:h-12',
    lg: 'w-14 h-14 sm:w-18 sm:h-18'
  }[size];

  return (
    <div
      className={`inline-flex items-center gap-2 sm:gap-2.5 select-none group shrink-0 ${className}`}
    >
      {/* 3D Dice Logo - Only this icon scales slightly on PC mouse hover */}
      <div className={`relative ${sizeStyles} flex items-center justify-center shrink-0 pc-dice-icon-hover`}>
        {/* Ambient subtle glow */}
        <div className="absolute inset-0 bg-amber-400/20 rounded-full blur-sm pointer-events-none" />

        {/* 3D Dice Image */}
        <img
          src="/dice-logo.png"
          alt="Turkish Paradise 3D Zar Logo"
          className="site-logo-dice pointer-events-none"
          loading="eager"
        />
      </div>

      {/* Brand Text */}
      {showText && (
        <div className={`flex flex-col text-left leading-none ${size === 'sm' ? 'hidden sm:flex' : ''}`}>
          <span className="font-['Cinzel',serif] text-xs sm:text-lg font-black tracking-wider text-white flex items-center gap-1 group-hover:text-amber-200 transition-colors duration-200">
            <span>TURKISH</span>
            <span className="bg-gradient-to-r from-amber-300 via-amber-400 to-amber-200 bg-clip-text text-transparent">
              PARADISE
            </span>
          </span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[8.5px] sm:text-[10px] font-bold text-amber-300/80 font-mono tracking-widest uppercase">
              {language === 'en' ? 'TURKEY BOARD GAME' : 'TÜRKİYE MASA OYUNU'}
            </span>
            <span className="text-[7px] sm:text-[8px] font-black uppercase px-1 py-[0.5px] rounded bg-amber-500/20 text-amber-300 border border-amber-500/35 tracking-wider">
              BETA
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
