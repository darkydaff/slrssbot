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

  if (!userSubs || userSubs.length === 0) {
    const userSetting = await db.select()
      .from(chatSettings)
      .where(eq(chatSettings.chatId, userId))
      .get();

    return {
      feeds: [],
      stats: {
        totalFeeds: 0,
        totalUnread: 0,
        totalStarred: 0,
      },
      lang: userSetting?.lang || 'auto',
    };
  }

  const allStates = await db.select().from(feedStates).all();
  const stateMap = new Map(allStates.map((s) => [s.feedUrl, s]));

  const feedResults = [];
  let totalUnread = 0;

  for (const sub of userSubs) {
    const state = stateMap.get(sub.feedUrl);

    // Count total entries in DB for this feed
    const totalEntriesRow = await db.get(
      sql`SELECT count(*) as count FROM feed_entries WHERE feed_url = ${sub.feedUrl}`
    );
    const totalCount = totalEntriesRow?.count || 0;

    // Count read entries in this feed for this user
    const readEntriesRow = await db.get(
      sql`SELECT count(*) as count FROM feed_entries fe
          INNER JOIN user_article_states uas ON uas.entry_id = fe.id
          WHERE fe.feed_url = ${sub.feedUrl} AND uas.user_id = ${userId} AND uas.is_read = 1`
    );
    const readCount = readEntriesRow?.count || 0;
    const unreadCount = Math.max(0, totalCount - readCount);
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
      sendMode: sub.sendMode || 'default',
      paused: Boolean(sub.paused),
      lastCheckedAt: state?.lastCheckedAt || null,
      errorCount: state?.errorCount || 0,
      lastError: state?.lastError || null,
      totalCount,
      unreadCount,
    });
  }

  // Count starred articles for this user
  const starredRow = await db.get(
    sql`SELECT count(*) as count FROM user_article_states WHERE user_id = ${userId} AND is_starred = 1`
  );
  const totalStarred = starredRow?.count || 0;

  // Get user's saved language preference if any
  const userSetting = await db.select()
    .from(chatSettings)
    .where(eq(chatSettings.chatId, userId))
    .get();

  return {
    feeds: feedResults,
    stats: {
      totalFeeds: userSubs.length,
      totalUnread,
      totalStarred,
    },
    lang: userSetting?.lang || 'auto',
  };
}

