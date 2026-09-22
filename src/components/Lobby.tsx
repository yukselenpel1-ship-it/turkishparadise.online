import React, { useState, useEffect } from 'react';
import { Player, GameSettings, BotDifficulty, UserAccount } from '../types/game';
import { PLAYER_AVATARS, PLAYER_COLORS, FALLBACK_PLAYER_AVATARS, FALLBACK_PLAYER_COLORS } from '../engine/gameEngine';
import { soundManager } from '../services/soundEffects';
import { ProfileModal, ProfileTab } from './ProfileModal';
import { subscribeToFriendRequests } from '../services/friendService';
import { DiceLogo } from './DiceLogo';
import { useLanguage, LanguageSwitcher } from '../i18n/LanguageContext';
import { PublicRoomsList } from './PublicRoomsList';
import { subscribeToPublicRooms, publishPublicRoom, unpublishPublicRoom } from '../services/publicRoomsService';
import {
  User,
  Gamepad2,
  Users,
  Play,
  TrendingUp,
  Volume2,
  VolumeX,
  Sun,
  Handshake,
  Shield,
  HelpCircle,
  X,
  ArrowLeft,
  KeyRound,
  RefreshCw,
  LogOut,
  Sparkles,
  Globe,
  Copy,
  Check,
  Share2,
  Sliders,
  Coins,
  Palette,
  Trophy,
  Loader2,
  Trash2,
  UserMinus,
  Mail,
  Send,
  MessageSquare,
  AlertCircle
} from 'lucide-react';

interface LobbyProps {
  players: Player[];
  myPlayerId: string | null;
  hostPlayerId?: string;
  settings: GameSettings;
  userAccount: UserAccount | null;
  onGoogleLogin: () => Promise<void>;
  onGuestLogin: (customName?: string) => Promise<void>;
  onLogout: () => void;
  onUpdateUserAccount?: (account: UserAccount) => void;
  onUpdateSettings: (newSettings: GameSettings) => void;
  onJoin: (name: string, avatar: string, color: string, isOnline?: boolean, targetRoomCode?: string, isCreating?: boolean, isSpectator?: boolean) => void;
  onJoinRoom?: (roomId: string) => void;
  onAddBot: (difficulty?: BotDifficulty) => void;
  onRemovePlayer?: (playerId: string) => void;
  onStartGame: () => void;
  onLeaveLobby?: () => void;
}

export const Lobby: React.FC<LobbyProps> = ({
  players,
  myPlayerId,
  hostPlayerId,
  settings,
  userAccount,
  onGoogleLogin,
  onGuestLogin,
  onLogout,
  onUpdateUserAccount,
  onUpdateSettings,
  onJoin,
  onJoinRoom,
  onAddBot,
  onRemovePlayer,
  onStartGame,
  onLeaveLobby,
}) => {
  const { language, t, formatMoney } = useLanguage();
  const [mode, setMode] = useState<'main' | 'rooms' | 'friend'>(() => {
    try {
      if (typeof window !== 'undefined') {
        const savedMode = sessionStorage.getItem('tp_lobby_mode') as 'main' | 'rooms' | 'friend' | null;
        if (savedMode && ['main', 'rooms', 'friend'].includes(savedMode)) {
          return savedMode;
        }
      }
    } catch (e) {}
    return 'main';
  });
  const [name, setName] = useState('');
  const [roomCode, setRoomCode] = useState(settings.roomCode || 'TR-1001');
  const [selectedAvatar, setSelectedAvatar] = useState(PLAYER_AVATARS[0]);
  const [selectedColor, setSelectedColor] = useState(PLAYER_COLORS[0]);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => soundManager.isEnabled());
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [activeModal, setActiveModal] = useState<'rules' | 'features' | 'community' | 'contact' | null>(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [profileInitialTab, setProfileInitialTab] = useState<ProfileTab>('stats');
  const [pendingRequestsCount, setPendingRequestsCount] = useState<number>(0);
  const [isLoadingAuth, setIsLoadingAuth] = useState(false);
  const [isInviteLink, setIsInviteLink] = useState(false);
  const [liveRoomsCount, setLiveRoomsCount] = useState<number>(0);
  const [isRoomPublished, setIsRoomPublished] = useState<boolean>(false);

  // Persist current lobby mode in sessionStorage across F5 reloads
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('tp_lobby_mode', mode);
      }
    } catch (e) {}
  }, [mode]);

  // Subscribe to live public rooms list for badge count
  useEffect(() => {
    const unsubscribe = subscribeToPublicRooms((activeRooms) => {
      setLiveRoomsCount(activeRooms.length);
    });
    return () => unsubscribe();
  }, []);

  const isPublicRoom = Boolean(settings.isPublic);

  // Auto-fill player name with random default or logged in user displayName
  useEffect(() => {
    if (!name) {
      if (userAccount?.displayName) {
        setName(userAccount.displayName);
      } else {
        const randomDigits = Math.floor(100 + Math.random() * 900);
        setName(`Oyuncu_${randomDigits}`);
      }
    }
  }, [userAccount]);

  // Sync isRoomPublished status from settings
  useEffect(() => {
    if (typeof settings.isPublic === 'boolean') {
      setIsRoomPublished(settings.isPublic);
    }
  }, [settings.isPublic]);

  const handleTogglePublishPublicRoom = () => {
    const nextPublic = !isPublicRoom;
    onUpdateSettings({ ...settings, isPublic: nextPublic });
    const hostPlayer = players.find((p) => p.isHost) || players[0];
    const roomInfo = {
      roomId: settings.roomCode || roomCode,
      hostName: hostPlayer?.name || userAccount?.displayName || 'Kurucu',
      hostAvatar: hostPlayer?.avatar || '👑',
      playerCount: players.length,
      maxPlayers: 6,
      botCount: players.filter((p) => p.isBot).length,
      phase: 'LOBBY' as const,
      startingMoney: settings.startingMoney || 1500,
      isPublic: nextPublic,
      updatedAt: Date.now(),
    };
    if (nextPublic) {
      publishPublicRoom(roomInfo);
      setIsRoomPublished(true);
      setTimeout(() => setIsRoomPublished(false), 4000);
    } else {
      unpublishPublicRoom(settings.roomCode || roomCode);
      setIsRoomPublished(false);
    }
  };

  // Subscribe to real-time incoming friend requests for header badge
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

  // Sync sound settings with soundManager
  useEffect(() => {
    return soundManager.subscribe((enabled) => {
      setSoundEnabled(enabled);
    });
  }, []);

  // Check URL query parameters for explicit invite link: ?invite=TR-XXXX or ?oda=TR-XXXX or ?code=TR-XXXX
  useEffect(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const urlInvite = urlParams.get('invite') || urlParams.get('oda') || urlParams.get('code');
      const urlRoom = urlParams.get('room');

      if (urlInvite && urlInvite.trim()) {
        const cleanCode = urlInvite.trim().toUpperCase();
        setRoomCode(cleanCode);
        setIsInviteLink(true);
        setMode('friend');
      } else if (urlRoom && urlRoom.trim()) {
        const cleanCode = urlRoom.trim().toUpperCase();
        setRoomCode(cleanCode);
        setIsInviteLink(true);
        setMode('friend');
      }
    } catch (e) {}
  }, []);

  // Sync roomCode if host settings change
  useEffect(() => {
    if (settings.roomCode && !isInviteLink) {
      setRoomCode(settings.roomCode);
    }
  }, [settings.roomCode, isInviteLink]);

  // Sync userAccount name with input when logged in
  useEffect(() => {
    if (userAccount?.displayName) {
      setName(userAccount.displayName);
    }
  }, [userAccount]);

  const hasJoined = Boolean(myPlayerId && players.some((p) => p.id === myPlayerId));
  const me = hasJoined ? players.find((p) => p.id === myPlayerId) : undefined;
  const isHost = Boolean(myPlayerId && (hostPlayerId ? hostPlayerId === myPlayerId : me?.isHost));
  const [isRoomInactive, setIsRoomInactive] = useState(false);

  // Monitor room connectivity for joiners: if host never responds within 5.5s, show inactive alert
  useEffect(() => {
    if (!hasJoined || isHost) {
      setIsRoomInactive(false);
      return;
    }

    const hasOtherPlayers = players.some((p) => p.id !== myPlayerId);
    if (hasOtherPlayers) {
      setIsRoomInactive(false);
      return;
    }

    const timer = setTimeout(() => {
      if (players.length <= 1) {
        setIsRoomInactive(true);
      }
    }, 18000);

    return () => clearTimeout(timer);
  }, [hasJoined, isHost, players, myPlayerId]);

  // Taken colors and avatars by other players/bots in the room (only when inside an active joined room)
  const takenColors = hasJoined ? players.filter((p) => p.id !== myPlayerId).map((p) => p.color) : [];
  const takenAvatars = hasJoined ? players.filter((p) => p.id !== myPlayerId).map((p) => p.avatar) : [];

  // Auto-switch selectedColor if taken by another player/bot in room
  useEffect(() => {
    if (!hasJoined) return;
    const freeColors = PLAYER_COLORS.filter((c) => !takenColors.includes(c));
    if (freeColors.length > 0 && takenColors.includes(selectedColor)) {
      setSelectedColor(freeColors[0]);
    }
  }, [hasJoined, takenColors, selectedColor]);

  // Auto-switch selectedAvatar if taken by another player/bot in room
  useEffect(() => {
    if (!hasJoined) return;
    const freeAvatars = PLAYER_AVATARS.filter((a) => !takenAvatars.includes(a));
    if (freeAvatars.length > 0 && takenAvatars.includes(selectedAvatar)) {
      setSelectedAvatar(freeAvatars[0]);
    }
  }, [hasJoined, takenAvatars, selectedAvatar]);

  const handleGoogleClick = async () => {
    try {
      setIsLoadingAuth(true);
      await onGoogleLogin();
    } catch (err) {
      console.error(err);
      setIsLoadingAuth(false);
    }
  };

  const handleMainSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalName = name.trim() || userAccount?.displayName || `Oyuncu_${Math.floor(100 + Math.random() * 900)}`;
    onJoin(finalName, selectedAvatar, selectedColor, true, roomCode, true);
  };

  const handleFriendSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalName = name.trim() || userAccount?.displayName || `Oyuncu_${Math.floor(100 + Math.random() * 900)}`;
    setMode('main');
    onJoin(finalName, selectedAvatar, selectedColor, true, roomCode.trim().toUpperCase(), false);
  };

  const copyRoomCode = () => {
    navigator.clipboard.writeText(settings.roomCode || roomCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const copyInviteLink = () => {
    const inviteUrl = `${window.location.origin}?room=${settings.roomCode || roomCode}`;
    navigator.clipboard.writeText(inviteUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div className="min-h-[100dvh] w-full bg-[#050811] text-white flex flex-col justify-between relative select-none font-['Plus_Jakarta_Sans',sans-serif]">
      
      {/* Background Hero Atmosphere Image with Istanbul / Bosphorus Mood */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <img
          src="/hero-bg.jpg"
          alt="Turkish Paradise Istanbul Skyline"
          className="w-full h-full object-cover object-center filter brightness-90 contrast-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#050811] via-[#050811]/40 to-[#050811]/70" />
      </div>

      {/* 1. Top Navbar Header */}
      <header className="w-full max-w-7xl mx-auto px-3 sm:px-8 pt-[max(calc(0.75rem+env(safe-area-inset-top,0px)),1rem)] pb-2.5 sm:py-5 flex items-center justify-between relative z-50">
        
        {/* Interactive 3D Brand Logo: TURKISH PARADISE */}
        <DiceLogo size="md" />

        {/* Center Nav Links */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-semibold text-slate-300">
          <button
            onClick={() => setActiveModal(null)}
            className={`${activeModal === null ? 'text-amber-400 font-bold border-b-2 border-amber-400' : 'hover:text-white'} pb-1 cursor-pointer transition`}
          >
            {t('home')}
          </button>
          <button
            onClick={() => setActiveModal('rules')}
            className={`${activeModal === 'rules' ? 'text-amber-400 font-bold border-b-2 border-amber-400' : 'hover:text-white'} pb-1 cursor-pointer transition`}
          >
            {t('howToPlay')}
          </button>
          <button
            onClick={() => setActiveModal('features')}
            className={`${activeModal === 'features' ? 'text-amber-400 font-bold border-b-2 border-amber-400' : 'hover:text-white'} pb-1 cursor-pointer transition`}
          >
            {t('features')}
          </button>
          <button
            onClick={() => setActiveModal('community')}
            className={`${activeModal === 'community' ? 'text-amber-400 font-bold border-b-2 border-amber-400' : 'hover:text-white'} pb-1 cursor-pointer transition`}
          >
            {t('community')}
          </button>
          <button
            onClick={() => setActiveModal('contact')}
            className={`${activeModal === 'contact' ? 'text-amber-400 font-bold border-b-2 border-amber-400' : 'hover:text-amber-300 text-amber-400/90'} pb-1 cursor-pointer transition flex items-center gap-1.5`}
          >
            <Mail className="w-3.5 h-3.5 text-amber-400" />
            {t('contact')}
          </button>
        </nav>

        {/* Right User Profile / Settings */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          {userAccount ? (
            <>
              {/* Friends & Special ID Quick Button */}
              <button
                onClick={() => {
                  setProfileInitialTab(pendingRequestsCount > 0 ? 'requests' : 'friends');
                  setIsProfileModalOpen(true);
                }}
                className={`flex items-center gap-1.5 bg-slate-900/90 hover:bg-slate-800/90 border rounded-xl sm:rounded-2xl py-1 px-2 sm:py-1.5 sm:px-3 transition cursor-pointer shrink-0 shadow text-xs font-black relative ${
                  pendingRequestsCount > 0
                    ? 'border-amber-400 text-amber-300 ring-1 ring-amber-400/50'
                    : 'border-amber-500/30 hover:border-amber-400 text-amber-300 hover:text-white'
                }`}
                title={pendingRequestsCount > 0 ? t('newFriendRequestsAlert', { count: pendingRequestsCount }) : t('tabFriends')}
              >
                <Users className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden sm:inline">{t('tabFriends')}</span>
                {pendingRequestsCount > 0 ? (
                  <span className="bg-rose-500 text-white text-[10px] font-black px-1.5 py-0.2 rounded-full leading-none animate-bounce shadow">
                    {pendingRequestsCount}
                  </span>
                ) : userAccount.friends && userAccount.friends.length > 0 ? (
                  <span className="bg-amber-500 text-slate-950 text-[10px] font-black px-1.5 py-0.2 rounded-full leading-none">
                    {userAccount.friends.length}
                  </span>
                ) : null}
              </button>

              {/* Profile Card Button */}
              <button
                onClick={() => {
                  setProfileInitialTab('stats');
                  setIsProfileModalOpen(true);
                }}
                className="flex items-center gap-1.5 sm:gap-2.5 bg-slate-900/90 hover:bg-slate-800/90 border border-amber-500/30 hover:border-amber-400 rounded-xl sm:rounded-2xl p-1 sm:py-1.5 sm:px-3.5 shadow-lg transition cursor-pointer group shrink-0"
                title={t('profileAndStats')}
              >
                {userAccount.photoURL ? (
                  <img
                    src={userAccount.photoURL}
                    alt={userAccount.displayName}
                    className="w-6 h-6 sm:w-7 sm:h-7 rounded-full border border-amber-400 object-cover shrink-0"
                  />
                ) : (
                  <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-amber-500/20 text-amber-400 font-black text-[11px] sm:text-xs flex items-center justify-center border border-amber-500/40 shrink-0">
                    {userAccount.displayName.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="text-left hidden sm:block">
                  <p className="text-xs font-black text-white group-hover:text-amber-300 transition leading-none truncate max-w-[120px]">
                    {userAccount.displayName}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {userAccount.friendCode ? (
                      <span className="text-[9.5px] font-mono font-bold text-amber-300">
                        {userAccount.friendCode}
                      </span>
                    ) : (
                      <>
                        <Trophy className="w-3 h-3 text-amber-400" />
                        <span className="text-[10px] text-amber-400 font-bold">
                          {userAccount.stats?.gamesWon || 0} {language === 'en' ? 'Wins' : 'Zafer'}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </button>
            </>
          ) : (
            <button
              onClick={handleGoogleClick}
              disabled={isLoadingAuth}
              className="flex items-center gap-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl py-1.5 px-2.5 sm:px-3 text-xs font-black text-slate-800 transition cursor-pointer shadow shrink-0 active:scale-95"
            >
              {isLoadingAuth ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
              )}
              <span className="hidden xs:inline">{t('googleLogin')}</span>
              <span className="xs:hidden inline">{language === 'en' ? 'Sign In' : 'Giriş Yap'}</span>
            </button>
          )}

          {/* Sound Toggle */}
          <button
            onClick={() => soundManager.toggle()}
            className={`flex items-center gap-1.5 p-1.5 sm:px-3 sm:py-1.5 rounded-xl border transition cursor-pointer shrink-0 shadow ${
              soundEnabled
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25'
                : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-white'
            }`}
            title={soundEnabled ? t('soundOff') : t('soundOn')}
          >
            {soundEnabled ? (
              <Volume2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400 shrink-0 animate-pulse" />
            ) : (
              <VolumeX className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-500 shrink-0" />
            )}
            <span className="text-xs font-bold hidden md:inline">
              {soundEnabled ? t('soundOn') : t('soundOff')}
            </span>
          </button>

          {/* TR / EN Dynamic Language Switcher */}
          <LanguageSwitcher />
        </div>

      </header>

      {/* 2. Main Content Area */}
      <main className={`w-full max-w-7xl mx-auto px-3 sm:px-8 py-2 sm:py-6 flex-1 relative z-10 ${
        hasJoined
          ? 'flex flex-col items-center justify-center my-auto'
          : 'grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-center'
      }`}>
        
        {/* Left Hero Section: Headline & Features (Only on Landing Page) */}
        {!hasJoined && (
          <div className="lg:col-span-6 space-y-4 sm:space-y-6 text-center lg:text-left">
            
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-bold mb-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>{t('heroBadge')}</span>
              </div>
              <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white leading-tight">
                {t('heroTitle1')} <br className="hidden sm:inline" />
                {t('heroTitle2')} <span className="bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-400 bg-clip-text text-transparent">{t('heroTitleHighlight')}</span>
              </h1>
              <p className="text-slate-300 text-xs sm:text-base font-medium max-w-md mx-auto lg:mx-0 pt-1 sm:pt-2 leading-relaxed">
                {t('heroDescription')}
              </p>
            </div>

            {/* Feature List with Gold Icons (Desktop view) */}
            <div className="hidden lg:grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2">
              <div className="flex items-center gap-3 bg-[#0a1124]/60 p-2.5 rounded-2xl border border-slate-800/80 backdrop-blur-sm">
                <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                  <TrendingUp className="w-4 h-4" />
                </div>
                <span className="text-sm font-bold text-slate-200">{t('strategyBadge')}</span>
              </div>

              <div className="flex items-center gap-3 bg-[#0a1124]/60 p-2.5 rounded-2xl border border-slate-800/80 backdrop-blur-sm">
                <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                  <Handshake className="w-4 h-4" />
                </div>
                <span className="text-sm font-bold text-slate-200">{t('conquerBadge')}</span>
              </div>

              <div className="flex items-center gap-3 bg-[#0a1124]/60 p-2.5 rounded-2xl border border-slate-800/80 backdrop-blur-sm">
                <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                  <Coins className="w-4 h-4" />
                </div>
                <span className="text-sm font-bold text-slate-200">{t('investBadge')}</span>
              </div>

              <div className="flex items-center gap-3 bg-[#0a1124]/60 p-2.5 rounded-2xl border border-slate-800/80 backdrop-blur-sm">
                <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                  <Users className="w-4 h-4" />
                </div>
                <span className="text-sm font-bold text-slate-200">{t('friendsBadge')}</span>
              </div>
            </div>

            {/* Cursive Quote Bottom Left (Desktop view) */}
            <div className="hidden lg:block pt-2">
              <p className="font-['Caveat',cursive] text-2xl sm:text-3xl text-amber-200/90 tracking-wide drop-shadow">
                {t('quoteBottomLeft')}
              </p>
            </div>

          </div>
        )}

        {/* Right Hero Section / Centered Room Lobby Card */}
        <div className={hasJoined ? 'w-full max-w-lg mx-auto relative' : 'lg:col-span-6 flex flex-col items-center lg:items-end relative w-full'}>
          
          {/* Cursive Quote Top Right */}
          {!hasJoined && (
            <div className="hidden lg:block absolute -top-8 right-6 pointer-events-none">
              <p className="font-['Caveat',cursive] text-2xl text-amber-200/90 tracking-wide drop-shadow text-right whitespace-pre-line">
                {t('quoteTopRight')}
              </p>
            </div>
          )}

          <div className="w-full bg-[#0a1020]/95 border border-slate-800/90 rounded-[24px] sm:rounded-[32px] p-4 sm:p-7 shadow-2xl backdrop-blur-2xl relative overflow-hidden ring-1 ring-amber-500/20">
            
            {/* Top Glow Accent */}
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-amber-500/15 rounded-full blur-2xl pointer-events-none" />

            {/* Card Header */}
            {hasJoined ? (
              /* Compact, elegant Room Lobby Header */
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-3 mb-3.5 w-full">
                <div className="flex items-center gap-2 sm:gap-2.5 text-left">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-400 to-amber-600 flex items-center justify-center text-sm shadow-md shadow-amber-500/30 shrink-0">
                    🎲
                  </div>
                  <div>
                    <h2 className="font-['Cinzel',serif] font-black text-sm sm:text-base text-white leading-none">
                      TURKISH <span className="bg-gradient-to-r from-amber-300 via-amber-400 to-amber-200 bg-clip-text text-transparent">PARADISE</span>
                    </h2>
                    <p className="text-[10px] text-amber-400 font-bold mt-0.5">{t('roomLobbyTitle')}</p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 bg-[#070b14] border border-amber-500/40 px-2.5 py-1 rounded-xl shadow-inner">
                  <span className="text-[9px] uppercase font-black text-slate-400">{t('roomCodeLabel')}:</span>
                  <span className="text-xs font-black font-mono text-amber-400">
                    {settings.roomCode || roomCode}
                  </span>
                </div>
              </div>
            ) : (
              /* Landing Page Card Header */
              <div className="text-center mb-4 sm:mb-5 flex flex-col items-center">
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-tr from-amber-400 to-amber-600 flex items-center justify-center text-base sm:text-lg shadow-lg shadow-amber-500/30 mb-1">
                  🎲
                </div>
                
                <span className="font-['Cinzel',serif] font-bold text-[11px] sm:text-xs tracking-[0.25em] text-slate-300 uppercase">
                  TURKISH
                </span>
                <h2 className="font-['Cinzel',serif] font-black text-2xl sm:text-4xl bg-gradient-to-r from-amber-200 via-amber-400 to-amber-200 bg-clip-text text-transparent drop-shadow-md leading-none tracking-wider my-0.5">
                  PARADISE
                </h2>
                
                <div className="flex items-center gap-2 mt-1 w-full justify-center">
                  <div className="h-[1px] w-8 bg-gradient-to-r from-transparent to-amber-400/60" />
                  <p className="font-['Caveat',cursive] text-sm sm:text-base text-amber-300/90 font-medium italic">
                    {language === 'en' ? 'Think Big, Own All of Turkey!' : 'Büyük Düşün, Tüm Türkiye Senin Olsun!'}
                  </p>
                  <div className="h-[1px] w-8 bg-gradient-to-l from-transparent to-amber-400/60" />
                </div>
              </div>
            )}

            {hasJoined ? (
              /* Joined Players Room Lobby */
              <div className="space-y-4 animate-fade-in">
                
                {/* 1. Invite Friends Card */}
                <div className="bg-[#070b14] border border-amber-500/30 rounded-2xl p-3 text-left space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Share2 className="w-3.5 h-3.5" /> {t('inviteFriendToRoom')}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                      {t('roomCodeLabel')}: <strong className="text-white">{settings.roomCode || roomCode}</strong>
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={copyRoomCode}
                      className="flex-1 flex items-center justify-center gap-1 py-1.5 px-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 hover:text-white transition text-xs font-bold cursor-pointer"
                    >
                      {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-amber-400" />}
                      <span>{copiedCode ? t('copied') : t('copyRoomCode')}</span>
                    </button>

                    <button
                      type="button"
                      onClick={copyInviteLink}
                      className="flex-1 flex items-center justify-center gap-1 py-1.5 px-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 hover:text-white transition text-xs font-bold cursor-pointer"
                    >
                      {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5 text-sky-400" />}
                      <span>{copiedLink ? t('copied') : t('copyRoomLink')}</span>
                    </button>
                  </div>

                  {isHost && (
                    <button
                      type="button"
                      onClick={handleTogglePublishPublicRoom}
                      className={`w-full flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl border text-xs font-bold transition cursor-pointer mt-1 ${
                        isPublicRoom
                          ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/30 shadow-lg shadow-emerald-500/10'
                          : 'bg-slate-900/90 hover:bg-slate-800 border-amber-500/30 text-amber-300 hover:text-white'
                      }`}
                    >
                      <Globe className={`w-3.5 h-3.5 ${isPublicRoom ? 'text-emerald-400 animate-pulse' : 'text-amber-400'}`} />
                      <span>
                        {isPublicRoom
                          ? (isRoomPublished ? '✅ ' + t('roomPublishedNotice') : (language === 'en' ? '🌐 Live in Directory (Click to make Private)' : '🌐 Canlı Listede Yayında (Gizlemek için tıkla)'))
                          : t('shareRoomPublicly')}
                      </span>
                    </button>
                  )}
                </div>

                {/* 2. Host Game Rules & Options (Kurucu Oyun Ayarları) */}
                {isHost && (
                  <div className="bg-[#070b14]/90 border border-slate-800 rounded-2xl p-3 text-left space-y-2.5">
                    <div className="flex items-center justify-between border-b border-slate-800/80 pb-1.5">
                      <span className="text-xs font-black text-amber-400 flex items-center gap-1.5">
                        <Sliders className="w-3.5 h-3.5" /> {t('roomSettingsTitle')}
                      </span>
                      <span className="text-[9px] bg-amber-500/20 text-amber-300 font-bold px-1.5 py-0.5 rounded border border-amber-500/30">
                        {t('hostBadge')}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      {/* Starting Money */}
                      <div>
                        <label className="text-slate-400 font-bold text-[10px] block mb-1">
                          {t('startMoneyLabel')}
                        </label>
                        <select
                          value={settings.startingMoney}
                          onChange={(e) => onUpdateSettings({ ...settings, startingMoney: Number(e.target.value) })}
                          className="w-full bg-slate-900 border border-slate-700/80 rounded-lg py-1 px-2 text-xs text-white font-bold outline-none cursor-pointer"
                        >
                          <option value={1000}>{formatMoney(1000)} ({language === 'en' ? 'Fast' : 'Hızlı'})</option>
                          <option value={1500}>{formatMoney(1500)} ({language === 'en' ? 'Standard' : 'Standart'})</option>
                          <option value={2000}>{formatMoney(2000)} ({language === 'en' ? 'Rich' : 'Zengin'})</option>
                          <option value={2500}>{formatMoney(2500)} ({language === 'en' ? 'Mega' : 'Mega'})</option>
                          <option value={3000}>{formatMoney(3000)} ({language === 'en' ? 'Ultra' : 'Ultra'})</option>
                        </select>
                      </div>

                      {/* Max Houses / Buy Limit */}
                      <div>
                        <label className="text-slate-400 font-bold text-[10px] block mb-1">
                          {t('maxHousesLabel')}
                        </label>
                        <select
                          value={settings.firstLapBuyLimit}
                          onChange={(e) => onUpdateSettings({ ...settings, firstLapBuyLimit: Number(e.target.value) })}
                          className="w-full bg-slate-900 border border-slate-700/80 rounded-lg py-1 px-2 text-xs text-white font-bold outline-none cursor-pointer"
                        >
                          <option value={0}>{t('unlimitedHouses')}</option>
                          <option value={1}>{t('housesCount', { count: 1 })}</option>
                          <option value={2}>{t('housesCount', { count: 2 })}</option>
                          <option value={3}>{t('housesCount', { count: 3 })}</option>
                          <option value={4}>{t('housesCount', { count: 4 })}</option>
                        </select>
                      </div>

                      {/* Bot Difficulty */}
                      <div>
                        <label className="text-slate-400 font-bold text-[10px] block mb-1">
                          {t('botDifficultyLabel')}
                        </label>
                        <select
                          value={settings.botDifficulty}
                          onChange={(e) => onUpdateSettings({ ...settings, botDifficulty: e.target.value as BotDifficulty })}
                          className="w-full bg-slate-900 border border-slate-700/80 rounded-lg py-1 px-2 text-xs text-white font-bold outline-none cursor-pointer"
                        >
                          <option value="easy">{t('botEasy')}</option>
                          <option value="medium">{t('botMedium')}</option>
                          <option value="hard">{t('botHard')}</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {/* 3. Joined Players List & Add Bot */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <div className="flex items-center gap-1.5 text-slate-300 font-bold text-xs">
                      <Users className="w-3.5 h-3.5 text-amber-400" />
                      <span>{t('playersListTitle')} ({players.length}/6)</span>
                    </div>

                    {/* Bot Add Buttons with difficulty (Host Only) */}
                    {isHost && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => onAddBot('easy')}
                          disabled={players.length >= 6}
                          className="bg-emerald-500/10 hover:bg-emerald-500/20 text-[10px] font-bold px-1.5 sm:px-2 py-1 rounded-lg border border-emerald-500/30 text-emerald-400 transition disabled:opacity-40 cursor-pointer active:scale-95"
                          title="Kolay Bot Ekle"
                        >
                          {t('addEasyBot')}
                        </button>
                        <button
                          onClick={() => onAddBot('medium')}
                          disabled={players.length >= 6}
                          className="bg-amber-500/10 hover:bg-amber-500/20 text-[10px] font-bold px-1.5 sm:px-2 py-1 rounded-lg border border-amber-500/30 text-amber-300 transition disabled:opacity-40 cursor-pointer active:scale-95"
                          title="Orta Bot Ekle"
                        >
                          {t('addMediumBot')}
                        </button>
                        <button
                          onClick={() => onAddBot('hard')}
                          disabled={players.length >= 6}
                          className="bg-rose-500/10 hover:bg-rose-500/20 text-[10px] font-bold px-1.5 sm:px-2 py-1 rounded-lg border border-rose-500/30 text-rose-400 transition disabled:opacity-40 cursor-pointer active:scale-95"
                          title="Zor Bot Ekle"
                        >
                          {t('addHardBot')}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Player Items */}
                  <div className="space-y-1.5 max-h-40 overflow-y-auto pr-0.5">
                    {players.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between bg-[#070b14] border border-slate-800/80 hover:border-slate-700 rounded-xl p-2 sm:p-2.5 gap-2 transition"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {/* Player Assigned Color Dot */}
                          <div
                            className="w-3.5 h-3.5 rounded-full border border-white/80 shrink-0 shadow-sm ring-1 ring-slate-700"
                            style={{ backgroundColor: p.color }}
                            title={`Piyon Rengi: ${p.color}`}
                          />
                          <span className="text-base sm:text-lg shrink-0">{p.avatar}</span>
                          <span className="font-bold text-xs text-white flex items-center gap-1.5 truncate">
                            <span className="truncate">{p.name}</span>
                            {p.id === myPlayerId && (
                              <span className="text-[8px] bg-amber-500 text-slate-950 font-black px-1.5 py-0.5 rounded shrink-0">
                                {t('youBadge')}
                              </span>
                            )}
                            {p.isBot && (
                              <span className="text-[8px] bg-slate-800 text-slate-300 font-bold px-1.5 py-0.5 rounded border border-slate-700 shrink-0">
                                {p.botDifficulty === 'hard' ? '🔴 HARD' : p.botDifficulty === 'easy' ? '🟢 EASY' : '🟡 MED'}
                              </span>
                            )}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {p.isHost && (
                            <span className="flex items-center gap-1 text-[9px] sm:text-[10px] text-amber-400 font-bold bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md">
                              <Shield className="w-3 h-3" /> {t('hostBadge')}
                            </span>
                          )}

                          {/* Host can remove bot or kick player */}
                          {isHost && !p.isHost && (
                            <button
                              type="button"
                              onClick={() => onRemovePlayer?.(p.id)}
                              className="flex items-center gap-1 bg-rose-500/15 hover:bg-rose-500/30 text-rose-400 border border-rose-500/30 rounded-lg px-2 py-1 text-[10px] font-bold transition cursor-pointer active:scale-95"
                              title={p.isBot ? t('removeBot') : t('kickPlayer')}
                            >
                              {p.isBot ? <Trash2 className="w-3 h-3" /> : <UserMinus className="w-3 h-3" />}
                              <span className="hidden sm:inline">{p.isBot ? t('removeBot') : t('kickPlayer')}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 4. Action Buttons (Start Game / Leave Room) */}
                <div className="pt-2 space-y-2">
                  {isHost ? (
                    <button
                      type="button"
                      onClick={onStartGame}
                      disabled={players.length < 2}
                      className="w-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 hover:from-amber-300 hover:to-amber-500 disabled:from-slate-800 disabled:to-slate-900 disabled:text-slate-600 text-slate-950 font-black py-3.5 rounded-xl shadow-xl shadow-amber-500/20 transition transform active:scale-95 text-base tracking-wide flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                    >
                      <Play className="w-5 h-5 fill-current" />
                      <span>{t('startGame')}</span>
                    </button>
                  ) : isRoomInactive ? (
                    <div className="p-3.5 bg-rose-950/60 border border-rose-500/50 rounded-2xl text-center space-y-2.5 animate-fade-in shadow-xl">
                      <div className="flex items-center justify-center gap-2 text-rose-300 text-xs font-black">
                        <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                        <span>{language === 'en' ? 'This room is no longer active or host left.' : 'Bu oda artık aktif değil veya kurucu oyunu kapattı.'}</span>
                      </div>
                      {onLeaveLobby && (
                        <button
                          type="button"
                          onClick={onLeaveLobby}
                          className="w-full bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white font-black py-2.5 rounded-xl transition text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-rose-900/30 active:scale-95"
                        >
                          <ArrowLeft className="w-4 h-4 stroke-[2.5]" />
                          <span>{t('backToMenu')}</span>
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl text-center space-y-1">
                      <div className="flex items-center justify-center gap-2 text-amber-400 text-xs font-bold">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>{t('waitingForHost')}</span>
                      </div>
                    </div>
                  )}

                  {isHost && players.length < 2 && (
                    <p className="text-[11px] text-amber-400/80 font-semibold text-center">
                      {t('minPlayersRequired')}
                    </p>
                  )}

                  {onLeaveLobby && (
                    <button
                      type="button"
                      onClick={onLeaveLobby}
                      className="w-full bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white font-bold py-2 rounded-xl transition text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5 text-rose-400" />
                      <span>{t('leaveLobby')}</span>
                    </button>
                  )}
                </div>

              </div>
            ) : mode === 'rooms' ? (
              /* Public / Live Rooms Directory Mode */
              <PublicRoomsList
                onJoinRoom={(targetRoomCode, isSpectating) => {
                  const finalName = name.trim() || userAccount?.displayName || `Oyuncu_${Math.floor(100 + Math.random() * 900)}`;
                  setRoomCode(targetRoomCode);
                  setMode('main');
                  onJoin(finalName, selectedAvatar, selectedColor, true, targetRoomCode, false, isSpectating);
                }}
                onBackToMain={() => setMode('main')}
                onCreateRoom={() => setMode('main')}
              />
            ) : mode === 'friend' ? (
              /* Join Friend Room Mode Form */
              <form onSubmit={handleFriendSubmit} className="space-y-4 animate-fade-in">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <button
                    type="button"
                    onClick={() => setMode('main')}
                    className="flex items-center gap-1 text-xs font-bold text-slate-400 hover:text-white transition cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>{t('backToMenu')}</span>
                  </button>
                  <span className="text-xs font-black text-sky-400 uppercase tracking-wide flex items-center gap-1">
                    <Users className="w-4 h-4" /> {t('joinFriendTitle')}
                  </span>
                </div>

                {/* Target Room Code Input */}
                <div className="space-y-1.5 text-left">
                  <label className="text-xs font-bold text-slate-300">
                    {t('targetRoomCodeLabel')}
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                      <KeyRound className="w-4 h-4 text-sky-400" />
                    </div>
                    <input
                      type="text"
                      value={roomCode}
                      onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                      placeholder="TR-XXXX"
                      maxLength={10}
                      required
                      className="w-full bg-[#070b14] border border-slate-800 focus:border-sky-400 text-sky-300 font-mono font-bold rounded-xl pl-10 pr-4 py-2.5 text-sm uppercase placeholder-slate-600 outline-none transition"
                    />
                  </div>
                </div>

                {/* Player Name Input */}
                <div className="space-y-1.5 text-left">
                  <label className="text-xs font-bold text-slate-300">
                    {t('usernameLabel')}
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                      <User className="w-4 h-4" />
                    </div>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={userAccount?.displayName || t('usernamePlaceholder')}
                      maxLength={15}
                      required
                      className="w-full bg-[#070b14] border border-slate-800 focus:border-sky-400 text-white rounded-xl pl-10 pr-4 py-2.5 text-sm font-semibold placeholder-slate-600 outline-none transition"
                    />
                  </div>
                </div>

                {/* Token / Avatar Picker */}
                <div className="space-y-1.5 text-left">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-300">
                      {t('selectAvatarLabel')}
                    </label>
                    <span className="text-[10px] text-slate-400 font-semibold">
                      {PLAYER_AVATARS.filter(a => !takenAvatars.includes(a)).length} {language === 'en' ? 'Available' : 'Müsait'}
                    </span>
                  </div>
                  <div className="grid grid-cols-6 gap-2">
                    {PLAYER_AVATARS.map((avatar) => {
                      const isTaken = takenAvatars.includes(avatar);
                      const isSelected = selectedAvatar === avatar;

                      return (
                        <button
                          key={avatar}
                          type="button"
                          disabled={isTaken}
                          onClick={() => setSelectedAvatar(avatar)}
                          className={`text-xl p-2.5 rounded-xl border text-center transition transform relative ${
                            isTaken
                              ? 'opacity-25 cursor-not-allowed grayscale border-slate-700 bg-slate-900/40'
                              : isSelected
                              ? 'bg-sky-500/20 border-sky-400 ring-2 ring-sky-400/50 shadow-lg cursor-pointer active:scale-95'
                              : 'bg-[#070b14] border-slate-800 hover:border-slate-700 cursor-pointer active:scale-90'
                          }`}
                          title={isTaken ? t('colorTaken') : undefined}
                        >
                          <span>{avatar}</span>
                          {isTaken && (
                            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[7px] font-black text-white/80 bg-slate-950/90 px-1 rounded border border-slate-700">
                              {t('colorTaken')}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Color Picker (6 Colors) */}
                <div className="space-y-1.5 text-left">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-300 flex items-center gap-1">
                      <Palette className="w-3.5 h-3.5 text-sky-400" />
                      <span>{t('selectColorLabel')}</span>
                    </label>
                    <span className="text-[10px] text-slate-400 font-semibold">
                      {PLAYER_COLORS.filter(c => !takenColors.includes(c)).length} {language === 'en' ? 'Available' : 'Müsait'}
                    </span>
                  </div>
                  <div className="grid grid-cols-6 gap-2">
                    {PLAYER_COLORS.map((color) => {
                      const isTaken = takenColors.includes(color);
                      const isSelected = selectedColor === color;

                      return (
                        <button
                          key={color}
                          type="button"
                          disabled={isTaken}
                          onClick={() => setSelectedColor(color)}
                          className={`h-8 rounded-xl border-2 flex items-center justify-center transition transform relative ${
                            isTaken
                              ? 'opacity-25 cursor-not-allowed grayscale border-slate-700'
                              : isSelected
                              ? 'ring-2 ring-white scale-105 border-white shadow-lg cursor-pointer'
                              : 'border-transparent opacity-80 hover:opacity-100 cursor-pointer active:scale-90'
                          }`}
                          style={{
                            backgroundColor: color,
                            boxShadow: isSelected && !isTaken ? `0 0 10px ${color}` : undefined
                          }}
                          title={isTaken ? t('colorTaken') : undefined}
                        >
                          {isSelected && !isTaken && <Check className="w-3.5 h-3.5 text-white drop-shadow stroke-[3]" />}
                          {isTaken && <span className="text-[8px] font-black text-white/90">{t('colorTaken')}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-black py-3.5 rounded-xl shadow-xl shadow-sky-500/20 transition transform active:scale-95 text-base tracking-wide flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Users className="w-5 h-5" />
                  <span>{t('joinRoomBtn')} 🚀</span>
                </button>
              </form>
            ) : (
              /* Default Main Screen with Google OAuth & Guest Options */
              <div className="space-y-4">
                
                {/* 1. Official Google OAuth Button */}
                {!userAccount && (
                  <button
                    type="button"
                    onClick={handleGoogleClick}
                    disabled={isLoadingAuth}
                    className="w-full bg-white hover:bg-slate-100 text-slate-800 font-bold py-3.5 px-4 rounded-2xl shadow-lg transition transform active:scale-95 flex items-center justify-center gap-3 cursor-pointer border border-slate-200"
                  >
                    {isLoadingAuth ? (
                      <Loader2 className="w-5 h-5 animate-spin text-slate-600" />
                    ) : (
                      <svg className="w-5 h-5" viewBox="0 0 24 24">
                        <path
                          fill="#4285F4"
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                        />
                      </svg>
                    )}
                    <span className="text-sm font-extrabold tracking-wide">{t('googleLogin')}</span>
                  </button>
                )}

                {/* Divider */}
                {!userAccount && (
                  <div className="relative flex items-center justify-center my-2">
                    <div className="border-t border-slate-800 w-full" />
                    <span className="bg-[#0e1628] px-3 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                      {language === 'en' ? 'OR' : 'veya'}
                    </span>
                  </div>
                )}

                {/* Form For Joining / Creating Room */}
                <form onSubmit={handleMainSubmit} className="space-y-4">
                  
                  {/* Player Name Input */}
                  <div className="space-y-1.5 text-left">
                    <label className="text-xs font-bold text-slate-300">
                      {userAccount ? (language === 'en' ? 'Player Profile' : 'Oyuncu Profiliniz') : t('usernameLabel')}
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                        <User className="w-4 h-4" />
                      </div>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder={t('usernamePlaceholder')}
                        maxLength={15}
                        required
                        className="w-full bg-[#070b14] border border-slate-800 focus:border-amber-400 focus:ring-1 focus:ring-amber-400 text-white rounded-xl pl-10 pr-4 py-3 text-sm font-semibold placeholder-slate-600 outline-none transition"
                      />
                    </div>
                  </div>

                  {/* Token / Avatar Picker */}
                  <div className="space-y-1.5 text-left">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-300">
                        {t('selectAvatarLabel')}
                      </label>
                      <span className="text-[10px] text-slate-400 font-semibold">
                        {PLAYER_AVATARS.filter(a => !takenAvatars.includes(a)).length} {language === 'en' ? 'Available' : 'Müsait'}
                      </span>
                    </div>
                    <div className="grid grid-cols-6 gap-2">
                      {PLAYER_AVATARS.map((avatar) => {
                        const isTaken = takenAvatars.includes(avatar);
                        const isSelected = selectedAvatar === avatar;

                        return (
                          <button
                            key={avatar}
                            type="button"
                            disabled={isTaken}
                            onClick={() => setSelectedAvatar(avatar)}
                            className={`text-xl p-2.5 rounded-xl border text-center transition transform relative ${
                              isTaken
                                ? 'opacity-25 cursor-not-allowed grayscale border-slate-700 bg-slate-900/40'
                                : isSelected
                                ? 'bg-amber-500/20 border-amber-400 ring-2 ring-amber-400/50 shadow-lg cursor-pointer active:scale-95'
                                : 'bg-[#070b14] border-slate-800 hover:border-slate-700 cursor-pointer active:scale-90'
                            }`}
                            title={isTaken ? t('colorTaken') : undefined}
                          >
                            <span>{avatar}</span>
                            {isTaken && (
                              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[7px] font-black text-white/80 bg-slate-950/90 px-1 rounded border border-slate-700">
                                {t('colorTaken')}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Color Picker (6 Colors) */}
                  <div className="space-y-1.5 text-left">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-300 flex items-center gap-1">
                        <Palette className="w-3.5 h-3.5 text-amber-400" />
                        <span>{t('selectColorLabel')}</span>
                      </label>
                      <span className="text-[10px] text-slate-400 font-semibold">
                        {PLAYER_COLORS.filter(c => !takenColors.includes(c)).length} {language === 'en' ? 'Available' : 'Müsait'}
                      </span>
                    </div>
                    <div className="grid grid-cols-6 gap-2">
                      {PLAYER_COLORS.map((color) => {
                        const isTaken = takenColors.includes(color);
                        const isSelected = selectedColor === color;

                        return (
                          <button
                            key={color}
                            type="button"
                            disabled={isTaken}
                            onClick={() => setSelectedColor(color)}
                            className={`h-8 rounded-xl border-2 flex items-center justify-center transition transform relative ${
                              isTaken
                                ? 'opacity-25 cursor-not-allowed grayscale border-slate-700'
                              : isSelected
                                ? 'ring-2 ring-white scale-105 border-white shadow-lg cursor-pointer'
                                : 'border-transparent opacity-80 hover:opacity-100 cursor-pointer active:scale-90'
                            }`}
                            style={{
                              backgroundColor: color,
                              boxShadow: isSelected && !isTaken ? `0 0 10px ${color}` : undefined
                            }}
                            title={isTaken ? t('colorTaken') : undefined}
                          >
                            {isSelected && !isTaken && <Check className="w-3.5 h-3.5 text-white drop-shadow stroke-[3]" />}
                            {isTaken && <span className="text-[8px] font-black text-white/90">{t('colorTaken')}</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Primary Button */}
                  <button
                    type="submit"
                    className="w-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 hover:from-amber-300 hover:to-amber-500 text-slate-950 font-black py-3.5 rounded-xl shadow-xl shadow-amber-500/20 transition transform active:scale-95 text-base tracking-wide flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>{t('createAndJoinRoom')}</span>
                    <span className="text-lg">🎲</span>
                  </button>

                  {/* Secondary Quick Action Buttons */}
                  <div className="grid grid-cols-2 gap-2.5 pt-1">
                    <button
                      type="button"
                      onClick={() => setMode('rooms')}
                      className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-gradient-to-r from-emerald-500/15 to-teal-500/10 hover:from-emerald-500/25 hover:to-teal-500/20 border border-emerald-500/30 hover:border-emerald-500/50 text-emerald-300 hover:text-white transition text-xs font-bold cursor-pointer relative"
                    >
                      <Globe className="w-3.5 h-3.5 text-emerald-400" />
                      <span>{t('publicRoomsBtn')}</span>
                      {liveRoomsCount > 0 && (
                        <span className="px-1.5 py-0.5 text-[9px] font-black bg-emerald-500 text-slate-950 rounded-full">
                          {liveRoomsCount}
                        </span>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => setMode('friend')}
                      className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-[#070b14] hover:bg-slate-900 border border-slate-800 text-slate-300 hover:text-white transition text-xs font-bold cursor-pointer"
                    >
                      <Users className="w-3.5 h-3.5 text-sky-400" />
                      <span>{t('joinFriend')}</span>
                    </button>
                  </div>

                </form>

                {/* Footer Tagline */}
                <div className="pt-2 text-[10px] font-semibold text-slate-500 tracking-wider uppercase text-center">
                  {t('tagline')}
                </div>

              </div>
            )}

          </div>

          {/* Mobile Features & Quote (only when on landing page, NOT when in a room!) */}
          {!hasJoined && (
            <div className="lg:hidden w-full max-w-md mt-6 space-y-4">
              <div className="grid grid-cols-2 gap-2.5">
                <div className="flex items-center gap-2.5 bg-[#0a1124]/70 p-2.5 rounded-2xl border border-slate-800/80 backdrop-blur-sm">
                  <div className="w-7 h-7 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                    <TrendingUp className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-xs font-bold text-slate-200">{t('strategyBadge')}</span>
                </div>

                <div className="flex items-center gap-2.5 bg-[#0a1124]/70 p-2.5 rounded-2xl border border-slate-800/80 backdrop-blur-sm">
                  <div className="w-7 h-7 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                    <Handshake className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-xs font-bold text-slate-200">{t('conquerBadge')}</span>
                </div>

                <div className="flex items-center gap-2.5 bg-[#0a1124]/70 p-2.5 rounded-2xl border border-slate-800/80 backdrop-blur-sm">
                  <div className="w-7 h-7 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                    <Coins className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-xs font-bold text-slate-200">{t('investBadge')}</span>
                </div>

                <div className="flex items-center gap-2.5 bg-[#0a1124]/70 p-2.5 rounded-2xl border border-slate-800/80 backdrop-blur-sm">
                  <div className="w-7 h-7 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                    <Users className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-xs font-bold text-slate-200">{t('friendsBadge')}</span>
                </div>
              </div>

              <p className="font-['Caveat',cursive] text-xl text-amber-200/90 text-center tracking-wide">
                {t('quoteBottomLeft')}
              </p>
            </div>
          )}

        </div>

      </main>

      {/* 3. Footer */}
      <footer className="w-full max-w-7xl mx-auto px-4 sm:px-8 pt-8 pb-[max(calc(1.5rem+env(safe-area-inset-bottom,0px)),2rem)] sm:py-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] sm:text-xs font-semibold text-slate-500 relative z-20 mt-auto text-center sm:text-left">
        <span>© 2026 Turkish Paradise - {language === 'en' ? 'All Rights Reserved. Turkey-Themed Web Board Game.' : 'Tüm Hakları Saklıdır. Türkiye Temalı Web Masa Oyunu.'}</span>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveModal('contact')}
            className="hover:text-amber-400 text-slate-400 bg-slate-900/80 hover:bg-slate-800 border border-slate-800 hover:border-amber-500/30 px-3.5 py-1.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95"
          >
            <Mail className="w-3.5 h-3.5 text-amber-400" />
            <span>{t('contact')}: <span className="font-mono text-amber-300/90">turkishparadisegame@gmail.com</span></span>
          </button>
        </div>
      </footer>

      {/* Profile & Stats Modal */}
      {isProfileModalOpen && userAccount && (
        <ProfileModal
          userAccount={userAccount}
          onClose={() => setIsProfileModalOpen(false)}
          onLogout={onLogout}
          onUpdateUserAccount={onUpdateUserAccount}
          onGoogleLogin={onGoogleLogin}
          roomId={roomCode}
          initialTab={profileInitialTab}
        />
      )}

      {/* Info Modals (Nasıl Oynanır, Özellikler, Topluluk, İletişim) */}
      {activeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="bg-[#0e1628] border border-slate-800 rounded-3xl max-w-md w-full p-6 text-left shadow-2xl relative space-y-4">
            <button
              onClick={() => setActiveModal(null)}
              className="absolute top-4 right-4 p-1.5 rounded-full bg-slate-900 text-slate-400 hover:text-white transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            {activeModal === 'rules' && (
              <>
                <h3 className="text-xl font-black text-amber-400 flex items-center gap-2">
                  <HelpCircle className="w-5 h-5" /> {t('rulesModalTitle')}
                </h3>
                {language === 'en' ? (
                  <div className="text-xs text-slate-300 space-y-2 leading-relaxed">
                    <p>• <strong>Roll Dice:</strong> When it's your turn, roll the 3D dice to advance across the board.</p>
                    <p>• <strong>Buy Cities:</strong> Land on unowned properties and purchase them to expand your portfolio.</p>
                    <p>• <strong>Color Series Monopoly:</strong> You must own all cities in a color group before you can build houses!</p>
                    <p>• <strong>Ferry Stations:</strong> Own up to 4 stations to multiply your rent revenue (from $50 up to $200).</p>
                    <p>• <strong>Jail:</strong> If you get sent to jail, pay $100 bail or roll doubles to escape.</p>
                  </div>
                ) : (
                  <div className="text-xs text-slate-300 space-y-2 leading-relaxed">
                    <p>• <strong>Zar At:</strong> Sıranız geldiğinde çift zar atarak haritada ilerleyin.</p>
                    <p>• <strong>Şehirleri Satın Al:</strong> Sahipsiz şehirlere gelerek satın alın ve portföyünüzü kurun.</p>
                    <p>• <strong>Renk Serisi Kuralı:</strong> Bir renkteki tüm şehirlere sahip olmadan ev dikemezsiniz!</p>
                    <p>• <strong>İskeleler:</strong> 4 iskeleyi toplayarak kira gelirinizi katlayın (50₺'den 200₺'ye).</p>
                    <p>• <strong>Kodes:</strong> Kodese düşerseniz 100₺ kefalet ödeyerek veya çift zar atarak çıkabilirsiniz.</p>
                  </div>
                )}
              </>
            )}

            {activeModal === 'features' && (
              <>
                <h3 className="text-xl font-black text-amber-400 flex items-center gap-2">
                  <Sparkles className="w-5 h-5" /> {t('featuresModalTitle')}
                </h3>
                {language === 'en' ? (
                  <div className="text-xs text-slate-300 space-y-2 leading-relaxed">
                    <p>• 26 Authentic Turkish Cities & Landmark Cards</p>
                    <p>• 4 Famous Bosphorus Ferry Stations (Kadikoy, Kabatas, Besiktas, Uskudar)</p>
                    <p>• 15 Card Chance & Community Chest Deck</p>
                    <p>• Smart AI Bot Opponents (Easy, Medium, Hard)</p>
                    <p>• Real-time Financial Ledger & Transactions History</p>
                    <p>• Live In-Game Chat & Property Trading System</p>
                  </div>
                ) : (
                  <div className="text-xs text-slate-300 space-y-2 leading-relaxed">
                    <p>• 26 Türkiye Şehri & Gerçek Manzara Kartları</p>
                    <p>• 4 Vapur İskelesi (Kadıköy, Kabataş, Beşiktaş, Üsküdar)</p>
                    <p>• 15 Kartlık Şans ve Kamu Fonu Havuzu</p>
                    <p>• Zeki Yapay Zeka Botları (Kolay, Orta, Zor)</p>
                    <p>• Hesap Hareketleri & Finansal Raporlama</p>
                    <p>• Canlı Sohbet & Oyuncu Takas Sistemi</p>
                  </div>
                )}
              </>
            )}

            {activeModal === 'community' && (
              <>
                <h3 className="text-xl font-black text-amber-400 flex items-center gap-2">
                  <Globe className="w-5 h-5" /> {t('communityModalTitle')}
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {language === 'en'
                    ? "Join the vibrant Turkish Paradise community, compete in custom rooms with friends, and rise to become Turkey's greatest real estate tycoon!"
                    : "Turkish Paradise oyuncu topluluğuna katılın, arkadaşlarınızla özel odalarda rekabet edin ve Türkiye'nin en büyük emlak kralı olun!"}
                </p>
              </>
            )}

            {activeModal === 'contact' && (
              <>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-slate-950 shadow-lg shadow-amber-500/20 shrink-0">
                    <Mail className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-white">{t('contactTitle')}</h3>
                    <p className="text-xs text-amber-400/90 font-medium">{t('contactSubtitle')}</p>
                  </div>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">
                  {t('contactDescription')}
                </p>

                <div className="bg-slate-900/90 border border-amber-500/30 rounded-2xl p-4 space-y-3 shadow-inner">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 overflow-hidden">
                      <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
                        <Mail className="w-4 h-4" />
                      </div>
                      <div className="truncate">
                        <span className="text-[10px] text-slate-400 block font-semibold">{t('officialEmailLabel')}</span>
                        <span className="text-xs sm:text-sm font-bold text-amber-300 font-mono select-all">turkishparadisegame@gmail.com</span>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText('turkishparadisegame@gmail.com');
                        setCopiedEmail(true);
                        setTimeout(() => setCopiedEmail(false), 2000);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition flex items-center gap-1 shrink-0 cursor-pointer shadow-md"
                    >
                      {copiedEmail ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedEmail ? t('copied') : t('copy')}
                    </button>
                  </div>

                  <a
                    href="mailto:turkishparadisegame@gmail.com?subject=Turkish%20Paradise%20-%20Contact%20%2F%20Feedback"
                    className="w-full bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold py-2.5 rounded-xl transition text-xs flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5 text-amber-400" />
                    {t('openInEmailApp')}
                  </a>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center text-[10.5px] text-slate-400 font-medium">
                  <div className="bg-slate-900/60 border border-slate-800/80 p-2 rounded-xl">
                    <span className="block text-amber-400 font-bold mb-0.5">{t('suggestionsTag')}</span>
                    {t('suggestionsDesc')}
                  </div>
                  <div className="bg-slate-900/60 border border-slate-800/80 p-2 rounded-xl">
                    <span className="block text-rose-400 font-bold mb-0.5">{t('bugReportTag')}</span>
                    {t('bugReportDesc')}
                  </div>
                  <div className="bg-slate-900/60 border border-slate-800/80 p-2 rounded-xl">
                    <span className="block text-emerald-400 font-bold mb-0.5">{t('collabTag')}</span>
                    {t('collabDesc')}
                  </div>
                </div>
              </>
            )}

            <button
              onClick={() => setActiveModal(null)}
              className="w-full bg-slate-800 hover:bg-slate-700 text-amber-400 font-bold py-2.5 rounded-xl transition text-xs mt-2 cursor-pointer"
            >
              {t('closeBtn')}
            </button>
          </div>
        </div>
      )}

      {/* Profile & Friends Modal */}
      {isProfileModalOpen && userAccount && (
        <ProfileModal
          userAccount={userAccount}
          onClose={() => setIsProfileModalOpen(false)}
          onLogout={onLogout}
          onUpdateUserAccount={onUpdateUserAccount}
          onGoogleLogin={onGoogleLogin}
          onJoinRoom={(targetRoom) => {
            setIsProfileModalOpen(false);
            if (onJoinRoom) {
              onJoinRoom(targetRoom);
            } else {
              setRoomCode(targetRoom);
              setMode('friend');
            }
          }}
          roomId={roomCode}
          initialTab={profileInitialTab}
        />
      )}

    </div>
  );
};
