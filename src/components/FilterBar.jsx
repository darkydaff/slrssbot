import React, { useState } from 'react';
import { Star, CheckCircle2, Layers, Search, X } from 'lucide-react';
import { hapticFeedback } from '../lib/telegram.js';
import { useI18n } from '../lib/i18n.js';

export function FilterBar({
  activeTab,
  onTabChange,
  feeds = [],
  activeFeedUrl,
  onFeedSelect,
  searchQuery,
  onSearchChange,
  unreadTotal = 0,
  starredTotal = 0,
}) {
  const [showSearch, setShowSearch] = useState(false);
  const { t } = useI18n();

  return (
    <div className="bg-tg-bg border-b border-tg-border px-4 py-2 space-y-2.5">
      {/* 1. Main Navigation Tabs */}
      <div className="flex items-center justify-between gap-1">
        <div className="grid grid-cols-3 gap-1 bg-tg-secondary p-1 rounded-xl w-full max-w-sm">
          <button
            type="button"
            onClick={() => {
              hapticFeedback('light');
              onTabChange('unread');
            }}
            className={`flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'unread'
                ? 'bg-tg-bg text-tg-button shadow-xs'
                : 'text-tg-hint hover:text-tg-text'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{t('tab_unread')}</span>
            {unreadTotal > 0 && (
              <span className={`px-1 rounded-full text-[10px] ${
                activeTab === 'unread' ? 'bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300' : 'bg-gray-200 dark:bg-gray-700 text-tg-hint'
              }`}>
                {unreadTotal}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              hapticFeedback('light');
              onTabChange('all');
            }}
            className={`flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'all'
                ? 'bg-tg-bg text-tg-button shadow-xs'
                : 'text-tg-hint hover:text-tg-text'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>{t('tab_all')}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              hapticFeedback('light');
              onTabChange('starred');
            }}
            className={`flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'starred'
                ? 'bg-tg-bg text-amber-500 shadow-xs'
                : 'text-tg-hint hover:text-tg-text'
            }`}
          >
            <Star className={`w-3.5 h-3.5 ${activeTab === 'starred' ? 'fill-amber-500' : ''}`} />
            <span>{t('tab_starred')}</span>
            {starredTotal > 0 && (
              <span className="px-1 rounded-full text-[10px] bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300">
                {starredTotal}
              </span>
            )}
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            hapticFeedback('light');
            setShowSearch(!showSearch);
          }}
          className={`p-2 rounded-lg transition-all ${
            showSearch || searchQuery ? 'bg-tg-button text-tg-button-text' : 'text-tg-hint hover:bg-tg-secondary'
          }`}
          title={t('search_placeholder')}
        >
          <Search className="w-4 h-4" />
        </button>
      </div>

      {/* 2. Search Input (Expandable) */}
      {(showSearch || searchQuery) && (
        <div className="relative flex items-center">
          <input
            type="text"
            placeholder={t('search_placeholder')}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-8 pr-8 py-1.5 bg-tg-secondary text-tg-text text-sm rounded-lg border border-transparent focus:border-tg-button focus:outline-hidden transition-all placeholder:text-tg-hint"
            autoFocus
          />
          <Search className="absolute left-2.5 w-4 h-4 text-tg-hint pointer-events-none" />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute right-2.5 text-tg-hint hover:text-tg-text p-0.5 rounded-full"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* 3. Horizontal Feed Pills */}
      {feeds.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1 text-xs">
          <button
            type="button"
            onClick={() => {
              hapticFeedback('light');
              onFeedSelect(null);
            }}
            className={`whitespace-nowrap px-3 py-1 rounded-full font-medium transition-all shrink-0 ${
              !activeFeedUrl
                ? 'bg-tg-button text-tg-button-text font-semibold shadow-xs'
                : 'bg-tg-secondary text-tg-hint hover:text-tg-text'
            }`}
          >
            {t('all_feeds')}
          </button>

          {feeds.map((feed) => {
            const isSelected = activeFeedUrl === feed.feedUrl;
            return (
              <button
                key={feed.feedUrl}
                type="button"
                onClick={() => {
                  hapticFeedback('light');
                  onFeedSelect(isSelected ? null : feed.feedUrl);
                }}
                className={`whitespace-nowrap flex items-center gap-1.5 px-3 py-1 rounded-full font-medium transition-all shrink-0 ${
                  isSelected
                    ? 'bg-tg-button text-tg-button-text font-semibold shadow-xs'
                    : 'bg-tg-secondary text-tg-hint hover:text-tg-text'
                }`}
              >
                <span>{feed.title || feed.customTitle || feed.feedUrl}</span>
                {feed.unreadCount > 0 && (
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                    isSelected ? 'bg-white/20 text-white' : 'bg-tg-border text-tg-text font-semibold'
                  }`}>
                    {feed.unreadCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

