import React from 'react';
import { Star, CheckCircle, Circle, Zap, ExternalLink } from 'lucide-react';
import { hapticFeedback, openExternalLink } from '../lib/telegram.js';
import { formatRelativeTime } from '../lib/date.js';
import { useI18n } from '../lib/i18n.js';

export { formatRelativeTime };

export function ArticleCard({
  article,
  onOpenArticle,
  onToggleStar,
  onToggleRead,
}) {
  const { t, lang } = useI18n();
  const isUnread = !article.isRead;
  const isStarred = Boolean(article.isStarred);
  const timeStr = formatRelativeTime(article.publishedAt || article.createdAt, lang);

  const cleanSummary = (article.summary || '').trim();
  const cleanTitle = (article.title || '').trim();
  const isDuplicateSummary = Boolean(
    cleanSummary &&
    cleanTitle &&
    (cleanSummary.toLowerCase().startsWith(cleanTitle.toLowerCase().slice(0, 30)) ||
     cleanTitle.toLowerCase().startsWith(cleanSummary.toLowerCase().slice(0, 30)))
  );

  return (
    <article
      onClick={() => {
        hapticFeedback('light');
        onOpenArticle(article);
      }}
      className={`group relative p-4 bg-tg-bg border-b border-tg-border hover:bg-tg-secondary/50 cursor-pointer transition-colors ${
        isUnread ? 'bg-blue-50/20 dark:bg-blue-950/10' : 'opacity-90'
      }`}
    >
      {/* Top Metadata */}
      <div className="flex items-center justify-between text-xs text-tg-hint mb-1.5">
        <div className="flex items-center gap-1.5 truncate max-w-[70%]">
          {isUnread && (
            <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" title="Unread" />
          )}
          <span className="font-semibold text-tg-text truncate">{article.feedTitle}</span>
          {article.author && article.author !== article.feedTitle && (
            <>
              <span>•</span>
              <span className="truncate">{article.author}</span>
            </>
          )}
        </div>
        <span className="shrink-0">{timeStr}</span>
      </div>

      {/* Main Content & Thumbnail */}
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <h2 className={`text-base leading-snug line-clamp-3 ${
            isUnread ? 'font-bold text-tg-text' : 'font-semibold text-tg-text/85'
          }`}>
            {isDuplicateSummary ? cleanSummary : cleanTitle}
          </h2>

          {!isDuplicateSummary && cleanSummary && (
            <p className="mt-1 text-sm text-tg-hint line-clamp-2 leading-relaxed">
              {cleanSummary}
            </p>
          )}
        </div>

        {article.leadImageUrl && (
          <div className="w-20 h-20 rounded-lg overflow-hidden shrink-0 bg-tg-secondary border border-tg-border">
            <img
              src={article.leadImageUrl}
              alt=""
              loading="lazy"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          </div>
        )}
      </div>

      {/* Bottom Action Bar */}
      <div className="flex items-center justify-between mt-3 pt-2 text-xs text-tg-hint">
        <div className="flex items-center gap-2">
          {article.telegraphUrl && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
              <Zap className="w-3 h-3 fill-emerald-600" /> {t('instant_view')}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => {
              hapticFeedback('medium');
              onToggleStar(article.id, !isStarred);
            }}
            title={isStarred ? t('saved') : t('save')}
            className="p-1.5 rounded-full hover:bg-tg-secondary transition-colors"
          >
            <Star
              className={`w-4 h-4 transition-colors ${
                isStarred ? 'fill-amber-500 text-amber-500' : 'text-tg-hint hover:text-amber-500'
              }`}
            />
          </button>

          <button
            type="button"
            onClick={() => {
              hapticFeedback('light');
              onToggleRead(article.id, !isUnread);
            }}
            title={isUnread ? t('mark_read') : t('mark_unread')}
            className="p-1.5 rounded-full hover:bg-tg-secondary transition-colors"
          >
            {isUnread ? (
              <Circle className="w-4 h-4 text-blue-500 hover:text-blue-600" />
            ) : (
              <CheckCircle className="w-4 h-4 text-emerald-600" />
            )}
          </button>

          {article.link && (
            <button
              type="button"
              onClick={() => openExternalLink(article.link)}
              title={t('read_original')}
              className="p-1.5 rounded-full hover:bg-tg-secondary text-tg-hint hover:text-tg-text transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

