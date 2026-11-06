/**
 * lib/metrics.js — Core observability, traffic metering, and statistical engine.
 * Records network bandwidth, user activity (DAU/WAU/MAU), and operational health.
 */

import { db } from 'sdk';
import { sql, eq, and } from 'sdk/db';
import {
  botDailyStats,
  userActivity,
  subscriptions,
  feedStates,
  feedEntries,
  userArticleStates,
  chatSettings,
} from '../schema.js';

/**
 * Returns today's UTC date key formatted as 'YYYY-MM-DD'.
 * @returns {string}
 */
export function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Format bytes into human-readable string (e.g. 1.25 MB).
 * @param {number} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1);
  return `${val} ${units[i] || 'TB'}`;
}

/**
 * Record network traffic by category into today's botDailyStats.
 * @param {object} param0
 * @param {'feed'|'telegraph'|'extractor'|'telegram'} param0.category
 * @param {number} [param0.bytesIn=0]
 * @param {number} [param0.bytesOut=0]
 * @param {number} [param0.savedBytes=0]
 */
export async function recordTraffic({ category, bytesIn = 0, bytesOut = 0, savedBytes = 0 }) {
  const dateKey = getTodayKey();
  const totalCategoryBytes = (bytesIn || 0) + (bytesOut || 0);

  const updates = {
    updatedAt: new Date(),
  };

  if (category === 'feed') {
    updates.feedBytes = sql`feed_bytes + ${totalCategoryBytes}`;
  } else if (category === 'telegraph') {
    updates.telegraphBytes = sql`telegraph_bytes + ${totalCategoryBytes}`;
  } else if (category === 'extractor') {
    updates.extractorBytes = sql`extractor_bytes + ${totalCategoryBytes}`;
  }

  if (savedBytes > 0) {
    updates.cacheBytesSaved = sql`cache_bytes_saved + ${savedBytes}`;
  }

  try {
    await db.insert(botDailyStats)
      .values({
        date: dateKey,
        feedBytes: category === 'feed' ? totalCategoryBytes : 0,
        telegraphBytes: category === 'telegraph' ? totalCategoryBytes : 0,
        extractorBytes: category === 'extractor' ? totalCategoryBytes : 0,
        cacheBytesSaved: savedBytes || 0,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: botDailyStats.date,
        set: updates,
      })
      .run();
  } catch (err) {
    console.warn('[metrics] recordTraffic error:', err.message);
  }
}

/**
 * Record user activity for DAU / WAU / MAU tracking.
 * @param {object} param0
 * @param {number|string} param0.userId
 * @param {string} [param0.chatType='private']
 * @param {string} [param0.command=null]
 */
export async function recordUserActivity({ userId, chatType = 'private', command = null }) {
  const numericId = Number(userId);
  if (!numericId) return;

  const now = new Date();
  const dateKey = getTodayKey();

  try {
    // Check if user already exists
    const existing = await db.select({ userId: userActivity.userId })
      .from(userActivity)
      .where(eq(userActivity.userId, numericId))
      .get();

    const isNew = !existing;

    await db.insert(userActivity)
      .values({
        userId: numericId,
        chatType: chatType || 'private',
        firstSeenAt: now,
        lastActiveAt: now,
        interactionsCount: 1,
        lastCommand: command || null,
      })
      .onConflictDoUpdate({
        target: userActivity.userId,
        set: {
          lastActiveAt: now,
          interactionsCount: sql`interactions_count + 1`,
          lastCommand: command || sql`last_command`,
          chatType: chatType || sql`chat_type`,
        },
      })
      .run();

    // Increment today's commands count and new user count if applicable
    const dailyUpdates = {
      commandsCount: sql`commands_count + 1`,
      updatedAt: now,
    };
    if (isNew) {
      dailyUpdates.newUsers = sql`new_users + 1`;
    }

    await db.insert(botDailyStats)
      .values({
        date: dateKey,
        commandsCount: 1,
        newUsers: isNew ? 1 : 0,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: botDailyStats.date,
        set: dailyUpdates,
      })
      .run();
  } catch (err) {
    console.warn('[metrics] recordUserActivity error:', err.message);
  }
}

/**
 * Record a poll cycle result.
 * @param {object} param0
 * @param {number} param0.feedCount
 * @param {number} param0.newArticles
 * @param {number} [param0.telegraphCreated=0]
 * @param {number} [param0.errorCount=0]
 */
export async function recordPollCycle({ feedCount = 0, newArticles = 0, telegraphCreated = 0, errorCount = 0 }) {
  const dateKey = getTodayKey();
  const now = new Date();

  try {
    await db.insert(botDailyStats)
      .values({
        date: dateKey,
        pollCount: 1,
        pollErrors: errorCount > 0 ? 1 : 0,
        articlesFetched: newArticles || 0,
        telegraphCreated: telegraphCreated || 0,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: botDailyStats.date,
        set: {
          pollCount: sql`poll_count + 1`,
          pollErrors: sql`poll_errors + ${errorCount > 0 ? 1 : 0}`,
          articlesFetched: sql`articles_fetched + ${newArticles || 0}`,
          telegraphCreated: sql`telegraph_created + ${telegraphCreated || 0}`,
          updatedAt: now,
        },
      })
      .run();
  } catch (err) {
    console.warn('[metrics] recordPollCycle error:', err.message);
  }
}

/**
 * Fetch comprehensive stats for admin visualization.
 * @returns {Promise<object>}
 */
export async function getAdminStats() {
  const nowSec = Math.floor(Date.now() / 1000);
  const oneDayAgo = nowSec - 86400;
  const sevenDaysAgo = nowSec - 7 * 86400;
  const thirtyDaysAgo = nowSec - 30 * 86400;
  const todayStart = Math.floor(new Date().setUTCHours(0, 0, 0, 0) / 1000);

  // 1. Feeds stats
  const totalFeedsRows = await db.all(sql`SELECT count(*) as count FROM feed_states`);
  const failingFeedsRows = await db.all(sql`SELECT count(*) as count FROM feed_states WHERE error_count > 0`);
  const totalSubsRows = await db.all(sql`SELECT count(*) as count FROM subscriptions`);

  const totalFeeds = Number(totalFeedsRows?.[0]?.count || 0);
  const failingFeeds = Number(failingFeedsRows?.[0]?.count || 0);
  const healthyFeeds = Math.max(0, totalFeeds - failingFeeds);
  const totalSubscriptions = Number(totalSubsRows?.[0]?.count || 0);

  // Top 5 subscribed feeds
  let topFeeds = [];
  try {
    topFeeds = await db.all(sql`
      SELECT feed_url as feedUrl, custom_title as customTitle, count(*) as subscribers
      FROM subscriptions
      GROUP BY feed_url
      ORDER BY count(*) DESC
      LIMIT 5
    `);
  } catch (err) {
    console.warn('[metrics] topFeeds query fallback:', err.message);
  }

  // Recent failing feeds
  let recentErrors = [];
  try {
    recentErrors = await db.all(sql`
      SELECT feed_url as feedUrl, title, error_count as errorCount, last_error as lastError, last_checked_at as lastCheckedAt
      FROM feed_states
      WHERE error_count > 0
      ORDER BY error_count DESC
      LIMIT 5
    `);
  } catch (err) {
    console.warn('[metrics] recentErrors query fallback:', err.message);
  }

  // 2. User & Chat stats
  const totalUsersRows = await db.all(sql`SELECT count(*) as count FROM user_activity`);
  const dauRows = await db.all(sql`SELECT count(*) as count FROM user_activity WHERE last_active_at >= ${oneDayAgo}`);
  const wauRows = await db.all(sql`SELECT count(*) as count FROM user_activity WHERE last_active_at >= ${sevenDaysAgo}`);
  const mauRows = await db.all(sql`SELECT count(*) as count FROM user_activity WHERE last_active_at >= ${thirtyDaysAgo}`);
  const newUsersTodayRows = await db.all(sql`SELECT count(*) as count FROM user_activity WHERE first_seen_at >= ${todayStart}`);

  // Distinct active chats from subscriptions as fallback/reference
  const distinctChatsRows = await db.all(sql`SELECT count(distinct chat_id) as count FROM subscriptions`);
  const totalUsers = Math.max(Number(totalUsersRows?.[0]?.count || 0), Number(distinctChatsRows?.[0]?.count || 0));
  const dau = Number(dauRows?.[0]?.count || 0);
  const wau = Number(wauRows?.[0]?.count || 0);
  const mau = Number(mauRows?.[0]?.count || 0);
  const newUsersToday = Number(newUsersTodayRows?.[0]?.count || 0);

  // 3. Articles stats
  const totalArticlesRows = await db.all(sql`SELECT count(*) as count FROM feed_entries`);
  const articlesTodayRows = await db.all(sql`SELECT count(*) as count FROM feed_entries WHERE created_at >= ${todayStart}`);
  const telegraphTotalRows = await db.all(sql`SELECT count(*) as count FROM feed_entries WHERE telegraph_url IS NOT NULL`);
  const readCountRows = await db.all(sql`SELECT count(*) as count FROM user_article_states WHERE is_read = 1`);
  const starredCountRows = await db.all(sql`SELECT count(*) as count FROM user_article_states WHERE is_starred = 1`);

  const totalArticles = Number(totalArticlesRows?.[0]?.count || 0);
  const articlesToday = Number(articlesTodayRows?.[0]?.count || 0);
  const telegraphArticlesTotal = Number(telegraphTotalRows?.[0]?.count || 0);
  const articlesRead = Number(readCountRows?.[0]?.count || 0);
  const articlesStarred = Number(starredCountRows?.[0]?.count || 0);

  // 4. Daily traffic & rollup stats (last 7 days)
  let history7d = [];
  try {
    history7d = await db.all(sql`
      SELECT date, feed_bytes as feedBytes, telegraph_bytes as telegraphBytes, extractor_bytes as extractorBytes,
             cache_bytes_saved as cacheBytesSaved, poll_count as pollCount, poll_errors as pollErrors,
             commands_count as commandsCount, articles_fetched as articlesFetched, telegraph_created as telegraphCreated
      FROM bot_daily_stats
      ORDER BY date DESC
      LIMIT 7
    `);
  } catch (err) {
    console.warn('[metrics] history7d query fallback:', err.message);
  }

  const todayKey = getTodayKey();
  const todayStats = history7d.find((s) => s.date === todayKey) || {};

  const todayFeedBytes = Number(todayStats.feedBytes || 0);
  const todayTelegraphBytes = Number(todayStats.telegraphBytes || 0);
  const todayExtractorBytes = Number(todayStats.extractorBytes || 0);
  const todayCacheSavedBytes = Number(todayStats.cacheBytesSaved || 0);
  const todayTotalTraffic = todayFeedBytes + todayTelegraphBytes + todayExtractorBytes;

  const weekTotalTraffic = history7d.reduce((sum, row) => {
    return sum + Number(row.feedBytes || 0) + Number(row.telegraphBytes || 0) + Number(row.extractorBytes || 0);
  }, 0);

  return {
    timestamp: Date.now(),
    overview: {
      totalFeeds,
      healthyFeeds,
      failingFeeds,
      totalSubscriptions,
      totalUsers,
      dau,
      wau,
      mau,
      newUsersToday,
    },
    articles: {
      totalArticles,
      articlesToday,
      telegraphArticlesTotal,
      telegraphCreatedToday: Number(todayStats.telegraphCreated || 0),
      articlesRead,
      articlesStarred,
    },
    traffic: {
      today: {
        feedBytes: todayFeedBytes,
        telegraphBytes: todayTelegraphBytes,
        extractorBytes: todayExtractorBytes,
        totalBytes: todayTotalTraffic,
        cacheBytesSaved: todayCacheSavedBytes,
        feedFormatted: formatBytes(todayFeedBytes),
        telegraphFormatted: formatBytes(todayTelegraphBytes),
        extractorFormatted: formatBytes(todayExtractorBytes),
        totalFormatted: formatBytes(todayTotalTraffic),
        savedFormatted: formatBytes(todayCacheSavedBytes),
      },
      weekTotalFormatted: formatBytes(weekTotalTraffic),
      history7d: history7d.map((row) => ({
        date: row.date,
        feedBytes: Number(row.feedBytes || 0),
        telegraphBytes: Number(row.telegraphBytes || 0),
        extractorBytes: Number(row.extractorBytes || 0),
        totalBytes: Number(row.feedBytes || 0) + Number(row.telegraphBytes || 0) + Number(row.extractorBytes || 0),
        articlesFetched: Number(row.articlesFetched || 0),
      })),
    },
    feeds: {
      topFeeds: topFeeds.map((f) => ({
        feedUrl: f.feedUrl,
        title: f.customTitle || f.feedUrl.replace(/^https?:\/\//, '').split('/')[0],
        subscribers: Number(f.subscribers || 0),
      })),
      recentErrors: recentErrors.map((e) => ({
        feedUrl: e.feedUrl,
        title: e.title || e.feedUrl.replace(/^https?:\/\//, '').split('/')[0],
        errorCount: Number(e.errorCount || 0),
        lastError: e.lastError || 'Unknown error',
      })),
    },
    operations: {
      pollsToday: Number(todayStats.pollCount || 0),
      pollErrorsToday: Number(todayStats.pollErrors || 0),
      commandsToday: Number(todayStats.commandsCount || 0),
    },
  };
}

/**
 * Generate compact payload for sendWidget public_data (< 350 bytes).
 * @param {object} [stats]
 * @returns {Promise<object>}
 */
export async function getAdminStatsCompact(stats) {
  const s = stats || (await getAdminStats());

  // Compact 7-day traffic trend in KB
  const historyKb = (s.traffic.history7d || []).slice().reverse().map((h) => Math.round(h.totalBytes / 1024));
  if (historyKb.length < 7) {
    while (historyKb.length < 7) historyKb.unshift(0);
  }

  return {
    t: Math.floor(s.timestamp / 1000),
    u: [
      s.overview.totalUsers,
      s.overview.dau,
      s.overview.wau,
      s.overview.mau,
      s.overview.newUsersToday,
    ],
    f: [
      s.overview.totalFeeds,
      s.overview.healthyFeeds,
      s.overview.failingFeeds,
      s.overview.totalSubscriptions,
    ],
    a: [
      s.articles.articlesToday,
      s.articles.totalArticles,
      s.articles.telegraphCreatedToday,
      s.articles.articlesRead,
    ],
    b: [
      s.traffic.today.totalBytes,
      s.traffic.today.feedBytes,
      s.traffic.today.telegraphBytes,
      s.traffic.today.extractorBytes,
      s.traffic.today.cacheBytesSaved,
    ],
    h: historyKb,
    top: (s.feeds.topFeeds || []).slice(0, 3).map((f) => [f.title.slice(0, 20), f.subscribers]),
    err: (s.feeds.recentErrors || []).slice(0, 2).map((e) => [e.title.slice(0, 20), (e.lastError || '').slice(0, 25)]),
  };
}

