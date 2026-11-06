import React, { useState } from 'react';
import {
  X,
  Plus,
  Trash2,
  RefreshCw,
  Sliders,
  Check,
  AlertCircle,
  ExternalLink,
  Pause,
  Play,
} from 'lucide-react';
import { hapticFeedback, openExternalLink } from '../lib/telegram.js';
import { useI18n } from '../lib/i18n.js';

export function FeedManagerModal({
  isOpen,
  onClose,
  feeds = [],
  onSubscribeFeed,
  onUpdateFeed,
  onUnsubscribeFeed,
  onRefreshFeed,
  initialTab = 'add',
}) {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState(initialTab); // 'add' | 'list'
  const [urlInput, setUrlInput] = useState('');
  const [customTitleInput, setCustomTitleInput] = useState('');
  const [sendModeInput, setSendModeInput] = useState('default');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [refreshingFeedUrl, setRefreshingFeedUrl] = useState(null);

  if (!isOpen) return null;

  async function handleAddSubmit(e) {
    e.preventDefault();
    if (!urlInput.trim()) return;

    setIsSubmitting(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      hapticFeedback('medium');
      await onSubscribeFeed({
        url: urlInput.trim(),
        customTitle: customTitleInput.trim() || undefined,
        sendMode: sendModeInput,
      });
      hapticFeedback('success');
      setSuccessMsg(t('subscribing'));
      setUrlInput('');
      setCustomTitleInput('');
      setTimeout(() => {
        setSuccessMsg('');
        setActiveTab('list');
      }, 1200);
    } catch (err) {
      hapticFeedback('error');
      setErrorMsg(err.message || t('subscribe_failed'));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRefresh(feedUrl) {
    setRefreshingFeedUrl(feedUrl);
    hapticFeedback('light');
    try {
      await onRefreshFeed(feedUrl);
      hapticFeedback('success');
    } catch (err) {
      hapticFeedback('error');
    } finally {
      setRefreshingFeedUrl(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div
        className="w-full max-w-lg bg-tg-bg rounded-2xl shadow-xl border border-tg-border overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-tg-border bg-tg-secondary/30">
          <h2 className="text-base font-bold text-tg-text">{t('manage_feeds_title')}</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-full text-tg-hint hover:text-tg-text hover:bg-tg-secondary"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-tg-border px-5 pt-2 gap-4 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab('add')}
            className={`pb-2.5 flex items-center gap-1.5 border-b-2 transition-all ${
              activeTab === 'add'
                ? 'border-tg-button text-tg-button'
                : 'border-transparent text-tg-hint hover:text-tg-text'
            }`}
          >
            <Plus className="w-4 h-4" />
            <span>{t('add_feed')}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('list')}
            className={`pb-2.5 flex items-center gap-1.5 border-b-2 transition-all ${
              activeTab === 'list'
                ? 'border-tg-button text-tg-button'
                : 'border-transparent text-tg-hint hover:text-tg-text'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>{t('my_feeds')} ({feeds.length})</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto flex-1">
          {activeTab === 'add' ? (
            <form onSubmit={handleAddSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-tg-hint mb-1">
                  {t('feed_url_placeholder')}
                </label>
                <input
                  type="text"
                  placeholder={t('feed_url_placeholder')}
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-tg-secondary text-tg-text text-sm border border-transparent focus:border-tg-button focus:outline-hidden transition-all"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-tg-hint mb-1">
                  {t('custom_title_placeholder')}
                </label>
                <input
                  type="text"
                  placeholder={t('custom_title_placeholder')}
                  value={customTitleInput}
                  onChange={(e) => setCustomTitleInput(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-tg-secondary text-tg-text text-sm border border-transparent focus:border-tg-button focus:outline-hidden transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-tg-hint mb-1">
                  {t('delivery_mode')}
                </label>
                <select
                  value={sendModeInput}
                  onChange={(e) => setSendModeInput(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-tg-secondary text-tg-text text-sm border border-transparent focus:border-tg-button focus:outline-hidden transition-all"
                >
                  <option value="default">{t('mode_default')}</option>
                  <option value="telegraph">{t('mode_telegraph')}</option>
                  <option value="photo">{t('mode_photo')}</option>
                  <option value="link_only">{t('mode_link_only')}</option>
                </select>
              </div>

              {errorMsg && (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {successMsg && (
                <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-2">
                  <Check className="w-4 h-4 shrink-0" />
                  <span>{successMsg}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting || !urlInput.trim()}
                className="w-full py-2.5 px-4 rounded-xl bg-tg-button text-tg-button-text font-semibold text-sm shadow-xs hover:opacity-90 active:scale-98 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>{t('subscribing')}</span>
                  </>
                ) : (
                  <span>{t('subscribe_btn')}</span>
                )}
              </button>
            </form>
          ) : (
            <div className="space-y-3">
              {feeds.length === 0 ? (
                <p className="text-center text-tg-hint text-sm py-8">
                  {t('no_feeds_yet')}
                </p>
              ) : (
                feeds.map((feed) => (
                  <div
                    key={feed.feedUrl}
                    className="p-3.5 rounded-xl bg-tg-secondary/50 border border-tg-border space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <h4 className="text-sm font-bold text-tg-text truncate">
                          {feed.title}
                        </h4>
                        <p className="text-[11px] text-tg-hint truncate font-mono">
                          {feed.feedUrl}
                        </p>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleRefresh(feed.feedUrl)}
                          disabled={refreshingFeedUrl === feed.feedUrl}
                          title={t('refresh')}
                          className="p-1.5 rounded-lg text-tg-hint hover:text-tg-text hover:bg-tg-secondary transition-all"
                        >
                          <RefreshCw
                            className={`w-4 h-4 ${
                              refreshingFeedUrl === feed.feedUrl ? 'animate-spin text-tg-button' : ''
                            }`}
                          />
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            hapticFeedback('warning');
                            if (window.confirm(`${t('confirm_unsub')}\n(${feed.title})`)) {
                              onUnsubscribeFeed(feed.feedUrl);
                            }
                          }}
                          title={t('unsubscribe')}
                          className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Mode and Pause toggles */}
                    <div className="flex items-center justify-between text-xs pt-1 border-t border-tg-border/50">
                      <div className="flex items-center gap-2">
                        <span className="text-tg-hint text-[11px]">{t('delivery_mode')}:</span>
                        <select
                          value={feed.sendMode || 'default'}
                          onChange={(e) =>
                            onUpdateFeed({ feedUrl: feed.feedUrl, sendMode: e.target.value })
                          }
                          className="px-2 py-1 rounded-md bg-tg-bg text-tg-text text-xs border border-tg-border"
                        >
                          <option value="default">{t('opt_mode_default')}</option>
                          <option value="telegraph">{t('opt_mode_telegraph')}</option>
                          <option value="photo">{t('opt_mode_photo')}</option>
                          <option value="link_only">{t('opt_mode_link_only')}</option>
                        </select>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          hapticFeedback('light');
                          onUpdateFeed({ feedUrl: feed.feedUrl, paused: !feed.paused });
                        }}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                          feed.paused
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                            : 'bg-tg-bg text-tg-hint hover:text-tg-text border border-tg-border'
                        }`}
                      >
                        {feed.paused ? (
                          <>
                            <Play className="w-3 h-3" />
                            <span>{t('paused_badge')}</span>
                          </>
                        ) : (
                          <>
                            <Pause className="w-3 h-3" />
                            <span>{t('pause')}</span>
                          </>
                        )}
                      </button>
                    </div>

                    {feed.lastError && (
                      <p className="text-[11px] text-red-500 truncate">
                        {t('error_prefix')}: {feed.lastError}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

