import React, { useState } from 'react';
import {
  Star,
  CheckCircle2,
  Layers,
  Search,
  X,
  LayoutGrid,
  LayoutList,
  Folder,
  FolderOpen,
  ChevronDown,
  Check,
  SlidersHorizontal,
  Plus,
} from 'lucide-react';
import { hapticFeedback } from '../lib/telegram.js';
import { useI18n } from '../lib/i18n.js';

export function FilterBar({
  activeTab,
  onTabChange,
  feeds = [],
  categories = [],
  activeCategory = null,
  onCategorySelect,
  activeFeedUrl = null,
  onFeedSelect,
  searchQuery = '',
  onSearchChange,
  unreadTotal = 0,
  starredTotal = 0,
  viewMode = 'card',
  onToggleViewMode,
  onCreateFolder,
  onOpenManageModal,
}) {
  const [showSearch, setShowSearch] = useState(false);
  const [isFolderSheetOpen, setIsFolderSheetOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [createFolderError, setCreateFolderError] = useState('');
  const { t } = useI18n();

  // Feeds scoped to active folder if one is selected
  const visibleFeeds = activeCategory
    ? feeds.filter((f) => (f.category || 'General') === activeCategory)
    : feeds;

  // Active category object and unread count
  const activeCategoryObj = categories.find((c) => c.name === activeCategory);
  const activeFolderUnread = activeCategory ? (activeCategoryObj?.unreadCount || 0) : unreadTotal;

  // Handle quick folder creation from the sheet
  const handleQuickCreateFolder = async (e) => {
    e.preventDefault();
    const clean = newFolderName.trim();
    if (!clean || isCreatingFolder) return;

    if (clean.toLowerCase() === 'general') {
      setCreateFolderError('"General" already exists.');
      return;
    }

    const existingNames = ['General', ...categories.map((c) => c.name)];
    if (existingNames.some((n) => n.toLowerCase() === clean.toLowerCase())) {
      setCreateFolderError(`"${clean}" already exists.`);
      return;
    }

    setIsCreatingFolder(true);
    setCreateFolderError('');

    try {
      hapticFeedback('medium');
      if (onCreateFolder) {
        await onCreateFolder(clean);
      }
      hapticFeedback('success');
      setNewFolderName('');
      onCategorySelect(clean);
      setIsFolderSheetOpen(false);
    } catch (err) {
      hapticFeedback('error');
      setCreateFolderError(err.message || 'Failed to create folder');
    } finally {
      setIsCreatingFolder(false);
    }
  };

  return (
    <div className="bg-tg-bg border-b border-tg-border px-4 py-2 space-y-2">
      {/* 1. Article Status Tabs + View Mode + Search */}
      <div className="flex items-center justify-between gap-1">
        <div className="grid grid-cols-3 gap-1 bg-tg-secondary p-1 rounded-xl w-full max-w-sm">
          <button
            type="button"
            onClick={() => {
              hapticFeedback('light');
              onTabChange('unread');
            }}
            className={`flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'unread'
                ? 'bg-tg-bg text-tg-button shadow-xs'
                : 'text-tg-hint hover:text-tg-text'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{t('tab_unread')}</span>
            {unreadTotal > 0 && (
              <span
                className={`px-1 rounded-full text-[10px] ${
                  activeTab === 'unread'
                    ? 'bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-bold'
                    : 'bg-gray-200 dark:bg-gray-700 text-tg-hint'
                }`}
              >
                {unreadTotal}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              hapticFeedback('light');
              onTabChange('all');
            }}
            className={`flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'all'
                ? 'bg-tg-bg text-tg-button shadow-xs'
                : 'text-tg-hint hover:text-tg-text'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>{t('tab_all')}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              hapticFeedback('light');
              onTabChange('starred');
            }}
            className={`flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'starred'
                ? 'bg-tg-bg text-amber-500 shadow-xs'
                : 'text-tg-hint hover:text-tg-text'
            }`}
          >
            <Star className={`w-3.5 h-3.5 ${activeTab === 'starred' ? 'fill-amber-500' : ''}`} />
            <span>{t('tab_starred')}</span>
            {starredTotal > 0 && (
              <span className="px-1 rounded-full text-[10px] bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 font-bold">
                {starredTotal}
              </span>
            )}
          </button>
        </div>

        <div className="flex items-center gap-1">
          {/* View Mode Toggle Button */}
          {onToggleViewMode && (
            <button
              type="button"
              onClick={() => {
                hapticFeedback('light');
                onToggleViewMode();
              }}
              className="p-2 rounded-lg text-tg-hint hover:text-tg-text hover:bg-tg-secondary transition-all"
              title={viewMode === 'compact' ? 'Switch to Card View' : 'Switch to Compact View'}
            >
              {viewMode === 'compact' ? (
                <LayoutList className="w-4 h-4 text-tg-button" />
              ) : (
                <LayoutGrid className="w-4 h-4" />
              )}
            </button>
          )}

          {/* Search Toggle */}
          <button
            type="button"
            onClick={() => {
              hapticFeedback('light');
              setShowSearch(!showSearch);
            }}
            className={`p-2 rounded-lg transition-all ${
              showSearch || searchQuery ? 'bg-tg-button text-tg-button-text' : 'text-tg-hint hover:bg-tg-secondary'
            }`}
            title={t('search_placeholder')}
          >
            <Search className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2. Expandable Search Input */}
      {(showSearch || searchQuery) && (
        <div className="relative flex items-center">
          <input
            type="text"
            placeholder={t('search_placeholder')}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-8 pr-8 py-1.5 bg-tg-secondary text-tg-text text-sm rounded-lg border border-transparent focus:border-tg-button focus:outline-hidden transition-all placeholder:text-tg-hint"
            autoFocus
          />
          <Search className="absolute left-2.5 w-4 h-4 text-tg-hint pointer-events-none" />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute right-2.5 text-tg-hint hover:text-tg-text p-0.5 rounded-full"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* 3. Unified Scope Bar: Sticky Folder Selector Chip + Feed Carousel (Single Row) */}
      <div className="flex items-center gap-1.5 text-xs py-0.5">
        {/* Sticky Folder Chip */}
        <button
          type="button"
          onClick={() => {
            hapticFeedback('light');
            setIsFolderSheetOpen(true);
          }}
          className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl font-medium transition-all shadow-xs cursor-pointer ${
            activeCategory
              ? 'bg-tg-button text-tg-button-text font-semibold'
              : 'bg-tg-secondary text-tg-text hover:bg-tg-secondary/80 border border-tg-border/70'
          }`}
          title="Filter by Folder"
        >
          {activeCategory ? (
            <FolderOpen className="w-3.5 h-3.5 shrink-0" />
          ) : (
            <Folder className="w-3.5 h-3.5 text-tg-button shrink-0" />
          )}
          <span className="max-w-[100px] truncate">
            {activeCategory || t('all_feeds')}
          </span>
          {activeFolderUnread > 0 && (
            <span
              className={`px-1 rounded-full text-[10px] font-bold ${
                activeCategory
                  ? 'bg-white/20 text-white'
                  : 'bg-tg-border text-tg-text'
              }`}
            >
              {activeFolderUnread}
            </span>
          )}
          <ChevronDown
            className={`w-3 h-3 shrink-0 ${activeCategory ? 'opacity-80' : 'text-tg-hint'}`}
          />
        </button>

        {/* Subtle Vertical Divider */}
        <div className="h-5 w-px bg-tg-border/70 shrink-0 mx-0.5" />

        {/* Horizontal Feed Pills Carousel */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 flex-1 min-w-0">
          {/* All Feeds (in current folder) Pill */}
          <button
            type="button"
            onClick={() => {
              hapticFeedback('light');
              onFeedSelect(null);
            }}
            className={`whitespace-nowrap px-3 py-1 rounded-full font-medium transition-all shrink-0 ${
              !activeFeedUrl
                ? 'bg-tg-secondary text-tg-text font-bold border border-tg-border shadow-xs'
                : 'bg-tg-secondary/70 text-tg-hint hover:text-tg-text'
            }`}
          >
            {activeCategory ? `All ${activeCategory}` : t('all_feeds')}
          </button>

          {/* Individual Feed Pills */}
          {visibleFeeds.map((feed) => {
            const isSelected = activeFeedUrl === feed.feedUrl;
            return (
              <button
                key={feed.feedUrl}
                type="button"
                onClick={() => {
                  hapticFeedback('light');
                  onFeedSelect(isSelected ? null : feed.feedUrl);
                }}
                className={`whitespace-nowrap flex items-center gap-1.5 px-3 py-1 rounded-full font-medium transition-all shrink-0 ${
                  isSelected
                    ? 'bg-tg-button text-tg-button-text font-semibold shadow-xs'
                    : 'bg-tg-secondary text-tg-hint hover:text-tg-text'
                }`}
              >
                <span className="max-w-[140px] truncate">{feed.title || feed.customTitle || feed.feedUrl}</span>
                {feed.unreadCount > 0 && (
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                      isSelected
                        ? 'bg-white/20 text-white'
                        : 'bg-tg-border text-tg-text font-semibold'
                    }`}
                  >
                    {feed.unreadCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. Folder Selector Bottom Sheet */}
      {isFolderSheetOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in duration-200"
          onClick={() => setIsFolderSheetOpen(false)}
        >
          <div
            className="w-full max-w-md bg-tg-bg rounded-t-2xl sm:rounded-2xl border border-tg-border shadow-2xl p-4 flex flex-col max-h-[85vh] animate-in slide-in-from-bottom duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Grab Handle for Mobile */}
            <div className="w-10 h-1 bg-tg-border rounded-full mx-auto mb-3 sm:hidden" />

            {/* Sheet Header */}
            <div className="flex items-center justify-between pb-3 border-b border-tg-border">
              <div className="flex items-center gap-2">
                <Folder className="w-4 h-4 text-tg-button" />
                <h3 className="text-sm font-bold text-tg-text">Select Folder</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsFolderSheetOpen(false)}
                className="p-1 rounded-full text-tg-hint hover:text-tg-text hover:bg-tg-secondary transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable Folder List */}
            <div className="py-2 space-y-1.5 overflow-y-auto max-h-[50vh]">
              {/* Option: All Feeds (Root) */}
              <button
                type="button"
                onClick={() => {
                  hapticFeedback('light');
                  onCategorySelect(null);
                  setIsFolderSheetOpen(false);
                }}
                className={`w-full flex items-center justify-between p-2.5 rounded-xl transition-all ${
                  !activeCategory
                    ? 'bg-tg-secondary font-bold text-tg-button border border-tg-button/20 shadow-xs'
                    : 'hover:bg-tg-secondary/60 text-tg-text font-medium'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className={`p-1.5 rounded-lg ${
                      !activeCategory
                        ? 'bg-tg-button/15 text-tg-button'
                        : 'bg-tg-secondary text-tg-hint'
                    }`}
                  >
                    <Layers className="w-4 h-4" />
                  </div>
                  <div className="text-left truncate">
                    <span className="text-xs font-semibold block">{t('all_feeds')}</span>
                    <span className="text-[10px] text-tg-hint font-normal">
                      {feeds.length} subscription{feeds.length === 1 ? '' : 's'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {unreadTotal > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300">
                      {unreadTotal}
                    </span>
                  )}
                  {!activeCategory && <Check className="w-4 h-4 text-tg-button" />}
                </div>
              </button>

              {/* Individual Folders List */}
              {categories.map((cat) => {
                const isSelected = activeCategory === cat.name;
                const catFeedCount = feeds.filter(
                  (f) => (f.category || 'General') === cat.name
                ).length;

                return (
                  <button
                    key={cat.name}
                    type="button"
                    onClick={() => {
                      hapticFeedback('light');
                      onCategorySelect(cat.name);
                      setIsFolderSheetOpen(false);
                    }}
                    className={`w-full flex items-center justify-between p-2.5 rounded-xl transition-all ${
                      isSelected
                        ? 'bg-tg-secondary font-bold text-tg-button border border-tg-button/20 shadow-xs'
                        : 'hover:bg-tg-secondary/60 text-tg-text font-medium'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`p-1.5 rounded-lg ${
                          isSelected
                            ? 'bg-tg-button/15 text-tg-button'
                            : 'bg-tg-secondary text-tg-hint'
                        }`}
                      >
                        {isSelected ? (
                          <FolderOpen className="w-4 h-4" />
                        ) : (
                          <Folder className="w-4 h-4" />
                        )}
                      </div>
                      <div className="text-left truncate">
                        <span className="text-xs font-semibold block">{cat.name}</span>
                        <span className="text-[10px] text-tg-hint font-normal">
                          {catFeedCount} feed{catFeedCount === 1 ? '' : 's'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {cat.unreadCount > 0 && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300">
                          {cat.unreadCount}
                        </span>
                      )}
                      {isSelected && <Check className="w-4 h-4 text-tg-button" />}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Sheet Footer: Create Folder + Manage Feeds */}
            <div className="pt-3 border-t border-tg-border space-y-2">
              {/* Quick Create Folder Input */}
              <form onSubmit={handleQuickCreateFolder} className="space-y-1">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Create new folder..."
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    className="flex-1 px-3 py-1.5 bg-tg-secondary text-tg-text text-xs rounded-xl border border-tg-border focus:border-tg-button focus:outline-hidden placeholder:text-tg-hint"
                  />
                  <button
                    type="submit"
                    disabled={!newFolderName.trim() || isCreatingFolder}
                    className="px-3.5 py-1.5 bg-tg-button text-tg-button-text text-xs font-bold rounded-xl shadow-xs hover:opacity-90 active:scale-95 transition-all disabled:opacity-40"
                  >
                    {isCreatingFolder ? '...' : '+ Create'}
                  </button>
                </div>
                {createFolderError && (
                  <p className="text-[11px] text-red-500 font-medium px-1">{createFolderError}</p>
                )}
              </form>

              {/* Manage Folders & Subscriptions Full Modal Action */}
              <button
                type="button"
                onClick={() => {
                  hapticFeedback('light');
                  setIsFolderSheetOpen(false);
                  onOpenManageModal?.('folders');
                }}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold text-tg-hint hover:text-tg-text hover:bg-tg-secondary transition-all"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Manage Folders & Subscriptions</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
