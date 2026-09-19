import React, { useState } from 'react';
import { BoardTile, Player } from '../types/game';
import { X, Building2, ArrowLeftRight, Home, Lock, Unlock } from 'lucide-react';

interface MyPropertiesModalProps {
  currentPlayer: Player;
  players: Player[];
  board: BoardTile[];
  onClose: () => void;
  onOpenTradeForTile: (tile: BoardTile) => void;
  onBuildHouse: (tileId: number) => void;
  onToggleMortgage: (tileId: number) => void;
  onSellToBank?: (tileId: number) => void;
}

export const MyPropertiesModal: React.FC<MyPropertiesModalProps> = ({
  currentPlayer,
  players,
  board,
  onClose,
  onOpenTradeForTile,
  onBuildHouse,
  onToggleMortgage,
  onSellToBank,
}) => {
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>(currentPlayer.id);

  const activePlayer = players.find((p) => p.id === selectedPlayerId) || currentPlayer;
  const ownedTiles = board.filter(
    (t) => t.ownerId === selectedPlayerId && (t.type === 'property' || t.type === 'station')
  );

  const isCurrentMe = selectedPlayerId === currentPlayer.id;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in select-none">
      <div className="bg-[#0b1325] border border-slate-700/80 rounded-3xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden shadow-2xl">
        
        {/* Header */}
        <div className="p-4 px-6 flex items-center justify-between border-b border-slate-800 bg-slate-900/90 shrink-0">
          <div className="flex items-center gap-2 text-amber-400 font-extrabold text-lg">
            <Building2 className="w-5 h-5" />
            <span>Mülk Portföyü & Tapu Listesi</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full bg-slate-950/70 text-slate-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Player Switcher Tabs */}
        <div className="flex items-center gap-2 p-3 px-6 bg-slate-950/80 border-b border-slate-800 overflow-x-auto shrink-0">
          {players.map((p) => {
            const isSelected = p.id === selectedPlayerId;
            const pCount = board.filter((t) => t.ownerId === p.id).length;

            return (
              <button
                key={p.id}
                onClick={() => setSelectedPlayerId(p.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                  isSelected
                    ? 'bg-amber-500 text-slate-950 shadow-md font-black'
                    : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                <span>{p.avatar}</span>
                <span>{p.name}</span>
                {p.id === currentPlayer.id && <span className="text-[9px] opacity-75">(Siz)</span>}
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/30 font-extrabold">
                  {pCount}
                </span>
              </button>
            );
          })}
        </div>

        {/* Property Grid List */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-3">
          {ownedTiles.length === 0 ? (
            <div className="text-center py-12 space-y-2">
              <Building2 className="w-12 h-12 text-slate-600 mx-auto" />
              <p className="text-sm text-slate-400 font-bold">
                {activePlayer.name} henüz herhangi bir şehre veya iskeleye sahip değil.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {ownedTiles.map((tile) => (
                <div
                  key={tile.id}
                  className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3.5 flex flex-col justify-between space-y-3 hover:border-slate-700 transition shadow-lg"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-black text-sm text-white block uppercase">
                        {tile.name}
                      </span>
                      <span className="text-[10px] text-slate-400 font-semibold">
                        {tile.type === 'station' ? 'Vapur İskelesi' : `${tile.colorGroup} Grubu`}
                      </span>
                    </div>

                    <span className="text-xs font-black text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-lg border border-amber-500/30">
                      ₺{tile.price}
                    </span>
                  </div>

                  {/* Houses & Mortgage Status */}
                  <div className="flex items-center justify-between text-xs text-slate-300 bg-slate-900/60 p-2 rounded-xl">
                    <span>
                      {tile.houses === 5
                        ? '🏨 1 Otel'
                        : tile.houses > 0
                        ? `🏠 ${tile.houses} Ev`
                        : 'Arsa'}
                    </span>
                    {tile.isMortgaged ? (
                      <span className="text-rose-400 font-bold text-[10px]">İPOTEKLİ</span>
                    ) : (
                      <span className="text-emerald-400 font-bold text-[10px]">AKTİF</span>
                    )}
                  </div>

                  {/* Action Buttons: Takas & Ev Dik & İpotek */}
                  <div className="flex items-center gap-1.5 pt-1">
                    {/* Takas Button */}
                    <button
                      onClick={() => {
                        onClose();
                        onOpenTradeForTile(tile);
                      }}
                      className="flex-1 bg-indigo-950/80 hover:bg-indigo-900 text-indigo-300 hover:text-white font-bold py-2 px-2 rounded-xl border border-indigo-700/60 transition text-[11px] flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <ArrowLeftRight className="w-3.5 h-3.5 text-amber-400" />
                      <span>Takas Et</span>
                    </button>

                    {/* Manage if Mine */}
                    {isCurrentMe && tile.type === 'property' && tile.houseCost && tile.houses < 5 && (
                      <button
                        onClick={() => onBuildHouse(tile.id)}
                        className="p-2 bg-slate-900 hover:bg-slate-800 text-amber-400 rounded-xl border border-amber-500/30 transition text-xs cursor-pointer"
                        title="Ev Dik"
                      >
                        <Home className="w-4 h-4" />
                      </button>
                    )}

                    {isCurrentMe && (
                      <button
                        onClick={() => onToggleMortgage(tile.id)}
                        className="p-2 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-xl border border-slate-700 transition text-xs cursor-pointer"
                        title={tile.isMortgaged ? 'İpoteği Kaldır' : 'İpotek Ettir'}
                      >
                        {tile.isMortgaged ? (
                          <Unlock className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <Lock className="w-4 h-4 text-amber-400" />
                        )}
                      </button>
                    )}

                    {isCurrentMe && onSellToBank && tile.price && (
                      <button
                        onClick={() => onSellToBank(tile.id)}
                        className="px-2 py-1.5 bg-rose-950/70 hover:bg-rose-900 text-rose-300 rounded-xl border border-rose-800/60 transition text-[10px] font-bold cursor-pointer"
                        title={`Bankaya 2/3 Fiyatına Sat (+₺${Math.floor(tile.price * (2/3)) + (tile.houses > 0 && tile.houseCost ? Math.floor(tile.houses * tile.houseCost * 0.5) : 0)})`}
                      >
                        🏛️ 2/3 Sat
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
