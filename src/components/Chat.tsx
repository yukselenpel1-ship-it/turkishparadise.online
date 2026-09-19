import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, Player } from '../types/game';
import { Send, MessageSquare } from 'lucide-react';

interface ChatProps {
  messages: ChatMessage[];
  currentPlayer: Player | null;
  onSendMessage: (text: string) => void;
}

const QUICK_EMOJIS = ['🎲', '💰', '😂', '🔥', '👏', '🤝', '🏠', '😎'];

export const Chat: React.FC<ChatProps> = ({
  messages,
  currentPlayer,
  onSendMessage,
}) => {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !currentPlayer) return;
    onSendMessage(inputText.trim());
    setInputText('');
  };

  const handleSendEmoji = (emoji: string) => {
    if (!currentPlayer) return;
    onSendMessage(emoji);
  };

  return (
    <div className="bg-[#0b1222]/90 border border-slate-800/90 rounded-2xl p-2.5 sm:p-3 shadow-xl flex flex-col h-56 sm:h-64 select-none backdrop-blur-md">
      
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 mb-1.5 shrink-0">
        <div className="flex items-center gap-1.5 text-amber-400 font-extrabold text-xs">
          <MessageSquare className="w-3.5 h-3.5" />
          <span>Oyun Sohbeti</span>
        </div>
        <span className="text-[9px] text-slate-500 font-semibold">Canlı</span>
      </div>

      {/* Messages List */}
      <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 min-h-0 text-left">
        {messages.map((msg) => {
          const isMe = currentPlayer && msg.senderId === currentPlayer.id;

          if (msg.isSystem) {
            return (
              <div
                key={msg.id}
                className="text-center bg-amber-500/10 border border-amber-500/20 text-amber-300/90 text-[9px] font-medium py-1 px-2 rounded-lg"
              >
                {msg.text}
              </div>
            );
          }

          return (
            <div
              key={msg.id}
              className={`flex flex-col text-xs ${isMe ? 'items-end' : 'items-start'}`}
            >
              <div className="flex items-center gap-1 text-[9px] text-slate-400 mb-0.5">
                <span>{msg.senderAvatar}</span>
                <span className="font-bold text-slate-300" style={{ color: msg.senderColor }}>
                  {msg.senderName}
                </span>
                <span className="text-[8px] text-slate-500">{msg.timestamp}</span>
              </div>
              <div
                className={`px-2.5 py-1 rounded-xl text-xs max-w-[90%] break-words ${
                  isMe
                    ? 'bg-amber-500/20 text-amber-100 border border-amber-500/30 rounded-tr-none'
                    : 'bg-slate-800/80 text-slate-200 border border-slate-700/60 rounded-tl-none'
                }`}
              >
                {msg.text}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Emojis */}
      <div className="flex items-center gap-1 py-1 overflow-x-auto shrink-0 scrollbar-none border-t border-slate-800/60 mt-1">
        {QUICK_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => handleSendEmoji(emoji)}
            className="text-xs hover:bg-slate-800 p-0.5 rounded transition hover:scale-125 cursor-pointer shrink-0"
          >
            {emoji}
          </button>
        ))}
      </div>

      {/* Input Form */}
      <form onSubmit={handleSubmit} className="flex items-center gap-1.5 pt-1 shrink-0">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder={currentPlayer ? "Mesaj yaz..." : "Sohbet için oyuna katılın"}
          disabled={!currentPlayer}
          maxLength={100}
          className="flex-1 bg-[#070b14] border border-slate-800 focus:border-amber-400 text-white rounded-lg px-2.5 py-1 text-xs outline-none transition placeholder-slate-600 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!inputText.trim() || !currentPlayer}
          className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 disabled:opacity-40 text-slate-950 font-bold p-1.5 rounded-lg transition cursor-pointer shrink-0 shadow-md"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>

    </div>
  );
};
