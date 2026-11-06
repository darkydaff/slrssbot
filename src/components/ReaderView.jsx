import React, { useEffect, useState } from 'react';
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
  Type,
  X,
  Palette,
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
  isLoadingContent = false,
  onRetryLoadContent,
}) {
  const { t, lang } = useI18n();

  // Typography settings with localStorage persistence
  const [typography, setTypography] = useState(() => {
    try {
      const saved = localStorage.getItem('slrss_typography');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      fontSize: 'base', // 'sm' | 'base' | 'lg' | 'xl'
      fontFamily: 'sans', // 'sans' | 'serif' | 'mono'
      lineHeight: 'normal', // 'tight' | 'normal' | 'loose'
      theme: 'default', // 'default' | 'sepia' | 'oled'
    };
  });

  const [isTypographyOpen, setIsTypographyOpen] = useState(false);

  const updateTypography = (changes) => {
    setTypography((prev) => {
      const next = { ...prev, ...changes };
      try {
        localStorage.setItem('slrss_typography', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

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

  // Determine dynamic typography styles
  const fontClass =
    typography.fontFamily === 'serif'
      ? 'font-serif'
      : typography.fontFamily === 'mono'
      ? 'font-mono'
      : 'font-sans';

  const sizeClass =
    typography.fontSize === 'sm'
      ? 'text-sm'
      : typography.fontSize === 'lg'
      ? 'text-lg'
      : typography.fontSize === 'xl'
      ? 'text-xl'
      : 'text-base';

  const lineClass =
    typography.lineHeight === 'tight'
      ? 'leading-snug'
      : typography.lineHeight === 'loose'
      ? 'leading-loose'
      : 'leading-relaxed';

  // Reading themes
  const isSepia = typography.theme === 'sepia';
  const isOled = typography.theme === 'oled';

  const themeContainerClass = isSepia
    ? 'bg-[#fbf0d9] text-[#3d2f1d]'
    : isOled
    ? 'bg-black text-[#e5e5e5]'
    : 'bg-tg-bg text-tg-text';

  const themeNavClass = isSepia
    ? 'bg-[#f4e8cf]/95 text-[#3d2f1d] border-[#e2d3b5]'
    : isOled
    ? 'bg-black/95 text-white border-neutral-800'
    : 'bg-tg-bg/95 text-tg-text border-tg-border';

  const themeCardBg = isSepia
    ? 'bg-[#f4e8cf] text-[#3d2f1d] border-[#e2d3b5]'
    : isOled
    ? 'bg-neutral-900 text-[#e5e5e5] border-neutral-800'
    : 'bg-tg-secondary text-tg-text border-tg-border';

  return (
    <div className={`min-h-screen pb-24 transition-colors duration-200 ${themeContainerClass}`}>
      {/* Top Navigation Bar */}
      <nav className={`sticky top-0 z-40 flex items-center justify-between px-3 py-2.5 backdrop-blur-md border-b ${themeNavClass}`}>
        <button
          type="button"
          onClick={() => {
            hapticFeedback('light');
            onBack();
          }}
          className="flex items-center gap-1 py-1 px-2 rounded-lg text-sm font-semibold opacity-80 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5 active:scale-95 transition-all"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>{t('back')}</span>
        </button>

        <div className="flex items-center gap-1">
          {/* Typography Options Sheet Button */}
          <button
            type="button"
            onClick={() => {
              hapticFeedback('light');
              setIsTypographyOpen(!isTypographyOpen);
            }}
            title="Typography & Reading Settings"
            className={`p-2 rounded-full active:scale-95 transition-all ${
              isTypographyOpen ? 'bg-tg-button text-tg-button-text' : 'opacity-80 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5'
            }`}
          >
            <Type className="w-5 h-5" />
          </button>

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
            className="p-2 rounded-full opacity-80 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5 active:scale-95 transition-all"
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
            className="p-2 rounded-full opacity-80 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5 active:scale-95 transition-all"
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
            className="p-2 rounded-full opacity-80 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5 active:scale-95 transition-all"
          >
            <Share2 className="w-5 h-5" />
          </button>

          {article.link && (
            <button
              type="button"
              onClick={() => openExternalLink(article.link)}
              title={t('open_in_browser')}
              className="p-2 rounded-full opacity-80 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5 active:scale-95 transition-all"
            >
              <ExternalLink className="w-5 h-5" />
            </button>
          )}
        </div>
      </nav>

      {/* Typography Drawer / Sheet */}
      {isTypographyOpen && (
        <div className="sticky top-[53px] z-30 p-4 border-b shadow-lg animate-in slide-in-from-top-2 duration-200 bg-tg-bg/95 backdrop-blur-md border-tg-border text-tg-text">
          <div className="max-w-2xl mx-auto space-y-3.5 text-xs">
            {/* Header */}
            <div className="flex items-center justify-between">
              <span className="font-bold uppercase tracking-wider text-[11px] text-tg-hint">
                Typography & Themes
              </span>
              <button
                type="button"
                onClick={() => setIsTypographyOpen(false)}
                className="p-1 rounded-full text-tg-hint hover:text-tg-text"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Font Size Row */}
            <div className="flex items-center justify-between gap-2">
              <span className="text-tg-hint font-medium">Size</span>
              <div className="flex items-center gap-1 bg-tg-secondary p-1 rounded-xl">
                {[
                  { key: 'sm', label: 'Small', text: 'A-' },
                  { key: 'base', label: 'Default', text: 'A' },
                  { key: 'lg', label: 'Large', text: 'A+' },
                  { key: 'xl', label: 'Extra', text: 'A++' },
                ].map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => {
                      hapticFeedback('light');
                      updateTypography({ fontSize: s.key });
                    }}
                    className={`px-3 py-1 rounded-lg font-bold transition-all ${
                      typography.fontSize === s.key
                        ? 'bg-tg-button text-tg-button-text shadow-xs'
                        : 'text-tg-hint hover:text-tg-text'
                    }`}
                  >
                    {s.text}
                  </button>
                ))}
              </div>
            </div>

            {/* Font Family Row */}
            <div className="flex items-center justify-between gap-2">
              <span className="text-tg-hint font-medium">Font</span>
              <div className="flex items-center gap-1 bg-tg-secondary p-1 rounded-xl">
                {[
                  { key: 'sans', label: 'Sans (Clean)' },
                  { key: 'serif', label: 'Serif (Book)' },
                  { key: 'mono', label: 'Mono (Code)' },
                ].map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => {
                      hapticFeedback('light');
                      updateTypography({ fontFamily: f.key });
                    }}
                    className={`px-3 py-1 rounded-lg font-semibold transition-all ${
                      typography.fontFamily === f.key
                        ? 'bg-tg-button text-tg-button-text shadow-xs'
                        : 'text-tg-hint hover:text-tg-text'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Theme Row */}
            <div className="flex items-center justify-between gap-2">
              <span className="text-tg-hint font-medium">Reading Theme</span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    hapticFeedback('light');
                    updateTypography({ theme: 'default' });
                  }}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                    typography.theme === 'default'
                      ? 'border-tg-button bg-tg-button text-tg-button-text shadow-xs'
                      : 'border-tg-border bg-tg-secondary text-tg-hint hover:text-tg-text'
                  }`}
                >
                  System
                </button>
                <button
                  type="button"
                  onClick={() => {
                    hapticFeedback('light');
                    updateTypography({ theme: 'sepia' });
                  }}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                    typography.theme === 'sepia'
                      ? 'border-amber-600 bg-[#fbf0d9] text-[#3d2f1d] ring-2 ring-amber-500/30'
                      : 'border-amber-200 bg-[#fbf0d9]/60 text-[#5f4b32]'
                  }`}
                >
                  📖 Sepia
                </button>
                <button
                  type="button"
                  onClick={() => {
                    hapticFeedback('light');
                    updateTypography({ theme: 'oled' });
                  }}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                    typography.theme === 'oled'
                      ? 'border-neutral-500 bg-black text-white ring-2 ring-white/20'
                      : 'border-neutral-800 bg-neutral-900 text-neutral-400'
                  }`}
                >
                  🌙 OLED
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Hero Image (if available) */}
      {article.leadImageUrl && (
        <div className="w-full max-h-80 overflow-hidden bg-black/10 border-b border-inherit">
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
      <main className={`max-w-2xl mx-auto px-4 pt-6 ${fontClass} ${sizeClass} ${lineClass}`}>
        {/* Source metadata */}
        <div className="flex items-center gap-2 text-xs font-semibold opacity-70 mb-3">
          <span className={`px-2 py-0.5 rounded-full ${themeCardBg}`}>
            {article.feedTitle}
          </span>
          {article.category && article.category !== 'General' && (
            <span className={`px-2 py-0.5 rounded-full ${themeCardBg}`}>
              {article.category}
            </span>
          )}
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
          <h1 className="text-2xl sm:text-3xl font-extrabold leading-tight mb-4 tracking-tight">
            {article.title}
          </h1>
        )}

        {/* Podcast Audio Player */}
        {audioMedia && (
          <div className={`my-4 p-3.5 rounded-xl border space-y-2 ${themeCardBg}`}>
            <div className="flex items-center gap-2 text-xs font-semibold">
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
          <div className="my-4 rounded-xl overflow-hidden bg-black border border-inherit">
            <video controls className="w-full max-h-96" preload="metadata">
              <source src={videoMedia.url} type={videoMedia.type || 'video/mp4'} />
              Your browser does not support video playback.
            </video>
          </div>
        )}

        {/* Article Body */}
        <div
          className={`article-prose mt-6 ${fontClass} ${sizeClass} ${lineClass}`}
          dangerouslySetInnerHTML={{
            __html: article.content || article.summary || `<p>${t('no_content_preview')}</p>`,
          }}
        />

        {/* Loading Indicator */}
        {isLoadingContent && (
          <div className={`my-6 p-4 rounded-xl border flex items-center justify-center gap-2.5 animate-pulse text-xs font-medium ${themeCardBg}`}>
            <div className="w-3.5 h-3.5 border-2 border-tg-button border-t-transparent rounded-full animate-spin" />
            <span>{t('loading_full_article')}</span>
          </div>
        )}

        {/* Load Error with Retry */}
        {article.loadError && !isLoadingContent && (
          <div className="my-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-center space-y-2">
            <p className="text-xs text-red-500 font-medium">
              {t('full_article_failed')}
            </p>
            {onRetryLoadContent && (
              <button
                type="button"
                onClick={onRetryLoadContent}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold active:scale-95 transition-all inline-flex items-center gap-1.5 ${themeCardBg}`}
              >
                <span>{t('retry')}</span>
              </button>
            )}
          </div>
        )}

        {/* Footer Link to Origin */}
        {article.link && (
          <div className="mt-10 pt-6 border-t border-inherit text-center">
            <button
              type="button"
              onClick={() => openExternalLink(article.link)}
              className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold active:scale-95 transition-all text-sm ${themeCardBg}`}
            >
              <ExternalLink className="w-4 h-4" />
              <span>{t('read_original')}</span>
            </button>
          </div>
        )}
      </main>

      {/* Floating Bottom Toolbar */}
      <footer className={`fixed bottom-0 inset-x-0 p-3 backdrop-blur-md border-t flex items-center justify-between max-w-2xl mx-auto z-30 ${themeNavClass}`}>
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
                : themeCardBg
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
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${themeCardBg}`}
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
