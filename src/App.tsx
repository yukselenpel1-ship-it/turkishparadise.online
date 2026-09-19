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
  sellHouse,
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
  loginWithGoogle,
  loginAsGuest,
  logoutUser,
  getSavedUser,
  saveLocalUser,
  getUserStats,
  syncRoomState,
  subscribeToRoom,
  recordGameMatch,
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
import { RotateCcw, Volume2, VolumeX, Wifi, Users, UserCheck, MessageSquare, ScrollText, X, Coins } from 'lucide-react';

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
  const [mobileSheet, setMobileSheet] = useState<'players' | 'chat' | 'logs' | null>(null);
  const [unreadChatCount, setUnreadChatCount] = useState<number>(0);
  const prevChatCountRef = useRef<number>(gameState.chatMessages?.length || 0);

  // Track unread chat messages for mobile badge
  useEffect(() => {
    const currentLen = gameState.chatMessages?.length || 0;
    if (currentLen > prevChatCountRef.current) {
      if (mobileSheet !== 'chat') {
        setUnreadChatCount((prev) => prev + (currentLen - prevChatCountRef.current));
      }
    }
    prevChatCountRef.current = currentLen;
  }, [gameState.chatMessages, mobileSheet]);

  const openMobileChat = () => {
    setMobileSheet('chat');
    setUnreadChatCount(0);
  };

  // 1. Process Google OAuth callback on mount or load saved user session with fresh stats
  useEffect(() => {
    async function initAuth() {
      try {
        const oauthUser = await handleGoogleOAuthCallback();
        if (oauthUser) {
          const freshStats = getUserStats(oauthUser.uid);
          const fullUser = { ...oauthUser, stats: freshStats };
          saveLocalUser(fullUser);
          setUserAccount(fullUser);
          return;
        }
      } catch (e) {
        console.error('[Auth] OAuth Callback error:', e);
      }

      const saved = getSavedUser();
      if (saved) {
        const freshStats = getUserStats(saved.uid);
        setUserAccount({ ...saved, stats: freshStats });
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
              isAfk: false,
              isBot: false
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
            isAfk: false,
            isBot: false
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

  // Live sync selectedTile if game state board updates (houses, owner, mortgage)
  useEffect(() => {
    if (selectedTile) {
      const liveTile = gameState.board.find((t) => t.id === selectedTile.id);
      if (liveTile && (
        liveTile.houses !== selectedTile.houses ||
        liveTile.isMortgaged !== selectedTile.isMortgaged ||
        liveTile.ownerId !== selectedTile.ownerId
      )) {
        setSelectedTile(liveTile);
      }
    }
  }, [gameState.board, selectedTile]);

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

  // 6.5 Bankruptcy Auto-Recovery: If current turn points to an eliminated/bankrupt player or match has ended, advance immediately
  useEffect(() => {
    if (gameState.phase !== 'PLAYING' || isMoving) return;

    const isMeHost = gameState.players[0]?.id === myPlayerId;
    if (!isMeHost) return;

    const activePlayers = gameState.players.filter(p => p.inGame);
    if (activePlayers.length <= 1) {
      updateAndBroadcastGameState((prev) => {
        const updated = JSON.parse(JSON.stringify(prev)) as GameState;
        const remaining = updated.players.filter(p => p.inGame);
        updated.phase = 'ENDED';
        updated.winner = remaining[0] || null;
        if (remaining[0]) {
          addLog(updated, `🏆 OYUN BİTTİ! KAZANAN: ${remaining[0].name}!`, 'success');
        }
        return updated;
      });
      return;
    }

    const currentPlayer = gameState.players[gameState.currentTurnIndex];
    if (!currentPlayer || !currentPlayer.inGame) {
      const timer = setTimeout(() => {
        updateAndBroadcastGameState((prev) => nextTurn(prev));
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [gameState.currentTurnIndex, gameState.phase, gameState.players, isMoving, myPlayerId]);

  // 6.6 Automatic Game Outcome Stats Tracking (Wins, Losses, Bankruptcy, Matches Played)
  const recordedMatchKeyRef = useRef<string>('');
  const recordedBankruptcyRef = useRef<string>('');

  useEffect(() => {
    if (gameState.phase === 'ENDED' && gameState.winner && userAccount) {
      const matchKey = `${gameState.roomId}_${gameState.winner.id}_${gameState.players.length}_${gameState.turnStartedAt || 0}`;
      if (recordedMatchKeyRef.current === matchKey) return;
      recordedMatchKeyRef.current = matchKey;

      const myPlayer = gameState.players.find(
        (p) => p.id === myPlayerId || p.id === userAccount.uid || p.name === userAccount.displayName
      );
      if (!myPlayer) return;

      const isMeWinner = gameState.winner.id === myPlayer.id || gameState.winner.name === myPlayer.name;
      const result: 'WIN' | 'LOSS' | 'BANKRUPTCY' = isMeWinner
        ? 'WIN'
        : (!myPlayer.inGame ? 'BANKRUPTCY' : 'LOSS');

      const prizeMoney = isMeWinner
        ? (gameState.winner.money || 0)
        : (myPlayer.money > 0 ? myPlayer.money : 0);

      const updatedStats = recordGameMatch(
        userAccount.uid,
        result,
        prizeMoney,
        gameState.roomId || 'TR-1001',
        gameState.players.length
      );

      setUserAccount((prev) => {
        if (!prev) return null;
        const next = { ...prev, stats: updatedStats };
        saveLocalUser(next);
        return next;
      });
    }
  }, [gameState.phase, gameState.winner, gameState.roomId, gameState.players, gameState.turnStartedAt, myPlayerId, userAccount]);

  // 6.7 Immediate In-Game Bankruptcy Loss Tracking
  useEffect(() => {
    if (gameState.phase === 'PLAYING' && userAccount && myPlayerId) {
      const myPlayer = gameState.players.find((p) => p.id === myPlayerId || p.id === userAccount.uid);
      if (myPlayer && !myPlayer.inGame) {
        const bankKey = `bank_${gameState.roomId}_${userAccount.uid}_${gameState.turnStartedAt || 0}`;
        if (recordedBankruptcyRef.current === bankKey) return;
        recordedBankruptcyRef.current = bankKey;

        const updatedStats = recordGameMatch(
          userAccount.uid,
          'BANKRUPTCY',
          0,
          gameState.roomId || 'TR-1001',
          gameState.players.length
        );

        setUserAccount((prev) => {
          if (!prev) return null;
          const next = { ...prev, stats: updatedStats };
          saveLocalUser(next);
          return next;
        });
      }
    }
  }, [gameState.phase, gameState.players, gameState.roomId, gameState.turnStartedAt, myPlayerId, userAccount]);

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
    // When a human player is AFK, give an extra 2 seconds before each automatic action so they can comfortably take back control
    const afkDelay = currentPlayer.isAfk ? 2000 : 0;

    // Step A: Not rolled yet -> roll and animate walk
    if (!gameState.diceRolled) {
      const timer = setTimeout(() => {
        handleRollDiceAction();
      }, 1000 + afkDelay);
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
        }, 1200 + afkDelay);
        return () => clearTimeout(timer);
      }

      // 2. Pending Chance Card
      if (gameState.pendingAction === 'CHANCE_CARD') {
        const timer = setTimeout(() => {
          handleConfirmChanceCard();
        }, 1200 + afkDelay);
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
        }, 1200 + afkDelay);
        return () => clearTimeout(timer);
      }
    }
  }, [
    gameState.currentTurnIndex,
    gameState.phase,
    gameState.diceRolled,
    gameState.pendingAction,
    gameState.incomingTradeOffer,
    gameState.players,
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
    try {
      const account = await loginWithGoogle();
      if (account) {
        setUserAccount(account);
        return;
      }
    } catch (err) {
      console.warn('[Auth] Google login popup fallback:', err);
    }
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

    // Doubles streak 3rd time check -> Straight to Jail (Kodes)
    if (isDouble && !currentPlayer.isJailed) {
      const nextDoubles = (gameState.doublesCount || 0) + 1;
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
          addLog(updated, `🚨 3 kez üst üste çift atan (${dice[0]}-${dice[1]}) ${p.name} doğrudan Kodese gönderildi!`, 'danger');
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
        const nextStreak = (prev.doublesCount || 0) + 1;
        updated.doublesCount = nextStreak;
        addLog(updated, `🎲 ${currentPlayer.name} çift attı: 🎲 ${dice[0]} - ${dice[1]}! İlerledikten sonra bir kez daha zar atacak! (${nextStreak}/3)`, 'success');
      } else {
        updated.doublesCount = 0;
        addLog(updated, `${currentPlayer.name} zar attı: 🎲 ${dice[0]} - ${dice[1]} (Toplam: ${diceTotal})`, 'action');
      }
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
        }, 220);
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
    updateAndBroadcastGameState((prev) => {
      const next = buildHouse(prev, tileId, myPlayerId || undefined);
      if (selectedTile && selectedTile.id === tileId) {
        const updatedTile = next.board.find(t => t.id === tileId);
        if (updatedTile) setSelectedTile(updatedTile);
      }
      return next;
    });
  };

  // Sell House Action
  const handleSellHouseAction = (tileId: number) => {
    updateAndBroadcastGameState((prev) => {
      const next = sellHouse(prev, tileId, myPlayerId || undefined);
      if (selectedTile && selectedTile.id === tileId) {
        const updatedTile = next.board.find(t => t.id === tileId);
        if (updatedTile) setSelectedTile(updatedTile);
      }
      return next;
    });
  };

  // Toggle Mortgage Action
  const handleToggleMortgageAction = (tileId: number) => {
    updateAndBroadcastGameState((prev) => {
      const next = toggleMortgage(prev, tileId, myPlayerId || undefined);
      if (selectedTile && selectedTile.id === tileId) {
        const updatedTile = next.board.find(t => t.id === tileId);
        if (updatedTile) setSelectedTile(updatedTile);
      }
      return next;
    });
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

    if (Boolean(targetPlayer.isBot) === true) {
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
    <div className={`w-full bg-[#050811] text-white font-['Fredoka',sans-serif] flex flex-col select-none ${
      gameState.phase === 'LOBBY'
        ? 'min-h-[100dvh] overflow-y-auto overflow-x-hidden'
        : 'h-[100dvh] w-screen overflow-hidden'
    }`}>
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
          <header className="h-11 sm:h-12 px-2 sm:px-4 flex items-center justify-between shrink-0 bg-slate-900/90 border-b border-slate-800/80 backdrop-blur-md z-40">
            <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
              <div className="flex items-center gap-1 sm:gap-1.5 font-['Cinzel',serif] font-black text-xs sm:text-sm tracking-wider shrink-0">
                <span className="text-sm sm:text-base">🎲</span>
                <span className="text-white hidden xs:inline">TURKISH</span>
                <span className="bg-gradient-to-r from-amber-300 via-amber-400 to-amber-200 bg-clip-text text-transparent">PARADISE</span>
              </div>
              <span className="text-[9px] sm:text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 sm:px-2 py-0.5 rounded-full border border-emerald-500/30 font-bold flex items-center gap-1 shrink-0">
                <Wifi className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-emerald-400 animate-pulse" />
                <span className="hidden xs:inline">Canlı</span>
              </span>
              <span className="text-[9px] sm:text-[10px] text-slate-400 font-mono bg-slate-800/80 px-1.5 sm:px-2 py-0.5 rounded-full border border-slate-700 hidden sm:inline-block">
                Oda: {gameState.roomId || gameState.settings?.roomCode}
              </span>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-3">
              {/* User Balance Display (Visible on Mobile & Desktop) */}
              {me && (
                <div className="flex items-center gap-1 bg-amber-500/15 border border-amber-500/30 px-2 sm:px-2.5 py-1 rounded-xl text-xs font-black text-amber-300 shrink-0">
                  <Coins className="w-3.5 h-3.5 text-amber-400" />
                  <span>₺{me.money.toLocaleString('tr-TR')}</span>
                </div>
              )}

              {userAccount ? (
                <button
                  onClick={() => setIsProfileModalOpen(true)}
                  className="flex items-center gap-1.5 sm:gap-2 bg-slate-800/90 hover:bg-slate-700/90 border border-amber-500/40 rounded-xl px-2 sm:px-3 py-1 text-xs transition cursor-pointer group shrink-0 active:scale-95"
                  title="Profil & İstatistikleri Gör"
                >
                  {userAccount.photoURL ? (
                    <img src={userAccount.photoURL} alt="" className="w-4 h-4 rounded-full object-cover shrink-0" />
                  ) : (
                    <span className="text-amber-400 font-bold shrink-0">👤</span>
                  )}
                  <span className="text-white font-bold group-hover:text-amber-300 transition hidden sm:inline truncate max-w-[90px]">
                    {userAccount.displayName}
                  </span>
                  <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.2 rounded font-black border border-amber-500/30 shrink-0">
                    🏆 {userAccount.stats?.gamesWon || 0}
                  </span>
                </button>
              ) : (
                <button
                  onClick={handleGoogleLogin}
                  className="flex items-center gap-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl px-2 sm:px-3 py-1 text-xs font-black text-slate-800 transition cursor-pointer shadow shrink-0 active:scale-95"
                  title="Google ile Giriş Yap"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                  <span className="hidden xs:inline">Giriş Yap</span>
                </button>
              )}

              <button
                onClick={() => setSoundEnabled(!soundEnabled)}
                className="p-1 sm:p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
                title="Ses Efektleri"
              >
                {soundEnabled ? <Volume2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400" /> : <VolumeX className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-500" />}
              </button>

              <button
                onClick={handleRestart}
                className="flex items-center gap-1 text-[11px] sm:text-xs font-bold bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 px-2 sm:px-3 py-1 sm:py-1.5 rounded-xl border border-rose-500/30 transition cursor-pointer"
              >
                <RotateCcw className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                <span className="hidden xs:inline">Yeniden</span>
              </button>
            </div>
          </header>

          {/* Main Gameplay Screen (100% Viewport Fitted) */}
          <main className="flex-1 min-h-0 px-1 sm:px-4 py-1 sm:py-2 flex items-center justify-center gap-2 sm:gap-4 overflow-hidden">
            
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

          {/* Mobile Bottom Navigation Bar (Visible only on < md screens) */}
          <div className="md:hidden shrink-0 h-12 bg-slate-900/95 border-t border-slate-800/90 px-3 flex items-center justify-around z-40 backdrop-blur-md pb-safe">
            <button
              onClick={() => setMobileSheet(mobileSheet === 'players' ? null : 'players')}
              className={`flex flex-col items-center justify-center gap-0.5 text-[10px] font-bold py-1 px-3 rounded-xl transition cursor-pointer ${
                mobileSheet === 'players' ? 'text-amber-400 bg-amber-500/20' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Oyuncular ({gameState.players.length})</span>
            </button>

            <button
              onClick={openMobileChat}
              className={`flex flex-col items-center justify-center gap-0.5 text-[10px] font-bold py-1 px-3 rounded-xl transition cursor-pointer relative ${
                mobileSheet === 'chat' ? 'text-amber-400 bg-amber-500/20' : 'text-slate-400 hover:text-white'
              }`}
            >
              <MessageSquare className="w-4 h-4" />
              <span>Sohbet</span>
              {unreadChatCount > 0 && (
                <span className="absolute -top-1 right-1.5 bg-rose-500 text-white text-[9px] font-black rounded-full px-1.5 py-0.2 animate-bounce shadow">
                  {unreadChatCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setMobileSheet(mobileSheet === 'logs' ? null : 'logs')}
              className={`flex flex-col items-center justify-center gap-0.5 text-[10px] font-bold py-1 px-3 rounded-xl transition cursor-pointer ${
                mobileSheet === 'logs' ? 'text-amber-400 bg-amber-500/20' : 'text-slate-400 hover:text-white'
              }`}
            >
              <ScrollText className="w-4 h-4" />
              <span>Kayıtlar</span>
            </button>
          </div>
        </>
      )}

      {/* Mobile Drawer / Slide-up Sheet (< md) */}
      {mobileSheet && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-slate-950/80 backdrop-blur-sm animate-fade-in md:hidden">
          <div
            className="fixed inset-0"
            onClick={() => setMobileSheet(null)}
          />
          <div className="bg-[#0b1222] border-t-2 border-amber-500/40 rounded-t-3xl p-4 w-full max-h-[82dvh] flex flex-col shadow-2xl relative z-10 animate-fade-in">
            <div className="w-12 h-1.5 bg-slate-700 rounded-full mx-auto mb-3 shrink-0" />
            <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3 shrink-0">
              <span className="text-sm font-black text-amber-400 uppercase tracking-wide flex items-center gap-1.5">
                {mobileSheet === 'players' && <><Users className="w-4 h-4" /> Oyuncu Durumu</>}
                {mobileSheet === 'chat' && <><MessageSquare className="w-4 h-4" /> Oyun Sohbeti</>}
                {mobileSheet === 'logs' && <><ScrollText className="w-4 h-4" /> Bildirimler & Kayıtlar</>}
              </span>
              <button
                onClick={() => setMobileSheet(null)}
                className="p-1 rounded-full bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              {mobileSheet === 'players' && (
                <PlayerList
                  players={gameState.players}
                  currentTurnIndex={gameState.currentTurnIndex}
                  board={gameState.board}
                  myPlayerId={myPlayerId}
                />
              )}
              {mobileSheet === 'chat' && (
                <div className="h-[55dvh]">
                  <Chat
                    messages={gameState.chatMessages || []}
                    currentPlayer={me || null}
                    onSendMessage={handleSendMessageAction}
                  />
                </div>
              )}
              {mobileSheet === 'logs' && (
                <div className="h-[55dvh]">
                  <GameLogs logs={gameState.logs} />
                </div>
              )}
            </div>
          </div>
        </div>
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
          onSellHouse={() => handleSellHouseAction(selectedTile.id)}
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
          onSellHouse={handleSellHouseAction}
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
          currentPlayer={me}
          onRestart={handleRestart}
          onOpenProfile={() => setIsProfileModalOpen(true)}
        />
      )}

    </div>
  );
};
