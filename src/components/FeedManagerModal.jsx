import React, { useState } from 'react';
import {
  X,
  Plus,
  Trash2,
  RefreshCw,
  Sliders,
  Check,
  AlertCircle,
  Pause,
  Play,
  Folder,
  FolderPlus,
  Pencil,
  Rss,
} from 'lucide-react';
import { hapticFeedback } from '../lib/telegram.js';
import { useI18n } from '../lib/i18n.js';

export function FeedManagerModal({
  isOpen,
  onClose,
  feeds = [],
  categories = [],
  onSubscribeFeed,
  onUpdateFeed,
  onUnsubscribeFeed,
  onRefreshFeed,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  initialTab = 'add',
}) {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState(initialTab); // 'feeds' | 'folders' | 'add'

  // Add Feed form state
  const [urlInput, setUrlInput] = useState('');
  const [customTitleInput, setCustomTitleInput] = useState('');
  const [categorySelect, setCategorySelect] = useState('General');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [isCreatingNewCatInAdd, setIsCreatingNewCatInAdd] = useState(false);
  const [sendModeInput, setSendModeInput] = useState('default');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [refreshingFeedUrl, setRefreshingFeedUrl] = useState(null);

  // New Folder form state
  const [folderInput, setFolderInput] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [folderErrorMsg, setFolderErrorMsg] = useState('');
  const [folderSuccessMsg, setFolderSuccessMsg] = useState('');

  if (!isOpen) return null;

  // Extract folder names list
  const folderNames = Array.from(
    new Set([
      'General',
      ...categories.map((c) => c.name),
      ...feeds.map((f) => f.category || 'General'),
    ])
  ).filter(Boolean);

  // 1. Handle Submit New Feed
  async function handleAddSubmit(e) {
    e.preventDefault();
    if (!urlInput.trim()) return;

    setIsSubmitting(true);
    setErrorMsg('');
    setSuccessMsg('');

    let finalCategory = categorySelect;
    if (isCreatingNewCatInAdd && newCategoryName.trim()) {
      finalCategory = newCategoryName.trim();
      if (onCreateFolder) {
        try {
          await onCreateFolder(finalCategory);
        } catch {}
      }
    }

    try {
      hapticFeedback('medium');
      await onSubscribeFeed({
        url: urlInput.trim(),
        customTitle: customTitleInput.trim() || undefined,
        category: finalCategory || 'General',
        sendMode: sendModeInput,
      });
      hapticFeedback('success');
      setSuccessMsg(t('subscribing'));
      setUrlInput('');
      setCustomTitleInput('');
      setNewCategoryName('');
      setIsCreatingNewCatInAdd(false);
      setCategorySelect('General');
      setTimeout(() => {
        setSuccessMsg('');
        setActiveTab('feeds');
      }, 1200);
    } catch (err) {
      hapticFeedback('error');
      setErrorMsg(err.message || t('subscribe_failed'));
    } finally {
      setIsSubmitting(false);
    }
  }

  // 2. Handle Create New Folder
  async function handleCreateFolderSubmit(e) {
    e.preventDefault();
    const cleanName = folderInput.trim();
    if (!cleanName) return;

    if (cleanName.toLowerCase() === 'general') {
      setFolderErrorMsg('"General" folder already exists as the default.');
      return;
    }

    if (folderNames.map((n) => n.toLowerCase()).includes(cleanName.toLowerCase())) {
      setFolderErrorMsg(`Folder "${cleanName}" already exists.`);
      return;
    }

    setIsCreatingFolder(true);
    setFolderErrorMsg('');
    setFolderSuccessMsg('');

    try {
      hapticFeedback('medium');
      if (onCreateFolder) {
        await onCreateFolder(cleanName);
      }
      hapticFeedback('success');
      setFolderSuccessMsg(`Folder "${cleanName}" created!`);
      setFolderInput('');
      setTimeout(() => setFolderSuccessMsg(''), 2000);
    } catch (err) {
      hapticFeedback('error');
      setFolderErrorMsg(err.message || 'Failed to create folder');
    } finally {
      setIsCreatingFolder(false);
    }
  }

  // 3. Handle Rename Folder
  async function handleRenameFolderClick(oldName) {
    if (oldName === 'General') return;
    const newName = window.prompt(`Enter new name for folder "${oldName}":`, oldName);
    if (!newName || !newName.trim() || newName.trim() === oldName) return;

    hapticFeedback('light');
    try {
      if (onRenameFolder) {
        await onRenameFolder(oldName, newName.trim());
      }
      hapticFeedback('success');
    } catch (err) {
      hapticFeedback('error');
      alert(`Could not rename folder: ${err.message}`);
    }
  }

  // 4. Handle Delete Folder
  async function handleDeleteFolderClick(folderName) {
    if (folderName === 'General') return;
    const count = feeds.filter((f) => (f.category || 'General') === folderName).length;
    const confirmText = count > 0
      ? `Delete folder "${folderName}"?\nIts ${count} feed(s) will be safely moved to "General".`
      : `Delete folder "${folderName}"?`;

    if (!window.confirm(confirmText)) return;

    hapticFeedback('warning');
    try {
      if (onDeleteFolder) {
        await onDeleteFolder(folderName);
      }
      hapticFeedback('success');
    } catch (err) {
      hapticFeedback('error');
      alert(`Could not delete folder: ${err.message}`);
    }
  }

  // 5. Handle Feed Category Change via Dropdown
  async function handleFeedCategoryChange(feedUrl, newCat) {
    if (newCat === '__new__') {
      const created = window.prompt('Create new folder and move feed to it:');
      if (created && created.trim()) {
        const cleanCreated = created.trim();
        if (onCreateFolder) {
          try {
            await onCreateFolder(cleanCreated);
          } catch {}
        }
        await onUpdateFeed({ feedUrl, category: cleanCreated });
        hapticFeedback('success');
      }
      return;
    }

    hapticFeedback('light');
    try {
      await onUpdateFeed({ feedUrl, category: newCat });
      hapticFeedback('success');
    } catch (err) {
      hapticFeedback('error');
    }
  }

  // 6. Handle Refresh Single Feed
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

        {/* 3-Tab Segmented Switcher */}
        <div className="flex border-b border-tg-border px-5 pt-2 gap-4 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab('feeds')}
            className={`pb-2.5 flex items-center gap-1.5 border-b-2 transition-all ${
              activeTab === 'feeds'
                ? 'border-tg-button text-tg-button'
                : 'border-transparent text-tg-hint hover:text-tg-text'
            }`}
          >
            <Rss className="w-4 h-4" />
            <span>Feeds ({feeds.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('folders')}
            className={`pb-2.5 flex items-center gap-1.5 border-b-2 transition-all ${
              activeTab === 'folders'
                ? 'border-tg-button text-tg-button'
                : 'border-transparent text-tg-hint hover:text-tg-text'
            }`}
          >
            <Folder className="w-4 h-4" />
            <span>Folders ({folderNames.length})</span>
          </button>

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
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto flex-1">
          {/* TAB 1: FEEDS LIST */}
          {activeTab === 'feeds' && (
            <div className="space-y-3">
              {feeds.length === 0 ? (
                <div className="text-center py-8 space-y-3">
                  <p className="text-tg-hint text-sm">{t('no_feeds_yet')}</p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('add')}
                    className="px-4 py-2 rounded-xl bg-tg-button text-tg-button-text font-semibold text-xs shadow-xs"
                  >
                    + Add your first feed
                  </button>
                </div>
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
                        <p className="text-[11px] text-tg-hint truncate font-mono mt-0.5">
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

                    {/* Mode and Category Controls */}
                    <div className="flex items-center justify-between text-xs pt-2 border-t border-tg-border/50 gap-2 flex-wrap">
                      {/* Folder / Category Selection Dropdown (1-click move) */}
                      <div className="flex items-center gap-1.5 bg-tg-bg px-2 py-1 rounded-lg border border-tg-border">
                        <Folder className="w-3.5 h-3.5 text-tg-hint shrink-0" />
                        <select
                          value={feed.category || 'General'}
                          onChange={(e) => handleFeedCategoryChange(feed.feedUrl, e.target.value)}
                          className="bg-transparent text-tg-text text-xs font-semibold focus:outline-hidden cursor-pointer"
                          title="Assign Folder"
                        >
                          {folderNames.map((name) => (
                            <option key={name} value={name}>
                              {name}
                            </option>
                          ))}
                          <option value="__new__">+ New folder...</option>
                        </select>
                      </div>

                      {/* Delivery Mode */}
                      <div className="flex items-center gap-1.5">
                        <select
                          value={feed.sendMode || 'default'}
                          onChange={(e) =>
                            onUpdateFeed({ feedUrl: feed.feedUrl, sendMode: e.target.value })
                          }
                          className="px-2 py-1 rounded-md bg-tg-bg text-tg-text text-xs border border-tg-border font-medium"
                        >
                          <option value="default">{t('opt_mode_default')}</option>
                          <option value="telegraph">{t('opt_mode_telegraph')}</option>
                          <option value="photo">{t('opt_mode_photo')}</option>
                          <option value="link_only">{t('opt_mode_link_only')}</option>
                        </select>

                        {/* Pause / Resume Button */}
                        <button
                          type="button"
                          onClick={() => {
                            hapticFeedback('light');
                            onUpdateFeed({ feedUrl: feed.feedUrl, paused: !feed.paused });
                          }}
                          className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold transition-all ${
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

          {/* TAB 2: FOLDERS MANAGEMENT */}
          {activeTab === 'folders' && (
            <div className="space-y-4">
              {/* Create Folder Form */}
              <form onSubmit={handleCreateFolderSubmit} className="p-3.5 rounded-xl bg-tg-secondary/70 border border-tg-border space-y-2.5">
                <div className="flex items-center gap-1.5 text-xs font-bold text-tg-text">
                  <FolderPlus className="w-4 h-4 text-tg-button" />
                  <span>Create New Folder</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="e.g. Technology, Crypto, Comics, Work"
                    value={folderInput}
                    onChange={(e) => setFolderInput(e.target.value)}
                    disabled={isCreatingFolder}
                    className="flex-1 px-3 py-2 rounded-xl bg-tg-bg text-tg-text text-xs border border-tg-border focus:border-tg-button focus:outline-hidden transition-all"
                  />
                  <button
                    type="submit"
                    disabled={isCreatingFolder || !folderInput.trim()}
                    className="px-4 py-2 rounded-xl bg-tg-button text-tg-button-text font-bold text-xs shadow-xs hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
                  >
                    {isCreatingFolder ? 'Creating...' : 'Create'}
                  </button>
                </div>

                {folderErrorMsg && (
                  <p className="text-[11px] text-red-500 font-medium">{folderErrorMsg}</p>
                )}
                {folderSuccessMsg && (
                  <p className="text-[11px] text-emerald-600 font-medium">{folderSuccessMsg}</p>
                )}
              </form>

              {/* Folders List */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-tg-hint uppercase tracking-wider block">
                  Your Folders ({folderNames.length})
                </span>

                {folderNames.map((catName) => {
                  const matchingFeeds = feeds.filter(
                    (f) => (f.category || 'General') === catName
                  );
                  const isDefault = catName === 'General';

                  return (
                    <div
                      key={catName}
                      className="flex items-center justify-between p-3 rounded-xl bg-tg-secondary/50 border border-tg-border"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="p-2 rounded-lg bg-tg-secondary text-tg-button">
                          <Folder className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-tg-text truncate">
                              {catName}
                            </span>
                            {isDefault && (
                              <span className="px-1.5 py-0.2 rounded-sm bg-tg-secondary text-[10px] text-tg-hint font-semibold border border-tg-border">
                                Default
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-tg-hint">
                            {matchingFeeds.length} {matchingFeeds.length === 1 ? 'feed' : 'feeds'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        {!isDefault && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleRenameFolderClick(catName)}
                              title="Rename folder"
                              className="p-1.5 rounded-lg text-tg-hint hover:text-tg-text hover:bg-tg-secondary transition-all"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteFolderClick(catName)}
                              title="Delete folder"
                              className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-all"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: ADD FEED */}
          {activeTab === 'add' && (
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

              {/* Folder Selector Dropdown */}
              <div>
                <label className="block text-xs font-semibold text-tg-hint mb-1">
                  Folder
                </label>
                <select
                  value={isCreatingNewCatInAdd ? '__new__' : categorySelect}
                  onChange={(e) => {
                    if (e.target.value === '__new__') {
                      setIsCreatingNewCatInAdd(true);
                    } else {
                      setIsCreatingNewCatInAdd(false);
                      setCategorySelect(e.target.value);
                    }
                  }}
                  disabled={isSubmitting}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-tg-secondary text-tg-text text-sm border border-transparent focus:border-tg-button focus:outline-hidden transition-all"
                >
                  {folderNames.map((name) => (
                    <option key={name} value={name}>
                      📁 {name}
                    </option>
                  ))}
                  <option value="__new__">+ Create new folder...</option>
                </select>

                {isCreatingNewCatInAdd && (
                  <div className="mt-2 animate-in fade-in duration-150">
                    <input
                      type="text"
                      placeholder="Enter new folder name..."
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      disabled={isSubmitting}
                      className="w-full px-3 py-2 rounded-xl bg-tg-bg text-tg-text text-xs border border-tg-button focus:outline-hidden"
                      autoFocus
                    />
                  </div>
                )}
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
                  <option value="default">{t('opt_mode_default')}</option>
                  <option value="telegraph">{t('opt_mode_telegraph')}</option>
                  <option value="photo">{t('opt_mode_photo')}</option>
                  <option value="link_only">{t('opt_mode_link_only')}</option>
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
          )}
        </div>
      </div>
    </div>
  );
}
