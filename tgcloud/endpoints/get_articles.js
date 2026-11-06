import { db, EndpointError } from 'sdk';
import { eq, sql } from 'sdk/db';
import { subscriptions, feedStates } from '../schema.js';
import { decodeEntities } from '../lib/formatter.js';

export default async function (input, ctx) {
  const user = ctx.initData?.user;
  if (!user?.id) {
    throw new EndpointError('Authentication required', { code: 'UNAUTHORIZED' });
  }

  const userId = user.id;
  const filter = input?.filter || 'unread'; // 'unread', 'all', 'starred'
  const targetFeedUrl = input?.feedUrl ? String(input.feedUrl).trim() : null;
  const targetCategory = input?.category && input.category !== 'all' ? String(input.category).trim() : null;
  const search = input?.search ? String(input.search).trim() : null;
  const limit = Math.min(Math.max(parseInt(input?.limit, 10) || 25, 5), 60);
  const offset = Math.max(parseInt(input?.offset, 10) || 0, 0);

  // Get user's subscriptions
  const userSubs = await db.select()
    .from(subscriptions)
    .where(eq(subscriptions.chatId, userId))
    .all();

  if (!userSubs || userSubs.length === 0) {
    return { articles: [], hasMore: false };
  }

  const feedUrlSet = new Set(userSubs.map((s) => s.feedUrl));
  if (targetFeedUrl && !feedUrlSet.has(targetFeedUrl)) {
    return { articles: [], hasMore: false };
  }

  const allStates = await db.select().from(feedStates).all();
  const stateMap = new Map(allStates.map((s) => [s.feedUrl, s]));
  const subMap = new Map(userSubs.map((s) => [s.feedUrl, s]));

  // Build SQL dynamically for safety and performance
  let whereClause;
  if (targetFeedUrl) {
    whereClause = sql`fe.feed_url = ${targetFeedUrl}`;
  } else if (targetCategory) {
    whereClause = sql`fe.feed_url IN (SELECT feed_url FROM subscriptions WHERE chat_id = ${userId} AND category = ${targetCategory})`;
  } else {
    whereClause = sql`fe.feed_url IN (SELECT feed_url FROM subscriptions WHERE chat_id = ${userId})`;
  }

  if (filter === 'starred') {
    whereClause = sql`${whereClause} AND uas.is_starred = 1`;
  } else if (filter === 'unread') {
    whereClause = sql`${whereClause} AND (uas.is_read IS NULL OR uas.is_read = 0)`;
  }

  if (search) {
    const searchPattern = `%${search}%`;
    whereClause = sql`${whereClause} AND (fe.title LIKE ${searchPattern} OR fe.summary LIKE ${searchPattern})`;
  }

  const queryLimit = limit + 1;
  const rows = await db.all(sql`
    SELECT
      fe.id,
      fe.feed_url,
      fe.entry_guid,
      fe.title,
      fe.link,
      fe.author,
      fe.summary,
      (CASE WHEN fe.content IS NOT NULL AND length(fe.content) <= 30000 THEN fe.content ELSE NULL END) AS content,
      fe.lead_image_url,
      fe.telegraph_url,
      fe.published_at,
      fe.created_at,
      uas.is_read,
      uas.is_starred,
      (CASE WHEN fe.content IS NOT NULL AND length(fe.content) > 0 THEN 1 ELSE 0 END) AS has_content
    FROM feed_entries fe
    LEFT JOIN user_article_states uas ON uas.entry_id = fe.id AND uas.user_id = ${userId}
    WHERE ${whereClause}
    ORDER BY fe.published_at DESC, fe.id DESC
    LIMIT ${queryLimit} OFFSET ${offset}
  `);

  const hasMore = rows.length > limit;
  const articlesList = (hasMore ? rows.slice(0, limit) : rows).map((r) => {
    const sub = subMap.get(r.feed_url);
    const state = stateMap.get(r.feed_url);
    const feedTitle = decodeEntities(sub?.customTitle || state?.title || r.feed_url);
    let title = r.title;
    if (!title || title === 'Untitled') {
      const cleanSum = (r.summary || '').trim();
      if (cleanSum) {
        title = cleanSum.slice(0, 100);
      } else {
        title = `${feedTitle} item`;
      }
    }
    title = decodeEntities(title);
    const summary = decodeEntities(r.summary || '');

    const normalizeTimestamp = (ts) => {
      if (!ts) return null;
      if (ts instanceof Date) return ts.toISOString();
      if (typeof ts === 'number') {
        return new Date(ts < 1e11 ? ts * 1000 : ts).toISOString();
      }
      const num = Number(ts);
      if (!isNaN(num) && /^\d+$/.test(String(ts).trim())) {
        return new Date(num < 1e11 ? num * 1000 : num).toISOString();
      }
      const d = new Date(ts);
      return isNaN(d.getTime()) ? null : d.toISOString();
    };

    return {
      id: r.id,
      feedUrl: r.feed_url,
      feedTitle,
      category: sub?.category || 'General',
      title,
      link: r.link || '',
      author: decodeEntities(r.author || feedTitle),
      summary,
      content: r.content || null,
      leadImageUrl: r.lead_image_url || null,
      telegraphUrl: r.telegraph_url || null,
      publishedAt: normalizeTimestamp(r.published_at),
      createdAt: normalizeTimestamp(r.created_at),
      isRead: Boolean(r.is_read),
      isStarred: Boolean(r.is_starred),
      hasContent: Boolean(r.has_content),
    };
  });

  return {
    articles: articlesList,
    hasMore,
  };
}

