import { table, integer, text, boolean, index, uniqueIndex, sql } from 'sdk/db';

// 1. User and Channel Subscriptions
export const subscriptions = table('subscriptions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  chatId: integer('chat_id').notNull(),
  feedUrl: text('feed_url').notNull(),
  customTitle: text('custom_title'),
  sendMode: text('send_mode').default('default'), // 'default', 'link_only', 'telegraph'
  filterInclude: text('filter_include'),
  filterExclude: text('filter_exclude'),
  paused: boolean('paused').default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
}, (t) => ({
  chatFeedIdx: uniqueIndex('uidx_subscriptions_chat_feed').on(t.chatId, t.feedUrl),
  feedUrlIdx: index('idx_subscriptions_feed_url').on(t.feedUrl),
  chatIdIdx: index('idx_subscriptions_chat_id').on(t.chatId),
}));

// 2. Feed Metadata & HTTP Cache States
export const feedStates = table('feed_states', {
  feedUrl: text('feed_url').primaryKey(),
  title: text('title'),
  etag: text('etag'),
  lastModified: text('last_modified'),
  lastCheckedAt: integer('last_checked_at', { mode: 'timestamp' }),
  lastError: text('last_error'),
  errorCount: integer('error_count').default(0),
});

// 3. Entry Deduplication (prevent duplicate messages across restarts)
export const feedEntries = table('feed_entries', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  feedUrl: text('feed_url').notNull(),
  entryGuid: text('entry_guid').notNull(),
  publishedAt: integer('published_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
}, (t) => ({
  feedGuidIdx: uniqueIndex('uidx_entries_feed_guid').on(t.feedUrl, t.entryGuid),
  createdIdx: index('idx_entries_created').on(t.createdAt),
}));

// 4. Per-Chat Preferences
export const chatSettings = table('chat_settings', {
  chatId: integer('chat_id').primaryKey(),
  lang: text('lang').default('en'),
  enablePreview: boolean('enable_preview').default(true),
  displayTemplate: text('display_template'),
});
