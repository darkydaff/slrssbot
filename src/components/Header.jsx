import React from 'react';
import { RefreshCw, Plus, SlidersHorizontal, Settings } from 'lucide-react';
import { BrandLogo } from './Logo.jsx';
import { hapticFeedback } from '../lib/telegram.js';
import { useI18n } from '../lib/i18n.js';

export function Header({
  unreadCount = 0,
  isRefreshing = false,
  onRefresh,
  onOpenAddModal,
  onOpenManageModal,
  onOpenSettings,
}) {
  const { t } = useI18n();

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between px-4 py-2.5 bg-tg-bg/95 backdrop-blur-md border-b border-tg-border shadow-xs">
      <div className="flex items-center gap-2">
        <div className="flex items-center text-tg-text" title={t('app_title')}>
          <BrandLogo className="h-6 w-auto" />
        </div>
        {unreadCount > 0 && (
          <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-100 dark:bg-blue-950/60 text-tg-button">
            {unreadCount}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => {
            hapticFeedback('light');
            onRefresh?.();
          }}
          disabled={isRefreshing}
          title={t('refresh')}
          className="p-2 rounded-full text-tg-hint hover:text-tg-text hover:bg-tg-secondary active:scale-95 transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin text-tg-button' : ''}`} />
        </button>

        <button
          type="button"
          onClick={() => {
            hapticFeedback('light');
            onOpenAddModal?.();
          }}
          title={t('add_feed')}
          className="p-2 rounded-full text-tg-hint hover:text-tg-text hover:bg-tg-secondary active:scale-95 transition-all"
        >
          <Plus className="w-5 h-5" />
        </button>

        <button
          type="button"
          onClick={() => {
            hapticFeedback('light');
            onOpenManageModal?.();
          }}
          title={t('manage_feeds')}
          className="p-2 rounded-full text-tg-hint hover:text-tg-text hover:bg-tg-secondary active:scale-95 transition-all"
        >
          <SlidersHorizontal className="w-5 h-5" />
        </button>

        <button
          type="button"
          onClick={() => {
            hapticFeedback('light');
            onOpenSettings?.();
          }}
          title={t('settings')}
          className="p-2 rounded-full text-tg-hint hover:text-tg-text hover:bg-tg-secondary active:scale-95 transition-all"
        >
          <Settings className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
}

