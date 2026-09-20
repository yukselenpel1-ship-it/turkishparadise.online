import React from 'react';
import { BoardTile, Player } from '../types/game';
import { Tile } from './Tile';
import { Dice } from './Dice';
import { ShoppingBag, Unlock, ArrowLeftRight, Building2, Receipt } from 'lucide-react';

interface BoardProps {
  board: BoardTile[];
  players: Player[];
  currentTurnIndex: number;
  dice: [number, number];
  diceRolled: boolean;
  pendingAction: string;
  actionMessage?: string;
  myPlayerId: string | null;
  onTileClick: (tile: BoardTile) => void;
  onRollDice: () => void;
  onEndTurn: () => void;
  onBuyProperty: () => void;
  onPassProperty?: () => void;
  onPayJailBail: () => void;
  onOpenProperties?: () => void;
  onOpenTrade?: () => void;
  onOpenTransactions?: () => void;
  turnSecondsRemaining?: number;
  onTakeBackControl?: () => void;
}

// 10x11 Grid coordinates for the 38 perimeter tiles
const TILE_GRID_POSITIONS: Record<number, { row: number; col: number }> = {
  // Bottom row (Right to Left: Col 10 down to Col 1)
  0: { row: 11, col: 10 }, // BAŞLANGIÇ
  1: { row: 11, col: 9 },  // HATAY
  2: { row: 11, col: 8 },  // MERSİN
  3: { row: 11, col: 7 },  // ADANA
  4: { row: 11, col: 6 },  // KADIKÖY
  5: { row: 11, col: 5 },  // ŞANS 1
  6: { row: 11, col: 4 },  // ORDU
  7: { row: 11, col: 3 },  // SAMSUN
  8: { row: 11, col: 2 },  // TRABZON
  9: { row: 11, col: 1 },  // HAPİSHANE

  // Left column (Bottom to Top: Row 10 up to Row 2)
  10: { row: 10, col: 1 }, // AFYON
  11: { row: 9, col: 1 },  // KONYA
  12: { row: 8, col: 1 },  // ESKİŞEHİR
  13: { row: 7, col: 1 },  // KABATAŞ
  14: { row: 6, col: 1 },  // KAMU FONU 1
  15: { row: 5, col: 1 },  // MALATYA
  16: { row: 4, col: 1 },  // GAZİANTEP
  17: { row: 3, col: 1 },  // ŞANLIURFA
  18: { row: 2, col: 1 },  // SİNOP

  // Top row (Left to Right: Col 1 up to Col 10)
  19: { row: 1, col: 1 },  // ÜCRETSİZ OTOPARK
  20: { row: 1, col: 2 },  // KASTAMONU
  21: { row: 1, col: 3 },  // GİRESUN
  22: { row: 1, col: 4 },  // GELİR VERGİSİ
  23: { row: 1, col: 5 },  // BEŞİKTAŞ
  24: { row: 1, col: 6 },  // ŞANS 2
  25: { row: 1, col: 7 },  // DENİZLİ
  26: { row: 1, col: 8 },  // ANTALYA
  27: { row: 1, col: 9 },  // BURSA
  28: { row: 1, col: 10 }, // KODESE GİT

  // Right column (Top to Bottom: Row 2 down to Row 10)
  29: { row: 2, col: 10 }, // BALIKESİR
  30: { row: 3, col: 10 }, // ÇANAKKALE
  31: { row: 4, col: 10 }, // İZMİR
  32: { row: 5, col: 10 }, // ÜSKÜDAR
  33: { row: 6, col: 10 }, // KAMU FONU 2
  34: { row: 7, col: 10 }, // BOĞAZ KÖPRÜSÜ
  35: { row: 8, col: 10 }, // LÜKS VERGİSİ
  36: { row: 9, col: 10 }, // ANKARA
  37: { row: 10, col: 10 }, // İSTANBUL
};

export const Board: React.FC<BoardProps> = ({
  board,
  players,
  currentTurnIndex,
  dice,
  diceRolled,
  pendingAction,
  actionMessage,
  myPlayerId,
  onTileClick,
  onRollDice,
  onEndTurn,
  onBuyProperty,
  onPassProperty,
  onPayJailBail,
  onOpenProperties,
  onOpenTrade,
  onOpenTransactions,
  turnSecondsRemaining,
  onTakeBackControl,
}) => {
  const currentTurnPlayer = players[currentTurnIndex];
  const isMyTurn = currentTurnPlayer?.id === myPlayerId;
  const isJailed = currentTurnPlayer?.isJailed;
  const isAfk = Boolean(currentTurnPlayer?.isAfk);

  return (
    <div className="h-full max-h-full aspect-[1.12/1] w-full max-w-5xl bg-[#030712] border-[3px] sm:border-[8px] border-[#0c1424] rounded-xl sm:rounded-[28px] p-0.5 sm:p-1.5 shadow-[0_15px_60px_rgba(0,0,0,0.95)] relative select-none ring-1 sm:ring-2 ring-amber-500/30 flex flex-col justify-center">
      
      {/* 10x11 Perimeter Grid Board */}
      <div className="w-full h-full grid grid-cols-10 grid-rows-11 gap-0.5 sm:gap-1 relative">
        
        {/* Render 38 Tiles */}
        {board.map((tile) => {
          const playersOnTile = players.filter((p) => p.position === tile.id && p.inGame);
          const owner = players.find((p) => p.id === tile.ownerId);
          const pos = TILE_GRID_POSITIONS[tile.id] || { row: 1, col: 1 };

          return (
            <Tile
              key={tile.id}
              tile={tile}
              playersOnTile={playersOnTile}
              owner={owner}
              myPlayerId={myPlayerId}
              onClick={() => onTileClick(tile)}
              style={{
                gridRowStart: pos.row,
                gridColumnStart: pos.col,
              }}
            />
          );
        })}

        {/* Center Table Surface (Col 2..10, Row 2..11) */}
        <div
          style={{
            gridColumn: '2 / 10',
            gridRow: '2 / 11',
          }}
          className="relative rounded-lg sm:rounded-2xl m-0.5 p-1.5 sm:p-3.5 flex flex-col justify-between items-center overflow-hidden border border-amber-500/30 shadow-[inset_0_0_50px_rgba(0,0,0,0.85)] bg-gradient-to-b from-[#060c1c] via-[#040813] to-[#02050b]"
        >
          {/* Subtle Bosphorus / Turkey Skyline Atmosphere Overlay */}
          <div className="absolute inset-0 z-0 pointer-events-none opacity-20">
            <div className="w-full h-full bg-[radial-gradient(ellipse_at_top,#f59e0b20,transparent_70%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_40%,#030712_95%)]" />
          </div>

          {/* Majestic Golden Emblem & Embossed TURKISH PARADISE Title */}
          <div className="text-center relative z-10 w-full pt-0.5 sm:pt-1 flex flex-col items-center select-none pointer-events-none">
            {/* Ornate Gold Filigree Crown */}
            <div className="flex items-center justify-center gap-1.5 text-amber-300 drop-shadow-[0_2px_10px_rgba(245,158,11,0.7)] text-xs sm:text-2xl">
              <span className="font-serif opacity-80">⚜️</span>
              <span className="text-sm sm:text-2xl">👑</span>
              <span className="font-serif opacity-80">⚜️</span>
            </div>

            {/* Embossed Gold Typography */}
            <div className="relative flex flex-col items-center mt-0.5">
              <h1 className="font-['Cinzel',serif] text-[11px] sm:text-2xl md:text-3xl font-black tracking-[0.2em] bg-gradient-to-b from-[#fff6d6] via-[#f59e0b] to-[#b45309] bg-clip-text text-transparent drop-shadow-[0_3px_8px_rgba(0,0,0,0.95)] leading-tight">
                TURKISH
              </h1>
              <h2 className="font-['Cinzel',serif] text-base sm:text-3xl md:text-4xl font-black tracking-[0.15em] bg-gradient-to-b from-[#fffbeb] via-[#fbbf24] to-[#78350f] bg-clip-text text-transparent drop-shadow-[0_4px_12px_rgba(0,0,0,0.98)] leading-none -mt-0.5 sm:-mt-1">
                PARADISE
              </h2>

              {/* Golden Crescent & Star */}
              <div className="flex items-center justify-center gap-1 mt-0.5 sm:mt-1 text-amber-300 drop-shadow-[0_2px_8px_rgba(245,158,11,0.8)] text-[9px] sm:text-xs">
                <span>🌙</span>
                <span>⭐</span>
              </div>
            </div>
          </div>

          {/* Center Stage: Frosted Glass Dice & Action Controls */}
          <div className="w-full max-w-sm bg-slate-950/85 backdrop-blur-md border border-amber-500/30 rounded-xl sm:rounded-2xl p-1.5 sm:p-2.5 shadow-2xl relative z-20 my-auto flex flex-col items-center justify-center space-y-1.5 sm:space-y-2">
            
            {/* Jailed Bail Option */}
            {isJailed && isMyTurn && !diceRolled && (
              <div className="w-full bg-rose-950/90 border border-rose-600 rounded-xl sm:rounded-2xl p-1.5 sm:p-2 text-center space-y-1 shadow-xl backdrop-blur-md animate-fade-in">
                <p className="text-[10px] sm:text-xs text-rose-200 font-bold leading-tight">
                  🔒 Kodestesiniz! (Kalan: {currentTurnPlayer.jailTurns}/3)
                </p>
                <button
                  onClick={onPayJailBail}
                  disabled={currentTurnPlayer.money < 100}
                  className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 disabled:opacity-50 text-slate-950 font-bold py-1.5 rounded-lg sm:rounded-xl transition flex items-center justify-center gap-1 text-[11px] sm:text-xs shadow-md cursor-pointer"
                >
                  <Unlock className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> 100₺ Kefalet Öde
                </button>
              </div>
            )}

            {/* Buy Property Prompt */}
            {pendingAction === 'BUY_PROPERTY' && (
              <div className="w-full bg-amber-500/20 border border-amber-400/80 rounded-xl sm:rounded-2xl p-1.5 sm:p-2.5 text-center space-y-1.5 sm:space-y-2 shadow-xl animate-fade-in backdrop-blur-md">
                <p className="text-[10.5px] sm:text-sm text-slate-100 font-bold leading-tight">{actionMessage}</p>
                {isMyTurn && (
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <button
                      onClick={onBuyProperty}
                      className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-extrabold py-1.5 sm:py-2 rounded-lg sm:rounded-xl transition flex items-center justify-center gap-1 text-xs sm:text-sm shadow-lg cursor-pointer"
                    >
                      <ShoppingBag className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> AL 💰
                    </button>
                    <button
                      onClick={onPassProperty}
                      className="px-3 sm:px-4 py-1.5 sm:py-2 bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-white font-bold rounded-lg sm:rounded-xl transition text-xs sm:text-sm border border-slate-700 cursor-pointer shadow-md"
                    >
                      PAS ⏩
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Dice Roll & End Turn Controls */}
            <Dice
              dice={dice}
              disabled={diceRolled}
              onRoll={onRollDice}
              onEndTurn={onEndTurn}
              canEndTurn={diceRolled && pendingAction === 'NONE'}
              currentTurnName={currentTurnPlayer?.name || ''}
              isMyTurn={isMyTurn}
              turnSecondsRemaining={turnSecondsRemaining}
              isAfk={isAfk}
              onTakeBackControl={onTakeBackControl}
            />
          </div>

          {/* Bottom Shortcut Bar */}
          <div className="w-full flex items-center justify-center gap-1.5 sm:gap-3 relative z-10 pt-1 sm:pt-1.5 border-t border-slate-800/60">
            <button
              onClick={onOpenTrade}
              className="flex items-center gap-1 text-slate-200 hover:text-amber-300 hover:bg-slate-900/80 bg-slate-950/60 backdrop-blur-sm px-2 sm:px-3.5 py-1 sm:py-1.5 rounded-lg sm:rounded-xl transition text-[10px] sm:text-xs font-bold cursor-pointer border border-amber-500/20 shadow"
            >
              <ArrowLeftRight className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-400" />
              <span>Takas</span>
            </button>
            <button
              onClick={onOpenProperties}
              className="flex items-center gap-1 text-slate-200 hover:text-emerald-300 hover:bg-slate-900/80 bg-slate-950/60 backdrop-blur-sm px-2 sm:px-3.5 py-1 sm:py-1.5 rounded-lg sm:rounded-xl transition text-[10px] sm:text-xs font-bold cursor-pointer border border-amber-500/20 shadow"
            >
              <Building2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-emerald-400" />
              <span>Mülkler</span>
            </button>
            <button
              onClick={onOpenTransactions}
              className="flex items-center gap-1 text-slate-200 hover:text-sky-300 hover:bg-slate-900/80 bg-slate-950/60 backdrop-blur-sm px-2 sm:px-3.5 py-1 sm:py-1.5 rounded-lg sm:rounded-xl transition text-[10px] sm:text-xs font-bold cursor-pointer border border-amber-500/20 shadow"
            >
              <Receipt className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-sky-400" />
              <span>Hesap</span>
            </button>
          </div>

        </div>

      </div>

    </div>
  );
};
