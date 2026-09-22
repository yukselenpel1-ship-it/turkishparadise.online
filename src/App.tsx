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
  FALLBACK_PLAYER_COLORS,
  FALLBACK_PLAYER_AVATARS,
  addLog,
  addTransaction,
  isPlayerHost,
  declareBankruptcy,
  evaluateTradeOfferByBot,
  autoLiquidateDebtOrBankrupt
} from './engine/gameEngine';
import {
  loginAsGuest,
  logoutUser,
  getSavedUser,
  saveLocalUser,
  getUserStats,
  syncRoomState,
  relayDiceRoll,
  subscribeToRoom,
  recordGameMatch,
  recordGameWin,
  getPersistentGuestId
} from './services/firebase';
import { syncManager } from './services/multiplayerSync';
import {
  initiateGoogleOAuthRedirect,
  handleGoogleOAuthCallback
} from './services/googleAuth';
import { soundManager } from './services/soundEffects';
import { updateUserPresence, subscribeToFriendRequests, subscribeToFriendsAndRequests, syncUserWithBackend } from './services/friendService';
import { publishPublicRoom, unpublishPublicRoom, setActiveHostRoomProvider } from './services/publicRoomsService';
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
import { ProfileModal, ProfileTab } from './components/ProfileModal';
import { DiceLogo } from './components/DiceLogo';
import { useLanguage, LanguageSwitcher } from './i18n/LanguageContext';
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
          if (parsed && parsed.players && parsed.players.length > 0 && Array.isArray(parsed.board) && parsed.board.length === 38) {
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
  const [profileInitialTab, setProfileInitialTab] = useState<ProfileTab>('stats');
  const [pendingRequestsCount, setPendingRequestsCount] = useState<number>(0);
  const { t, formatMoney } = useLanguage();
  const [tradeSelectedTile, setTradeSelectedTile] = useState<BoardTile | undefined>(undefined);
  const [tradeTargetPlayerId, setTradeTargetPlayerId] = useState<string | undefined>(undefined);
  const [isMoving, setIsMoving] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => soundManager.isEnabled());
  const [mobileSheet, setMobileSheet] = useState<'players' | 'chat' | 'logs' | null>(null);
  const [unreadChatCount, setUnreadChatCount] = useState<number>(0);
  const prevChatCountRef = useRef<number>(gameState.chatMessages?.length || 0);
  const gameStateRef = useRef<GameState>(gameState);
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  const isMovingRef = useRef<boolean>(isMoving);
  useEffect(() => {
    isMovingRef.current = isMoving;
  }, [isMoving]);

  const myPlayerIdRef = useRef<string | null>(myPlayerId);
  useEffect(() => {
    myPlayerIdRef.current = myPlayerId;
  }, [myPlayerId]);

  const pendingRemoteStateRef = useRef<GameState | null>(null);
  const activeStepIntervalRef = useRef<any>(null);
  const saveStorageTimeoutRef = useRef<any>(null);
  const sessionGenerationRef = useRef<number>(0);

  /**
   * Centralized Hard Game Session Termination
   * Completely tears down current multiplayer room, unpublishes presence/beacons,
   * notifies peers with ROOM_CLOSED, clears storage, and resets state.
   */
  const terminateGameSession = (reason: string = 'SESSION_TERMINATED', notifyPeers = true) => {
    const liveState = gameStateRef.current;
    const liveMyId = myPlayerIdRef.current;
    const targetRoom = liveState.roomId || liveState.settings?.roomCode;
    const isMeHost = Boolean(liveMyId && (liveState.hostPlayerId === liveMyId || liveState.players.find(p => p.id === liveMyId)?.isHost));

    // 1. If host, unpublish public room beacon and broadcast ROOM_CLOSED
    if (targetRoom) {
      if (isMeHost) {
        unpublishPublicRoom(targetRoom);
        if (notifyPeers) {
          syncManager.sendRoomClosed(targetRoom, liveState.sessionId, reason);
        }
      } else if (liveMyId && notifyPeers) {
        // Guest only sends a leave notice for their own seat
        syncManager.sendLeaveNotice(targetRoom, liveMyId, liveState.sessionId);
      }
      // Hard reset local sync manager state (close WebRTC, unsubscribe MQTT topic, clear listeners)
      syncManager.hardResetSession(targetRoom, liveMyId || undefined);
    }

    // 2. Clear all room and game persistence from Storage
    try {
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem(SESSION_PLAYER_ID_KEY);
        localStorage.removeItem(SESSION_PLAYER_ID_KEY);
        sessionStorage.removeItem(SESSION_ROOM_ID_KEY);
        localStorage.removeItem(SESSION_ROOM_ID_KEY);
        sessionStorage.removeItem(SESSION_PLAYER_NAME_KEY);
        sessionStorage.removeItem(SESSION_GAME_STATE_KEY);
        localStorage.removeItem(SESSION_GAME_STATE_KEY);

        // Clean room query parameter from URL
        const currentUrl = new URL(window.location.href);
        if (currentUrl.searchParams.has('room') || currentUrl.searchParams.has('oda') || currentUrl.searchParams.has('code')) {
          currentUrl.searchParams.delete('room');
          currentUrl.searchParams.delete('oda');
          currentUrl.searchParams.delete('code');
          window.history.replaceState(null, '', currentUrl.toString());
        }
      }
    } catch (e) {}

    // 3. Clear local state and advance session generation to drop any in-flight packets
    sessionGenerationRef.current++;
    if (activeStepIntervalRef.current) {
      clearInterval(activeStepIntervalRef.current);
      activeStepIntervalRef.current = null;
    }
    if (saveStorageTimeoutRef.current) {
      clearTimeout(saveStorageTimeoutRef.current);
      saveStorageTimeoutRef.current = null;
    }
    setMyPlayerId(null);
    setSelectedTile(null);
    setIsPropertiesModalOpen(false);
    setIsTradeModalOpen(false);
    setIsTransactionsModalOpen(false);
    setIsProfileModalOpen(false);
    setTradeSelectedTile(undefined);
    pendingRemoteStateRef.current = null;
    setIsMoving(false);
    isMovingRef.current = false;

    // 4. Create a completely fresh initial state with a new random roomCode, gameId, and sessionId
    const fresh = createInitialState();
    setGameState(fresh);
  };

  const debouncedSaveGameState = (state: GameState) => {
    if (saveStorageTimeoutRef.current) {
      clearTimeout(saveStorageTimeoutRef.current);
    }
    saveStorageTimeoutRef.current = setTimeout(() => {
      try {
        const serialized = JSON.stringify(state);
        sessionStorage.setItem(SESSION_GAME_STATE_KEY, serialized);
        localStorage.setItem(SESSION_GAME_STATE_KEY, serialized);
      } catch (e) {}
    }, 800);
  };

  const runLocalStepAnimation = (
    playerId: string,
    totalSteps: number,
    onComplete?: () => void
  ) => {
    if (activeStepIntervalRef.current) {
      clearInterval(activeStepIntervalRef.current);
      activeStepIntervalRef.current = null;
    }

    setIsMoving(true);
    isMovingRef.current = true;

    let currentStep = 0;
    const STEP_INTERVAL_MS = 180; // 180ms per tile step: silky smooth 60 FPS motion & responsive audio

    activeStepIntervalRef.current = setInterval(() => {
      currentStep++;
      soundManager.playStep();

      setGameState((prev) => {
        const { state } = advancePlayerStep(prev, playerId);
        return state;
      });

      if (currentStep >= totalSteps) {
        if (activeStepIntervalRef.current) {
          clearInterval(activeStepIntervalRef.current);
          activeStepIntervalRef.current = null;
        }

        setTimeout(() => {
          setIsMoving(false);
          isMovingRef.current = false;
          if (onComplete) {
            onComplete();
          }
        }, 120);
      }
    }, STEP_INTERVAL_MS);
  };

  // Cleanup active intervals on unmount
  useEffect(() => {
    return () => {
      if (activeStepIntervalRef.current) {
        clearInterval(activeStepIntervalRef.current);
      }
      if (saveStorageTimeoutRef.current) {
        clearTimeout(saveStorageTimeoutRef.current);
      }
    };
  }, []);

  // Subscribe to real-time incoming friend requests for profile badge
  useEffect(() => {
    if (!userAccount?.uid) {
      setPendingRequestsCount(0);
      return;
    }
    const unsubscribe = subscribeToFriendRequests(userAccount.uid, (requests) => {
      setPendingRequestsCount(requests.length);
    });
    return () => {
      unsubscribe();
    };
  }, [userAccount?.uid]);

  // Sync sound setting changes globally with soundManager
  useEffect(() => {
    return soundManager.subscribe((enabled) => {
      setSoundEnabled(enabled);
    });
  }, []);

  // Subtle audio alert when it becomes the user's turn
  const prevTurnIndexRef = useRef<number>(-1);
  useEffect(() => {
    if (gameState.phase === 'PLAYING') {
      const currentPlayer = gameState.players[gameState.currentTurnIndex];
      const isMe = currentPlayer?.id === myPlayerId;
      if (isMe && prevTurnIndexRef.current !== gameState.currentTurnIndex) {
        soundManager.playTurnAlert();
      }
      prevTurnIndexRef.current = gameState.currentTurnIndex;
    }
  }, [gameState.currentTurnIndex, gameState.phase, myPlayerId, gameState.players]);

  // Audio alert on incoming trade offer
  const prevTradeOfferRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const offerKey = gameState.incomingTradeOffer
      ? `${gameState.incomingTradeOffer.fromPlayerId}_${gameState.incomingTradeOffer.toPlayerId}_${gameState.incomingTradeOffer.offeredMoney}`
      : undefined;
    if (offerKey && offerKey !== prevTradeOfferRef.current) {
      if (gameState.incomingTradeOffer?.toPlayerId === myPlayerId) {
        soundManager.playTradeOffer();
      }
    }
    prevTradeOfferRef.current = offerKey;
  }, [gameState.incomingTradeOffer, myPlayerId]);

  // Audio alert on chance card
  useEffect(() => {
    if (gameState.pendingAction === 'CHANCE_CARD') {
      soundManager.playChanceCard();
    }
  }, [gameState.pendingAction]);

  // Audio alert on game end / victory
  useEffect(() => {
    if (gameState.phase === 'ENDED' && gameState.winner) {
      soundManager.playWin();
    }
  }, [gameState.phase, gameState.winner]);

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
        // Automatically sync session with backend to ensure fresh auth token in localStorage
        syncUserWithBackend(saved)
          .then((synced: UserAccount) => {
            if (synced && synced.friendCode) {
              setUserAccount((prev) => (prev ? { ...prev, ...synced } : synced));
            }
          })
          .catch(() => {});
      }
    }

    initAuth();
  }, []);

  // 1.5 Real-time Cloud Account & Friends Sync Listener
  useEffect(() => {
    if (!userAccount?.uid) return;
    const unsub = subscribeToFriendsAndRequests(
      userAccount.uid,
      userAccount.friendCode,
      ({ friends }) => {
        setUserAccount((prev) => {
          if (!prev) return prev;
          return { ...prev, friends };
        });
      }
    );
    return () => {
      unsub();
    };
  }, [userAccount?.uid, userAccount?.friendCode]);

  // 2. Keep URL query param and Session Storage always synced with active joined room & game state
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const currentUrl = new URL(window.location.href);
        const hasActiveJoinedRoom = Boolean(gameState.roomId && (gameState.phase === 'PLAYING' || gameState.players.length > 0));

        if (hasActiveJoinedRoom && gameState.roomId) {
          if (currentUrl.searchParams.get('room') !== gameState.roomId) {
            currentUrl.searchParams.set('room', gameState.roomId);
            window.history.replaceState(null, '', currentUrl.toString());
          }
          sessionStorage.setItem(SESSION_ROOM_ID_KEY, gameState.roomId);
          localStorage.setItem(SESSION_ROOM_ID_KEY, gameState.roomId);
          debouncedSaveGameState(gameState);
        } else if (!hasActiveJoinedRoom && !currentUrl.searchParams.get('invite') && !currentUrl.searchParams.get('oda')) {
          // If on landing screen before joining, clean up URL param so F5 reload stays on exact tab
          if (currentUrl.searchParams.has('room')) {
            currentUrl.searchParams.delete('room');
            window.history.replaceState(null, '', currentUrl.toString());
          }
        }
      } catch (e) {}
    }
  }, [gameState.roomId, gameState.phase, gameState.players.length]);

  // 2.5 Auto-sync public room directory & register active host room provider
  useEffect(() => {
    const isMeHost = isPlayerHost(gameState, myPlayerId);
    const roomId = gameState.roomId || gameState.settings?.roomCode;
    const isPublic = Boolean(gameState.settings?.isPublic);

    if (isMeHost && roomId && gameState.players.length > 0 && isPublic && gameState.phase !== 'ENDED') {
      const getRoomInfo = () => {
        const hostPlayer = gameState.players.find(p => p.isHost) || gameState.players[0];
        return {
          roomId,
          hostName: hostPlayer?.name || userAccount?.displayName || 'Kurucu',
          hostAvatar: hostPlayer?.avatar || '👑',
          playerCount: gameState.players.length,
          maxPlayers: 6,
          botCount: gameState.players.filter(p => p.isBot).length,
          phase: gameState.phase,
          startingMoney: gameState.settings?.startingMoney || 1500,
          isPublic: true,
          updatedAt: Date.now()
        };
      };

      setActiveHostRoomProvider(getRoomInfo);

      // Publish initial state immediately
      publishPublicRoom(getRoomInfo());

      // Periodic 2.5s live heartbeat while host is active
      const heartbeatInterval = setInterval(() => {
        publishPublicRoom(getRoomInfo());
      }, 2500);

      return () => {
        clearInterval(heartbeatInterval);
        setActiveHostRoomProvider(null);
        if (roomId) {
          unpublishPublicRoom(roomId);
        }
      };
    } else {
      setActiveHostRoomProvider(null);
      if (roomId && (!isPublic || gameState.phase === 'ENDED')) {
        unpublishPublicRoom(roomId);
      }
    }
  }, [
    gameState.phase,
    gameState.players.length,
    gameState.settings?.isPublic,
    gameState.settings?.startingMoney,
    gameState.roomId,
    gameState.settings?.roomCode,
    myPlayerId,
    userAccount?.displayName
  ]);

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

  // 3.5 Broadcast user online presence & current room in real-time
  useEffect(() => {
    if (userAccount && userAccount.friendCode) {
      const activeRoom = gameState.roomId || gameState.settings?.roomCode || 'TR-1001';
      updateUserPresence(
        userAccount.uid,
        userAccount.friendCode,
        userAccount.displayName,
        true,
        activeRoom
      );
    }
  }, [userAccount, gameState.roomId, gameState.settings?.roomCode, gameState.phase]);

  // 3.8 Window / Tab close listener to broadcast LEAVE_NOTICE to peers and unpublish public room
  useEffect(() => {
    const handleBeforeUnload = () => {
      const liveState = gameStateRef.current;
      const liveMyId = myPlayerIdRef.current;
      if (liveState.roomId && liveMyId) {
        if (isPlayerHost(liveState, liveMyId)) {
          unpublishPublicRoom(liveState.roomId);
        }
        syncManager.sendLeaveNotice(liveState.roomId, liveMyId);
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handleBeforeUnload);
    };
  }, []);

  // 4. Real-time Room State Synchronization & Auto Session Recovery on F5 Reload
  useEffect(() => {
    if (!gameState.roomId) return;

    const isMeHost = Boolean(myPlayerId && (gameState.hostPlayerId === myPlayerId || gameState.players.find(p => p.id === myPlayerId)?.isHost));
    const activeGeneration = sessionGenerationRef.current;

    const unsubscribe = subscribeToRoom(gameState.roomId, {
      isHost: isMeHost,
      sessionId: isMeHost ? gameState.sessionId : undefined,
      onUpdate: (remoteState) => {
        if (!remoteState || remoteState.roomId !== gameState.roomId) return;
        if (activeGeneration !== sessionGenerationRef.current) return;

        const liveMyId = myPlayerIdRef.current;
        const liveState = gameStateRef.current;
        const isCurrentlyHost = Boolean(liveMyId && (liveState.hostPlayerId === liveMyId || liveState.players.find(p => p.id === liveMyId)?.isHost));

        // 🛡️ SESSION INTEGRITY GUARD:
        // Host enforces its authoritative sessionId; drop rogue state with mismatch sessionId
        if (isCurrentlyHost && liveState.sessionId && remoteState.sessionId && remoteState.sessionId !== liveState.sessionId) {
          console.warn('[Session Guard] Host dropped packet from mismatched session:', {
            currentRoom: gameState.roomId,
            currentSession: liveState.sessionId,
            remoteSession: remoteState.sessionId,
            remoteGameId: remoteState.gameId
          });
          return;
        }

        // 🛡️ HOST PROTECTION SHIELD:
        // If I am already established as Host in this room, never accept an external state
        // that overwrites my host status or drops me from the player list!
        if (isCurrentlyHost && liveState.hostPlayerId === liveMyId && liveState.players.some(p => p.id === liveMyId)) {
          const remoteHost = remoteState.hostPlayerId;
          const hasMeInRemote = remoteState.players?.some(p => p.id === liveMyId);

          if (remoteHost !== liveMyId || !hasMeInRemote) {
            console.warn('[Host Shield] Rejected rogue/stale STATE_SYNC from peer:', {
              myPlayerId: liveMyId,
              currentHost: liveState.hostPlayerId,
              remoteHost,
              hasMeInRemote,
              remotePlayersCount: remoteState.players?.length
            });
            // Force-rebroadcast authoritative host state to correct any out-of-sync peers
            syncRoomState(liveState.roomId, liveState);
            return;
          }
        }

        // If local stepping animation is currently running, buffer remote state to apply on arrival
        if (isMovingRef.current) {
          pendingRemoteStateRef.current = remoteState;
          return;
        }

        // Guest adopts authoritative session ID
        if (!isCurrentlyHost && remoteState.sessionId) {
          syncManager.setSessionId(remoteState.sessionId);
        }

        setGameState(remoteState);
        debouncedSaveGameState(remoteState);

        // Auto-reconnect player to their seat ONLY if recovering after F5 with exact saved playerId
        const savedId = sessionStorage.getItem(SESSION_PLAYER_ID_KEY) || localStorage.getItem(SESSION_PLAYER_ID_KEY);
        if (!liveMyId && savedId) {
          const matchedPlayer = remoteState.players.find((p) => p.id === savedId);
          if (matchedPlayer) {
            setMyPlayerId(matchedPlayer.id);
          }
        }
      },
      onJoinRequest: (newPlayer, requestId) => {
        if (activeGeneration !== sessionGenerationRef.current) return;
        const liveMyId = myPlayerIdRef.current;
        const liveState = gameStateRef.current;
        const isHost = isPlayerHost(liveState, liveMyId);
        if (!isHost) return;
        if (newPlayer.id === liveMyId || (newPlayer.userId && newPlayer.userId === userAccount?.uid)) return;

        // Deduplication: Check if player already exists by userId or id
        const existingIdx = liveState.players.findIndex((p) =>
          (newPlayer.userId && p.userId === newPlayer.userId) || p.id === newPlayer.id
        );

        if (existingIdx >= 0) {
          // Idempotent restore: reconnect player in their existing slot
          const existingPlayer = liveState.players[existingIdx];
          const updatedPlayers = [...liveState.players];
          updatedPlayers[existingIdx] = {
            ...existingPlayer,
            isAfk: false
          };
          const updated: GameState = {
            ...liveState,
            players: updatedPlayers
          };
          setGameState(updated);
          addLog(updated, `✨ ${existingPlayer.name} tekrar bağlandı!`, 'success');
          syncRoomState(liveState.roomId || '', updated);
          syncManager.sendJoinAccept(liveState.roomId || '', newPlayer.id, updated, requestId);
          return;
        }

        // Capacity & Phase Checks
        if (liveState.phase !== 'LOBBY') {
          syncManager.sendJoinRejected(liveState.roomId || '', newPlayer.id, 'Oyun zaten başladı! İzleyici olarak katılabilirsiniz.', requestId);
          return;
        }
        const activeCount = liveState.players.filter(p => p.inGame).length;
        if (activeCount >= 6) {
          syncManager.sendJoinRejected(liveState.roomId || '', newPlayer.id, 'Oda dolu (Maksimum 6 oyuncu)!', requestId);
          return;
        }
        if (liveState.players.length >= 16) {
          syncManager.sendJoinRejected(liveState.roomId || '', newPlayer.id, 'Oda kapasitesi dolu!', requestId);
          return;
        }

        // Auto-resolve color conflict
        const allColors = [...PLAYER_COLORS, ...FALLBACK_PLAYER_COLORS];
        const takenColors = liveState.players.map((p) => p.color);
        let assignedColor = newPlayer.color;
        if (!assignedColor || takenColors.includes(assignedColor)) {
          const freeColor = allColors.find((c) => !takenColors.includes(c));
          assignedColor = freeColor || `hsl(${Math.floor(Math.random() * 360)}, 85%, 60%)`;
        }

        // Auto-resolve avatar conflict
        const allAvatars = [...PLAYER_AVATARS, ...FALLBACK_PLAYER_AVATARS];
        const takenAvatars = liveState.players.map((p) => p.avatar);
        let assignedAvatar = newPlayer.avatar;
        if (!assignedAvatar || takenAvatars.includes(assignedAvatar)) {
          const freeAvatar = allAvatars.find((a) => !takenAvatars.includes(a));
          assignedAvatar = freeAvatar || '🎲';
        }

        const startMoney = liveState.settings?.startingMoney || 1500;
        const playerToAdd: Player = {
          ...newPlayer,
          color: assignedColor,
          avatar: assignedAvatar,
          money: startMoney,
          position: 0,
          isJailed: false,
          jailTurns: 0,
          lapsCompleted: 0,
          firstLapPurchases: 0,
          inGame: true,
          isHost: false,
          isAfk: false,
          isBot: false
        };

        const updated: GameState = {
          ...liveState,
          hostPlayerId: liveState.hostPlayerId || liveMyId || undefined,
          players: [...liveState.players, playerToAdd]
        };

        setGameState(updated);
        addLog(updated, `🎉 ${playerToAdd.name} odaya katıldı! (${liveState.roomId})`, 'success');
        syncRoomState(liveState.roomId || '', updated);
        syncManager.sendJoinAccept(liveState.roomId || '', newPlayer.id, updated, requestId);
      },
      onJoinAccept: (msg) => {
        if (activeGeneration !== sessionGenerationRef.current) return;
        const liveMyId = myPlayerIdRef.current;
        const currentUid = userAccount?.uid || getPersistentGuestId();
        const isTargetMe = msg.targetPlayerId === liveMyId || msg.targetPlayerId?.includes(currentUid.replace(/[^a-zA-Z0-9]/g, '').slice(0, 16));
        if (!isTargetMe || !msg.state) return;

        const remoteState = msg.state as GameState;
        if (remoteState.sessionId) {
          syncManager.setSessionId(remoteState.sessionId);
        }
        setGameState(remoteState);
        debouncedSaveGameState(remoteState);

        if (liveMyId && remoteState.roomId) {
          syncManager.sendJoinConfirm(remoteState.roomId, liveMyId, remoteState.sessionId, msg.requestId);
        }
      },
      onJoinConfirm: (requestId, playerId) => {
        if (activeGeneration !== sessionGenerationRef.current) return;
        const liveMyId = myPlayerIdRef.current;
        const liveState = gameStateRef.current;
        if (!isPlayerHost(liveState, liveMyId)) return;

        const p = liveState.players.find(x => x.id === playerId);
        if (p && p.isAfk) {
          const updated = {
            ...liveState,
            players: liveState.players.map(x => x.id === playerId ? { ...x, isAfk: false } : x)
          };
          setGameState(updated);
          syncRoomState(liveState.roomId || '', updated);
        }
      },
      onJoinRejected: (reason) => {
        if (activeGeneration !== sessionGenerationRef.current) return;
        alert(`Odaya katılınamadı: ${reason || 'Oda kurucusu katılımı reddetti.'}`);
        terminateGameSession('JOIN_REJECTED', false);
      },
      onWatchRequest: (spectator, requestId) => {
        if (activeGeneration !== sessionGenerationRef.current) return;
        const liveMyId = myPlayerIdRef.current;
        const liveState = gameStateRef.current;
        if (!isPlayerHost(liveState, liveMyId)) return;

        const existingSpectators = liveState.spectators || [];
        let nextSpectators = [...existingSpectators];
        if (!nextSpectators.some(s => s.id === spectator.id)) {
          nextSpectators.push({
            id: spectator.id,
            name: spectator.name || 'İzleyici',
            avatar: spectator.avatar || '👁️',
            joinedAt: Date.now()
          });
        }

        const updated: GameState = {
          ...liveState,
          spectators: nextSpectators
        };

        setGameState(updated);
        syncRoomState(liveState.roomId || '', updated);
        syncManager.sendWatchAccept(liveState.roomId || '', spectator.id, updated, requestId);
      },
      onWatchAccept: (msg) => {
        if (activeGeneration !== sessionGenerationRef.current) return;
        const liveMyId = myPlayerIdRef.current;
        const currentUid = userAccount?.uid || getPersistentGuestId();
        const isTargetMe = msg.targetSpectatorId === liveMyId || msg.targetSpectatorId?.includes(currentUid.replace(/[^a-zA-Z0-9]/g, '').slice(0, 16));
        if (!isTargetMe || !msg.state) return;

        const remoteState = msg.state as GameState;
        if (remoteState.sessionId) {
          syncManager.setSessionId(remoteState.sessionId);
        }
        setGameState(remoteState);
        debouncedSaveGameState(remoteState);

        const spectatorName = userAccount?.displayName || 'İzleyici';
        if (liveMyId && remoteState.roomId) {
          syncManager.sendWatchConfirm(remoteState.roomId, liveMyId, spectatorName, remoteState.sessionId, msg.requestId);
        }
      },
      onWatchConfirm: (requestId, spectatorId) => {
        if (activeGeneration !== sessionGenerationRef.current) return;
        const liveMyId = myPlayerIdRef.current;
        const liveState = gameStateRef.current;
        if (!isPlayerHost(liveState, liveMyId)) return;

        const spectator = liveState.spectators?.find(s => s.id === spectatorId);
        const name = spectator?.name || 'Bir izleyici';
        const updated = { ...liveState };
        addLog(updated, `👁️ ${name} oyunu izlemeye başladı! (${liveState.roomId})`, 'info');
        setGameState(updated);
        syncRoomState(liveState.roomId || '', updated);
      },
      onRequestSync: () => {
        if (activeGeneration !== sessionGenerationRef.current) return;
        const liveState = gameStateRef.current;
        if (liveState.roomId && liveState.players.length > 0) {
          syncRoomState(liveState.roomId, liveState);
        }
      },
      onPlayerLeft: (leavingPlayerId) => {
        if (activeGeneration !== sessionGenerationRef.current) return;
        setGameState((prev) => {
          const isMe = isPlayerHost(prev, myPlayerId);

          if (isMe) {
            // I AM THE HOST: A guest player is leaving
            if (leavingPlayerId === myPlayerId) return prev;

            const leavingPlayer = prev.players.find((p) => p.id === leavingPlayerId);
            if (!leavingPlayer) {
              // Check if spectator left
              if (prev.spectators?.some(s => s.id === leavingPlayerId)) {
                const nextSpectators = prev.spectators.filter(s => s.id !== leavingPlayerId);
                const updated: GameState = { ...prev, spectators: nextSpectators };
                syncRoomState(prev.roomId, updated);
                return updated;
              }
              return prev;
            }

            let updated: GameState;
            if (prev.phase === 'LOBBY') {
              updated = {
                ...prev,
                hostPlayerId: prev.hostPlayerId || myPlayerId || undefined,
                players: prev.players.filter((p) => p.id !== leavingPlayerId)
              };
              addLog(updated, `🚪 ${leavingPlayer.name} odadan ayrıldı.`, 'info');
            } else {
              const updatedPlayers = prev.players.map((p) =>
                p.id === leavingPlayerId ? { ...p, isAfk: true } : p
              );
              updated = {
                ...prev,
                hostPlayerId: prev.hostPlayerId || myPlayerId || undefined,
                players: updatedPlayers
              };
              addLog(updated, `🚪 ${leavingPlayer.name} oyundan ayrıldı (AFK moduna geçti).`, 'warning');
            }

            syncRoomState(prev.roomId, updated);
            return updated;
          } else {
            // I AM A GUEST: Check if the HOST left
            const hostId = prev.hostPlayerId || prev.players.find((p) => p.isHost)?.id || prev.players[0]?.id;
            if (hostId && hostId === leavingPlayerId) {
              const remainingHumans = prev.players.filter((p) => p.id !== leavingPlayerId && !p.isBot);
              const nextHost = remainingHumans[0];

              if (!nextHost) return prev;

              const updatedPlayers = prev.players
                .filter((p) => prev.phase === 'LOBBY' ? p.id !== leavingPlayerId : true)
                .map((p) => ({
                  ...p,
                  isAfk: p.id === leavingPlayerId ? true : p.isAfk,
                  isHost: p.id === nextHost.id
                }));

              const leavingName = prev.players.find(p => p.id === leavingPlayerId)?.name || 'Kurucu';
              const updated: GameState = {
                ...prev,
                hostPlayerId: nextHost.id,
                players: updatedPlayers
              };
              addLog(updated, `👑 Oda Kurucusu (${leavingName}) ayrıldı. Yeni Kurucu: ${nextHost.name}!`, 'warning');

              if (nextHost.id === myPlayerId) {
                syncManager.sendHostMigrated(prev.roomId, nextHost.id);
                syncRoomState(prev.roomId, updated);
              }
              return updated;
            }

            if (prev.phase === 'LOBBY') {
              return {
                ...prev,
                players: prev.players.filter((p) => p.id !== leavingPlayerId)
              };
            }
            return prev;
          }
        });
      },
      onHostMigrated: (newHostPlayerId) => {
        if (activeGeneration !== sessionGenerationRef.current) return;
        setGameState((prev) => {
          const updatedPlayers = prev.players.map((p) => ({
            ...p,
            isHost: p.id === newHostPlayerId
          }));
          const newHostName = prev.players.find(p => p.id === newHostPlayerId)?.name || 'Oyuncu';
          const updated: GameState = {
            ...prev,
            hostPlayerId: newHostPlayerId,
            players: updatedPlayers
          };
          addLog(updated, `👑 Oda kuruculuğu ${newHostName} oyuncusuna devredildi.`, 'info');
          return updated;
        });
      },
      onGameAction: (senderPlayerId, actionType, payload) => {
        if (activeGeneration !== sessionGenerationRef.current) return;
        const liveState = gameStateRef.current;
        const liveMyId = myPlayerIdRef.current;
        const isMeHost = isPlayerHost(liveState, liveMyId);
        if (!isMeHost) return;

        // Security / spectator check: Sender MUST exist, be active inGame, and not be a spectator!
        const sender = liveState.players.find((p) => p.id === senderPlayerId);
        if (!sender || !sender.inGame) {
          console.warn('[Host onGameAction] Rejected action from spectator/inactive player:', senderPlayerId, actionType);
          return;
        }

        const currentTurnPlayer = liveState.players[liveState.currentTurnIndex];

        if (actionType === 'ROLL_DICE') {
          if (currentTurnPlayer?.id !== senderPlayerId) return;
          if (!isMovingRef.current && !liveState.diceRolled) {
            handleRollDiceAction();
          }
        } else if (actionType === 'BUY_PROPERTY') {
          if (currentTurnPlayer?.id !== senderPlayerId) return;
          if (liveState.pendingAction === 'BUY_PROPERTY') {
            handleBuyPropertyAction(senderPlayerId);
          }
        } else if (actionType === 'PASS_PROPERTY') {
          if (currentTurnPlayer?.id !== senderPlayerId) return;
          if (liveState.pendingAction === 'BUY_PROPERTY') {
            handlePassPropertyAction(senderPlayerId);
          }
        } else if (actionType === 'END_TURN') {
          if (currentTurnPlayer?.id !== senderPlayerId) return;
          if (liveState.diceRolled && !isMovingRef.current) {
            handleEndTurnAction();
          }
        } else if (actionType === 'PAY_JAIL') {
          if (currentTurnPlayer?.id !== senderPlayerId) return;
          handlePayJailBailAction();
        } else if (
          actionType === 'BUILD_HOUSE' &&
          typeof payload?.tileId === 'number' &&
          Number.isInteger(payload.tileId) &&
          payload.tileId >= 0 &&
          payload.tileId < 38
        ) {
          handleBuildHouseAction(payload.tileId, senderPlayerId);
        } else if (
          actionType === 'SELL_HOUSE' &&
          typeof payload?.tileId === 'number' &&
          Number.isInteger(payload.tileId) &&
          payload.tileId >= 0 &&
          payload.tileId < 38
        ) {
          handleSellHouseAction(payload.tileId, senderPlayerId);
        } else if (
          actionType === 'MORTGAGE' &&
          typeof payload?.tileId === 'number' &&
          Number.isInteger(payload.tileId) &&
          payload.tileId >= 0 &&
          payload.tileId < 38
        ) {
          handleToggleMortgageAction(payload.tileId, senderPlayerId);
        } else if (actionType === 'BANKRUPTCY') {
          handleDeclareBankruptcyAction(senderPlayerId);
        } else if (actionType === 'CONFIRM_CHANCE') {
          if (currentTurnPlayer?.id !== senderPlayerId) return;
          if (liveState.pendingAction === 'CHANCE_CARD') {
            handleConfirmChanceCard();
          }
        } else if (
          actionType === 'SELL_TO_BANK' &&
          typeof payload?.tileId === 'number' &&
          Number.isInteger(payload.tileId) &&
          payload.tileId >= 0 &&
          payload.tileId < 38
        ) {
          handleSellToBankAction(payload.tileId, senderPlayerId);
        } else if (actionType === 'TRADE_OFFER' && payload && payload.fromPlayerId === senderPlayerId) {
          handleExecuteTradeAction(payload);
        } else if (actionType === 'ACCEPT_TRADE') {
          if (liveState.incomingTradeOffer && liveState.incomingTradeOffer.toPlayerId === senderPlayerId) {
            handleAcceptIncomingTrade();
          }
        } else if (actionType === 'DECLINE_TRADE') {
          if (
            liveState.incomingTradeOffer &&
            (liveState.incomingTradeOffer.toPlayerId === senderPlayerId ||
              liveState.incomingTradeOffer.fromPlayerId === senderPlayerId)
          ) {
            handleDeclineIncomingTrade();
          }
        } else if (actionType === 'CHAT_MESSAGE' && payload?.text && typeof payload.text === 'string') {
          handleSendMessageAction(payload.text, senderPlayerId);
        }
      },
      onDiceRolled: (diceData) => {
        if (activeGeneration !== sessionGenerationRef.current) return;
        const liveMyId = myPlayerIdRef.current;
        const liveState = gameStateRef.current;
        const isMeHost = isPlayerHost(liveState, liveMyId);
        if (isMeHost) return;

        const rollingPlayer = liveState.players.find((p) => p.id === diceData.playerId);
        if (!rollingPlayer) return;

        soundManager.playDiceRoll();

        setGameState((prev) => {
          const updated = JSON.parse(JSON.stringify(prev)) as GameState;
          updated.dice = diceData.dice;
          updated.diceRolled = true;
          updated.doublesCount = diceData.doublesStreak;
          if (diceData.isDouble) {
            addLog(
              updated,
              `🎲 ${rollingPlayer.name} çift attı: 🎲 ${diceData.dice[0]} - ${diceData.dice[1]}! İlerledikten sonra bir kez daha zar atacak! (${diceData.doublesStreak}/3)`,
              'success'
            );
          } else {
            addLog(
              updated,
              `${rollingPlayer.name} zar attı: 🎲 ${diceData.dice[0]} - ${diceData.dice[1]} (Toplam: ${diceData.total})`,
              'action'
            );
          }
          return updated;
        });

        runLocalStepAnimation(diceData.playerId, diceData.total, () => {
          if (pendingRemoteStateRef.current) {
            const next = pendingRemoteStateRef.current;
            pendingRemoteStateRef.current = null;
            setGameState(next);
            debouncedSaveGameState(next);
          }
        });
      },
      onRoomClosed: (reason) => {
        const liveState = gameStateRef.current;
        const liveMyId = myPlayerIdRef.current;
        const isCurrentHost = Boolean(liveMyId && (liveState.hostPlayerId === liveMyId || liveState.players.find(p => p.id === liveMyId)?.isHost));
        if (isCurrentHost) return;

        console.log('[Multiplayer] Received ROOM_CLOSED from host:', reason);
        terminateGameSession('ROOM_CLOSED', false);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [gameState.roomId, gameState.sessionId, myPlayerId, userAccount]);

  // Sync state changes to room (only host or initial room creator broadcasts to network)
  const updateAndBroadcastGameState = (updater: (prev: GameState) => GameState, allowNonHost = false) => {
    setGameState((prev) => {
      const isHost = isPlayerHost(prev, myPlayerId);
      const isInitialRoomCreation = prev.players.length === 0 || !prev.hostPlayerId;
      const next = updater(prev);

      if (next.roomId && (isHost || isInitialRoomCreation || allowNonHost)) {
        syncRoomState(next.roomId, next);
        debouncedSaveGameState(next);
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

    const isMeHost = isPlayerHost(gameState, myPlayerId);
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

    const isMeHost = isPlayerHost(gameState, myPlayerId);
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

  // 6.55 Auto-confirm Chance/Chest Card after 10 seconds if active player does not click
  useEffect(() => {
    if (gameState.phase !== 'PLAYING' || gameState.pendingAction !== 'CHANCE_CARD' || isMoving) return;

    const isMeHost = isPlayerHost(gameState, myPlayerId);
    if (!isMeHost) return;

    const currentPlayer = gameState.players[gameState.currentTurnIndex];
    // Bots and AFK already have their fast 1.2s handler in the bot loop.
    // For active human players, set a 10.5s host auto-confirm fallback:
    if (currentPlayer && !currentPlayer.isBot && !currentPlayer.isAfk) {
      const timer = setTimeout(() => {
        handleConfirmChanceCard();
      }, 10500);
      return () => clearTimeout(timer);
    }
  }, [gameState.pendingAction, gameState.phase, gameState.currentTurnIndex, isMoving, myPlayerId]);

  // 6.6 Automatic Game Outcome Stats Tracking (Wins, Losses, Bankruptcy, Matches Played)
  const recordedMatchKeyRef = useRef<string>('');

  useEffect(() => {
    if (gameState.phase === 'ENDED' && gameState.winner && userAccount) {
      const matchKey = `match_${gameState.roomId}_${gameState.winner.id}`;
      if (recordedMatchKeyRef.current === matchKey) return;
      recordedMatchKeyRef.current = matchKey;

      const myPlayer = myPlayerId ? gameState.players.find((p) => p.id === myPlayerId) : undefined;
      if (!myPlayer) return;

      const isMeWinner = gameState.winner.id === myPlayer.id;
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
  }, [gameState.phase, gameState.winner, gameState.roomId, gameState.players, myPlayerId, userAccount]);

  // 3. Handle Bot & AFK Auto-Takeover Turns with Smooth Pacing & Visible Animation
  useEffect(() => {
    if (gameState.phase !== 'PLAYING' || isMoving) return;

    // If an ACTIVE human player is reviewing an incoming trade offer, wait for their decision
    if (gameState.incomingTradeOffer) {
      const recipient = gameState.players.find((p) => p.id === gameState.incomingTradeOffer?.toPlayerId);
      if (recipient && !recipient.isBot && !recipient.isAfk) {
        return;
      }
    }

    const currentPlayer = gameState.players[gameState.currentTurnIndex];
    const isMeHost = isPlayerHost(gameState, myPlayerId);

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
      // 0. Pending Debt Settlement Auto-Recovery for Bot or AFK Human
      if (gameState.pendingAction === 'DEBT_SETTLEMENT' || (currentPlayer && currentPlayer.money < 0)) {
        const timer = setTimeout(() => {
          updateAndBroadcastGameState((prev) => {
            const p = prev.players[prev.currentTurnIndex];
            if (!p) return prev;
            return autoLiquidateDebtOrBankrupt(prev, p.id);
          });
        }, 1500 + afkDelay);
        return () => clearTimeout(timer);
      }

      // 1. Pending Property Decision
      if (gameState.pendingAction === 'BUY_PROPERTY') {
        const timer = setTimeout(() => {
          const tile = gameState.board[currentPlayer.position];
          let shouldBuy = false;
          if (tile && tile.price) {
            const hasSameColor = tile.colorGroup ? gameState.board.some(t => t.id !== tile.id && t.colorGroup === tile.colorGroup && t.ownerId === currentPlayer.id) : false;

            if (difficulty === 'hard') {
              // Hard Bot: Aggressive buyer, buys if it can afford the price
              shouldBuy = currentPlayer.money >= tile.price;
            } else if (difficulty === 'medium') {
              // Medium Bot: Smart investor, buys if money >= price, high buy rate
              shouldBuy = currentPlayer.money >= tile.price && (hasSameColor || currentPlayer.money >= tile.price + 30 || Math.random() > 0.1);
            } else {
              // Easy Bot: Low aggression, casual buyer (~40-45% buy rate, reduced by 50%)
              shouldBuy = currentPlayer.money >= tile.price + 50 && (hasSameColor ? Math.random() > 0.4 : Math.random() > 0.55);
            }
          }
          if (shouldBuy) {
            handleBuyPropertyAction(currentPlayer.id);
          } else {
            handlePassPropertyAction(currentPlayer.id);
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

  // 3.5 Auto-resolve Incoming Trade Offer if recipient is AFK or Bot
  useEffect(() => {
    if (gameState.phase !== 'PLAYING' || !gameState.incomingTradeOffer || isMoving) return;

    const isMeHost = isPlayerHost(gameState, myPlayerId);
    if (!isMeHost) return;

    const recipient = gameState.players.find((p) => p.id === gameState.incomingTradeOffer?.toPlayerId);
    if (!recipient) {
      updateAndBroadcastGameState((prev) => ({ ...prev, incomingTradeOffer: undefined }));
      return;
    }

    if (recipient.isBot || recipient.isAfk) {
      const timer = setTimeout(() => {
        updateAndBroadcastGameState((prev) => {
          if (!prev.incomingTradeOffer) return prev;
          const target = prev.players.find((p) => p.id === prev.incomingTradeOffer?.toPlayerId);
          if (!target) return { ...prev, incomingTradeOffer: undefined };

          const evalResult = evaluateTradeOfferByBot(prev, prev.incomingTradeOffer, target);
          if (evalResult.accepted) {
            addLog(prev, `🤝 AFK (${target.name}) adına bot takas teklifini kabul etti!`, 'success');
            return executeTrade(prev, prev.incomingTradeOffer);
          } else {
            const sender = prev.players.find((p) => p.id === prev.incomingTradeOffer?.fromPlayerId);
            addLog(prev, `❌ AFK (${target.name}) adına bot, ${sender?.name || 'gelen'} takas teklifini reddetti: ${evalResult.reason}`, 'warning');
            return { ...prev, incomingTradeOffer: undefined };
          }
        });
      }, 2200);
      return () => clearTimeout(timer);
    }
  }, [gameState.incomingTradeOffer, gameState.phase, gameState.players, isMoving, myPlayerId]);

  // 3.6 Host fallback timer for Chance Card: auto-confirm after 10.5s if active player doesn't respond
  useEffect(() => {
    if (gameState.phase !== 'PLAYING' || gameState.pendingAction !== 'CHANCE_CARD' || isMoving) return;
    const isMeHost = isPlayerHost(gameState, myPlayerId);
    if (!isMeHost) return;

    const timer = setTimeout(() => {
      handleConfirmChanceCard();
    }, 10500);

    return () => clearTimeout(timer);
  }, [gameState.phase, gameState.pendingAction, isMoving, myPlayerId]);

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

  // Auth Handlers: Direct official Google OAuth 2.0 redirect
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
    terminateGameSession('LOGOUT', true);
    await logoutUser();
    setUserAccount(null);
  };

  // Join Game as Player or Spectator
  const handleJoin = (
    name: string,
    avatar: string,
    color?: string,
    isOnline = true,
    targetRoomCode?: string,
    isCreating = false,
    isSpectator = false
  ) => {
    try {
      const finalRoom = (targetRoomCode || gameState.roomId || gameState.settings?.roomCode || `TR-${Math.floor(1000 + Math.random() * 9000)}`).trim().toUpperCase();
      const currentUserId = userAccount?.uid || getPersistentGuestId();
      // Stable in-room playerId generated deterministically per user
      const cleanUid = currentUserId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 16);
      const newPlayerId = isCreating ? `p_${cleanUid}_${Math.random().toString(36).substring(2, 7)}` : `p_${cleanUid}`;
      const startMoney = gameState.settings?.startingMoney || 1500;
      
      const isCreatingRoom = Boolean(isCreating);

      // Determine unique color
      const allColors = [...PLAYER_COLORS, ...FALLBACK_PLAYER_COLORS];
      let chosenColor = color || PLAYER_COLORS[0];

      // Determine unique avatar
      const allAvatars = [...PLAYER_AVATARS, ...FALLBACK_PLAYER_AVATARS];
      let chosenAvatar = avatar || PLAYER_AVATARS[0];

      const newPlayer: Player = {
        id: newPlayerId,
        userId: currentUserId,
        name: name || userAccount?.displayName || 'Oyuncu',
        avatar: chosenAvatar,
        color: chosenColor,
        money: startMoney,
        position: 0,
        isJailed: false,
        jailTurns: 0,
        lapsCompleted: 0,
        firstLapPurchases: 0,
        inGame: !isSpectator,
        isBot: false,
        isHost: isCreatingRoom
      };

      setMyPlayerId(newPlayerId);

      try {
        sessionStorage.setItem(SESSION_PLAYER_ID_KEY, newPlayerId);
        localStorage.setItem(SESSION_PLAYER_ID_KEY, newPlayerId);
        sessionStorage.setItem(SESSION_PLAYER_NAME_KEY, newPlayer.name);
        sessionStorage.setItem(SESSION_ROOM_ID_KEY, finalRoom);
        localStorage.setItem(SESSION_ROOM_ID_KEY, finalRoom);
      } catch (e) {}

      if (isCreatingRoom) {
        // Ensure prior session networks are hard reset and session generation advanced
        syncManager.hardResetSession(finalRoom, newPlayerId);
        sessionGenerationRef.current++;

        // Create fresh room state and broadcast as authoritative Host
        const freshState: GameState = {
          ...createInitialState({ roomCode: finalRoom, startingMoney: startMoney }),
          roomId: finalRoom,
          hostPlayerId: newPlayerId,
          isOnlineGame: isOnline,
          settings: {
            ...gameState.settings,
            roomCode: finalRoom,
            isPublic: false
          },
          players: [newPlayer],
          phase: 'LOBBY'
        };

        setGameState(freshState);
        syncRoomState(finalRoom, freshState);
        debouncedSaveGameState(freshState);
      } else {
        // Joining Guest or Spectator: DO NOT create a new session!
        // Clear dummy local sessionId and hostPlayerId so Guest seamlessly adopts Host's state on STATE_SYNC
        setGameState((prev) => ({
          ...prev,
          roomId: finalRoom,
          sessionId: undefined,
          gameId: undefined,
          hostPlayerId: undefined,
          isOnlineGame: isOnline,
          settings: { ...prev.settings, roomCode: finalRoom },
          players: isSpectator ? prev.players : [newPlayer]
        }));

        if (isSpectator) {
          syncManager.sendWatchRequest(finalRoom, {
            id: newPlayerId,
            name: newPlayer.name,
            avatar: newPlayer.avatar,
            userId: currentUserId
          });
        } else {
          syncManager.sendJoinRequest(finalRoom, newPlayer);
        }
        syncManager.sendRequestSync(finalRoom);
      }
    } catch (err) {
      console.error('[handleJoin] Error joining/creating room:', err);
    }
  };

  // Leave Lobby / Go Back (Hard disconnect and full reset)
  const handleLeaveLobby = () => {
    terminateGameSession('LEAVE_LOBBY', true);
  };

  // Remove player or bot from room (Host Only)
  const handleRemovePlayer = (playerIdToRemove: string) => {
    updateAndBroadcastGameState((prev) => {
      const isHost = isPlayerHost(prev, myPlayerId);
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
    const isMeHost = isPlayerHost(gameState, myPlayerId);
    if (!isMeHost) return;

    updateAndBroadcastGameState((prev) => ({
      ...prev,
      settings: newSettings,
      roomId: newSettings.roomCode
    }));
  };

  // Add Bot Player with Difficulty & Guaranteed Unique Color (Host Only)
  const handleAddBot = (difficulty: BotDifficulty = 'medium') => {
    const isMeHost = isPlayerHost(gameState, myPlayerId);
    if (!isMeHost || gameState.players.length >= 6) return;

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

  // Start Game (Host Only)
  const handleStartGame = () => {
    const isMeHost = isPlayerHost(gameState, myPlayerId);
    if (!isMeHost || gameState.players.length < 2) return;

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

  // Join Friend's Room Directly from Profile Modal
  const handleJoinFriendRoom = (targetRoomId: string) => {
    const cleanRoom = targetRoomId.trim().toUpperCase();
    if (!cleanRoom) return;

    if (gameState.roomId !== cleanRoom) {
      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.set('room', cleanRoom);
      window.history.replaceState(null, '', currentUrl.toString());

      try {
        sessionStorage.setItem(SESSION_ROOM_ID_KEY, cleanRoom);
        localStorage.setItem(SESSION_ROOM_ID_KEY, cleanRoom);
      } catch (e) {}

      const existingPlayer = myPlayerId ? gameState.players.find(p => p.id === myPlayerId) : undefined;
      const myName = existingPlayer?.name || userAccount?.displayName || 'Oyuncu';
      const myAvatar = existingPlayer?.avatar || '🎩';
      const myColor = existingPlayer?.color || '#3b82f6';

      handleJoin(myName, myAvatar, myColor, true, cleanRoom, false);
    }
  };

  // Step-by-Step Animated Roll Dice Action
  const handleRollDiceAction = () => {
    const liveState = gameStateRef.current;
    const liveMyId = myPlayerIdRef.current;

    if (isMovingRef.current || liveState.diceRolled || liveState.phase !== 'PLAYING') return;

    const currentPlayer = liveState.players[liveState.currentTurnIndex];
    if (!currentPlayer || !currentPlayer.inGame) return;

    const isMeHost = isPlayerHost(liveState, liveMyId);
    const isMeCurrent = currentPlayer.id === liveMyId;

    // Non-host player: forward action to authoritative host
    if (!isMeHost) {
      const myPlayer = liveState.players.find((p) => p.id === liveMyId);
      if (!myPlayer || !myPlayer.inGame || !isMeCurrent) return;
      if (liveState.roomId && liveMyId) {
        const actionId = syncManager.sendGameAction(liveState.roomId, liveMyId, 'ROLL_DICE');
        void relayDiceRoll(liveState.roomId, liveMyId, actionId);
      }
      return;
    }

    // Authoritative Host rolls dice and performs movement
    const dice = rollDice();
    const diceTotal = dice[0] + dice[1];
    const isDouble = dice[0] === dice[1];

    // Trigger soft audio on dice roll
    soundManager.playDiceRoll();

    // Check jail condition
    if (currentPlayer.isJailed) {
      if (isDouble) {
        updateAndBroadcastGameState((prev) => {
          const updated = JSON.parse(JSON.stringify(prev)) as GameState;
          const p = updated.players[updated.currentTurnIndex];
          if (p) {
            p.isJailed = false;
            p.jailTurns = 0;
          }
          updated.dice = dice;
          updated.diceRolled = true;
          addLog(updated, `🎉 ${p?.name || currentPlayer.name} çift zar atarak (${dice[0]}-${dice[1]}) kodesten ücretsiz çıktı!`, 'success');
          return updated;
        });
      } else {
        updateAndBroadcastGameState((prev) => {
          const updated = JSON.parse(JSON.stringify(prev)) as GameState;
          const p = updated.players[updated.currentTurnIndex];
          if (p) {
            p.jailTurns += 1;
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
          }
          updated.dice = dice;
          updated.diceRolled = true;
          return updated;
        });
        return;
      }
    }

    // Doubles streak 3rd time check -> Straight to Jail (Kodes)
    if (isDouble && !currentPlayer.isJailed) {
      const nextDoubles = (liveState.doublesCount || 0) + 1;
      if (nextDoubles >= 3) {
        soundManager.playJail();
        updateAndBroadcastGameState((prev) => {
          const updated = JSON.parse(JSON.stringify(prev)) as GameState;
          const p = updated.players[updated.currentTurnIndex];
          if (p) {
            p.position = JAIL_TILE_INDEX;
            p.isJailed = true;
            p.jailTurns = 0;
          }
          updated.doublesCount = 0;
          updated.dice = dice;
          updated.diceRolled = true;
          addLog(updated, `🚨 3 kez üst üste çift atan (${dice[0]}-${dice[1]}) ${p?.name || currentPlayer.name} doğrudan Kodese gönderildi!`, 'danger');
          updated.pendingAction = 'NONE';
          return updated;
        });
        return;
      }
    }

    // Start Step-by-Step Movement: broadcast 1 lightweight DICE_ROLLED event and animate locally
    const startPos = currentPlayer.position;
    const targetPos = (startPos + diceTotal) % 38;
    const passedGo = targetPos < startPos;
    const nextStreak = isDouble ? (liveState.doublesCount || 0) + 1 : 0;

    // 1. Broadcast instant lightweight DICE_ROLLED event to all peers (Guest, Spectators)
    syncManager.sendDiceRolled(
      liveState.roomId || '',
      currentPlayer.id,
      dice,
      diceTotal,
      isDouble,
      nextStreak,
      startPos,
      targetPos,
      passedGo
    );

    // 2. Set local dice state on Host
    setGameState((prev) => {
      const updated = JSON.parse(JSON.stringify(prev)) as GameState;
      updated.dice = dice;
      updated.diceRolled = true;
      if (isDouble) {
        updated.doublesCount = nextStreak;
        addLog(updated, `🎲 ${currentPlayer.name} çift attı: 🎲 ${dice[0]} - ${dice[1]}! İlerledikten sonra bir kez daha zar atacak! (${nextStreak}/3)`, 'success');
      } else {
        updated.doublesCount = 0;
        addLog(updated, `${currentPlayer.name} zar attı: 🎲 ${dice[0]} - ${dice[1]} (Toplam: ${diceTotal})`, 'action');
      }
      return updated;
    });

    // 3. Run smooth local step animation on Host
    runLocalStepAnimation(currentPlayer.id, diceTotal, () => {
      updateAndBroadcastGameState((prev) => {
        const landingState = finalizePlayerLanding(prev, currentPlayer.id);
        landingState.turnStartedAt = Date.now(); // Fresh 60s timer for property decision
        return landingState;
      });
    });
  };

  // End Turn Action
  const handleEndTurnAction = () => {
    const liveState = gameStateRef.current;
    const liveMyId = myPlayerIdRef.current;
    const isMeHost = isPlayerHost(liveState, liveMyId);
    if (!isMeHost) {
      const myPlayer = liveState.players.find((p) => p.id === liveMyId);
      if (!myPlayer || !myPlayer.inGame) return;
      if (liveState.roomId && liveMyId) {
        syncManager.sendGameAction(liveState.roomId, liveMyId, 'END_TURN');
      }
      return;
    }
    updateAndBroadcastGameState((prev) => nextTurn(prev));
  };

  // Declare Bankruptcy Action
  const handleDeclareBankruptcyAction = (playerId?: string) => {
    const liveState = gameStateRef.current;
    const liveMyId = myPlayerIdRef.current;
    const isMeHost = isPlayerHost(liveState, liveMyId);
    const targetId = playerId || liveState.players[liveState.currentTurnIndex]?.id || liveMyId;
    if (!targetId) return;

    if (!isMeHost) {
      const myPlayer = liveState.players.find((p) => p.id === liveMyId);
      if (!myPlayer || !myPlayer.inGame) return;
      if (liveState.roomId && liveMyId) {
        syncManager.sendGameAction(liveState.roomId, liveMyId, 'BANKRUPTCY', { playerId: targetId });
      }
      return;
    }
    soundManager.playJail();
    updateAndBroadcastGameState((prev) => declareBankruptcy(prev, targetId));
  };

  // Buy Property Action
  const handleBuyPropertyAction = (actingPlayerId?: string) => {
    const liveState = gameStateRef.current;
    const liveMyId = myPlayerIdRef.current;
    const isMeHost = isPlayerHost(liveState, liveMyId);
    const activeActorId = actingPlayerId || liveState.players[liveState.currentTurnIndex]?.id || liveMyId || undefined;

    if (!isMeHost) {
      const myPlayer = liveState.players.find((p) => p.id === liveMyId);
      if (!myPlayer || !myPlayer.inGame) return;
      if (liveState.roomId && liveMyId) {
        syncManager.sendGameAction(liveState.roomId, liveMyId, 'BUY_PROPERTY');
      }
      return;
    }
    soundManager.playBuyProperty();
    updateAndBroadcastGameState((prev) => buyProperty(prev, activeActorId));
  };

  // Pass Property Action (Skip buying)
  const handlePassPropertyAction = (actingPlayerId?: string) => {
    const liveState = gameStateRef.current;
    const liveMyId = myPlayerIdRef.current;
    const isMeHost = isPlayerHost(liveState, liveMyId);
    const activeActorId = actingPlayerId || liveState.players[liveState.currentTurnIndex]?.id || liveMyId || undefined;

    if (!isMeHost) {
      const myPlayer = liveState.players.find((p) => p.id === liveMyId);
      if (!myPlayer || !myPlayer.inGame) return;
      if (liveState.roomId && liveMyId) {
        syncManager.sendGameAction(liveState.roomId, liveMyId, 'PASS_PROPERTY');
      }
      return;
    }
    updateAndBroadcastGameState((prev) => passProperty(prev, activeActorId));
  };

  // Sell Property to Bank for 2/3 price
  const handleSellToBankAction = (tileId: number, actingPlayerId?: string) => {
    const liveState = gameStateRef.current;
    const liveMyId = myPlayerIdRef.current;
    const isMeHost = isPlayerHost(liveState, liveMyId);
    const actorId = actingPlayerId || liveMyId || undefined;
    if (!isMeHost) {
      const myPlayer = liveState.players.find((p) => p.id === liveMyId);
      if (!myPlayer || !myPlayer.inGame) return;
      if (liveState.roomId && liveMyId) {
        syncManager.sendGameAction(liveState.roomId, liveMyId, 'SELL_TO_BANK', { tileId });
      }
      return;
    }
    updateAndBroadcastGameState((prev) => sellPropertyToBank(prev, tileId, actorId));
  };

  // Pay 100 Bail to leave Kodes (Jail)
  const handlePayJailBailAction = () => {
    const liveState = gameStateRef.current;
    const liveMyId = myPlayerIdRef.current;
    const isMeHost = isPlayerHost(liveState, liveMyId);
    if (!isMeHost) {
      const myPlayer = liveState.players.find((p) => p.id === liveMyId);
      if (!myPlayer || !myPlayer.inGame) return;
      if (liveState.roomId && liveMyId) {
        syncManager.sendGameAction(liveState.roomId, liveMyId, 'PAY_JAIL');
      }
      return;
    }
    soundManager.playBuyProperty();
    updateAndBroadcastGameState((prev) => payJailBail(prev));
  };

  // Build House Action
  const handleBuildHouseAction = (tileId: number, actingPlayerId?: string) => {
    const liveState = gameStateRef.current;
    const liveMyId = myPlayerIdRef.current;
    const isMeHost = isPlayerHost(liveState, liveMyId);
    const actorId = actingPlayerId || liveMyId || undefined;
    if (!isMeHost) {
      const myPlayer = liveState.players.find((p) => p.id === liveMyId);
      if (!myPlayer || !myPlayer.inGame) return;
      if (liveState.roomId && liveMyId) {
        syncManager.sendGameAction(liveState.roomId, liveMyId, 'BUILD_HOUSE', { tileId });
      }
      return;
    }
    soundManager.playBuyProperty();
    updateAndBroadcastGameState((prev) => {
      const next = buildHouse(prev, tileId, actorId);
      if (selectedTile && selectedTile.id === tileId) {
        const updatedTile = next.board.find((t) => t.id === tileId);
        if (updatedTile) setSelectedTile(updatedTile);
      }
      return next;
    });
  };

  // Sell House Action
  const handleSellHouseAction = (tileId: number, actingPlayerId?: string) => {
    const liveState = gameStateRef.current;
    const liveMyId = myPlayerIdRef.current;
    const isMeHost = isPlayerHost(liveState, liveMyId);
    const actorId = actingPlayerId || liveMyId || undefined;
    if (!isMeHost) {
      const myPlayer = liveState.players.find((p) => p.id === liveMyId);
      if (!myPlayer || !myPlayer.inGame) return;
      if (liveState.roomId && liveMyId) {
        syncManager.sendGameAction(liveState.roomId, liveMyId, 'SELL_HOUSE', { tileId });
      }
      return;
    }
    updateAndBroadcastGameState((prev) => {
      const next = sellHouse(prev, tileId, actorId);
      if (selectedTile && selectedTile.id === tileId) {
        const updatedTile = next.board.find((t) => t.id === tileId);
        if (updatedTile) setSelectedTile(updatedTile);
      }
      return next;
    });
  };

  // Toggle Mortgage Action
  const handleToggleMortgageAction = (tileId: number, actingPlayerId?: string) => {
    const liveState = gameStateRef.current;
    const liveMyId = myPlayerIdRef.current;
    const isMeHost = isPlayerHost(liveState, liveMyId);
    const actorId = actingPlayerId || liveMyId || undefined;
    if (!isMeHost) {
      const myPlayer = liveState.players.find((p) => p.id === liveMyId);
      if (!myPlayer || !myPlayer.inGame) return;
      if (liveState.roomId && liveMyId) {
        syncManager.sendGameAction(liveState.roomId, liveMyId, 'MORTGAGE', { tileId });
      }
      return;
    }
    updateAndBroadcastGameState((prev) => {
      const next = toggleMortgage(prev, tileId, actorId);
      if (selectedTile && selectedTile.id === tileId) {
        const updatedTile = next.board.find((t) => t.id === tileId);
        if (updatedTile) setSelectedTile(updatedTile);
      }
      return next;
    });
  };

  // Apply Chance Card
  const handleConfirmChanceCard = () => {
    const liveState = gameStateRef.current;
    const liveMyId = myPlayerIdRef.current;
    const isMeHost = isPlayerHost(liveState, liveMyId);
    if (!isMeHost) {
      const myPlayer = liveState.players.find((p) => p.id === liveMyId);
      if (!myPlayer || !myPlayer.inGame) return;
      if (liveState.roomId && liveMyId) {
        syncManager.sendGameAction(liveState.roomId, liveMyId, 'CONFIRM_CHANCE');
      }
      return;
    }
    updateAndBroadcastGameState((prev) => applyChanceCard(prev));
  };

  // Trade Offer Action (Human-to-Bot or Human-to-Human)
  const handleExecuteTradeAction = (offer: TradeOffer) => {
    const liveState = gameStateRef.current;
    const liveMyId = myPlayerIdRef.current;
    const isMeHost = isPlayerHost(liveState, liveMyId);
    if (!isMeHost) {
      const myPlayer = liveState.players.find((p) => p.id === liveMyId);
      if (!myPlayer || !myPlayer.inGame) return;
      if (liveState.roomId && liveMyId) {
        syncManager.sendGameAction(liveState.roomId, liveMyId, 'TRADE_OFFER', offer);
      }
      return;
    }

    const targetPlayer = liveState.players.find((p) => p.id === offer.toPlayerId);
    const senderPlayer = liveState.players.find((p) => p.id === offer.fromPlayerId);
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
    const liveState = gameStateRef.current;
    const liveMyId = myPlayerIdRef.current;
    const isMeHost = isPlayerHost(liveState, liveMyId);
    if (!isMeHost) {
      const myPlayer = liveState.players.find((p) => p.id === liveMyId);
      if (!myPlayer || !myPlayer.inGame) return;
      if (liveState.roomId && liveMyId) {
        syncManager.sendGameAction(liveState.roomId, liveMyId, 'ACCEPT_TRADE');
      }
      return;
    }
    if (!liveState.incomingTradeOffer) return;
    updateAndBroadcastGameState((prev) => {
      if (!prev.incomingTradeOffer) return prev;
      return executeTrade(prev, prev.incomingTradeOffer);
    });
  };

  // Handle Decline Incoming Trade from Bot or Human Player
  const handleDeclineIncomingTrade = () => {
    const liveState = gameStateRef.current;
    const liveMyId = myPlayerIdRef.current;
    const isMeHost = isPlayerHost(liveState, liveMyId);
    if (!isMeHost) {
      const myPlayer = liveState.players.find((p) => p.id === liveMyId);
      if (!myPlayer || !myPlayer.inGame) return;
      if (liveState.roomId && liveMyId) {
        syncManager.sendGameAction(liveState.roomId, liveMyId, 'DECLINE_TRADE');
      }
      return;
    }
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

  // Handle Counter-Offer: opens trade modal directly pre-targeted to the proposing player
  const handleCounterOfferIncomingTrade = () => {
    if (gameState.incomingTradeOffer) {
      const targetTileId = gameState.incomingTradeOffer.requestedTileIds[0];
      const targetTile = gameState.board.find((t) => t.id === targetTileId);
      const proposingPlayerId = gameState.incomingTradeOffer.fromPlayerId;
      setTradeTargetPlayerId(proposingPlayerId);
      setTradeSelectedTile(targetTile);
      updateAndBroadcastGameState((prev) => ({ ...prev, incomingTradeOffer: undefined }));
      setIsTradeModalOpen(true);
    }
  };

  // Send Chat Message
  const handleSendMessageAction = (text: string, senderPlayerId?: string) => {
    const liveState = gameStateRef.current;
    const liveMyId = myPlayerIdRef.current;
    const isMeHost = isPlayerHost(liveState, liveMyId);
    const activeSenderId = senderPlayerId || liveMyId;
    if (!isMeHost && !senderPlayerId) {
      if (liveState.roomId && liveMyId) {
        syncManager.sendGameAction(liveState.roomId, liveMyId, 'CHAT_MESSAGE', { text });
      }
      return;
    }
    const mePlayer = liveState.players.find((p) => p.id === activeSenderId);
    if (!mePlayer) return;
    updateAndBroadcastGameState((prev) => addChatMessage(prev, mePlayer, text));
  };

  // Restart Game
  const handleRestart = () => {
    terminateGameSession('RESTART', true);
  };

  const me = myPlayerId ? gameState.players.find((p) => p.id === myPlayerId) : undefined;

  return (
    <div className={`w-full max-w-full bg-[#050811] text-white font-['Fredoka',sans-serif] flex flex-col select-none ${
      gameState.phase === 'LOBBY'
        ? 'min-h-[100dvh] overflow-y-auto overflow-x-hidden'
        : 'h-[100dvh] overflow-hidden'
    }`}>
      {gameState.phase === 'LOBBY' ? (
        <Lobby
          players={gameState.players}
          myPlayerId={myPlayerId}
          hostPlayerId={gameState.hostPlayerId}
          settings={gameState.settings}
          userAccount={userAccount}
          onGoogleLogin={handleGoogleLogin}
          onGuestLogin={handleGuestLogin}
          onLogout={handleLogout}
          onUpdateUserAccount={setUserAccount}
          onUpdateSettings={handleUpdateSettings}
          onJoin={handleJoin}
          onJoinRoom={handleJoinFriendRoom}
          onAddBot={handleAddBot}
          onRemovePlayer={handleRemovePlayer}
          onStartGame={handleStartGame}
          onLeaveLobby={handleLeaveLobby}
        />
      ) : (
        <>
          {/* Top Navbar Header during Game */}
          <header className="game-header w-full min-h-[calc(2.75rem+env(safe-area-inset-top,0px))] pt-[env(safe-area-inset-top,0px)] px-2 sm:px-4 flex items-center justify-between shrink-0 bg-[#070c18] border-b border-amber-500/30 z-50 shadow-md">
            <div className="flex items-center gap-1 sm:gap-2 min-w-0">
              <DiceLogo size="sm" />
              <span className="text-[9px] sm:text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 sm:px-2 py-0.5 rounded-full border border-emerald-500/30 font-bold flex items-center gap-1 shrink-0">
                <Wifi className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-emerald-400" />
                <span className="hidden xs:inline">{t('liveBadge')}</span>
              </span>
              <span className="text-[9px] sm:text-[10px] text-slate-400 font-mono bg-slate-800/80 px-1.5 sm:px-2 py-0.5 rounded-full border border-slate-700 hidden sm:inline-block">
                {t('roomCodeDisplay', { code: gameState.roomId || gameState.settings?.roomCode || '' })}
              </span>
            </div>

            <div className="flex items-center gap-1 sm:gap-2">
              {/* User Balance Display (Visible on Mobile & Desktop) */}
              {me && (
                <div className="flex items-center gap-1 bg-amber-500/15 border border-amber-500/30 px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded-lg sm:rounded-xl text-[10.5px] sm:text-xs font-black text-amber-300 shrink-0 shadow-sm">
                  <Coins className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-400 shrink-0" />
                  <span>{formatMoney(me.money)}</span>
                </div>
              )}

              {userAccount ? (
                <button
                  onClick={() => {
                    setProfileInitialTab(pendingRequestsCount > 0 ? 'requests' : 'stats');
                    setIsProfileModalOpen(true);
                  }}
                  className={`flex items-center gap-1 sm:gap-1.5 bg-slate-800/90 hover:bg-slate-700/90 border rounded-lg sm:rounded-xl px-1.5 sm:px-3 py-0.5 sm:py-1 text-[10.5px] sm:text-xs transition cursor-pointer group shrink-0 active:scale-95 relative ${
                    pendingRequestsCount > 0
                      ? 'border-amber-400 text-amber-300 ring-1 ring-amber-400/50'
                      : 'border-amber-500/40 text-white'
                  }`}
                  title={pendingRequestsCount > 0 ? t('newFriendRequestsAlert', { count: pendingRequestsCount }) : t('profileAndStats')}
                >
                  {userAccount.photoURL ? (
                    <img src={userAccount.photoURL} alt="" className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full object-cover shrink-0" />
                  ) : (
                    <span className="text-amber-400 font-bold shrink-0 text-xs">👤</span>
                  )}
                  <span className="font-bold group-hover:text-amber-300 transition hidden md:inline truncate max-w-[80px]">
                    {userAccount.displayName}
                  </span>
                  {pendingRequestsCount > 0 ? (
                    <span className="text-[9px] sm:text-[10px] bg-rose-500 text-white px-1.5 py-0.2 rounded font-black animate-bounce shadow">
                      📩 {pendingRequestsCount}
                    </span>
                  ) : (
                    <span className="text-[9px] sm:text-[10px] bg-amber-500/20 text-amber-300 px-1 py-0.2 rounded font-black border border-amber-500/30 shrink-0">
                      🏆 {userAccount.stats?.gamesWon || 0}
                    </span>
                  )}
                </button>
              ) : (
                <button
                  onClick={handleGoogleLogin}
                  className="flex items-center gap-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg sm:rounded-xl px-1.5 sm:px-2.5 py-0.5 sm:py-1 text-[10.5px] sm:text-xs font-black text-slate-800 transition cursor-pointer shadow shrink-0 active:scale-95"
                  title={t('googleLogin')}
                >
                  <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                  <span className="hidden xs:inline">{t('loginBtn')}</span>
                </button>
              )}

              {/* In-Game Language Selector */}
              <LanguageSwitcher />

              <button
                onClick={() => soundManager.toggle()}
                className={`flex items-center gap-1 p-1 sm:px-2.5 sm:py-1 rounded-lg sm:rounded-xl border transition cursor-pointer shrink-0 shadow ${
                  soundEnabled
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25'
                    : 'bg-slate-850 border-slate-750 text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
                title={soundEnabled ? t('soundOff') : t('soundOn')}
              >
                {soundEnabled ? (
                  <Volume2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400 shrink-0" />
                ) : (
                  <VolumeX className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400 shrink-0" />
                )}
                <span className="text-[11px] font-bold hidden md:inline">
                  {soundEnabled ? t('soundOn') : t('soundOff')}
                </span>
              </button>

              <button
                onClick={handleRestart}
                className="flex items-center gap-1 text-[10.5px] sm:text-xs font-bold bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded-lg sm:rounded-xl border border-rose-500/30 transition cursor-pointer active:scale-95 shrink-0"
                title={t('restartTooltip')}
              >
                <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">{t('restartGame')}</span>
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
                isMoving={isMoving}
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
                onDeclareBankruptcy={() => handleDeclareBankruptcyAction(me?.id)}
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
          <div className="md:hidden shrink-0 min-h-[calc(3.25rem+env(safe-area-inset-bottom,0px))] pb-[env(safe-area-inset-bottom,0px)] bg-[#070c18] border-t border-slate-800 px-3 flex items-center justify-around z-40 shadow-md">
            <button
              onClick={() => setMobileSheet(mobileSheet === 'players' ? null : 'players')}
              className={`flex flex-col items-center justify-center gap-0.5 text-[10px] font-bold py-1 px-3 rounded-xl transition cursor-pointer ${
                mobileSheet === 'players' ? 'text-amber-400 bg-amber-500/20' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>{t('mobilePlayersTab', { count: gameState.players.length })}</span>
            </button>

            <button
              onClick={openMobileChat}
              className={`flex flex-col items-center justify-center gap-0.5 text-[10px] font-bold py-1 px-3 rounded-xl transition cursor-pointer relative ${
                mobileSheet === 'chat' ? 'text-amber-400 bg-amber-500/20' : 'text-slate-400 hover:text-white'
              }`}
            >
              <MessageSquare className="w-4 h-4" />
              <span>{t('mobileChatTab')}</span>
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
              <span>{t('mobileLogsTab')}</span>
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
                {mobileSheet === 'players' && <><Users className="w-4 h-4" /> {t('mobilePlayerStatus')}</>}
                {mobileSheet === 'chat' && <><MessageSquare className="w-4 h-4" /> {t('mobileGameChat')}</>}
                {mobileSheet === 'logs' && <><ScrollText className="w-4 h-4" /> {t('mobileLogsAlerts')}</>}
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
          onStartTrade={(tile) => {
            setTradeSelectedTile(tile);
            if (tile.ownerId && tile.ownerId !== me.id) {
              setTradeTargetPlayerId(tile.ownerId);
            }
            setSelectedTile(null);
            setIsTradeModalOpen(true);
          }}
          canBuy={gameState.pendingAction === 'BUY_PROPERTY' && me.id === gameState.players[gameState.currentTurnIndex]?.id && me.position === selectedTile.id}
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
          initialTargetPlayerId={tradeTargetPlayerId}
          onClose={() => {
            setIsTradeModalOpen(false);
            setTradeSelectedTile(undefined);
            setTradeTargetPlayerId(undefined);
          }}
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

      {/* Global Profile & Friends Modal */}
      {isProfileModalOpen && userAccount && (
        <ProfileModal
          userAccount={userAccount}
          onClose={() => setIsProfileModalOpen(false)}
          onLogout={handleLogout}
          onUpdateUserAccount={setUserAccount}
          onGoogleLogin={handleGoogleLogin}
          onJoinRoom={handleJoinFriendRoom}
          roomId={gameState.roomId || gameState.settings?.roomCode || 'TR-1001'}
          initialTab={profileInitialTab}
        />
      )}

    </div>
  );
};
