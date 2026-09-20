export type TileType = 
  | 'start' 
  | 'property' 
  | 'utility' 
  | 'station' 
  | 'tax' 
  | 'chance' 
  | 'chest' 
  | 'jail' 
  | 'gotojail' 
  | 'parking';

export type ColorGroup = 
  | 'brown' 
  | 'lightblue' 
  | 'pink' 
  | 'orange' 
  | 'red' 
  | 'yellow' 
  | 'green' 
  | 'blue';

export interface BoardTile {
  id: number;
  name: string;
  type: TileType;
  price?: number;
  rent?: number[]; // [base, 1 house, 2 houses, 3 houses, 4 houses, hotel]
  houseCost?: number;
  colorGroup?: ColorGroup;
  ownerId?: string;
  houses: number; // 0..4 (houses), 5 (hotel)
  isMortgaged: boolean;
  taxAmount?: number;
  icon?: string;
  subtitle?: string;
  image?: string;
}

export type BotDifficulty = 'easy' | 'medium' | 'hard';

export interface GameSettings {
  startingMoney: number;
  passGoSalary: number;
  firstLapBuyLimit: number; // 0 = unlimited, 1, 2, 3, 4
  botDifficulty: BotDifficulty;
  roomCode: string;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatar: string;
  senderColor: string;
  text: string;
  timestamp: string;
  isSystem?: boolean;
}

export interface Player {
  id: string;
  userId?: string;
  connectionId?: string;
  name: string;
  color: string;
  avatar: string;
  money: number;
  position: number;
  isJailed: boolean;
  jailTurns: number;
  inGame: boolean;
  isBot: boolean;
  botDifficulty?: BotDifficulty;
  lapsCompleted: number;
  firstLapPurchases: number;
  isHost?: boolean;
  isOnline?: boolean;
  isAfk?: boolean;
}

export interface GameLog {
  id: string;
  timestamp: string;
  text: string;
  type?: 'info' | 'success' | 'warning' | 'danger' | 'action';
}

export interface TradeOffer {
  fromPlayerId: string;
  toPlayerId: string;
  offeredTileIds: number[];
  offeredMoney: number;
  requestedTileIds: number[];
  requestedMoney: number;
}

export interface ChanceCard {
  id: string;
  title: string;
  description: string;
  actionType: 'MONEY' | 'MOVE' | 'MOVE_TO' | 'JAIL' | 'REPAIR';
  amount?: number;
  targetTileId?: number;
}

export type ActionType = 
  | 'BUY_PROPERTY' 
  | 'CHANCE_CARD' 
  | 'TAX_PAYMENT' 
  | 'RENT_PAYMENT' 
  | 'JAIL_DECISION' 
  | 'NONE';

export type TransactionType = 'income' | 'expense';

export type TransactionCategory = 
  | 'buy' 
  | 'rent_in' 
  | 'rent_out' 
  | 'salary' 
  | 'bank_sell' 
  | 'trade' 
  | 'tax' 
  | 'bail' 
  | 'chance'
  | 'build_house'
  | 'sell_house'
  | 'mortgage';

export interface FinancialTransaction {
  id: string;
  playerId: string;
  playerName: string;
  playerAvatar: string;
  playerColor: string;
  type: TransactionType;
  category: TransactionCategory;
  amount: number;
  balanceAfter: number;
  description: string;
  timestamp: string;
}

export interface MatchRecord {
  id: string;
  roomId: string;
  result: 'WIN' | 'LOSS' | 'BANKRUPTCY';
  moneyEarned: number;
  date: string;
  opponentsCount: number;
}

export interface UserStats {
  gamesWon: number;
  gamesLost: number;
  gamesPlayed: number;
  totalMoneyEarned: number;
  history?: MatchRecord[];
}

export interface FriendRequest {
  id: string;
  fromUid: string;
  fromDisplayName: string;
  fromPhotoURL?: string | null;
  fromFriendCode: string;
  toUid: string;
  toFriendCode: string;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED';
  createdAt: string;
}

export interface FriendUser {
  uid: string;
  friendCode: string;
  displayName: string;
  photoURL?: string | null;
  email?: string | null;
  addedAt: string;
  stats?: UserStats;
  isOnline?: boolean;
  activeRoomId?: string;
  lastSeen?: number;
}

export interface UserAccount {
  uid: string;
  displayName: string;
  email?: string | null;
  photoURL?: string | null;
  isAnonymous: boolean;
  provider: 'google' | 'guest';
  friendCode?: string;
  friends?: FriendUser[];
  incomingRequests?: FriendRequest[];
  stats?: UserStats;
}

export interface GameState {
  roomId: string;
  hostPlayerId?: string;
  settings: GameSettings;
  phase: 'LOBBY' | 'PLAYING' | 'ENDED';
  players: Player[];
  currentTurnIndex: number;
  dice: [number, number];
  diceRolled: boolean;
  doublesCount: number;
  board: BoardTile[];
  logs: GameLog[];
  chatMessages: ChatMessage[];
  transactions: FinancialTransaction[];
  activeCard?: ChanceCard;
  pendingAction: ActionType;
  actionMessage?: string;
  winner?: Player;
  incomingTradeOffer?: TradeOffer & {
    fromPlayerName: string;
    fromPlayerAvatar: string;
  };
  botStatusMessage?: string;
  isOnlineGame?: boolean;
  networkStatus?: 'connected' | 'connecting' | 'disconnected';
  turnSecondsRemaining?: number;
  turnStartedAt?: number;
}



