import React, { useState, useEffect, useRef } from 'react';
import { GameState, BoardTile, Player, TradeOffer, GameSettings, BotDifficulty, UserAccount } from './types/game';
import {
  createInitialState,
  handleRollDice,
  advancePlayerStep,
  finalizePlayerLanding,
  rollDice,
  JAIL_TILE_INDEX,
  buyProperty,
  passProperty,
  sellPropertyToBank,
  buildHouse,
  toggleMortgage,
  applyChanceCard,
  payJailBail,
  nextTurn,
  executeTrade,
  attemptBotProactiveTrade,
  hasColorGroupMonopoly,
  addChatMessage,
  PLAYER_COLORS,
  PLAYER_AVATARS,
  addLog,
  addTransaction
} from './engine/gameEngine';
import {
  loginAsGuest,
  logoutUser,
  getSavedUser,
  syncRoomState,
  subscribeToRoom,
  recordGameWin
} from './services/firebase';
import { syncManager } from './services/multiplayerSync';
import {
  initiateGoogleOAuthRedirect,
  handleGoogleOAuthCallback
} from './services/googleAuth';
import { Lobby } from './components/Lobby';
import { Board } from './components/Board';
import { PlayerList } from './components/PlayerList';
import { Chat } from './components/Chat';
import { GameLogs } from './components/GameLogs';
import { PropertyModal } from './components/PropertyModal';
import { ChanceModal } from './components/ChanceModal';
import { WinnerModal } from './components/WinnerModal';
import { MyPropertiesModal } from './components/MyPropertiesModal';
import { TradeModal } from './components/TradeModal';
import { TransactionsModal } from './components/TransactionsModal';
import { IncomingTradeModal } from './components/IncomingTradeModal';
import { ProfileModal } from './components/ProfileModal';
import { RotateCcw, Volume2, VolumeX, Wifi, Users, UserCheck } from 'lucide-react';

export const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(() => createInitialState());
  const [userAccount, setUserAccount] = useState<UserAccount | null>(() => getSavedUser());
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [selectedTile, setSelectedTile] = useState<BoardTile | null>(null);
  const [isPropertiesModalOpen, setIsPropertiesModalOpen] = useState(false);
  const [isTradeModalOpen, setIsTradeModalOpen] = useState(false);
  const [isTransactionsModalOpen, setIsTransactionsModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [tradeSelectedTile, setTradeSelectedTile] = useState<BoardTile | undefined>(undefined);
  const [isMoving, setIsMoving] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  
  // Track last synced state timestamp to prevent echo loops
  const isRemoteUpdateRef = useRef(false);

  // 1. Process Google OAuth callback on mount or load saved user session
  useEffect(() => {
    async function initAuth() {
      try {
        const oauthUser = await handleGoogleOAuthCallback();
        if (oauthUser) {
          setUserAccount(oauthUser);
          return;
        }
      } catch (e) {
        console.error('[Auth] OAuth Callback error:', e);
      }

      const saved = getSavedUser();
      if (saved) {
        setUserAccount(saved);
      }
    }

    initAuth();
  }, []);

  // 2. Real-time Room State Synchronization
  useEffect(() => {
    if (!gameState.roomId) return;

    const unsubscribe = subscribeToRoom(
      gameState.roomId,
      (remoteState) => {
        if (remoteState && remoteState.roomId === gameState.roomId) {
          isRemoteUpdateRef.current = true;
          setGameState(remoteState);
        }
      },
      (newPlayer) => {
        // Host adds incoming player and broadcasts updated state
        setGameState((prev) => {
          const isMeHost = prev.players.length > 0 && prev.players[0].id === myPlayerId;
          if (!isMeHost) return prev;

          const exists = prev.players.some((p) => p.id === newPlayer.id || p.name === newPlayer.name);
          if (exists || prev.players.length >= 6) return prev;

          let assignedColor = newPlayer.color;
          const takenColors = prev.players.map((p) => p.color);
          if (takenColors.includes(assignedColor)) {
            const freeColor = PLAYER_COLORS.find((c) => !takenColors.includes(c));
            if (freeColor) assignedColor = freeColor;
          }

          const playerToAdd: Player = {
            ...newPlayer,
            color: assignedColor,
            isHost: false
          };

          const updated = {
            ...prev,
            players: [...prev.players, playerToAdd]
          };
          addLog(updated, `🎉 ${playerToAdd.name} odaya katıldı! (${prev.roomId})`, 'success');
          syncRoomState(prev.roomId, updated);
          return updated;
        });
      },
      () => {
        // Reply with current state when a new peer requests sync
        setGameState((prev) => {
          const isMeHost = prev.players.length > 0 && prev.players[0].id === myPlayerId;
          if (isMeHost && prev.roomId) {
            syncRoomState(prev.roomId, prev);
          }
          return prev;
        });
      }
    );

    return () => {
      unsubscribe();
    };
  }, [gameState.roomId, myPlayerId]);

  // Sync state changes to room (only if not an incoming remote update)
  const updateAndBroadcastGameState = (updater: (prev: GameState) => GameState) => {
    setGameState((prev) => {
      const next = updater(prev);
      if (!isRemoteUpdateRef.current && next.roomId) {
        syncRoomState(next.roomId, next);
      }
      isRemoteUpdateRef.current = false;
      return next;
    });
  };

  // 3. Handle Bot Turns with Smooth Pacing & Visible Animation
  useEffect(() => {
    if (gameState.phase !== 'PLAYING' || isMoving) return;

    // If human is reviewing an incoming trade offer from bot, don't interrupt
    if (gameState.incomingTradeOffer) return;

    const currentPlayer = gameState.players[gameState.currentTurnIndex];
    const isMeHost = gameState.players[0]?.id === myPlayerId;

    if (!currentPlayer || !currentPlayer.isBot || !currentPlayer.inGame || !isMeHost) return;

    const difficulty = currentPlayer.botDifficulty || gameState.settings?.botDifficulty || 'medium';

    // Step A: Bot has NOT rolled yet -> roll and animate walk
    if (!gameState.diceRolled) {
      const timer = setTimeout(() => {
        handleRollDiceAction();
      }, 1000);
      return () => clearTimeout(timer);
    }

    // Step B: Bot has rolled and is not moving -> evaluate landing action
    if (gameState.diceRolled && !isMoving) {
      // 1. Pending Property Decision
      if (gameState.pendingAction === 'BUY_PROPERTY') {
        const timer = setTimeout(() => {
          const tile = gameState.board[currentPlayer.position];
          let shouldBuy = false;
          if (tile && tile.price) {
            if (difficulty === 'hard') shouldBuy = currentPlayer.money >= tile.price;
            else if (difficulty === 'medium') shouldBuy = currentPlayer.money >= tile.price + 80;
            else shouldBuy = currentPlayer.money >= tile.price + 120 && Math.random() > 0.3;
          }
          if (shouldBuy) {
            handleBuyPropertyAction();
          } else {
            handlePassPropertyAction();
          }
        }, 1200);
        return () => clearTimeout(timer);
      }

      // 2. Pending Chance Card
      if (gameState.pendingAction === 'CHANCE_CARD') {
        const timer = setTimeout(() => {
          handleConfirmChanceCard();
        }, 1400);
        return () => clearTimeout(timer);
      }

      // 3. Pending Action is NONE -> Execute Proactive Trade, Build Houses & End Turn
      if (gameState.pendingAction === 'NONE') {
        const timer = setTimeout(() => {
          updateAndBroadcastGameState((prev) => {
            let next = JSON.parse(JSON.stringify(prev)) as GameState;
            const bot = next.players[next.currentTurnIndex];
            if (!bot || !bot.isBot) return next;

            // Proactive Bot-to-Bot or Bot-to-Human Trade
            next = attemptBotProactiveTrade(next, bot);
            if (next.incomingTradeOffer) {
              return next; // Wait for player response
            }

            // House Building
            const minCash = difficulty === 'hard' ? 80 : difficulty === 'medium' ? 200 : 400;
            if (bot.money > minCash) {
              const ownedMonopolies = next.board.filter(
                t => t.ownerId === bot.id && t.type === 'property' && hasColorGroupMonopoly(next.board, t.colorGroup, bot.id)
              );
              for (const prop of ownedMonopolies) {
                const maxHouses = difficulty === 'hard' ? 5 : difficulty === 'medium' ? 4 : 2;
                if (prop.houseCost && bot.money >= prop.houseCost + minCash && prop.houses < maxHouses) {
                  next = buildHouse(next, prop.id);
                  break;
                }
              }
            }

            // Turn progression (if doubles, roll again; else next turn)
            if ((next.doublesCount || 0) > 0 && !bot.isJailed) {
              next.diceRolled = false;
            } else {
              next = nextTurn(next);
            }
            return next;
          });
        }, 1400);
        return () => clearTimeout(timer);
      }
    }
  }, [
    gameState.currentTurnIndex,
    gameState.phase,
    gameState.diceRolled,
    gameState.pendingAction,
    gameState.incomingTradeOffer,
    isMoving,
    myPlayerId
  ]);

  // Auth Handlers
  const handleGoogleLogin = async () => {
    initiateGoogleOAuthRedirect();
  };

  const handleGuestLogin = async (customName?: string) => {
    try {
      const account = await loginAsGuest(customName);
      setUserAccount(account);
    } catch (err) {
      console.error('Guest login failed:', err);
    }
  };

  const handleLogout = async () => {
    await logoutUser();
    setUserAccount(null);
  };

  // Join Game as Player
  const handleJoin = (name: string, avatar: string, color?: string, isOnline = true, targetRoomCode?: string) => {
    const finalRoom = targetRoomCode || gameState.settings.roomCode || 'TR-1001';
    const newId = userAccount?.uid || `player_${Math.random().toString(36).substring(2, 9)}`;
    const startMoney = gameState.settings?.startingMoney || 1500;
    const chosenColor = color || PLAYER_COLORS[gameState.players.length % PLAYER_COLORS.length];
    
    const newPlayer: Player = {
      id: newId,
      name: name || userAccount?.displayName || 'Oyuncu',
      avatar,
      color: chosenColor,
      money: startMoney,
      position: 0,
      isJailed: false,
      jailTurns: 0,
      lapsCompleted: 0,
      firstLapPurchases: 0,
      inGame: true,
      isBot: false,
      isHost: gameState.players.length === 0
    };

    setMyPlayerId(newId);

    // Send join request to room host
    syncManager.sendJoinRequest(finalRoom, newPlayer);

    updateAndBroadcastGameState((prev) => {
      // Avoid duplicate join if already exists
      const existingIdx = prev.players.findIndex(p => p.id === newId);
      let nextPlayers = [...prev.players];
      if (existingIdx >= 0) {
        nextPlayers[existingIdx] = newPlayer;
      } else {
        nextPlayers.push(newPlayer);
      }

      const updated = {
        ...prev,
        roomId: finalRoom,
        isOnlineGame: isOnline,
        settings: { ...prev.settings, roomCode: finalRoom },
        players: nextPlayers
      };
      addLog(updated, `👋 ${newPlayer.name} odaya katıldı! (${finalRoom})`, 'success');
      return updated;
    });
  };

  // Leave Lobby / Go Back
  const handleLeaveLobby = () => {
    if (!myPlayerId) return;
    updateAndBroadcastGameState((prev) => ({
      ...prev,
      players: prev.players.filter((p) => p.id !== myPlayerId)
    }));
    setMyPlayerId(null);
  };

  // Update Game Settings (Host Only)
  const handleUpdateSettings = (newSettings: GameSettings) => {
    updateAndBroadcastGameState((prev) => ({
      ...prev,
      settings: newSettings,
      roomId: newSettings.roomCode
    }));
  };

  // Add Bot Player with Difficulty
  const handleAddBot = (difficulty: BotDifficulty = 'medium') => {
    if (gameState.players.length >= 6) return;

    const botNumber = gameState.players.filter((p) => p.isBot).length + 1;
    const difficultyPrefix = difficulty === 'hard' ? 'Zor ' : difficulty === 'easy' ? 'Kolay ' : '';
    const botNames = [`${difficultyPrefix}Zeki Bot 🤖`, `${difficultyPrefix}Emlakçı Bot 🏠`, `${difficultyPrefix}Zengin Bot 💰`, `${difficultyPrefix}Hızlı Bot ⚡`];
    const botName = botNames[(botNumber - 1) % botNames.length];
    const availableAvatars = PLAYER_AVATARS.filter(
      (a) => !gameState.players.some((p) => p.avatar === a)
    );

    const startMoney = gameState.settings?.startingMoney || 1500;
    const botPlayer: Player = {
      id: `bot_${Math.random().toString(36).substring(2, 9)}`,
      name: botName,
      avatar: availableAvatars[0] || '🤖',
      color: PLAYER_COLORS[gameState.players.length % PLAYER_COLORS.length],
      money: startMoney,
      position: 0,
      isJailed: false,
      jailTurns: 0,
      lapsCompleted: 0,
      firstLapPurchases: 0,
      inGame: true,
      isBot: true,
      botDifficulty: difficulty
    };

    updateAndBroadcastGameState((prev) => {
      const updated = { ...prev, players: [...prev.players, botPlayer] };
      addLog(updated, `🤖 ${botName} (${difficulty.toUpperCase()}) odaya eklendi.`, 'info');
      return updated;
    });
  };

  // Start Game
  const handleStartGame = () => {
    if (gameState.players.length < 2) return;

    updateAndBroadcastGameState((prev) => {
      const startMoney = prev.settings?.startingMoney || 1500;
      const updatedPlayers = prev.players.map(p => ({
        ...p,
        money: startMoney,
        lapsCompleted: 0,
        firstLapPurchases: 0
      }));

      const updated = { ...prev, players: updatedPlayers, phase: 'PLAYING' as const };
      addLog(updated, '🎮 Turkish Paradise oyunu başladı! İyi şanslar!', 'success');
      return updated;
    });
  };

  // Step-by-Step Animated Roll Dice Action
  const handleRollDiceAction = () => {
    if (isMoving || gameState.diceRolled || gameState.phase !== 'PLAYING') return;

    const currentPlayer = gameState.players[gameState.currentTurnIndex];
    if (!currentPlayer) return;

    // Check if it's my turn
    if (currentPlayer.id !== myPlayerId && !currentPlayer.isBot) {
      return;
    }

    const dice = rollDice();
    const diceTotal = dice[0] + dice[1];
    const isDouble = dice[0] === dice[1];

    // Check jail condition
    if (currentPlayer.isJailed) {
      if (isDouble) {
        updateAndBroadcastGameState(prev => {
          const updated = JSON.parse(JSON.stringify(prev)) as GameState;
          const p = updated.players[updated.currentTurnIndex];
          p.isJailed = false;
          p.jailTurns = 0;
          updated.dice = dice;
          updated.diceRolled = true;
          addLog(updated, `🎉 ${p.name} çift zar atarak (${dice[0]}-${dice[1]}) kodesten ücretsiz çıktı!`, 'success');
          return updated;
        });
      } else {
        updateAndBroadcastGameState(prev => {
          const updated = JSON.parse(JSON.stringify(prev)) as GameState;
          const p = updated.players[updated.currentTurnIndex];
          p.jailTurns += 1;
          updated.dice = dice;
          updated.diceRolled = true;
          if (p.jailTurns >= 3) {
            p.isJailed = false;
            p.money -= 100;
            p.jailTurns = 0;
            addTransaction(updated, p, 'expense', 'bail', 100, '3 tur kodes sonrası zorunlu kefalet ödendi');
            addLog(updated, `⚠️ ${p.name} 3 tur bekledi ve 100₺ ödeyerek kodesten çıktı.`, 'warning');
          } else {
            addLog(updated, `🔒 ${p.name} (${dice[0]}-${dice[1]}) attı ve kodeste kaldı (${p.jailTurns}/3 tur).`, 'info');
            updated.pendingAction = 'NONE';
          }
          return updated;
        });
        return;
      }
    }

    // Doubles streak 3rd time check
    if (isDouble && !currentPlayer.isJailed) {
      const nextDoubles = gameState.doublesCount + 1;
      if (nextDoubles >= 3) {
        updateAndBroadcastGameState(prev => {
          const updated = JSON.parse(JSON.stringify(prev)) as GameState;
          const p = updated.players[updated.currentTurnIndex];
          p.position = JAIL_TILE_INDEX;
          p.isJailed = true;
          p.jailTurns = 0;
          updated.doublesCount = 0;
          updated.dice = dice;
          updated.diceRolled = true;
          addLog(updated, `🚨 3 kez üst üste çift atan ${p.name} kodese tıkıldı!`, 'danger');
          updated.pendingAction = 'NONE';
          return updated;
        });
        return;
      }
    }

    // Start Step-by-Step Movement
    setIsMoving(true);
    updateAndBroadcastGameState(prev => {
      const updated = JSON.parse(JSON.stringify(prev)) as GameState;
      updated.dice = dice;
      updated.diceRolled = true;
      if (isDouble) {
        updated.doublesCount += 1;
      } else {
        updated.doublesCount = 0;
      }
      addLog(updated, `${currentPlayer.name} zar attı: 🎲 ${dice[0]} - ${dice[1]} (Toplam: ${diceTotal})`, 'action');
      return updated;
    });

    let stepCount = 0;
    const interval = setInterval(() => {
      stepCount++;
      updateAndBroadcastGameState(prev => {
        const { state } = advancePlayerStep(prev, currentPlayer.id);
        return state;
      });

      if (stepCount >= diceTotal) {
        clearInterval(interval);
        setTimeout(() => {
          updateAndBroadcastGameState(prev => finalizePlayerLanding(prev, currentPlayer.id));
          setIsMoving(false);
        }, 120);
      }
    }, 200);
  };

  // End Turn Action
  const handleEndTurnAction = () => {
    updateAndBroadcastGameState((prev) => nextTurn(prev));
  };

  // Buy Property Action
  const handleBuyPropertyAction = () => {
    updateAndBroadcastGameState((prev) => buyProperty(prev));
  };

  // Pass Property Action (Skip buying)
  const handlePassPropertyAction = () => {
    updateAndBroadcastGameState((prev) => passProperty(prev));
  };

  // Sell Property to Bank for 2/3 price
  const handleSellToBankAction = (tileId: number) => {
    updateAndBroadcastGameState((prev) => sellPropertyToBank(prev, tileId));
  };

  // Pay 100 Bail to leave Kodes (Jail)
  const handlePayJailBailAction = () => {
    updateAndBroadcastGameState((prev) => payJailBail(prev));
  };

  // Build House Action
  const handleBuildHouseAction = (tileId: number) => {
    updateAndBroadcastGameState((prev) => buildHouse(prev, tileId));
    if (selectedTile) {
      setSelectedTile((prev) => (prev ? { ...prev, houses: prev.houses + 1 } : null));
    }
  };

  // Toggle Mortgage Action
  const handleToggleMortgageAction = (tileId: number) => {
    updateAndBroadcastGameState((prev) => toggleMortgage(prev, tileId));
    if (selectedTile) {
      setSelectedTile((prev) => (prev ? { ...prev, isMortgaged: !prev.isMortgaged } : null));
    }
  };

  // Apply Chance Card
  const handleConfirmChanceCard = () => {
    updateAndBroadcastGameState((prev) => applyChanceCard(prev));
  };

  // Trade Execution Action
  const handleExecuteTradeAction = (offer: TradeOffer) => {
    updateAndBroadcastGameState((prev) => executeTrade(prev, offer));
  };

  // Handle Accept Incoming Trade from Bot
  const handleAcceptIncomingTrade = () => {
    if (!gameState.incomingTradeOffer) return;
    updateAndBroadcastGameState((prev) => {
      if (!prev.incomingTradeOffer) return prev;
      return executeTrade(prev, prev.incomingTradeOffer);
    });
  };

  // Handle Decline Incoming Trade from Bot
  const handleDeclineIncomingTrade = () => {
    updateAndBroadcastGameState((prev) => {
      const updated = { ...prev, incomingTradeOffer: undefined };
      if (me) {
        addLog(updated, `❌ ${me.name} takas teklifini reddetti.`, 'info');
      }
      return updated;
    });
  };

  // Handle Counter-Offer: opens trade modal
  const handleCounterOfferIncomingTrade = () => {
    if (gameState.incomingTradeOffer) {
      const targetTileId = gameState.incomingTradeOffer.requestedTileIds[0];
      const targetTile = gameState.board.find((t) => t.id === targetTileId);
      setTradeSelectedTile(targetTile);
      updateAndBroadcastGameState((prev) => ({ ...prev, incomingTradeOffer: undefined }));
      setIsTradeModalOpen(true);
    }
  };

  // Send Chat Message
  const handleSendMessageAction = (text: string) => {
    const mePlayer = gameState.players.find((p) => p.id === myPlayerId);
    if (!mePlayer) return;
    updateAndBroadcastGameState((prev) => addChatMessage(prev, mePlayer, text));
  };

  // Restart Game
  const handleRestart = () => {
    const nextInit = createInitialState(gameState.settings);
    updateAndBroadcastGameState(() => nextInit);
    setMyPlayerId(null);
    setSelectedTile(null);
    setIsPropertiesModalOpen(false);
    setIsTradeModalOpen(false);
    setTradeSelectedTile(undefined);
  };

  const me = gameState.players.find((p) => p.id === myPlayerId);

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#050811] text-white font-['Fredoka',sans-serif] flex flex-col select-none">
      {gameState.phase === 'LOBBY' ? (
        <Lobby
          players={gameState.players}
          myPlayerId={myPlayerId}
          settings={gameState.settings}
          userAccount={userAccount}
          onGoogleLogin={handleGoogleLogin}
          onGuestLogin={handleGuestLogin}
          onLogout={handleLogout}
          onUpdateSettings={handleUpdateSettings}
          onJoin={handleJoin}
          onAddBot={handleAddBot}
          onStartGame={handleStartGame}
          onLeaveLobby={handleLeaveLobby}
        />
      ) : (
        <>
          {/* Top Navbar Header during Game */}
          <header className="h-12 px-4 flex items-center justify-between shrink-0 bg-slate-900/90 border-b border-slate-800/80 backdrop-blur-md z-40">
            <div className="flex items-center gap-2.5">
              <div className="flex items-center gap-1.5 font-['Cinzel',serif] font-black text-sm tracking-wider">
                <span className="text-base">🎲</span>
                <span className="text-white">TURKISH</span>
                <span className="bg-gradient-to-r from-amber-300 via-amber-400 to-amber-200 bg-clip-text text-transparent">PARADISE</span>
              </div>
              <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/30 font-bold flex items-center gap-1">
                <Wifi className="w-3 h-3 text-emerald-400 animate-pulse" />
                <span>Canlı Çevrimiçi</span>
              </span>
              <span className="text-[10px] text-slate-400 font-mono bg-slate-800/80 px-2 py-0.5 rounded-full border border-slate-700 hidden sm:inline-block">
                Oda: {gameState.roomId || gameState.settings?.roomCode}
              </span>
            </div>

            <div className="flex items-center gap-3">
              {userAccount && (
                <button
                  onClick={() => setIsProfileModalOpen(true)}
                  className="hidden md:flex items-center gap-2 bg-slate-800/90 hover:bg-slate-700/90 border border-amber-500/40 rounded-xl px-3 py-1 text-xs transition cursor-pointer group"
                  title="Profil & İstatistikleri Gör"
                >
                  {userAccount.photoURL ? (
                    <img src={userAccount.photoURL} alt="" className="w-4 h-4 rounded-full object-cover" />
                  ) : (
                    <span className="text-amber-400 font-bold">👤</span>
                  )}
                  <span className="text-white font-bold group-hover:text-amber-300 transition">{userAccount.displayName}</span>
                  <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.2 rounded font-black border border-amber-500/30">
                    🏆 {userAccount.stats?.gamesWon || 0}
                  </span>
                </button>
              )}

              <button
                onClick={() => setSoundEnabled(!soundEnabled)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
                title="Ses Efektleri"
              >
                {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
              </button>

              <button
                onClick={handleRestart}
                className="flex items-center gap-1 text-xs font-bold bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 px-3 py-1.5 rounded-xl border border-rose-500/30 transition cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Yeniden Başlat
              </button>
            </div>
          </header>

          {/* Main Gameplay Screen (100% Viewport Fitted) */}
          <main className="flex-1 min-h-0 px-2 sm:px-4 py-2 flex items-center justify-center gap-3 sm:gap-4 overflow-hidden">
            
            {/* Left Sidebar: Player List & In-game Chat */}
            <div className="h-full w-56 xl:w-64 shrink-0 hidden md:flex flex-col gap-2 justify-between overflow-hidden">
              <div className="flex-1 min-h-0 overflow-hidden">
                <PlayerList
                  players={gameState.players}
                  currentTurnIndex={gameState.currentTurnIndex}
                  board={gameState.board}
                  myPlayerId={myPlayerId}
                />
              </div>
              <div className="shrink-0">
                <Chat
                  messages={gameState.chatMessages || []}
                  currentPlayer={me || null}
                  onSendMessage={handleSendMessageAction}
                />
              </div>
            </div>

            {/* Center: Viewport-Fitted Monopoly Board */}
            <div className="h-full flex-1 max-h-full flex items-center justify-center overflow-hidden">
              <Board
                board={gameState.board}
                players={gameState.players}
                currentTurnIndex={gameState.currentTurnIndex}
                dice={gameState.dice}
                diceRolled={gameState.diceRolled}
                pendingAction={gameState.pendingAction}
                actionMessage={gameState.actionMessage}
                myPlayerId={myPlayerId}
                onTileClick={(tile) => setSelectedTile(tile)}
                onRollDice={handleRollDiceAction}
                onEndTurn={handleEndTurnAction}
                onBuyProperty={handleBuyPropertyAction}
                onPassProperty={handlePassPropertyAction}
                onPayJailBail={handlePayJailBailAction}
                onOpenProperties={() => setIsPropertiesModalOpen(true)}
                onOpenTrade={() => {
                  setTradeSelectedTile(undefined);
                  setIsTradeModalOpen(true);
                }}
                onOpenTransactions={() => setIsTransactionsModalOpen(true)}
              />
            </div>

            {/* Right Sidebar: Game Logs */}
            <div className="h-full w-60 xl:w-72 shrink-0 hidden lg:flex flex-col justify-center">
              <GameLogs logs={gameState.logs} />
            </div>

          </main>
        </>
      )}

      {/* Incoming Trade Offer Modal from Bot or Player */}
      {gameState.incomingTradeOffer && me && (
        <IncomingTradeModal
          incomingOffer={gameState.incomingTradeOffer}
          currentPlayer={me}
          players={gameState.players}
          board={gameState.board}
          onAccept={handleAcceptIncomingTrade}
          onDecline={handleDeclineIncomingTrade}
          onCounterOffer={handleCounterOfferIncomingTrade}
        />
      )}

      {/* Profile & Stats Modal */}
      {isProfileModalOpen && userAccount && (
        <ProfileModal
          userAccount={userAccount}
          onClose={() => setIsProfileModalOpen(false)}
          onLogout={handleLogout}
        />
      )}

      {/* Property Details Modal */}
      {selectedTile && me && (
        <PropertyModal
          tile={selectedTile}
          owner={gameState.players.find((p) => p.id === selectedTile.ownerId)}
          currentPlayer={me}
          players={gameState.players}
          board={gameState.board}
          onClose={() => setSelectedTile(null)}
          onBuy={handleBuyPropertyAction}
          onBuildHouse={() => handleBuildHouseAction(selectedTile.id)}
          onToggleMortgage={() => handleToggleMortgageAction(selectedTile.id)}
          onSellToBank={handleSellToBankAction}
          canBuy={gameState.pendingAction === 'BUY_PROPERTY' && me.position === selectedTile.id}
        />
      )}

      {/* Owned Properties Portfolio Modal */}
      {isPropertiesModalOpen && me && (
        <MyPropertiesModal
          currentPlayer={me}
          players={gameState.players}
          board={gameState.board}
          onClose={() => setIsPropertiesModalOpen(false)}
          onOpenTradeForTile={(tile) => {
            setTradeSelectedTile(tile);
            setIsPropertiesModalOpen(false);
            setIsTradeModalOpen(true);
          }}
          onBuildHouse={handleBuildHouseAction}
          onToggleMortgage={handleToggleMortgageAction}
          onSellToBank={handleSellToBankAction}
        />
      )}

      {/* Financial Transactions Modal */}
      {isTransactionsModalOpen && me && (
        <TransactionsModal
          transactions={gameState.transactions || []}
          currentPlayer={me}
          players={gameState.players}
          onClose={() => setIsTransactionsModalOpen(false)}
        />
      )}

      {/* Trade Modal */}
      {isTradeModalOpen && me && (
        <TradeModal
          currentPlayer={me}
          players={gameState.players}
          board={gameState.board}
          initialOfferedTile={tradeSelectedTile}
          onClose={() => setIsTradeModalOpen(false)}
          onExecuteTrade={handleExecuteTradeAction}
        />
      )}

      {/* Chance Card Modal */}
      {gameState.pendingAction === 'CHANCE_CARD' && gameState.activeCard && (
        <ChanceModal card={gameState.activeCard} onConfirm={handleConfirmChanceCard} />
      )}

      {/* Winner Modal */}
      {gameState.phase === 'ENDED' && gameState.winner && (
        <WinnerModal
          winner={gameState.winner}
          onRestart={() => {
            if (gameState.winner && userAccount && gameState.winner.id === userAccount.uid) {
              recordGameWin(userAccount.uid, gameState.winner.money);
            }
            handleRestart();
          }}
        />
      )}

    </div>
  );
};
