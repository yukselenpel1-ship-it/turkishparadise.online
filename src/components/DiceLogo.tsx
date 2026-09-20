import React, { useState } from 'react';

interface DiceLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  className?: string;
  onClick?: () => void;
}

// 6 distinct sides of the 3D dice, each with isometric 3D rotation angles
const DICE_SIDES = [
  // Side 5 (Default initial view - exactly matches the uploaded image!)
  { value: 5, rx: -35, ry: -45, rz: 10, label: '5' },
  // Side 1
  { value: 1, rx: -15, ry: 25, rz: -5, label: '1' },
  // Side 6
  { value: 6, rx: 15, ry: -155, rz: 10, label: '6' },
  // Side 3
  { value: 3, rx: -25, ry: -115, rz: 15, label: '3' },
  // Side 4
  { value: 4, rx: -20, ry: 65, rz: -10, label: '4' },
  // Side 2
  { value: 2, rx: 65, ry: -30, rz: 35, label: '2' },
];

export const DiceLogo: React.FC<DiceLogoProps> = ({
  size = 'md',
  showText = true,
  className = '',
  onClick
}) => {
  const [sideIndex, setSideIndex] = useState(0);
  const [isRolling, setIsRolling] = useState(false);
  const [extraRotation, setExtraRotation] = useState({ x: 0, y: 0 });

  // Size configurations
  const config = {
    sm: { box: 28, half: 14, dot: 'w-1.5 h-1.5', container: 'w-7 h-7 sm:w-8 sm:h-8' },
    md: { box: 36, half: 18, dot: 'w-2 h-2', container: 'w-9 h-9 sm:w-10 sm:h-10' },
    lg: { box: 54, half: 27, dot: 'w-3 h-3', container: 'w-14 h-14 sm:w-16 sm:h-16' }
  }[size];

  const handleDiceClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isRolling) return;

    setIsRolling(true);

    // Pick next distinct side
    const nextIndex = (sideIndex + 1 + Math.floor(Math.random() * (DICE_SIDES.length - 1))) % DICE_SIDES.length;
    setSideIndex(nextIndex);

    // Add extra 360/720 spin on each roll
    setExtraRotation((prev) => ({
      x: prev.x + (Math.random() > 0.5 ? 360 : -360),
      y: prev.y + (Math.random() > 0.5 ? 720 : -720)
    }));

    setTimeout(() => {
      setIsRolling(false);
    }, 700);

    if (onClick) {
      onClick();
    }
  };

  const currentSide = DICE_SIDES[sideIndex];
  const rotX = currentSide.rx + extraRotation.x;
  const rotY = currentSide.ry + extraRotation.y;
  const rotZ = currentSide.rz;

  // Render a glossy recessed black pip (dot)
  const Pip = () => (
    <div
      className={`${config.dot} rounded-full bg-gradient-to-br from-[#0a0a0a] via-[#1a1a1a] to-[#2d2d2d] shadow-[inset_0_1px_2px_rgba(0,0,0,0.95),0_1px_1px_rgba(255,255,255,0.4)] relative flex items-center justify-center shrink-0`}
    >
      {/* Specular highlight on dot */}
      <div className="w-[30%] h-[30%] rounded-full bg-white/50 -translate-x-[20%] -translate-y-[20%]" />
    </div>
  );

  const faceBaseStyle = `absolute inset-0 bg-gradient-to-br from-[#ffffff] via-[#f3f4f8] to-[#d6dbe4] rounded-[22%] border border-white/90 shadow-[inset_0_2px_4px_rgba(255,255,255,1),inset_0_-2px_4px_rgba(0,0,0,0.2),0_2px_6px_rgba(0,0,0,0.15)] flex items-center justify-center backface-visible select-none pointer-events-none`;

  return (
    <div
      onClick={handleDiceClick}
      className={`inline-flex items-center gap-2 sm:gap-2.5 cursor-pointer select-none group shrink-0 ${className}`}
      title="Zarı Çevirmek İçin Tıkla! 🎲"
    >
      {/* 3D Scene Viewport */}
      <div
        className={`relative ${config.container} flex items-center justify-center shrink-0`}
        style={{ perspective: '600px' }}
      >
        {/* Glow halo behind dice */}
        <div className="absolute inset-0 bg-amber-400/25 rounded-2xl blur-md group-hover:bg-amber-400/40 transition-all duration-300 pointer-events-none" />

        {/* 3D Rotating Cube Container */}
        <div
          className="relative drop-shadow-[0_4px_12px_rgba(251,191,36,0.35)] group-hover:scale-105 active:scale-95"
          style={{
            width: `${config.box}px`,
            height: `${config.box}px`,
            transformStyle: 'preserve-3d',
            transform: `rotateX(${rotX}deg) rotateY(${rotY}deg) rotateZ(${rotZ}deg)`,
            transition: isRolling
              ? 'transform 0.7s cubic-bezier(0.2, 1.4, 0.4, 1)'
              : 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)'
          }}
        >
          {/* FACE 1 (Front): 1 Pip */}
          <div
            className={faceBaseStyle}
            style={{ transform: `rotateY(0deg) translateZ(${config.half}px)` }}
          >
            <Pip />
          </div>

          {/* FACE 6 (Back): 6 Pips */}
          <div
            className={faceBaseStyle}
            style={{ transform: `rotateY(180deg) translateZ(${config.half}px)` }}
          >
            <div className="w-full h-full p-[15%] grid grid-cols-2 grid-rows-3 place-items-center">
              <Pip /><Pip />
              <Pip /><Pip />
              <Pip /><Pip />
            </div>
          </div>

          {/* FACE 3 (Right): 3 Pips */}
          <div
            className={faceBaseStyle}
            style={{ transform: `rotateY(90deg) translateZ(${config.half}px)` }}
          >
            <div className="w-full h-full p-[16%] flex flex-col justify-between">
              <div className="flex justify-start"><Pip /></div>
              <div className="flex justify-center"><Pip /></div>
              <div className="flex justify-end"><Pip /></div>
            </div>
          </div>

          {/* FACE 4 (Left): 4 Pips */}
          <div
            className={faceBaseStyle}
            style={{ transform: `rotateY(-90deg) translateZ(${config.half}px)` }}
          >
            <div className="w-full h-full p-[16%] grid grid-cols-2 grid-rows-2 place-items-center">
              <Pip /><Pip />
              <Pip /><Pip />
            </div>
          </div>

          {/* FACE 5 (Top - Hero view like image): 5 Pips */}
          <div
            className={faceBaseStyle}
            style={{ transform: `rotateX(90deg) translateZ(${config.half}px)` }}
          >
            <div className="relative w-full h-full p-[15%] grid grid-cols-2 grid-rows-2 place-items-center">
              <Pip /><Pip />
              <Pip /><Pip />
              <div className="absolute inset-0 flex items-center justify-center">
                <Pip />
              </div>
            </div>
          </div>

          {/* FACE 2 (Bottom): 2 Pips */}
          <div
            className={faceBaseStyle}
            style={{ transform: `rotateX(-90deg) translateZ(${config.half}px)` }}
          >
            <div className="w-full h-full p-[18%] flex flex-col justify-between">
              <div className="flex justify-start"><Pip /></div>
              <div className="flex justify-end"><Pip /></div>
            </div>
          </div>
        </div>

        {/* Pulse effect while rolling */}
        {isRolling && (
          <div className="absolute inset-0 rounded-full border border-amber-300 animate-ping pointer-events-none opacity-50" />
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
