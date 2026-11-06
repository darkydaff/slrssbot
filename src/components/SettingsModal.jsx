import React from 'react';
import { X, User, Rss, CheckCircle2, Star, FileText, Send, Sparkles, Globe } from 'lucide-react';
import { getTelegramUser, openExternalLink, hapticFeedback } from '../lib/telegram.js';
import { useI18n } from '../lib/i18n.js';
import { callApi } from '../lib/api.js';

export function SettingsModal({
  isOpen,
  onClose,
  stats = { totalFeeds: 0, totalUnread: 0, totalStarred: 0 },
}) {
  if (!isOpen) return null;

  const user = getTelegramUser();
  const { t, lang, setLang, setAutoLang, isAuto, supportedLanguages } = useI18n();

  const handleLanguageChange = (e) => {
    const val = e.target.value;
    hapticFeedback('light');
    if (val === 'auto') {
      setAutoLang();
      callApi('manage_feed', { action: 'set_lang', lang: 'auto' }).catch(() => {});
    } else {
      setLang(val);
      callApi('manage_feed', { action: 'set_lang', lang: val }).catch(() => {});
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div
        className="w-full max-w-md bg-tg-bg rounded-2xl shadow-xl border border-tg-border overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-tg-border bg-tg-secondary/30">
          <h2 className="text-base font-bold text-tg-text">{t('settings_title')}</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-full text-tg-hint hover:text-tg-text hover:bg-tg-secondary"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* User Profile Card */}
          <div className="flex items-center gap-3 p-3.5 rounded-xl bg-tg-secondary border border-tg-border">
            <div className="w-10 h-10 rounded-full bg-tg-button text-tg-button-text flex items-center justify-center font-bold text-base shadow-xs">
              {user.first_name ? user.first_name[0] : <User className="w-5 h-5" />}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-bold text-tg-text truncate">
                {user.first_name} {user.last_name || ''}
              </h3>
              {user.username && (
                <p className="text-xs text-tg-hint truncate">@{user.username}</p>
              )}
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-3 rounded-xl bg-tg-secondary/60 border border-tg-border">
              <Rss className="w-4 h-4 mx-auto text-tg-button mb-1" />
              <div className="text-lg font-extrabold text-tg-text">{stats.totalFeeds || 0}</div>
              <div className="text-[10px] font-semibold text-tg-hint uppercase">{t('feeds')}</div>
            </div>

            <div className="p-3 rounded-xl bg-tg-secondary/60 border border-tg-border">
              <CheckCircle2 className="w-4 h-4 mx-auto text-emerald-600 mb-1" />
              <div className="text-lg font-extrabold text-tg-text">{stats.totalUnread || 0}</div>
              <div className="text-[10px] font-semibold text-tg-hint uppercase">{t('unread')}</div>
            </div>

            <div className="p-3 rounded-xl bg-tg-secondary/60 border border-tg-border">
              <Star className="w-4 h-4 mx-auto text-amber-500 fill-amber-500 mb-1" />
              <div className="text-lg font-extrabold text-tg-text">{stats.totalStarred || 0}</div>
              <div className="text-[10px] font-semibold text-tg-hint uppercase">{t('starred')}</div>
            </div>
          </div>

          {/* Language Selection */}
          <div className="p-3.5 rounded-xl bg-tg-secondary border border-tg-border space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-tg-text">
              <Globe className="w-4 h-4 text-tg-button" />
              <span>{t('language')}</span>
            </div>
            <select
              value={isAuto ? 'auto' : lang}
              onChange={handleLanguageChange}
              className="w-full px-3 py-2 rounded-lg bg-tg-bg text-tg-text text-sm border border-tg-border focus:border-tg-button focus:outline-hidden transition-all"
            >
              <option value="auto">
                🌐 {t('language_auto')}
              </option>
              {Object.entries(supportedLanguages).map(([code, item]) => (
                <option key={code} value={code}>
                  {item.flag} {item.native} ({item.name})
                </option>
              ))}
            </select>
          </div>

          {/* Quick Tips */}
          <div className="space-y-2.5 text-xs text-tg-hint bg-tg-secondary/40 p-4 rounded-xl border border-tg-border">
            <div className="flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-tg-button shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-tg-text">{t('tip_iv_label')}</span> {t('tip_iv')}
              </div>
            </div>

            <div className="flex items-start gap-2">
              <FileText className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-tg-text">{t('tip_opml_label')}</span> {t('tip_opml')}
              </div>
            </div>

            <div className="flex items-start gap-2">
              <Send className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-tg-text">{t('tip_channel_label')}</span> {t('tip_channel')}
              </div>
            </div>
          </div>

          <div className="text-center pt-1 text-[11px] text-tg-hint font-mono">
            Telegram Serverless RSS Bot v1.0
          </div>
        </div>
      </div>
    </div>
  );
}

