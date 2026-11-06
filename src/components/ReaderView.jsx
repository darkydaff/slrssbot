import React, { useEffect } from 'react';
import {
  ArrowLeft,
  Star,
  CheckCircle,
  Circle,
  ExternalLink,
  Zap,
  Share2,
  ChevronRight,
  Headphones,
  Film,
} from 'lucide-react';
import {
  setupBackButton,
  hapticFeedback,
  openExternalLink,
  shareToTelegram,
} from '../lib/telegram.js';
import { formatRelativeTime } from '../lib/date.js';
import { useI18n } from '../lib/i18n.js';

export function ReaderView({
  article,
  onBack,
  onToggleStar,
  onToggleRead,
  onNextArticle,
  hasNextArticle = false,
}) {
  const { t, lang } = useI18n();

  // Wire native Telegram BackButton
  useEffect(() => {
    const cleanup = setupBackButton(onBack);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return cleanup;
  }, [onBack]);

  if (!article) return null;

  const isStarred = Boolean(article.isStarred);
  const isRead = Boolean(article.isRead);
  const timeStr = formatRelativeTime(article.publishedAt || article.createdAt, lang);

  const isChannel = Boolean(
    (article.feedUrl && article.feedUrl.includes('t.me/')) ||
    (article.link && article.link.includes('t.me/'))
  );

  // Telegram channel posts have no genuine headlines; their "title" is just an artificial excerpt of the post text.
  // For standard RSS feeds/blogs, only suppress if the HTML body itself already starts with an <h1> or <h2> header.
  const hasEmbeddedHeaderTag = /^\s*<h[12]\b[^>]*>/i.test(article.content || '');
  const isDuplicateHeader = Boolean(isChannel || hasEmbeddedHeaderTag);

  // Find audio or video media if any
  const mediaList = Array.isArray(article.media) ? article.media : [];
  const audioMedia = mediaList.find(
    (m) => (m.type && m.type.startsWith('audio')) || /\.(mp3|m4a|ogg|wav|aac)(\?|$)/i.test(m.url)
  );
  const videoMedia = mediaList.find(
    (m) => (m.type && m.type.startsWith('video')) || /\.(mp4|mov|webm)(\?|$)/i.test(m.url)
  );

  return (
    <div className="min-h-screen bg-tg-bg text-tg-text pb-24">
      {/* Top Navigation Bar */}
      <nav className="sticky top-0 z-40 flex items-center justify-between px-3 py-2.5 bg-tg-bg/95 backdrop-blur-md border-b border-tg-border">
        <button
          type="button"
          onClick={() => {
            hapticFeedback('light');
            onBack();
          }}
          className="flex items-center gap-1 py-1 px-2 rounded-lg text-sm font-semibold text-tg-hint hover:text-tg-text hover:bg-tg-secondary active:scale-95 transition-all"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>{t('back')}</span>
        </button>

        <div className="flex items-center gap-1">
          {article.telegraphUrl && (
            <button
              type="button"
              onClick={() => openExternalLink(article.telegraphUrl)}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 hover:opacity-90 active:scale-95 transition-all"
              title={t('instant_view')}
            >
              <Zap className="w-3.5 h-3.5 fill-emerald-600" />
              <span>{t('instant_view')}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              hapticFeedback('medium');
              onToggleStar(article.id, !isStarred);
            }}
            title={isStarred ? t('saved') : t('save')}
            className="p-2 rounded-full hover:bg-tg-secondary text-tg-hint active:scale-95 transition-all"
          >
            <Star
              className={`w-5 h-5 ${
                isStarred ? 'fill-amber-500 text-amber-500' : 'hover:text-amber-500'
              }`}
            />
          </button>

          <button
            type="button"
            onClick={() => {
              hapticFeedback('light');
              onToggleRead(article.id, !isRead);
            }}
            title={isRead ? t('mark_unread') : t('mark_read')}
            className="p-2 rounded-full hover:bg-tg-secondary text-tg-hint active:scale-95 transition-all"
          >
            {isRead ? (
              <CheckCircle className="w-5 h-5 text-emerald-600" />
            ) : (
              <Circle className="w-5 h-5 text-blue-500" />
            )}
          </button>

          <button
            type="button"
            onClick={() => shareToTelegram(article.link || article.telegraphUrl || window.location.href, article.title)}
            title={t('share')}
            className="p-2 rounded-full hover:bg-tg-secondary text-tg-hint hover:text-tg-text active:scale-95 transition-all"
          >
            <Share2 className="w-5 h-5" />
          </button>

          {article.link && (
            <button
              type="button"
              onClick={() => openExternalLink(article.link)}
              title={t('open_in_browser')}
              className="p-2 rounded-full hover:bg-tg-secondary text-tg-hint hover:text-tg-text active:scale-95 transition-all"
            >
              <ExternalLink className="w-5 h-5" />
            </button>
          )}
        </div>
      </nav>

      {/* Hero Image (if available) */}
      {article.leadImageUrl && (
        <div className="w-full max-h-80 overflow-hidden bg-tg-secondary border-b border-tg-border">
          <img
            src={article.leadImageUrl}
            alt=""
            className="w-full h-full object-cover max-h-80"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        </div>
      )}

      {/* Article Container */}
      <main className="max-w-2xl mx-auto px-4 pt-6">
        {/* Source metadata */}
        <div className="flex items-center gap-2 text-xs font-semibold text-tg-hint mb-3">
          <span className="px-2 py-0.5 rounded-full bg-tg-secondary text-tg-text">
            {article.feedTitle}
          </span>
          <span>•</span>
          <span>{timeStr}</span>
          {article.author && article.author !== article.feedTitle && (
            <>
              <span>•</span>
              <span className="truncate">{article.author}</span>
            </>
          )}
        </div>

        {/* Title */}
        {!isDuplicateHeader && (
          <h1 className="text-2xl sm:text-3xl font-extrabold text-tg-text leading-tight mb-4 tracking-tight">
            {article.title}
          </h1>
        )}

        {/* Podcast Audio Player */}
        {audioMedia && (
          <div className="my-4 p-3.5 rounded-xl bg-tg-secondary border border-tg-border space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-tg-text">
              <Headphones className="w-4 h-4 text-tg-button" />
              <span>{t('podcast_audio')}</span>
            </div>
            <audio controls className="w-full h-10" preload="metadata">
              <source src={audioMedia.url} type={audioMedia.type || 'audio/mpeg'} />
              Your browser does not support audio playback.
            </audio>
          </div>
        )}

        {/* Video Player */}
        {videoMedia && (
          <div className="my-4 rounded-xl overflow-hidden bg-black border border-tg-border">
            <video controls className="w-full max-h-96" preload="metadata">
              <source src={videoMedia.url} type={videoMedia.type || 'video/mp4'} />
              Your browser does not support video playback.
            </video>
          </div>
        )}

        {/* Article Body */}
        <div
          className="article-prose mt-6"
          dangerouslySetInnerHTML={{
            __html: article.content || article.summary || `<p>${t('no_content_preview')}</p>`,
          }}
        />

        {/* Footer Link to Origin */}
        {article.link && (
          <div className="mt-10 pt-6 border-t border-tg-border text-center">
            <button
              type="button"
              onClick={() => openExternalLink(article.link)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-tg-secondary text-tg-text font-semibold hover:bg-tg-border active:scale-95 transition-all text-sm"
            >
              <ExternalLink className="w-4 h-4" />
              <span>{t('read_original')}</span>
            </button>
          </div>
        )}
      </main>

      {/* Floating Bottom Toolbar */}
      <footer className="fixed bottom-0 inset-x-0 p-3 bg-tg-bg/95 backdrop-blur-md border-t border-tg-border flex items-center justify-between max-w-2xl mx-auto z-30">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              hapticFeedback('medium');
              onToggleStar(article.id, !isStarred);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              isStarred
                ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-600'
                : 'bg-tg-secondary text-tg-hint hover:text-tg-text'
            }`}
          >
            <Star className={`w-4 h-4 ${isStarred ? 'fill-amber-500' : ''}`} />
            <span>{isStarred ? t('saved') : t('save')}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              hapticFeedback('light');
              onToggleRead(article.id, !isRead);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-tg-secondary text-tg-hint hover:text-tg-text transition-all"
          >
            {isRead ? (
              <>
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                <span>{t('status_read')}</span>
              </>
            ) : (
              <>
                <Circle className="w-4 h-4 text-blue-500" />
                <span>{t('mark_read')}</span>
              </>
            )}
          </button>
        </div>

        {hasNextArticle && (
          <button
            type="button"
            onClick={() => {
              hapticFeedback('light');
              onNextArticle();
            }}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-tg-button text-tg-button-text text-xs font-semibold shadow-xs hover:opacity-90 active:scale-95 transition-all"
          >
            <span>{t('next_article')}</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </footer>
    </div>
  );
}

