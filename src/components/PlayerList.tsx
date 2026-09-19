import React from 'react';
import { Player, BoardTile } from '../types/game';
import { Coins, Home, Bot, Lock } from 'lucide-react';

interface PlayerListProps {
  players: Player[];
  currentTurnIndex: number;
  board: BoardTile[];
  myPlayerId: string | null;
}

export const PlayerList: React.FC<PlayerListProps> = ({
  players,
  currentTurnIndex,
  board,
  myPlayerId,
}) => {
  return (
    <div className="bg-[#0b1222]/90 border border-slate-800/90 rounded-2xl p-3 shadow-xl flex flex-col h-full max-h-[calc(100vh-85px)] select-none backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2 shrink-0">
        <span className="text-[11px] font-black text-amber-400 uppercase tracking-wider">
          Oyuncular Durumu
        </span>
        <span className="text-[10px] text-emerald-400 font-bold bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-800/50">
          {players.length} Oyuncu
        </span>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0">
        {players.map((p, index) => {
          const isTurn = index === currentTurnIndex;
          const ownedPropertiesCount = board.filter((t) => t.ownerId === p.id).length;
          const currentTileName = board[p.position]?.name || 'Başlangıç';

          return (
            <div
              key={p.id}
              className={`p-2 rounded-xl border transition flex items-center justify-between ${
                isTurn
                  ? 'bg-amber-500/15 border-amber-400/80 ring-1 ring-amber-400/50'
                  : 'bg-[#070b14]/80 border-slate-800/80 hover:border-slate-700'
              } ${!p.inGame ? 'opacity-40 grayscale' : ''}`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xl shrink-0">{p.avatar}</span>
                <div className="min-w-0">
                  <div className="flex items-center gap-1 font-extrabold text-xs text-white truncate">
                    <span className="truncate">{p.name}</span>
                    {p.id === myPlayerId && (
                      <span className="text-[8px] bg-rose-500 text-white font-black px-1 rounded shrink-0">
                        SİZ
                      </span>
                    )}
                    {p.isBot && <Bot className="w-3 h-3 text-emerald-400 shrink-0" />}
                    {p.isJailed && <Lock className="w-3 h-3 text-red-400 shrink-0" />}
                  </div>
                  <div className="text-[9px] text-slate-400 truncate mt-0.5">
                    📍 {currentTileName}
                  </div>
                </div>
              </div>

              <div className="text-right shrink-0 pl-2">
                <div className="font-black text-xs text-amber-300 flex items-center justify-end gap-0.5">
                  <Coins className="w-3 h-3 text-amber-400" />
                  ₺{p.money.toLocaleString('tr-TR')}
                </div>
                <div className="text-[9px] text-slate-400 flex items-center justify-end gap-0.5 mt-0.5">
                  <Home className="w-2.5 h-2.5 text-sky-400" />
                  {ownedPropertiesCount} Mülk
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
