import React, { useState } from 'react';

interface DiceLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  className?: string;
  onClick?: () => void;
}

// 12 unique dynamic 3D perspectives & rotation faces for the 3D dice
const DICE_FACES = [
  { transform: 'rotateX(0deg) rotateY(0deg) rotateZ(0deg)', label: 'Ön Yüz (5)' },
  { transform: 'rotateX(35deg) rotateY(45deg) rotateZ(-15deg)', label: 'Üst Sağ Köşe' },
  { transform: 'rotateX(-45deg) rotateY(-35deg) rotateZ(25deg)', label: 'Alt Sol Köşe' },
  { transform: 'rotateX(0deg) rotateY(90deg) rotateZ(10deg)', label: 'Sağ Yan Yüz' },
  { transform: 'rotateX(0deg) rotateY(-90deg) rotateZ(-10deg)', label: 'Sol Yan Yüz' },
  { transform: 'rotateX(90deg) rotateY(0deg) rotateZ(45deg)', label: 'Üst Yüz' },
  { transform: 'rotateX(-90deg) rotateY(0deg) rotateZ(-45deg)', label: 'Alt Yüz' },
  { transform: 'rotateX(180deg) rotateY(45deg) rotateZ(180deg)', label: 'Ters Çapraz' },
  { transform: 'rotateX(40deg) rotateY(-130deg) rotateZ(30deg)', label: 'Arka Sağ Açı' },
  { transform: 'rotateX(-30deg) rotateY(140deg) rotateZ(-20deg)', label: 'Arka Sol Açı' },
  { transform: 'rotateX(60deg) rotateY(60deg) rotateZ(60deg)', label: 'İzometrik Köşe' },
  { transform: 'rotateX(-60deg) rotateY(-60deg) rotateZ(-60deg)', label: 'Dinamik 3D Açı' },
];

export const DiceLogo: React.FC<DiceLogoProps> = ({
  size = 'md',
  showText = true,
  className = '',
  onClick
}) => {
  const [faceIndex, setFaceIndex] = useState(0);
  const [isSpinning, setIsSpinning] = useState(false);
  const [clickCount, setClickCount] = useState(0);

  const handleDiceClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsSpinning(true);
    setClickCount((prev) => prev + 1);

    // Pick next face sequentially or jump to a distinct different face
    setFaceIndex((prev) => {
      let next = (prev + 1) % DICE_FACES.length;
      return next;
    });

    setTimeout(() => {
      setIsSpinning(false);
    }, 600);

    if (onClick) {
      onClick();
    }
  };

  const currentFace = DICE_FACES[faceIndex];

  const sizeStyles = {
    sm: 'w-7 h-7 sm:w-8 sm:h-8',
    md: 'w-9 h-9 sm:w-11 sm:h-11',
    lg: 'w-14 h-14 sm:w-16 sm:h-16'
  };

  const imageSizes = {
    sm: 'w-7 h-7 sm:w-8 sm:h-8',
    md: 'w-9 h-9 sm:w-11 sm:h-11',
    lg: 'w-14 h-14 sm:w-16 sm:h-16'
  };

  return (
    <div
      onClick={handleDiceClick}
      className={`inline-flex items-center gap-2 sm:gap-2.5 cursor-pointer select-none group shrink-0 ${className}`}
      title="Zarı Çevirmek İçin Tıkla! 🎲"
    >
      {/* 3D Interactive Glossy Dice Container */}
      <div className={`relative ${sizeStyles[size]} flex items-center justify-center shrink-0 perspective-[800px]`}>
        
        {/* Glow halo behind dice */}
        <div className="absolute inset-0 bg-amber-400/25 rounded-2xl blur-md group-hover:bg-amber-400/40 transition-all duration-300 pointer-events-none" />

        {/* 3D Rotatable Dice Image */}
        <div
          className="relative w-full h-full flex items-center justify-center transition-all duration-600 ease-[cubic-bezier(0.34,1.56,0.64,1)] transform-gpu drop-shadow-[0_4px_12px_rgba(251,191,36,0.35)] group-hover:scale-110 active:scale-95"
          style={{
            transform: `${currentFace.transform} ${isSpinning ? 'scale(1.2) rotateZ(360deg)' : 'scale(1)'}`,
            transformStyle: 'preserve-3d'
          }}
        >
          <img
            src="/dice-logo.png"
            alt="Turkish Paradise 3D Zar Logo"
            className={`${imageSizes[size]} object-contain filter contrast-105 brightness-105 pointer-events-none`}
            loading="eager"
          />
        </div>

        {/* Playful click ripple effect */}
        {isSpinning && (
          <div className="absolute inset-0 rounded-full border border-amber-300 animate-ping pointer-events-none opacity-60" />
        )}
      </div>

      {/* Brand Text */}
      {showText && (
        <div className="flex flex-col text-left leading-none">
          <span className="font-['Cinzel',serif] text-xs sm:text-lg font-black tracking-wider text-white flex items-center gap-1 group-hover:text-amber-200 transition-colors">
            <span>TURKISH</span>
            <span className="bg-gradient-to-r from-amber-300 via-amber-400 to-amber-200 bg-clip-text text-transparent">
              PARADISE
            </span>
          </span>
          <span className="text-[9px] sm:text-[10.5px] font-bold text-amber-300/80 font-mono tracking-widest uppercase hidden sm:block mt-0.5">
            TÜRKİYE MASA OYUNU
          </span>
        </div>
      )}
    </div>
  );
};
