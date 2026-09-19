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

export const PLAYER_AVATARS = ['🏎️', '🎩', '🐕', '⛵', '🐱', '🚀'];

export function createInitialState(settings?: Partial<GameSettings>): GameState {
  const mergedSettings: GameSettings = {
    startingMoney: settings?.startingMoney ?? 1500,
    passGoSalary: settings?.passGoSalary ?? 200,
    firstLapBuyLimit: settings?.firstLapBuyLimit ?? 0, // 0 = unlimited, 1..4
    botDifficulty: settings?.botDifficulty ?? 'medium',
    roomCode: settings?.roomCode ?? `TR-${Math.floor(1000 + Math.random() * 9000)}`
  };

  return {
    roomId: mergedSettings.roomCode,
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
        text: 'Pococoly 26 Şehir, 4 İskele, Şans & Kamu Fonlu Masa Oyunu lobisi hazır!',
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

// Execute Trade Offer between players or with Bot AI
export function executeTrade(state: GameState, offer: TradeOffer): GameState {
  const newState = JSON.parse(JSON.stringify(state)) as GameState;
  const fromPlayer = newState.players.find(p => p.id === offer.fromPlayerId);
  const toPlayer = newState.players.find(p => p.id === offer.toPlayerId);

  if (!fromPlayer || !toPlayer) return newState;

  // Bot AI Evaluation
  if (toPlayer.isBot) {
    let offeredTotal = offer.offeredMoney;
    let requestedTotal = offer.requestedMoney;

    offer.offeredTileIds.forEach(id => {
      const t = newState.board.find(b => b.id === id);
      if (t?.price) offeredTotal += t.price;
    });

    offer.requestedTileIds.forEach(id => {
      const t = newState.board.find(b => b.id === id);
      if (t?.price) requestedTotal += t.price;
    });

    // Check if bot can afford requested money
    if (toPlayer.money < offer.requestedMoney) {
      addLog(newState, `❌ ${toPlayer.name} yeterli parası olmadığı için takas teklifini reddetti.`, 'warning');
      return newState;
    }

    // Bot accepts if offered value >= 90% of requested value
    if (offeredTotal < requestedTotal * 0.9) {
      addLog(newState, `❌ ${toPlayer.name} takas teklifini yetersiz bularak reddetti. (Teklif: ₺${offeredTotal}, İstenen: ₺${requestedTotal})`, 'warning');
      return newState;
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

  return newState;
}

export function handleRollDice(state: GameState): GameState {
  const newState = JSON.parse(JSON.stringify(state)) as GameState;
  const player = newState.players[newState.currentTurnIndex];

  if (!player || newState.diceRolled || newState.phase !== 'PLAYING') {
    return newState;
  }

  const dice = rollDice();
  const diceTotal = dice[0] + dice[1];
  const isDouble = dice[0] === dice[1];

  newState.dice = dice;
  newState.diceRolled = true;

  addLog(newState, `${player.name} zar attı: 🎲 ${dice[0]} - ${dice[1]} (Toplam: ${diceTotal})`, 'action');

  // Jail / Kodes check
  if (player.isJailed) {
    if (isDouble) {
      player.isJailed = false;
      player.jailTurns = 0;
      addLog(newState, `🎉 ${player.name} çift zar atarak kodesten ücretsiz çıktı!`, 'success');
    } else {
      player.jailTurns += 1;
      if (player.jailTurns >= 3) {
        player.isJailed = false;
        player.money -= JAIL_BAIL_AMOUNT;
        player.jailTurns = 0;
        addTransaction(newState, player, 'expense', 'bail', JAIL_BAIL_AMOUNT, '3 tur kodes sonrası zorunlu kefalet ödendi');
        addLog(newState, `⚠️ ${player.name} 3 tur bekledi ve ${JAIL_BAIL_AMOUNT}₺ ödeyerek kodesten çıktı.`, 'warning');
      } else {
        addLog(newState, `🔒 ${player.name} kodeste kaldı (${player.jailTurns}/3 tur).`, 'info');
        newState.pendingAction = 'NONE';
        return newState;
      }
    }
  }

  // Doubles streak
  if (isDouble && !player.isJailed) {
    newState.doublesCount += 1;
    if (newState.doublesCount >= 3) {
      player.position = JAIL_TILE_INDEX;
      player.isJailed = true;
      player.jailTurns = 0;
      newState.doublesCount = 0;
      addLog(newState, `🚨 3 kez üst üste çift atan ${player.name} kodese tıkıldı!`, 'danger');
      newState.pendingAction = 'NONE';
      return newState;
    }
  } else {
    newState.doublesCount = 0;
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

  return handleTileLanding(newState, player, currentTile);
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
  return handleTileLanding(newState, player, currentTile);
}

export function handleTileLanding(
  state: GameState, 
  player: Player, 
  tile: BoardTile
): GameState {
  switch (tile.type) {
    case 'gotojail':
      player.position = JAIL_TILE_INDEX;
      player.isJailed = true;
      player.jailTurns = 0;
      addLog(state, `🚨 ${player.name} doğrudan Kodese yollandı! (100₺ ödeyerek çıkabilir)`, 'danger');
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

export function applyChanceCard(state: GameState): GameState {
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
  }

  newState.activeCard = undefined;
  newState.pendingAction = 'NONE';
  return newState;
}

export function buyProperty(state: GameState): GameState {
  const newState = JSON.parse(JSON.stringify(state)) as GameState;
  const player = newState.players[newState.currentTurnIndex];
  const currentTile = newState.board[player.position];

  if (!currentTile || currentTile.ownerId || !currentTile.price) return newState;

  // Rule: Check First Lap Buy Limit
  const limit = newState.settings?.firstLapBuyLimit || 0;
  if (limit > 0 && (player.lapsCompleted || 0) === 0 && (player.firstLapPurchases || 0) >= limit) {
    addLog(newState, `⚠️ ${player.name} ilk tur mülk alım sınırına (${limit} adet) ulaştığı için Başlangıç noktasını geçene kadar başka mülk alamaz!`, 'warning');
    newState.pendingAction = 'NONE';
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
  return newState;
}

export function passProperty(state: GameState): GameState {
  const newState = JSON.parse(JSON.stringify(state)) as GameState;
  const player = newState.players[newState.currentTurnIndex];
  const currentTile = newState.board[player.position];

  if (currentTile) {
    addLog(newState, `⏩ ${player.name}, "${currentTile.name}" mülkünü satın almayıp pas geçti.`, 'info');
  }

  newState.pendingAction = 'NONE';
  newState.actionMessage = undefined;
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

  return newState;
}

export function buildHouse(state: GameState, tileId: number): GameState {
  const newState = JSON.parse(JSON.stringify(state)) as GameState;
  const player = newState.players[newState.currentTurnIndex];
  const tile = newState.board[tileId];

  if (!tile || tile.ownerId !== player.id || !tile.houseCost || tile.houses >= 5) return newState;

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
  }

  return newState;
}

export function toggleMortgage(state: GameState, tileId: number): GameState {
  const newState = JSON.parse(JSON.stringify(state)) as GameState;
  const player = newState.players[newState.currentTurnIndex];
  const tile = newState.board[tileId];

  if (!tile || tile.ownerId !== player.id || !tile.price) return newState;

  const mortgageValue = Math.floor(tile.price / 2);

  if (tile.isMortgaged) {
    const unmortgageCost = Math.floor(mortgageValue * 1.1);
    if (player.money >= unmortgageCost) {
      player.money -= unmortgageCost;
      tile.isMortgaged = false;
      addTransaction(newState, player, 'expense', 'mortgage', unmortgageCost, `"${tile.name}" ipoteği kaldırıldı`);
      addLog(newState, `🔓 ${player.name}, "${tile.name}" ipoteğini ${unmortgageCost}₺ ödeyerek kaldırdı.`, 'info');
    }
  } else {
    if (tile.houses > 0) {
      addLog(newState, `⚠️ Üzerinde ev bulunan mülk ipotek ettirilemez!`, 'warning');
      return newState;
    }
    player.money += mortgageValue;
    tile.isMortgaged = true;
    addTransaction(newState, player, 'income', 'mortgage', mortgageValue, `"${tile.name}" ipoteğe verildi`);
    addLog(newState, `🔒 ${player.name}, "${tile.name}" mülkünü ${mortgageValue}₺ karşılığında ipotek etti.`, 'warning');
  }

  return newState;
}


export function checkBankruptcy(state: GameState, player: Player) {
  if (player.money < 0) {
    // If player has properties, try auto-selling to bank to survive
    const ownedProperties = state.board.filter(t => t.ownerId === player.id);
    if (ownedProperties.length > 0 && player.isBot) {
      for (const prop of ownedProperties) {
        if (player.money >= 0) break;
        sellPropertyToBank(state, prop.id, player.id);
      }
    }

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
      if (activePlayers.length === 1) {
        state.phase = 'ENDED';
        state.winner = activePlayers[0];
        addLog(state, `🏆 OYUN BİTTİ! KAZANAN: ${activePlayers[0].name}!`, 'success');
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
  while (!newState.players[nextIndex].inGame) {
    nextIndex = (nextIndex + 1) % newState.players.length;
  }

  newState.currentTurnIndex = nextIndex;
  newState.diceRolled = false;
  newState.doublesCount = 0;
  newState.pendingAction = 'NONE';
  newState.activeCard = undefined;

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
        // 50% chance to buy if money permits
        shouldBuy = currentBot.money >= tile.price + 100 && Math.random() > 0.4;
      } else if (difficulty === 'medium') {
        // Buy if remaining cash > 100
        shouldBuy = currentBot.money >= tile.price + 80;
      } else {
        // Hard bot: Buys aggressively (even with 20₺ left) or if completes monopoly / blocks player
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

  // 3. Try building houses based on bot difficulty
  const minCashForHouse = difficulty === 'hard' ? 100 : difficulty === 'medium' ? 250 : 500;
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

  // 4. If Hard/Medium bot is low on cash (< 50) and has non-monopoly properties, sell to bank for 2/3 price
  if (currentBot.money < 50 && (difficulty === 'hard' || difficulty === 'medium')) {
    const spareProps = newState.board.filter(
      t => t.ownerId === currentBot.id && !hasColorGroupMonopoly(newState.board, t.colorGroup, currentBot.id)
    );
    if (spareProps.length > 0) {
      newState = sellPropertyToBank(newState, spareProps[0].id, currentBot.id);
    }
  }

  // 5. End turn
  newState = nextTurn(newState);

  return newState;
}
