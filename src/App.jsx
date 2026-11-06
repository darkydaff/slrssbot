import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Header } from './components/Header.jsx';
import { FilterBar } from './components/FilterBar.jsx';
import { ArticleList } from './components/ArticleList.jsx';
import { ReaderView } from './components/ReaderView.jsx';
import { FeedManagerModal } from './components/FeedManagerModal.jsx';
import { SettingsModal } from './components/SettingsModal.jsx';
import { callApi } from './lib/api.js';
import { initTelegramApp, hapticFeedback } from './lib/telegram.js';

export function App() {
  const [feeds, setFeeds] = useState([]);
  const [categories, setCategories] = useState([]);
  const [activeCategory, setActiveCategory] = useState(null);
  const [stats, setStats] = useState({ totalFeeds: 0, totalUnread: 0, totalStarred: 0 });
  const [activeTab, setActiveTab] = useState('unread'); // 'unread' | 'all' | 'starred'
  const [activeFeedUrl, setActiveFeedUrl] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [articles, setArticles] = useState([]);
  const [loadingArticles, setLoadingArticles] = useState(true);
  const [articlesError, setArticlesError] = useState(null);
  const [loadingFeeds, setLoadingFeeds] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);

  // View Mode: 'card' (rich layout with images) vs 'compact' (dense fast scanning)
  const [viewMode, setViewMode] = useState(() => {
    try {
      return localStorage.getItem('slrss_view_mode') || 'card';
    } catch {
      return 'card';
    }
  });

  const [apiKey, setApiKey] = useState(null);

  // Reader state
  const [currentArticle, setCurrentArticle] = useState(null);
  const [loadingArticleContent, setLoadingArticleContent] = useState(false);

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isManageModalOpen, setIsManageModalOpen] = useState(false);
  const [manageModalTab, setManageModalTab] = useState('feeds');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const handleOpenManageModal = (tab = 'feeds') => {
    setManageModalTab(tab);
    setIsManageModalOpen(true);
  };

  // Debounced search timer
  const searchTimeoutRef = useRef(null);

  // Initialize Telegram WebApp
  useEffect(() => {
    initTelegramApp();
  }, []);

  // Fetch Feeds list, categories, and global stats
  const fetchFeeds = useCallback(async () => {
    try {
      const data = await callApi('get_feeds');
      if (data?.feeds) {
        setFeeds(data.feeds);
        if (data.categories) {
          setCategories(data.categories);
        }
        if (data.apiKey) {
          setApiKey(data.apiKey);
        }
        if (data.stats) {
          setStats(data.stats);
        }
      }
    } catch (err) {
      console.warn('[fetchFeeds] error:', err.message);
    } finally {
      setLoadingFeeds(false);
    }
  }, []);

  // Fetch Articles with pagination and filters
  const fetchArticles = useCallback(
    async ({
      tab = activeTab,
      feedUrl = activeFeedUrl,
      category = activeCategory,
      search = searchQuery,
      newOffset = 0,
      append = false,
    } = {}) => {
      setLoadingArticles(true);
      if (!append) {
        setArticlesError(null);
      }
      try {
        const res = await callApi('get_articles', {
          filter: tab,
          feedUrl: feedUrl || undefined,
          category: !feedUrl && category ? category : undefined,
          search: search || undefined,
          limit: 25,
          offset: newOffset,
        });

        const newItems = res?.articles || [];
        setHasMore(Boolean(res?.hasMore));
        setOffset(newOffset);
        setArticlesError(null);

        if (append) {
          setArticles((prev) => [...prev, ...newItems]);
        } else {
          setArticles(newItems);
        }
      } catch (err) {
        console.warn('[fetchArticles] error:', err.message);
        if (!append) {
          setArticles([]);
          setArticlesError(err.message || 'Failed to load articles');
        }
      } finally {
        setLoadingArticles(false);
      }
    },
    [activeTab, activeFeedUrl, activeCategory, searchQuery]
  );

  // Initial load
  useEffect(() => {
    fetchFeeds();
    fetchArticles({ newOffset: 0, append: false });
  }, [fetchFeeds, fetchArticles]);

  // Toggle View Mode (Card vs Compact)
  const handleToggleViewMode = () => {
    const next = viewMode === 'card' ? 'compact' : 'card';
    setViewMode(next);
    try {
      localStorage.setItem('slrss_view_mode', next);
    } catch {}
  };

  // Handle Tab Switch
  const handleTabChange = (newTab) => {
    setActiveTab(newTab);
    fetchArticles({ tab: newTab, newOffset: 0, append: false });
  };

  // Handle Category Select
  const handleCategorySelect = (catName) => {
    setActiveCategory(catName);
    setActiveFeedUrl(null);
    fetchArticles({ category: catName, feedUrl: null, newOffset: 0, append: false });
  };

  // Handle Feed Filter Pill selection
  const handleFeedSelect = (feedUrl) => {
    setActiveFeedUrl(feedUrl);
    fetchArticles({ feedUrl, newOffset: 0, append: false });
  };

  // Handle Search Input Change with debounce
  const handleSearchChange = (query) => {
    setSearchQuery(query);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      fetchArticles({ search: query, newOffset: 0, append: false });
    }, 350);
  };

  // Load more articles
  const handleLoadMore = () => {
    if (loadingArticles || !hasMore) return;
    const nextOffset = offset + 25;
    fetchArticles({ newOffset: nextOffset, append: true });
  };

  // Global Refresh feeds
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await callApi('manage_feed', { action: 'refresh', feedUrl: activeFeedUrl || undefined });
      await fetchFeeds();
      await fetchArticles({ newOffset: 0, append: false });
      hapticFeedback('success');
    } catch (err) {
      hapticFeedback('error');
    } finally {
      setIsRefreshing(false);
    }
  };

  // Toggle Star / Bookmark
  const handleToggleStar = async (articleId, newStarred) => {
    setArticles((prev) =>
      prev.map((a) => (a.id === articleId ? { ...a, isStarred: newStarred } : a))
    );
    if (currentArticle && currentArticle.id === articleId) {
      setCurrentArticle((prev) => ({ ...prev, isStarred: newStarred }));
    }
    setStats((prev) => ({
      ...prev,
      totalStarred: Math.max(0, prev.totalStarred + (newStarred ? 1 : -1)),
    }));

    try {
      await callApi('set_article_state', { articleId, isStarred: newStarred });
    } catch {
      fetchFeeds();
    }
  };

  // Toggle Read / Unread
  const handleToggleRead = async (articleId, newRead) => {
    setArticles((prev) =>
      prev.map((a) => (a.id === articleId ? { ...a, isRead: newRead } : a))
    );
    if (currentArticle && currentArticle.id === articleId) {
      setCurrentArticle((prev) => ({ ...prev, isRead: newRead }));
    }
    setStats((prev) => ({
      ...prev,
      totalUnread: Math.max(0, prev.totalUnread + (newRead ? -1 : 1)),
    }));

    try {
      await callApi('set_article_state', { articleId, isRead: newRead });
      fetchFeeds();
    } catch {
      fetchFeeds();
    }
  };

  // Mark all as read
  const handleMarkAllRead = async () => {
    setArticles((prev) => prev.map((a) => ({ ...a, isRead: true })));
    setStats((prev) => ({ ...prev, totalUnread: 0 }));

    try {
      await callApi('set_article_state', { markAllRead: true, feedUrl: activeFeedUrl || undefined });
      fetchFeeds();
      if (activeTab === 'unread') {
        fetchArticles({ newOffset: 0, append: false });
      }
    } catch {
      fetchFeeds();
    }
  };

  // Open Article in Reader View
  const handleOpenArticle = async (articlePreview) => {
    setArticles((prev) =>
      prev.map((a) => (a.id === articlePreview.id ? { ...a, isRead: true } : a))
    );
    if (!articlePreview.isRead) {
      setStats((prev) => ({
        ...prev,
        totalUnread: Math.max(0, prev.totalUnread - 1),
      }));
    }

    const hasFullContent = Boolean(articlePreview.content && articlePreview.content.length >= 500);

    setCurrentArticle({
      ...articlePreview,
      isRead: true,
      isLoadingContent: !hasFullContent,
      loadError: null,
    });
    setLoadingArticleContent(!hasFullContent);

    try {
      const data = await callApi('get_article', { articleId: articlePreview.id });
      if (data?.article) {
        setCurrentArticle((prev) => {
          if (!prev || prev.id !== articlePreview.id) return prev;
          return {
            ...data.article,
            isRead: true,
            isLoadingContent: false,
            loadError: null,
          };
        });
      }
    } catch (err) {
      console.warn('[handleOpenArticle] error:', err.message);
      setCurrentArticle((prev) => {
        if (!prev || prev.id !== articlePreview.id) return prev;
        return {
          ...prev,
          isLoadingContent: false,
          loadError: err.message || 'Failed to load full article',
        };
      });
    } finally {
      setLoadingArticleContent(false);
    }
  };

  // Retry full article load
  const handleRetryLoadArticle = async (articleId) => {
    const targetId = articleId || currentArticle?.id;
    if (!targetId) return;

    setLoadingArticleContent(true);
    setCurrentArticle((prev) => (prev ? { ...prev, isLoadingContent: true, loadError: null } : prev));

    try {
      const data = await callApi('get_article', { articleId: targetId });
      if (data?.article) {
        setCurrentArticle((prev) => {
          if (!prev || prev.id !== targetId) return prev;
          return {
            ...data.article,
            isLoadingContent: false,
            loadError: null,
          };
        });
      }
    } catch (err) {
      console.warn('[handleRetryLoadArticle] error:', err.message);
      setCurrentArticle((prev) => {
        if (!prev || prev.id !== targetId) return prev;
        return {
          ...prev,
          isLoadingContent: false,
          loadError: err.message || 'Failed to load full article',
        };
      });
    } finally {
      setLoadingArticleContent(false);
    }
  };

  // Next Article in Reader View
  const handleNextArticle = () => {
    if (!currentArticle) return;
    const currentIndex = articles.findIndex((a) => a.id === currentArticle.id);
    if (currentIndex >= 0 && currentIndex < articles.length - 1) {
      const nextArticle = articles[currentIndex + 1];
      handleOpenArticle(nextArticle);
    }
  };

  const currentArticleIndex = currentArticle
    ? articles.findIndex((a) => a.id === currentArticle.id)
    : -1;
  const hasNextArticle = currentArticleIndex >= 0 && currentArticleIndex < articles.length - 1;

  // Subscribe Feed
  const handleSubscribeFeed = async ({ url, customTitle, category, sendMode }) => {
    await callApi('manage_feed', { action: 'subscribe', url, customTitle, category, sendMode });
    await fetchFeeds();
    await fetchArticles({ newOffset: 0, append: false });
  };

  // Update Feed settings
  const handleUpdateFeed = async (updatePayload) => {
    await callApi('manage_feed', { action: 'update', ...updatePayload });
    await fetchFeeds();
  };

  // Unsubscribe Feed
  const handleUnsubscribeFeed = async (feedUrl) => {
    await callApi('manage_feed', { action: 'unsubscribe', feedUrl });
    if (activeFeedUrl === feedUrl) {
      setActiveFeedUrl(null);
    }
    await fetchFeeds();
    await fetchArticles({ newOffset: 0, append: false });
  };

  // Refresh single feed
  const handleRefreshFeed = async (feedUrl) => {
    await callApi('manage_feed', { action: 'refresh', feedUrl });
    await fetchFeeds();
    await fetchArticles({ newOffset: 0, append: false });
  };

  // Create Folder
  const handleCreateFolder = async (name) => {
    await callApi('manage_feed', { action: 'create_folder', name });
    await fetchFeeds();
  };

  // Rename Folder
  const handleRenameFolder = async (oldName, newName) => {
    await callApi('manage_feed', { action: 'rename_folder', oldName, newName });
    await fetchFeeds();
    await fetchArticles({ newOffset: 0, append: false });
  };

  // Delete Folder
  const handleDeleteFolder = async (name) => {
    await callApi('manage_feed', { action: 'delete_folder', name });
    if (activeCategory === name) {
      setActiveCategory(null);
    }
    await fetchFeeds();
    await fetchArticles({ newOffset: 0, append: false });
  };

  const activeFeedObj = feeds.find((f) => f.feedUrl === activeFeedUrl);

  return (
    <div className="min-h-screen bg-tg-bg text-tg-text">
      {/* 1. Article Reader View Mode */}
      {currentArticle ? (
        <ReaderView
          article={currentArticle}
          onBack={() => setCurrentArticle(null)}
          onToggleStar={handleToggleStar}
          onToggleRead={handleToggleRead}
          onNextArticle={handleNextArticle}
          hasNextArticle={hasNextArticle}
          isLoadingContent={loadingArticleContent || Boolean(currentArticle?.isLoadingContent)}
          onRetryLoadContent={() => handleRetryLoadArticle(currentArticle?.id)}
        />
      ) : (
        /* 2. Main Feed Stream Mode */
        <div className="max-w-2xl mx-auto">
          <Header
            unreadCount={stats.totalUnread}
            isRefreshing={isRefreshing}
            onRefresh={handleRefresh}
            onOpenAddModal={() => setIsAddModalOpen(true)}
            onOpenManageModal={() => handleOpenManageModal('feeds')}
            onOpenSettings={() => setIsSettingsOpen(true)}
          />

          <FilterBar
            activeTab={activeTab}
            onTabChange={handleTabChange}
            feeds={feeds}
            categories={categories}
            activeCategory={activeCategory}
            onCategorySelect={handleCategorySelect}
            activeFeedUrl={activeFeedUrl}
            onFeedSelect={handleFeedSelect}
            searchQuery={searchQuery}
            onSearchChange={handleSearchChange}
            unreadTotal={stats.totalUnread}
            starredTotal={stats.totalStarred}
            viewMode={viewMode}
            onToggleViewMode={handleToggleViewMode}
            onCreateFolder={handleCreateFolder}
            onOpenManageModal={handleOpenManageModal}
          />

          <main>
            <ArticleList
              articles={articles}
              loading={loadingArticles}
              error={articlesError}
              onRetry={() => fetchArticles({ newOffset: 0, append: false })}
              hasMore={hasMore}
              onLoadMore={handleLoadMore}
              activeTab={activeTab}
              onSwitchTab={handleTabChange}
              onMarkAllRead={handleMarkAllRead}
              onOpenArticle={handleOpenArticle}
              onToggleStar={handleToggleStar}
              onToggleRead={handleToggleRead}
              onOpenAddModal={() => setIsAddModalOpen(true)}
              searchQuery={searchQuery}
              activeFeedTitle={activeFeedObj?.title}
              viewMode={viewMode}
            />
          </main>
        </div>
      )}

      {/* 3. Feed Manager & Add Modal */}
      <FeedManagerModal
        isOpen={isAddModalOpen || isManageModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          setIsManageModalOpen(false);
        }}
        feeds={feeds}
        categories={categories}
        onSubscribeFeed={handleSubscribeFeed}
        onUpdateFeed={handleUpdateFeed}
        onUnsubscribeFeed={handleUnsubscribeFeed}
        onRefreshFeed={handleRefreshFeed}
        onCreateFolder={handleCreateFolder}
        onRenameFolder={handleRenameFolder}
        onDeleteFolder={handleDeleteFolder}
        initialTab={isAddModalOpen ? 'add' : manageModalTab}
      />

      {/* 4. Settings & Stats Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        stats={stats}
        apiKey={apiKey}
        onFeedsUpdated={fetchFeeds}
      />
    </div>
  );
}
