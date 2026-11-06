import { db, EndpointError } from 'sdk';
import { eq, and, sql } from 'sdk/db';
import { userArticleStates, subscriptions } from '../schema.js';

export default async function (input, ctx) {
  const user = ctx.initData?.user;
  if (!user?.id) {
    throw new EndpointError('Authentication required', { code: 'UNAUTHORIZED' });
  }

  const userId = user.id;

  // 1. Mark All as Read
  if (input?.markAllRead) {
    const targetClause = input.feedUrl
      ? sql`fe.feed_url = ${String(input.feedUrl).trim()}`
      : sql`fe.feed_url IN (SELECT feed_url FROM subscriptions WHERE chat_id = ${userId})`;

    // Single atomic batch query to mark up to 500 unread entries in one database operation
    await db.run(sql`
      INSERT INTO user_article_states (user_id, entry_id, is_read, is_starred, read_at)
      SELECT
        ${userId},
        fe.id,
        1,
        0,
        unixepoch()
      FROM feed_entries fe
      LEFT JOIN user_article_states uas ON uas.entry_id = fe.id AND uas.user_id = ${userId}
      WHERE ${targetClause}
        AND (uas.is_read IS NULL OR uas.is_read = 0)
      LIMIT 500
      ON CONFLICT (user_id, entry_id) DO UPDATE SET
        is_read = 1,
        read_at = unixepoch()
    `);

    return { success: true, ok: true };
  }

  // 2. Individual Article State Update
  const articleId = parseInt(input?.articleId, 10);
  if (!articleId) {
    throw new EndpointError('Missing articleId or markAllRead', { code: 'INVALID_INPUT' });
  }

  const existing = await db.select()
    .from(userArticleStates)
    .where(and(eq(userArticleStates.userId, userId), eq(userArticleStates.entryId, articleId)))
    .get();

  const updateFields = {};
  if (typeof input?.isRead === 'boolean') {
    updateFields.isRead = input.isRead;
    if (input.isRead) updateFields.readAt = new Date();
  }
  if (typeof input?.isStarred === 'boolean') {
    updateFields.isStarred = input.isStarred;
    if (input.isStarred) updateFields.starredAt = new Date();
  }

  if (existing) {
    if (Object.keys(updateFields).length > 0) {
      await db.update(userArticleStates)
        .set(updateFields)
        .where(eq(userArticleStates.id, existing.id))
        .run();
    }
  } else {
    try {
      await db.insert(userArticleStates).values({
        userId,
        entryId: articleId,
        isRead: Boolean(input?.isRead),
        isStarred: Boolean(input?.isStarred),
        readAt: input?.isRead ? new Date() : null,
        starredAt: input?.isStarred ? new Date() : null,
      }).onConflictDoNothing().run();
    } catch {
      // In case another concurrent query already inserted it, update state
      if (Object.keys(updateFields).length > 0) {
        await db.update(userArticleStates)
          .set(updateFields)
          .where(and(eq(userArticleStates.userId, userId), eq(userArticleStates.entryId, articleId)))
          .run();
      }
    }
  }

  return { success: true };
}

