import React from 'react';
import { BoardTile, Player } from '../types/game';
import { X, Home, Lock, Unlock, ShoppingBag, CheckCircle, AlertCircle, Anchor } from 'lucide-react';
import { hasColorGroupMonopoly } from '../engine/gameEngine';
import { useLanguage } from '../i18n/LanguageContext';

interface PropertyModalProps {
  tile: BoardTile;
  owner?: Player;
  currentPlayer: Player;
  board: BoardTile[];
  players: Player[];
  onClose: () => void;
  onBuy?: () => void;
  onBuildHouse?: () => void;
  onSellHouse?: () => void;
  onToggleMortgage?: () => void;
  onSellToBank?: (tileId: number) => void;
  onStartTrade?: (tile: BoardTile) => void;
  canBuy?: boolean;
}

export const PropertyModal: React.FC<PropertyModalProps> = ({
  tile,
  owner,
  currentPlayer,
  board,
  players,
  onClose,
  onBuy,
  onBuildHouse,
  onSellHouse,
  onToggleMortgage,
  onSellToBank,
  onStartTrade,
  canBuy
}) => {
  const { t, language, formatMoney, translateTile } = useLanguage();
  const isOwner = tile.ownerId === currentPlayer.id;
  const isStation = tile.type === 'station';
  const ownsFullSeries = isOwner && !isStation && hasColorGroupMonopoly(board, tile.colorGroup, currentPlayer.id);
  const translated = translateTile(tile);
  
  // Color group cities breakdown
  const sameGroupTiles = board.filter(t => t.colorGroup === tile.colorGroup);
  const ownedInGroupCount = sameGroupTiles.filter(t => t.ownerId === currentPlayer.id).length;

  // Station info
  const allStations = board.filter(t => t.type === 'station');
  const ownerStationsCount = owner ? allStations.filter(t => t.ownerId === owner.id).length : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 pt-[max(calc(1rem+env(safe-area-inset-top,0px)),1rem)] pb-[max(calc(1rem+env(safe-area-inset-bottom,0px)),1rem)] bg-slate-950/80 backdrop-blur-md animate-fade-in select-none">
      <div className="bg-[#0b1325] border border-slate-700/80 rounded-3xl max-w-sm w-full max-h-[calc(90dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))] flex flex-col overflow-hidden shadow-2xl">
        
        {/* Header Banner */}
        <div className="p-4 text-center font-bold relative bg-slate-900 border-b border-slate-800">
          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-1.5 rounded-full bg-slate-950/70 text-slate-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-center justify-center gap-2">
            {isStation && <Anchor className="w-5 h-5 text-sky-400" />}
            <span className="text-xl text-white font-extrabold tracking-wide">{translated.name}</span>
          </div>
          {translated.subtitle && <p className="text-xs text-slate-400 font-medium mt-0.5">{translated.subtitle}</p>}
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-3.5 max-h-[80vh] overflow-y-auto">
          
          {/* Price & Owner Info Card */}
          <div className="flex items-center justify-between bg-slate-950/80 p-3 rounded-2xl border border-slate-800">
            <div>
              <span className="text-[11px] text-slate-400 block font-semibold">{t('salePrice')}</span>
              <span className="text-lg font-black text-amber-400">
                {tile.price ? formatMoney(tile.price) : t('notForSale')}
              </span>
            </div>
            <div className="text-right">
              <span className="text-[11px] text-slate-400 block font-semibold">{t('ownerLabel')}</span>
              <span className="text-sm font-bold text-white">
                {owner ? `${owner.avatar} ${owner.name}` : t('unownedBank')}
              </span>
            </div>
          </div>

          {/* EXACT CITIES REQUIRED FOR HOUSE BUILDING (Şehir Serisi Gereksinimleri) */}
          {tile.type === 'property' && sameGroupTiles.length > 0 && (
            <div className="bg-slate-950/90 p-3 rounded-2xl border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-amber-400 uppercase tracking-wide">
                  {t('seriesRequiredTitle')}
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-900 border border-slate-700 text-slate-300">
                  {t('ownedCount', { owned: ownedInGroupCount, total: sameGroupTiles.length })}
                </span>
              </div>

              {/* Exact List of Cities in this color group with live owners */}
              <div className="space-y-1.5 pt-1">
                {sameGroupTiles.map((gTile) => {
                  const gOwner = players.find(p => p.id === gTile.ownerId);
                  const isMine = gTile.ownerId === currentPlayer.id;
                  const gTranslated = translateTile(gTile);

                  return (
                    <div
                      key={gTile.id}
                      className={`flex items-center justify-between p-2 rounded-xl text-xs font-semibold border ${
                        isMine
                          ? 'bg-emerald-950/40 border-emerald-700/60 text-emerald-300'
                          : gOwner
                          ? 'bg-rose-950/30 border-rose-800/40 text-rose-300'
                          : 'bg-slate-900/60 border-slate-800 text-slate-400'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span>{isMine ? '✅' : gOwner ? '👤' : '⚪'}</span>
                        <span className="font-bold text-white">{gTranslated.name}</span>
                        {gTile.id === tile.id && (
                          <span className="text-[9px] bg-amber-500/20 text-amber-300 px-1.5 py-0.2 rounded font-black">
                            {language === 'en' ? 'Current' : 'Şu Anki'}
                          </span>
                        )}
                      </div>

                      <div className="text-[11px] font-bold">
                        {isMine ? (
                          <span className="text-emerald-400">{t('youBadge')}</span>
                        ) : gOwner ? (
                          <span className="text-amber-300">{gOwner.name}</span>
                        ) : (
                          <span className="text-slate-500">{t('unownedBank')} ({formatMoney(gTile.price || 0)})</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Explanatory Rule Message */}
              <div className="pt-1 text-[11px] text-slate-300 leading-snug">
                {ownsFullSeries ? (
                  <div className="flex items-center gap-1 text-emerald-400 font-bold">
                    <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      {language === 'en'
                        ? 'Color monopoly completed! You can build houses.'
                        : 'Tüm renk serisi tamamlandı! Ev dikebilirsiniz.'}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-start gap-1 text-amber-300/90 font-medium">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>
                      {language === 'en'
                        ? `To build houses, you must own all cities in this group: `
                        : `Ev dikebilmek için bu gruptaki şehirlerin tamamına sahip olmalısınız: `}
                      <strong>{sameGroupTiles.map(t => translateTile(t).name).join(', ')}</strong>
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Rent Breakdown Table for Properties */}
          {tile.type === 'property' && tile.rent && (
            <div className="space-y-1 bg-slate-950/60 p-3 rounded-2xl border border-slate-800/80 text-xs">
              <span className="text-slate-400 font-bold block mb-1.5">{t('rentScheduleTitle')}</span>
              <div className="flex justify-between text-slate-300">
                <span>{t('baseRent')}:</span>
                <span className="font-bold text-emerald-400">
                  {ownsFullSeries && tile.houses === 0
                    ? `${formatMoney(tile.rent[0] * 2)} (2x)`
                    : formatMoney(tile.rent[0])}
                </span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>{t('with1House')}:</span>
                <span className="font-bold text-emerald-400">{formatMoney(tile.rent[1])}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>{t('with2Houses')}:</span>
                <span className="font-bold text-emerald-400">{formatMoney(tile.rent[2])}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>{t('with3Houses')}:</span>
                <span className="font-bold text-emerald-400">{formatMoney(tile.rent[3])}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>{t('with4Houses')}:</span>
                <span className="font-bold text-emerald-400">{formatMoney(tile.rent[4])}</span>
              </div>
              {tile.rent[5] && (
                <div className="flex justify-between text-amber-300 font-bold pt-1 border-t border-slate-800">
                  <span>🏨 {t('withHotel')}:</span>
                  <span>{formatMoney(tile.rent[5])}</span>
                </div>
              )}
            </div>
          )}

          {/* Rent Breakdown Table for Stations (İskele) */}
          {isStation && (
            <div className="space-y-1.5 bg-slate-950/60 p-3 rounded-2xl border border-slate-800/80 text-xs">
              <span className="text-slate-400 font-bold block mb-1">{t('stationRentNote')}</span>
              <div className={`flex justify-between ${ownerStationsCount === 1 ? 'text-amber-400 font-bold' : 'text-slate-300'}`}>
                <span>⚓ {t('stationOwnedRent', { count: 1 })}:</span>
                <span className="font-bold text-emerald-400">{formatMoney(50)}</span>
              </div>
              <div className={`flex justify-between ${ownerStationsCount === 2 ? 'text-amber-400 font-bold' : 'text-slate-300'}`}>
                <span>⚓⚓ {t('stationOwnedRent', { count: 2 })}:</span>
                <span className="font-bold text-emerald-400">{formatMoney(100)}</span>
              </div>
              <div className={`flex justify-between ${ownerStationsCount === 3 ? 'text-amber-400 font-bold' : 'text-slate-300'}`}>
                <span>⚓⚓⚓ {t('stationOwnedRent', { count: 3 })}:</span>
                <span className="font-bold text-emerald-400">{formatMoney(150)}</span>
              </div>
              <div className={`flex justify-between ${ownerStationsCount === 4 ? 'text-amber-400 font-bold' : 'text-slate-300'}`}>
                <span>⚓⚓⚓⚓ {t('stationOwnedRent', { count: 4 })}:</span>
                <span className="font-bold text-emerald-400">{formatMoney(200)}</span>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="space-y-2 pt-1">
            {canBuy && onBuy && !tile.ownerId && (
              <button
                onClick={onBuy}
                disabled={currentPlayer.money < (tile.price || 0)}
                className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 disabled:opacity-50 text-slate-950 font-black py-3 rounded-xl shadow-lg transition flex items-center justify-center gap-2 text-sm cursor-pointer"
              >
                <ShoppingBag className="w-4 h-4" />
                {t('buyPropertyBtn', { price: formatMoney(tile.price || 0) })}
              </button>
            )}

            {isOwner && onBuildHouse && tile.type === 'property' && tile.houseCost && tile.houses < 5 && (
              <button
                onClick={onBuildHouse}
                disabled={!ownsFullSeries || currentPlayer.money < tile.houseCost}
                className="w-full bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-amber-300 font-black py-2.5 rounded-xl border border-amber-500/30 transition flex items-center justify-center gap-2 text-sm cursor-pointer"
              >
                <Home className="w-4 h-4" />
                {!ownsFullSeries 
                  ? (language === 'en' ? 'Own All Cities to Build Houses' : 'Ev Dikmek İçin Tüm Şehirleri Alın')
                  : t('buildHouseBtn', { cost: formatMoney(tile.houseCost) })
                }
              </button>
            )}

            {isOwner && onSellHouse && tile.type === 'property' && tile.houseCost && tile.houses > 0 && (
              <button
                onClick={onSellHouse}
                className="w-full bg-slate-900 hover:bg-slate-800 text-rose-300 font-bold py-2 rounded-xl border border-rose-500/30 transition flex items-center justify-center gap-2 text-xs cursor-pointer"
              >
                <span>🏚️ {t('sellHouseBtn', { gain: formatMoney(Math.floor(tile.houseCost / 2)) })}</span>
              </button>
            )}

            {isOwner && onToggleMortgage && (
              <button
                onClick={onToggleMortgage}
                className="w-full bg-slate-950 hover:bg-slate-900 text-slate-300 font-bold py-2.5 rounded-xl border border-slate-800 transition flex items-center justify-center gap-2 text-xs cursor-pointer"
              >
                {tile.isMortgaged ? (
                  <>
                    <Unlock className="w-4 h-4 text-emerald-400" />
                    {t('unmortgageBtn', { amount: formatMoney(Math.floor((tile.price || 0) * 0.55)) })}
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4 text-amber-400" />
                    {t('mortgageBtn', { amount: formatMoney(Math.floor((tile.price || 0) * 0.5)) })}
                  </>
                )}
              </button>
            )}

            {/* Quick Trade Offer Option for this Tile (My Property) */}
            {isOwner && onStartTrade && (
              <button
                onClick={() => onStartTrade(tile)}
                className="w-full bg-indigo-950/80 hover:bg-indigo-900 text-indigo-200 font-bold py-2 rounded-xl border border-indigo-700/60 transition flex items-center justify-center gap-1.5 text-xs cursor-pointer active:scale-95"
              >
                <span>🔄 {t('proposeTradeBtn')}</span>
              </button>
            )}

            {/* Trade Offer to Owner (Other Player's Property) */}
            {!isOwner && tile.ownerId && onStartTrade && (
              <button
                onClick={() => onStartTrade(tile)}
                className="w-full bg-gradient-to-r from-amber-500/20 to-amber-600/20 hover:from-amber-500/30 hover:to-amber-600/30 text-amber-300 font-bold py-2.5 rounded-xl border border-amber-500/40 transition flex items-center justify-center gap-1.5 text-xs cursor-pointer active:scale-95"
              >
                <span>🤝 {t('proposeTradeBtn')} ({owner?.name || ''})</span>
              </button>
            )}

            {/* Sell to Bank for 2/3 value */}
            {isOwner && onSellToBank && tile.price && (
              <button
                onClick={() => {
                  onSellToBank(tile.id);
                  onClose();
                }}
                className="w-full bg-rose-950/70 hover:bg-rose-900 text-rose-300 font-bold py-2 rounded-xl border border-rose-800/60 transition flex items-center justify-center gap-1.5 text-xs cursor-pointer"
              >
                <span>🏛️ {t('sellToBankBtn', { amount: formatMoney(Math.floor(tile.price * (2 / 3)) + (tile.houses > 0 && tile.houseCost ? Math.floor(tile.houses * tile.houseCost * 0.5) : 0)) })}</span>
              </button>
            )}
          </div>

        </div>

      </div>
    </div>
  );
};
