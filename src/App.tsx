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

const SESSION_PLAYER_ID_KEY = 'tp_active_player_id';
const SESSION_ROOM_ID_KEY = 'tp_active_room_id';
const SESSION_PLAYER_NAME_KEY = 'tp_active_player_name';
const SESSION_GAME_STATE_KEY = 'tp_saved_game_state';

export const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(() => {
    let initialRoom: string | undefined = undefined;
    try {
      if (typeof window !== 'undefined') {
        const urlParams = new URLSearchParams(window.location.search);
        const queryRoom = urlParams.get('room') || urlParams.get('oda') || urlParams.get('code');
        if (queryRoom && queryRoom.trim()) {
          initialRoom = queryRoom.trim().toUpperCase();
        } else {
          const savedRoom = sessionStorage.getItem(SESSION_ROOM_ID_KEY) || localStorage.getItem(SESSION_ROOM_ID_KEY);
          if (savedRoom && savedRoom.trim()) {
            initialRoom = savedRoom.trim().toUpperCase();
          }
        }

        // Check if there is a saved game state (e.g. from before F5 refresh)
        const rawSavedState = sessionStorage.getItem(SESSION_GAME_STATE_KEY) || localStorage.getItem(SESSION_GAME_STATE_KEY);
        if (rawSavedState) {
          const parsed = JSON.parse(rawSavedState) as GameState;
          if (parsed && parsed.players && parsed.players.length > 0) {
            // If room matches or no specific room override was specified in URL
            if (!initialRoom || parsed.roomId === initialRoom) {
              return parsed;
            }
          }
        }
      }
    } catch (e) {
      console.warn('[Session] Failed to parse saved gameState:', e);
    }
    return createInitialState(initialRoom ? { roomCode: initialRoom } : undefined);
  });
  const [userAccount, setUserAccount] = useState<UserAccount | null>(() => getSavedUser());
  const [myPlayerId, setMyPlayerId] = useState<string | null>(() => {
    try {
      if (typeof window !== 'undefined') {
        const savedId = sessionStorage.getItem(SESSION_PLAYER_ID_KEY) || localStorage.getItem(SESSION_PLAYER_ID_KEY);
        if (savedId) return savedId;
        
        // If restoring a saved game state, find the first human player
        const rawSavedState = sessionStorage.getItem(SESSION_GAME_STATE_KEY) || localStorage.getItem(SESSION_GAME_STATE_KEY);
        if (rawSavedState) {
          const parsed = JSON.parse(rawSavedState) as GameState;
          if (parsed && parsed.players && parsed.players.length > 0) {
            const human = parsed.players.find(p => !p.isBot);
            if (human) return human.id;
          }
        }
      }
    } catch (e) {}
    return null;
  });
  const [turnSecondsRemaining, setTurnSecondsRemaining] = useState<number>(60);
  const [selectedTile, setSelectedTile] = useState<BoardTile | null>(null);
  const [isPropertiesModalOpen, setIsPropertiesModalOpen] = useState(false);
  const [isTradeModalOpen, setIsTradeModalOpen] = useState(false);
  const [isTransactionsModalOpen, setIsTransactionsModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [tradeSelectedTile, setTradeSelectedTile] = useState<BoardTile | undefined>(undefined);
  const [isMoving, setIsMoving] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

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

  // 2. Keep URL query param and Session Storage always synced with active room & game state
  useEffect(() => {
    if (typeof window !== 'undefined' && gameState.roomId) {
      try {
        const currentUrl = new URL(window.location.href);
        if (currentUrl.searchParams.get('room') !== gameState.roomId) {
          currentUrl.searchParams.set('room', gameState.roomId);
          window.history.replaceState(null, '', currentUrl.toString());
        }
        sessionStorage.setItem(SESSION_ROOM_ID_KEY, gameState.roomId);
        localStorage.setItem(SESSION_ROOM_ID_KEY, gameState.roomId);

        // Always preserve full game state if match is ongoing or players have joined
        if (gameState.phase === 'PLAYING' || gameState.players.length > 0) {
          sessionStorage.setItem(SESSION_GAME_STATE_KEY, JSON.stringify(gameState));
          localStorage.setItem(SESSION_GAME_STATE_KEY, JSON.stringify(gameState));
        }
      } catch (e) {}
    }
  }, [gameState]);

  // 3. Keep myPlayerId persisted in sessionStorage/localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        if (myPlayerId) {
          sessionStorage.setItem(SESSION_PLAYER_ID_KEY, myPlayerId);
          localStorage.setItem(SESSION_PLAYER_ID_KEY, myPlayerId);
        }
      } catch (e) {}
    }
  }, [myPlayerId]);

  // 4. Real-time Room State Synchronization & Auto Session Recovery on F5 Reload
  useEffect(() => {
    if (!gameState.roomId) return;

    const isMeHost = Boolean(
      gameState.players.length === 0 || (gameState.players.length > 0 && gameState.players[0].id === myPlayerId)
    );

    const unsubscribe = subscribeToRoom(
      gameState.roomId,
      (remoteState) => {
        if (remoteState && remoteState.roomId === gameState.roomId) {
          setGameState(remoteState);
          try {
            sessionStorage.setItem(SESSION_GAME_STATE_KEY, JSON.stringify(remoteState));
            localStorage.setItem(SESSION_GAME_STATE_KEY, JSON.stringify(remoteState));
          } catch (e) {}

          // Auto-reconnect player to their seat if recovering after F5
          const savedId = sessionStorage.getItem(SESSION_PLAYER_ID_KEY) || localStorage.getItem(SESSION_PLAYER_ID_KEY);
          const savedName = sessionStorage.getItem(SESSION_PLAYER_NAME_KEY);
          const matchedPlayer = remoteState.players.find(
            (p) =>
              (savedId && p.id === savedId) ||
              (userAccount && p.id === userAccount.uid) ||
              (userAccount && p.name === userAccount.displayName) ||
              (savedName && p.name === savedName)
          );

          if (matchedPlayer && (!myPlayerId || myPlayerId !== matchedPlayer.id)) {
            setMyPlayerId(matchedPlayer.id);
          }
        }
      },
      (newPlayer) => {
        // Host adds incoming player and broadcasts updated state
        setGameState((prev) => {
          const isHost = prev.players.length === 0 || prev.players[0].id === myPlayerId;
          if (!isHost) return prev;

          // Check if player is re-joining
          const existingIdx = prev.players.findIndex(
            (p) => p.id === newPlayer.id || p.name === newPlayer.name
          );

          let nextPlayers = [...prev.players];
          if (existingIdx >= 0) {
            // Restore returning player and clear AFK
            nextPlayers[existingIdx] = {
              ...nextPlayers[existingIdx],
              ...newPlayer,
              inGame: true,
              isAfk: false
            };
            const updated = { ...prev, players: nextPlayers };
            addLog(updated, `✨ ${newPlayer.name} tekrar bağlandı ve oyuna döndü!`, 'success');
            syncRoomState(prev.roomId, updated);
            return updated;
          }

          if (prev.players.length >= 6) return prev;

          let assignedColor = newPlayer.color;
          const takenColors = prev.players.map((p) => p.color);
          if (takenColors.includes(assignedColor)) {
            const freeColor = PLAYER_COLORS.find((c) => !takenColors.includes(c));
            if (freeColor) assignedColor = freeColor;
          }

          const playerToAdd: Player = {
            ...newPlayer,
            color: assignedColor,
            isHost: false,
            isAfk: false
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
        // Reply with current state when a peer requests sync
        setGameState((prev) => {
          if (prev.roomId && prev.players.length > 0 && prev.phase === 'PLAYING') {
            syncRoomState(prev.roomId, prev);
          }
          return prev;
        });
      },
      isMeHost
    );

    return () => {
      unsubscribe();
    };
  }, [gameState.roomId, myPlayerId, userAccount]);

  // Sync state changes to room (always broadcast on deliberate local user / host action)
  const updateAndBroadcastGameState = (updater: (prev: GameState) => GameState) => {
    setGameState((prev) => {
      const next = updater(prev);
      if (next.roomId) {
        syncRoomState(next.roomId, next);
        try {
          sessionStorage.setItem(SESSION_GAME_STATE_KEY, JSON.stringify(next));
          localStorage.setItem(SESSION_GAME_STATE_KEY, JSON.stringify(next));
        } catch (e) {}
      }
      return next;
    });
  };

  // 5. Turn Countdown Timer (Calculated directly from synchronized turnStartedAt timestamp)
  useEffect(() => {
    if (gameState.phase !== 'PLAYING') {
      setTurnSecondsRemaining(60);
      return;
    }

    const calculateRemaining = () => {
      const turnStart = gameState.turnStartedAt || Date.now();
      const elapsedSeconds = Math.floor((Date.now() - turnStart) / 1000);
      const remaining = Math.max(0, 60 - elapsedSeconds);
      setTurnSecondsRemaining(remaining);
    };

    calculateRemaining();
    const timerInterval = setInterval(calculateRemaining, 500);

    return () => clearInterval(timerInterval);
  }, [gameState.currentTurnIndex, gameState.phase, gameState.turnStartedAt]);

  // 6. AFK Auto-Takeover: When 60s timer expires on a human player's turn, mark AFK
  useEffect(() => {
    if (gameState.phase !== 'PLAYING' || isMoving || turnSecondsRemaining > 0) return;

    const currentPlayer = gameState.players[gameState.currentTurnIndex];
    if (!currentPlayer || currentPlayer.isBot || !currentPlayer.inGame) return;

    const isMeHost = gameState.players[0]?.id === myPlayerId;
    const isMeCurrent = currentPlayer.id === myPlayerId;

    // Trigger AFK marking on host or current player client
    if (isMeHost || isMeCurrent) {
      if (!currentPlayer.isAfk) {
        updateAndBroadcastGameState((prev) => {
          const updated = JSON.parse(JSON.stringify(prev)) as GameState;
          const p = updated.players[updated.currentTurnIndex];
          if (p && !p.isAfk) {
            p.isAfk = true;
            addLog(
              updated,
              `⏰ ${p.name} 60 saniye boyunca hamle yapmadığı için AFK moduna geçti. Sırayı geçici olarak bot devraldı!`,
              'warning'
            );
          }
          return updated;
        });
      }
    }
  }, [turnSecondsRemaining, gameState.phase, gameState.currentTurnIndex, isMoving, myPlayerId]);

  // 3. Handle Bot & AFK Auto-Takeover Turns with Smooth Pacing & Visible Animation
  useEffect(() => {
    if (gameState.phase !== 'PLAYING' || isMoving) return;

    // If human is reviewing an incoming trade offer from bot, don't interrupt
    if (gameState.incomingTradeOffer) return;

    const currentPlayer = gameState.players[gameState.currentTurnIndex];
    const isMeHost = gameState.players[0]?.id === myPlayerId;

    // Execute bot logic if player is a Bot or is a Human marked as AFK
    if (!currentPlayer || (!currentPlayer.isBot && !currentPlayer.isAfk) || !currentPlayer.inGame || !isMeHost) return;

    const difficulty = currentPlayer.botDifficulty || gameState.settings?.botDifficulty || 'medium';

    // Step A: Not rolled yet -> roll and animate walk
    if (!gameState.diceRolled) {
      const timer = setTimeout(() => {
        handleRollDiceAction();
      }, 500);
      return () => clearTimeout(timer);
    }

    // Step B: Rolled and not moving -> evaluate landing action
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
        }, 600);
        return () => clearTimeout(timer);
      }

      // 2. Pending Chance Card
      if (gameState.pendingAction === 'CHANCE_CARD') {
        const timer = setTimeout(() => {
          handleConfirmChanceCard();
        }, 600);
        return () => clearTimeout(timer);
      }

      // 3. Pending Action is NONE -> Execute Proactive Trade, Build Houses & End Turn
      if (gameState.pendingAction === 'NONE') {
        const timer = setTimeout(() => {
          updateAndBroadcastGameState((prev) => {
            let next = JSON.parse(JSON.stringify(prev)) as GameState;
            const currentActor = next.players[next.currentTurnIndex];
            if (!currentActor || (!currentActor.isBot && !currentActor.isAfk)) return next;

            if (currentActor.isBot) {
              // Proactive Bot-to-Bot or Bot-to-Human Trade
              next = attemptBotProactiveTrade(next, currentActor);
              if (next.incomingTradeOffer) {
                return next; // Wait for player response
              }

              // House Building
              const minCash = difficulty === 'hard' ? 80 : difficulty === 'medium' ? 200 : 400;
              if (currentActor.money > minCash) {
                const ownedMonopolies = next.board.filter(
                  t => t.ownerId === currentActor.id && t.type === 'property' && hasColorGroupMonopoly(next.board, t.colorGroup, currentActor.id)
                );
                for (const prop of ownedMonopolies) {
                  const maxHouses = difficulty === 'hard' ? 5 : difficulty === 'medium' ? 4 : 2;
                  if (prop.houseCost && currentActor.money >= prop.houseCost + minCash && prop.houses < maxHouses) {
                    next = buildHouse(next, prop.id);
                    break;
                  }
                }
              }
            }

            // Turn progression (if doubles, roll again; else next turn)
            if ((next.doublesCount || 0) > 0 && !currentActor.isJailed) {
              next.diceRolled = false;
            } else {
              next = nextTurn(next);
            }
            return next;
          });
        }, 600);
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

  // Human Player Takes Back Control from AFK Bot
  const handleTakeBackControl = () => {
    updateAndBroadcastGameState((prev) => {
      const updated = JSON.parse(JSON.stringify(prev)) as GameState;
      const meIdx = updated.players.findIndex((p) => p.id === myPlayerId);
      if (meIdx >= 0 && updated.players[meIdx].isAfk) {
        updated.players[meIdx].isAfk = false;
        addLog(updated, `✨ ${updated.players[meIdx].name} tekrar aktif oldu ve kontrolü devraldı!`, 'success');
      }
      return updated;
    });
    setTurnSecondsRemaining(60);
  };

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
    try {
      sessionStorage.removeItem(SESSION_PLAYER_ID_KEY);
      localStorage.removeItem(SESSION_PLAYER_ID_KEY);
      sessionStorage.removeItem(SESSION_PLAYER_NAME_KEY);
    } catch (e) {}
    setUserAccount(null);
  };

  // Join Game as Player
  const handleJoin = (name: string, avatar: string, color?: string, isOnline = true, targetRoomCode?: string) => {
    const finalRoom = targetRoomCode || gameState.roomId || gameState.settings.roomCode || 'TR-1001';
    const newId = userAccount?.uid || `player_${Math.random().toString(36).substring(2, 9)}`;
    const startMoney = gameState.settings?.startingMoney || 1500;
    
    // Determine unique color not taken by existing players
    const existingColors = gameState.players.map((p) => p.color);
    let chosenColor = color || '';
    if (!chosenColor || existingColors.includes(chosenColor)) {
      const freeColor = PLAYER_COLORS.find((c) => !existingColors.includes(c));
      chosenColor = freeColor || PLAYER_COLORS[gameState.players.length % PLAYER_COLORS.length];
    }
    
    const isHostPlayer = gameState.players.length === 0;

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
      isHost: isHostPlayer
    };

    setMyPlayerId(newId);

    try {
      sessionStorage.setItem(SESSION_PLAYER_ID_KEY, newId);
      localStorage.setItem(SESSION_PLAYER_ID_KEY, newId);
      sessionStorage.setItem(SESSION_PLAYER_NAME_KEY, newPlayer.name);
      sessionStorage.setItem(SESSION_ROOM_ID_KEY, finalRoom);
      localStorage.setItem(SESSION_ROOM_ID_KEY, finalRoom);
    } catch (e) {}

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
    try {
      sessionStorage.removeItem(SESSION_PLAYER_ID_KEY);
      localStorage.removeItem(SESSION_PLAYER_ID_KEY);
      sessionStorage.removeItem(SESSION_PLAYER_NAME_KEY);
      sessionStorage.removeItem(SESSION_GAME_STATE_KEY);
      localStorage.removeItem(SESSION_GAME_STATE_KEY);
    } catch (e) {}
    setMyPlayerId(null);
  };

  // Remove player or bot from room (Host Only)
  const handleRemovePlayer = (playerIdToRemove: string) => {
    updateAndBroadcastGameState((prev) => {
      const isHost = prev.players.length === 0 || prev.players[0].id === myPlayerId;
      if (!isHost) return prev;

      const pToRemove = prev.players.find((p) => p.id === playerIdToRemove);
      if (!pToRemove) return prev;

      const updated = {
        ...prev,
        players: prev.players.filter((p) => p.id !== playerIdToRemove)
      };
      addLog(updated, `🚪 ${pToRemove.name} ${pToRemove.isBot ? 'botu silindi' : 'odadan çıkarıldı'}.`, 'warning');
      return updated;
    });
  };

  // Update Game Settings (Host Only)
  const handleUpdateSettings = (newSettings: GameSettings) => {
    updateAndBroadcastGameState((prev) => ({
      ...prev,
      settings: newSettings,
      roomId: newSettings.roomCode
    }));
  };

  // Add Bot Player with Difficulty & Guaranteed Unique Color
  const handleAddBot = (difficulty: BotDifficulty = 'medium') => {
    if (gameState.players.length >= 6) return;

    const botNumber = gameState.players.filter((p) => p.isBot).length + 1;
    const difficultyPrefix = difficulty === 'hard' ? 'Zor ' : difficulty === 'easy' ? 'Kolay ' : '';
    const botNames = [`${difficultyPrefix}Zeki Bot 🤖`, `${difficultyPrefix}Emlakçı Bot 🏠`, `${difficultyPrefix}Zengin Bot 💰`, `${difficultyPrefix}Hızlı Bot ⚡`];
    const botName = botNames[(botNumber - 1) % botNames.length];
    
    // Guaranteed Unique Avatar
    const availableAvatars = PLAYER_AVATARS.filter(
      (a) => !gameState.players.some((p) => p.avatar === a)
    );

    // Guaranteed Unique Color
    const takenColors = gameState.players.map((p) => p.color);
    const availableColor = PLAYER_COLORS.find((c) => !takenColors.includes(c)) || PLAYER_COLORS[0];

    const startMoney = gameState.settings?.startingMoney || 1500;
    const botPlayer: Player = {
      id: `bot_${Math.random().toString(36).substring(2, 9)}`,
      name: botName,
      avatar: availableAvatars[0] || '🤖',
      color: availableColor,
      money: startMoney,
      position: 0,
      isJailed: false,
      jailTurns: 0,
      lapsCompleted: 0,
      firstLapPurchases: 0,
      inGame: true,
      isBot: true,
      botDifficulty: difficulty,
      isAfk: false
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

      const updated = {
        ...prev,
        players: updatedPlayers,
        phase: 'PLAYING' as const,
        turnStartedAt: Date.now()
      };
      addLog(updated, '🎮 Turkish Paradise oyunu başladı! İyi şanslar!', 'success');
      return updated;
    });
  };

  // Step-by-Step Animated Roll Dice Action
  const handleRollDiceAction = () => {
    if (isMoving || gameState.diceRolled || gameState.phase !== 'PLAYING') return;

    const currentPlayer = gameState.players[gameState.currentTurnIndex];
    if (!currentPlayer) return;

    const isMeHost = gameState.players[0]?.id === myPlayerId;
    const isMeCurrent = currentPlayer.id === myPlayerId;

    // Allow manual roll by current player OR auto roll for bot / AFK human on host
    if (!isMeCurrent && !currentPlayer.isBot && !(currentPlayer.isAfk && isMeHost)) {
      return;
    }

    if (isMeCurrent && currentPlayer.isAfk) {
      handleTakeBackControl();
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
      setGameState(prev => {
        const { state } = advancePlayerStep(prev, currentPlayer.id);
        return state;
      });

      if (stepCount >= diceTotal) {
        clearInterval(interval);
        setTimeout(() => {
          updateAndBroadcastGameState(prev => finalizePlayerLanding(prev, currentPlayer.id));
          setIsMoving(false);
        }, 60);
      }
    }, 130);
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

  // Trade Offer Action (Human-to-Bot or Human-to-Human)
  const handleExecuteTradeAction = (offer: TradeOffer) => {
    const targetPlayer = gameState.players.find((p) => p.id === offer.toPlayerId);
    const senderPlayer = gameState.players.find((p) => p.id === offer.fromPlayerId);
    if (!targetPlayer || !senderPlayer) return;

    if (targetPlayer.isBot) {
      // For Bot: immediate AI evaluation & transaction
      updateAndBroadcastGameState((prev) => executeTrade(prev, offer));
    } else {
      // For Human Player: DO NOT execute immediately, route offer to recipient for review!
      updateAndBroadcastGameState((prev) => {
        const updated = {
          ...prev,
          incomingTradeOffer: {
            ...offer,
            fromPlayerName: senderPlayer.name,
            fromPlayerAvatar: senderPlayer.avatar
          }
        };
        addLog(
          updated,
          `📬 ${senderPlayer.name}, ${targetPlayer.name} oyuncusuna takas teklifinde bulundu. Karar bekleniyor...`,
          'action'
        );
        addChatMessage(
          updated,
          senderPlayer,
          `@${targetPlayer.name} sana bir takas teklifi gönderdim! 🤝`
        );
        return updated;
      });
    }
  };

  // Handle Accept Incoming Trade from Bot or Human Player
  const handleAcceptIncomingTrade = () => {
    if (!gameState.incomingTradeOffer) return;
    updateAndBroadcastGameState((prev) => {
      if (!prev.incomingTradeOffer) return prev;
      return executeTrade(prev, prev.incomingTradeOffer);
    });
  };

  // Handle Decline Incoming Trade from Bot or Human Player
  const handleDeclineIncomingTrade = () => {
    updateAndBroadcastGameState((prev) => {
      const fromPlayer = prev.players.find((p) => p.id === prev.incomingTradeOffer?.fromPlayerId);
      const toPlayer = prev.players.find((p) => p.id === prev.incomingTradeOffer?.toPlayerId);
      const updated = { ...prev, incomingTradeOffer: undefined };
      if (toPlayer) {
        addLog(updated, `❌ ${toPlayer.name}, ${fromPlayer?.name || 'gelen'} takas teklifini reddetti.`, 'warning');
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
    try {
      sessionStorage.removeItem(SESSION_PLAYER_ID_KEY);
      localStorage.removeItem(SESSION_PLAYER_ID_KEY);
      sessionStorage.removeItem(SESSION_PLAYER_NAME_KEY);
      sessionStorage.removeItem(SESSION_GAME_STATE_KEY);
      localStorage.removeItem(SESSION_GAME_STATE_KEY);
    } catch (e) {}
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
          onRemovePlayer={handleRemovePlayer}
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
                turnSecondsRemaining={turnSecondsRemaining}
                onTakeBackControl={handleTakeBackControl}
              />
            </div>

            {/* Right Sidebar: Game Logs */}
            <div className="h-full w-60 xl:w-72 shrink-0 hidden lg:flex flex-col justify-center">
              <GameLogs logs={gameState.logs} />
            </div>

          </main>
        </>
      )}

      {/* Incoming Trade Offer Modal from Bot or Player (Rendered ONLY for target recipient) */}
      {gameState.incomingTradeOffer && me && gameState.incomingTradeOffer.toPlayerId === me.id && (
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

      {/* Floating Indicator for Sender when waiting for target player response */}
      {gameState.incomingTradeOffer && me && gameState.incomingTradeOffer.fromPlayerId === me.id && (
        <div className="fixed bottom-6 right-6 z-40 bg-slate-900/95 border border-amber-500/50 rounded-2xl p-4 shadow-2xl backdrop-blur-md flex items-center gap-3 animate-pulse">
          <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 font-bold">
            ⏳
          </div>
          <div className="text-left text-xs">
            <p className="font-extrabold text-amber-300">Takas Teklifi Gönderildi</p>
            <p className="text-slate-300 text-[11px]">
              {gameState.players.find(p => p.id === gameState.incomingTradeOffer?.toPlayerId)?.name || 'Oyuncunun'} onayı bekleniyor...
            </p>
          </div>
        </div>
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
