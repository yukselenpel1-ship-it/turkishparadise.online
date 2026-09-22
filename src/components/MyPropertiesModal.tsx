import React, { useState } from 'react';
import { BoardTile, Player } from '../types/game';
import { X, Building2, Home, Lock, Unlock } from 'lucide-react';
import { hasColorGroupMonopoly } from '../engine/gameEngine';
import { useLanguage } from '../i18n/LanguageContext';

interface MyPropertiesModalProps {
  currentPlayer: Player;
  players: Player[];
  board: BoardTile[];
  onClose: () => void;
  onOpenTradeForTile: (tile: BoardTile) => void;
  onBuildHouse: (tileId: number) => void;
  onSellHouse?: (tileId: number) => void;
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
  onSellHouse,
  onToggleMortgage,
  onSellToBank,
}) => {
  const { t, formatMoney, translateTile, language } = useLanguage();
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>(currentPlayer.id);

  const activePlayer = players.find((p) => p.id === selectedPlayerId) || currentPlayer;
  const ownedTiles = board.filter(
    (t) => t.ownerId === selectedPlayerId && (t.type === 'property' || t.type === 'station')
  );

  const isCurrentMe = selectedPlayerId === currentPlayer.id;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 pt-[max(calc(1rem+env(safe-area-inset-top,0px)),1rem)] pb-[max(calc(1rem+env(safe-area-inset-bottom,0px)),1rem)] bg-slate-950/85 backdrop-blur-md animate-fade-in select-none">
      <div className="bg-[#0b1325] border border-slate-700/80 rounded-3xl max-w-2xl w-full max-h-[calc(88dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))] flex flex-col overflow-hidden shadow-2xl">
        
        {/* Header */}
        <div className="p-4 px-6 flex items-center justify-between border-b border-slate-800 bg-slate-900/90 shrink-0">
          <div className="flex items-center gap-2 text-amber-400 font-extrabold text-lg">
            <Building2 className="w-5 h-5" />
            <span>{t('myPropertiesTitle')}</span>
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
                {p.id === currentPlayer.id && <span className="text-[9px] opacity-75">({t('youBadge')})</span>}
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
                {t('noPropertiesOwned', { name: activePlayer.name })}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {ownedTiles.map((tile) => {
                const translated = translateTile(tile);
                const isStation = tile.type === 'station';
                const hasMonopoly = !isStation && hasColorGroupMonopoly(board, tile.colorGroup, activePlayer.id);

                return (
                  <div
                    key={tile.id}
                    className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3.5 flex flex-col justify-between space-y-3 hover:border-slate-700 transition shadow-lg"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-extrabold text-sm text-white">{translated.name}</span>
                          {tile.isMortgaged && (
                            <span className="text-[9px] font-black bg-rose-500/20 text-rose-400 border border-rose-500/40 px-1.5 py-0.2 rounded">
                              {t('mortgagedTag')}
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-400 font-semibold block mt-0.5">
                          {tile.price ? formatMoney(tile.price) : ''}
                        </span>
                      </div>

                      {/* House Badges */}
                      {tile.type === 'property' && (
                        <div className="flex items-center gap-1 shrink-0">
                          {tile.houses === 5 ? (
                            <span className="text-xs font-black bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded-lg">
                              {t('hotelBadge')}
                            </span>
                          ) : tile.houses > 0 ? (
                            <span className="text-xs font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded-lg">
                              {t('housesCountBadge', { count: tile.houses })}
                            </span>
                          ) : hasMonopoly ? (
                            <span className="text-[10px] font-bold bg-sky-500/20 text-sky-300 border border-sky-500/30 px-1.5 py-0.5 rounded-lg">
                              {language === 'en' ? 'Monopoly' : 'Tam Seri'}
                            </span>
                          ) : null}
                        </div>
                      )}
                    </div>

                    {/* Actions if current viewing player is me */}
                    {isCurrentMe && (
                      <div className="grid grid-cols-2 gap-1.5 pt-1 border-t border-slate-800/80">
                        {tile.type === 'property' && tile.houseCost && tile.houses < 5 && (
                          <button
                            onClick={() => onBuildHouse(tile.id)}
                            disabled={!hasMonopoly || currentPlayer.money < tile.houseCost}
                            className="bg-slate-900 hover:bg-slate-850 disabled:opacity-40 text-amber-300 text-[10.5px] font-bold py-1.5 px-2 rounded-xl border border-amber-500/20 transition flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <Home className="w-3 h-3" />
                            <span>{t('buildHouseBtn', { cost: formatMoney(tile.houseCost) })}</span>
                          </button>
                        )}

                        {tile.type === 'property' && tile.houseCost && tile.houses > 0 && onSellHouse && (
                          <button
                            onClick={() => onSellHouse(tile.id)}
                            className="bg-slate-900 hover:bg-slate-850 text-rose-300 text-[10.5px] font-bold py-1.5 px-2 rounded-xl border border-rose-500/20 transition flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <span>{t('sellHouseBtn', { gain: formatMoney(Math.floor(tile.houseCost / 2)) })}</span>
                          </button>
                        )}

                        <button
                          onClick={() => onToggleMortgage(tile.id)}
                          className="bg-slate-900 hover:bg-slate-850 text-slate-300 text-[10.5px] font-bold py-1.5 px-2 rounded-xl border border-slate-800 transition flex items-center justify-center gap-1 cursor-pointer"
                        >
                          {tile.isMortgaged ? (
                            <>
                              <Unlock className="w-3 h-3 text-emerald-400" />
                              <span>{t('unmortgageBtn', { amount: formatMoney(Math.floor((tile.price || 0) * 0.55)) })}</span>
                            </>
                          ) : (
                            <>
                              <Lock className="w-3 h-3 text-amber-400" />
                              <span>{t('mortgageBtn', { amount: formatMoney(Math.floor((tile.price || 0) * 0.5)) })}</span>
                            </>
                          )}
                        </button>

                        <button
                          onClick={() => {
                            onClose();
                            onOpenTradeForTile(tile);
                          }}
                          className="bg-indigo-950/60 hover:bg-indigo-900 text-indigo-300 text-[10.5px] font-bold py-1.5 px-2 rounded-xl border border-indigo-700/40 transition flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <span>{t('proposeTradeBtn')}</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 px-6 border-t border-slate-800 bg-slate-900/60 flex items-center justify-between text-xs text-slate-400 shrink-0">
          <span>{t('propertyCount', { count: ownedTiles.length })}</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl transition cursor-pointer"
          >
            {t('closeBtn')}
          </button>
        </div>

      </div>
    </div>
  );
};
