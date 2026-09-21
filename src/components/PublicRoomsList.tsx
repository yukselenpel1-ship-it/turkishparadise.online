import React, { useState, useEffect } from 'react';
import { PublicRoomInfo } from '../types/game';
import { subscribeToPublicRooms, requestPublicRoomsRefresh } from '../services/publicRoomsService';
import { useLanguage } from '../i18n/LanguageContext';
import {
  Globe,
  Users,
  Search,
  RefreshCw,
  ArrowLeft,
  Crown,
  Play,
  Eye,
  Plus,
  Radio,
  Coins
} from 'lucide-react';

interface PublicRoomsListProps {
  onJoinRoom: (roomId: string) => void;
  onBackToMain: () => void;
  onCreateRoom: () => void;
}

export const PublicRoomsList: React.FC<PublicRoomsListProps> = ({
  onJoinRoom,
  onBackToMain,
  onCreateRoom,
}) => {
  const { t, formatMoney, language } = useLanguage();
  const [rooms, setRooms] = useState<PublicRoomInfo[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeToPublicRooms((updatedRooms) => {
      setRooms(updatedRooms);
    });
    return () => unsubscribe();
  }, []);

  const handleRefresh = () => {
    setIsRefreshing(true);
    requestPublicRoomsRefresh();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const filteredRooms = rooms.filter((r) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      r.roomId.toLowerCase().includes(q) ||
      r.hostName.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4 animate-fade-in select-none">
      
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
        <button
          type="button"
          onClick={onBackToMain}
          className="flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-white transition cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{t('backToMenu')}</span>
        </button>

        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-[11px] font-black text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-full">
            <Radio className="w-3 h-3 animate-pulse text-emerald-400" />
            <span>{filteredRooms.length} {language === 'en' ? 'Live Rooms' : 'Canlı Oda'}</span>
          </span>

          <button
            type="button"
            onClick={handleRefresh}
            className={`p-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition cursor-pointer ${
              isRefreshing ? 'animate-spin text-amber-400' : ''
            }`}
            title="Yenile"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Search Input */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
          <Search className="w-3.5 h-3.5" />
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={language === 'en' ? 'Search by room code or host...' : 'Oda kodu veya kurucu adı ara...'}
          className="w-full bg-[#070b14] border border-slate-800 focus:border-amber-400 text-white rounded-xl pl-9 pr-3 py-2 text-xs font-semibold placeholder-slate-600 outline-none transition"
        />
      </div>

      {/* Rooms List */}
      <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1 min-h-[160px]">
        {filteredRooms.length === 0 ? (
          <div className="text-center py-8 px-4 bg-[#070b14]/60 rounded-2xl border border-slate-800/80 space-y-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-xl mx-auto text-amber-400">
              🌐
            </div>
            <div>
              <p className="text-xs font-bold text-slate-200">
                {language === 'en' ? 'No active public rooms found' : 'Şu anda açık oda bulunamadı'}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {language === 'en'
                  ? 'Create your own room and invite other players to join!'
                  : 'Kendi odanızı kurarak ilk siz başlatın ve oyuncuları davet edin!'}
              </p>
            </div>
            <button
              type="button"
              onClick={onCreateRoom}
              className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black px-4 py-2 rounded-xl text-xs shadow-lg transition transform active:scale-95 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 stroke-[3]" />
              <span>{t('createAndJoinRoom')}</span>
            </button>
          </div>
        ) : (
          filteredRooms.map((room) => {
            const isFull = room.playerCount >= room.maxPlayers;
            const isPlaying = room.phase === 'PLAYING';

            return (
              <div
                key={room.roomId}
                className="bg-[#070b14] hover:bg-[#0c1426] border border-slate-800 hover:border-amber-500/40 rounded-2xl p-3 transition flex items-center justify-between gap-3 shadow-md group"
              >
                {/* Left: Host info & Room code */}
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-slate-900 border border-slate-700/80 flex items-center justify-center text-xl shrink-0">
                    {room.hostAvatar || '👑'}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-extrabold text-xs text-white truncate max-w-[110px]">
                        {room.hostName}
                      </span>
                      <span className="text-[9px] bg-amber-500/20 text-amber-300 font-mono font-black px-1.5 py-0.2 rounded border border-amber-500/30 shrink-0">
                        {room.roomId}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-1">
                      <span className="flex items-center gap-0.5 text-amber-300 font-bold">
                        <Coins className="w-2.5 h-2.5 text-amber-400" />
                        {formatMoney(room.startingMoney)}
                      </span>
                      <span>•</span>
                      <span className={`font-bold ${isPlaying ? 'text-sky-400' : 'text-emerald-400'}`}>
                        {isPlaying
                          ? (language === 'en' ? 'In Game' : 'Oyunda 🎲')
                          : (language === 'en' ? 'In Lobby' : 'Lobide ⏳')}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right: Player count & Action button */}
                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-right">
                    <div className="flex items-center gap-1 text-[11px] font-black text-slate-300">
                      <Users className="w-3.5 h-3.5 text-slate-400" />
                      <span>{room.playerCount}/{room.maxPlayers}</span>
                    </div>
                    {room.botCount > 0 && (
                      <span className="text-[9px] text-slate-500 block">
                        +{room.botCount} {language === 'en' ? 'Bot' : 'Bot'}
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => onJoinRoom(room.roomId)}
                    className={`py-1.5 px-3 rounded-xl font-black text-xs transition flex items-center gap-1 shadow-md cursor-pointer active:scale-95 ${
                      isPlaying
                        ? 'bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/40'
                        : isFull
                        ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                        : 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 shadow-emerald-500/20'
                    }`}
                  >
                    {isPlaying ? (
                      <>
                        <Eye className="w-3.5 h-3.5" />
                        <span>{language === 'en' ? 'Spectate' : 'İzle'}</span>
                      </>
                    ) : isFull ? (
                      <span>{language === 'en' ? 'Full' : 'Dolu'}</span>
                    ) : (
                      <>
                        <Play className="w-3 h-3 fill-current" />
                        <span>{language === 'en' ? 'Join' : 'Katıl'}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

    </div>
  );
};
