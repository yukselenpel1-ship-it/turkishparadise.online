import React, { useState } from 'react';
import { Player, GameSettings, BotDifficulty } from '../types/game';
import { PLAYER_AVATARS, PLAYER_COLORS } from '../engine/gameEngine';
import {
  User,
  Gamepad2,
  Users,
  Play,
  Bot,
  Crown,
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
  Palette
} from 'lucide-react';

interface LobbyProps {
  players: Player[];
  myPlayerId: string | null;
  settings: GameSettings;
  onUpdateSettings: (newSettings: GameSettings) => void;
  onJoin: (name: string, avatar: string, color: string) => void;
  onAddBot: (difficulty?: BotDifficulty) => void;
  onStartGame: () => void;
  onLeaveLobby?: () => void;
}

export const Lobby: React.FC<LobbyProps> = ({
  players,
  myPlayerId,
  settings,
  onUpdateSettings,
  onJoin,
  onAddBot,
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

  const hasJoined = players.some((p) => p.id === myPlayerId);
  const me = players.find((p) => p.id === myPlayerId);
  const isHost = me?.isHost || (players.length > 0 && players[0].id === myPlayerId);

  const handleMainSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onJoin(name.trim(), selectedAvatar, selectedColor);
    }
  };

  const handleGuestSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (guestName.trim()) {
      onJoin(guestName.trim(), selectedAvatar, selectedColor);
    }
  };

  const handleFriendSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onJoin(name.trim(), selectedAvatar, selectedColor);
    } else {
      onJoin(`Oyuncu_${Math.floor(100 + Math.random() * 900)}`, selectedAvatar, selectedColor);
    }
  };

  const randomizeGuestName = () => {
    setGuestName(`Misafir_${Math.floor(1000 + Math.random() * 9000)}`);
    setSelectedAvatar(PLAYER_AVATARS[Math.floor(Math.random() * PLAYER_AVATARS.length)]);
    setSelectedColor(PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)]);
  };


  const copyRoomCode = () => {
    navigator.clipboard.writeText(settings.roomCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const copyInviteLink = () => {
    const inviteUrl = `${window.location.origin}?room=${settings.roomCode}`;
    navigator.clipboard.writeText(inviteUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div className="min-h-screen w-full bg-[#050811] text-white flex flex-col justify-between relative overflow-hidden select-none font-['Fredoka',sans-serif]">
      
      {/* Background Night Skyline with Istanbul / Bosphorus Mood Overlay */}
      <div className="absolute inset-0 z-0 opacity-25 pointer-events-none">
        <img
          src="https://images.unsplash.com/photo-1524231757912-21f4fe3a7200?auto=format&fit=crop&w=2000&q=80"
          alt="Istanbul Skyline"
          className="w-full h-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#050811] via-[#050811]/80 to-[#050811]/90" />
      </div>

      {/* 1. Top Navbar Header */}
      <header className="w-full max-w-7xl mx-auto px-4 sm:px-8 py-5 flex items-center justify-between relative z-20">
        
        {/* Brand Logo */}
        <div className="flex items-center gap-2.5 cursor-pointer">
          <img
            src="/pococoly-logo.png"
            alt="POCOCOLY"
            className="h-8 sm:h-9 object-contain drop-shadow-md transition hover:scale-105"
          />
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

        {/* Right Settings / Controls */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-2 rounded-xl bg-slate-900/80 border border-slate-800 text-slate-300 hover:text-white transition cursor-pointer"
            title="Ses"
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
          </button>

          <button className="p-2 rounded-xl bg-slate-900/80 border border-slate-800 text-slate-300 hover:text-white transition cursor-pointer" title="Tema">
            <Sun className="w-4 h-4 text-amber-400" />
          </button>

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs font-bold text-slate-200 cursor-pointer">
            <span>🇹🇷</span>
            <span>TR</span>
            <span className="text-[10px] text-slate-400">⌵</span>
          </div>
        </div>

      </header>

      {/* 2. Main Hero Split Content */}
      <main className="w-full max-w-7xl mx-auto px-4 sm:px-8 py-4 sm:py-8 flex-1 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center relative z-20">
        
        {/* Left Hero Section: Headline & Features */}
        <div className="lg:col-span-6 space-y-6 text-left">
          
          <div className="space-y-2">
            <h1 className="text-4xl sm:text-6xl font-black tracking-tight text-white leading-tight">
              Şehirler <br />
              Sadece Yer Değil, <br />
              <span className="bg-gradient-to-r from-amber-400 via-amber-300 to-rose-400 bg-clip-text text-transparent">
                Fırsattır.
              </span>
            </h1>
            <p className="text-slate-400 text-sm sm:text-base font-medium max-w-md pt-2">
              Türkiye'nin 26 şehrini al, vapur iskelelerine hükmet, yatırımlarını büyüt ve rakiplerini geride bırak.
            </p>
          </div>

          {/* Feature List with Gold Icons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <Crown className="w-4 h-4" />
              </div>
              <span className="text-sm font-bold text-slate-200">Strateji Kur</span>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <Handshake className="w-4 h-4" />
              </div>
              <span className="text-sm font-bold text-slate-200">Şehirleri Fethet</span>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <TrendingUp className="w-4 h-4" />
              </div>
              <span className="text-sm font-bold text-slate-200">Yatırımını Büyüt</span>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <Users className="w-4 h-4" />
              </div>
              <span className="text-sm font-bold text-slate-200">Arkadaşlarınla Oyna</span>
            </div>
          </div>

          {/* Cursive Quote */}
          <div className="pt-4">
            <p className="text-amber-400/80 font-serif italic text-base sm:text-lg">
              "Bu topraklarda her şehir bir hikaye..."
            </p>
          </div>

        </div>

        {/* Right Hero Section: Glassmorphism Login / Lobby Card */}
        <div className="lg:col-span-6 flex justify-center lg:justify-end">
          
          <div className="w-full max-w-md bg-[#0e1628]/90 border border-slate-800/90 rounded-[28px] p-6 sm:p-8 shadow-2xl backdrop-blur-xl relative overflow-hidden">
            
            {/* Top Glow Accent */}
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />

            {/* Card Header with Golden Logo */}
            <div className="text-center mb-6 flex flex-col items-center">
              <img
                src="/pococoly-logo.png"
                alt="POCOCOLY"
                className="h-10 sm:h-12 object-contain drop-shadow-[0_4px_10px_rgba(0,0,0,0.8)] filter brightness-105"
              />
              <p className="text-slate-400 text-xs font-semibold mt-1">
                Web Tabanlı Canlı Monopoly Oyunu
              </p>
            </div>

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
                      Oda Kodu: <strong className="text-white">{settings.roomCode}</strong>
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
                        <label className="text-slate-400 font-semibold block mb-1">
                          Başlangıç Parası:
                        </label>
                        <select
                          value={settings.startingMoney}
                          onChange={(e) => onUpdateSettings({ ...settings, startingMoney: Number(e.target.value) })}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-white font-bold outline-none cursor-pointer"
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
                        <label className="text-slate-400 font-semibold block mb-1">
                          Tur Maaşı:
                        </label>
                        <select
                          value={settings.passGoSalary}
                          onChange={(e) => onUpdateSettings({ ...settings, passGoSalary: Number(e.target.value) })}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-white font-bold outline-none cursor-pointer"
                        >
                          <option value={100}>100 ₺</option>
                          <option value={200}>200 ₺ (Standart)</option>
                          <option value={300}>300 ₺</option>
                          <option value={400}>400 ₺</option>
                        </select>
                      </div>

                      {/* First Lap Buy Limit (1, 2, 3, 4 veya Sınırsız) */}
                      <div>
                        <label className="text-slate-400 font-semibold block mb-1">
                          İlk Tur Alım Sınırı:
                        </label>
                        <select
                          value={settings.firstLapBuyLimit}
                          onChange={(e) => onUpdateSettings({ ...settings, firstLapBuyLimit: Number(e.target.value) })}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-amber-300 font-bold outline-none cursor-pointer"
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
                        <label className="text-slate-400 font-semibold block mb-1">
                          Bot Zorluk Seviyesi:
                        </label>
                        <select
                          value={settings.botDifficulty}
                          onChange={(e) => onUpdateSettings({ ...settings, botDifficulty: e.target.value as BotDifficulty })}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-white font-bold outline-none cursor-pointer"
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
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => onAddBot('easy')}
                        disabled={players.length >= 6}
                        className="bg-slate-900 hover:bg-slate-800 text-[10px] font-bold px-2 py-1 rounded-lg border border-slate-700 text-emerald-400 transition disabled:opacity-50 cursor-pointer"
                        title="Kolay Bot Ekle"
                      >
                        +🟢 Kolay
                      </button>
                      <button
                        onClick={() => onAddBot('medium')}
                        disabled={players.length >= 6}
                        className="bg-slate-900 hover:bg-slate-800 text-[10px] font-bold px-2 py-1 rounded-lg border border-slate-700 text-amber-400 transition disabled:opacity-50 cursor-pointer"
                        title="Orta Bot Ekle"
                      >
                        +🟡 Orta
                      </button>
                      <button
                        onClick={() => onAddBot('hard')}
                        disabled={players.length >= 6}
                        className="bg-slate-900 hover:bg-slate-800 text-[10px] font-bold px-2 py-1 rounded-lg border border-slate-700 text-rose-400 transition disabled:opacity-50 cursor-pointer"
                        title="Zor Bot Ekle"
                      >
                        +🔴 Zor
                      </button>
                    </div>
                  </div>

                  {/* Player Items */}
                  <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                    {players.map((p, index) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between bg-[#070b14] border border-slate-800 rounded-xl p-2"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{p.avatar}</span>
                          <span className="font-bold text-xs text-white flex items-center gap-1">
                            {p.name}
                            {p.id === myPlayerId && (
                              <span className="text-[8px] bg-rose-500 text-white font-black px-1 rounded">
                                SİZ
                              </span>
                            )}
                            {p.isBot && (
                              <span className="text-[8px] bg-emerald-500/20 text-emerald-400 font-bold px-1 rounded border border-emerald-500/30">
                                {p.botDifficulty === 'hard' ? '🔴 ZOR BOT' : p.botDifficulty === 'easy' ? '🟢 KOLAY BOT' : '🟡 ORTA BOT'}
                              </span>
                            )}
                          </span>
                        </div>

                        {index === 0 && (
                          <span className="flex items-center gap-1 text-[9px] text-amber-400 font-bold">
                            <Shield className="w-3 h-3" /> Kurucu
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* 4. Host Start Button */}
                {isHost ? (
                  <button
                    onClick={onStartGame}
                    disabled={players.length < 2}
                    className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-600 text-slate-950 font-black py-3.5 rounded-xl shadow-xl transition transform active:scale-95 text-sm cursor-pointer disabled:cursor-not-allowed"
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
                    <span className="text-[10px] text-slate-400 font-semibold">6 Renk</span>
                  </div>
                  <div className="grid grid-cols-6 gap-2">
                    {PLAYER_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setSelectedColor(color)}
                        className={`h-8 rounded-xl border-2 flex items-center justify-center transition transform active:scale-90 cursor-pointer ${
                          selectedColor === color
                            ? 'ring-2 ring-white scale-105 border-white shadow-lg'
                            : 'border-transparent opacity-80 hover:opacity-100'
                        }`}
                        style={{
                          backgroundColor: color,
                          boxShadow: selectedColor === color ? `0 0 10px ${color}` : undefined
                        }}
                      >
                        {selectedColor === color && <Check className="w-3.5 h-3.5 text-white drop-shadow stroke-[3]" />}
                      </button>
                    ))}
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
                    <span className="text-[10px] text-slate-400 font-semibold">6 Renk</span>
                  </div>
                  <div className="grid grid-cols-6 gap-2">
                    {PLAYER_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setSelectedColor(color)}
                        className={`h-8 rounded-xl border-2 flex items-center justify-center transition transform active:scale-90 cursor-pointer ${
                          selectedColor === color
                            ? 'ring-2 ring-white scale-105 border-white shadow-lg'
                            : 'border-transparent opacity-80 hover:opacity-100'
                        }`}
                        style={{
                          backgroundColor: color,
                          boxShadow: selectedColor === color ? `0 0 10px ${color}` : undefined
                        }}
                      >
                        {selectedColor === color && <Check className="w-3.5 h-3.5 text-white drop-shadow stroke-[3]" />}
                      </button>
                    ))}
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
              /* Default Main Join Form */
              <form onSubmit={handleMainSubmit} className="space-y-5">
                
                {/* Username Input */}
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
                    <span className="text-[10px] text-slate-400 font-semibold">6 Renk</span>
                  </div>
                  <div className="grid grid-cols-6 gap-2">
                    {PLAYER_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setSelectedColor(color)}
                        className={`h-8 rounded-xl border-2 flex items-center justify-center transition transform active:scale-90 cursor-pointer ${
                          selectedColor === color
                            ? 'ring-2 ring-white scale-105 border-white shadow-lg'
                            : 'border-transparent opacity-80 hover:opacity-100'
                        }`}
                        style={{
                          backgroundColor: color,
                          boxShadow: selectedColor === color ? `0 0 10px ${color}` : undefined
                        }}
                      >
                        {selectedColor === color && <Check className="w-3.5 h-3.5 text-white drop-shadow stroke-[3]" />}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Primary Button */}
                <button
                  type="submit"
                  className="w-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 hover:from-amber-300 hover:to-amber-500 text-slate-950 font-black py-3.5 rounded-xl shadow-xl shadow-amber-500/20 transition transform active:scale-95 text-base tracking-wide flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>Oyuna Katıl</span>
                  <span className="text-lg">🎲</span>
                </button>


                {/* Divider */}
                <div className="relative flex items-center justify-center my-3">
                  <div className="border-t border-slate-800 w-full" />
                  <span className="bg-[#0e1628] px-3 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                    veya devam et
                  </span>
                </div>

                {/* Secondary Quick Action Buttons */}
                <div className="grid grid-cols-2 gap-2.5">
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

                {/* Footer Tagline */}
                <div className="pt-2 text-[10px] font-semibold text-slate-500 tracking-wider uppercase text-center">
                  POCOCOLY • Strateji • Ticaret • Eğlence • Türkiye
                </div>

              </form>
            )}

          </div>

        </div>

      </main>

      {/* 3. Footer */}
      <footer className="w-full max-w-7xl mx-auto px-4 sm:px-8 py-4 text-center text-xs font-semibold text-slate-500 relative z-20">
        © 2026 Pococoly - Tüm Hakları Saklıdır. Türkiye Temalı Web Masa Oyunu.
      </footer>

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
                  <Sparkles className="w-5 h-5" /> Pococoly Özellikleri
                </h3>
                <div className="text-xs text-slate-300 space-y-2 leading-relaxed">
                  <p>• 26 Türkiye Şehri & Gerçek Manzara Kartları</p>
                  <p>• 4 Vapur İskelesi (Kadıköy, Kabataş, Beşiktaş, Üsküdar)</p>
                  <p>• 15 Kartlık Şans ve Kamu Fonu Havuzu</p>
                  <p>• Zeki Yapay Zeka Botları (Bot AI)</p>
                  <p>• Cloudflare & WebSocket Canlı Çok Oyunculu Altyapı</p>
                </div>
              </>
            )}

            {activeModal === 'community' && (
              <>
                <h3 className="text-xl font-black text-amber-400 flex items-center gap-2">
                  <Globe className="w-5 h-5" /> Topluluk
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Pococoly oyuncu topluluğuna katılın, arkadaşlarınızla özel odalarda rekabet edin ve Türkiye'nin en büyük emlak kralı olun!
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
