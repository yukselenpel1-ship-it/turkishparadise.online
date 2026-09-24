import {
  GameState,
  Player,
  BoardTile,
  GameLog,
  ActionType,
  ChanceCard,
  ColorGroup,
  TradeOffer,
  GameSettings,
  ChatMessage,
  BotDifficulty,
  FinancialTransaction,
  TransactionType,
  TransactionCategory
} from '../types/game';
import { INITIAL_BOARD } from '../data/boardData';
import { CHANCE_CARDS } from '../data/chanceCards';

export const TOTAL_TILES = 38;
export const JAIL_TILE_INDEX = 9;
export const GO_TO_JAIL_TILE_INDEX = 28;
export const JAIL_BAIL_AMOUNT = 100;

export const PLAYER_COLORS = [
  '#EF4444', // Red
  '#3B82F6', // Blue
  '#10B981', // Green
  '#F59E0B', // Amber
  '#8B5CF6', // Purple
  '#EC4899', // Pink
];

export const FALLBACK_PLAYER_COLORS = [
  '#06B6D4', // Cyan
  '#84CC16', // Lime
  '#F97316', // Orange
  '#A855F7', // Violet
  '#14B8A6', // Teal
  '#E11D48', // Rose
];

export const PLAYER_AVATARS = ['🏎️', '🎩', '🐕', '⛵', '🐱', '🚀'];
export const FALLBACK_PLAYER_AVATARS = ['✈️', '👑', '🦁', '🦅', '💎', '🏆', '🎯', '🎲'];

export function createInitialState(settings?: Partial<GameSettings>): GameState {
  const mergedSettings: GameSettings = {
    startingMoney: settings?.startingMoney ?? 1500,
    passGoSalary: settings?.passGoSalary ?? 200,
    firstLapBuyLimit: settings?.firstLapBuyLimit ?? 0, // 0 = unlimited, 1..4
    botDifficulty: settings?.botDifficulty ?? 'medium',
    roomCode: settings?.roomCode ?? `TR-${Math.floor(1000 + Math.random() * 9000)}`,
    isPublic: settings?.isPublic ?? false
  };

  const now = Date.now();
  const rand = Math.random().toString(36).substring(2, 8);

  return {
    roomId: mergedSettings.roomCode,
    gameId: `game_${now}_${rand}`,
    sessionId: `sess_${now}_${rand}`,
    hostPlayerId: undefined,
    settings: mergedSettings,
    phase: 'LOBBY',
    players: [],
    currentTurnIndex: 0,
    dice: [1, 1],
    diceRolled: false,
    doublesCount: 0,
    board: JSON.parse(JSON.stringify(INITIAL_BOARD)),
    logs: [
      {
        id: '1',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        text: 'Turkish Paradise 26 Şehir, 4 İskele, Şans & Kamu Fonlu Masa Oyunu lobisi hazır!',
        type: 'info'
      }
    ],

    chatMessages: [
      {
        id: 'c1',
        senderId: 'system',
        senderName: 'Sistem 🎲',
        senderAvatar: '🤖',
        senderColor: '#F59E0B',
        text: 'Oyuna hoş geldiniz! Buradan diğer oyuncularla canlı sohbet edebilirsiniz.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isSystem: true
      }
    ],
    transactions: [],
    pendingAction: 'NONE'
  };
}

/**
 * Robust host checker that never relies solely on array index
 */
export function isPlayerHost(state: GameState, playerId: string | null): boolean {
  if (!playerId || !state || !Array.isArray(state.players)) return false;

  // 1. Check if current hostPlayerId is valid and still an active player
  if (state.hostPlayerId) {
    const hostP = state.players.find((p) => p.id === state.hostPlayerId);
    if (hostP && (state.phase === 'LOBBY' || hostP.inGame)) {
      return state.hostPlayerId === playerId;
    }
  }

  // 2. Check if a player in the list has explicit isHost flag and is active
  const explicitHost = state.players.find((p) => p.isHost && (state.phase === 'LOBBY' || p.inGame));
  if (explicitHost) {
    return explicitHost.id === playerId;
  }

  // 3. Fallback: First active human player in the game becomes the acting host
  const firstActiveHuman = state.players.find((p) => !p.isBot && (state.phase === 'LOBBY' || p.inGame));
  if (firstActiveHuman) {
    return firstActiveHuman.id === playerId;
  }

  // 4. Default fallback: first player in array
  return state.players[0]?.id === playerId;
}



export function addChatMessage(
  state: GameState,
  sender: Player | { id: string; name: string; avatar: string; color: string },
  text: string
): GameState {
  const newState = JSON.parse(JSON.stringify(state)) as GameState;
  const newMsg: ChatMessage = {
    id: Math.random().toString(36).substring(2, 9),
    senderId: sender.id,
    senderName: sender.name,
    senderAvatar: sender.avatar,
    senderColor: sender.color,
    text,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  };
  newState.chatMessages = [...(newState.chatMessages || []), newMsg];
  return newState;
}

export function addLog(state: GameState, text: string, type: GameLog['type'] = 'info') {
  const log: GameLog = {
    id: Math.random().toString(36).substring(2, 9),
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    text,
    type
  };
  state.logs = [log, ...state.logs.slice(0, 49)];
}

export function addTransaction(
  state: GameState,
  player: Player,
  type: TransactionType,
  category: TransactionCategory,
  amount: number,
  description: string
) {
  if (amount <= 0) return;
  const tx: FinancialTransaction = {
    id: Math.random().toString(36).substring(2, 9),
    playerId: player.id,
    playerName: player.name,
    playerAvatar: player.avatar,
    playerColor: player.color,
    type,
    category,
    amount,
    balanceAfter: player.money,
    description,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  };
  state.transactions = [tx, ...(state.transactions || [])].slice(0, 100);
}

export function rollDice(): [number, number] {
  const d1 = Math.floor(Math.random() * 6) + 1;
  const d2 = Math.floor(Math.random() * 6) + 1;
  return [d1, d2];
}

// Check if a player owns ALL properties in a color group (Monopoly / Seri Tamamlama)
export function hasColorGroupMonopoly(board: BoardTile[], colorGroup?: ColorGroup, playerId?: string): boolean {
  if (!colorGroup || !playerId) return false;
  const sameGroupTiles = board.filter(t => t.colorGroup === colorGroup);
  if (sameGroupTiles.length === 0) return false;
  return sameGroupTiles.every(t => t.ownerId === playerId && !t.isMortgaged);
}

export function calculateRent(tile: BoardTile, board: BoardTile[]): number {
  if (!tile.ownerId || tile.isMortgaged) return 0;
  
  // Şehir Kirası
  if (tile.type === 'property' && tile.rent) {
    if (tile.houses > 0) {
      return tile.rent[tile.houses] || tile.rent[0];
    }
    const ownsAllGroup = hasColorGroupMonopoly(board, tile.colorGroup, tile.ownerId);
    return ownsAllGroup ? tile.rent[0] * 2 : tile.rent[0];
  }

  // İskele Kirası: 1 İskele: 50₺, 2: 100₺, 3: 150₺, 4: 200₺
  if (tile.type === 'station') {
    const ownerStationsCount = board.filter(t => t.type === 'station' && t.ownerId === tile.ownerId && !t.isMortgaged).length;
    const rates = [50, 100, 150, 200];
    return rates[Math.min(Math.max(ownerStationsCount - 1, 0), 3)] || 50;
  }

  return 0;
}

// 100₺ kefalet ödeyerek kodesten anında çıkma
export function payJailBail(state: GameState): GameState {
  const newState = JSON.parse(JSON.stringify(state)) as GameState;
  const player = newState.players[newState.currentTurnIndex];

  if (!player || !player.isJailed || player.money < JAIL_BAIL_AMOUNT) {
    return newState;
  }

  player.money -= JAIL_BAIL_AMOUNT;
  player.isJailed = false;
  player.jailTurns = 0;
  addTransaction(newState, player, 'expense', 'bail', JAIL_BAIL_AMOUNT, 'Kodesten serbest kalmak için kefalet ödendi');
  addLog(newState, `🔓 ${player.name} ${JAIL_BAIL_AMOUNT}₺ kefalet ödeyerek kodesten serbest kaldı!`, 'success');

  return newState;
}

// ⚡ Zorla Satın Alma (Force Buy) — 2.0x bedel ile tekelde olmayan ve binasız arsayı zorla devralma
export function executeForceBuy(state: GameState, buyerId: string, tileId: number): GameState {
  const newState = JSON.parse(JSON.stringify(state)) as GameState;
  const buyer = newState.players.find(p => p.id === buyerId);
  const tile = newState.board[tileId];
  if (!buyer || !tile || !tile.ownerId || tile.ownerId === buyerId || !tile.price) {
    return newState;
  }
  if (tile.houses && tile.houses > 0) return newState;
  if (tile.colorGroup && hasColorGroupMonopoly(newState.board, tile.colorGroup, tile.ownerId)) return newState;

  const currentOwner = newState.players.find(p => p.id === tile.ownerId);
  if (!currentOwner) return newState;

  const buyoutCost = tile.price * 2;
  if (buyer.money < buyoutCost) return newState;

  buyer.money -= buyoutCost;
  currentOwner.money += buyoutCost;
  tile.ownerId = buyer.id;
  tile.isMortgaged = false;

  addTransaction(newState, buyer, 'expense', 'buy', buyoutCost, `"${tile.name}" mülkü 2x bedelle zorla satın alındı`);
  addTransaction(newState, currentOwner, 'income', 'trade', buyoutCost, `"${tile.name}" mülkü ${buyer.name} tarafından 2x bedelle devralındı`);
  addLog(newState, `⚡ ${buyer.name}, "${tile.name}" mülkünü ${currentOwner.name} oyuncusundan 2x bedelle (${buyoutCost}₺) zorla satın aldı!`, 'warning');

  return newState;
}

// Calculate strategic valuation of a property based on monopolies and sets
export function calculatePropertyStrategicValue(
  tile: BoardTile,
  owner: Player,
  evaluator: Player,
  board: BoardTile[]
): number {
  if (!tile.price) return 0;
  const difficulty = evaluator.botDifficulty || 'medium';
  let multiplier = difficulty === 'hard' ? 1.5 : difficulty === 'medium' ? 1.25 : 1.1;

  // 1. Color Group Monopoly Analysis
  if (tile.colorGroup) {
    const groupTiles = board.filter(t => t.colorGroup === tile.colorGroup);
    const ownerGroupCount = groupTiles.filter(t => t.ownerId === owner.id).length;
    const evaluatorGroupCount = groupTiles.filter(t => t.ownerId === evaluator.id).length;
    const totalGroupCount = groupTiles.length;

    // A. Does this tile complete a FULL MONOPOLY for the evaluator?
    if (evaluatorGroupCount === totalGroupCount - 1 && tile.ownerId !== evaluator.id) {
      if (difficulty === 'hard') multiplier += 3.0; // +300% value
      else if (difficulty === 'medium') multiplier += 2.0; // +200% value
      else multiplier += 1.2; // +120% value
    }

    // B. Does the current owner already own other tiles in this set?
    if (ownerGroupCount >= 2 && totalGroupCount === 3 && tile.ownerId === owner.id) {
      if (difficulty === 'hard') multiplier += 2.5;
      else if (difficulty === 'medium') multiplier += 1.8;
      else multiplier += 1.0;
    } else if (ownerGroupCount === 1 && totalGroupCount === 2 && tile.ownerId === owner.id) {
      multiplier += 1.4;
    }
  }

  // 2. Stations (İskeleler) analysis
  if (tile.type === 'station') {
    const ownedStations = board.filter(t => t.type === 'station' && t.ownerId === evaluator.id).length;
    if (ownedStations >= 3) multiplier += 2.0;
    else if (ownedStations >= 2) multiplier += 1.4;
    else if (ownedStations >= 1) multiplier += 0.8;
  }

  // 3. Mortgaged discount
  if (tile.isMortgaged) {
    multiplier *= 0.75;
  }

  return Math.max(Math.round(tile.price * 0.9), Math.round(tile.price * multiplier));
}

// Evaluate trade offer made to a bot
export function evaluateTradeOfferByBot(
  state: GameState,
  offer: TradeOffer,
  bot: Player
): { accepted: boolean; reason: string } {
  // Check if bot has enough money
  if (offer.requestedMoney > bot.money) {
    return {
      accepted: false,
      reason: `${bot.name}: "Kasamda bu teklifi karşılayacak kadar nakit para (${offer.requestedMoney}₺) yok!"`
    };
  }

  const difficulty = bot.botDifficulty || 'medium';
  const fromPlayer = state.players.find(p => p.id === offer.fromPlayerId);

  // 1. Strict Anti-Exploit Check: Bot NEVER sells property below fair deed price for cash
  for (const id of offer.requestedTileIds) {
    const tile = state.board.find(b => b.id === id);
    if (tile && tile.price) {
      const minCashMultiplier = difficulty === 'hard' ? 2.0 : difficulty === 'medium' ? 1.4 : 1.1;
      const minAcceptablePrice = Math.round(tile.price * (tile.isMortgaged ? 0.8 : minCashMultiplier));

      if (offer.offeredTileIds.length === 0 && offer.offeredMoney < minAcceptablePrice) {
        return {
          accepted: false,
          reason: `${bot.name} (${difficulty === 'hard' ? '🔴 ZOR BOT' : difficulty === 'medium' ? '🟡 ORTA BOT' : '🟢 KOLAY BOT'}): "${tile.name}" tapusu ${tile.price}₺ değerindedir. Teklifiniz (${offer.offeredMoney}₺) çok düşük! En az ${minAcceptablePrice}₺ teklif etmelisiniz.`
        };
      }
    }
  }

  // 2. Calculate Total Value Bot Gives Away
  let valueBotGives = offer.requestedMoney;
  for (const id of offer.requestedTileIds) {
    const tile = state.board.find(b => b.id === id);
    if (tile) {
      valueBotGives += calculatePropertyStrategicValue(tile, bot, bot, state.board);
      
      // Extra strict penalty if giving this tile hands the opponent a complete monopoly!
      if (tile.colorGroup && fromPlayer) {
        const groupTiles = state.board.filter(t => t.colorGroup === tile.colorGroup);
        const fromPlayerHas = groupTiles.filter(t => t.ownerId === fromPlayer.id).length;
        if (fromPlayerHas === groupTiles.length - 1) {
          if (difficulty === 'hard') {
            valueBotGives += (tile.price || 0) * 3.0; // Block opponent win
          } else if (difficulty === 'medium') {
            valueBotGives += (tile.price || 0) * 1.8;
          } else {
            valueBotGives += (tile.price || 0) * 1.0;
          }
        }
      }
    }
  }

  // 3. Calculate Total Value Bot Receives
  let valueBotReceives = offer.offeredMoney;
  for (const id of offer.offeredTileIds) {
    const tile = state.board.find(b => b.id === id);
    if (tile && fromPlayer) {
      valueBotReceives += calculatePropertyStrategicValue(tile, fromPlayer, bot, state.board);
    }
  }

  // 4. Decision Threshold based on Difficulty
  let requiredRatio = 1.1; // Medium: needs 10% gain
  if (difficulty === 'hard') {
    requiredRatio = 1.35; // Hard: needs 35% profit margin
  } else if (difficulty === 'easy') {
    requiredRatio = 1.0; // Easy: must be at least equal value (never loss)
  }

  if (valueBotReceives < valueBotGives * requiredRatio) {
    const diff = Math.round(valueBotGives * requiredRatio - valueBotReceives);
    if (difficulty === 'hard') {
      return {
        accepted: false,
        reason: `${bot.name} (🔴 ZOR BOT): "Bu takas aleyhime! Değerli mülklerimi ucuza veremem. En az +${diff}₺ veya eşdeğer mülk eklemelisin!"`
      };
    } else if (difficulty === 'medium') {
      return {
        accepted: false,
        reason: `${bot.name} (🟡 ORTA BOT): "Teklifin yetersiz. Bu araziler portföyüm için kritik (Eksik Değer: ~${diff}₺)."`
      };
    } else {
      return {
        accepted: false,
        reason: `${bot.name} (🟢 KOLAY BOT): "Bu teklif dengeli değil, tapu değerinin altında satış yapamam. (Fark: ~${diff}₺)"`
      };
    }
  }

  return {
    accepted: true,
    reason: `${bot.name}: "Mantıklı ve adil bir teklif, el sıkışıyoruz! 🤝"`
  };
}

// Execute Trade Offer between players or with Bot AI
export function executeTrade(state: GameState, offer: TradeOffer): GameState {
  const newState = JSON.parse(JSON.stringify(state)) as GameState;
  const fromPlayer = newState.players.find(p => p.id === offer.fromPlayerId);
  const toPlayer = newState.players.find(p => p.id === offer.toPlayerId);

  if (!fromPlayer || !toPlayer) {
    if (newState.incomingTradeOffer) newState.incomingTradeOffer = undefined;
    return newState;
  }

  // Sanitize numerical money inputs
  if (
    typeof offer.offeredMoney !== 'number' ||
    isNaN(offer.offeredMoney) ||
    !isFinite(offer.offeredMoney) ||
    offer.offeredMoney < 0 ||
    typeof offer.requestedMoney !== 'number' ||
    isNaN(offer.requestedMoney) ||
    !isFinite(offer.requestedMoney) ||
    offer.requestedMoney < 0
  ) {
    addLog(newState, `❌ Geçersiz takas tutarı girildi.`, 'warning');
    if (newState.incomingTradeOffer) newState.incomingTradeOffer = undefined;
    return newState;
  }

  // Verify solvency of both participants
  if (offer.offeredMoney > 0 && fromPlayer.money < offer.offeredMoney) {
    addLog(newState, `❌ Takas iptal: ${fromPlayer.name} teklif ettiği ${offer.offeredMoney}₺ nakit paraya sahip değil!`, 'warning');
    if (newState.incomingTradeOffer) newState.incomingTradeOffer = undefined;
    return newState;
  }
  if (offer.requestedMoney > 0 && toPlayer.money < offer.requestedMoney) {
    addLog(newState, `❌ Takas iptal: ${toPlayer.name} talep edilen ${offer.requestedMoney}₺ nakit paraya sahip değil!`, 'warning');
    if (newState.incomingTradeOffer) newState.incomingTradeOffer = undefined;
    return newState;
  }

  // Verify deed ownership of all offered & requested tiles
  for (const id of offer.offeredTileIds) {
    const tile = newState.board.find(b => b.id === id);
    if (!tile || tile.ownerId !== fromPlayer.id) {
      addLog(newState, `❌ Takas iptal: Teklif edilen "${tile?.name || 'Mülk'}" artık ${fromPlayer.name} mülkiyetinde değil!`, 'warning');
      if (newState.incomingTradeOffer) newState.incomingTradeOffer = undefined;
      return newState;
    }
  }
  for (const id of offer.requestedTileIds) {
    const tile = newState.board.find(b => b.id === id);
    if (!tile || tile.ownerId !== toPlayer.id) {
      addLog(newState, `❌ Takas iptal: İstenen "${tile?.name || 'Mülk'}" artık ${toPlayer.name} mülkiyetinde değil!`, 'warning');
      if (newState.incomingTradeOffer) newState.incomingTradeOffer = undefined;
      return newState;
    }
  }

  // Verify that neither property set contains built houses/hotels
  for (const id of [...offer.offeredTileIds, ...offer.requestedTileIds]) {
    const tile = newState.board.find(b => b.id === id);
    if (tile?.colorGroup) {
      const groupTiles = newState.board.filter(t => t.colorGroup === tile.colorGroup);
      if (groupTiles.some(t => t.houses > 0)) {
        addLog(newState, `❌ Takas yapılamaz: "${tile.name}" grubundaki tüm ev ve oteller satılmadan mülk takas edilemez!`, 'warning');
        if (newState.incomingTradeOffer) newState.incomingTradeOffer = undefined;
        return newState;
      }
    }
  }

  // Bot AI Evaluation
  if (toPlayer.isBot) {
    const evalResult = evaluateTradeOfferByBot(newState, offer, toPlayer);
    if (!evalResult.accepted) {
      addLog(newState, `❌ ${evalResult.reason}`, 'warning');
      addChatMessage(newState, toPlayer, evalResult.reason);
      if (newState.incomingTradeOffer) newState.incomingTradeOffer = undefined;
      return newState;
    } else {
      addLog(newState, `💬 ${evalResult.reason}`, 'success');
      addChatMessage(newState, toPlayer, evalResult.reason);
    }
  }

  // Execute Money Transfer
  if (offer.offeredMoney > 0) {
    fromPlayer.money -= offer.offeredMoney;
    toPlayer.money += offer.offeredMoney;
    addTransaction(newState, fromPlayer, 'expense', 'trade', offer.offeredMoney, `${toPlayer.name} ile takas ödemesi`);
    addTransaction(newState, toPlayer, 'income', 'trade', offer.offeredMoney, `${fromPlayer.name} tarafından takas ödemesi`);
  }
  if (offer.requestedMoney > 0) {
    toPlayer.money -= offer.requestedMoney;
    fromPlayer.money += offer.requestedMoney;
    addTransaction(newState, toPlayer, 'expense', 'trade', offer.requestedMoney, `${fromPlayer.name} ile takas ödemesi`);
    addTransaction(newState, fromPlayer, 'income', 'trade', offer.requestedMoney, `${toPlayer.name} tarafından takas ödemesi`);
  }

  // Transfer Offered Tiles to Target
  offer.offeredTileIds.forEach(id => {
    const tile = newState.board.find(b => b.id === id);
    if (tile && tile.ownerId === fromPlayer.id) {
      tile.ownerId = toPlayer.id;
    }
  });

  // Transfer Requested Tiles to Sender
  offer.requestedTileIds.forEach(id => {
    const tile = newState.board.find(b => b.id === id);
    if (tile && tile.ownerId === toPlayer.id) {
      tile.ownerId = fromPlayer.id;
    }
  });

  addLog(newState, `🤝 ${fromPlayer.name} ile ${toPlayer.name} arasında takas başarıyla gerçekleşti!`, 'success');

  // Check if this created a monopoly
  offer.offeredTileIds.concat(offer.requestedTileIds).forEach(id => {
    const tile = newState.board.find(b => b.id === id);
    if (tile?.colorGroup && tile.ownerId) {
      if (hasColorGroupMonopoly(newState.board, tile.colorGroup, tile.ownerId)) {
        const owner = newState.players.find(p => p.id === tile.ownerId);
        addLog(newState, `🎉 TEBRİKLER! ${owner?.name} takas ile ${tile.colorGroup.toUpperCase()} renk serisini tamamladı! Artık ev dikebilir!`, 'success');
      }
    }
  });

  // Clear pending incoming trade offer if matched
  if (newState.incomingTradeOffer) {
    newState.incomingTradeOffer = undefined;
  }

  // Check if either player resolved debt settlement
  if (fromPlayer.money >= 0 && newState.pendingAction === 'DEBT_SETTLEMENT') {
    newState.pendingAction = 'NONE';
    newState.actionMessage = undefined;
    addLog(newState, `🎉 ${fromPlayer.name} takas geliriyle borcunu kapattı (${fromPlayer.money}₺ bakiye)!`, 'success');
  }
  if (toPlayer.money >= 0 && newState.pendingAction === 'DEBT_SETTLEMENT') {
    newState.pendingAction = 'NONE';
    newState.actionMessage = undefined;
    addLog(newState, `🎉 ${toPlayer.name} takas geliriyle borcunu kapattı (${toPlayer.money}₺ bakiye)!`, 'success');
  }

  return newState;
}

// Proactive Bot Trading: Bot scans for missing set pieces and initiates trades
export function attemptBotProactiveTrade(state: GameState, bot: Player): GameState {
  const newState = JSON.parse(JSON.stringify(state)) as GameState;
  const difficulty = bot.botDifficulty || 'medium';

  // Easy bot trades rarely, Medium trades often, Hard bot aggressively hunts sets
  const tradeChance = difficulty === 'hard' ? 0.75 : difficulty === 'medium' ? 0.45 : 0.2;
  if (Math.random() > tradeChance) return newState;

  // 1. Scan for Color Groups where bot is missing only 1 tile to complete Monopoly
  const colorGroups: ColorGroup[] = ['brown', 'lightblue', 'pink', 'orange', 'red', 'yellow', 'green', 'blue'];
  
  for (const group of colorGroups) {
    const groupTiles = newState.board.filter(t => t.colorGroup === group);
    const botOwned = groupTiles.filter(t => t.ownerId === bot.id);
    const totalGroup = groupTiles.length;

    // Bot has (total - 1) tiles, e.g. 2 of 3, or 1 of 2!
    if (botOwned.length === totalGroup - 1) {
      const missingTile = groupTiles.find(t => t.ownerId && t.ownerId !== bot.id);
      if (!missingTile || !missingTile.ownerId || !missingTile.price) continue;

      const targetOwner = newState.players.find(p => p.id === missingTile.ownerId && p.inGame);
      if (!targetOwner) continue;

      // Find spare properties that bot owns which are NOT part of a bot monopoly and have no houses
      const spareProperties = newState.board.filter(
        t => t.ownerId === bot.id &&
             t.colorGroup !== group &&
             !hasColorGroupMonopoly(newState.board, t.colorGroup, bot.id) &&
             t.houses === 0
      );

      // Target valuation to incentivize seller
      const deedPrice = missingTile.price;
      const targetMultiplier = difficulty === 'hard' ? 1.4 : difficulty === 'medium' ? 1.25 : 1.15;
      const desiredTotalValue = Math.round(deedPrice * targetMultiplier);

      const maxCashAvailable = Math.max(0, Math.floor(bot.money * 0.85));

      let offeredTileIds: number[] = [];
      let offeredTilesValue = 0;

      // If bot doesn't have enough pure cash to reach desired value, include spare properties
      if (maxCashAvailable < desiredTotalValue && spareProperties.length > 0) {
        for (const prop of spareProperties) {
          if (offeredTilesValue + maxCashAvailable < desiredTotalValue || offeredTilesValue < deedPrice * 0.5) {
            offeredTileIds.push(prop.id);
            offeredTilesValue += (prop.price || 60);
            if (offeredTileIds.length >= 2) break; // Max 2 properties in trade bundle
          }
        }
      }

      // Calculate cash needed to top up the bundle
      const remainingCashNeeded = Math.max(0, desiredTotalValue - offeredTilesValue);
      const cashOffer = Math.min(remainingCashNeeded, maxCashAvailable);
      const totalOfferedValue = offeredTilesValue + cashOffer;

      // CRITICAL: Bot NEVER sends a lowball trade offer below deed price!
      // Total value offered (Cash + Properties) MUST be at least 1.1x of the deed price
      if (totalOfferedValue < Math.round(deedPrice * 1.1)) {
        continue; // Bot cannot afford a fair offer for this city right now
      }

      const offer: TradeOffer = {
        fromPlayerId: bot.id,
        toPlayerId: targetOwner.id,
        offeredTileIds: offeredTileIds,
        offeredMoney: cashOffer,
        requestedTileIds: [missingTile.id],
        requestedMoney: 0
      };

      // Case A: Target is ANOTHER BOT or Target is an AFK HUMAN PLAYER -> Automatic bilateral evaluation
      if (targetOwner.isBot || targetOwner.isAfk) {
        const evalResult = evaluateTradeOfferByBot(newState, offer, targetOwner);
        if (evalResult.accepted) {
          // Execute immediate Trade!
          const resultState = executeTrade(newState, offer);
          if (targetOwner.isAfk) {
            addLog(resultState, `🤝 ${targetOwner.name} AFK modunda olduğu için bot teklifi değerlendirdi ve kabul etti!`, 'success');
          }
          return resultState;
        } else {
          if (targetOwner.isAfk) {
            addLog(newState, `💬 ${bot.name}, ${targetOwner.name} (AFK) oyuncusuna takas teklifi yaptı ancak AFK botu teklifi yetersiz buldu.`, 'info');
          }
        }
      } 
      // Case B: Target is ACTIVE HUMAN PLAYER -> Show interactive incoming trade modal!
      else {
        newState.incomingTradeOffer = {
          ...offer,
          fromPlayerName: bot.name,
          fromPlayerAvatar: bot.avatar
        };
        const spareName = offeredTileIds.length > 0 ? ` + "${newState.board.find(b => b.id === offeredTileIds[0])?.name}"` : '';
        addChatMessage(newState, bot, `Merhaba! "${missingTile.name}" tapunu bana satmak ister misin? ${cashOffer}₺ nakit${spareName} teklif ediyorum!`);
        addLog(newState, `📬 ${bot.name} size "${missingTile.name}" için ${cashOffer}₺ teklifinde bulundu!`, 'action');
        return newState;
      }
    }
  }

  return newState;
}


export function handleRollDice(state: GameState, customDice?: [number, number]): GameState {
  const newState = JSON.parse(JSON.stringify(state)) as GameState;
  const player = newState.players[newState.currentTurnIndex];

  if (!player || newState.diceRolled || newState.phase !== 'PLAYING') {
    return newState;
  }

  const dice = customDice || rollDice();
  const diceTotal = dice[0] + dice[1];
  const isDouble = dice[0] === dice[1];

  newState.dice = dice;
  newState.diceRolled = true;

  // Jail / Kodes check
  if (player.isJailed) {
    if (isDouble) {
      player.isJailed = false;
      player.jailTurns = 0;
      newState.doublesCount = 0;
      addLog(newState, `🎉 ${player.name} çift zar atarak (${dice[0]}-${dice[1]}) kodesten ücretsiz çıktı!`, 'success');
    } else {
      player.jailTurns += 1;
      newState.doublesCount = 0;
      if (player.jailTurns >= 3) {
        player.isJailed = false;
        player.jailTurns = 0;
        addLog(newState, `🔓 ${player.name} 3 tur kodes süresini tamamladı ve serbest kaldı.`, 'success');
      } else {
        addLog(newState, `🔒 ${player.name} (${dice[0]}-${dice[1]}) attı ve kodeste kaldı (${player.jailTurns}/3 tur).`, 'info');
        newState.pendingAction = 'NONE';
        return newState;
      }
    }
  } else {
    // Doubles streak handling for free players
    if (isDouble) {
      const nextDoubles = (newState.doublesCount || 0) + 1;
      if (nextDoubles >= 3) {
        player.position = JAIL_TILE_INDEX;
        player.isJailed = true;
        player.jailTurns = 0;
        newState.doublesCount = 0;
        newState.diceRolled = true;
        newState.pendingAction = 'NONE';
        addLog(newState, `🚨 3 kez üst üste çift atan (${dice[0]}-${dice[1]}) ${player.name} doğrudan Kodese gönderildi!`, 'danger');
        return newState;
      } else {
        newState.doublesCount = nextDoubles;
        addLog(newState, `🎲 ${player.name} çift attı: 🎲 ${dice[0]} - ${dice[1]}! İlerledikten sonra bir kez daha zar atacak! (${nextDoubles}/3)`, 'success');
      }
    } else {
      newState.doublesCount = 0;
      addLog(newState, `${player.name} zar attı: 🎲 ${dice[0]} - ${dice[1]} (Toplam: ${diceTotal})`, 'action');
    }
  }

  // Move player along 38-tile board
  const oldPos = player.position;
  let newPos = (oldPos + diceTotal) % TOTAL_TILES;

  // Passed GO check
  if (newPos < oldPos) {
    player.lapsCompleted = (player.lapsCompleted || 0) + 1;
    const salary = newState.settings?.passGoSalary || 200;
    player.money += salary;
    addTransaction(newState, player, 'income', 'salary', salary, 'Başlangıç noktasından geçildi: Tur maaşı alındı');
    if (player.lapsCompleted === 1 && (newState.settings?.firstLapBuyLimit || 0) > 0) {
      addLog(newState, `🔓 ${player.name} 1. turunu tamamlayarak Başlangıç noktasını geçti! Artık tüm mülk alımları sınırsız serbest! (+${salary}₺)`, 'success');
    } else {
      addLog(newState, `💰 ${player.name} Başlangıç noktasından geçti (+${salary}₺)`, 'success');
    }
  }

  player.position = newPos;
  const currentTile = newState.board[newPos];

  addLog(newState, `📍 ${player.name} "${currentTile.name}" karesine geldi.`, 'info');

  const afterLanding = handleTileLanding(newState, player, currentTile);

  // If double roll and no decision needed, re-enable dice roll
  if (afterLanding.doublesCount > 0 && !player.isJailed && afterLanding.pendingAction === 'NONE') {
    afterLanding.diceRolled = false;
    addLog(afterLanding, `🎲 Çift zar avantajı: Sıra yine ${player.name} oyuncusunda! Tekrar zar atabilirsiniz.`, 'info');
  }

  return afterLanding;
}

// Step-by-step movement helper
export function advancePlayerStep(state: GameState, playerId: string): { state: GameState; passedGo: boolean } {
  const newState = JSON.parse(JSON.stringify(state)) as GameState;
  const player = newState.players.find(p => p.id === playerId);
  if (!player) return { state: newState, passedGo: false };

  const oldPos = player.position;
  const newPos = (oldPos + 1) % TOTAL_TILES;
  player.position = newPos;

  let passedGo = false;
  if (newPos === 0 || newPos < oldPos) {
    passedGo = true;
    player.lapsCompleted = (player.lapsCompleted || 0) + 1;
    const salary = newState.settings?.passGoSalary || 200;
    player.money += salary;
    addTransaction(newState, player, 'income', 'salary', salary, 'Başlangıç noktasından geçildi: Tur maaşı alındı');
    if (player.lapsCompleted === 1 && (newState.settings?.firstLapBuyLimit || 0) > 0) {
      addLog(newState, `🔓 ${player.name} 1. turunu tamamlayarak Başlangıç noktasını geçti! Artık tüm mülk alımları sınırsız serbest! (+${salary}₺)`, 'success');
    } else {
      addLog(newState, `💰 ${player.name} Başlangıç noktasından geçti (+${salary}₺)`, 'success');
    }
  }

  return { state: newState, passedGo };
}

// Finalize landing on destination tile after animated stepping
export function finalizePlayerLanding(state: GameState, playerId: string): GameState {
  const newState = JSON.parse(JSON.stringify(state)) as GameState;
  const player = newState.players.find(p => p.id === playerId);
  if (!player) return newState;

  const currentTile = newState.board[player.position];
  addLog(newState, `📍 ${player.name} "${currentTile.name}" karesine geldi.`, 'info');
  
  const afterLanding = handleTileLanding(newState, player, currentTile);

  // Check if player went bankrupt and was eliminated during landing (e.g. rent)
  const landingPlayer = afterLanding.players.find(p => p.id === playerId);
  if (landingPlayer && !landingPlayer.inGame) {
    const activePlayers = afterLanding.players.filter(p => p.inGame);
    if (activePlayers.length <= 1) {
      afterLanding.phase = 'ENDED';
      afterLanding.winner = activePlayers[0] || null;
      if (activePlayers[0]) {
        addLog(afterLanding, `🏆 OYUN BİTTİ! KAZANAN: ${activePlayers[0].name}!`, 'success');
      }
      return afterLanding;
    }

    // Automatically advance turn to the next active player!
    return nextTurn(afterLanding);
  }

  // If double roll and no pending modal action (e.g. rent paid or visit jail), allow rolling again!
  if (afterLanding.doublesCount > 0 && !player.isJailed && afterLanding.pendingAction === 'NONE') {
    afterLanding.diceRolled = false;
    addLog(afterLanding, `🎲 Çift zar avantajı: Sıra yine ${player.name} oyuncusunda! Tekrar zar atabilirsiniz.`, 'info');
  }

  return afterLanding;
}


export function handleTileLanding(
  state: GameState, 
  player: Player, 
  tile: BoardTile
): GameState {
  switch (tile.type) {
    case 'start':
      addLog(state, `🏁 ${player.name} Başlangıç karesinde mola verdi.`, 'info');
      state.pendingAction = 'NONE';
      break;

    case 'parking':
      addLog(state, `🅿️ ${player.name} Ücretsiz Otopark'ta dinleniyor.`, 'info');
      state.pendingAction = 'NONE';
      break;

    case 'jail':
      if (!player.isJailed) {
        addLog(state, `🔒 ${player.name} Kodeste sadece ziyaretçi olarak bulunuyor.`, 'info');
      }
      state.pendingAction = 'NONE';
      break;

    case 'gotojail':
      player.position = JAIL_TILE_INDEX;
      player.isJailed = true;
      player.jailTurns = 0;
      state.doublesCount = 0; // Reset doubles streak on going to jail
      addLog(state, `🚨 ${player.name} doğrudan Kodese yollandı! (100₺ ödeyerek çıkabilir)`, 'danger');
      state.pendingAction = 'NONE';
      break;

    case 'tax':
      const tax = tile.taxAmount || 100;
      player.money -= tax;
      addTransaction(state, player, 'expense', 'tax', tax, `${tile.name}: Vergi ödendi`);
      addLog(state, `🏛️ ${player.name}, ${tile.name} için ${tax}₺ vergi ödedi.`, 'warning');
      checkBankruptcy(state, player);
      state.pendingAction = 'NONE';
      break;

    case 'chance':
    case 'chest':
      const randomCard = CHANCE_CARDS[Math.floor(Math.random() * CHANCE_CARDS.length)];
      state.activeCard = randomCard;
      state.pendingAction = 'CHANCE_CARD';
      state.actionMessage = `${tile.type === 'chance' ? 'Şans' : 'Kamu Fonu'} Kartı: ${randomCard.title}`;
      break;

    case 'property':
    case 'station':
      if (!tile.ownerId) {
        // First lap limit rule check
        const limit = state.settings?.firstLapBuyLimit || 0;
        if (limit > 0 && (player.lapsCompleted || 0) === 0 && (player.firstLapPurchases || 0) >= limit) {
          addLog(state, `⚠️ ${player.name} ilk tur mülk alım sınırına (${limit} adet) ulaştığı için Başlangıç noktasını geçene kadar bu mülkü satın alamaz.`, 'warning');
          state.pendingAction = 'NONE';
        } else {
          state.pendingAction = 'BUY_PROPERTY';
          const typeStr = tile.type === 'station' ? 'iskelesini' : 'şehrini';
          state.actionMessage = `"${tile.name}" ${typeStr} ${tile.price}₺ karşılığında satın almak ister misiniz?`;
        }
      } else if (tile.ownerId !== player.id && !tile.isMortgaged) {
        const rent = calculateRent(tile, state.board);
        const owner = state.players.find(p => p.id === tile.ownerId);
        if (owner && rent > 0) {
          player.money -= rent;
          owner.money += rent;
          owner.totalRentCollected = (owner.totalRentCollected || 0) + rent;
          addTransaction(state, player, 'expense', 'rent_out', rent, `${owner.name} kullanıcısına "${tile.name}" kirası ödendi`);
          addTransaction(state, owner, 'income', 'rent_in', rent, `${player.name} kullanıcısından "${tile.name}" kirası tahsil edildi`);
          addLog(state, `🏠 ${player.name}, ${owner.name} kullanıcısına "${tile.name}" için ${rent}₺ kira ödedi.`, 'warning');
          checkBankruptcy(state, player);
        }
        state.pendingAction = 'NONE';
      } else {
        state.pendingAction = 'NONE';
      }
      break;

    default:
      state.pendingAction = 'NONE';
      break;
  }

  return state;
}

/**
 * Deterministic Bot Target Selection for Interactive Chance Cards
 */
export function getBotChanceTarget(
  state: GameState,
  botPlayerId: string,
  card: ChanceCard
): { targetPlayerId?: string; tileId?: number } {
  if (card.actionType === 'SEND_TO_JAIL') {
    const candidates = state.players.filter(p => p.id !== botPlayerId && p.inGame && !p.isJailed);
    if (candidates.length === 0) return {};

    // Rank opponents by net worth (cash + property values + house costs)
    const scoredCandidates = candidates.map(p => {
      const cash = p.money || 0;
      const propertyVal = state.board
        .filter(t => t.ownerId === p.id)
        .reduce((sum, t) => sum + (t.price || 0) + ((t.houses || 0) * (t.houseCost || 100)), 0);
      return { player: p, netWorth: cash + propertyVal };
    });

    scoredCandidates.sort((a, b) => b.netWorth - a.netWorth || (b.player.money || 0) - (a.player.money || 0));
    return { targetPlayerId: scoredCandidates[0].player.id };
  }

  if (card.actionType === 'DEMOLISH_BUILDING') {
    const candidateTiles = state.board.filter(
      t => t.ownerId && t.ownerId !== botPlayerId && (t.houses || 0) > 0 && !t.isMortgaged
    );
    if (candidateTiles.length === 0) return {};

    // Rank opponent property tiles by strategic rent and house investment
    const scoredTiles = candidateTiles.map(t => {
      const rent = calculateRent(t, state.board);
      const score = rent * 10 + (t.houses || 0) * (t.houseCost || 100) + (t.price || 0);
      return { tile: t, score };
    });

    scoredTiles.sort((a, b) => b.score - a.score || (b.tile.houses || 0) - (a.tile.houses || 0) || a.tile.id - b.tile.id);
    return { tileId: scoredTiles[0].tile.id };
  }

  return {};
}

export function applyChanceCard(state: GameState, payload?: { targetPlayerId?: string; tileId?: number }): GameState {
  const newState = JSON.parse(JSON.stringify(state)) as GameState;
  const player = newState.players[newState.currentTurnIndex];
  const card = newState.activeCard;

  if (!card || !player) return newState;

  addLog(newState, `🃏 ${player.name} kart çekti: ${card.title} - ${card.description}`, 'action');

  switch (card.actionType) {
    case 'MONEY':
      if (card.amount) {
        player.money += card.amount;
        if (card.amount > 0) {
          addTransaction(newState, player, 'income', 'chance', card.amount, `Kart Kazancı: ${card.title}`);
        } else {
          addTransaction(newState, player, 'expense', 'chance', Math.abs(card.amount), `Kart Cezası: ${card.title}`);
        }
        if (card.amount < 0) checkBankruptcy(newState, player);
      }
      break;

    case 'JAIL':
      player.position = JAIL_TILE_INDEX;
      player.isJailed = true;
      player.jailTurns = 0;
      newState.doublesCount = 0;
      break;

    case 'MOVE_TO':
      if (card.targetTileId !== undefined) {
        const target = card.targetTileId % TOTAL_TILES;
        if (target < player.position) {
          const salary = newState.settings?.passGoSalary || 200;
          player.money += salary;
          player.lapsCompleted = (player.lapsCompleted || 0) + 1;
          addTransaction(newState, player, 'income', 'salary', salary, 'Kart ile Başlangıç noktasından geçildi');
          if (player.lapsCompleted === 1 && (newState.settings?.firstLapBuyLimit || 0) > 0) {
            addLog(newState, `🔓 ${player.name} 1. turunu tamamlayarak Başlangıç noktasını geçti! Artık tüm mülk alımları sınırsız serbest! (+${salary}₺)`, 'success');
          } else {
            addLog(newState, `💰 ${player.name} tur tamamlama bonusu ${salary}₺ aldı.`, 'success');
          }
        }
        player.position = target;

        // If card moves to a destination other than Start, execute tile landing mechanics (buying / rent)
        newState.activeCard = undefined;
        if (target !== 0) {
          const destTile = newState.board[target];
          addLog(newState, `📍 ${player.name} "${destTile.name}" karesine ilerledi.`, 'info');
          const afterLanding = handleTileLanding(newState, player, destTile);
          if ((afterLanding.doublesCount || 0) > 0 && !player.isJailed && afterLanding.pendingAction === 'NONE') {
            afterLanding.diceRolled = false;
            addLog(afterLanding, `🎲 Çift zar avantajı: Sıra yine ${player.name} oyuncusunda! Tekrar zar atabilirsiniz.`, 'info');
          }
          return afterLanding;
        }
      }
      break;

    case 'REPAIR':
      let totalHouses = 0;
      newState.board.forEach(t => {
        if (t.ownerId === player.id) totalHouses += t.houses;
      });
      const cost = totalHouses * (card.amount || 25);
      if (cost > 0) {
        player.money -= cost;
        addTransaction(newState, player, 'expense', 'chance', cost, `Tüm binaların bakım ve onarım vergisi`);
        addLog(newState, `🛠️ ${player.name} binaları için ${cost}₺ bakım ödedi.`, 'warning');
        checkBankruptcy(newState, player);
      }
      break;

    case 'SEND_TO_JAIL': {
      let targetPlayerId = payload?.targetPlayerId;
      if (!targetPlayerId && (player.isBot || player.isAfk)) {
        targetPlayerId = getBotChanceTarget(newState, player.id, card).targetPlayerId;
      }
      const targetPlayer = targetPlayerId ? newState.players.find(p => p.id === targetPlayerId && p.inGame && !p.isJailed && p.id !== player.id) : undefined;
      if (targetPlayer) {
        targetPlayer.position = JAIL_TILE_INDEX;
        targetPlayer.isJailed = true;
        targetPlayer.jailTurns = 0;
        addLog(newState, `🚨 ${player.name}, Şans Kartı ile ${targetPlayer.name} oyuncusunu Kodese gönderdi!`, 'danger');
      } else {
        addLog(newState, `🔒 Kodese gönderilecek uygun rakip oyuncu bulunamadı.`, 'info');
      }
      break;
    }

    case 'DEMOLISH_BUILDING': {
      let tileId = payload?.tileId;
      if (tileId === undefined && (player.isBot || player.isAfk)) {
        tileId = getBotChanceTarget(newState, player.id, card).tileId;
      }
      const targetTile = tileId !== undefined ? newState.board[tileId] : undefined;
      const targetOwner = targetTile?.ownerId ? newState.players.find(p => p.id === targetTile.ownerId) : undefined;
      if (
        targetTile &&
        targetOwner &&
        targetOwner.inGame &&
        targetOwner.id !== player.id &&
        (targetTile.houses || 0) > 0 &&
        !targetTile.isMortgaged
      ) {
        targetTile.houses -= 1;
        const remainingType = targetTile.houses === 4 ? 'Otel yıkıldı (4 Ev kaldı)' : `${targetTile.houses + 1}. Ev yıkıldı (${targetTile.houses} Ev kaldı)`;
        addLog(newState, `💥 ${player.name}, Şans Kartı ile ${targetOwner.name} oyuncusunun "${targetTile.name}" mülkündeki 1 yapıyı yıktı! (${remainingType})`, 'warning');
      } else {
        addLog(newState, `🏚️ Yıkılacak rakip yapı bulunamadı.`, 'info');
      }
      break;
    }
  }

  newState.activeCard = undefined;
  newState.pendingAction = 'NONE';

  // Check if player went bankrupt from chance card penalty
  if (!player.inGame) {
    const activePlayers = newState.players.filter(p => p.inGame);
    if (activePlayers.length <= 1) {
      newState.phase = 'ENDED';
      newState.winner = activePlayers[0] || null;
      if (activePlayers[0]) {
        addLog(newState, `🏆 OYUN BİTTİ! KAZANAN: ${activePlayers[0].name}!`, 'success');
      }
      return newState;
    }
    return nextTurn(newState);
  }

  // If double roll active, allow rolling again
  if ((newState.doublesCount || 0) > 0 && !player.isJailed) {
    newState.diceRolled = false;
    addLog(newState, `🎲 Çift zar avantajı: Sıra yine ${player.name} oyuncusunda! Tekrar zar atabilirsiniz.`, 'info');
  }

  return newState;
}

export function buyProperty(state: GameState, playerId?: string): GameState {
  const newState = JSON.parse(JSON.stringify(state)) as GameState;
  const targetId = playerId || newState.players[newState.currentTurnIndex]?.id;
  const player = newState.players.find(p => p.id === targetId) || newState.players[newState.currentTurnIndex];
  if (!player) return newState;
  const currentTile = newState.board[player.position];

  if (!currentTile || currentTile.ownerId || !currentTile.price) return newState;

  // Rule: Check First Lap Buy Limit
  const limit = newState.settings?.firstLapBuyLimit || 0;
  if (limit > 0 && (player.lapsCompleted || 0) === 0 && (player.firstLapPurchases || 0) >= limit) {
    addLog(newState, `⚠️ ${player.name} ilk tur mülk alım sınırına (${limit} adet) ulaştığı için Başlangıç noktasını geçene kadar başka mülk alamaz!`, 'warning');
    newState.pendingAction = 'NONE';
    if ((newState.doublesCount || 0) > 0 && !player.isJailed) {
      newState.diceRolled = false;
    }
    return newState;
  }

  if (player.money >= currentTile.price) {
    player.money -= currentTile.price;
    currentTile.ownerId = player.id;
    addTransaction(newState, player, 'expense', 'buy', currentTile.price, `"${currentTile.name}" mülkü satın alındı`);
    
    if ((player.lapsCompleted || 0) === 0) {
      player.firstLapPurchases = (player.firstLapPurchases || 0) + 1;
      if (limit > 0) {
        const remaining = limit - player.firstLapPurchases;
        if (remaining === 0) {
          addLog(newState, `ℹ️ ${player.name} ilk tur mülk limitini doldurdu (${limit}/${limit}). Başlangıç noktasını geçene kadar yeni mülk alamaz.`, 'info');
        } else {
          addLog(newState, `ℹ️ ${player.name} ilk tur mülk hakkı: ${player.firstLapPurchases}/${limit} (Kalan: ${remaining})`, 'info');
        }
      }
    }

    addLog(newState, `🏘️ ${player.name}, "${currentTile.name}" mülkünü ${currentTile.price}₺ karşılığında satın aldı!`, 'success');

    if (currentTile.colorGroup && hasColorGroupMonopoly(newState.board, currentTile.colorGroup, player.id)) {
      addLog(newState, `🎉 TEBRİKLER! ${player.name} "${currentTile.name}" ile renk serisini tamamladı! Artık bu renge ev dikebilir!`, 'success');
    }
  } else {
    addLog(newState, `❌ ${player.name} mülkü alacak yeterli paraya sahip değil.`, 'danger');
  }

  newState.pendingAction = 'NONE';
  newState.actionMessage = undefined;

  // If double roll active, allow rolling again
  if ((newState.doublesCount || 0) > 0 && !player.isJailed) {
    newState.diceRolled = false;
    addLog(newState, `🎲 Çift zar avantajı: Sıra yine ${player.name} oyuncusunda! Tekrar zar atabilirsiniz.`, 'info');
  }

  return newState;
}

export function passProperty(state: GameState, playerId?: string): GameState {
  const newState = JSON.parse(JSON.stringify(state)) as GameState;
  const targetId = playerId || newState.players[newState.currentTurnIndex]?.id;
  const player = newState.players.find(p => p.id === targetId) || newState.players[newState.currentTurnIndex];
  if (!player) return newState;
  const currentTile = newState.board[player.position];

  if (currentTile) {
    addLog(newState, `⏩ ${player.name}, "${currentTile.name}" mülkünü satın almayıp pas geçti.`, 'info');
  }

  newState.pendingAction = 'NONE';
  newState.actionMessage = undefined;

  // If double roll active, allow rolling again
  if ((newState.doublesCount || 0) > 0 && !player.isJailed) {
    newState.diceRolled = false;
    addLog(newState, `🎲 Çift zar avantajı: Sıra yine ${player.name} oyuncusunda! Tekrar zar atabilirsiniz.`, 'info');
  }

  return newState;
}

// Parası biten mülk sahibinin Banka'ya 2/3 fiyatına mülk satması
export function sellPropertyToBank(state: GameState, tileId: number, playerId?: string): GameState {
  const newState = JSON.parse(JSON.stringify(state)) as GameState;
  const tile = newState.board[tileId];
  if (!tile || !tile.ownerId || !tile.price) return newState;

  const player = newState.players.find(p => p.id === (playerId || tile.ownerId));
  if (!player || player.id !== tile.ownerId) return newState;

  // 2/3 property price + 50% house cost refund
  const propertyRefund = Math.floor(tile.price * (2 / 3));
  const housesRefund = tile.houses > 0 && tile.houseCost ? Math.floor(tile.houses * tile.houseCost * 0.5) : 0;
  const totalRefund = propertyRefund + housesRefund;

  player.money += totalRefund;
  tile.ownerId = undefined;
  tile.houses = 0;
  tile.isMortgaged = false;

  addTransaction(newState, player, 'income', 'bank_sell', totalRefund, `"${tile.name}" mülkü Banka'ya 2/3 fiyatına satıldı`);
  addLog(newState, `🏛️ ${player.name}, "${tile.name}" mülkünü Banka'ya 2/3 değerine (${totalRefund}₺) geri sattı.`, 'warning');

  if (player.money >= 0 && newState.pendingAction === 'DEBT_SETTLEMENT') {
    newState.pendingAction = 'NONE';
    newState.actionMessage = undefined;
    addLog(newState, `🎉 ${player.name} borcunu kapattı (${player.money}₺ bakiye)! Oyuna devam edebilir.`, 'success');
  }

  return newState;
}

export function buildHouse(state: GameState, tileId: number, playerId?: string): GameState {
  const newState = JSON.parse(JSON.stringify(state)) as GameState;
  const tile = newState.board[tileId];
  if (!tile) return newState;

  const targetPlayerId = playerId || tile.ownerId || newState.players[newState.currentTurnIndex]?.id;
  const player = newState.players.find(p => p.id === targetPlayerId);

  if (!player || tile.ownerId !== player.id || !tile.houseCost || tile.houses >= 5) return newState;

  if (tile.isMortgaged) {
    addLog(newState, `⚠️ İpotekli mülke ev dikilemez! Önce ipoteği kaldırın.`, 'warning');
    return newState;
  }

  // Check if any property in this color group is mortgaged
  if (tile.colorGroup) {
    const groupTiles = newState.board.filter(t => t.colorGroup === tile.colorGroup);
    if (groupTiles.some(t => t.isMortgaged)) {
      addLog(newState, `⚠️ Bu renk grubunda ipotekli mülk varken ev dikilemez! Önce ipoteği kaldırın.`, 'warning');
      return newState;
    }
  }

  if (!hasColorGroupMonopoly(newState.board, tile.colorGroup, player.id)) {
    addLog(newState, `⚠️ Ev dikilemez: ${tile.name} için aynı renkteki tüm şehirlere sahip olmanız gerekir!`, 'warning');
    return newState;
  }

  if (player.money >= tile.houseCost) {
    player.money -= tile.houseCost;
    tile.houses += 1;
    const typeStr = tile.houses === 5 ? 'Otel' : `${tile.houses}. Ev`;
    addTransaction(newState, player, 'expense', 'build_house', tile.houseCost, `"${tile.name}" üzerine ${typeStr} inşa edildi`);
    addLog(newState, `🏗️ ${player.name}, "${tile.name}" üzerine ${typeStr} dikti! (${tile.houseCost}₺)`, 'success');
  } else {
    addLog(newState, `❌ ${player.name} ev dikmek için yeterli paraya (${tile.houseCost}₺) sahip değil.`, 'warning');
  }

  return newState;
}

// Mülk üzerindeki evi/oteli yarı fiyatına bankaya geri satma
export function sellHouse(state: GameState, tileId: number, playerId?: string): GameState {
  const newState = JSON.parse(JSON.stringify(state)) as GameState;
  const tile = newState.board[tileId];
  if (!tile || !tile.houseCost || tile.houses <= 0) return newState;

  const targetPlayerId = playerId || tile.ownerId || newState.players[newState.currentTurnIndex]?.id;
  const player = newState.players.find(p => p.id === targetPlayerId);
  if (!player || tile.ownerId !== player.id) return newState;

  const refund = Math.floor(tile.houseCost / 2);
  tile.houses -= 1;
  player.money += refund;
  const houseType = tile.houses === 4 ? 'Otel satıldı' : `${tile.houses + 1}. ev satıldı`;
  addTransaction(newState, player, 'income', 'sell_house', refund, `"${tile.name}" üzerinden ${houseType}`);
  addLog(newState, `🏚️ ${player.name}, "${tile.name}" üzerinden bina satarak ${refund}₺ geri aldı.`, 'info');

  if (player.money >= 0 && newState.pendingAction === 'DEBT_SETTLEMENT') {
    newState.pendingAction = 'NONE';
    newState.actionMessage = undefined;
    addLog(newState, `🎉 ${player.name} borcunu kapattı (${player.money}₺ bakiye)! Oyuna devam edebilir.`, 'success');
  }

  return newState;
}

export function toggleMortgage(state: GameState, tileId: number, playerId?: string): GameState {
  const newState = JSON.parse(JSON.stringify(state)) as GameState;
  const tile = newState.board[tileId];
  if (!tile || !tile.price) return newState;

  const targetPlayerId = playerId || tile.ownerId || newState.players[newState.currentTurnIndex]?.id;
  const player = newState.players.find(p => p.id === targetPlayerId);

  if (!player || tile.ownerId !== player.id) return newState;

  const mortgageValue = Math.floor(tile.price / 2);

  if (tile.isMortgaged) {
    const unmortgageCost = Math.floor(mortgageValue * 1.1);
    if (player.money >= unmortgageCost) {
      player.money -= unmortgageCost;
      tile.isMortgaged = false;
      addTransaction(newState, player, 'expense', 'mortgage', unmortgageCost, `"${tile.name}" ipoteği kaldırıldı`);
      addLog(newState, `🔓 ${player.name}, "${tile.name}" ipoteğini ${unmortgageCost}₺ ödeyerek kaldırdı.`, 'info');
    } else {
      addLog(newState, `❌ İpoteği kaldırmak için ${unmortgageCost}₺ gereklidir.`, 'warning');
    }
  } else {
    // Check if any property in this color group has houses
    if (tile.colorGroup) {
      const groupTiles = newState.board.filter(t => t.colorGroup === tile.colorGroup);
      if (groupTiles.some(t => t.houses > 0)) {
        addLog(newState, `⚠️ Bu renk grubunda binalar varken mülk ipotek edilemez! Önce tüm binaları satın.`, 'warning');
        return newState;
      }
    } else if (tile.houses > 0) {
      addLog(newState, `⚠️ Üzerinde ev bulunan mülk ipotek ettirilemez!`, 'warning');
      return newState;
    }
    player.money += mortgageValue;
    tile.isMortgaged = true;
    addTransaction(newState, player, 'income', 'mortgage', mortgageValue, `"${tile.name}" ipoteğe verildi`);
    addLog(newState, `🔒 ${player.name}, "${tile.name}" mülkünü ${mortgageValue}₺ karşılığında ipotek etti.`, 'warning');
  }

  if (player.money >= 0 && newState.pendingAction === 'DEBT_SETTLEMENT') {
    newState.pendingAction = 'NONE';
    newState.actionMessage = undefined;
    addLog(newState, `🎉 ${player.name} borcunu kapattı (${player.money}₺ bakiye)! Oyuna devam edebilir.`, 'success');
  }

  return newState;
}

export function declareBankruptcy(state: GameState, playerId: string): GameState {
  const newState = JSON.parse(JSON.stringify(state)) as GameState;
  const player = newState.players.find(p => p.id === playerId);
  if (!player || !player.inGame) return newState;

  player.inGame = false;
  addLog(newState, `💀 ${player.name} iflas etti ve izleyici moduna geçti.`, 'danger');

  // Return all their properties to bank (unowned, clear houses & mortgage)
  newState.board.forEach(t => {
    if (t.ownerId === player.id) {
      t.ownerId = undefined;
      t.houses = 0;
      t.isMortgaged = false;
    }
  });

  newState.pendingAction = 'NONE';
  newState.actionMessage = undefined;

  // Check if only 1 active player remains -> Game Over!
  const activePlayers = newState.players.filter(p => p.inGame);
  if (activePlayers.length <= 1) {
    newState.phase = 'ENDED';
    newState.winner = activePlayers[0] || null;
    if (activePlayers[0]) {
      addLog(newState, `🏆 OYUN BİTTİ! KAZANAN: ${activePlayers[0].name}!`, 'success');
    }
    return newState;
  }

  // If the bankrupt player was currently having their turn, advance immediately to next active player
  if (newState.players[newState.currentTurnIndex]?.id === playerId) {
    return nextTurn(newState);
  }

  return newState;
}

/**
 * Calculates strategic score of a property for liquidation ranking.
 * Lower score = Less valuable / expendable first.
 * Higher score = Protected (e.g. monopolies, houses, high rent).
 */
export function calculateLiquidationScore(tile: BoardTile, board: BoardTile[], ownerId: string): number {
  if (!tile || tile.ownerId !== ownerId) return 0;

  let score = tile.price || 0;

  // Rent potential
  const rent = calculateRent(tile, board);
  score += rent * 15;

  // Station network
  if (tile.type === 'station') {
    const ownedStations = board.filter(t => t.type === 'station' && t.ownerId === ownerId).length;
    score += ownedStations * 600;
  }

  // Monopoly & house bonuses
  if (tile.colorGroup) {
    const isMonopoly = hasColorGroupMonopoly(board, tile.colorGroup, ownerId);
    if (isMonopoly) {
      score += 10000;
    }
    const groupTiles = board.filter(t => t.colorGroup === tile.colorGroup);
    const totalGroupHouses = groupTiles.reduce((sum, t) => sum + (t.houses || 0), 0);
    score += totalGroupHouses * 1500;

    // Penalty if color group is held/blocked by opponents (no monopoly possible)
    const opponentPieces = groupTiles.filter(t => t.ownerId && t.ownerId !== ownerId).length;
    if (opponentPieces > 0) {
      score -= 200;
    }
  }

  score += (tile.houses || 0) * 2000;

  return score;
}

/**
 * Deterministic tie-breaker comparator for liquidating properties (ascending: lowest score first).
 * Tie-breaker 1: Lower score first
 * Tie-breaker 2: Lower deed price first
 * Tie-breaker 3: Lower tile id first
 */
export function compareTilesForLiquidation(a: BoardTile, b: BoardTile, board: BoardTile[], ownerId: string): number {
  const scoreA = calculateLiquidationScore(a, board, ownerId);
  const scoreB = calculateLiquidationScore(b, board, ownerId);
  if (scoreA !== scoreB) {
    return scoreA - scoreB;
  }
  const priceA = a.price || 0;
  const priceB = b.price || 0;
  if (priceA !== priceB) {
    return priceA - priceB;
  }
  return a.id - b.id;
}

// Auto-liquidate assets with minimum strategic harm or declare bankruptcy if impossible
export function autoLiquidateDebtOrBankrupt(state: GameState, playerId: string): GameState {
  let newState = JSON.parse(JSON.stringify(state)) as GameState;
  const player = newState.players.find(p => p.id === playerId);
  if (!player || !player.inGame) return newState;

  if (player.money >= 0) {
    if (newState.pendingAction === 'DEBT_SETTLEMENT') {
      newState.pendingAction = 'NONE';
      newState.actionMessage = undefined;
    }
    return newState;
  }

  addLog(newState, `⚖️ ${player.name} borçlu olduğu için varlıkları otomatik tasfiye ediliyor... (${player.money}₺)`, 'warning');

  const colorGroupHasHouses = (colorGroup?: string) => {
    if (!colorGroup) return false;
    return newState.board.some(t => t.colorGroup === colorGroup && (t.houses || 0) > 0);
  };

  // STAGE 1: Mortgage unmortgaged, house-free properties
  if (player.money < 0) {
    const unmortgagedProperties = newState.board
      .filter(t => t.ownerId === player.id && !t.isMortgaged && (t.houses || 0) === 0 && !colorGroupHasHouses(t.colorGroup))
      .sort((a, b) => compareTilesForLiquidation(a, b, newState.board, player.id));

    for (const tile of unmortgagedProperties) {
      if (player.money >= 0) break;
      newState = toggleMortgage(newState, tile.id, player.id);
      const curr = newState.players.find(p => p.id === playerId);
      if (curr && curr.money >= 0) break;
    }
  }

  // STAGE 2: Sell Houses (Obeying Even-Building / Selling Rule)
  let currP = newState.players.find(p => p.id === playerId);
  while (currP && currP.money < 0) {
    const tilesWithHouses = newState.board.filter(t => t.ownerId === player.id && (t.houses || 0) > 0);
    if (tilesWithHouses.length === 0) break;

    const groupsWithHouses = Array.from(new Set(tilesWithHouses.map(t => t.colorGroup).filter(Boolean) as string[]));
    groupsWithHouses.sort((g1, g2) => {
      const score1 = newState.board.filter(t => t.colorGroup === g1).reduce((sum, t) => sum + calculateLiquidationScore(t, newState.board, player.id), 0);
      const score2 = newState.board.filter(t => t.colorGroup === g2).reduce((sum, t) => sum + calculateLiquidationScore(t, newState.board, player.id), 0);
      return score1 - score2;
    });

    const chosenGroup = groupsWithHouses[0];
    const groupTilesWithHouses = newState.board.filter(t => t.colorGroup === chosenGroup && (t.houses || 0) > 0);
    const maxHouses = Math.max(...groupTilesWithHouses.map(t => t.houses));
    const candidateTiles = groupTilesWithHouses.filter(t => t.houses === maxHouses);
    candidateTiles.sort((a, b) => compareTilesForLiquidation(a, b, newState.board, player.id));

    const tileToSellHouse = candidateTiles[0];
    if (!tileToSellHouse) break;

    newState = sellHouse(newState, tileToSellHouse.id, player.id);
    currP = newState.players.find(p => p.id === playerId);
  }

  // STAGE 2.5: Mortgage newly house-free properties
  currP = newState.players.find(p => p.id === playerId);
  if (currP && currP.money < 0) {
    const unmortgagedNewlyFree = newState.board
      .filter(t => t.ownerId === player.id && !t.isMortgaged && (t.houses || 0) === 0 && !colorGroupHasHouses(t.colorGroup))
      .sort((a, b) => compareTilesForLiquidation(a, b, newState.board, player.id));

    for (const tile of unmortgagedNewlyFree) {
      if (currP && currP.money >= 0) break;
      newState = toggleMortgage(newState, tile.id, player.id);
      currP = newState.players.find(p => p.id === playerId);
      if (currP && currP.money >= 0) break;
    }
  }

  // STAGE 3: Sell Properties to Bank (2/3 Refund)
  currP = newState.players.find(p => p.id === playerId);
  if (currP && currP.money < 0) {
    const ownedProperties = newState.board
      .filter(t => t.ownerId === player.id)
      .sort((a, b) => compareTilesForLiquidation(a, b, newState.board, player.id));

    for (const tile of ownedProperties) {
      if (currP && currP.money >= 0) break;
      newState = sellPropertyToBank(newState, tile.id, player.id);
      currP = newState.players.find(p => p.id === playerId);
      if (currP && currP.money >= 0) break;
    }
  }

  // STAGE 4: Bankruptcy if still negative after exhausting all assets
  currP = newState.players.find(p => p.id === playerId);
  if (currP && currP.money < 0) {
    newState = declareBankruptcy(newState, playerId);
  } else {
    newState.pendingAction = 'NONE';
    newState.actionMessage = undefined;
    if (currP) {
      addLog(newState, `🎉 ${currP.name} borcunu başarıyla kapattı (${currP.money}₺ bakiye)! Oyuna devam ediyor.`, 'success');
    }
  }

  return newState;
}

export function checkBankruptcy(state: GameState, player: Player) {
  if (player.money < 0) {
    if (player.isBot) {
      // 1. Bot first sells houses on its properties for 50% refund
      const botHouses = state.board.filter(t => t.ownerId === player.id && t.houses > 0);
      for (const tile of botHouses) {
        while (tile.houses > 0 && player.money < 0) {
          const refund = Math.floor((tile.houseCost || 100) / 2);
          tile.houses -= 1;
          player.money += refund;
          addTransaction(state, player, 'income', 'build_house', refund, `Bina satıldı: ${tile.name}`);
          addLog(state, `🔨 ${player.name}, borcunu ödemek için "${tile.name}" binasını ${refund}₺ karşılığında sattı.`, 'warning');
        }
        if (player.money >= 0) break;
      }

      // 2. Bot sells properties to bank (2/3 refund)
      if (player.money < 0) {
        const ownedProperties = state.board.filter(t => t.ownerId === player.id);
        for (const prop of ownedProperties) {
          const refund = Math.floor((prop.price || 100) * (2 / 3));
          player.money += refund;
          prop.ownerId = undefined;
          prop.houses = 0;
          prop.isMortgaged = false;
          addTransaction(state, player, 'income', 'bank_sell', refund, `"${prop.name}" Banka'ya satıldı`);
          addLog(state, `🏛️ ${player.name}, borcunu ödemek için "${prop.name}" mülkünü Banka'ya ${refund}₺ karşılığında sattı.`, 'warning');
          if (player.money >= 0) break;
        }
      }

      // 3. If bot still < 0, declare full bankruptcy
      if (player.money < 0) {
        player.inGame = false;
        addLog(state, `💀 ${player.name} iflas etti ve elendi!`, 'danger');
        state.board.forEach(t => {
          if (t.ownerId === player.id) {
            t.ownerId = undefined;
            t.houses = 0;
            t.isMortgaged = false;
          }
        });

        const activePlayers = state.players.filter(p => p.inGame);
        if (activePlayers.length <= 1) {
          state.phase = 'ENDED';
          state.winner = activePlayers[0] || null;
          if (activePlayers[0]) {
            addLog(state, `🏆 OYUN BİTTİ! KAZANAN: ${activePlayers[0].name}!`, 'success');
          }
        }
      }
    } else {
      // HUMAN PLAYER:
      // Check if human has ANY assets left (properties, houses)
      const ownedAssets = state.board.filter(t => t.ownerId === player.id);
      if (ownedAssets.length === 0) {
        // No assets at all -> unavoidable bankruptcy!
        player.inGame = false;
        addLog(state, `💀 ${player.name} borcunu ödeyecek hiçbir mülkü kalmadığı için iflas etti ve elendi!`, 'danger');
        state.pendingAction = 'NONE';
        state.actionMessage = undefined;
        const activePlayers = state.players.filter(p => p.inGame);
        if (activePlayers.length <= 1) {
          state.phase = 'ENDED';
          state.winner = activePlayers[0] || null;
          if (activePlayers[0]) {
            addLog(state, `🏆 OYUN BİTTİ! KAZANAN: ${activePlayers[0].name}!`, 'success');
          }
        }
      } else {
        // Human has assets -> Enter Debt Settlement mode so they can sell/mortgage/trade!
        state.pendingAction = 'DEBT_SETTLEMENT';
        state.actionMessage = `Borçtasınız (${player.money}₺)! İflas etmemek için mülk satabilir, ipotek edebilir veya takas yapabilirsiniz.`;
        addLog(state, `⚠️ ${player.name} borca girdi (${player.money}₺)! İflastan kurtulmak için mülk satışı veya takas yapması gerekiyor.`, 'danger');
      }
    }
  }
}

export function nextTurn(state: GameState): GameState {
  const newState = JSON.parse(JSON.stringify(state)) as GameState;
  
  if (newState.phase !== 'PLAYING') return newState;

  const activePlayers = newState.players.filter(p => p.inGame);
  if (activePlayers.length <= 1) {
    if (activePlayers.length === 1) {
      newState.phase = 'ENDED';
      newState.winner = activePlayers[0];
    }
    return newState;
  }

  let nextIndex = (newState.currentTurnIndex + 1) % newState.players.length;
  let loopCount = 0;
  while (!newState.players[nextIndex]?.inGame && loopCount < newState.players.length) {
    nextIndex = (nextIndex + 1) % newState.players.length;
    loopCount++;
  }

  newState.currentTurnIndex = nextIndex;
  newState.diceRolled = false;
  newState.doublesCount = 0;
  newState.pendingAction = 'NONE';
  newState.activeCard = undefined;
  newState.turnStartedAt = Date.now();

  const nextPlayer = newState.players[nextIndex];
  addLog(newState, `🔄 Sıra ${nextPlayer.name} oyuncusunda!`, 'info');

  return newState;
}

export function runBotTurn(state: GameState): GameState {
  let newState = JSON.parse(JSON.stringify(state)) as GameState;
  const currentBot = newState.players[newState.currentTurnIndex];

  if (!currentBot || !currentBot.isBot || !currentBot.inGame || newState.phase !== 'PLAYING') {
    return newState;
  }

  const difficulty: BotDifficulty = currentBot.botDifficulty || newState.settings?.botDifficulty || 'medium';

  // 0. Jail Bail decision
  if (currentBot.isJailed) {
    const bailThreshold = difficulty === 'hard' ? 150 : difficulty === 'medium' ? 250 : 400;
    if (currentBot.money >= bailThreshold) {
      newState = payJailBail(newState);
    }
  }

  // 1. Roll dice if not rolled
  if (!newState.diceRolled) {
    newState = handleRollDice(newState);
  }

  // 2. Handle pending action (Buy / Pass)
  if (newState.pendingAction === 'BUY_PROPERTY') {
    const tile = newState.board[currentBot.position];
    let shouldBuy = false;

    if (tile && tile.price) {
      if (difficulty === 'easy') {
        shouldBuy = currentBot.money >= tile.price + 50 && Math.random() > 0.55;
      } else if (difficulty === 'medium') {
        shouldBuy = currentBot.money >= tile.price + 80;
      } else {
        shouldBuy = currentBot.money >= tile.price;
      }
    }

    if (shouldBuy) {
      newState = buyProperty(newState);
    } else {
      newState = passProperty(newState);
    }
  } else if (newState.pendingAction === 'CHANCE_CARD') {
    newState = applyChanceCard(newState);
  }

  // 3. Proactive Bot-to-Bot & Bot-to-Human Trading (Attempt to complete sets!)
  newState = attemptBotProactiveTrade(newState, currentBot);

  // 4. Try building houses based on bot difficulty
  const minCashForHouse = difficulty === 'hard' ? 80 : difficulty === 'medium' ? 200 : 400;
  if (currentBot.money > minCashForHouse) {
    const ownedMonopolies = newState.board.filter(
      t => t.ownerId === currentBot.id && t.type === 'property' && hasColorGroupMonopoly(newState.board, t.colorGroup, currentBot.id)
    );
    for (const prop of ownedMonopolies) {
      const maxHouses = difficulty === 'hard' ? 5 : difficulty === 'medium' ? 4 : 2;
      if (prop.houseCost && currentBot.money >= prop.houseCost + minCashForHouse && prop.houses < maxHouses) {
        newState = buildHouse(newState, prop.id);
        break;
      }
    }
  }

  // 5. If Hard/Medium bot is low on cash (< 50) and has non-monopoly properties, sell to bank for 2/3 price
  if (currentBot.money < 50 && (difficulty === 'hard' || difficulty === 'medium')) {
    const spareProps = newState.board.filter(
      t => t.ownerId === currentBot.id && !hasColorGroupMonopoly(newState.board, t.colorGroup, currentBot.id)
    );
    if (spareProps.length > 0) {
      newState = sellPropertyToBank(newState, spareProps[0].id, currentBot.id);
    }
  }

  // 6. End turn or roll again if double
  if ((newState.doublesCount || 0) > 0 && !currentBot.isJailed) {
    newState.diceRolled = false; // Bot will roll again on next loop
  } else if (newState.pendingAction === 'NONE' && !newState.incomingTradeOffer) {
    newState = nextTurn(newState);
  }

  return newState;
}

/**
 * Calculates a player's total net worth (Cash + Properties + Buildings).
 */
export function calculatePlayerNetWorth(player: Player, board: BoardTile[]): number {
  if (!player.inGame && (player.money || 0) <= 0) {
    return 0;
  }
  const cash = Math.max(0, player.money || 0);
  const propertyVal = board
    .filter(t => t.ownerId === player.id)
    .reduce((sum, t) => {
      const basePrice = t.isMortgaged ? Math.floor((t.price || 0) / 2) : (t.price || 0);
      const houseVal = (t.houses || 0) * (t.houseCost || 100);
      return sum + basePrice + houseVal;
    }, 0);
  return cash + propertyVal;
}

/**
 * Calculates total rent income collected by a player.
 * Uses the cumulative stat `player.totalRentCollected` when available to guarantee
 * full game accuracy across bounded transaction logs, falling back to summing transactions.
 */
export function calculatePlayerRentIncome(
  playerOrId: Player | string,
  transactions?: FinancialTransaction[],
  players?: Player[]
): number {
  let player: Player | undefined;
  if (typeof playerOrId === 'object' && playerOrId !== null) {
    player = playerOrId;
  } else if (players) {
    player = players.find(p => p.id === playerOrId);
  }

  if (player && typeof player.totalRentCollected === 'number') {
    return player.totalRentCollected;
  }

  const playerId = typeof playerOrId === 'string' ? playerOrId : playerOrId.id;
  if (transactions && transactions.length > 0) {
    return transactions
      .filter(tx => tx.playerId === playerId && tx.type === 'income' && tx.category === 'rent_in')
      .reduce((sum, tx) => sum + (tx.amount || 0), 0);
  }

  return 0;
}

/**
 * Formats game duration into a clean, human-readable string.
 */
export function formatGameDuration(durationMs: number, language: 'tr' | 'en' = 'tr'): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (language === 'en') {
    return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
  }
  return `${minutes}dk ${seconds.toString().padStart(2, '0')}sn`;
}

export interface PlayerFinalRank {
  rank: number;
  player: Player;
  netWorth: number;
  isWinner: boolean;
  isBankrupt: boolean;
}

/**
 * Computes deterministic final ranking of all players in the game.
 */
export function calculateFinalRankings(
  players: Player[],
  board: BoardTile[],
  winnerId?: string
): PlayerFinalRank[] {
  if (!players || players.length === 0) return [];

  const rankedItems = players.map(p => {
    const netWorth = calculatePlayerNetWorth(p, board);
    const isWinner = Boolean(winnerId ? p.id === winnerId : p.inGame);
    const isBankrupt = !p.inGame;
    return { player: p, netWorth, isWinner, isBankrupt };
  });

  rankedItems.sort((a, b) => {
    // 1. Winner is always #1
    if (a.isWinner && !b.isWinner) return -1;
    if (!a.isWinner && b.isWinner) return 1;

    // 2. Active in-game players come before bankrupt players
    if (!a.isBankrupt && b.isBankrupt) return -1;
    if (a.isBankrupt && !b.isBankrupt) return 1;

    // 3. Higher net worth comes first
    if (b.netWorth !== a.netWorth) return b.netWorth - a.netWorth;

    // 4. Higher cash comes first
    return (b.player.money || 0) - (a.player.money || 0);
  });

  return rankedItems.map((item, index) => ({
    rank: index + 1,
    player: item.player,
    netWorth: item.netWorth,
    isWinner: item.isWinner,
    isBankrupt: item.isBankrupt
  }));
}

