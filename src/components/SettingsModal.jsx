import React, { useState, useEffect } from 'react';
import {
  X,
  User,
  Rss,
  CheckCircle2,
  Star,
  FileText,
  Send,
  Sparkles,
  Globe,
  Download,
  Upload,
  Key,
  Copy,
  Check,
  RefreshCw,
  FolderSync,
  ShieldCheck,
} from 'lucide-react';
import { getTelegramUser, openExternalLink, hapticFeedback } from '../lib/telegram.js';
import { useI18n } from '../lib/i18n.js';
import { callApi } from '../lib/api.js';

export function SettingsModal({
  isOpen,
  onClose,
  stats = { totalFeeds: 0, totalUnread: 0, totalStarred: 0 },
  apiKey: initialApiKey = null,
  onFeedsUpdated,
  onOpenAdminStats,
}) {
  if (!isOpen) return null;

  const user = getTelegramUser();
  const { t, lang, setLang, setAutoLang, isAuto, supportedLanguages } = useI18n();

  const [apiKey, setApiKey] = useState(initialApiKey);
  const [isGeneratingKey, setIsGeneratingKey] = useState(false);
  const [copiedField, setCopiedField] = useState(null);
  const [syncStatusMsg, setSyncStatusMsg] = useState(null);
  const [isProcessingFile, setIsProcessingFile] = useState(false);

  useEffect(() => {
    if (!apiKey) {
      callApi('manage_feed', { action: 'get_api_key' })
        .then((res) => {
          if (res?.apiKey) setApiKey(res.apiKey);
        })
        .catch(() => {});
    }
  }, [apiKey]);

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

  const handleGenerateApiKey = async () => {
    setIsGeneratingKey(true);
    hapticFeedback('medium');
    try {
      const res = await callApi('manage_feed', { action: 'generate_api_key' });
      if (res?.apiKey) {
        setApiKey(res.apiKey);
        hapticFeedback('success');
      }
    } catch (err) {
      hapticFeedback('error');
    } finally {
      setIsGeneratingKey(false);
    }
  };

  const handleCopy = (text, fieldName) => {
    hapticFeedback('light');
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
    }
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 1800);
  };

  // 1. Export OPML
  const handleExportOpml = async () => {
    hapticFeedback('medium');
    try {
      setSyncStatusMsg('Generating OPML...');
      const res = await callApi('manage_feed', { action: 'export_opml' });
      if (res?.opmlXml) {
        const blob = new Blob([res.opmlXml], { type: 'text/x-opml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `slrss_subscriptions_${new Date().toISOString().slice(0, 10)}.opml`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        hapticFeedback('success');
        setSyncStatusMsg('OPML exported successfully!');
      }
    } catch (err) {
      hapticFeedback('error');
      setSyncStatusMsg(`Export failed: ${err.message}`);
    } finally {
      setTimeout(() => setSyncStatusMsg(null), 3000);
    }
  };

  // 2. Import OPML File
  const handleImportOpmlFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingFile(true);
    setSyncStatusMsg('Importing OPML...');
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const xml = event.target?.result;
        const res = await callApi('manage_feed', { action: 'import_opml', opmlXml: xml });
        hapticFeedback('success');
        setSyncStatusMsg(`Imported ${res?.importedCount || 0} feeds!`);
        if (onFeedsUpdated) onFeedsUpdated();
      } catch (err) {
        hapticFeedback('error');
        setSyncStatusMsg(`Import failed: ${err.message}`);
      } finally {
        setIsProcessingFile(false);
        setTimeout(() => setSyncStatusMsg(null), 3000);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // 3. Export JSON Backup
  const handleExportBackup = async () => {
    hapticFeedback('medium');
    try {
      setSyncStatusMsg('Generating JSON backup...');
      const backupData = await callApi('backup', { action: 'export' });
      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `slrss_backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      hapticFeedback('success');
      setSyncStatusMsg('Backup JSON downloaded!');
    } catch (err) {
      hapticFeedback('error');
      setSyncStatusMsg(`Backup failed: ${err.message}`);
    } finally {
      setTimeout(() => setSyncStatusMsg(null), 3000);
    }
  };

  // 4. Restore JSON Backup
  const handleRestoreBackupFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingFile(true);
    setSyncStatusMsg('Restoring backup...');
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const rawJson = event.target?.result;
        const parsed = JSON.parse(rawJson);
        const res = await callApi('backup', { action: 'import', backupData: parsed });
        hapticFeedback('success');
        setSyncStatusMsg(`Restored ${res?.subscriptionsImported || 0} feeds, ${res?.statesRestored || 0} articles!`);
        if (onFeedsUpdated) onFeedsUpdated();
      } catch (err) {
        hapticFeedback('error');
        setSyncStatusMsg(`Restore failed: ${err.message}`);
      } finally {
        setIsProcessingFile(false);
        setTimeout(() => setSyncStatusMsg(null), 3500);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const appDomain = window.location.origin;

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

          {/* Admin Dashboard Entry */}
          {onOpenAdminStats && (
            <button
              type="button"
              onClick={() => {
                hapticFeedback('medium');
                onClose();
                onOpenAdminStats();
              }}
              className="w-full flex items-center justify-between p-3.5 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/20 text-xs font-semibold transition-all text-left"
            >
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-4 h-4 text-blue-500" />
                <span>Admin Stats & Operations</span>
              </div>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-500">
                Creator
              </span>
            </button>
          )}

          {/* OPML & Data Management */}
          <div className="p-3.5 rounded-xl bg-tg-secondary border border-tg-border space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-tg-text flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-emerald-600" />
                Data & Subscriptions
              </span>
            </div>

            {syncStatusMsg && (
              <div className="p-2 rounded-lg bg-tg-bg text-xs font-medium text-tg-button border border-tg-border text-center">
                {syncStatusMsg}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={handleExportOpml}
                disabled={isProcessingFile}
                className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-tg-bg text-tg-text font-semibold border border-tg-border hover:bg-tg-secondary active:scale-95 transition-all"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export OPML</span>
              </button>

              <label className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-tg-bg text-tg-text font-semibold border border-tg-border hover:bg-tg-secondary active:scale-95 transition-all cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                <span>Import OPML</span>
                <input
                  type="file"
                  accept=".opml,.xml"
                  onChange={handleImportOpmlFile}
                  disabled={isProcessingFile}
                  className="hidden"
                />
              </label>

              <button
                type="button"
                onClick={handleExportBackup}
                disabled={isProcessingFile}
                className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-tg-bg text-tg-text font-semibold border border-tg-border hover:bg-tg-secondary active:scale-95 transition-all"
              >
                <Download className="w-3.5 h-3.5 text-blue-500" />
                <span>Backup JSON</span>
              </button>

              <label className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-tg-bg text-tg-text font-semibold border border-tg-border hover:bg-tg-secondary active:scale-95 transition-all cursor-pointer">
                <Upload className="w-3.5 h-3.5 text-blue-500" />
                <span>Restore JSON</span>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleRestoreBackupFile}
                  disabled={isProcessingFile}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* Fluent Reader & Sync Integration */}
          <div className="p-3.5 rounded-xl bg-tg-secondary border border-tg-border space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-tg-text flex items-center gap-1.5">
                <FolderSync className="w-4 h-4 text-tg-button" />
                Fluent Reader & Sync APIs
              </span>
              <button
                type="button"
                onClick={handleGenerateApiKey}
                disabled={isGeneratingKey}
                className="text-[11px] font-semibold text-tg-button hover:underline flex items-center gap-1"
              >
                <RefreshCw className={`w-3 h-3 ${isGeneratingKey ? 'animate-spin' : ''}`} />
                <span>Reset Key</span>
              </button>
            </div>

            <p className="text-[11px] text-tg-hint leading-relaxed">
              Connect <b>Fluent Reader</b> (Desktop) or <b>Fluent Reader Lite</b> (Mobile) to slrssbot using standard Fever or Google Reader APIs:
            </p>

            {/* API Key Field */}
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-tg-hint uppercase">API Key / Token</span>
              <div className="flex items-center gap-1.5 bg-tg-bg p-2 rounded-lg border border-tg-border font-mono text-xs">
                <span className="flex-1 truncate">{apiKey || 'Generating key...'}</span>
                {apiKey && (
                  <button
                    type="button"
                    onClick={() => handleCopy(apiKey, 'apiKey')}
                    className="p-1 rounded text-tg-hint hover:text-tg-text"
                  >
                    {copiedField === 'apiKey' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                )}
              </div>
            </div>

            {/* Endpoints */}
            <div className="space-y-1 text-xs">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-tg-hint font-medium">Fever API Endpoint:</span>
                <button
                  type="button"
                  onClick={() => handleCopy(`${appDomain}/api/fever`, 'fever')}
                  className="font-mono text-tg-button flex items-center gap-1 text-[11px] hover:underline"
                >
                  {copiedField === 'fever' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  <span>/api/fever</span>
                </button>
              </div>

              <div className="flex items-center justify-between text-[11px]">
                <span className="text-tg-hint font-medium">Google Reader API:</span>
                <button
                  type="button"
                  onClick={() => handleCopy(`${appDomain}/api/greader`, 'greader')}
                  className="font-mono text-tg-button flex items-center gap-1 text-[11px] hover:underline"
                >
                  {copiedField === 'greader' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  <span>/api/greader</span>
                </button>
              </div>
            </div>
          </div>

          <div className="text-center pt-1 text-[11px] text-tg-hint font-mono">
            Telegram Serverless RSS Bot v1.2
          </div>
        </div>
      </div>
    </div>
  );
}
