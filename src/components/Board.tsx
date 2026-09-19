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

// 10x11 Grid coordinates for the 38 tiles
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
  18: { row: 2, col: 1 },  // BATMAN

  // Top row (Left to Right: Col 1 up to Col 10)
  19: { row: 1, col: 1 },  // ÜCRETSİZ OTOPARK
  20: { row: 1, col: 2 },  // MARDİN
  21: { row: 1, col: 3 },  // DİYARBAKIR
  22: { row: 1, col: 4 },  // SİİRT
  23: { row: 1, col: 5 },  // BEŞİKTAŞ
  24: { row: 1, col: 6 },  // ŞANS 2
  25: { row: 1, col: 7 },  // DENİZLİ
  26: { row: 1, col: 8 },  // ANTALYA
  27: { row: 1, col: 9 },  // BURSA
  28: { row: 1, col: 10 }, // KODESE GİT

  // Right column (Top to Bottom: Row 2 down to Row 10)
  29: { row: 2, col: 10 }, // BALIKESİR
  30: { row: 3, col: 10 }, // ÇANAKKALE
  31: { row: 4, col: 10 }, // AYDIN
  32: { row: 5, col: 10 }, // ÜSKÜDAR
  33: { row: 6, col: 10 }, // KAMU FONU 2
  34: { row: 7, col: 10 }, // MANİSA
  35: { row: 8, col: 10 }, // İZMİR
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
    <div className="h-full max-h-full aspect-[1.12/1] w-full max-w-5xl bg-[#060b18] border-[3px] sm:border-[10px] border-[#162035] rounded-xl sm:rounded-[28px] p-1 sm:p-2.5 shadow-2xl relative select-none ring-1 ring-amber-500/20 flex flex-col justify-center">
      
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
          className="bg-gradient-to-b from-[#091122] via-[#0c152b] to-[#060b16] border border-slate-800 rounded-lg sm:rounded-2xl m-0.5 p-1.5 sm:p-5 flex flex-col justify-between items-center relative overflow-hidden shadow-2xl"
        >
          {/* Subtle Constellation Grid Background */}
          <div className="absolute inset-0 bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:24px_24px] opacity-15 pointer-events-none" />

          {/* Table Header: Golden TURKISH PARADISE Branding */}
          <div className="text-center relative z-10 w-full pt-0.5 space-y-0.5 flex flex-col items-center">
            <div className="flex items-center justify-center gap-1 sm:gap-2">
              <span className="text-xs sm:text-lg">🎲</span>
              <div className="flex flex-col items-center">
                <span className="font-['Cinzel',serif] text-[8px] sm:text-xs font-bold tracking-[0.2em] text-slate-300 uppercase leading-none">
                  TURKISH
                </span>
                <span className="font-['Cinzel',serif] text-sm sm:text-2xl font-black bg-gradient-to-r from-amber-200 via-amber-400 to-amber-200 bg-clip-text text-transparent drop-shadow tracking-wider leading-none">
                  PARADISE
                </span>
              </div>
            </div>
            
            <p className="text-[7px] sm:text-[9.5px] font-bold text-slate-400 tracking-widest uppercase hidden sm:block">
              Türkiye Web Tabanlı Masa Oyunu
            </p>
          </div>


          {/* Center Stage: Spacious Dice & Action Container */}
          <div className="w-full max-w-sm flex flex-col items-center justify-center relative z-10 my-auto py-0.5 sm:py-1 space-y-1.5 sm:space-y-2.5">
            
            {/* Jailed Bail Option */}
            {isJailed && isMyTurn && !diceRolled && (
              <div className="w-full bg-rose-950/90 border border-rose-600 rounded-xl sm:rounded-2xl p-1.5 sm:p-3 text-center space-y-1 shadow-xl backdrop-blur-md animate-fade-in">
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
              <div className="w-full bg-amber-500/20 border border-amber-400/80 rounded-xl sm:rounded-2xl p-1.5 sm:p-3 text-center space-y-1.5 sm:space-y-2.5 shadow-xl animate-fade-in backdrop-blur-md">
                <p className="text-[10.5px] sm:text-sm text-slate-100 font-bold leading-tight">{actionMessage}</p>
                {isMyTurn && (
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <button
                      onClick={onBuyProperty}
                      className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-extrabold py-1.5 sm:py-2.5 rounded-lg sm:rounded-xl transition flex items-center justify-center gap-1 text-xs sm:text-sm shadow-lg cursor-pointer"
                    >
                      <ShoppingBag className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> AL 💰
                    </button>
                    <button
                      onClick={onPassProperty}
                      className="px-3 sm:px-4 py-1.5 sm:py-2.5 bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-white font-bold rounded-lg sm:rounded-xl transition text-xs sm:text-sm border border-slate-700 cursor-pointer shadow-md"
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
          <div className="w-full flex items-center justify-center gap-1.5 sm:gap-4 relative z-10 pt-1 sm:pt-1.5 border-t border-slate-800/80">
            <button
              onClick={onOpenTrade}
              className="flex items-center gap-1 text-slate-300 hover:text-amber-400 hover:bg-slate-800/60 px-1.5 sm:px-3 py-1 sm:py-1.5 rounded-lg sm:rounded-xl transition text-[10px] sm:text-xs font-bold cursor-pointer border border-slate-800"
            >
              <ArrowLeftRight className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-400" />
              <span>Takas</span>
            </button>
            <button
              onClick={onOpenProperties}
              className="flex items-center gap-1 text-slate-300 hover:text-emerald-400 hover:bg-slate-800/60 px-1.5 sm:px-3 py-1 sm:py-1.5 rounded-lg sm:rounded-xl transition text-[10px] sm:text-xs font-bold cursor-pointer border border-slate-800"
            >
              <Building2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-emerald-400" />
              <span>Mülkler</span>
            </button>
            <button
              onClick={onOpenTransactions}
              className="flex items-center gap-1 text-slate-300 hover:text-sky-400 hover:bg-slate-800/60 px-1.5 sm:px-3 py-1 sm:py-1.5 rounded-lg sm:rounded-xl transition text-[10px] sm:text-xs font-bold cursor-pointer border border-slate-800"
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

