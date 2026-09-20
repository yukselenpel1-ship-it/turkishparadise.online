import React from 'react';
import { BoardTile, Player } from '../types/game';

interface TileProps {
  tile: BoardTile;
  playersOnTile: Player[];
  owner?: Player;
  myPlayerId?: string | null;
  onClick?: () => void;
  style?: React.CSSProperties;
}

export const Tile: React.FC<TileProps> = ({
  tile,
  playersOnTile,
  owner,
  myPlayerId,
  onClick,
  style
}) => {
  return (
    <div
      onClick={onClick}
      style={{
        ...style,
        ...(owner ? { borderColor: owner.color, boxShadow: `0 0 12px ${owner.color}99` } : {})
      }}
      className={`relative w-full h-full flex flex-col justify-between rounded sm:rounded-lg transition-all duration-150 cursor-pointer select-none overflow-visible group ${
        owner
          ? 'ring-2 border bg-transparent'
          : 'hover:ring-2 hover:ring-amber-400/80 hover:bg-amber-400/10'
      }`}
      title={`${tile.name} ${tile.price ? `(₺${tile.price})` : ''} ${owner ? `• Sahibi: ${owner.name}` : ''}`}
    >
      {/* 1. Owner Badge on Top Right */}
      {owner && (
        <div
          className="absolute -top-1 -right-1 sm:-top-1.5 sm:-right-1.5 z-20 w-3.5 h-3.5 sm:w-5 sm:h-5 rounded-full border-2 border-white shadow-lg flex items-center justify-center text-[8px] sm:text-[11px] animate-fade-in"
          style={{ backgroundColor: owner.color }}
          title={`Sahibi: ${owner.name}`}
        >
          <span>{owner.avatar}</span>
        </div>
      )}

      {/* 2. Houses / Hotel Badges on Top */}
      {tile.houses > 0 && (
        <div className="absolute top-0.5 left-1/2 -translate-x-1/2 z-20 flex items-center gap-0.5 bg-slate-950/85 px-1 py-0.2 rounded-full border border-amber-400/50 shadow-md">
          {tile.houses === 5 ? (
            <span className="text-[8px] sm:text-[11px] font-bold leading-none">🏨</span>
          ) : (
            <span className="text-[7px] sm:text-[9.5px] font-bold leading-none">
              {'🏠'.repeat(tile.houses)}
            </span>
          )}
        </div>
      )}

      {/* 3. Player Tokens and Active Location Pin */}
      {playersOnTile.length > 0 && (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-0.5 pointer-events-none">
          <div className="flex flex-row items-center justify-center gap-0.5 sm:gap-1 max-w-full flex-wrap pointer-events-auto">
            {playersOnTile.map((p) => {
              const isMe = myPlayerId ? p.id === myPlayerId : false;
              return (
                <div
                  key={p.id}
                  title={p.name}
                  className="w-3.5 h-3.5 sm:w-6 sm:h-6 rounded-full bg-slate-900 border sm:border-2 shadow-xl flex items-center justify-center text-[9px] sm:text-xs relative shrink-0 transition-transform duration-200 hover:scale-125"
                  style={{
                    borderColor: p.color,
                    boxShadow: `0 0 8px ${p.color}`,
                  }}
                >
                  {p.avatar}

                  {/* Red Pin placed on top of the active user's token */}
                  {isMe && (
                    <div className="absolute -top-2.5 sm:-top-4.5 left-1/2 -translate-x-1/2 z-40 pointer-events-none animate-bounce drop-shadow-[0_2px_4px_rgba(239,68,68,0.9)]">
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
        </div>
      )}

      {/* 4. Mortgaged Overlay */}
      {tile.isMortgaged && (
        <div className="absolute inset-0 bg-slate-950/90 z-20 flex items-center justify-center text-[7px] sm:text-[10px] font-bold text-amber-400 uppercase tracking-widest backdrop-blur-[2px] rounded border border-amber-500/50">
          İPOTEKLİ
        </div>
      )}
    </div>
  );
};
