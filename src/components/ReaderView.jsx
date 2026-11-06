import React, { useEffect, useState, useMemo } from 'react';
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
} from 'lucide-react';
import {
  setupBackButton,
  hapticFeedback,
  openExternalLink,
  shareToTelegram,
  setTelegramColors,
  resetTelegramColors,
  tg,
} from '../lib/telegram.js';
import { formatRelativeTime } from '../lib/date.js';
import { useI18n } from '../lib/i18n.js';
import {
  cleanArticleContent,
  FONT_SIZE_MAP,
  LINE_HEIGHT_MAP,
  FONT_FAMILY_MAP,
  FONT_SIZE_OPTIONS,
  FONT_FAMILY_OPTIONS,
  LINE_SPACING_OPTIONS,
  THEME_OPTIONS,
} from '../lib/reader.js';

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
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          fontSize: parsed.fontSize || 'base',
          fontFamily: parsed.fontFamily || 'sans',
          lineHeight: parsed.lineHeight || 'normal',
          theme: parsed.theme === 'default' ? 'system' : (parsed.theme || 'system'),
        };
      }
    } catch {}
    return {
      fontSize: 'base', // 'sm' | 'base' | 'lg' | 'xl'
      fontFamily: 'sans', // 'sans' | 'serif' | 'mono'
      lineHeight: 'normal', // 'tight' | 'normal' | 'loose'
      theme: 'system', // 'system' | 'light' | 'sepia' | 'dark' | 'oled'
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

  // Synchronize Telegram header and background colors with reader theme
  useEffect(() => {
    const activeTheme = typography.theme || 'system';
    const themeBgColors = {
      system: tg?.themeParams?.bg_color || '#ffffff',
      default: tg?.themeParams?.bg_color || '#ffffff',
      light: '#ffffff',
      sepia: '#fbf0d9',
      dark: '#18181b',
      oled: '#000000',
    };
    const themeNavColors = {
      system: tg?.themeParams?.bg_color || '#ffffff',
      default: tg?.themeParams?.bg_color || '#ffffff',
      light: '#ffffff',
      sepia: '#f4e6c9',
      dark: '#18181b',
      oled: '#000000',
    };

    setTelegramColors({
      headerColor: themeNavColors[activeTheme] || themeNavColors.system,
      backgroundColor: themeBgColors[activeTheme] || themeBgColors.system,
    });

    return () => {
      resetTelegramColors();
    };
  }, [typography.theme]);

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
  const currentTheme = typography.theme === 'default' ? 'system' : (typography.theme || 'system');
  const themeClass = `reader-theme-${currentTheme}`;
  const currentFontSize = FONT_SIZE_MAP[typography.fontSize] || FONT_SIZE_MAP.base;
  const currentLineHeight = LINE_HEIGHT_MAP[typography.lineHeight] || LINE_HEIGHT_MAP.normal;
  const currentFontFamily = FONT_FAMILY_MAP[typography.fontFamily] || FONT_FAMILY_MAP.sans;

  // Clean article content to remove inline styling overrides
  const rawContent = article.content || article.summary || `<p>${t('no_content_preview')}</p>`;
  const sanitizedContent = useMemo(() => cleanArticleContent(rawContent), [rawContent]);

  return (
    <div
      className={`min-h-screen pb-24 transition-colors duration-200 ${themeClass}`}
      style={{
        backgroundColor: 'var(--reader-bg)',
        color: 'var(--reader-text)',
        '--reader-font-size': currentFontSize,
        '--reader-line-height': currentLineHeight,
        '--reader-font-family': currentFontFamily,
        fontFamily: currentFontFamily,
      }}
    >
      {/* Top Navigation Bar */}
      <nav
        className="sticky top-0 z-40 flex items-center justify-between px-3 py-2.5 backdrop-blur-md border-b"
        style={{
          backgroundColor: 'var(--reader-nav-bg)',
          borderColor: 'var(--reader-border)',
          color: 'var(--reader-text)',
        }}
      >
        <button
          type="button"
          onClick={() => {
            hapticFeedback('light');
            onBack();
          }}
          className="flex items-center gap-1 py-1 px-2 rounded-lg text-sm font-semibold opacity-90 hover:opacity-100 hover:bg-[var(--reader-interactive-hover)] active:scale-95 transition-all"
          style={{ color: 'var(--reader-text)' }}
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
              isTypographyOpen
                ? 'bg-tg-button text-tg-button-text'
                : 'hover:bg-[var(--reader-interactive-hover)]'
            }`}
            style={{ color: isTypographyOpen ? undefined : 'var(--reader-text)' }}
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
            className="p-2 rounded-full opacity-90 hover:opacity-100 hover:bg-[var(--reader-interactive-hover)] active:scale-95 transition-all"
            style={{ color: 'var(--reader-text)' }}
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
            className="p-2 rounded-full opacity-90 hover:opacity-100 hover:bg-[var(--reader-interactive-hover)] active:scale-95 transition-all"
            style={{ color: 'var(--reader-text)' }}
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
            className="p-2 rounded-full opacity-90 hover:opacity-100 hover:bg-[var(--reader-interactive-hover)] active:scale-95 transition-all"
            style={{ color: 'var(--reader-text)' }}
          >
            <Share2 className="w-5 h-5" />
          </button>

          {article.link && (
            <button
              type="button"
              onClick={() => openExternalLink(article.link)}
              title={t('open_in_browser')}
              className="p-2 rounded-full opacity-90 hover:opacity-100 hover:bg-[var(--reader-interactive-hover)] active:scale-95 transition-all"
              style={{ color: 'var(--reader-text)' }}
            >
              <ExternalLink className="w-5 h-5" />
            </button>
          )}
        </div>
      </nav>

      {/* Typography Drawer / Sheet */}
      {isTypographyOpen && (
        <div
          className="sticky top-[53px] z-30 p-4 border-b shadow-lg animate-in slide-in-from-top-2 duration-200 backdrop-blur-md"
          style={{
            backgroundColor: 'var(--reader-nav-bg)',
            borderColor: 'var(--reader-border)',
            color: 'var(--reader-text)',
          }}
        >
          <div className="max-w-2xl mx-auto space-y-4 text-xs">
            {/* Header */}
            <div className="flex items-center justify-between">
              <span
                className="font-bold uppercase tracking-wider text-[11px]"
                style={{ color: 'var(--reader-text-muted)' }}
              >
                Typography & Themes
              </span>
              <button
                type="button"
                onClick={() => setIsTypographyOpen(false)}
                className="p-1 rounded-full transition-colors hover:opacity-100"
                style={{ color: 'var(--reader-text-muted)' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Font Size Row */}
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium" style={{ color: 'var(--reader-text-muted)' }}>
                Size
              </span>
              <div
                className="flex items-center gap-1 p-1 rounded-xl border"
                style={{
                  backgroundColor: 'var(--reader-card-bg)',
                  borderColor: 'var(--reader-border)',
                }}
              >
                {FONT_SIZE_OPTIONS.map((s) => {
                  const isActive = typography.fontSize === s.key;
                  return (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() => {
                        hapticFeedback('light');
                        updateTypography({ fontSize: s.key });
                      }}
                      className="px-3 py-1 rounded-lg font-bold text-xs transition-all active:scale-95"
                      style={{
                        backgroundColor: isActive ? 'var(--color-tg-button, #2563eb)' : 'transparent',
                        color: isActive ? 'var(--color-tg-button-text, #ffffff)' : 'var(--reader-text-muted)',
                      }}
                    >
                      {s.text}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Font Family Row */}
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium" style={{ color: 'var(--reader-text-muted)' }}>
                Font
              </span>
              <div
                className="flex items-center gap-1 p-1 rounded-xl border"
                style={{
                  backgroundColor: 'var(--reader-card-bg)',
                  borderColor: 'var(--reader-border)',
                }}
              >
                {FONT_FAMILY_OPTIONS.map((f) => {
                  const isActive = typography.fontFamily === f.key;
                  return (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => {
                        hapticFeedback('light');
                        updateTypography({ fontFamily: f.key });
                      }}
                      className="px-2.5 py-1 rounded-lg font-semibold text-xs transition-all active:scale-95"
                      style={{
                        backgroundColor: isActive ? 'var(--color-tg-button, #2563eb)' : 'transparent',
                        color: isActive ? 'var(--color-tg-button-text, #ffffff)' : 'var(--reader-text-muted)',
                      }}
                    >
                      {f.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Line Spacing Row */}
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium" style={{ color: 'var(--reader-text-muted)' }}>
                Spacing
              </span>
              <div
                className="flex items-center gap-1 p-1 rounded-xl border"
                style={{
                  backgroundColor: 'var(--reader-card-bg)',
                  borderColor: 'var(--reader-border)',
                }}
              >
                {LINE_SPACING_OPTIONS.map((lh) => {
                  const isActive = typography.lineHeight === lh.key;
                  return (
                    <button
                      key={lh.key}
                      type="button"
                      onClick={() => {
                        hapticFeedback('light');
                        updateTypography({ lineHeight: lh.key });
                      }}
                      className="px-3 py-1 rounded-lg font-semibold text-xs transition-all active:scale-95"
                      style={{
                        backgroundColor: isActive ? 'var(--color-tg-button, #2563eb)' : 'transparent',
                        color: isActive ? 'var(--color-tg-button-text, #ffffff)' : 'var(--reader-text-muted)',
                      }}
                    >
                      {lh.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Reading Theme Row */}
            <div className="flex flex-col gap-1.5 pt-1">
              <span className="font-medium" style={{ color: 'var(--reader-text-muted)' }}>
                Theme
              </span>
              <div className="grid grid-cols-5 gap-1.5">
                {THEME_OPTIONS.map((th) => {
                  const isCurrentActive =
                    typography.theme === th.key ||
                    (th.key === 'system' && (!typography.theme || typography.theme === 'default'));
                  return (
                    <button
                      key={th.key}
                      type="button"
                      onClick={() => {
                        hapticFeedback('light');
                        updateTypography({ theme: th.key });
                      }}
                      className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl text-[11px] font-semibold transition-all active:scale-95 ${
                        isCurrentActive
                          ? 'ring-2 ring-tg-button shadow-sm scale-102'
                          : 'opacity-85 hover:opacity-100'
                      }`}
                      style={{
                        backgroundColor: th.bg,
                        color: th.fg,
                        border: `1px solid ${th.border}`,
                      }}
                    >
                      <span className="text-sm leading-none mb-1">{th.icon}</span>
                      <span>{th.label}</span>
                    </button>
                  );
                })}
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
      <main
        className="max-w-2xl mx-auto px-4 pt-6"
        style={{
          color: 'var(--reader-text)',
        }}
      >
        {/* Source metadata */}
        <div
          className="flex items-center gap-2 text-xs font-semibold mb-3 flex-wrap"
          style={{ color: 'var(--reader-text-muted)' }}
        >
          <span
            className="px-2 py-0.5 rounded-full border text-xs font-semibold"
            style={{
              backgroundColor: 'var(--reader-card-bg)',
              borderColor: 'var(--reader-border)',
              color: 'var(--reader-text)',
            }}
          >
            {article.feedTitle}
          </span>
          {article.category && article.category !== 'General' && (
            <span
              className="px-2 py-0.5 rounded-full border text-xs font-semibold"
              style={{
                backgroundColor: 'var(--reader-card-bg)',
                borderColor: 'var(--reader-border)',
                color: 'var(--reader-text)',
              }}
            >
              {article.category}
            </span>
          )}
          <span>•</span>
          <span>{timeStr}</span>
          {article.author && article.author !== article.feedTitle && (
            <>
              <span>•</span>
              <span className="truncate max-w-[200px]">{article.author}</span>
            </>
          )}
        </div>

        {/* Title */}
        {!isDuplicateHeader && (
          <h1
            className="font-extrabold leading-tight mb-4 tracking-tight"
            style={{
              fontSize: `calc(${currentFontSize} * 1.65)`,
              color: 'var(--reader-text-heading)',
              lineHeight: 1.25,
            }}
          >
            {article.title}
          </h1>
        )}

        {/* Podcast Audio Player */}
        {audioMedia && (
          <div
            className="my-4 p-3.5 rounded-xl border space-y-2"
            style={{
              backgroundColor: 'var(--reader-card-bg)',
              borderColor: 'var(--reader-border)',
              color: 'var(--reader-text)',
            }}
          >
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
          <div
            className="my-4 rounded-xl overflow-hidden bg-black border"
            style={{ borderColor: 'var(--reader-border)' }}
          >
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
            __html: sanitizedContent,
          }}
        />

        {/* Loading Indicator */}
        {isLoadingContent && (
          <div
            className="my-6 p-4 rounded-xl border flex items-center justify-center gap-2.5 animate-pulse text-xs font-medium"
            style={{
              backgroundColor: 'var(--reader-card-bg)',
              borderColor: 'var(--reader-border)',
              color: 'var(--reader-text-muted)',
            }}
          >
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
                className="px-4 py-1.5 rounded-lg text-xs font-semibold active:scale-95 transition-all inline-flex items-center gap-1.5 border"
                style={{
                  backgroundColor: 'var(--reader-card-bg)',
                  borderColor: 'var(--reader-border)',
                  color: 'var(--reader-text)',
                }}
              >
                <span>{t('retry')}</span>
              </button>
            )}
          </div>
        )}

        {/* Footer Link to Origin */}
        {article.link && (
          <div
            className="mt-10 pt-6 border-t text-center"
            style={{ borderColor: 'var(--reader-border)' }}
          >
            <button
              type="button"
              onClick={() => openExternalLink(article.link)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold active:scale-95 transition-all text-sm border"
              style={{
                backgroundColor: 'var(--reader-card-bg)',
                borderColor: 'var(--reader-border)',
                color: 'var(--reader-text)',
              }}
            >
              <ExternalLink className="w-4 h-4" />
              <span>{t('read_original')}</span>
            </button>
          </div>
        )}
      </main>

      {/* Floating Bottom Toolbar */}
      <footer
        className="fixed bottom-0 inset-x-0 p-3 backdrop-blur-md border-t flex items-center justify-between max-w-2xl mx-auto z-30"
        style={{
          backgroundColor: 'var(--reader-nav-bg)',
          borderColor: 'var(--reader-border)',
          color: 'var(--reader-text)',
        }}
      >
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              hapticFeedback('medium');
              onToggleStar(article.id, !isStarred);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
              isStarred
                ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-600 border-amber-300 dark:border-amber-800'
                : 'hover:opacity-90'
            }`}
            style={{
              backgroundColor: isStarred ? undefined : 'var(--reader-card-bg)',
              borderColor: isStarred ? undefined : 'var(--reader-border)',
              color: isStarred ? undefined : 'var(--reader-text)',
            }}
          >
            <Star className={`w-4 h-4 ${isStarred ? 'fill-amber-500 text-amber-500' : ''}`} />
            <span>{isStarred ? t('saved') : t('save')}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              hapticFeedback('light');
              onToggleRead(article.id, !isRead);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all hover:opacity-90"
            style={{
              backgroundColor: 'var(--reader-card-bg)',
              borderColor: 'var(--reader-border)',
              color: 'var(--reader-text)',
            }}
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
