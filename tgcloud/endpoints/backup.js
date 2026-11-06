/**
 * tgcloud/endpoints/backup.js — Full JSON Data Backup & Restore
 */

import { db, EndpointError } from 'sdk';
import { eq, and, sql } from 'sdk/db';
import { subscriptions, userArticleStates, chatSettings, feedEntries } from '../schema.js';

export default async function (input, ctx) {
  const user = ctx.initData?.user;
  if (!user?.id) {
    throw new EndpointError('Authentication required', { code: 'UNAUTHORIZED' });
  }

  const userId = user.id;
  const action = input?.action;

  // 1. Export Data Backup
  if (action === 'export') {
    const userSubs = await db.select()
      .from(subscriptions)
      .where(eq(subscriptions.chatId, userId))
      .all();

    const userStates = await db.all(sql`
      SELECT
        fe.feed_url,
        fe.entry_guid,
        fe.link,
        uas.is_read,
        uas.is_starred,
        uas.read_at,
        uas.starred_at
      FROM user_article_states uas
      INNER JOIN feed_entries fe ON fe.id = uas.entry_id
      WHERE uas.user_id = ${userId}
    `);

    const setting = await db.select()
      .from(chatSettings)
      .where(eq(chatSettings.chatId, userId))
      .get();

    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      subscriptions: (userSubs || []).map((s) => ({
        feedUrl: s.feedUrl,
        customTitle: s.customTitle,
        category: s.category || 'General',
        sendMode: s.sendMode || 'default',
      })),
      readingStates: (userStates || []).map((st) => ({
        feedUrl: st.feed_url,
        entryGuid: st.entry_guid,
        link: st.link,
        isRead: Boolean(st.is_read),
        isStarred: Boolean(st.is_starred),
        readAt: st.read_at,
        starredAt: st.starred_at,
      })),
      settings: {
        lang: setting?.lang || 'auto',
      },
    };
  }

  // 2. Restore Data Backup
  if (action === 'import') {
    const backup = input?.backupData;
    if (!backup || !Array.isArray(backup.subscriptions)) {
      throw new EndpointError('Invalid backup file format', { code: 'INVALID_FORMAT' });
    }

    let subsImported = 0;
    for (const sub of backup.subscriptions) {
      if (!sub.feedUrl) continue;
      const existing = await db.select()
        .from(subscriptions)
        .where(and(eq(subscriptions.chatId, userId), eq(subscriptions.feedUrl, sub.feedUrl)))
        .get();

      if (!existing) {
        await db.insert(subscriptions).values({
          chatId: userId,
          feedUrl: sub.feedUrl,
          customTitle: sub.customTitle || null,
          category: sub.category || 'General',
          sendMode: sub.sendMode || 'default',
        }).run();
        subsImported++;
      } else if (sub.category) {
        await db.update(subscriptions)
          .set({ category: sub.category })
          .where(eq(subscriptions.id, existing.id))
          .run();
      }
    }

    let statesRestored = 0;
    if (Array.isArray(backup.readingStates)) {
      for (const st of backup.readingStates) {
        if (!st.feedUrl || (!st.entryGuid && !st.link)) continue;
        const entry = await db.select()
          .from(feedEntries)
          .where(and(eq(feedEntries.feedUrl, st.feedUrl), eq(feedEntries.entryGuid, st.entryGuid || st.link)))
          .get();

        if (entry) {
          await db.insert(userArticleStates).values({
            userId,
            entryId: entry.id,
            isRead: Boolean(st.isRead),
            isStarred: Boolean(st.isStarred),
            readAt: st.readAt ? new Date(st.readAt) : null,
            starredAt: st.starredAt ? new Date(st.starredAt) : null,
          }).onConflictDoUpdate({
            target: [userArticleStates.userId, userArticleStates.entryId],
            set: {
              isRead: Boolean(st.isRead),
              isStarred: Boolean(st.isStarred),
            },
          }).run();
          statesRestored++;
        }
      }
    }

    return {
      success: true,
      subscriptionsImported: subsImported,
      statesRestored,
    };
  }

  throw new EndpointError(`Unknown backup action: ${action}`, { code: 'UNKNOWN_ACTION' });
}

