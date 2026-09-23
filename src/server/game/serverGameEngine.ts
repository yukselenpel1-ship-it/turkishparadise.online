import crypto from 'crypto';
import {
  GameState,
  Player,
  BoardTile,
  GameLog,
  ActionType,
  ChanceCard,
  TradeOffer,
  FinancialTransaction,
  GameSettings,
  BotDifficulty
} from '../../types/game';
import {
  INITIAL_BOARD
} from '../../data/boardData';
import {
  CHANCE_CARDS
} from '../../data/chanceCards';
import {
  calculateRent,
  hasColorGroupMonopoly,
  JAIL_TILE_INDEX,
  TOTAL_TILES,
  JAIL_BAIL_AMOUNT,
  isPlayerHost,
  executeTrade,
  evaluateTradeOfferByBot,
  PLAYER_COLORS,
  PLAYER_AVATARS
} from '../../engine/gameEngine';
import { GameAction } from '../storage/roomStorage';

export interface AuthenticatedActor {
  userId: string;
  googleSub?: string;
  displayName?: string;
  participantKey?: string;
  isGuest?: boolean;
  isHost?: boolean;
}

export type ServerErrorCode =
  | 'NOT_YOUR_TURN'
  | 'INVALID_ACTION'
  | 'INVALID_PHASE'
  | 'PLAYER_NOT_FOUND'
  | 'UNAUTHORIZED_PLAYER'
  | 'INSUFFICIENT_FUNDS'
  | 'PROPERTY_UNAVAILABLE'
  | 'INVALID_PROPERTY'
  | 'INVALID_TRADE'
  | 'INVALID_FORCE_BUY'
  | 'VERSION_CONFLICT'
  | 'DUPLICATE_ACTION'
  | 'STORAGE_UNAVAILABLE'
  | 'DICE_ALREADY_ROLLED'
  | 'DICE_NOT_ROLLED';

export interface ServerGameEvent {
  type:
    | 'DICE_ROLLED'
    | 'PROPERTY_PURCHASED'
    | 'PROPERTY_PASSED'
    | 'RENT_PAID'
    | 'TAX_PAID'
    | 'HOUSE_BUILT'
    | 'HOUSE_SOLD'
    | 'MORTGAGE_TOGGLED'
    | 'TRADE_COMPLETED'
    | 'JAIL_STATUS'
    | 'BANKRUPTCY'
    | 'TURN_CHANGED'
    | 'GAME_STARTED';
  actorPlayerId: string;
  targetPlayerId?: string;
  tileId?: number;
  amount?: number;
  dice?: [number, number];
  actionId?: string;
  timestamp: number;
}

export interface ActionResult {
  success: boolean;
  state?: GameState;
  events?: ServerGameEvent[];
  error?: ServerErrorCode;
  errorMessage?: string;
}

export interface EngineOptions {
  rng?: () => [number, number];
  now?: number;
}

/**
 * Production Crypto RNG: Uses crypto.randomInt for server-side non-deterministic dice rolls
 */
export function defaultCryptoRng(): [number, number] {
  const d1 = crypto.randomInt(1, 7);
  const d2 = crypto.randomInt(1, 7);
  return [d1, d2];
}

/**
 * Helper to add financial transaction with bounded array
 */
function addServerTransaction(
  state: GameState,
  player: Player,
  type: 'income' | 'expense',
  category: any,
  amount: number,
  description: string
) {
  if (amount <= 0) return;
  const tx: FinancialTransaction = {
    id: `tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
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
  state.transactions = [tx, ...(state.transactions || [])].slice(0, 50);
}

/**
 * Helper to add game log with bounded array
 */
function addServerLog(state: GameState, text: string, type: GameLog['type'] = 'info') {
  const log: GameLog = {
    id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    text,
    type
  };
  state.logs = [log, ...(state.logs || []).slice(0, 29)];
}

/**
 * Advance turn to next active player
 */
export function advanceServerTurn(state: GameState): GameState {
  const activePlayers = state.players.filter(p => p.inGame);
  if (activePlayers.length <= 1) {
    if (activePlayers.length === 1) {
      state.phase = 'ENDED';
      state.winner = activePlayers[0];
      addServerLog(state, `🏆 OYUN BİTTİ! KAZANAN: ${activePlayers[0].name}!`, 'success');
    }
    return state;
  }

  let nextIndex = (state.currentTurnIndex + 1) % state.players.length;
  let loopCount = 0;
  while (!state.players[nextIndex]?.inGame && loopCount < state.players.length) {
    nextIndex = (nextIndex + 1) % state.players.length;
    loopCount++;
  }

  state.currentTurnIndex = nextIndex;
  state.diceRolled = false;
  state.doublesCount = 0;
  state.pendingAction = 'NONE';
  state.activeCard = undefined;
  state.turnStartedAt = Date.now();

  const nextPlayer = state.players[nextIndex];
  if (nextPlayer) {
    addServerLog(state, `🔄 Sıra ${nextPlayer.name} oyuncusunda!`, 'info');
  }

  // Ensure hostPlayerId is migrated to an active in-game human player if current host is inactive
  const currentHost = state.players.find(p => p.id === state.hostPlayerId);
  if (!currentHost || !currentHost.inGame) {
    const nextHost = state.players.find(p => p.inGame && !p.isBot);
    if (nextHost) {
      state.hostPlayerId = nextHost.id;
      state.players.forEach(p => {
        p.isHost = p.id === nextHost.id;
      });
    }
  }

  return state;
}

/**
 * Central Server-Side Game Action Dispatcher
 */
export function applyGameAction(
  state: GameState,
  action: GameAction,
  authenticatedActor: AuthenticatedActor,
  options?: EngineOptions
): ActionResult {
  const now = options?.now || Date.now();
  const rng = options?.rng || defaultCryptoRng;

  // 1. Basic State Validation
  if (!state || typeof state !== 'object') {
    return { success: false, error: 'INVALID_ACTION', errorMessage: 'Oda durumu geçersiz.' };
  }

  // Clone state for pure execution
  const nextState: GameState = JSON.parse(JSON.stringify(state));
  const events: ServerGameEvent[] = [];

  const { type, actionId } = action;

  // --------------------------------------------------------------------------
  // CHAT MESSAGE ACTION (Lobby & In-Game)
  // --------------------------------------------------------------------------
  if (type === 'CHAT_MESSAGE') {
    const rawText = action.payload?.text;
    if (typeof rawText !== 'string' || rawText.trim().length === 0) {
      return { success: false, error: 'INVALID_ACTION', errorMessage: 'Mesaj metni boş olamaz.' };
    }

    const cleanText = rawText.trim().substring(0, 250);
    const senderPlayer = nextState.players.find(p => p.id === action.playerId);
    const senderName = senderPlayer ? senderPlayer.name : authenticatedActor.displayName || 'Oyuncu';
    const senderAvatar = senderPlayer ? senderPlayer.avatar : '👤';
    const senderColor = senderPlayer ? senderPlayer.color : '#3B82F6';

    const newMsg = {
      id: `chat_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      senderId: action.playerId,
      senderName,
      senderAvatar,
      senderColor,
      text: cleanText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    nextState.chatMessages = [...(nextState.chatMessages || []), newMsg].slice(-50);
    return { success: true, state: nextState, events };
  }

  // --------------------------------------------------------------------------
  // ROOM MANAGEMENT ACTIONS (Host Authorized, Lobby Phase)
  // --------------------------------------------------------------------------
  if (type === 'START_GAME' || type === 'ADD_BOT' || type === 'REMOVE_BOT' || type === 'UPDATE_SETTINGS') {
    const isActorHost =
      authenticatedActor.isHost ||
      nextState.hostPlayerId === authenticatedActor.userId ||
      nextState.players.some(p => p.id === action.playerId && p.isHost && (p.userId === authenticatedActor.userId || p.participantKey === authenticatedActor.participantKey));

    if (!isActorHost) {
      return { success: false, error: 'UNAUTHORIZED_PLAYER', errorMessage: 'Bu işlemi sadece oda kurucusu yapabilir.' };
    }
    if (nextState.phase !== 'LOBBY') {
      return { success: false, error: 'INVALID_PHASE', errorMessage: 'Bu işlem yalnızca lobi aşamasında yapılabilir.' };
    }

    if (type === 'ADD_BOT') {
      if (nextState.players.length >= 6) {
        return { success: false, error: 'INVALID_ACTION', errorMessage: 'Oda maksimum oyuncu kapasitesine (6) ulaştı.' };
      }

      const botDifficulty = action.payload?.difficulty || nextState.settings?.botDifficulty || 'medium';
      const botIndex = nextState.players.filter(p => p.isBot).length + 1;
      const botNames = ['Zeki Bot', 'Usta Bot', 'Stratejist Bot', 'Tüccar Bot', 'Kurnaz Bot'];
      const botName = botNames[botIndex - 1] || `Bot ${botIndex}`;
      const usedAvatars = new Set(nextState.players.map(p => p.avatar));
      const usedColors = new Set(nextState.players.map(p => p.color));

      const avatar = PLAYER_AVATARS.find(a => !usedAvatars.has(a)) || '🤖';
      const color = PLAYER_COLORS.find(c => !usedColors.has(c)) || '#8B5CF6';

      const botPlayer: Player = {
        id: `bot_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        name: botName,
        avatar,
        color,
        money: nextState.settings?.startingMoney || 1500,
        position: 0,
        isJailed: false,
        jailTurns: 0,
        inGame: true,
        isBot: true,
        botDifficulty,
        isHost: false,
        lapsCompleted: 0,
        firstLapPurchases: 0
      };

      nextState.players.push(botPlayer);
      addServerLog(nextState, `🤖 ${botName} (${botDifficulty === 'hard' ? 'Zor' : botDifficulty === 'easy' ? 'Kolay' : 'Orta'}) lobiye katıldı.`, 'info');
      return { success: true, state: nextState, events };
    }

    if (type === 'REMOVE_BOT') {
      const targetBotId = action.payload?.botId;
      const botIdx = targetBotId
        ? nextState.players.findIndex(p => p.id === targetBotId && p.isBot)
        : nextState.players.map(p => p.isBot).lastIndexOf(true);

      if (botIdx === -1) {
        return { success: false, error: 'PLAYER_NOT_FOUND', errorMessage: 'Çıkarılacak bot bulunamadı.' };
      }

      const removed = nextState.players.splice(botIdx, 1)[0];
      addServerLog(nextState, `🤖 ${removed.name} lobiden çıkarıldı.`, 'info');
      return { success: true, state: nextState, events };
    }

    if (type === 'UPDATE_SETTINGS') {
      const newSettings = action.payload || {};
      nextState.settings = {
        ...nextState.settings,
        startingMoney: typeof newSettings.startingMoney === 'number' ? newSettings.startingMoney : nextState.settings?.startingMoney || 1500,
        passGoSalary: typeof newSettings.passGoSalary === 'number' ? newSettings.passGoSalary : nextState.settings?.passGoSalary || 200,
        firstLapBuyLimit: typeof newSettings.firstLapBuyLimit === 'number' ? newSettings.firstLapBuyLimit : nextState.settings?.firstLapBuyLimit || 0,
        botDifficulty: newSettings.botDifficulty || nextState.settings?.botDifficulty || 'medium',
        isPublic: typeof newSettings.isPublic === 'boolean' ? newSettings.isPublic : nextState.settings?.isPublic || false
      };

      addServerLog(nextState, '⚙️ Oyun ayarları oda kurucusu tarafından güncellendi.', 'info');
      return { success: true, state: nextState, events };
    }

    if (type === 'START_GAME') {
      if (nextState.players.length < 2) {
        return { success: false, error: 'INVALID_PHASE', errorMessage: 'Oyunu başlatmak için en az 2 oyuncu gerekir.' };
      }

      const startMoney = nextState.settings?.startingMoney || 1500;
      nextState.players = nextState.players.map(p => ({
        ...p,
        money: startMoney,
        lapsCompleted: 0,
        firstLapPurchases: 0
      }));
      nextState.phase = 'PLAYING';
      nextState.currentTurnIndex = 0;
      nextState.diceRolled = false;
      nextState.doublesCount = 0;
      nextState.turnStartedAt = now;
      addServerLog(nextState, '🎮 Turkish Paradise oyunu başladı! İyi şanslar!', 'success');

      events.push({
        type: 'GAME_STARTED',
        actorPlayerId: action.playerId,
        actionId,
        timestamp: now
      });

      return { success: true, state: nextState, events };
    }
  }

  // --------------------------------------------------------------------------
  // IN-GAME ACTIONS VALIDATION
  // --------------------------------------------------------------------------
  if (nextState.phase !== 'PLAYING') {
    return { success: false, error: 'INVALID_PHASE', errorMessage: 'Oyun henüz başlamadı veya sona erdi.' };
  }

  // Resolve Acting Player
  const actingPlayer = nextState.players.find(p => p.id === action.playerId);
  if (!actingPlayer) {
    return { success: false, error: 'PLAYER_NOT_FOUND', errorMessage: 'Oyuncu odada bulunamadı.' };
  }

  // Verify Authenticated Actor matches Acting Player
  const matchesUserId = actingPlayer.userId && authenticatedActor.userId && actingPlayer.userId === authenticatedActor.userId;
  const matchesParticipantKey = actingPlayer.participantKey && authenticatedActor.participantKey && actingPlayer.participantKey === authenticatedActor.participantKey;
  const matchesDirectId = actingPlayer.id === authenticatedActor.userId;

  if (!matchesUserId && !matchesParticipantKey && !matchesDirectId && process.env.NODE_ENV === 'production') {
    return { success: false, error: 'UNAUTHORIZED_PLAYER', errorMessage: 'Kimlik doğrulaması başarısız: Yetkisiz oyuncu.' };
  }

  if (!actingPlayer.inGame) {
    return { success: false, error: 'INVALID_ACTION', errorMessage: 'Elenen oyuncular hamle yapamaz.' };
  }

  const currentTurnPlayer = nextState.players[nextState.currentTurnIndex];

  // --------------------------------------------------------------------------
  // ACTION: ROLL_DICE
  // --------------------------------------------------------------------------
  if (type === 'ROLL_DICE') {
    if (!currentTurnPlayer || currentTurnPlayer.id !== actingPlayer.id) {
      return { success: false, error: 'NOT_YOUR_TURN', errorMessage: 'Zar atma sırası sizde değil!' };
    }
    if (nextState.diceRolled) {
      return { success: false, error: 'DICE_ALREADY_ROLLED', errorMessage: 'Zar zaten atıldı!' };
    }

    // 🎲 Server generates random dice via injected / crypto RNG (never from payload!)
    const dice = rng();
    const diceTotal = dice[0] + dice[1];
    const isDouble = dice[0] === dice[1];

    nextState.dice = dice;
    nextState.diceRolled = true;

    // JAIL HANDLING
    if (actingPlayer.isJailed) {
      if (isDouble) {
        actingPlayer.isJailed = false;
        actingPlayer.jailTurns = 0;
        nextState.doublesCount = 0;
        addServerLog(nextState, `🎉 ${actingPlayer.name} çift zar atarak (${dice[0]}-${dice[1]}) kodesten ücretsiz çıktı!`, 'success');
      } else {
        actingPlayer.jailTurns = (actingPlayer.jailTurns || 0) + 1;
        if (actingPlayer.jailTurns >= 3) {
          actingPlayer.isJailed = false;
          actingPlayer.jailTurns = 0;
          nextState.doublesCount = 0;
          addServerLog(nextState, `🔓 ${actingPlayer.name} 3 tur kodes süresini tamamladı ve serbest kaldı.`, 'success');
        } else {
          nextState.pendingAction = 'NONE';
          addServerLog(nextState, `🔒 ${actingPlayer.name} (${dice[0]}-${dice[1]}) attı ve kodeste kaldı (${actingPlayer.jailTurns}/3 tur).`, 'info');
          events.push({ type: 'DICE_ROLLED', actorPlayerId: actingPlayer.id, dice, actionId, timestamp: now });
          return { success: true, state: nextState, events };
        }
      }
    }

    // DOUBLES STREAK (3 doubles in a row -> Jail)
    if (isDouble && !actingPlayer.isJailed) {
      const nextDoubles = (nextState.doublesCount || 0) + 1;
      if (nextDoubles >= 3) {
        actingPlayer.position = JAIL_TILE_INDEX;
        actingPlayer.isJailed = true;
        actingPlayer.jailTurns = 0;
        nextState.doublesCount = 0;
        nextState.pendingAction = 'NONE';
        addServerLog(nextState, `🚨 3 kez üst üste çift atan (${dice[0]}-${dice[1]}) ${actingPlayer.name} doğrudan Kodese gönderildi!`, 'danger');
        events.push({ type: 'DICE_ROLLED', actorPlayerId: actingPlayer.id, dice, actionId, timestamp: now });
        return { success: true, state: nextState, events };
      } else {
        nextState.doublesCount = nextDoubles;
        addServerLog(nextState, `🎲 ${actingPlayer.name} çift attı: 🎲 ${dice[0]} - ${dice[1]}! İlerledikten sonra bir kez daha zar atacak! (${nextDoubles}/3)`, 'success');
      }
    } else {
      nextState.doublesCount = 0;
      addServerLog(nextState, `${actingPlayer.name} zar attı: 🎲 ${dice[0]} - ${dice[1]} (Toplam: ${diceTotal})`, 'action');
    }

    // BOARD MOVEMENT & PASS GO SALARY
    const oldPos = actingPlayer.position;
    const newPos = (oldPos + diceTotal) % TOTAL_TILES;
    actingPlayer.position = newPos;

    if (newPos < oldPos) {
      actingPlayer.lapsCompleted = (actingPlayer.lapsCompleted || 0) + 1;
      const salary = nextState.settings?.passGoSalary || 200;
      actingPlayer.money += salary;
      addServerTransaction(nextState, actingPlayer, 'income', 'salary', salary, 'Başlangıç noktasından geçildi: Tur maaşı alındı');
      addServerLog(nextState, `💰 ${actingPlayer.name} Başlangıç noktasından geçti (+${salary}₺)`, 'success');
    }

    const currentTile = nextState.board[newPos];
    addServerLog(nextState, `📍 ${actingPlayer.name} "${currentTile.name}" karesine geldi.`, 'info');

    // RESOLVE DESTINATION TILE
    if (currentTile.type === 'tax') {
      const tax = currentTile.taxAmount || 100;
      actingPlayer.money -= tax;
      addServerTransaction(nextState, actingPlayer, 'expense', 'tax', tax, `${currentTile.name}: Vergi ödendi`);
      addServerLog(nextState, `🏛️ ${actingPlayer.name}, ${currentTile.name} için ${tax}₺ vergi ödedi.`, 'warning');
      nextState.pendingAction = 'NONE';
      events.push({ type: 'TAX_PAID', actorPlayerId: actingPlayer.id, amount: tax, actionId, timestamp: now });
    } else if (currentTile.type === 'gotojail') {
      actingPlayer.position = JAIL_TILE_INDEX;
      actingPlayer.isJailed = true;
      actingPlayer.jailTurns = 0;
      nextState.doublesCount = 0;
      nextState.pendingAction = 'NONE';
      addServerLog(nextState, `🚨 ${actingPlayer.name} doğrudan Kodese yollandı!`, 'danger');
    } else if (currentTile.type === 'property' || currentTile.type === 'station') {
      if (!currentTile.ownerId) {
        const limit = nextState.settings?.firstLapBuyLimit || 0;
        if (limit > 0 && (actingPlayer.lapsCompleted || 0) === 0 && (actingPlayer.firstLapPurchases || 0) >= limit) {
          addServerLog(nextState, `⚠️ ${actingPlayer.name} ilk tur mülk alım sınırına (${limit} adet) ulaştığı için bu mülkü satın alamaz.`, 'warning');
          nextState.pendingAction = 'NONE';
        } else {
          nextState.pendingAction = 'BUY_PROPERTY';
          nextState.actionMessage = `"${currentTile.name}" mülkünü ${currentTile.price}₺ karşılığında satın almak ister misiniz?`;
        }
      } else if (currentTile.ownerId !== actingPlayer.id && !currentTile.isMortgaged) {
        const rent = calculateRent(currentTile, nextState.board);
        const owner = nextState.players.find(p => p.id === currentTile.ownerId);
        if (owner && rent > 0) {
          actingPlayer.money -= rent;
          owner.money += rent;
          addServerTransaction(nextState, actingPlayer, 'expense', 'rent_out', rent, `${owner.name} kullanıcısına "${currentTile.name}" kirası ödendi`);
          addServerTransaction(nextState, owner, 'income', 'rent_in', rent, `${actingPlayer.name} kullanıcısından "${currentTile.name}" kirası tahsil edildi`);
          addServerLog(nextState, `🏠 ${actingPlayer.name}, ${owner.name} kullanıcısına "${currentTile.name}" için ${rent}₺ kira ödedi.`, 'warning');
          events.push({ type: 'RENT_PAID', actorPlayerId: actingPlayer.id, targetPlayerId: owner.id, amount: rent, actionId, timestamp: now });
        }
        nextState.pendingAction = 'NONE';
      } else {
        nextState.pendingAction = 'NONE';
      }
    } else if (currentTile.type === 'chance' || currentTile.type === 'chest') {
      const card = CHANCE_CARDS[Math.floor(Math.random() * CHANCE_CARDS.length)];
      nextState.activeCard = card;
      nextState.pendingAction = 'CHANCE_CARD';
      nextState.actionMessage = `${currentTile.type === 'chance' ? 'Şans' : 'Kamu Fonu'} Kartı: ${card.title}`;
    } else {
      nextState.pendingAction = 'NONE';
    }

    // Re-enable roll if doubles and no pending modal
    if ((nextState.doublesCount || 0) > 0 && !actingPlayer.isJailed && nextState.pendingAction === 'NONE') {
      nextState.diceRolled = false;
      addServerLog(nextState, `🎲 Çift zar avantajı: Sıra yine ${actingPlayer.name} oyuncusunda! Tekrar zar atabilirsiniz.`, 'info');
    }

    events.push({ type: 'DICE_ROLLED', actorPlayerId: actingPlayer.id, dice, actionId, timestamp: now });
    return { success: true, state: nextState, events };
  }

  // --------------------------------------------------------------------------
  // ACTION: BUY_PROPERTY
  // --------------------------------------------------------------------------
  if (type === 'BUY_PROPERTY') {
    if (!currentTurnPlayer || currentTurnPlayer.id !== actingPlayer.id) {
      return { success: false, error: 'NOT_YOUR_TURN', errorMessage: 'Mülk satın alma sırası sizde değil!' };
    }
    if (nextState.pendingAction !== 'BUY_PROPERTY') {
      return { success: false, error: 'INVALID_ACTION', errorMessage: 'Şu an bir mülk satın alma aşamasında değilsiniz.' };
    }

    const currentTile = nextState.board[actingPlayer.position];
    if (!currentTile || currentTile.ownerId || !currentTile.price) {
      return { success: false, error: 'PROPERTY_UNAVAILABLE', errorMessage: 'Bu mülk satın alınamaz veya zaten sahipli.' };
    }
    if (actingPlayer.money < currentTile.price) {
      return { success: false, error: 'INSUFFICIENT_FUNDS', errorMessage: `Yetersiz bakiye! Mülk fiyatı: ${currentTile.price}₺, bakiyeniz: ${actingPlayer.money}₺.` };
    }

    actingPlayer.money -= currentTile.price;
    currentTile.ownerId = actingPlayer.id;
    addServerTransaction(nextState, actingPlayer, 'expense', 'buy', currentTile.price, `"${currentTile.name}" mülkü satın alındı`);

    if ((actingPlayer.lapsCompleted || 0) === 0) {
      actingPlayer.firstLapPurchases = (actingPlayer.firstLapPurchases || 0) + 1;
    }

    addServerLog(nextState, `🏘️ ${actingPlayer.name}, "${currentTile.name}" mülkünü ${currentTile.price}₺ karşılığında satın aldı!`, 'success');
    if (currentTile.colorGroup && hasColorGroupMonopoly(nextState.board, currentTile.colorGroup, actingPlayer.id)) {
      addServerLog(nextState, `🎉 TEBRİKLER! ${actingPlayer.name} "${currentTile.name}" ile renk serisini tamamladı! Artık ev dikebilir!`, 'success');
    }

    nextState.pendingAction = 'NONE';
    nextState.actionMessage = undefined;

    if ((nextState.doublesCount || 0) > 0 && !actingPlayer.isJailed) {
      nextState.diceRolled = false;
    }

    events.push({ type: 'PROPERTY_PURCHASED', actorPlayerId: actingPlayer.id, tileId: currentTile.id, amount: currentTile.price, actionId, timestamp: now });
    return { success: true, state: nextState, events };
  }

  // --------------------------------------------------------------------------
  // ACTION: PASS_PROPERTY
  // --------------------------------------------------------------------------
  if (type === 'PASS_PROPERTY') {
    if (!currentTurnPlayer || currentTurnPlayer.id !== actingPlayer.id) {
      return { success: false, error: 'NOT_YOUR_TURN', errorMessage: 'Pas geçme sırası sizde değil!' };
    }
    if (nextState.pendingAction !== 'BUY_PROPERTY') {
      return { success: false, error: 'INVALID_ACTION', errorMessage: 'Şu an satın alma aşamasında değilsiniz.' };
    }

    nextState.pendingAction = 'NONE';
    nextState.actionMessage = undefined;
    addServerLog(nextState, `⏩ ${actingPlayer.name} mülkü satın almayıp pas geçti.`, 'info');

    if ((nextState.doublesCount || 0) > 0 && !actingPlayer.isJailed) {
      nextState.diceRolled = false;
    }

    events.push({ type: 'PROPERTY_PASSED', actorPlayerId: actingPlayer.id, actionId, timestamp: now });
    return { success: true, state: nextState, events };
  }

  // --------------------------------------------------------------------------
  // ACTION: END_TURN
  // --------------------------------------------------------------------------
  if (type === 'END_TURN') {
    if (!currentTurnPlayer || currentTurnPlayer.id !== actingPlayer.id) {
      return { success: false, error: 'NOT_YOUR_TURN', errorMessage: 'Turu bitirme sırası sizde değil!' };
    }
    if (!nextState.diceRolled) {
      return { success: false, error: 'DICE_NOT_ROLLED', errorMessage: 'Zar atmadan turu bitiremezsiniz!' };
    }
    if (nextState.pendingAction !== 'NONE') {
      return { success: false, error: 'INVALID_ACTION', errorMessage: 'Bekleyen eylemi tamamlamadan turu bitiremezsiniz.' };
    }

    const updatedState = advanceServerTurn(nextState);
    events.push({ type: 'TURN_CHANGED', actorPlayerId: actingPlayer.id, actionId, timestamp: now });
    return { success: true, state: updatedState, events };
  }

  // --------------------------------------------------------------------------
  // ACTION: PAY_JAIL
  // --------------------------------------------------------------------------
  if (type === 'PAY_JAIL') {
    if (!currentTurnPlayer || currentTurnPlayer.id !== actingPlayer.id) {
      return { success: false, error: 'NOT_YOUR_TURN', errorMessage: 'Kefalet ödeme sırası sizde değil!' };
    }
    if (!actingPlayer.isJailed) {
      return { success: false, error: 'INVALID_ACTION', errorMessage: 'Kodeste değilsiniz.' };
    }
    if (actingPlayer.money < JAIL_BAIL_AMOUNT) {
      return { success: false, error: 'INSUFFICIENT_FUNDS', errorMessage: `Kefalet için ${JAIL_BAIL_AMOUNT}₺ gereklidir.` };
    }

    actingPlayer.money -= JAIL_BAIL_AMOUNT;
    actingPlayer.isJailed = false;
    actingPlayer.jailTurns = 0;
    addServerTransaction(nextState, actingPlayer, 'expense', 'bail', JAIL_BAIL_AMOUNT, 'Kodesten serbest kalmak için kefalet ödendi');
    addServerLog(nextState, `🔓 ${actingPlayer.name} ${JAIL_BAIL_AMOUNT}₺ kefalet ödeyerek serbest kaldı!`, 'success');

    events.push({ type: 'JAIL_STATUS', actorPlayerId: actingPlayer.id, amount: JAIL_BAIL_AMOUNT, actionId, timestamp: now });
    return { success: true, state: nextState, events };
  }

  // --------------------------------------------------------------------------
  // ACTION: BUILD_HOUSE
  // --------------------------------------------------------------------------
  if (type === 'BUILD_HOUSE') {
    const tileId = action.payload?.tileId;
    if (typeof tileId !== 'number' || !Number.isInteger(tileId) || tileId < 0 || tileId >= TOTAL_TILES) {
      return { success: false, error: 'INVALID_PROPERTY', errorMessage: 'Geçersiz arsa numarası.' };
    }

    const tile = nextState.board[tileId];
    if (!tile || tile.ownerId !== actingPlayer.id || !tile.houseCost || tile.houses >= 5) {
      return { success: false, error: 'INVALID_PROPERTY', errorMessage: 'Bu arsaya ev dikilemez veya maksimum seviyede.' };
    }
    if (tile.isMortgaged) {
      return { success: false, error: 'INVALID_PROPERTY', errorMessage: 'İpotekli arsaya ev dikilemez!' };
    }
    if (!hasColorGroupMonopoly(nextState.board, tile.colorGroup, actingPlayer.id)) {
      return { success: false, error: 'INVALID_PROPERTY', errorMessage: 'Ev dikmek için aynı renkteki tüm şehirlere sahip olmalısınız!' };
    }
    if (actingPlayer.money < tile.houseCost) {
      return { success: false, error: 'INSUFFICIENT_FUNDS', errorMessage: `Yetersiz bakiye! Ev maliyeti: ${tile.houseCost}₺.` };
    }

    actingPlayer.money -= tile.houseCost;
    tile.houses += 1;
    const typeStr = tile.houses === 5 ? 'Otel' : `${tile.houses}. Ev`;
    addServerTransaction(nextState, actingPlayer, 'expense', 'build_house', tile.houseCost, `"${tile.name}" üzerine ${typeStr} inşa edildi`);
    addServerLog(nextState, `🏗️ ${actingPlayer.name}, "${tile.name}" üzerine ${typeStr} dikti! (${tile.houseCost}₺)`, 'success');

    events.push({ type: 'HOUSE_BUILT', actorPlayerId: actingPlayer.id, tileId, amount: tile.houseCost, actionId, timestamp: now });
    return { success: true, state: nextState, events };
  }

  // --------------------------------------------------------------------------
  // ACTION: SELL_HOUSE
  // --------------------------------------------------------------------------
  if (type === 'SELL_HOUSE') {
    const tileId = action.payload?.tileId;
    if (typeof tileId !== 'number' || !Number.isInteger(tileId) || tileId < 0 || tileId >= TOTAL_TILES) {
      return { success: false, error: 'INVALID_PROPERTY', errorMessage: 'Geçersiz arsa numarası.' };
    }

    const tile = nextState.board[tileId];
    if (!tile || tile.ownerId !== actingPlayer.id || !tile.houseCost || tile.houses <= 0) {
      return { success: false, error: 'INVALID_PROPERTY', errorMessage: 'Bu arsada satılacak ev bulunmuyor.' };
    }

    const refundAmount = Math.floor(tile.houseCost / 2);
    actingPlayer.money += refundAmount;
    tile.houses -= 1;
    const typeStr = tile.houses === 4 ? 'Otel satıldı (4 Ev kaldı)' : `${tile.houses + 1}. Ev satıldı`;
    addServerTransaction(nextState, actingPlayer, 'income', 'sell_house', refundAmount, `"${tile.name}" üzerindeki ${typeStr}`);
    addServerLog(nextState, `🏚️ ${actingPlayer.name}, "${tile.name}" üzerindeki bir evi ${refundAmount}₺ karşılığında sattı.`, 'info');

    events.push({ type: 'HOUSE_SOLD', actorPlayerId: actingPlayer.id, tileId, amount: refundAmount, actionId, timestamp: now });
    return { success: true, state: nextState, events };
  }

  // --------------------------------------------------------------------------
  // ACTION: MORTGAGE
  // --------------------------------------------------------------------------
  if (type === 'MORTGAGE') {
    const tileId = action.payload?.tileId;
    if (typeof tileId !== 'number' || !Number.isInteger(tileId) || tileId < 0 || tileId >= TOTAL_TILES) {
      return { success: false, error: 'INVALID_PROPERTY', errorMessage: 'Geçersiz arsa numarası.' };
    }

    const tile = nextState.board[tileId];
    if (!tile || tile.ownerId !== actingPlayer.id || !tile.price) {
      return { success: false, error: 'INVALID_PROPERTY', errorMessage: 'Bu arsa size ait değil.' };
    }

    const mortgageValue = Math.floor(tile.price / 2);

    if (tile.isMortgaged) {
      const unmortgageCost = Math.floor(mortgageValue * 1.1);
      if (actingPlayer.money < unmortgageCost) {
        return { success: false, error: 'INSUFFICIENT_FUNDS', errorMessage: `İpoteği kaldırmak için ${unmortgageCost}₺ gereklidir.` };
      }
      actingPlayer.money -= unmortgageCost;
      tile.isMortgaged = false;
      addServerTransaction(nextState, actingPlayer, 'expense', 'mortgage', unmortgageCost, `"${tile.name}" ipoteği kaldırıldı`);
      addServerLog(nextState, `🔓 ${actingPlayer.name}, "${tile.name}" ipoteğini ${unmortgageCost}₺ ödeyerek kaldırdı.`, 'info');
    } else {
      if (tile.houses > 0) {
        return { success: false, error: 'INVALID_PROPERTY', errorMessage: 'Üzerinde ev olan mülk ipotek edilemez!' };
      }
      actingPlayer.money += mortgageValue;
      tile.isMortgaged = true;
      addServerTransaction(nextState, actingPlayer, 'income', 'mortgage', mortgageValue, `"${tile.name}" ipoteğe verildi`);
      addServerLog(nextState, `🔒 ${actingPlayer.name}, "${tile.name}" mülkünü ${mortgageValue}₺ karşılığında ipotek etti.`, 'warning');
    }

    events.push({ type: 'MORTGAGE_TOGGLED', actorPlayerId: actingPlayer.id, tileId, actionId, timestamp: now });
    return { success: true, state: nextState, events };
  }

  // --------------------------------------------------------------------------
  // ACTION: BANKRUPTCY
  // --------------------------------------------------------------------------
  if (type === 'BANKRUPTCY') {
    actingPlayer.inGame = false;
    actingPlayer.isHost = false;
    addServerLog(nextState, `💀 ${actingPlayer.name} iflas etti ve elendi.`, 'danger');

    // Return all properties to bank
    nextState.board.forEach(t => {
      if (t.ownerId === actingPlayer.id) {
        t.ownerId = undefined;
        t.houses = 0;
        t.isMortgaged = false;
      }
    });

    nextState.pendingAction = 'NONE';
    nextState.actionMessage = undefined;

    // Migrate hostPlayerId if bankrupt player was host
    if (nextState.hostPlayerId === actingPlayer.id || actingPlayer.isHost) {
      const nextHost = nextState.players.find(p => p.id !== actingPlayer.id && p.inGame && !p.isBot);
      if (nextHost) {
        nextState.hostPlayerId = nextHost.id;
        nextState.players.forEach(p => {
          p.isHost = p.id === nextHost.id;
        });
        addServerLog(nextState, `👑 Oda kuruculuğu ${nextHost.name} oyuncusuna devredildi.`, 'info');
      }
    }

    const activePlayers = nextState.players.filter(p => p.inGame);
    if (activePlayers.length <= 1) {
      nextState.phase = 'ENDED';
      nextState.winner = activePlayers[0] || null;
      if (activePlayers[0]) {
        addServerLog(nextState, `🏆 OYUN BİTTİ! KAZANAN: ${activePlayers[0].name}!`, 'success');
      }
    } else if (nextState.players[nextState.currentTurnIndex]?.id === actingPlayer.id) {
      advanceServerTurn(nextState);
    }

    events.push({ type: 'BANKRUPTCY', actorPlayerId: actingPlayer.id, actionId, timestamp: now });
    return { success: true, state: nextState, events };
  }

  // --------------------------------------------------------------------------
  // ACTION: UNMORTGAGE
  // --------------------------------------------------------------------------
  if (type === 'UNMORTGAGE') {
    const tileId = action.payload?.tileId;
    if (typeof tileId !== 'number' || !Number.isInteger(tileId) || tileId < 0 || tileId >= TOTAL_TILES) {
      return { success: false, error: 'INVALID_PROPERTY', errorMessage: 'Geçersiz arsa numarası.' };
    }
    const tile = nextState.board[tileId];
    if (!tile || tile.ownerId !== actingPlayer.id) {
      return { success: false, error: 'INVALID_PROPERTY', errorMessage: 'Bu arsa size ait değil.' };
    }
    if (!tile.isMortgaged) {
      return { success: false, error: 'INVALID_PROPERTY', errorMessage: 'Mülk zaten ipotekli değil.' };
    }
    const mortgageValue = Math.floor((tile.price || 0) / 2);
    const unmortgageCost = Math.floor(mortgageValue * 1.1);
    if (actingPlayer.money < unmortgageCost) {
      return { success: false, error: 'INSUFFICIENT_FUNDS', errorMessage: `İpoteği kaldırmak için ${unmortgageCost}₺ gereklidir.` };
    }
    actingPlayer.money -= unmortgageCost;
    tile.isMortgaged = false;
    addServerTransaction(nextState, actingPlayer, 'expense', 'mortgage', unmortgageCost, `"${tile.name}" ipoteği kaldırıldı`);
    addServerLog(nextState, `🔓 ${actingPlayer.name}, "${tile.name}" ipoteğini ${unmortgageCost}₺ ödeyerek kaldırdı.`, 'info');
    events.push({ type: 'MORTGAGE_TOGGLED', actorPlayerId: actingPlayer.id, tileId, actionId, timestamp: now });
    return { success: true, state: nextState, events };
  }

  // --------------------------------------------------------------------------
  // ACTION: SELL_TO_BANK
  // --------------------------------------------------------------------------
  if (type === 'SELL_TO_BANK') {
    const tileId = action.payload?.tileId;
    if (typeof tileId !== 'number' || !Number.isInteger(tileId) || tileId < 0 || tileId >= TOTAL_TILES) {
      return { success: false, error: 'INVALID_PROPERTY', errorMessage: 'Geçersiz arsa numarası.' };
    }
    const tile = nextState.board[tileId];
    if (!tile || tile.ownerId !== actingPlayer.id || !tile.price) {
      return { success: false, error: 'INVALID_PROPERTY', errorMessage: 'Bu mülk size ait değil.' };
    }
    const propertyRefund = Math.floor(tile.price * (2 / 3));
    const housesRefund = tile.houses > 0 && tile.houseCost ? Math.floor(tile.houses * tile.houseCost * 0.5) : 0;
    const totalRefund = propertyRefund + housesRefund;

    actingPlayer.money += totalRefund;
    tile.ownerId = undefined;
    tile.houses = 0;
    tile.isMortgaged = false;

    addServerTransaction(nextState, actingPlayer, 'income', 'bank_sell', totalRefund, `"${tile.name}" mülkü Banka'ya 2/3 fiyatına satıldı`);
    addServerLog(nextState, `🏛️ ${actingPlayer.name}, "${tile.name}" mülkünü Banka'ya 2/3 değerine (${totalRefund}₺) geri sattı.`, 'warning');
    events.push({ type: 'PROPERTY_PURCHASED', actorPlayerId: actingPlayer.id, tileId, amount: totalRefund, actionId, timestamp: now });
    return { success: true, state: nextState, events };
  }

  // --------------------------------------------------------------------------
  // ACTION: CONFIRM_CHANCE
  // --------------------------------------------------------------------------
  if (type === 'CONFIRM_CHANCE') {
    const card = nextState.activeCard;
    if (!card) {
      return { success: false, error: 'INVALID_ACTION', errorMessage: 'Bekleyen aktif şans kartı bulunmuyor.' };
    }
    if (nextState.players[nextState.currentTurnIndex]?.id !== actingPlayer.id) {
      return { success: false, error: 'NOT_YOUR_TURN', errorMessage: 'Sıra sizde değil.' };
    }

    addServerLog(nextState, `🃏 ${actingPlayer.name} kart çekti: ${card.title} - ${card.description}`, 'action');

    switch (card.actionType) {
      case 'MONEY':
        if (card.amount) {
          actingPlayer.money += card.amount;
          if (card.amount > 0) {
            addServerTransaction(nextState, actingPlayer, 'income', 'chance', card.amount, `Kart Kazancı: ${card.title}`);
          } else {
            addServerTransaction(nextState, actingPlayer, 'expense', 'chance', Math.abs(card.amount), `Kart Cezası: ${card.title}`);
          }
        }
        break;

      case 'JAIL':
        actingPlayer.position = JAIL_TILE_INDEX;
        actingPlayer.isJailed = true;
        actingPlayer.jailTurns = 0;
        nextState.doublesCount = 0;
        break;

      case 'MOVE_TO':
        if (card.targetTileId !== undefined) {
          const target = card.targetTileId % TOTAL_TILES;
          if (target < actingPlayer.position) {
            const salary = nextState.settings?.passGoSalary || 200;
            actingPlayer.money += salary;
            actingPlayer.lapsCompleted = (actingPlayer.lapsCompleted || 0) + 1;
            addServerTransaction(nextState, actingPlayer, 'income', 'salary', salary, 'Kart ile Başlangıç noktasından geçildi');
            addServerLog(nextState, `💰 ${actingPlayer.name} tur tamamlama bonusu ${salary}₺ aldı.`, 'success');
          }
          actingPlayer.position = target;
        }
        break;

      case 'REPAIR':
        let totalHouses = 0;
        nextState.board.forEach(t => {
          if (t.ownerId === actingPlayer.id) totalHouses += t.houses;
        });
        const cost = totalHouses * (card.amount || 25);
        if (cost > 0) {
          actingPlayer.money -= cost;
          addServerTransaction(nextState, actingPlayer, 'expense', 'chance', cost, 'Tüm binaların bakım ve onarım vergisi');
          addServerLog(nextState, `🛠️ ${actingPlayer.name} binaları için ${cost}₺ bakım ödedi.`, 'warning');
        }
        break;
    }

    nextState.activeCard = undefined;
    nextState.pendingAction = 'NONE';
    nextState.actionMessage = undefined;

    if ((nextState.doublesCount || 0) > 0 && !actingPlayer.isJailed) {
      nextState.diceRolled = false;
    }

    return { success: true, state: nextState, events };
  }

  // --------------------------------------------------------------------------
  // ACTION: FORCE_BUY
  // --------------------------------------------------------------------------
  if (type === 'FORCE_BUY') {
    const tileId = action.payload?.tileId;
    if (typeof tileId !== 'number' || !Number.isInteger(tileId) || tileId < 0 || tileId >= TOTAL_TILES) {
      return { success: false, error: 'INVALID_PROPERTY', errorMessage: 'Geçersiz arsa numarası.' };
    }
    const tile = nextState.board[tileId];
    if (!tile || !tile.ownerId || tile.ownerId === actingPlayer.id || !tile.price) {
      return { success: false, error: 'INVALID_FORCE_BUY', errorMessage: 'Bu arsa zorla satın alınamaz.' };
    }
    if (tile.houses > 0) {
      return { success: false, error: 'INVALID_FORCE_BUY', errorMessage: 'Üzerinde ev dikilmiş mülkler zorla satın alınamaz!' };
    }

    const currentOwner = nextState.players.find(p => p.id === tile.ownerId);
    if (!currentOwner) {
      return { success: false, error: 'PLAYER_NOT_FOUND', errorMessage: 'Mülk sahibi bulunamadı.' };
    }

    const buyoutCost = tile.price * 2;
    if (actingPlayer.money < buyoutCost) {
      return { success: false, error: 'INSUFFICIENT_FUNDS', errorMessage: `Zorla alım için 2x bedel (${buyoutCost}₺) gereklidir.` };
    }

    actingPlayer.money -= buyoutCost;
    currentOwner.money += buyoutCost;
    tile.ownerId = actingPlayer.id;
    tile.isMortgaged = false;

    addServerTransaction(nextState, actingPlayer, 'expense', 'buy', buyoutCost, `"${tile.name}" mülkü 2x bedelle zorla satın alındı`);
    addServerTransaction(nextState, currentOwner, 'income', 'trade', buyoutCost, `"${tile.name}" mülkü ${actingPlayer.name} tarafından 2x bedelle devralındı`);
    addServerLog(nextState, `⚡ ${actingPlayer.name}, "${tile.name}" mülkünü ${currentOwner.name} oyuncusundan 2x bedelle (${buyoutCost}₺) zorla satın aldı!`, 'warning');

    events.push({ type: 'PROPERTY_PURCHASED', actorPlayerId: actingPlayer.id, targetPlayerId: currentOwner.id, tileId, amount: buyoutCost, actionId, timestamp: now });
    return { success: true, state: nextState, events };
  }

  // --------------------------------------------------------------------------
  // ACTION: TRADE_OFFER
  // --------------------------------------------------------------------------
  if (type === 'TRADE_OFFER') {
    const offer: TradeOffer = action.payload;
    if (!offer || !offer.toPlayerId) {
      return { success: false, error: 'INVALID_TRADE', errorMessage: 'Geçersiz takas verisi.' };
    }
    const targetPlayer = nextState.players.find(p => p.id === offer.toPlayerId);
    if (!targetPlayer || !targetPlayer.inGame) {
      return { success: false, error: 'PLAYER_NOT_FOUND', errorMessage: 'Hedef oyuncu oyunda bulunmuyor.' };
    }
    if (offer.offeredMoney > 0 && actingPlayer.money < offer.offeredMoney) {
      return { success: false, error: 'INSUFFICIENT_FUNDS', errorMessage: 'Teklif edilen nakit paraya sahip değilsiniz.' };
    }

    // Verify property ownership
    for (const id of offer.offeredTileIds || []) {
      const tile = nextState.board.find(b => b.id === id);
      if (!tile || tile.ownerId !== actingPlayer.id) {
        return { success: false, error: 'INVALID_PROPERTY', errorMessage: `Teklif edilen "${tile?.name || id}" sizin mülkiyetinizde değil.` };
      }
      if (tile.houses > 0) {
        return { success: false, error: 'INVALID_TRADE', errorMessage: 'Üzerinde ev olan mülk takas edilemez.' };
      }
    }

    for (const id of offer.requestedTileIds || []) {
      const tile = nextState.board.find(b => b.id === id);
      if (!tile || tile.ownerId !== targetPlayer.id) {
        return { success: false, error: 'INVALID_PROPERTY', errorMessage: `İstenen "${tile?.name || id}" hedef oyuncuya ait değil.` };
      }
      if (tile.houses > 0) {
        return { success: false, error: 'INVALID_TRADE', errorMessage: 'Üzerinde ev olan mülk takas edilemez.' };
      }
    }

    if (targetPlayer.isBot) {
      const updated = executeTrade(nextState, offer);
      addServerLog(updated, `🤝 ${actingPlayer.name} ile ${targetPlayer.name} arasında takas başarıyla gerçekleşti!`, 'success');
      events.push({ type: 'TRADE_COMPLETED', actorPlayerId: actingPlayer.id, targetPlayerId: targetPlayer.id, actionId, timestamp: now });
      return { success: true, state: updated, events };
    } else {
      nextState.incomingTradeOffer = {
        ...offer,
        fromPlayerId: actingPlayer.id,
        toPlayerId: targetPlayer.id,
        fromPlayerName: actingPlayer.name,
        fromPlayerAvatar: actingPlayer.avatar
      };
      addServerLog(nextState, `📬 ${actingPlayer.name}, ${targetPlayer.name} oyuncusuna takas teklifinde bulundu. Karar bekleniyor...`, 'info');
      return { success: true, state: nextState, events };
    }
  }

  // --------------------------------------------------------------------------
  // ACTION: TRADE_ACCEPT / ACCEPT_TRADE
  // --------------------------------------------------------------------------
  if (type === 'TRADE_ACCEPT' || type === 'ACCEPT_TRADE') {
    const offer = nextState.incomingTradeOffer;
    if (!offer || offer.toPlayerId !== actingPlayer.id) {
      return { success: false, error: 'INVALID_TRADE', errorMessage: 'Onaylanacak aktif bir takas teklifi bulunmuyor.' };
    }

    const updated = executeTrade(nextState, offer);
    updated.incomingTradeOffer = undefined;
    events.push({ type: 'TRADE_COMPLETED', actorPlayerId: actingPlayer.id, targetPlayerId: offer.fromPlayerId, actionId, timestamp: now });
    return { success: true, state: updated, events };
  }

  // --------------------------------------------------------------------------
  // ACTION: TRADE_DECLINE / DECLINE_TRADE
  // --------------------------------------------------------------------------
  if (type === 'TRADE_DECLINE' || type === 'DECLINE_TRADE') {
    const offer = nextState.incomingTradeOffer;
    if (!offer || offer.toPlayerId !== actingPlayer.id) {
      return { success: false, error: 'INVALID_TRADE', errorMessage: 'Reddedilecek aktif bir takas teklifi bulunmuyor.' };
    }

    nextState.incomingTradeOffer = undefined;
    addServerLog(nextState, `❌ ${actingPlayer.name} gelen takas teklifini reddetti.`, 'info');
    return { success: true, state: nextState, events };
  }

  // Fallback for unhandled / unknown action type
  return { success: false, error: 'INVALID_ACTION', errorMessage: `Tanınmayan eylem türü: ${type}` };
}
