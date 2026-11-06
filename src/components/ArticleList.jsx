import React from 'react';
import { CheckCheck, Sparkles, Inbox, Star, Search, PlusCircle, AlertCircle } from 'lucide-react';
import { ArticleCard } from './ArticleCard.jsx';
import { hapticFeedback } from '../lib/telegram.js';
import { useI18n } from '../lib/i18n.js';

export function ArticleList({
  articles = [],
  loading = false,
  error = null,
  onRetry,
  hasMore = false,
  onLoadMore,
  activeTab,
  onSwitchTab,
  onMarkAllRead,
  onOpenArticle,
  onToggleStar,
  onToggleRead,
  onOpenAddModal,
  searchQuery,
  activeFeedTitle,
  viewMode = 'card',
}) {
  const { t } = useI18n();

  if (loading && articles.length === 0) {
    return (
      <div className="p-4 space-y-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="animate-pulse space-y-2 p-4 bg-tg-bg rounded-xl border border-tg-border">
            <div className="h-3 w-1/4 bg-tg-secondary rounded-sm" />
            <div className="h-4 w-3/4 bg-tg-secondary rounded-sm" />
            <div className="h-3 w-full bg-tg-secondary rounded-sm" />
          </div>
        ))}
      </div>
    );
  }

  // Error State
  if (error && !loading && articles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center text-tg-hint min-h-[50vh]">
        <div className="w-12 h-12 rounded-full bg-red-50 dark:bg-red-950/40 flex items-center justify-center mb-3 text-red-500">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h3 className="text-base font-semibold text-tg-text">{t('load_failed')}</h3>
        <p className="mt-1 text-sm max-w-xs text-tg-hint">{error}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-4 px-4 py-2 rounded-lg bg-tg-button text-tg-button-text text-sm font-semibold shadow-xs"
          >
            {t('retry')}
          </button>
        )}
      </div>
    );
  }

  // Empty States
  if (!loading && articles.length === 0) {
    if (searchQuery) {
      return (
        <div className="flex flex-col items-center justify-center p-8 text-center text-tg-hint min-h-[50vh]">
          <div className="w-12 h-12 rounded-full bg-tg-secondary flex items-center justify-center mb-3 text-tg-hint">
            <Search className="w-6 h-6" />
          </div>
          <h3 className="text-base font-semibold text-tg-text">{t('no_articles')}</h3>
          <p className="mt-1 text-sm max-w-xs">
            {t('no_articles_desc')}
          </p>
        </div>
      );
    }

    if (activeTab === 'starred') {
      return (
        <div className="flex flex-col items-center justify-center p-8 text-center text-tg-hint min-h-[50vh]">
          <div className="w-12 h-12 rounded-full bg-amber-50 dark:bg-amber-950/40 flex items-center justify-center mb-3 text-amber-500">
            <Star className="w-6 h-6" />
          </div>
          <h3 className="text-base font-semibold text-tg-text">{t('no_articles')}</h3>
          <p className="mt-1 text-sm max-w-xs">
            {t('no_articles_desc')}
          </p>
          <button
            type="button"
            onClick={() => onSwitchTab('unread')}
            className="mt-4 px-4 py-2 rounded-lg bg-tg-button text-tg-button-text text-sm font-semibold shadow-xs"
          >
            {t('tab_unread')}
          </button>
        </div>
      );
    }

    if (activeTab === 'unread') {
      return (
        <div className="flex flex-col items-center justify-center p-8 text-center text-tg-hint min-h-[50vh]">
          <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center mb-3 text-emerald-600">
            <Sparkles className="w-6 h-6" />
          </div>
          <h3 className="text-base font-semibold text-tg-text">{t('all_caught_up')}</h3>
          <p className="mt-1 text-sm max-w-xs">
            {t('all_caught_up_desc')}
          </p>
          <button
            type="button"
            onClick={() => onSwitchTab('all')}
            className="mt-4 px-4 py-2 rounded-lg bg-tg-secondary text-tg-text text-sm font-semibold hover:bg-tg-border transition-colors"
          >
            {t('tab_all')}
          </button>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center p-8 text-center text-tg-hint min-h-[50vh]">
        <div className="w-12 h-12 rounded-full bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center mb-3 text-tg-button">
          <Inbox className="w-6 h-6" />
        </div>
        <h3 className="text-base font-semibold text-tg-text">{t('no_feeds_yet')}</h3>
        <p className="mt-1 text-sm max-w-xs">
          {t('no_articles_desc')}
        </p>
        <button
          type="button"
          onClick={onOpenAddModal}
          className="mt-4 flex items-center gap-2 px-4 py-2 rounded-lg bg-tg-button text-tg-button-text text-sm font-semibold shadow-xs"
        >
          <PlusCircle className="w-4 h-4" />
          {t('add_feed')}
        </button>
      </div>
    );
  }

  return (
    <div className="pb-16">
      {/* Top action header */}
      {activeTab === 'unread' && articles.length > 0 && (
        <div className="flex items-center justify-between px-4 py-2 bg-tg-secondary/40 text-xs text-tg-hint border-b border-tg-border">
          <span>{articles.length} {t('tab_unread').toLowerCase()}</span>
          <button
            type="button"
            onClick={() => {
              hapticFeedback('medium');
              onMarkAllRead();
            }}
            className="flex items-center gap-1 font-semibold text-tg-button hover:underline"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            {t('mark_all_read')}
          </button>
        </div>
      )}

      {/* Article Cards Stream */}
      <div className="divide-y divide-tg-border">
        {articles.map((article) => (
          <ArticleCard
            key={article.id}
            article={article}
            onOpenArticle={onOpenArticle}
            onToggleStar={onToggleStar}
            onToggleRead={onToggleRead}
            viewMode={viewMode}
          />
        ))}
      </div>

      {/* Pagination Load More */}
      {hasMore && (
        <div className="p-4 text-center">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-xl bg-tg-secondary text-tg-text text-sm font-semibold hover:bg-tg-border transition-colors disabled:opacity-50"
          >
            {loading ? t('loading') : t('load_more')}
          </button>
        </div>
      )}
    </div>
  );
}

