import React, { useState } from 'react';
import { FinancialTransaction, Player } from '../types/game';
import {
  Receipt,
  X,
  TrendingUp,
  TrendingDown,
  Building2,
  Coins,
  ArrowLeftRight,
  Landmark,
  KeyRound,
  Sparkles,
  Hammer,
  Search,
  Filter
} from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

interface TransactionsModalProps {
  transactions: FinancialTransaction[];
  currentPlayer: Player;
  players: Player[];
  onClose: () => void;
}

export const TransactionsModal: React.FC<TransactionsModalProps> = ({
  transactions,
  currentPlayer,
  players,
  onClose
}) => {
  const { t, formatMoney, language } = useLanguage();
  const [filterMode, setFilterMode] = useState<'all' | 'mine' | 'income' | 'expense'>('all');
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const CATEGORY_LABELS: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
    buy: { label: t('categoryBuy'), icon: <Building2 className="w-3.5 h-3.5" />, color: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
    rent_in: { label: t('categoryRentIn'), icon: <TrendingUp className="w-3.5 h-3.5" />, color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
    rent_out: { label: t('categoryRentOut'), icon: <TrendingDown className="w-3.5 h-3.5" />, color: 'bg-rose-500/20 text-rose-300 border-rose-500/30' },
    salary: { label: t('categorySalary'), icon: <Coins className="w-3.5 h-3.5" />, color: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' },
    bank_sell: { label: t('categoryBankSell'), icon: <Landmark className="w-3.5 h-3.5" />, color: 'bg-sky-500/20 text-sky-300 border-sky-500/30' },
    trade: { label: t('categoryTrade'), icon: <ArrowLeftRight className="w-3.5 h-3.5" />, color: 'bg-purple-500/20 text-purple-300 border-purple-500/30' },
    tax: { label: t('categoryTax'), icon: <Receipt className="w-3.5 h-3.5" />, color: 'bg-orange-500/20 text-orange-300 border-orange-500/30' },
    bail: { label: t('categoryBail'), icon: <KeyRound className="w-3.5 h-3.5" />, color: 'bg-red-500/20 text-red-300 border-red-500/30' },
    chance: { label: t('categoryChance'), icon: <Sparkles className="w-3.5 h-3.5" />, color: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' },
    build_house: { label: t('categoryBuildHouse'), icon: <Hammer className="w-3.5 h-3.5" />, color: 'bg-teal-500/20 text-teal-300 border-teal-500/30' },
    mortgage: { label: t('categoryMortgage'), icon: <Landmark className="w-3.5 h-3.5" />, color: 'bg-slate-500/20 text-slate-300 border-slate-500/30' },
  };

  const filteredTransactions = transactions.filter((tx) => {
    // Player filter
    if (selectedPlayerId !== 'all' && tx.playerId !== selectedPlayerId) {
      return false;
    }

    // Tab filter
    if (filterMode === 'mine' && tx.playerId !== currentPlayer.id) {
      return false;
    }
    if (filterMode === 'income' && tx.type !== 'income') {
      return false;
    }
    if (filterMode === 'expense' && tx.type !== 'expense') {
      return false;
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = tx.playerName.toLowerCase().includes(q);
      const matchDesc = tx.description.toLowerCase().includes(q);
      const matchCat = (CATEGORY_LABELS[tx.category]?.label || '').toLowerCase().includes(q);
      return matchName || matchDesc || matchCat;
    }

    return true;
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-[#091122] border border-slate-700/80 rounded-3xl p-5 sm:p-6 shadow-2xl relative overflow-hidden flex flex-col max-h-[88vh] text-left"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-600 to-indigo-600 flex items-center justify-center shadow-lg text-white">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                {t('ledgerTitle')}
              </h2>
              <p className="text-[11px] text-slate-400 font-semibold">
                {t('ledgerSubtitle')}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Filters and Controls */}
        <div className="py-3 space-y-2.5 shrink-0 border-b border-slate-800/80">
          
          {/* Main Filter Tabs */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setFilterMode('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                filterMode === 'all'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white'
              }`}
            >
              {t('allTransactions')} ({transactions.length})
            </button>
            <button
              onClick={() => setFilterMode('mine')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                filterMode === 'mine'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white'
              }`}
            >
              {t('myTransactionsOnly')}
            </button>
            <button
              onClick={() => setFilterMode('income')}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                filterMode === 'income'
                  ? 'bg-emerald-500 text-slate-950 shadow-md'
                  : 'bg-slate-800/80 text-emerald-400 hover:bg-slate-700'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>{t('incomesOnly')}</span>
            </button>
            <button
              onClick={() => setFilterMode('expense')}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                filterMode === 'expense'
                  ? 'bg-rose-500 text-white shadow-md'
                  : 'bg-slate-800/80 text-rose-400 hover:bg-slate-700'
              }`}
            >
              <TrendingDown className="w-3.5 h-3.5" />
              <span>{t('expensesOnly')}</span>
            </button>
          </div>

          {/* Search & Player Filter Row */}
          <div className="flex flex-col sm:flex-row items-center gap-2">
            <div className="relative flex-1 w-full">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder={t('searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 outline-none focus:border-amber-400"
              />
            </div>

            <div className="flex items-center gap-1.5 w-full sm:w-auto shrink-0">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={selectedPlayerId}
                onChange={(e) => setSelectedPlayerId(e.target.value)}
                className="bg-slate-900 border border-slate-800 text-slate-200 text-xs rounded-xl px-2.5 py-1.5 outline-none font-bold cursor-pointer"
              >
                <option value="all">{t('allPlayersOption')}</option>
                {players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.avatar} {p.name} {p.id === currentPlayer.id ? `(${t('youBadge')})` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

        </div>

        {/* Transactions List */}
        <div className="flex-1 overflow-y-auto py-2 space-y-2 pr-1 min-h-[220px]">
          {filteredTransactions.length === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center text-center text-slate-500 space-y-2">
              <Receipt className="w-8 h-8 text-slate-600 animate-pulse" />
              <p className="text-xs font-semibold">{t('noTransactionsFound')}</p>
            </div>
          ) : (
            filteredTransactions.map((tx) => {
              const cat = CATEGORY_LABELS[tx.category] || {
                label: language === 'en' ? 'Transaction' : 'İşlem',
                icon: <Coins className="w-3.5 h-3.5" />,
                color: 'bg-slate-800 text-slate-300 border-slate-700'
              };
              const isIncome = tx.type === 'income';

              return (
                <div
                  key={tx.id}
                  className="bg-[#050b17] border border-slate-800/90 hover:border-slate-700 rounded-2xl p-2.5 sm:p-3 transition flex items-center justify-between gap-3"
                >
                  {/* Left: Player + Details */}
                  <div className="flex items-center gap-2.5 min-w-0">
                    {/* Player Avatar */}
                    <div
                      className="w-8 h-8 rounded-full bg-slate-900 border-2 flex items-center justify-center text-sm shrink-0 shadow-md"
                      style={{ borderColor: tx.playerColor }}
                    >
                      {tx.playerAvatar}
                    </div>

                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-bold text-white truncate">
                          {tx.playerName}
                        </span>
                        
                        {/* Category Badge */}
                        <span className={`inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-md border ${cat.color}`}>
                          {cat.icon}
                          <span>{cat.label}</span>
                        </span>

                        <span className="text-[10px] text-slate-500 font-mono">
                          {tx.timestamp}
                        </span>
                      </div>

                      <p className="text-[11px] text-slate-300 font-medium line-clamp-1">
                        {tx.description}
                      </p>
                    </div>
                  </div>

                  {/* Right: Amount & Balance */}
                  <div className="text-right shrink-0">
                    <div
                      className={`text-sm sm:text-base font-black tracking-tight ${
                        isIncome ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {isIncome ? `+${formatMoney(tx.amount)}` : `-${formatMoney(tx.amount)}`}
                    </div>
                    <div className="text-[9px] text-slate-400 font-mono font-semibold">
                      {language === 'en' ? 'Balance:' : 'Bakiye:'} {formatMoney(tx.balanceAfter)}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <span className="font-semibold">
            {t('totalRecords')}: <strong className="text-white">{filteredTransactions.length}</strong>
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl transition cursor-pointer"
          >
            {t('closeBtn')}
          </button>
        </div>

      </div>
    </div>
  );
};
