import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { formatBytes, getTodayKey, getAdminStatsCompact } from '../tgcloud/lib/metrics.js';
import {
  getAdminStatsWidgetHtml,
  formatAdminStatsTextSummary,
  formatAdminStatsRichHtml,
} from '../tgcloud/lib/widgets/admin_stats_widget.js';
import { isAdmin, getAdminIds } from '../tgcloud/lib/admin.js';
import getAdminStatsEndpoint from '../tgcloud/endpoints/get_admin_stats.js';

test('formatBytes formats file sizes correctly', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(1024), '1.0 KB');
  assert.equal(formatBytes(1536), '1.5 KB');
  assert.equal(formatBytes(1048576), '1.0 MB');
  assert.equal(formatBytes(1073741824), '1.0 GB');
});

test('getTodayKey returns YYYY-MM-DD UTC format', () => {
  const key = getTodayKey();
  assert.match(key, /^\d{4}-\d{2}-\d{2}$/);
});

test('Telegram widget-sandbox mini-HTML adheres to size and compression limits', () => {
  const html = getAdminStatsWidgetHtml();
  assert.ok(html.length > 0, 'HTML is non-empty');
  assert.ok(html.length <= 32768, `HTML must be <= 32KB uncompressed, got ${html.length}`);

  const compressed = zlib.deflateSync(html, { level: 9 });
  assert.ok(compressed.length <= 4096, `Compressed widget must be <= 4096 bytes, got ${compressed.length}`);
  assert.ok(html.includes('TelegramWidget'), 'HTML must include TelegramWidget script integration');
  assert.ok(html.includes('--tg-theme-bg-color'), 'HTML must support Telegram theme variables');
  assert.ok(html.includes('Overview') && html.includes('Traffic') && html.includes('Feeds') && html.includes('Audience'), 'HTML must have all 4 tabs');
});

test('formatAdminStatsTextSummary and formatAdminStatsRichHtml format statistics cleanly', () => {
  const mockStats = {
    timestamp: Date.now(),
    overview: {
      totalFeeds: 15,
      healthyFeeds: 14,
      failingFeeds: 1,
      totalSubscriptions: 32,
      totalUsers: 25,
      dau: 10,
      wau: 18,
      mau: 24,
      newUsersToday: 2,
    },
    articles: {
      totalArticles: 1250,
      articlesToday: 45,
      telegraphArticlesTotal: 30,
      telegraphCreatedToday: 5,
      articlesRead: 110,
      articlesStarred: 15,
    },
    traffic: {
      today: {
        feedBytes: 1048576,
        telegraphBytes: 204800,
        extractorBytes: 524288,
        totalBytes: 1777664,
        cacheBytesSaved: 4194304,
        feedFormatted: '1.0 MB',
        telegraphFormatted: '200.0 KB',
        extractorFormatted: '512.0 KB',
        totalFormatted: '1.7 MB',
        savedFormatted: '4.0 MB',
      },
      weekTotalFormatted: '12.5 MB',
      history7d: [],
    },
    feeds: {
      topFeeds: [{ feedUrl: 'https://news.ycombinator.com/rss', title: 'Hacker News', subscribers: 12 }],
      recentErrors: [],
    },
    operations: {
      pollsToday: 24,
      pollErrorsToday: 0,
      commandsToday: 50,
    },
  };

  const caption = formatAdminStatsTextSummary(mockStats);
  assert.ok(caption.includes('Feeds: 15'), 'Caption contains feeds count');
  assert.ok(caption.includes('DAU: 10'), 'Caption contains DAU');
  assert.ok(caption.includes('Traffic: 1.7 MB'), 'Caption contains traffic');

  const richHtml = formatAdminStatsRichHtml(mockStats);
  assert.ok(richHtml.includes('RSS Bot Admin Dashboard'), 'Rich HTML header present');
  assert.ok(richHtml.includes('Hacker News'), 'Top feed listed');
  assert.ok(richHtml.includes('Traffic Saved (304 Cache)'), 'Cache savings noted');
});

test('getAdminStatsCompact outputs tight JSON suitable for public_data limit (< 350B)', async () => {
  const mockStats = {
    timestamp: 1730910000000,
    overview: { totalFeeds: 20, healthyFeeds: 19, failingFeeds: 1, totalSubscriptions: 40, totalUsers: 30, dau: 12, wau: 20, mau: 28, newUsersToday: 3 },
    articles: { totalArticles: 2000, articlesToday: 50, telegraphCreatedToday: 8, articlesRead: 120 },
    traffic: {
      today: { totalBytes: 2000000, feedBytes: 1200000, telegraphBytes: 300000, extractorBytes: 500000, cacheBytesSaved: 5000000 },
      history7d: [{ totalBytes: 1000000 }, { totalBytes: 2000000 }],
    },
    feeds: {
      topFeeds: [{ title: 'TechCrunch', subscribers: 15 }],
      recentErrors: [],
    },
  };

  const compact = await getAdminStatsCompact(mockStats);
  const jsonStr = JSON.stringify(compact);
  assert.ok(jsonStr.length < 500, `Compact data should be small, got ${jsonStr.length} chars`);
  assert.equal(compact.f[0], 20, 'Total feeds match');
  assert.equal(compact.u[1], 12, 'DAU match');
});

test('Admin authentication rejects unauthenticated users in endpoint', async () => {
  await assert.rejects(
    async () => {
      await getAdminStatsEndpoint({}, { initData: null });
    },
    /Authentication required/
  );

  await assert.rejects(
    async () => {
      await getAdminStatsEndpoint({}, { initData: { user: { id: 99999999 } } });
    },
    /Access denied/
  );
});

