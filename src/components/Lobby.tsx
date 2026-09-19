import React, { useState, useEffect } from 'react';
import { Player, GameSettings, BotDifficulty, UserAccount } from '../types/game';
import { PLAYER_AVATARS, PLAYER_COLORS } from '../engine/gameEngine';
import { ProfileModal } from './ProfileModal';
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
  UserMinus
} from 'lucide-react';

interface LobbyProps {
  players: Player[];
  myPlayerId: string | null;
  settings: GameSettings;
  userAccount: UserAccount | null;
  onGoogleLogin: () => Promise<void>;
  onGuestLogin: (customName?: string) => Promise<void>;
  onLogout: () => void;
  onUpdateSettings: (newSettings: GameSettings) => void;
  onJoin: (name: string, avatar: string, color: string, isOnline?: boolean, targetRoomCode?: string) => void;
  onAddBot: (difficulty?: BotDifficulty) => void;
  onRemovePlayer?: (playerId: string) => void;
  onStartGame: () => void;
  onLeaveLobby?: () => void;
}

export const Lobby: React.FC<LobbyProps> = ({
  players,
  myPlayerId,
  settings,
  userAccount,
  onGoogleLogin,
  onGuestLogin,
  onLogout,
  onUpdateSettings,
  onJoin,
  onAddBot,
  onRemovePlayer,
  onStartGame,
  onLeaveLobby,
}) => {
  const [mode, setMode] = useState<'main' | 'guest' | 'friend'>('main');
  const [name, setName] = useState('');
  const [guestName, setGuestName] = useState(() => `Misafir_${Math.floor(1000 + Math.random() * 9000)}`);
  const [roomCode, setRoomCode] = useState(settings.roomCode || 'TR-1001');
  const [selectedAvatar, setSelectedAvatar] = useState(PLAYER_AVATARS[0]);
  const [selectedColor, setSelectedColor] = useState(PLAYER_COLORS[0]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [activeModal, setActiveModal] = useState<'rules' | 'features' | 'community' | null>(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(false);
  const [isInviteLink, setIsInviteLink] = useState(false);

  // Check URL query parameters for invite link: ?room=TR-XXXX or ?oda=TR-XXXX
  useEffect(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const urlRoom = urlParams.get('room') || urlParams.get('oda') || urlParams.get('code');
      if (urlRoom && urlRoom.trim()) {
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

  const hasJoined = players.some((p) => p.id === myPlayerId);
  const me = players.find((p) => p.id === myPlayerId);
  const isHost = me?.isHost || (players.length > 0 && players[0].id === myPlayerId);

  // Taken colors by other players/bots in the room
  const takenColors = players.filter((p) => p.id !== myPlayerId).map((p) => p.color);

  // Auto-switch selectedColor if taken by another player/bot
  useEffect(() => {
    const freeColors = PLAYER_COLORS.filter((c) => !takenColors.includes(c));
    if (freeColors.length > 0 && takenColors.includes(selectedColor)) {
      setSelectedColor(freeColors[0]);
    }
  }, [players, myPlayerId, selectedColor]);

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
    onJoin(finalName, selectedAvatar, selectedColor, true, roomCode);
  };

  const handleGuestSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalName = guestName.trim() || `Misafir_${Math.floor(1000 + Math.random() * 9000)}`;
    onJoin(finalName, selectedAvatar, selectedColor, true, roomCode);
  };

  const handleFriendSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalName = name.trim() || userAccount?.displayName || `Oyuncu_${Math.floor(100 + Math.random() * 900)}`;
    onJoin(finalName, selectedAvatar, selectedColor, true, roomCode.trim().toUpperCase());
  };

  const randomizeGuestName = () => {
    setGuestName(`Misafir_${Math.floor(1000 + Math.random() * 9000)}`);
    setSelectedAvatar(PLAYER_AVATARS[Math.floor(Math.random() * PLAYER_AVATARS.length)]);
    setSelectedColor(PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)]);
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
      <header className="w-full max-w-7xl mx-auto px-3 sm:px-8 py-2.5 sm:py-5 flex items-center justify-between relative z-20">
        
        {/* Brand Logo: TURKISH PARADISE */}
        <div className="flex items-center gap-2 sm:gap-2.5 cursor-pointer group shrink-0">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-300 flex items-center justify-center text-sm sm:text-lg shadow-lg shadow-amber-500/30 group-hover:rotate-12 transition-transform duration-300 shrink-0">
            🎲
          </div>
          <div className="flex flex-col text-left">
            <span className="font-['Cinzel',serif] text-xs sm:text-lg font-black tracking-wider text-white flex items-center gap-1">
              <span>TURKISH</span>
              <span className="bg-gradient-to-r from-amber-300 via-amber-400 to-amber-200 bg-clip-text text-transparent">PARADISE</span>
            </span>
          </div>
        </div>

        {/* Center Nav Links */}
        <nav className="hidden md:flex items-center gap-8 text-sm font-semibold text-slate-300">
          <button
            onClick={() => setActiveModal(null)}
            className="text-amber-400 font-bold border-b-2 border-amber-400 pb-1 cursor-pointer"
          >
            Ana Sayfa
          </button>
          <button
            onClick={() => setActiveModal('rules')}
            className="hover:text-white transition pb-1 cursor-pointer"
          >
            Nasıl Oynanır?
          </button>
          <button
            onClick={() => setActiveModal('features')}
            className="hover:text-white transition pb-1 cursor-pointer"
          >
            Özellikler
          </button>
          <button
            onClick={() => setActiveModal('community')}
            className="hover:text-white transition pb-1 cursor-pointer"
          >
            Topluluk
          </button>
        </nav>

        {/* Right User Profile / Settings */}
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          {userAccount ? (
            <button
              onClick={() => setIsProfileModalOpen(true)}
              className="flex items-center gap-1.5 sm:gap-2.5 bg-slate-900/90 hover:bg-slate-800/90 border border-amber-500/30 hover:border-amber-400 rounded-xl sm:rounded-2xl p-1 sm:py-1.5 sm:px-3.5 shadow-lg transition cursor-pointer group shrink-0"
              title="Profil ve İstatistikleri Görüntüle"
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
                <p className="text-xs font-black text-white group-hover:text-amber-300 transition leading-none">
                  {userAccount.displayName}
                </p>
                <div className="flex items-center gap-1 mt-0.5">
                  <Trophy className="w-3 h-3 text-amber-400" />
                  <span className="text-[10px] text-amber-400 font-bold">
                    {userAccount.stats?.gamesWon || 0} Zafer
                  </span>
                </div>
              </div>
            </button>
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
              <span className="hidden xs:inline">Google ile Giriş</span>
              <span className="xs:hidden inline">Giriş Yap</span>
            </button>
          )}

          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-1.5 sm:p-2 rounded-xl bg-slate-900/80 border border-slate-800 text-slate-300 hover:text-white transition cursor-pointer shrink-0"
            title="Ses"
          >
            {soundEnabled ? <Volume2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400" /> : <VolumeX className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-500" />}
          </button>

          <button className="hidden sm:flex p-2 rounded-xl bg-slate-900/80 border border-slate-800 text-slate-300 hover:text-white transition cursor-pointer shrink-0" title="Tema">
            <Sun className="w-4 h-4 text-amber-400" />
          </button>

          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs font-bold text-slate-200 cursor-pointer shrink-0">
            <span>🇹🇷</span>
            <span>TR</span>
            <span className="text-[10px] text-slate-400">⌵</span>
          </div>
        </div>

      </header>

      {/* 2. Main Content Area */}
      <main className={`w-full max-w-7xl mx-auto px-3 sm:px-8 py-2 sm:py-6 flex-1 relative z-20 ${
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
                <span>Çevrimiçi Çok Oyunculu & Arkadaş Odaları</span>
              </div>
              <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white leading-tight">
                Türkiye <br className="hidden sm:inline" />
                Senin <span className="bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-400 bg-clip-text text-transparent">Oyun Alanın</span>
              </h1>
              <p className="text-slate-300 text-xs sm:text-base font-medium max-w-md mx-auto lg:mx-0 pt-1 sm:pt-2 leading-relaxed">
                Şehirleri al, yatırımlarını büyüt, rakiplerini geride bırak. Strateji, ticaret ve eğlence bir arada!
              </p>
            </div>

            {/* Feature List with Gold Icons (Desktop view) */}
            <div className="hidden lg:grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2">
              <div className="flex items-center gap-3 bg-[#0a1124]/60 p-2.5 rounded-2xl border border-slate-800/80 backdrop-blur-sm">
                <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                  <TrendingUp className="w-4 h-4" />
                </div>
                <span className="text-sm font-bold text-slate-200">Strateji Kur</span>
              </div>

              <div className="flex items-center gap-3 bg-[#0a1124]/60 p-2.5 rounded-2xl border border-slate-800/80 backdrop-blur-sm">
                <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                  <Handshake className="w-4 h-4" />
                </div>
                <span className="text-sm font-bold text-slate-200">Şehirleri Fethet</span>
              </div>

              <div className="flex items-center gap-3 bg-[#0a1124]/60 p-2.5 rounded-2xl border border-slate-800/80 backdrop-blur-sm">
                <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                  <Coins className="w-4 h-4" />
                </div>
                <span className="text-sm font-bold text-slate-200">Yatırımını Büyüt</span>
              </div>

              <div className="flex items-center gap-3 bg-[#0a1124]/60 p-2.5 rounded-2xl border border-slate-800/80 backdrop-blur-sm">
                <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                  <Users className="w-4 h-4" />
                </div>
                <span className="text-sm font-bold text-slate-200">Arkadaşlarınla Oyna</span>
              </div>
            </div>

            {/* Cursive Quote Bottom Left (Desktop view) */}
            <div className="hidden lg:block pt-2">
              <p className="font-['Caveat',cursive] text-2xl sm:text-3xl text-amber-200/90 tracking-wide drop-shadow">
                "Bu topraklarda her şehir bir hikaye..."
              </p>
            </div>

          </div>
        )}

        {/* Right Hero Section / Centered Room Lobby Card */}
        <div className={hasJoined ? 'w-full max-w-lg mx-auto relative' : 'lg:col-span-6 flex flex-col items-center lg:items-end relative w-full'}>
          
          {/* Cursive Quote Top Right */}
          {!hasJoined && (
            <div className="hidden lg:block absolute -top-8 right-6 pointer-events-none">
              <p className="font-['Caveat',cursive] text-2xl text-amber-200/90 tracking-wide drop-shadow text-right">
                Daha fazla şehir, <br />
                daha fazla fırsat.
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
                    <p className="text-[10px] text-amber-400 font-bold mt-0.5">Oyun Bekleme Odası</p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 bg-[#070b14] border border-amber-500/40 px-2.5 py-1 rounded-xl shadow-inner">
                  <span className="text-[9px] uppercase font-black text-slate-400">Oda:</span>
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
                    Büyük Düşün, Tüm Türkiye Senin Olsun!
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
                      <Share2 className="w-3.5 h-3.5" /> Arkadaşlarını Davet Et
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                      Oda Kodu: <strong className="text-white">{settings.roomCode || roomCode}</strong>
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={copyRoomCode}
                      className="flex-1 flex items-center justify-center gap-1 py-1.5 px-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 hover:text-white transition text-xs font-bold cursor-pointer"
                    >
                      {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-amber-400" />}
                      <span>{copiedCode ? 'Kod Kopyalandı!' : 'Kodu Kopyala'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={copyInviteLink}
                      className="flex-1 flex items-center justify-center gap-1 py-1.5 px-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 hover:text-white transition text-xs font-bold cursor-pointer"
                    >
                      {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5 text-sky-400" />}
                      <span>{copiedLink ? 'Link Kopyalandı!' : 'Davet Linki'}</span>
                    </button>
                  </div>
                </div>

                {/* 2. Host Game Rules & Options (Kurucu Oyun Ayarları) */}
                {isHost && (
                  <div className="bg-[#070b14]/90 border border-slate-800 rounded-2xl p-3 text-left space-y-2.5">
                    <div className="flex items-center justify-between border-b border-slate-800/80 pb-1.5">
                      <span className="text-xs font-black text-amber-400 flex items-center gap-1.5">
                        <Sliders className="w-3.5 h-3.5" /> Oyun Seçenekleri & Kuralları
                      </span>
                      <span className="text-[9px] bg-amber-500/20 text-amber-300 font-bold px-1.5 py-0.5 rounded border border-amber-500/30">
                        Oda Sahibi
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      {/* Starting Money */}
                      <div>
                        <label className="text-slate-400 font-bold text-[10px] block mb-1">
                          Başlangıç Parası
                        </label>
                        <select
                          value={settings.startingMoney}
                          onChange={(e) => onUpdateSettings({ ...settings, startingMoney: Number(e.target.value) })}
                          className="w-full bg-slate-900 border border-slate-700/80 rounded-lg py-1 px-2 text-xs text-white font-bold outline-none cursor-pointer"
                        >
                          <option value={1000}>1.000 ₺ (Hızlı)</option>
                          <option value={1500}>1.500 ₺ (Standart)</option>
                          <option value={2000}>2.000 ₺ (Zengin)</option>
                          <option value={2500}>2.500 ₺ (Mega)</option>
                          <option value={3000}>3.000 ₺ (Ultra)</option>
                        </select>
                      </div>

                      {/* Pass GO Salary */}
                      <div>
                        <label className="text-slate-400 font-bold text-[10px] block mb-1">
                          Tur Maaşı
                        </label>
                        <select
                          value={settings.passGoSalary}
                          onChange={(e) => onUpdateSettings({ ...settings, passGoSalary: Number(e.target.value) })}
                          className="w-full bg-slate-900 border border-slate-700/80 rounded-lg py-1 px-2 text-xs text-white font-bold outline-none cursor-pointer"
                        >
                          <option value={100}>100 ₺</option>
                          <option value={200}>200 ₺ (Standart)</option>
                          <option value={300}>300 ₺</option>
                          <option value={400}>400 ₺</option>
                        </select>
                      </div>

                      {/* First Lap Buy Limit */}
                      <div>
                        <label className="text-slate-400 font-bold text-[10px] block mb-1">
                          İlk Tur Alım
                        </label>
                        <select
                          value={settings.firstLapBuyLimit}
                          onChange={(e) => onUpdateSettings({ ...settings, firstLapBuyLimit: Number(e.target.value) })}
                          className="w-full bg-slate-900 border border-slate-700/80 rounded-lg py-1 px-2 text-xs text-amber-300 font-bold outline-none cursor-pointer"
                        >
                          <option value={0}>Sınırsız (Klasik)</option>
                          <option value={1}>1 Adet Yer</option>
                          <option value={2}>2 Adet Yer</option>
                          <option value={3}>3 Adet Yer</option>
                          <option value={4}>4 Adet Yer</option>
                        </select>
                      </div>

                      {/* Bot Difficulty */}
                      <div>
                        <label className="text-slate-400 font-bold text-[10px] block mb-1">
                          Bot Zorluğu
                        </label>
                        <select
                          value={settings.botDifficulty}
                          onChange={(e) => onUpdateSettings({ ...settings, botDifficulty: e.target.value as BotDifficulty })}
                          className="w-full bg-slate-900 border border-slate-700/80 rounded-lg py-1 px-2 text-xs text-white font-bold outline-none cursor-pointer"
                        >
                          <option value="easy">🟢 Kolay Bot</option>
                          <option value="medium">🟡 Orta Bot</option>
                          <option value="hard">🔴 Zor Bot</option>
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
                      <span>Oyuncular ({players.length}/6)</span>
                    </div>

                    {/* Bot Add Buttons with difficulty */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => onAddBot('easy')}
                        disabled={players.length >= 6}
                        className="bg-emerald-500/10 hover:bg-emerald-500/20 text-[10px] font-bold px-1.5 sm:px-2 py-1 rounded-lg border border-emerald-500/30 text-emerald-400 transition disabled:opacity-40 cursor-pointer active:scale-95"
                        title="Kolay Bot Ekle"
                      >
                        + Kolay
                      </button>
                      <button
                        onClick={() => onAddBot('medium')}
                        disabled={players.length >= 6}
                        className="bg-amber-500/10 hover:bg-amber-500/20 text-[10px] font-bold px-1.5 sm:px-2 py-1 rounded-lg border border-amber-500/30 text-amber-300 transition disabled:opacity-40 cursor-pointer active:scale-95"
                        title="Orta Bot Ekle"
                      >
                        + Orta
                      </button>
                      <button
                        onClick={() => onAddBot('hard')}
                        disabled={players.length >= 6}
                        className="bg-rose-500/10 hover:bg-rose-500/20 text-[10px] font-bold px-1.5 sm:px-2 py-1 rounded-lg border border-rose-500/30 text-rose-400 transition disabled:opacity-40 cursor-pointer active:scale-95"
                        title="Zor Bot Ekle"
                      >
                        + Zor
                      </button>
                    </div>
                  </div>

                  {/* Player Items */}
                  <div className="space-y-1.5 max-h-40 overflow-y-auto pr-0.5">
                    {players.map((p, index) => (
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
                                SİZ
                              </span>
                            )}
                            {p.isBot && (
                              <span className="text-[8px] bg-slate-800 text-slate-300 font-bold px-1.5 py-0.5 rounded border border-slate-700 shrink-0">
                                {p.botDifficulty === 'hard' ? '🔴 ZOR' : p.botDifficulty === 'easy' ? '🟢 KOLAY' : '🟡 ORTA'}
                              </span>
                            )}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {index === 0 && (
                            <span className="flex items-center gap-1 text-[9px] sm:text-[10px] text-amber-400 font-bold bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md">
                              <Shield className="w-3 h-3" /> Kurucu
                            </span>
                          )}

                          {/* Host can remove bot or kick player */}
                          {isHost && index !== 0 && (
                            <button
                              type="button"
                              onClick={() => onRemovePlayer?.(p.id)}
                              className="flex items-center gap-1 bg-rose-500/15 hover:bg-rose-500/30 text-rose-400 border border-rose-500/30 rounded-lg px-2 py-1 text-[10px] font-bold transition cursor-pointer active:scale-95"
                              title={p.isBot ? "Botu Odadan Sil" : "Oyuncuyu Odadan Çıkar"}
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>{p.isBot ? 'Sil' : 'Çıkar'}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 4. Host Start Button */}
                {isHost ? (
                  <button
                    onClick={onStartGame}
                    disabled={players.length < 2}
                    className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 hover:from-amber-300 hover:to-amber-500 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-600 text-slate-950 font-black py-3 sm:py-3.5 rounded-xl shadow-lg transition transform active:scale-95 text-sm cursor-pointer disabled:cursor-not-allowed"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    {players.length < 2 ? 'En Az 2 Oyuncu Gerekir' : 'Oyunu Başlat! 🚀'}
                  </button>
                ) : (
                  <div className="text-center py-2.5 bg-[#070b14] rounded-xl text-slate-400 text-xs font-semibold animate-pulse border border-slate-800">
                    Oda kurucusunun oyunu başlatması bekleniyor...
                  </div>
                )}

                {/* 5. Leave / Back to Main Button */}
                {onLeaveLobby && (
                  <button
                    type="button"
                    onClick={onLeaveLobby}
                    className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-[#070b14] hover:bg-slate-900 border border-slate-800 text-slate-400 hover:text-rose-400 transition text-xs font-bold cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Lobiden Ayrıl / Geri Dön</span>
                  </button>
                )}
              </div>
            ) : mode === 'guest' ? (
              /* Guest Play Mode Screen with Back Button */
              <form onSubmit={handleGuestSubmit} className="space-y-5 animate-fade-in">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                  <button
                    type="button"
                    onClick={() => setMode('main')}
                    className="flex items-center gap-1 text-slate-400 hover:text-amber-400 transition text-xs font-bold cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Geri Dön</span>
                  </button>
                  <span className="text-xs font-extrabold text-amber-400 uppercase tracking-wider">
                    Misafir Girişi
                  </span>
                </div>

                <div className="space-y-1.5 text-left">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-300">
                      Misafir Adınız
                    </label>
                    <button
                      type="button"
                      onClick={randomizeGuestName}
                      className="text-[11px] text-amber-400 hover:underline flex items-center gap-1 font-semibold cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3" /> Rastgele İsim
                    </button>
                  </div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                      <User className="w-4 h-4" />
                    </div>
                    <input
                      type="text"
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      maxLength={15}
                      required
                      className="w-full bg-[#070b14] border border-slate-800 focus:border-amber-400 focus:ring-1 focus:ring-amber-400 text-white rounded-xl pl-10 pr-4 py-3 text-sm font-semibold placeholder-slate-600 outline-none transition"
                    />
                  </div>
                </div>

                {/* Token / Avatar Picker */}
                <div className="space-y-1.5 text-left">
                  <label className="text-xs font-bold text-slate-300">
                    Piyonunuzu Seçin
                  </label>
                  <div className="grid grid-cols-6 gap-2">
                    {PLAYER_AVATARS.map((avatar) => (
                      <button
                        key={avatar}
                        type="button"
                        onClick={() => setSelectedAvatar(avatar)}
                        className={`text-xl p-2.5 rounded-xl border text-center transition transform active:scale-95 cursor-pointer ${
                          selectedAvatar === avatar
                            ? 'bg-amber-500/20 border-amber-400 ring-2 ring-amber-400/50 shadow-lg'
                            : 'bg-[#070b14] border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        {avatar}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Color Picker (6 Colors) */}
                <div className="space-y-1.5 text-left">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-300 flex items-center gap-1">
                      <Palette className="w-3.5 h-3.5 text-amber-400" />
                      <span>Renginizi Seçin</span>
                    </label>
                    <span className="text-[10px] text-slate-400 font-semibold">
                      {PLAYER_COLORS.filter(c => !takenColors.includes(c)).length} Müsait
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
                          title={isTaken ? 'Bu renk başka bir oyuncu/bot tarafından alındı' : undefined}
                        >
                          {isSelected && !isTaken && <Check className="w-3.5 h-3.5 text-white drop-shadow stroke-[3]" />}
                          {isTaken && <span className="text-[8px] font-black text-white/90">DOLU</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 hover:from-amber-300 hover:to-amber-500 text-slate-950 font-black py-3.5 rounded-xl shadow-xl shadow-amber-500/20 transition transform active:scale-95 text-base tracking-wide flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Gamepad2 className="w-5 h-5" />
                  <span>Misafir Olarak Başla</span>
                </button>
              </form>
            ) : mode === 'friend' ? (
              /* Join Friend Screen with Back Button */
              <form onSubmit={handleFriendSubmit} className="space-y-5 animate-fade-in">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                  <button
                    type="button"
                    onClick={() => setMode('main')}
                    className="flex items-center gap-1 text-slate-400 hover:text-amber-400 transition text-xs font-bold cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Geri Dön</span>
                  </button>
                  <span className="text-xs font-extrabold text-sky-400 uppercase tracking-wider">
                    Arkadaş Odasına Katıl
                  </span>
                </div>

                {isInviteLink && (
                  <div className="bg-sky-500/15 border border-sky-500/40 rounded-2xl p-3 text-left flex items-center gap-2.5 shadow-lg shadow-sky-500/10">
                    <span className="text-xl">🎉</span>
                    <div className="text-xs">
                      <p className="font-black text-sky-300">Arkadaş Daveti Algılandı!</p>
                      <p className="text-slate-300 text-[11px] mt-0.5">
                        <strong className="text-white font-mono">{roomCode}</strong> odasına davet edildiniz. Adınızı girip hemen katılın.
                      </p>
                    </div>
                  </div>
                )}

                {/* Room Code */}
                <div className="space-y-1.5 text-left">
                  <label className="text-xs font-bold text-slate-300">
                    Oda Kodu
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                      <KeyRound className="w-4 h-4" />
                    </div>
                    <input
                      type="text"
                      value={roomCode}
                      onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                      placeholder="Örn: TR-1001"
                      maxLength={10}
                      required
                      className="w-full bg-[#070b14] border border-slate-800 focus:border-sky-400 focus:ring-1 focus:ring-sky-400 text-white font-mono rounded-xl pl-10 pr-4 py-3 text-sm font-semibold placeholder-slate-600 outline-none transition uppercase tracking-wider"
                    />
                  </div>
                </div>

                {/* Player Name */}
                <div className="space-y-1.5 text-left">
                  <label className="text-xs font-bold text-slate-300">
                    Oyuncu Adınız
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                      <User className="w-4 h-4" />
                    </div>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Örn: Mehmet"
                      maxLength={15}
                      required
                      className="w-full bg-[#070b14] border border-slate-800 focus:border-sky-400 focus:ring-1 focus:ring-sky-400 text-white rounded-xl pl-10 pr-4 py-3 text-sm font-semibold placeholder-slate-600 outline-none transition"
                    />
                  </div>
                </div>

                {/* Avatar Picker */}
                <div className="space-y-1.5 text-left">
                  <label className="text-xs font-bold text-slate-300">
                    Piyonunuzu Seçin
                  </label>
                  <div className="grid grid-cols-6 gap-2">
                    {PLAYER_AVATARS.map((avatar) => (
                      <button
                        key={avatar}
                        type="button"
                        onClick={() => setSelectedAvatar(avatar)}
                        className={`text-xl p-2.5 rounded-xl border text-center transition transform active:scale-95 cursor-pointer ${
                          selectedAvatar === avatar
                            ? 'bg-sky-500/20 border-sky-400 ring-2 ring-sky-400/50 shadow-lg'
                            : 'bg-[#070b14] border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        {avatar}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Color Picker (6 Colors) */}
                <div className="space-y-1.5 text-left">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-300 flex items-center gap-1">
                      <Palette className="w-3.5 h-3.5 text-sky-400" />
                      <span>Renginizi Seçin</span>
                    </label>
                    <span className="text-[10px] text-slate-400 font-semibold">
                      {PLAYER_COLORS.filter(c => !takenColors.includes(c)).length} Müsait
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
                          title={isTaken ? 'Bu renk başka bir oyuncu/bot tarafından alındı' : undefined}
                        >
                          {isSelected && !isTaken && <Check className="w-3.5 h-3.5 text-white drop-shadow stroke-[3]" />}
                          {isTaken && <span className="text-[8px] font-black text-white/90">DOLU</span>}
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
                  <span>Odaya Katıl 🚀</span>
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
                    <span className="text-sm font-extrabold tracking-wide">Google ile Giriş Yap</span>
                  </button>
                )}

                {/* Divider */}
                {!userAccount && (
                  <div className="relative flex items-center justify-center my-2">
                    <div className="border-t border-slate-800 w-full" />
                    <span className="bg-[#0e1628] px-3 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                      veya
                    </span>
                  </div>
                )}

                {/* Form For Joining / Creating Room */}
                <form onSubmit={handleMainSubmit} className="space-y-4">
                  
                  {/* Player Name Input */}
                  <div className="space-y-1.5 text-left">
                    <label className="text-xs font-bold text-slate-300">
                      {userAccount ? 'Oyuncu Profiliniz' : 'Oyuncu Adınız'}
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                        <User className="w-4 h-4" />
                      </div>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Örn: Ahmet"
                        maxLength={15}
                        required
                        className="w-full bg-[#070b14] border border-slate-800 focus:border-amber-400 focus:ring-1 focus:ring-amber-400 text-white rounded-xl pl-10 pr-4 py-3 text-sm font-semibold placeholder-slate-600 outline-none transition"
                      />
                    </div>
                  </div>

                  {/* Token / Avatar Picker */}
                  <div className="space-y-1.5 text-left">
                    <label className="text-xs font-bold text-slate-300">
                      Piyonunuzu Seçin
                    </label>
                    <div className="grid grid-cols-6 gap-2">
                      {PLAYER_AVATARS.map((avatar) => (
                        <button
                          key={avatar}
                          type="button"
                          onClick={() => setSelectedAvatar(avatar)}
                          className={`text-xl p-2.5 rounded-xl border text-center transition transform active:scale-95 cursor-pointer ${
                            selectedAvatar === avatar
                              ? 'bg-amber-500/20 border-amber-400 ring-2 ring-amber-400/50 shadow-lg'
                              : 'bg-[#070b14] border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          {avatar}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Color Picker (6 Colors) */}
                  <div className="space-y-1.5 text-left">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-300 flex items-center gap-1">
                        <Palette className="w-3.5 h-3.5 text-amber-400" />
                        <span>Renginizi Seçin</span>
                      </label>
                      <span className="text-[10px] text-slate-400 font-semibold">
                        {PLAYER_COLORS.filter(c => !takenColors.includes(c)).length} Müsait
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
                            title={isTaken ? 'Bu renk başka bir oyuncu/bot tarafından alındı' : undefined}
                          >
                            {isSelected && !isTaken && <Check className="w-3.5 h-3.5 text-white drop-shadow stroke-[3]" />}
                            {isTaken && <span className="text-[8px] font-black text-white/90">DOLU</span>}
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
                    <span>Oda Kur & Oyuna Gir</span>
                    <span className="text-lg">🎲</span>
                  </button>

                  {/* Secondary Quick Action Buttons */}
                  <div className="grid grid-cols-2 gap-2.5 pt-1">
                    <button
                      type="button"
                      onClick={() => setMode('guest')}
                      className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-[#070b14] hover:bg-slate-900 border border-slate-800 text-slate-300 hover:text-white transition text-xs font-bold cursor-pointer"
                    >
                      <Gamepad2 className="w-3.5 h-3.5 text-amber-400" />
                      <span>Misafir Oyna</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setMode('friend')}
                      className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-[#070b14] hover:bg-slate-900 border border-slate-800 text-slate-300 hover:text-white transition text-xs font-bold cursor-pointer"
                    >
                      <Users className="w-3.5 h-3.5 text-sky-400" />
                      <span>Arkadaşına Katıl</span>
                    </button>
                  </div>

                </form>

                {/* Footer Tagline */}
                <div className="pt-2 text-[10px] font-semibold text-slate-500 tracking-wider uppercase text-center">
                  TURKISH PARADISE • Strateji • Ticaret • Eğlence • Türkiye
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
                  <span className="text-xs font-bold text-slate-200">Strateji Kur</span>
                </div>

                <div className="flex items-center gap-2.5 bg-[#0a1124]/70 p-2.5 rounded-2xl border border-slate-800/80 backdrop-blur-sm">
                  <div className="w-7 h-7 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                    <Handshake className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-xs font-bold text-slate-200">Şehirleri Fethet</span>
                </div>

                <div className="flex items-center gap-2.5 bg-[#0a1124]/70 p-2.5 rounded-2xl border border-slate-800/80 backdrop-blur-sm">
                  <div className="w-7 h-7 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                    <Coins className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-xs font-bold text-slate-200">Yatırımını Büyüt</span>
                </div>

                <div className="flex items-center gap-2.5 bg-[#0a1124]/70 p-2.5 rounded-2xl border border-slate-800/80 backdrop-blur-sm">
                  <div className="w-7 h-7 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                    <Users className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-xs font-bold text-slate-200">Arkadaşlarınla Oyna</span>
                </div>
              </div>

              <p className="font-['Caveat',cursive] text-xl text-amber-200/90 text-center tracking-wide">
                "Bu topraklarda her şehir bir hikaye..."
              </p>
            </div>
          )}

        </div>

      </main>

      {/* 3. Footer */}
      <footer className="w-full max-w-7xl mx-auto px-4 sm:px-8 py-4 text-center text-xs font-semibold text-slate-500 relative z-20">
        © 2026 Turkish Paradise - Tüm Hakları Saklıdır. Türkiye Temalı Web Masa Oyunu.
      </footer>

      {/* Profile & Stats Modal */}
      {isProfileModalOpen && userAccount && (
        <ProfileModal
          userAccount={userAccount}
          onClose={() => setIsProfileModalOpen(false)}
          onLogout={onLogout}
        />
      )}

      {/* Info Modals (Nasıl Oynanır, Özellikler, Topluluk) */}
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
                  <HelpCircle className="w-5 h-5" /> Nasıl Oynanır?
                </h3>
                <div className="text-xs text-slate-300 space-y-2 leading-relaxed">
                  <p>• <strong>Zar At:</strong> Sıranız geldiğinde çift zar atarak haritada ilerleyin.</p>
                  <p>• <strong>Şehirleri Satın Al:</strong> Sahipsiz şehirlere gelerek satın alın ve portföyünüzü kurun.</p>
                  <p>• <strong>Renk Serisi Kuralı:</strong> Bir renkteki tüm şehirlere sahip olmadan ev dikemezsiniz!</p>
                  <p>• <strong>İskeleler:</strong> 4 iskeleyi toplayarak kira gelirinizi katlayın (50₺'den 200₺'ye).</p>
                  <p>• <strong>Kodes:</strong> Kodese düşerseniz 100₺ kefalet ödeyerek veya çift zar atarak çıkabilirsiniz.</p>
                </div>
              </>
            )}

            {activeModal === 'features' && (
              <>
                <h3 className="text-xl font-black text-amber-400 flex items-center gap-2">
                  <Sparkles className="w-5 h-5" /> Turkish Paradise Özellikleri
                </h3>
                <div className="text-xs text-slate-300 space-y-2 leading-relaxed">
                  <p>• 26 Türkiye Şehri & Gerçek Manzara Kartları</p>
                  <p>• 4 Vapur İskelesi (Kadıköy, Kabataş, Beşiktaş, Üsküdar)</p>
                  <p>• 15 Kartlık Şans ve Kamu Fonu Havuzu</p>
                  <p>• Zeki Yapay Zeka Botları (Kolay, Orta, Zor)</p>
                  <p>• Hesap Hareketleri & Finansal Raporlama</p>
                  <p>• Canlı Sohbet & Oyuncu Takas Sistemi</p>
                </div>
              </>
            )}

            {activeModal === 'community' && (
              <>
                <h3 className="text-xl font-black text-amber-400 flex items-center gap-2">
                  <Globe className="w-5 h-5" /> Topluluk
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Turkish Paradise oyuncu topluluğuna katılın, arkadaşlarınızla özel odalarda rekabet edin ve Türkiye'nin en büyük emlak kralı olun!
                </p>
              </>
            )}

            <button
              onClick={() => setActiveModal(null)}
              className="w-full bg-slate-800 hover:bg-slate-700 text-amber-400 font-bold py-2.5 rounded-xl transition text-xs mt-2 cursor-pointer"
            >
              Kapat
            </button>
          </div>
        </div>
      )}

    </div>
  );
};
