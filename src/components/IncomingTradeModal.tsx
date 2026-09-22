import React from 'react';
import { BoardTile, Player, TradeOffer } from '../types/game';
import { ArrowLeftRight, Check, X, Building2, Coins } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

interface IncomingTradeModalProps {
  incomingOffer: TradeOffer & { fromPlayerName: string; fromPlayerAvatar: string };
  currentPlayer: Player;
  players: Player[];
  board: BoardTile[];
  onAccept: () => void;
  onDecline: () => void;
  onCounterOffer: () => void;
}

export const IncomingTradeModal: React.FC<IncomingTradeModalProps> = ({
  incomingOffer,
  board,
  onAccept,
  onDecline,
  onCounterOffer,
}) => {
  const { t, formatMoney, translateTile, language } = useLanguage();

  const offeredTiles = incomingOffer.offeredTileIds
    .map((id) => board.find((t) => t.id === id))
    .filter(Boolean) as BoardTile[];

  const requestedTiles = incomingOffer.requestedTileIds
    .map((id) => board.find((t) => t.id === id))
    .filter(Boolean) as BoardTile[];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 pt-[max(calc(1rem+env(safe-area-inset-top,0px)),1rem)] pb-[max(calc(1rem+env(safe-area-inset-bottom,0px)),1rem)] bg-slate-950/85 backdrop-blur-md animate-fade-in select-none font-['Plus_Jakarta_Sans',sans-serif]">
      <div className="bg-[#0b1325] border border-amber-500/40 rounded-3xl max-w-lg w-full max-h-[calc(90dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))] overflow-y-auto p-4 sm:p-6 text-left shadow-2xl relative ring-1 ring-amber-500/20 space-y-4">
        
        {/* Top Glow Accent */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-amber-500/15 rounded-full blur-2xl pointer-events-none" />

        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 to-amber-300 text-slate-950 font-black text-xl flex items-center justify-center shadow-lg shadow-amber-500/20">
              {incomingOffer.fromPlayerAvatar || '🤖'}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-black text-base text-white">{incomingOffer.fromPlayerName}</span>
                <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full font-bold border border-amber-500/30">
                  {t('incomingTradeTitle')}
                </span>
              </div>
              <p className="text-xs text-slate-400">{t('incomingTradeSubtitle')}</p>
            </div>
          </div>
          <button
            onClick={onDecline}
            className="p-1.5 rounded-full bg-slate-900 text-slate-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Trade Comparison Cards */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          
          {/* What Partner Offers to You (Alacağınız) */}
          <div className="bg-[#070b14] border border-emerald-500/30 rounded-2xl p-3.5 space-y-2">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-1.5">
              <span className="text-xs font-black text-emerald-400 flex items-center gap-1">
                <Coins className="w-3.5 h-3.5" /> {language === 'en' ? 'Offered to You' : 'Size Verilenler'}
              </span>
            </div>

            {/* Cash Offered */}
            {incomingOffer.offeredMoney > 0 && (
              <div className="flex items-center justify-between bg-emerald-950/40 border border-emerald-500/40 rounded-xl p-2 text-xs">
                <span className="text-slate-300 font-semibold">{language === 'en' ? 'Cash:' : 'Nakit Para:'}</span>
                <span className="text-emerald-300 font-black text-sm">+{formatMoney(incomingOffer.offeredMoney)}</span>
              </div>
            )}

            {/* Tiles Offered */}
            <div className="space-y-1 max-h-28 overflow-y-auto pr-0.5">
              {offeredTiles.length === 0 && incomingOffer.offeredMoney === 0 ? (
                <span className="text-[11px] text-slate-500">{language === 'en' ? 'No properties' : 'Mülk yok'}</span>
              ) : (
                offeredTiles.map((tile) => {
                  const translated = translateTile(tile);
                  return (
                    <div
                      key={tile.id}
                      className="flex items-center justify-between bg-slate-900/80 border border-slate-800 rounded-xl p-2 text-xs"
                    >
                      <span className="font-bold text-white truncate">{translated.name}</span>
                      <span className="text-[10px] text-amber-300 font-semibold">{tile.price ? formatMoney(tile.price) : ''}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* What Partner Requests From You (Vereceğiniz) */}
          <div className="bg-[#070b14] border border-rose-500/30 rounded-2xl p-3.5 space-y-2">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-1.5">
              <span className="text-xs font-black text-rose-400 flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5" /> {language === 'en' ? 'Requested from You' : 'Sizden İstenenler'}
              </span>
            </div>

            {/* Cash Requested */}
            {incomingOffer.requestedMoney > 0 && (
              <div className="flex items-center justify-between bg-rose-950/40 border border-rose-500/40 rounded-xl p-2 text-xs">
                <span className="text-slate-300 font-semibold">{language === 'en' ? 'Cash:' : 'Nakit Para:'}</span>
                <span className="text-rose-300 font-black text-sm">-{formatMoney(incomingOffer.requestedMoney)}</span>
              </div>
            )}

            {/* Tiles Requested */}
            <div className="space-y-1 max-h-28 overflow-y-auto pr-0.5">
              {requestedTiles.length === 0 && incomingOffer.requestedMoney === 0 ? (
                <span className="text-[11px] text-slate-500">{language === 'en' ? 'No properties' : 'Mülk istenmiyor'}</span>
              ) : (
                requestedTiles.map((tile) => {
                  const translated = translateTile(tile);
                  return (
                    <div
                      key={tile.id}
                      className="flex items-center justify-between bg-slate-900/80 border border-slate-800 rounded-xl p-2 text-xs"
                    >
                      <span className="font-bold text-white truncate">{translated.name}</span>
                      <span className="text-[10px] text-amber-300 font-semibold">{tile.price ? formatMoney(tile.price) : ''}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-3 gap-2 pt-2">
          <button
            type="button"
            onClick={onAccept}
            className="flex items-center justify-center gap-1.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-black py-3 rounded-xl shadow-lg transition transform active:scale-95 text-xs tracking-wide cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>{t('acceptTradeBtn')} 🤝</span>
          </button>

          <button
            type="button"
            onClick={onCounterOffer}
            className="flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 border border-amber-500/40 text-amber-300 font-bold py-3 rounded-xl transition text-xs cursor-pointer"
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
            <span>{language === 'en' ? 'Negotiate' : 'Pazarlık Et'}</span>
          </button>

          <button
            type="button"
            onClick={onDecline}
            className="flex items-center justify-center gap-1.5 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/30 text-rose-400 font-bold py-3 rounded-xl transition text-xs cursor-pointer"
          >
            <X className="w-4 h-4" />
            <span>{t('declineTradeBtn')} ❌</span>
          </button>
        </div>

      </div>
    </div>
  );
};
