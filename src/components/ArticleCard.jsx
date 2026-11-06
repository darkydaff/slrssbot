import React, { useState, useRef } from 'react';
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
  viewMode = 'card', // 'card' | 'compact'
}) {
  const { t, lang } = useI18n();
  const isUnread = !article.isRead;
  const isStarred = Boolean(article.isStarred);
  const timeStr = formatRelativeTime(article.publishedAt || article.createdAt, lang);

  // Swipe gesture state
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const touchStartRef = useRef({ x: 0, y: 0, isHorizontal: null });

  const SWIPE_THRESHOLD = 65;

  const handleTouchStart = (e) => {
    if (e.touches.length !== 1) return;
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      isHorizontal: null,
    };
    setIsSwiping(true);
  };

  const handleTouchMove = (e) => {
    if (!isSwiping || e.touches.length !== 1) return;
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const diffX = currentX - touchStartRef.current.x;
    const diffY = currentY - touchStartRef.current.y;

    // Detect direction on initial movement
    if (touchStartRef.current.isHorizontal === null) {
      if (Math.abs(diffY) > 8 && Math.abs(diffY) > Math.abs(diffX)) {
        touchStartRef.current.isHorizontal = false;
        return;
      }
      if (Math.abs(diffX) > 8) {
        touchStartRef.current.isHorizontal = true;
      }
    }

    if (touchStartRef.current.isHorizontal) {
      // Prevent horizontal overscroll bounce, apply resistance beyond threshold
      const resistance = Math.abs(diffX) > 100 ? 0.4 : 0.8;
      const clamped = Math.max(-120, Math.min(120, diffX * resistance));
      setSwipeOffset(clamped);
    }
  };

  const handleTouchEnd = () => {
    if (!isSwiping) return;
    setIsSwiping(false);

    if (touchStartRef.current.isHorizontal) {
      if (swipeOffset >= SWIPE_THRESHOLD) {
        // Swiped right -> Toggle Star
        hapticFeedback('medium');
        onToggleStar(article.id, !isStarred);
      } else if (swipeOffset <= -SWIPE_THRESHOLD) {
        // Swiped left -> Toggle Read
        hapticFeedback('light');
        onToggleRead(article.id, !isUnread);
      }
    }

    setSwipeOffset(0);
    touchStartRef.current.isHorizontal = null;
  };

  const cleanSummary = (article.summary || '').trim();
  const cleanTitle = (article.title || '').trim();
  const isDuplicateSummary = Boolean(
    cleanSummary &&
    cleanTitle &&
    (cleanSummary.toLowerCase().startsWith(cleanTitle.toLowerCase().slice(0, 30)) ||
     cleanTitle.toLowerCase().startsWith(cleanSummary.toLowerCase().slice(0, 30)))
  );

  const displayTitle = isDuplicateSummary ? cleanSummary : cleanTitle;

  return (
    <div className="relative overflow-hidden border-b border-tg-border select-none">
      {/* Swipe Action Background Reveal */}
      {swipeOffset !== 0 && (
        <div
          className={`absolute inset-0 flex items-center px-5 font-semibold text-xs transition-colors ${
            swipeOffset > 0
              ? 'bg-amber-500/20 text-amber-600 justify-start'
              : 'bg-emerald-500/20 text-emerald-600 justify-end'
          }`}
        >
          {swipeOffset > 0 ? (
            <div className="flex items-center gap-1.5 animate-in fade-in zoom-in-75 duration-150">
              <Star
                className={`w-5 h-5 transition-transform ${
                  Math.abs(swipeOffset) >= SWIPE_THRESHOLD ? 'scale-125 fill-amber-500' : 'scale-100'
                }`}
              />
              <span className="font-bold">{isStarred ? t('saved') : t('save')}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 animate-in fade-in zoom-in-75 duration-150">
              <span className="font-bold">{isUnread ? t('mark_read') : t('mark_unread')}</span>
              {isUnread ? (
                <CheckCircle
                  className={`w-5 h-5 text-emerald-600 transition-transform ${
                    Math.abs(swipeOffset) >= SWIPE_THRESHOLD ? 'scale-125' : 'scale-100'
                  }`}
                />
              ) : (
                <Circle
                  className={`w-5 h-5 text-blue-500 transition-transform ${
                    Math.abs(swipeOffset) >= SWIPE_THRESHOLD ? 'scale-125' : 'scale-100'
                  }`}
                />
              )}
            </div>
          )}
        </div>
      )}

      {/* Main Foreground Card / Row */}
      <article
        onClick={() => {
          if (Math.abs(swipeOffset) > 10) return;
          hapticFeedback('light');
          onOpenArticle(article);
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        style={{
          transform: `translateX(${swipeOffset}px)`,
          transition: isSwiping ? 'none' : 'transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)',
        }}
        className={`group relative bg-tg-bg hover:bg-tg-secondary/50 cursor-pointer transition-colors ${
          isUnread ? 'bg-blue-50/20 dark:bg-blue-950/10' : 'opacity-90'
        } ${viewMode === 'compact' ? 'px-3.5 py-2.5' : 'p-4'}`}
      >
        {viewMode === 'compact' ? (
          /* COMPACT VIEW MODE — High density, fast scanning */
          <div className="flex items-center gap-2.5">
            {/* Unread indicator dot */}
            <div className="shrink-0 w-2.5 flex items-center justify-center">
              {isUnread ? (
                <span className="w-2 h-2 rounded-full bg-blue-500 ring-2 ring-blue-500/20" />
              ) : isStarred ? (
                <Star className="w-2.5 h-2.5 fill-amber-500 text-amber-500" />
              ) : (
                <span className="w-1.5 h-1.5 rounded-full bg-tg-border" />
              )}
            </div>

            {/* Middle Title & Source */}
            <div className="flex-1 min-w-0 pr-1">
              <h2
                className={`text-sm leading-snug line-clamp-2 ${
                  isUnread ? 'font-bold text-tg-text' : 'font-normal text-tg-text/80'
                }`}
              >
                {displayTitle}
              </h2>
              <div className="flex items-center gap-1.5 text-[11px] text-tg-hint mt-0.5 truncate">
                <span className="font-semibold truncate max-w-[140px] text-tg-text/90">
                  {article.feedTitle}
                </span>
                <span>•</span>
                <span className="shrink-0">{timeStr}</span>
                {article.category && article.category !== 'General' && (
                  <>
                    <span>•</span>
                    <span className="px-1.5 py-0.2 rounded-sm bg-tg-secondary text-[10px] text-tg-hint">
                      {article.category}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Right Quick Action Icons */}
            <div
              className="flex items-center gap-0.5 shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              {article.telegraphUrl && (
                <span className="p-1 text-emerald-600" title={t('instant_view')}>
                  <Zap className="w-3.5 h-3.5 fill-emerald-600" />
                </span>
              )}
              <button
                type="button"
                onClick={() => {
                  hapticFeedback('medium');
                  onToggleStar(article.id, !isStarred);
                }}
                className="p-1.5 rounded-full hover:bg-tg-secondary text-tg-hint"
                title={isStarred ? t('saved') : t('save')}
              >
                <Star
                  className={`w-4 h-4 ${
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
                className="p-1.5 rounded-full hover:bg-tg-secondary text-tg-hint"
                title={isUnread ? t('mark_read') : t('mark_unread')}
              >
                {isUnread ? (
                  <Circle className="w-4 h-4 text-blue-500 hover:text-blue-600" />
                ) : (
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                )}
              </button>
            </div>
          </div>
        ) : (
          /* STANDARD CARD VIEW MODE — Rich with thumbnail & excerpt */
          <>
            {/* Top Metadata */}
            <div className="flex items-center justify-between text-xs text-tg-hint mb-1.5">
              <div className="flex items-center gap-1.5 truncate max-w-[70%]">
                {isUnread && (
                  <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" title="Unread" />
                )}
                <span className="font-semibold text-tg-text truncate">{article.feedTitle}</span>
                {article.category && article.category !== 'General' && (
                  <span className="px-1.5 py-0.2 rounded-full bg-tg-secondary text-[10px] text-tg-hint shrink-0">
                    {article.category}
                  </span>
                )}
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
                <h2
                  className={`text-base leading-snug line-clamp-3 ${
                    isUnread ? 'font-bold text-tg-text' : 'font-semibold text-tg-text/85'
                  }`}
                >
                  {displayTitle}
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
          </>
        )}
      </article>
    </div>
  );
}
