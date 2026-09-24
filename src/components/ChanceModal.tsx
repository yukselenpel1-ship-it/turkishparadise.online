import React, { useState, useEffect, useRef } from 'react';
import { ChanceCard, Player, BoardTile } from '../types/game';
import { Sparkles, Clock, ShieldAlert, Building2, Check, AlertCircle } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

interface ChanceModalProps {
  card: ChanceCard;
  currentPlayer?: Player;
  players?: Player[];
  board?: BoardTile[];
  onConfirm: (payload?: { targetPlayerId?: string; tileId?: number }) => void;
  autoConfirmSeconds?: number;
}

export const ChanceModal: React.FC<ChanceModalProps> = ({
  card,
  currentPlayer,
  players = [],
  board = [],
  onConfirm,
  autoConfirmSeconds = 10
}) => {
  const { translateChanceCard, language } = useLanguage();
  const translated = translateChanceCard(card);
  const [secondsLeft, setSecondsLeft] = useState<number>(autoConfirmSeconds);
  const onConfirmRef = useRef(onConfirm);

  // Eligible targets for SEND_TO_JAIL
  const eligiblePlayers = players.filter(
    (p) => p.id !== currentPlayer?.id && p.inGame && !p.isJailed
  );
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | undefined>(
    eligiblePlayers[0]?.id
  );
  const selectedPlayerIdRef = useRef(selectedPlayerId);

  // Eligible properties for DEMOLISH_BUILDING
  const eligibleTiles = board.filter(
    (t) => t.ownerId && t.ownerId !== currentPlayer?.id && (t.houses || 0) > 0 && !t.isMortgaged
  );
  const [selectedTileId, setSelectedTileId] = useState<number | undefined>(
    eligibleTiles[0]?.id
  );
  const selectedTileIdRef = useRef(selectedTileId);

  useEffect(() => {
    selectedPlayerIdRef.current = selectedPlayerId;
  }, [selectedPlayerId]);

  useEffect(() => {
    selectedTileIdRef.current = selectedTileId;
  }, [selectedTileId]);

  useEffect(() => {
    onConfirmRef.current = onConfirm;
  }, [onConfirm]);

  useEffect(() => {
    setSecondsLeft(autoConfirmSeconds);
    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          if (card.actionType === 'SEND_TO_JAIL') {
            onConfirmRef.current(
              selectedPlayerIdRef.current
                ? { targetPlayerId: selectedPlayerIdRef.current }
                : undefined
            );
          } else if (card.actionType === 'DEMOLISH_BUILDING') {
            onConfirmRef.current(
              selectedTileIdRef.current !== undefined
                ? { tileId: selectedTileIdRef.current }
                : undefined
            );
          } else {
            onConfirmRef.current();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [card, autoConfirmSeconds]);

  const handleConfirmClick = () => {
    if (card.actionType === 'SEND_TO_JAIL') {
      onConfirm(selectedPlayerId ? { targetPlayerId: selectedPlayerId } : undefined);
    } else if (card.actionType === 'DEMOLISH_BUILDING') {
      onConfirm(selectedTileId !== undefined ? { tileId: selectedTileId } : undefined);
    } else {
      onConfirm();
    }
  };

  const isSendToJail = card.actionType === 'SEND_TO_JAIL';
  const isDemolishBuilding = card.actionType === 'DEMOLISH_BUILDING';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 pt-[max(calc(1rem+env(safe-area-inset-top,0px)),1rem)] pb-[max(calc(1rem+env(safe-area-inset-bottom,0px)),1rem)] bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border-2 border-amber-500/60 rounded-3xl max-w-sm sm:max-w-md w-full max-h-[calc(90dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))] overflow-y-auto p-5 sm:p-6 text-center shadow-2xl space-y-4 relative">
        {/* Top Timer Progress Bar */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-slate-800">
          <div
            className="h-full bg-gradient-to-r from-amber-400 to-amber-600 transition-all duration-1000 ease-linear"
            style={{ width: `${(secondsLeft / autoConfirmSeconds) * 100}%` }}
          />
        </div>

        <div className="inline-flex p-3 bg-amber-500/10 rounded-full border border-amber-500/30 text-amber-400 mt-1">
          {isSendToJail ? (
            <ShieldAlert className="w-8 h-8 animate-pulse text-rose-400" />
          ) : isDemolishBuilding ? (
            <Building2 className="w-8 h-8 animate-pulse text-amber-400" />
          ) : (
            <Sparkles className="w-8 h-8 animate-pulse" />
          )}
        </div>

        <h3 className="text-xl font-black text-amber-400">{translated.title}</h3>

        <p className="text-sm text-slate-200 bg-slate-950 p-3.5 rounded-xl border border-slate-800 leading-relaxed font-medium text-left sm:text-center">
          {translated.description}
        </p>

        {/* TARGET SELECTION: SEND_TO_JAIL */}
        {isSendToJail && (
          <div className="space-y-2 text-left">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
              {language === 'en' ? 'Select Target Player' : 'Hedef Oyuncuyu Seçin'}
            </label>
            {eligiblePlayers.length > 0 ? (
              <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto pr-1">
                {eligiblePlayers.map((p) => {
                  const isSelected = selectedPlayerId === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedPlayerId(p.id)}
                      className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-sm font-semibold transition cursor-pointer text-left ${
                        isSelected
                          ? 'border-rose-500 bg-rose-500/15 text-rose-200 ring-1 ring-rose-500'
                          : 'border-slate-800 bg-slate-950/60 hover:border-slate-700 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="text-xl">{p.avatar || '👤'}</span>
                        <div>
                          <div className="font-bold flex items-center gap-1.5">
                            <span
                              className="w-2.5 h-2.5 rounded-full inline-block"
                              style={{ backgroundColor: p.color }}
                            />
                            <span>{p.name}</span>
                            {p.isBot && (
                              <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">
                                BOT
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-slate-400 font-mono">
                            {p.money?.toLocaleString('tr-TR')}₺
                          </span>
                        </div>
                      </div>
                      {isSelected && (
                        <div className="bg-rose-500 text-white rounded-full p-1">
                          <Check className="w-3.5 h-3.5" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex items-center gap-2 p-3 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-400">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  {language === 'en'
                    ? 'No eligible rival player found (all in jail or eliminated).'
                    : 'Kodese gönderilebilecek uygun rakip oyuncu bulunamadı.'}
                </span>
              </div>
            )}
          </div>
        )}

        {/* TARGET SELECTION: DEMOLISH_BUILDING */}
        {isDemolishBuilding && (
          <div className="space-y-2 text-left">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
              {language === 'en' ? 'Select Building to Demolish' : 'Yıkılacak Yapıyı Seçin'}
            </label>
            {eligibleTiles.length > 0 ? (
              <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto pr-1">
                {eligibleTiles.map((t) => {
                  const owner = players.find((p) => p.id === t.ownerId);
                  const isSelected = selectedTileId === t.id;
                  const houseLabel =
                    t.houses === 5
                      ? language === 'en'
                        ? '🏨 Hotel'
                        : '🏨 Otel'
                      : `${t.houses}x 🏠 ${language === 'en' ? 'House' : 'Ev'}`;

                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSelectedTileId(t.id)}
                      className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-sm font-semibold transition cursor-pointer text-left ${
                        isSelected
                          ? 'border-amber-500 bg-amber-500/15 text-amber-200 ring-1 ring-amber-500'
                          : 'border-slate-800 bg-slate-950/60 hover:border-slate-700 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className="w-3.5 h-7 rounded-sm shrink-0 border border-slate-700"
                          style={{ backgroundColor: t.colorGroup || '#64748b' }}
                        />
                        <div className="min-w-0">
                          <div className="font-bold truncate text-slate-100">{t.name}</div>
                          <div className="text-xs text-slate-400 flex items-center gap-1.5">
                            <span>{owner?.avatar || '👤'}</span>
                            <span className="truncate">{owner?.name || 'Rakip'}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs bg-slate-900 border border-slate-700 px-2 py-0.5 rounded-md font-mono text-amber-300">
                          {houseLabel}
                        </span>
                        {isSelected && (
                          <div className="bg-amber-500 text-slate-950 rounded-full p-1">
                            <Check className="w-3.5 h-3.5" />
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex items-center gap-2 p-3 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-400">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  {language === 'en'
                    ? 'No rival property with buildings found to demolish.'
                    : 'Yıkılabilecek binalı rakip mülk bulunamadı.'}
                </span>
              </div>
            )}
          </div>
        )}

        <button
          onClick={handleConfirmClick}
          disabled={
            (isSendToJail && eligiblePlayers.length > 0 && !selectedPlayerId) ||
            (isDemolishBuilding && eligibleTiles.length > 0 && selectedTileId === undefined)
          }
          className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-black py-3 px-4 rounded-xl shadow-lg transition text-sm cursor-pointer active:scale-95 flex items-center justify-center gap-2"
        >
          <span>
            {isSendToJail && eligiblePlayers.length > 0
              ? language === 'en'
                ? '🚨 Send to Jail'
                : '🚨 Kodese Gönder'
              : isDemolishBuilding && eligibleTiles.length > 0
              ? language === 'en'
                ? '💥 Demolish Building'
                : '💥 Yapıyı Yık'
              : language === 'en'
              ? 'OK 🔥'
              : 'Tamam 🔥'}
          </span>
          <span className="inline-flex items-center gap-1 bg-slate-950/30 text-slate-900 font-mono text-xs px-2 py-0.5 rounded-full border border-slate-950/20">
            <Clock className="w-3 h-3" />
            <span>{secondsLeft}s</span>
          </span>
        </button>
      </div>
    </div>
  );
};
