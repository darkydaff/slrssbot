/**
 * tgcloud/endpoints/fever.js — Fever API v3 Implementation
 * Compatible with Fluent Reader, Fluent Reader Lite, Reeder, Unread, and Fiery Feeds.
 */

import { db, EndpointError } from 'sdk';
import { eq, and, sql } from 'sdk/db';
import { subscriptions, feedStates, feedEntries, userArticleStates, chatSettings } from '../schema.js';
import { decodeEntities } from '../lib/formatter.js';

export default async function (input, ctx) {
  // 1. Authenticate user: either via ctx.initData (Mini App) or via apiKey in input/query
  let userId = ctx.initData?.user?.id;

  const apiKey = input?.apiKey || input?.api_key || ctx.headers?.['x-api-key'];

  if (!userId && apiKey) {
    // Lookup user by apiKey
    const setting = await db.select()
      .from(chatSettings)
      .where(eq(chatSettings.apiKey, String(apiKey).trim()))
      .get();
    if (setting) {
      userId = setting.chatId;
    }
  }

  if (!userId) {
    return {
      api_version: 3,
      auth: 0,
    };
  }

  // 2. Fetch user's subscriptions and feed states
  const userSubs = await db.select()
    .from(subscriptions)
    .where(eq(subscriptions.chatId, userId))
    .all();

  const allStates = await db.select().from(feedStates).all();
  const stateMap = new Map(allStates.map((s) => [s.feedUrl, s]));
  const feedUrlToSubMap = new Map(userSubs.map((s) => [s.feedUrl, s]));
  const subIdToSubMap = new Map(userSubs.map((s) => [s.id, s]));

  const nowEpoch = Math.floor(Date.now() / 1000);

  const response = {
    api_version: 3,
    auth: 1,
    last_refreshed_on_time: nowEpoch,
  };

  // 3. Handle Mark Actions
  if (input?.mark) {
    const markType = String(input.mark); // 'item', 'feed', 'group'
    const markAs = String(input.as); // 'read', 'saved', 'unsaved'
    const targetId = parseInt(input.id, 10);

    if (markType === 'item' && targetId) {
      if (markAs === 'read') {
        await db.insert(userArticleStates).values({
          userId,
          entryId: targetId,
          isRead: true,
          readAt: new Date(),
        }).onConflictDoUpdate({
          target: [userArticleStates.userId, userArticleStates.entryId],
          set: { isRead: true, readAt: new Date() },
        }).run();
      } else if (markAs === 'saved') {
        await db.insert(userArticleStates).values({
          userId,
          entryId: targetId,
          isStarred: true,
          starredAt: new Date(),
        }).onConflictDoUpdate({
          target: [userArticleStates.userId, userArticleStates.entryId],
          set: { isStarred: true, starredAt: new Date() },
        }).run();
      } else if (markAs === 'unsaved') {
        await db.insert(userArticleStates).values({
          userId,
          entryId: targetId,
          isStarred: false,
        }).onConflictDoUpdate({
          target: [userArticleStates.userId, userArticleStates.entryId],
          set: { isStarred: false },
        }).run();
      }
    } else if (markType === 'feed' && targetId) {
      const sub = subIdToSubMap.get(targetId);
      if (sub) {
        const rows = await db.all(sql`
          SELECT id FROM feed_entries WHERE feed_url = ${sub.feedUrl}
        `);
        for (const r of rows) {
          await db.insert(userArticleStates).values({
            userId,
            entryId: r.id,
            isRead: true,
            readAt: new Date(),
          }).onConflictDoUpdate({
            target: [userArticleStates.userId, userArticleStates.entryId],
            set: { isRead: true, readAt: new Date() },
          }).run();
        }
      }
    }
  }

  // 4. Return Groups & Feeds Groups
  if ('groups' in input || input?.groups !== undefined) {
    const categoryMap = new Map();
    let nextGroupId = 1;

    for (const sub of userSubs) {
      const cat = sub.category || 'General';
      if (!categoryMap.has(cat)) {
        categoryMap.set(cat, { id: nextGroupId++, title: cat, feedIds: [] });
      }
      categoryMap.get(cat).feedIds.push(sub.id);
    }

    const groupsList = [];
    const feedsGroupsList = [];

    for (const catObj of categoryMap.values()) {
      groupsList.push({ id: catObj.id, title: catObj.title });
      feedsGroupsList.push({ group_id: catObj.id, feed_ids: catObj.feedIds.join(',') });
    }

    response.groups = groupsList;
    response.feeds_groups = feedsGroupsList;
  }

  // 5. Return Feeds
  if ('feeds' in input || input?.feeds !== undefined) {
    response.feeds = userSubs.map((sub) => {
      const state = stateMap.get(sub.feedUrl);
      const updatedEpoch = state?.lastCheckedAt
        ? Math.floor(new Date(state.lastCheckedAt).getTime() / 1000)
        : nowEpoch;

      return {
        id: sub.id,
        favicon_id: 0,
        title: decodeEntities(sub.customTitle || state?.title || sub.feedUrl),
        url: sub.feedUrl,
        site_url: state?.siteUrl || '',
        is_spark: 0,
        last_updated_on_time: updatedEpoch,
      };
    });
  }

  // 6. Return Favicons
  if ('favicons' in input || input?.favicons !== undefined) {
    response.favicons = [{ id: 0, data: 'image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7' }];
  }

  // 7. Return Items
  if ('items' in input || input?.items !== undefined) {
    const sinceId = parseInt(input.since_id, 10) || 0;
    const maxId = parseInt(input.max_id, 10) || 0;
    const withIds = input.with_ids ? String(input.with_ids).split(',').map((id) => parseInt(id, 10)).filter(Boolean) : null;

    let whereClause = sql`fe.feed_url IN (SELECT feed_url FROM subscriptions WHERE chat_id = ${userId})`;

    if (sinceId > 0) {
      whereClause = sql`${whereClause} AND fe.id > ${sinceId}`;
    }
    if (maxId > 0) {
      whereClause = sql`${whereClause} AND fe.id < ${maxId}`;
    }

    const limit = 50;
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
      ORDER BY fe.id DESC
      LIMIT ${limit}
    `);

    response.items = rows.map((r) => {
      const sub = feedUrlToSubMap.get(r.feed_url);
      const pubEpoch = r.published_at ? Math.floor(new Date(r.published_at).getTime() / 1000) : nowEpoch;
      return {
        id: r.id,
        feed_id: sub?.id || 0,
        title: decodeEntities(r.title || 'Untitled'),
        author: decodeEntities(r.author || ''),
        html: r.content || r.summary || '',
        url: r.link || '',
        is_saved: r.is_starred ? 1 : 0,
        is_read: r.is_read ? 1 : 0,
        created_on_time: pubEpoch,
      };
    });
  }

  // 8. Return Unread & Saved Item IDs
  if ('unread_item_ids' in input || input?.unread_item_ids !== undefined) {
    const unreadRows = await db.all(sql`
      SELECT fe.id
      FROM feed_entries fe
      LEFT JOIN user_article_states uas ON uas.entry_id = fe.id AND uas.user_id = ${userId}
      WHERE fe.feed_url IN (SELECT feed_url FROM subscriptions WHERE chat_id = ${userId})
        AND (uas.is_read IS NULL OR uas.is_read = 0)
      ORDER BY fe.id DESC
      LIMIT 1000
    `);
    response.unread_item_ids = unreadRows.map((r) => r.id).join(',');
  }

  if ('saved_item_ids' in input || input?.saved_item_ids !== undefined) {
    const savedRows = await db.all(sql`
      SELECT entry_id as id
      FROM user_article_states
      WHERE user_id = ${userId} AND is_starred = 1
      ORDER BY entry_id DESC
      LIMIT 1000
    `);
    response.saved_item_ids = savedRows.map((r) => r.id).join(',');
  }

  return response;
}

