import { db, EndpointError } from 'sdk';
import { eq, sql } from 'sdk/db';
import { subscriptions, feedStates, chatSettings } from '../schema.js';

export default async function (input, ctx) {
  const user = ctx.initData?.user;
  if (!user?.id) {
    throw new EndpointError('Authentication required', { code: 'UNAUTHORIZED' });
  }

  const userId = user.id;

  const userSubs = await db.select()
    .from(subscriptions)
    .where(eq(subscriptions.chatId, userId))
    .all();

  const userSetting = await db.select()
    .from(chatSettings)
    .where(eq(chatSettings.chatId, userId))
    .get();

  let definedFolders = [];
  try {
    if (Array.isArray(userSetting?.folders)) {
      definedFolders = userSetting.folders;
    } else if (typeof userSetting?.folders === 'string') {
      definedFolders = JSON.parse(userSetting.folders);
    }
  } catch {}
  if (!definedFolders.includes('General')) {
    definedFolders.unshift('General');
  }

  if (!userSubs || userSubs.length === 0) {
    return {
      feeds: [],
      categories: definedFolders.map((name) => ({ name, feedCount: 0, unreadCount: 0 })),
      stats: {
        totalFeeds: 0,
        totalUnread: 0,
        totalStarred: 0,
      },
      apiKey: userSetting?.apiKey || null,
      lang: userSetting?.lang || 'auto',
    };
  }

  const allStates = await db.select().from(feedStates).all();
  const stateMap = new Map(allStates.map((s) => [s.feedUrl, s]));

  // Batch-query total and read entry counts per feed in a single grouped SQL query
  const countRows = await db.all(sql`
    SELECT
      fe.feed_url,
      count(fe.id) AS total_count,
      count(uas.id) AS read_count
    FROM feed_entries fe
    LEFT JOIN user_article_states uas
      ON uas.entry_id = fe.id AND uas.user_id = ${userId} AND uas.is_read = 1
    WHERE fe.feed_url IN (SELECT feed_url FROM subscriptions WHERE chat_id = ${userId})
    GROUP BY fe.feed_url
  `);
  const countMap = new Map();
  for (const r of countRows) {
    countMap.set(r.feed_url, {
      total: Number(r.total_count) || 0,
      read: Number(r.read_count) || 0,
    });
  }

  const feedResults = [];
  let totalUnread = 0;

  for (const sub of userSubs) {
    const state = stateMap.get(sub.feedUrl);
    const counts = countMap.get(sub.feedUrl) || { total: 0, read: 0 };
    const unreadCount = Math.max(0, counts.total - counts.read);
    totalUnread += unreadCount;

    feedResults.push({
      id: sub.id,
      feedUrl: sub.feedUrl,
      title: sub.customTitle || state?.title || sub.feedUrl,
      customTitle: sub.customTitle,
      serverTitle: state?.title || null,
      description: state?.description || null,
      siteUrl: state?.siteUrl || null,
      iconUrl: state?.iconUrl || null,
      category: sub.category || 'General',
      sendMode: sub.sendMode || 'default',
      paused: Boolean(sub.paused),
      lastCheckedAt: state?.lastCheckedAt || null,
      errorCount: state?.errorCount || 0,
      lastError: state?.lastError || null,
      totalCount,
      unreadCount,
    });
  }

  // Calculate category groups and summary counts (merging defined folders)
  const categoryMap = new Map();
  for (const folderName of definedFolders) {
    const clean = String(folderName || '').trim();
    if (clean && !categoryMap.has(clean)) {
      categoryMap.set(clean, { name: clean, feedCount: 0, unreadCount: 0 });
    }
  }

  for (const f of feedResults) {
    const catName = f.category || 'General';
    if (!categoryMap.has(catName)) {
      categoryMap.set(catName, { name: catName, feedCount: 0, unreadCount: 0 });
    }
    const cat = categoryMap.get(catName);
    cat.feedCount++;
    cat.unreadCount += f.unreadCount;
  }

  const categories = Array.from(categoryMap.values()).sort((a, b) => {
    if (a.name === 'General') return -1;
    if (b.name === 'General') return 1;
    return a.name.localeCompare(b.name);
  });

  // Count starred articles for this user
  const starredRow = await db.get(
    sql`SELECT count(*) as count FROM user_article_states WHERE user_id = ${userId} AND is_starred = 1`
  );
  const totalStarred = starredRow?.count || 0;

  return {
    feeds: feedResults,
    categories,
    stats: {
      totalFeeds: userSubs.length,
      totalUnread,
      totalStarred,
    },
    apiKey: userSetting?.apiKey || null,
    lang: userSetting?.lang || 'auto',
  };
}

