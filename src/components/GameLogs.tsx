import React from 'react';
import { GameLog } from '../types/game';
import { ScrollText } from 'lucide-react';

interface GameLogsProps {
  logs: GameLog[];
}

export const GameLogs: React.FC<GameLogsProps> = ({ logs }) => {
  return (
    <div className="bg-[#0b1222]/90 border border-slate-800/90 rounded-2xl p-3 shadow-xl flex flex-col h-full max-h-[calc(100vh-85px)] select-none backdrop-blur-md">
      <div className="flex items-center gap-1.5 border-b border-slate-800 pb-2 mb-2 shrink-0">
        <ScrollText className="w-3.5 h-3.5 text-amber-400" />
        <span className="text-[11px] font-black text-amber-400 uppercase tracking-wider">
          Oyun Akışı & Bildirimler
        </span>
      </div>

      <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 text-xs min-h-0">
        {logs.map((log) => (
          <div
            key={log.id}
            className={`p-2 rounded-xl border leading-tight ${
              log.type === 'success'
                ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                : log.type === 'danger'
                ? 'bg-rose-950/40 border-rose-800/60 text-rose-300'
                : log.type === 'warning'
                ? 'bg-amber-950/40 border-amber-800/60 text-amber-300'
                : log.type === 'action'
                ? 'bg-sky-950/40 border-sky-800/60 text-sky-200 font-semibold'
                : 'bg-[#070b14]/70 border-slate-800/70 text-slate-300'
            }`}
          >
            <span className="text-[9px] opacity-60 mr-1.5 font-mono">[{log.timestamp}]</span>
            {log.text}
          </div>
        ))}
      </div>
    </div>
  );
};
