/**
 * tgcloud/endpoints/greader.js — Google Reader API Implementation
 * Compatible with Fluent Reader, Fluent Reader Lite, FreshRSS, NetNewsWire, and Reeder.
 */

import { db, EndpointError } from 'sdk';
import { eq, and, sql } from 'sdk/db';
import { subscriptions, feedStates, feedEntries, userArticleStates, chatSettings } from '../schema.js';
import { decodeEntities } from '../lib/formatter.js';

export default async function (input, ctx) {
  // 1. Authenticate user: either via ctx.initData or via apiKey in input/headers
  let userId = ctx.initData?.user?.id;
  const apiKey = input?.apiKey || input?.api_key || ctx.headers?.['x-api-key'] || ctx.headers?.authorization?.replace(/^Bearer\s+/i, '');

  if (!userId && apiKey) {
    const setting = await db.select()
      .from(chatSettings)
      .where(eq(chatSettings.apiKey, String(apiKey).trim()))
      .get();
    if (setting) {
      userId = setting.chatId;
    }
  }

  if (!userId) {
    throw new EndpointError('Authentication required', { code: 'UNAUTHORIZED' });
  }

  const endpoint = String(input?.endpoint || input?.action || '').trim().replace(/^\/+/, '');

  // 2. Token
  if (endpoint === 'token' || endpoint.endsWith('/token')) {
    return { token: `token_${userId}_${Date.now()}` };
  }

  // 3. User Info
  if (endpoint === 'user-info' || endpoint.endsWith('/user-info')) {
    return {
      userId: String(userId),
      userName: `User ${userId}`,
      userProfileId: String(userId),
      userEmail: `user_${userId}@slrssbot.tg`,
      isBloggerUser: false,
      signupTimeSec: 1600000000,
      isMultiUser: true,
    };
  }

  const userSubs = await db.select()
    .from(subscriptions)
    .where(eq(subscriptions.chatId, userId))
    .all();

  const allStates = await db.select().from(feedStates).all();
  const stateMap = new Map(allStates.map((s) => [s.feedUrl, s]));

  // 4. Subscription List
  if (endpoint === 'subscription/list' || endpoint.endsWith('/subscription/list')) {
    const subsList = (userSubs || []).map((sub) => {
      const state = stateMap.get(sub.feedUrl);
      const cat = sub.category || 'General';
      return {
        id: `feed/${sub.feedUrl}`,
        title: decodeEntities(sub.customTitle || state?.title || sub.feedUrl),
        categories: [
          {
            id: `user/${userId}/label/${cat}`,
            label: cat,
          },
        ],
        sortid: String(sub.id).padStart(8, '0'),
        firstitemmsec: '0',
        url: sub.feedUrl,
        htmlUrl: state?.siteUrl || '',
      };
    });

    return { subscriptions: subsList };
  }

  // 5. Tag List
  if (endpoint === 'tag/list' || endpoint.endsWith('/tag/list')) {
    const categorySet = new Set(userSubs.map((s) => s.category || 'General'));
    const tags = [
      { id: `user/${userId}/state/com.google/starred` },
      { id: `user/${userId}/state/com.google/reading-list` },
      { id: `user/${userId}/state/com.google/read` },
    ];
    for (const cat of categorySet) {
      tags.push({ id: `user/${userId}/label/${cat}` });
    }
    return { tags };
  }

  // 6. Unread Counts
  if (endpoint === 'unread-count' || endpoint.endsWith('/unread-count')) {
    const unreadCounts = [];
    let totalUnread = 0;

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

    const nowUsec = String(Date.now() * 1000);
    for (const sub of userSubs) {
      const counts = countMap.get(sub.feedUrl) || { total: 0, read: 0 };
      const count = Math.max(0, counts.total - counts.read);
      totalUnread += count;

      unreadCounts.push({
        id: `feed/${sub.feedUrl}`,
        count,
        newestItemTimestampUsec: nowUsec,
      });
    }

    unreadCounts.push({
      id: `user/${userId}/state/com.google/reading-list`,
      count: totalUnread,
      newestItemTimestampUsec: String(Date.now() * 1000),
    });

    return { max: 1000, unreadcounts: unreadCounts };
  }

  // 7. Edit Tag (Mark as Read, Star, Unstar)
  if (endpoint === 'edit-tag' || endpoint.endsWith('/edit-tag')) {
    const addTag = input?.a ? String(input.a) : '';
    const removeTag = input?.r ? String(input.r) : '';
    const rawId = input?.i ? String(input.i) : '';
    const entryId = parseInt(rawId.replace(/^tag:google\.com,\d+:reader\/item\//, ''), 10);

    if (entryId) {
      if (addTag.includes('read')) {
        await db.insert(userArticleStates).values({
          userId,
          entryId,
          isRead: true,
          readAt: new Date(),
        }).onConflictDoUpdate({
          target: [userArticleStates.userId, userArticleStates.entryId],
          set: { isRead: true, readAt: new Date() },
        }).run();
      }
      if (removeTag.includes('read')) {
        await db.insert(userArticleStates).values({
          userId,
          entryId,
          isRead: false,
        }).onConflictDoUpdate({
          target: [userArticleStates.userId, userArticleStates.entryId],
          set: { isRead: false },
        }).run();
      }
      if (addTag.includes('starred')) {
        await db.insert(userArticleStates).values({
          userId,
          entryId,
          isStarred: true,
          starredAt: new Date(),
        }).onConflictDoUpdate({
          target: [userArticleStates.userId, userArticleStates.entryId],
          set: { isStarred: true, starredAt: new Date() },
        }).run();
      }
      if (removeTag.includes('starred')) {
        await db.insert(userArticleStates).values({
          userId,
          entryId,
          isStarred: false,
        }).onConflictDoUpdate({
          target: [userArticleStates.userId, userArticleStates.entryId],
          set: { isStarred: false },
        }).run();
      }
    }

    return { ok: true, status: 'OK' };
  }

  // 8. Stream Contents
  if (endpoint.includes('stream/contents') || endpoint === 'stream') {
    const limit = Math.min(parseInt(input?.n, 10) || 30, 100);
    const filterOnlyUnread = String(input?.xt || '').includes('read');

    let whereClause = sql`fe.feed_url IN (SELECT feed_url FROM subscriptions WHERE chat_id = ${userId})`;
    if (filterOnlyUnread) {
      whereClause = sql`${whereClause} AND (uas.is_read IS NULL OR uas.is_read = 0)`;
    }

    const rows = await db.all(sql`
      SELECT
        fe.id,
        fe.feed_url,
        fe.title,
        fe.link,
        fe.author,
        fe.summary,
        fe.content,
        fe.published_at,
        uas.is_read,
        uas.is_starred
      FROM feed_entries fe
      LEFT JOIN user_article_states uas ON uas.entry_id = fe.id AND uas.user_id = ${userId}
      WHERE ${whereClause}
      ORDER BY fe.published_at DESC, fe.id DESC
      LIMIT ${limit}
    `);

    const items = rows.map((r) => {
      const state = stateMap.get(r.feed_url);
      const sub = userSubs.find((s) => s.feedUrl === r.feed_url);
      const pubSec = r.published_at ? Math.floor(new Date(r.published_at).getTime() / 1000) : Math.floor(Date.now() / 1000);
      const categories = [`user/${userId}/state/com.google/reading-list`];
      if (r.is_read) categories.push(`user/${userId}/state/com.google/read`);
      if (r.is_starred) categories.push(`user/${userId}/state/com.google/starred`);
      if (sub?.category) categories.push(`user/${userId}/label/${sub.category}`);

      return {
        id: `tag:google.com,2005:reader/item/${r.id}`,
        title: decodeEntities(r.title || 'Untitled'),
        published: pubSec,
        updated: pubSec,
        author: decodeEntities(r.author || ''),
        categories,
        canonical: [{ href: r.link || '' }],
        alternate: [{ href: r.link || '', type: 'text/html' }],
        summary: { content: r.summary || '' },
        content: { content: r.content || r.summary || '' },
        origin: {
          streamId: `feed/${r.feed_url}`,
          title: decodeEntities(sub?.customTitle || state?.title || r.feed_url),
          htmlUrl: state?.siteUrl || '',
        },
      };
    });

    return {
      direction: 'ltr',
      id: `user/${userId}/state/com.google/reading-list`,
      title: 'Reading list',
      updated: Math.floor(Date.now() / 1000),
      items,
    };
  }

  return { ok: true, message: 'Google Reader API Endpoint' };
}

