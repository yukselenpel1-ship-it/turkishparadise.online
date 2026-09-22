import React, { useState } from 'react';
import { BoardTile, Player, TradeOffer } from '../types/game';
import { X, ArrowLeftRight, Building2, Check } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

interface TradeModalProps {
  currentPlayer: Player;
  players: Player[];
  board: BoardTile[];
  initialOfferedTile?: BoardTile;
  initialTargetPlayerId?: string;
  onClose: () => void;
  onExecuteTrade: (offer: TradeOffer) => void;
}

export const TradeModal: React.FC<TradeModalProps> = ({
  currentPlayer,
  players,
  board,
  initialOfferedTile,
  initialTargetPlayerId,
  onClose,
  onExecuteTrade,
}) => {
  const { t, formatMoney, translateTile, language } = useLanguage();
  const otherPlayers = players.filter((p) => p.id !== currentPlayer.id && p.inGame);
  
  const isInitialTileMine = initialOfferedTile ? initialOfferedTile.ownerId === currentPlayer.id : false;
  const defaultTargetId = initialTargetPlayerId || (
    initialOfferedTile && !isInitialTileMine && initialOfferedTile.ownerId
      ? initialOfferedTile.ownerId
      : (otherPlayers[0]?.id || '')
  );

  const [selectedTargetPlayerId, setSelectedTargetPlayerId] = useState<string>(defaultTargetId);
  const [selectedMyTileIds, setSelectedMyTileIds] = useState<number[]>(
    initialOfferedTile && isInitialTileMine ? [initialOfferedTile.id] : []
  );
  const [offeredMoney, setOfferedMoney] = useState<number>(0);

  const [selectedTargetTileIds, setSelectedTargetTileIds] = useState<number[]>(
    initialOfferedTile && !isInitialTileMine ? [initialOfferedTile.id] : []
  );
  const [requestedMoney, setRequestedMoney] = useState<number>(0);

  const targetPlayer = players.find((p) => p.id === selectedTargetPlayerId);

  // Filter properties
  const myProperties = board.filter(
    (t) => t.ownerId === currentPlayer.id && (t.type === 'property' || t.type === 'station')
  );
  const targetProperties = board.filter(
    (t) => t.ownerId === selectedTargetPlayerId && (t.type === 'property' || t.type === 'station')
  );

  const toggleMyTile = (tileId: number) => {
    setSelectedMyTileIds((prev) =>
      prev.includes(tileId) ? prev.filter((id) => id !== tileId) : [...prev, tileId]
    );
  };

  const toggleTargetTile = (tileId: number) => {
    setSelectedTargetTileIds((prev) =>
      prev.includes(tileId) ? prev.filter((id) => id !== tileId) : [...prev, tileId]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTargetPlayerId) return;

    const offer: TradeOffer = {
      fromPlayerId: currentPlayer.id,
      toPlayerId: selectedTargetPlayerId,
      offeredTileIds: selectedMyTileIds,
      offeredMoney: Math.max(0, Math.min(offeredMoney, currentPlayer.money)),
      requestedTileIds: selectedTargetTileIds,
      requestedMoney: Math.max(0, requestedMoney),
    };

    onExecuteTrade(offer);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 pt-[max(calc(1rem+env(safe-area-inset-top,0px)),1rem)] pb-[max(calc(1rem+env(safe-area-inset-bottom,0px)),1rem)] bg-slate-950/85 backdrop-blur-md animate-fade-in select-none">
      <div className="bg-[#0b1325] border border-slate-700/80 rounded-3xl max-w-2xl w-full max-h-[calc(90dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))] flex flex-col overflow-hidden shadow-2xl">
        
        {/* Header */}
        <div className="p-4 px-6 flex items-center justify-between border-b border-slate-800 bg-slate-900/90 shrink-0">
          <div className="flex items-center gap-2 text-amber-400 font-extrabold text-lg">
            <ArrowLeftRight className="w-5 h-5" />
            <span>{t('tradeTitle')}</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full bg-slate-950/70 text-slate-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-5">
          
          {/* Step 1: Select Target Player */}
          <div className="space-y-2">
            <label className="text-xs font-black uppercase tracking-wider text-slate-300 block">
              1. {t('tradeWithLabel')}
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {otherPlayers.map((p) => {
                const isSelected = p.id === selectedTargetPlayerId;
                const propCount = board.filter((t) => t.ownerId === p.id).length;

                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setSelectedTargetPlayerId(p.id);
                      setSelectedTargetTileIds([]);
                    }}
                    className={`p-3 rounded-2xl border text-left transition flex items-center justify-between cursor-pointer ${
                      isSelected
                        ? 'bg-amber-500/20 border-amber-400 ring-2 ring-amber-400/50 shadow-lg'
                        : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{p.avatar}</span>
                      <div>
                        <div className="font-bold text-xs text-white">{p.name}</div>
                        <div className="text-[10px] text-amber-300 font-extrabold">{formatMoney(p.money)}</div>
                      </div>
                    </div>
                    <span className="text-[10px] bg-slate-900 px-2 py-0.5 rounded-full text-slate-400 border border-slate-800">
                      {t('propertyCount', { count: propCount })}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 2: Trade Exchange Columns (Give vs Receive) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
            
            {/* Left Box: What You Give (Sizin Teklifiniz) */}
            <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                <span className="text-xs font-black uppercase tracking-wide text-emerald-400 flex items-center gap-1.5">
                  <Building2 className="w-4 h-4" /> {t('myOfferedProperties')}
                </span>
                <span className="text-[10px] text-slate-400 font-bold">
                  {selectedMyTileIds.length} {language === 'en' ? 'Selected' : 'Seçili'}
                </span>
              </div>

              {/* My Properties List */}
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1 min-h-[100px]">
                {myProperties.length === 0 ? (
                  <div className="text-center py-6 text-xs text-slate-500 font-semibold">
                    {t('noPropertiesToTrade')}
                  </div>
                ) : (
                  myProperties.map((tile) => {
                    const isSelected = selectedMyTileIds.includes(tile.id);
                    const translated = translateTile(tile);

                    return (
                      <div
                        key={tile.id}
                        onClick={() => toggleMyTile(tile.id)}
                        className={`p-2 rounded-xl border text-xs flex items-center justify-between cursor-pointer transition ${
                          isSelected
                            ? 'bg-emerald-950/60 border-emerald-500 text-white font-bold'
                            : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-3.5 h-3.5 rounded-md flex items-center justify-center text-[10px] border ${
                              isSelected ? 'bg-emerald-500 border-emerald-400 text-slate-950' : 'border-slate-700'
                            }`}
                          >
                            {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                          </div>
                          <span>{translated.name}</span>
                        </div>
                        <span className="text-amber-300 font-bold">{tile.price ? formatMoney(tile.price) : ''}</span>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Extra Cash to Offer */}
              <div className="pt-2 border-t border-slate-800/80">
                <label className="text-[11px] font-bold text-slate-300 flex items-center justify-between mb-1">
                  <span>{t('myOfferedMoney')}</span>
                  <span className="text-emerald-400 font-bold">{formatMoney(currentPlayer.money)}</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max={currentPlayer.money}
                    step="10"
                    value={offeredMoney || ''}
                    onChange={(e) => setOfferedMoney(Number(e.target.value))}
                    placeholder="0"
                    className="w-full bg-slate-900 border border-slate-800 focus:border-amber-400 text-white rounded-xl px-3 py-2 text-xs font-bold outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Right Box: What You Request (Karşıdan İstediğiniz) */}
            <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                <span className="text-xs font-black uppercase tracking-wide text-amber-400 flex items-center gap-1.5">
                  <Building2 className="w-4 h-4" /> {t('theirRequestedProperties')}
                </span>
                <span className="text-[10px] text-slate-400 font-bold">
                  {selectedTargetTileIds.length} {language === 'en' ? 'Selected' : 'Seçili'}
                </span>
              </div>

              {/* Target Player Properties List */}
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1 min-h-[100px]">
                {targetProperties.length === 0 ? (
                  <div className="text-center py-6 text-xs text-slate-500 font-semibold">
                    {t('noPropertiesToTrade')}
                  </div>
                ) : (
                  targetProperties.map((tile) => {
                    const isSelected = selectedTargetTileIds.includes(tile.id);
                    const translated = translateTile(tile);

                    return (
                      <div
                        key={tile.id}
                        onClick={() => toggleTargetTile(tile.id)}
                        className={`p-2 rounded-xl border text-xs flex items-center justify-between cursor-pointer transition ${
                          isSelected
                            ? 'bg-amber-950/60 border-amber-500 text-white font-bold'
                            : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-3.5 h-3.5 rounded-md flex items-center justify-center text-[10px] border ${
                              isSelected ? 'bg-amber-500 border-amber-400 text-slate-950' : 'border-slate-700'
                            }`}
                          >
                            {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                          </div>
                          <span>{translated.name}</span>
                        </div>
                        <span className="text-amber-300 font-bold">{tile.price ? formatMoney(tile.price) : ''}</span>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Extra Cash to Request */}
              <div className="pt-2 border-t border-slate-800/80">
                <label className="text-[11px] font-bold text-slate-300 flex items-center justify-between mb-1">
                  <span>{t('theirRequestedMoney')}</span>
                  <span className="text-amber-300 font-bold">
                    {targetPlayer ? `(Kasa: ${formatMoney(targetPlayer.money)})` : ''}
                  </span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step="10"
                    value={requestedMoney || ''}
                    onChange={(e) => setRequestedMoney(Number(e.target.value))}
                    placeholder="0"
                    className="w-full bg-slate-900 border border-slate-800 focus:border-amber-400 text-white rounded-xl px-3 py-2 text-xs font-bold outline-none"
                  />
                </div>
              </div>
            </div>

          </div>

          {/* Submit Action Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={
                !selectedTargetPlayerId ||
                (selectedMyTileIds.length === 0 &&
                  offeredMoney === 0 &&
                  selectedTargetTileIds.length === 0 &&
                  requestedMoney === 0)
              }
              className="w-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 hover:from-amber-300 hover:to-amber-500 disabled:opacity-40 text-slate-950 font-black py-3.5 rounded-2xl shadow-xl transition flex items-center justify-center gap-2 text-sm tracking-wide uppercase cursor-pointer disabled:cursor-not-allowed"
            >
              <ArrowLeftRight className="w-4 h-4" />
              <span>{t('sendOfferBtn')}</span>
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
