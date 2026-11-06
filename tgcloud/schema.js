import { table, integer, text, boolean, json, index, uniqueIndex, sql } from 'sdk/db';

// 1. User and Channel Subscriptions
export const subscriptions = table('subscriptions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  chatId: integer('chat_id').notNull(),
  feedUrl: text('feed_url').notNull(),
  customTitle: text('custom_title'),
  category: text('category').default('General'),
  sendMode: text('send_mode').default('default'), // 'default', 'link_only', 'telegraph', 'photo'
  filterInclude: text('filter_include'),
  filterExclude: text('filter_exclude'),
  paused: boolean('paused').default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
}, (t) => ({
  chatFeedIdx: uniqueIndex('uidx_subscriptions_chat_feed').on(t.chatId, t.feedUrl),
  feedUrlIdx: index('idx_subscriptions_feed_url').on(t.feedUrl),
  chatIdIdx: index('idx_subscriptions_chat_id').on(t.chatId),
  chatCategoryIdx: index('idx_subscriptions_chat_category').on(t.chatId, t.category),
}));

// 2. Feed Metadata & HTTP Cache States
export const feedStates = table('feed_states', {
  feedUrl: text('feed_url').primaryKey(),
  title: text('title'),
  description: text('description'),
  siteUrl: text('site_url'),
  iconUrl: text('icon_url'),
  etag: text('etag'),
  lastModified: text('last_modified'),
  lastCheckedAt: integer('last_checked_at', { mode: 'timestamp' }),
  lastError: text('last_error'),
  errorCount: integer('error_count').default(0),
});

// 3. Stored Articles / Entries with Full Content and Metadata
export const feedEntries = table('feed_entries', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  feedUrl: text('feed_url').notNull(),
  entryGuid: text('entry_guid').notNull(),
  title: text('title'),
  link: text('link'),
  author: text('author'),
  summary: text('summary'),
  content: text('content'),
  leadImageUrl: text('lead_image_url'),
  media: json('media'),
  telegraphUrl: text('telegraph_url'),
  publishedAt: integer('published_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
}, (t) => ({
  feedGuidIdx: uniqueIndex('uidx_entries_feed_guid').on(t.feedUrl, t.entryGuid),
  createdIdx: index('idx_entries_created').on(t.createdAt),
  feedPubIdx: index('idx_entries_feed_pub').on(t.feedUrl, t.publishedAt),
}));

// 4. Per-User Article Reading & Star State
export const userArticleStates = table('user_article_states', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull(),
  entryId: integer('entry_id').notNull(),
  isRead: boolean('is_read').default(false),
  isStarred: boolean('is_starred').default(false),
  readAt: integer('read_at', { mode: 'timestamp' }),
  starredAt: integer('starred_at', { mode: 'timestamp' }),
}, (t) => ({
  userEntryIdx: uniqueIndex('uidx_user_article_states').on(t.userId, t.entryId),
  userReadIdx: index('idx_user_articles_read').on(t.userId, t.isRead),
  userStarredIdx: index('idx_user_articles_starred').on(t.userId, t.isStarred),
}));

// 5. Per-Chat Preferences
export const chatSettings = table('chat_settings', {
  chatId: integer('chat_id').primaryKey(),
  lang: text('lang').default('en'),
  enablePreview: boolean('enable_preview').default(true),
  displayTemplate: text('display_template'),
  apiKey: text('api_key'),
  folders: json('folders'),
});

// 6. Global Bot Config (e.g. Telegraph account token)
export const botConfig = table('bot_config', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

// 7. Daily Aggregated Metrics & Network Traffic
export const botDailyStats = table('bot_daily_stats', {
  date: text('date').primaryKey(), // 'YYYY-MM-DD' (UTC)
  activeUsers: integer('active_users').default(0),
  newUsers: integer('new_users').default(0),
  articlesFetched: integer('articles_fetched').default(0),
  articlesDelivered: integer('articles_delivered').default(0),
  telegraphCreated: integer('telegraph_created').default(0),
  feedBytes: integer('feed_bytes').default(0),           // Inbound RSS/Atom bytes
  telegraphBytes: integer('telegraph_bytes').default(0), // Telegraph API bytes (in + out)
  extractorBytes: integer('extractor_bytes').default(0), // Web scraping / full article bytes
  cacheBytesSaved: integer('cache_bytes_saved').default(0), // Bandwidth saved via 304 Not Modified
  pollCount: integer('poll_count').default(0),
  pollErrors: integer('poll_errors').default(0),
  commandsCount: integer('commands_count').default(0),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

// 8. Per-User Activity Tracking (DAU, WAU, MAU)
export const userActivity = table('user_activity', {
  userId: integer('user_id').primaryKey(),
  chatType: text('chat_type').default('private'), // 'private', 'channel', 'group'
  firstSeenAt: integer('first_seen_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  lastActiveAt: integer('last_active_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  interactionsCount: integer('interactions_count').default(1),
  lastCommand: text('last_command'),
}, (t) => ({
  lastActiveIdx: index('idx_user_activity_last_active').on(t.lastActiveAt),
  firstSeenIdx: index('idx_user_activity_first_seen').on(t.firstSeenAt),
}));

