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

// Crisp saturated color gradients for property headers
const COLOR_GRADIENTS: Record<ColorGroup, string> = {
  brown: 'bg-gradient-to-r from-amber-700 via-amber-800 to-amber-900 border-b border-amber-600/60',
  lightblue: 'bg-gradient-to-r from-sky-400 via-cyan-500 to-sky-600 border-b border-sky-300/60',
  pink: 'bg-gradient-to-r from-pink-500 via-rose-500 to-pink-600 border-b border-pink-300/60',
  orange: 'bg-gradient-to-r from-orange-400 via-amber-500 to-orange-600 border-b border-orange-300/60',
  red: 'bg-gradient-to-r from-rose-500 via-red-600 to-rose-700 border-b border-red-400/60',
  yellow: 'bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 border-b border-yellow-200/60',
  green: 'bg-gradient-to-r from-emerald-400 via-teal-500 to-emerald-600 border-b border-emerald-300/60',
  blue: 'bg-gradient-to-r from-blue-500 via-indigo-600 to-blue-700 border-b border-blue-300/60',
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
  const isTax = tile.type === 'tax';

  const colorGradient = tile.colorGroup ? COLOR_GRADIENTS[tile.colorGroup] : null;

  return (
    <div
      onClick={onClick}
      style={{
        ...style,
        ...(owner ? { borderColor: owner.color, boxShadow: `0 0 10px ${owner.color}90` } : {})
      }}
      className={`relative flex flex-col justify-between rounded-md sm:rounded-xl border border-slate-700/80 hover:border-amber-400 hover:ring-2 hover:ring-amber-400/40 transition-all duration-200 cursor-pointer select-none overflow-visible group shadow-md ${
        isChance
          ? 'bg-gradient-to-b from-rose-600 via-rose-700 to-rose-950 border-rose-400/80 text-white'
          : isChest
          ? 'bg-gradient-to-b from-sky-600 via-blue-700 to-slate-950 border-sky-400/80 text-white'
          : isTax
          ? 'bg-gradient-to-b from-purple-900 via-slate-900 to-indigo-950 border-purple-500/70 text-white'
          : isStart
          ? 'bg-gradient-to-b from-amber-400 via-amber-500 to-amber-600 border-amber-300 text-slate-950'
          : isJail
          ? 'bg-gradient-to-b from-slate-700 via-slate-800 to-slate-950 border-slate-600 text-white'
          : isParking
          ? 'bg-gradient-to-b from-emerald-600 via-teal-700 to-slate-950 border-emerald-400 text-white'
          : isGoToJail
          ? 'bg-gradient-to-b from-rose-600 via-red-700 to-rose-950 border-rose-400 text-white'
          : 'bg-gradient-to-b from-[#131b2e] to-[#0a101d] border-slate-800'
      } ${tile.ownerId ? 'ring-1 sm:ring-2' : ''}`}
      title={`${tile.name} ${tile.price ? `(₺${tile.price})` : ''} ${owner ? `• Sahibi: ${owner.name}` : ''}`}
    >
      {/* Owner Badge on Top Right */}
      {owner && (
        <div
          className="absolute -top-1 -right-1 sm:-top-1.5 sm:-right-1.5 z-20 w-3.5 h-3.5 sm:w-5 sm:h-5 rounded-full border-2 border-white shadow-md flex items-center justify-center text-[8px] sm:text-[11px] animate-fade-in"
          style={{ backgroundColor: owner.color }}
          title={`Sahibi: ${owner.name}`}
        >
          <span>{owner.avatar}</span>
        </div>
      )}

      {/* 1. Property Color Bar on Top */}
      {isProperty && colorGradient && (
        <div className={`h-2 sm:h-4 w-full ${colorGradient} shrink-0 flex items-center justify-center px-0.5 sm:px-1 shadow-sm rounded-t-sm sm:rounded-t-lg relative z-10`}>
          {tile.houses > 0 && (
            <div className="flex items-center gap-0.5 drop-shadow">
              {tile.houses === 5 ? (
                <span className="text-[8px] sm:text-[11px] font-bold leading-none">🏨</span>
              ) : (
                <span className="text-[7px] sm:text-[9.5px] font-bold leading-none">{'🏠'.repeat(tile.houses)}</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* 2. Station Header */}
      {isStation && (
        <div className="h-2 sm:h-4 w-full bg-gradient-to-r from-cyan-600 via-teal-600 to-cyan-700 shrink-0 flex items-center justify-center rounded-t-sm sm:rounded-t-lg relative z-10 border-b border-cyan-400/40">
          <Anchor className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-white drop-shadow" />
        </div>
      )}

      {/* 3. City Landmark Photo Background */}
      {tile.image && (
        <div className="absolute inset-0 z-0 opacity-30 group-hover:opacity-55 transition-opacity duration-300 pointer-events-none rounded-md sm:rounded-xl overflow-hidden">
          <img
            src={tile.image}
            alt={tile.name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#090f1e] via-[#090f1e]/50 to-transparent" />
        </div>
      )}

      {/* 4. Special Graphic for ŞANS ❓ */}
      {isChance && (
        <div className="flex-1 flex flex-col items-center justify-center p-0.5 sm:p-1 text-center relative z-10">
          <div className="flex items-center gap-0.5 text-[7px] sm:text-[10px] font-bold tracking-wider uppercase drop-shadow text-yellow-200">
            <Sparkles className="w-2 h-2 sm:w-2.5 sm:h-2.5" />
            <span>ŞANS</span>
          </div>
          <span className="text-base sm:text-3xl font-black text-white drop-shadow-md my-0.5 animate-bounce-short leading-none">
            ?
          </span>
        </div>
      )}

      {/* 5. Special Graphic for KAMU FONU 🎁 */}
      {isChest && (
        <div className="flex-1 flex flex-col items-center justify-center p-0.5 sm:p-1 text-center relative z-10">
          <span className="text-[7px] sm:text-[10px] font-bold tracking-wider uppercase drop-shadow text-cyan-100 leading-none">
            FON
          </span>
          <span className="text-sm sm:text-2xl drop-shadow-md my-0.5 animate-pulse leading-none">
            📦
          </span>
        </div>
      )}

      {/* 6. Special Graphic for Corners */}
      {isStart && (
        <div className="flex-1 flex flex-col items-center justify-center p-0.5 sm:p-1 text-center relative z-10">
          <span className="text-sm sm:text-2xl font-black text-slate-950 mb-0.5 leading-none">➔</span>
          <span className="text-[7px] sm:text-xs font-black text-slate-950 tracking-tight leading-none uppercase">
            BAŞLANGIÇ
          </span>
          <span className="text-[6.5px] sm:text-[9.5px] font-extrabold text-slate-900 mt-0.5 leading-none">
            +₺200
          </span>
        </div>
      )}

      {isJail && (
        <div className="flex-1 flex flex-col items-center justify-center p-0.5 sm:p-1 text-center relative z-10">
          <span className="text-sm sm:text-2xl mb-0.5 leading-none">🔒</span>
          <span className="text-[7px] sm:text-[10.5px] font-bold text-white tracking-tight leading-none uppercase">
            HAPİS
          </span>
          <span className="text-[6px] sm:text-[8.5px] text-slate-300 leading-none mt-0.5">Ziyaret</span>
        </div>
      )}

      {isParking && (
        <div className="flex-1 flex flex-col items-center justify-center p-0.5 sm:p-1 text-center relative z-10">
          <span className="text-sm sm:text-2xl mb-0.5 leading-none">🅿️</span>
          <span className="text-[7px] sm:text-[10.5px] font-bold text-white tracking-tight leading-none uppercase">
            OTOPARK
          </span>
          <span className="text-[6px] sm:text-[8.5px] text-emerald-200 leading-none mt-0.5">Ücretsiz</span>
        </div>
      )}

      {isGoToJail && (
        <div className="flex-1 flex flex-col items-center justify-center p-0.5 sm:p-1 text-center relative z-10">
          <span className="text-sm sm:text-2xl mb-0.5 animate-pulse leading-none">🚨</span>
          <span className="text-[7px] sm:text-[10.5px] font-bold text-white tracking-tight leading-none uppercase">
            KODESE GİT
          </span>
        </div>
      )}

      {/* Special Graphic for TAX */}
      {isTax && (
        <div className="flex-1 flex flex-col items-center justify-center p-0.5 sm:p-1 text-center relative z-10">
          <span className="text-xs sm:text-xl mb-0.5 leading-none">{tile.icon || '🏛️'}</span>
          <span className="text-[6.5px] sm:text-[9.5px] font-black text-white tracking-tight leading-none uppercase truncate max-w-full px-0.5">
            {tile.name}
          </span>
          <span className="text-[6px] sm:text-[8.5px] font-bold text-rose-300 mt-0.5 leading-none">
            -₺{tile.taxAmount || 100}
          </span>
        </div>
      )}

      {/* 7. Property / Station Content: Tokens on Upper Half, City Name + Price on Lower Half */}
      {(isProperty || isStation) ? (
        <div className="flex-1 flex flex-col justify-between items-center p-0.5 sm:p-1 text-center relative z-10 min-h-0 w-full">
          {/* Player Tokens positioned ABOVE city name */}
          <div className="flex-1 flex items-center justify-center w-full min-h-[14px] sm:min-h-[22px]">
            {playersOnTile.length > 0 && (
              <div className="flex flex-row items-center justify-center gap-0.5 sm:gap-1 max-w-full flex-wrap z-30">
                {playersOnTile.map((p) => {
                  const isMe = myPlayerId ? p.id === myPlayerId : false;
                  return (
                    <div
                      key={p.id}
                      title={p.name}
                      className="w-3.5 h-3.5 sm:w-6 sm:h-6 rounded-full bg-slate-900 border sm:border-2 shadow-xl flex items-center justify-center text-[9px] sm:text-xs relative shrink-0 transition-transform duration-200"
                      style={{
                        borderColor: p.color,
                        boxShadow: `0 0 6px ${p.color}`,
                      }}
                    >
                      {p.avatar}

                      {/* Red Pin placed exactly on top of the user's token */}
                      {isMe && (
                        <div className="absolute -top-2.5 sm:-top-4.5 left-1/2 -translate-x-1/2 z-40 pointer-events-none animate-bounce drop-shadow-[0_2px_4px_rgba(239,68,68,0.8)]">
                          <img
                            src="/pin.png"
                            alt="Konumunuz"
                            className="w-3 h-3 sm:w-4.5 sm:h-4.5 object-contain"
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
            <span className="font-extrabold text-[7px] sm:text-[10.5px] md:text-xs text-white tracking-tight leading-tight group-hover:text-amber-300 transition drop-shadow uppercase truncate w-full text-center px-0.5">
              {tile.name}
            </span>

            {tile.price && (
              <div className="inline-flex items-center gap-0.5 mt-0.5 bg-slate-950/90 px-1 py-0.2 rounded border border-amber-500/30 shadow">
                <span className="text-[6.5px] sm:text-[9.5px] font-black text-amber-300 leading-none">
                  ₺{tile.price}
                </span>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* For Corners and Special Tiles, render tokens around the bottom/center with pin attached */
        playersOnTile.length > 0 && (
          <div className="absolute bottom-0.5 sm:bottom-1 left-1/2 -translate-x-1/2 flex flex-row items-center justify-center gap-0.5 sm:gap-1 z-30">
            {playersOnTile.map((p) => {
              const isMe = myPlayerId ? p.id === myPlayerId : false;
              return (
                <div
                  key={p.id}
                  title={p.name}
                  className="w-3.5 h-3.5 sm:w-6 sm:h-6 rounded-full bg-slate-900 border sm:border-2 shadow-xl flex items-center justify-center text-[9px] sm:text-xs relative shrink-0"
                  style={{
                    borderColor: p.color,
                    boxShadow: `0 0 6px ${p.color}`,
                  }}
                >
                  {p.avatar}

                  {isMe && (
                    <div className="absolute -top-2.5 sm:-top-4.5 left-1/2 -translate-x-1/2 z-40 pointer-events-none animate-bounce drop-shadow-[0_2px_4px_rgba(239,68,68,0.8)]">
                      <img
                        src="/pin.png"
                        alt="Konumunuz"
                        className="w-3 h-3 sm:w-4.5 sm:h-4.5 object-contain"
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
        <div className="absolute inset-0 bg-slate-950/90 z-20 flex items-center justify-center text-[7px] sm:text-[10px] font-black text-amber-400 uppercase tracking-widest backdrop-blur-[2px] rounded-md sm:rounded-xl border border-amber-500/50">
          İPOTEKLİ
        </div>
      )}
    </div>
  );
};
