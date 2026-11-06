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

  // Reader state
  const [currentArticle, setCurrentArticle] = useState(null);

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isManageModalOpen, setIsManageModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Debounced search timer
  const searchTimeoutRef = useRef(null);

  // Initialize Telegram WebApp
  useEffect(() => {
    initTelegramApp();
  }, []);

  // Fetch Feeds list and global stats
  const fetchFeeds = useCallback(async () => {
    try {
      const data = await callApi('get_feeds');
      if (data?.feeds) {
        setFeeds(data.feeds);
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
    async ({ tab = activeTab, feedUrl = activeFeedUrl, search = searchQuery, newOffset = 0, append = false } = {}) => {
      setLoadingArticles(true);
      if (!append) {
        setArticlesError(null);
      }
      try {
        const res = await callApi('get_articles', {
          filter: tab,
          feedUrl: feedUrl || undefined,
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
    [activeTab, activeFeedUrl, searchQuery]
  );

  // Initial load
  useEffect(() => {
    fetchFeeds();
    fetchArticles({ newOffset: 0, append: false });
  }, [fetchFeeds, fetchArticles]);

  // Handle Tab Switch
  const handleTabChange = (newTab) => {
    setActiveTab(newTab);
    fetchArticles({ tab: newTab, newOffset: 0, append: false });
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
    // Optimistic UI update
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
      // Revert on error
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
    // Optimistically open preview and mark as read
    setCurrentArticle(articlePreview);
    handleToggleRead(articlePreview.id, true);

    try {
      const data = await callApi('get_article', { articleId: articlePreview.id });
      if (data?.article) {
        setCurrentArticle(data.article);
      }
    } catch (err) {
      console.warn('[handleOpenArticle] error:', err.message);
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
  const handleSubscribeFeed = async ({ url, customTitle, sendMode }) => {
    await callApi('manage_feed', { action: 'subscribe', url, customTitle, sendMode });
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
        />
      ) : (
        /* 2. Main Feed Stream Mode */
        <div className="max-w-2xl mx-auto">
          <Header
            unreadCount={stats.totalUnread}
            isRefreshing={isRefreshing}
            onRefresh={handleRefresh}
            onOpenAddModal={() => setIsAddModalOpen(true)}
            onOpenManageModal={() => setIsManageModalOpen(true)}
            onOpenSettings={() => setIsSettingsOpen(true)}
          />

          <FilterBar
            activeTab={activeTab}
            onTabChange={handleTabChange}
            feeds={feeds}
            activeFeedUrl={activeFeedUrl}
            onFeedSelect={handleFeedSelect}
            searchQuery={searchQuery}
            onSearchChange={handleSearchChange}
            unreadTotal={stats.totalUnread}
            starredTotal={stats.totalStarred}
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
        onSubscribeFeed={handleSubscribeFeed}
        onUpdateFeed={handleUpdateFeed}
        onUnsubscribeFeed={handleUnsubscribeFeed}
        onRefreshFeed={handleRefreshFeed}
        initialTab={isAddModalOpen ? 'add' : 'list'}
      />

      {/* 4. Settings & Stats Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        stats={stats}
      />
    </div>
  );
}

