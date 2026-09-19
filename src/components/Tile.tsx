import React from 'react';
import { BoardTile, ColorGroup, Player } from '../types/game';
import { Anchor, Sparkles } from 'lucide-react';

interface TileProps {
  tile: BoardTile;
  playersOnTile: Player[];
  owner?: Player;
  myPlayerId?: string | null;
  onClick?: () => void;
  style?: React.CSSProperties;
}

// Clean saturated color schemes
const COLOR_MAP: Record<ColorGroup, string> = {
  brown: 'bg-amber-800',
  lightblue: 'bg-sky-400',
  pink: 'bg-pink-500',
  orange: 'bg-orange-500',
  red: 'bg-red-500',
  yellow: 'bg-amber-400',
  green: 'bg-emerald-500',
  blue: 'bg-blue-600',
};

export const Tile: React.FC<TileProps> = ({
  tile,
  playersOnTile,
  owner,
  myPlayerId,
  onClick,
  style
}) => {
  const isStart = tile.type === 'start';
  const isJail = tile.type === 'jail';
  const isParking = tile.type === 'parking';
  const isGoToJail = tile.type === 'gotojail';
  const isChance = tile.type === 'chance';
  const isChest = tile.type === 'chest';
  const isStation = tile.type === 'station';
  const isProperty = tile.type === 'property';

  const colorBg = tile.colorGroup ? COLOR_MAP[tile.colorGroup] : null;

  return (
    <div
      onClick={onClick}
      style={{
        ...style,
        ...(owner ? { borderColor: owner.color, boxShadow: `0 0 8px ${owner.color}60` } : {})
      }}
      className={`relative flex flex-col justify-between rounded-xl border border-slate-700/80 hover:border-amber-400 transition-all duration-200 cursor-pointer select-none overflow-visible group shadow-md ${
        isChance
          ? 'bg-gradient-to-b from-rose-600 to-rose-900 border-rose-400/80 text-white'
          : isChest
          ? 'bg-gradient-to-b from-sky-600 to-blue-900 border-sky-400/80 text-white'
          : isStart
          ? 'bg-gradient-to-b from-amber-500 to-amber-700 border-amber-300 text-slate-950'
          : isJail
          ? 'bg-gradient-to-b from-slate-700 to-slate-900 border-slate-600 text-white'
          : isParking
          ? 'bg-gradient-to-b from-emerald-600 to-teal-900 border-emerald-400 text-white'
          : isGoToJail
          ? 'bg-gradient-to-b from-rose-600 to-red-900 border-rose-400 text-white'
          : 'bg-[#11192e] border-slate-800'
      } ${tile.ownerId ? 'ring-2' : ''}`}
    >
      {/* Owner Badge on Top Right */}
      {owner && (
        <div
          className="absolute -top-1.5 -right-1.5 z-20 w-4 h-4 sm:w-5 sm:h-5 rounded-full border border-white/90 shadow-md flex items-center justify-center text-[9px] sm:text-[11px] animate-fade-in"
          style={{ backgroundColor: owner.color }}
          title={`Sahibi: ${owner.name}`}
        >
          <span>{owner.avatar}</span>
        </div>
      )}

      {/* 1. Property Color Bar on Top */}
      {isProperty && colorBg && (
        <div className={`h-3 sm:h-3.5 w-full ${colorBg} shrink-0 flex items-center justify-center px-1 shadow-sm rounded-t-lg`}>
          {tile.houses > 0 && (
            <div className="flex items-center gap-0.5 drop-shadow">
              {tile.houses === 5 ? (
                <span className="text-[10px] font-bold leading-none">🏨</span>
              ) : (
                <span className="text-[9px] font-bold leading-none">{'🏠'.repeat(tile.houses)}</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* 2. Station Header */}
      {isStation && (
        <div className="h-3 sm:h-3.5 w-full bg-cyan-600 shrink-0 flex items-center justify-center rounded-t-lg">
          <Anchor className="w-2.5 h-2.5 text-white drop-shadow" />
        </div>
      )}

      {/* 3. City Landmark Photo Background */}
      {tile.image && (
        <div className="absolute inset-0 z-0 opacity-30 group-hover:opacity-50 transition-opacity duration-300 pointer-events-none rounded-xl overflow-hidden">
          <img
            src={tile.image}
            alt={tile.name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#090f1e] via-[#090f1e]/60 to-transparent" />
        </div>
      )}

      {/* 4. Special Graphic for ŞANS ❓ */}
      {isChance && (
        <div className="flex-1 flex flex-col items-center justify-center p-1 text-center relative z-10">
          <div className="flex items-center gap-0.5 text-[9px] sm:text-[10px] font-bold tracking-wider uppercase drop-shadow text-yellow-200">
            <Sparkles className="w-2.5 h-2.5" />
            <span>ŞANS</span>
          </div>
          <span className="text-2xl sm:text-3xl font-black text-white drop-shadow-md my-0.5 animate-bounce-short">
            ?
          </span>
        </div>
      )}

      {/* 5. Special Graphic for KAMU FONU 🎁 */}
      {isChest && (
        <div className="flex-1 flex flex-col items-center justify-center p-1 text-center relative z-10">
          <span className="text-[9px] sm:text-[10px] font-bold tracking-wider uppercase drop-shadow text-cyan-100">
            KAMU FONU
          </span>
          <span className="text-xl sm:text-2xl drop-shadow-md my-0.5 animate-pulse">
            📦
          </span>
        </div>
      )}

      {/* 6. Special Graphic for Corners */}
      {isStart && (
        <div className="flex-1 flex flex-col items-center justify-center p-1 text-center relative z-10">
          <span className="text-xl sm:text-2xl font-black text-slate-950 mb-0.5">➔</span>
          <span className="text-[10px] sm:text-xs font-black text-slate-950 tracking-tight leading-none uppercase">
            BAŞLANGIÇ
          </span>
          <span className="text-[8px] sm:text-[9px] font-bold text-slate-900 mt-0.5">
            +₺200
          </span>
        </div>
      )}

      {isJail && (
        <div className="flex-1 flex flex-col items-center justify-center p-1 text-center relative z-10">
          <span className="text-lg sm:text-xl mb-0.5">🔒</span>
          <span className="text-[9px] sm:text-[10px] font-bold text-white tracking-tight leading-tight uppercase">
            HAPİSHANE
          </span>
          <span className="text-[7px] sm:text-[8px] text-slate-300">Ziyaret</span>
        </div>
      )}

      {isParking && (
        <div className="flex-1 flex flex-col items-center justify-center p-1 text-center relative z-10">
          <span className="text-lg sm:text-xl mb-0.5">🅿️</span>
          <span className="text-[9px] sm:text-[10px] font-bold text-white tracking-tight leading-tight uppercase">
            OTOPARK
          </span>
        </div>
      )}

      {isGoToJail && (
        <div className="flex-1 flex flex-col items-center justify-center p-1 text-center relative z-10">
          <span className="text-lg sm:text-xl mb-0.5 animate-pulse">🚨</span>
          <span className="text-[9px] sm:text-[10px] font-bold text-white tracking-tight leading-tight uppercase">
            KODESE GİT
          </span>
        </div>
      )}

      {/* 7. Property / Station Content: Tokens on Upper Half, City Name + Price on Lower Half */}
      {(isProperty || isStation) ? (
        <div className="flex-1 flex flex-col justify-between items-center p-1 text-center relative z-10 min-h-0 w-full">
          
          {/* Player Tokens positioned ABOVE city name */}
          <div className="flex-1 flex items-center justify-center w-full min-h-[22px]">
            {playersOnTile.length > 0 && (
              <div className="flex flex-row items-center justify-center gap-1 max-w-full flex-wrap z-30">
                {playersOnTile.map((p) => {
                  const isMe = myPlayerId ? p.id === myPlayerId : false;
                  return (
                    <div
                      key={p.id}
                      title={p.name}
                      className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-slate-900 border-2 shadow-xl flex items-center justify-center text-xs relative shrink-0 transition-transform duration-200"
                      style={{
                        borderColor: p.color,
                        boxShadow: `0 0 8px ${p.color}`,
                      }}
                    >
                      {p.avatar}

                      {/* Red Pin placed exactly on top of the user's token */}
                      {isMe && (
                        <div className="absolute -top-3.5 sm:-top-4.5 left-1/2 -translate-x-1/2 z-40 pointer-events-none animate-bounce drop-shadow-[0_2px_5px_rgba(239,68,68,0.8)]">
                          <img
                            src="/pin.png"
                            alt="Konumunuz"
                            className="w-4 h-4 sm:w-4.5 sm:h-4.5 object-contain"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* City / Station Name & Price Box */}
          <div className="w-full flex flex-col items-center shrink-0">
            <span className="font-bold text-[9.5px] sm:text-[10.5px] md:text-xs text-white tracking-tight leading-tight group-hover:text-amber-300 transition drop-shadow uppercase line-clamp-1 w-full text-center">
              {tile.name}
            </span>

            {tile.price && (
              <div className="inline-flex items-center gap-0.5 mt-0.5 bg-slate-950/85 px-1.5 py-0.2 rounded border border-slate-700">
                <span className="text-[8.5px] sm:text-[9.5px] font-bold text-amber-300 leading-none">
                  ₺{tile.price}
                </span>
              </div>
            )}
          </div>

        </div>
      ) : (
        /* For Corners and Special Tiles, render tokens around the bottom/center with pin attached */
        playersOnTile.length > 0 && (
          <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex flex-row items-center justify-center gap-1 z-30">
            {playersOnTile.map((p) => {
              const isMe = myPlayerId ? p.id === myPlayerId : false;
              return (
                <div
                  key={p.id}
                  title={p.name}
                  className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-slate-900 border-2 shadow-xl flex items-center justify-center text-xs relative shrink-0"
                  style={{
                    borderColor: p.color,
                    boxShadow: `0 0 8px ${p.color}`,
                  }}
                >
                  {p.avatar}

                  {isMe && (
                    <div className="absolute -top-3.5 sm:-top-4.5 left-1/2 -translate-x-1/2 z-40 pointer-events-none animate-bounce drop-shadow-[0_2px_5px_rgba(239,68,68,0.8)]">
                      <img
                        src="/pin.png"
                        alt="Konumunuz"
                        className="w-4 h-4 sm:w-4.5 sm:h-4.5 object-contain"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}

      {/* 8. Mortgaged Overlay */}
      {tile.isMortgaged && (
        <div className="absolute inset-0 bg-slate-950/90 z-20 flex items-center justify-center text-[10px] font-bold text-amber-400 uppercase tracking-widest backdrop-blur-[2px] rounded-xl">
          İPOTEKLİ
        </div>
      )}

    </div>
  );
};
