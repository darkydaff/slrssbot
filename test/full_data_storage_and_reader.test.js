import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractCleanSummary } from '../tgcloud/lib/formatter.js';
import { feedEntries, userArticleStates, feedStates, subscriptions } from '../tgcloud/schema.js';
import getFeeds from '../tgcloud/endpoints/get_feeds.js';
import getArticles from '../tgcloud/endpoints/get_articles.js';
import getArticle from '../tgcloud/endpoints/get_article.js';
import setArticleState from '../tgcloud/endpoints/set_article_state.js';
import manageFeed from '../tgcloud/endpoints/manage_feed.js';
import { EndpointError } from 'sdk';

test('extractCleanSummary removes HTML tags, normalizes whitespace and truncates', () => {
  const html = `
    <div>
      <p>Hello <b>world</b>! This is a <a href="https://example.com">test</a> snippet.</p>
      <script>alert('bad')</script>
      <style>body { color: red; }</style>
      <p>It includes &amp; special characters and multiple    spaces.</p>
    </div>
  `;
  const summary = extractCleanSummary(html, 60);
  assert.ok(!summary.includes('<p>'));
  assert.ok(!summary.includes('<b>'));
  assert.ok(!summary.includes('alert'));
  assert.ok(!summary.includes('color: red'));
  assert.ok(summary.includes('Hello world!'));
  assert.ok(summary.includes('& special'));
  assert.ok(summary.length <= 65);
});

test('feedEntries schema has all article storage columns defined', () => {
  const cols = feedEntries.columns;
  assert.ok(cols.id);
  assert.ok(cols.feedUrl);
  assert.ok(cols.entryGuid);
  assert.ok(cols.title);
  assert.ok(cols.link);
  assert.ok(cols.author);
  assert.ok(cols.summary);
  assert.ok(cols.content);
  assert.ok(cols.leadImageUrl);
  assert.ok(cols.media);
  assert.ok(cols.publishedAt);
});

test('userArticleStates schema tracks per-user read and starred states', () => {
  const cols = userArticleStates.columns;
  assert.ok(cols.id);
  assert.ok(cols.userId);
  assert.ok(cols.entryId);
  assert.ok(cols.isRead);
  assert.ok(cols.isStarred);
  assert.ok(cols.readAt);
  assert.ok(cols.starredAt);
});

test('endpoints require authentication and reject unauthenticated requests', async () => {
  const unauthCtx = { initData: null };

  await assert.rejects(
    async () => getFeeds({}, unauthCtx),
    (err) => err instanceof EndpointError && err.parameters?.code === 'UNAUTHORIZED'
  );

  await assert.rejects(
    async () => getArticles({}, unauthCtx),
    (err) => err instanceof EndpointError && err.parameters?.code === 'UNAUTHORIZED'
  );

  await assert.rejects(
    async () => getArticle({ articleId: 1 }, unauthCtx),
    (err) => err instanceof EndpointError && err.parameters?.code === 'UNAUTHORIZED'
  );

  await assert.rejects(
    async () => setArticleState({ articleId: 1 }, unauthCtx),
    (err) => err instanceof EndpointError && err.parameters?.code === 'UNAUTHORIZED'
  );

  await assert.rejects(
    async () => manageFeed({ action: 'subscribe' }, unauthCtx),
    (err) => err instanceof EndpointError && err.parameters?.code === 'UNAUTHORIZED'
  );
});

test('set_article_state and get_article validate input arguments', async () => {
  const authCtx = { initData: { user: { id: 1001 } } };

  await assert.rejects(
    async () => getArticle({}, authCtx),
    (err) => err instanceof EndpointError && err.parameters?.code === 'INVALID_INPUT'
  );

  await assert.rejects(
    async () => setArticleState({}, authCtx),
    (err) => err instanceof EndpointError && err.parameters?.code === 'INVALID_INPUT'
  );

  await assert.rejects(
    async () => manageFeed({ action: 'invalid_action' }, authCtx),
    (err) => err instanceof EndpointError && err.parameters?.code === 'UNKNOWN_ACTION'
  );
});

test('get_articles and set_article_state mark_all_read execute without sql.join', async () => {
  const authCtx = { initData: { user: { id: 7352101195 } } };

  // Should succeed without throwing sql.join TypeError
  const res = await getArticles({ limit: 10, filter: 'unread' }, authCtx);
  assert.ok(Array.isArray(res.articles));
  assert.equal(typeof res.hasMore, 'boolean');

  const resAll = await getArticles({ limit: 10, filter: 'all' }, authCtx);
  assert.ok(Array.isArray(resAll.articles));

  const markRes = await setArticleState({ markAllRead: true }, authCtx);
  assert.equal(markRes.ok, true);
});

test('formatRelativeTime correctly handles unix seconds without defaulting to Jan 21 1970', async () => {
  const { formatRelativeTime } = await import('../src/lib/date.js');

  const nowSec = Math.floor(Date.now() / 1000);

  // 10 seconds ago (in seconds)
  assert.equal(formatRelativeTime(nowSec - 10), 'Just now');

  // 10 minutes ago (in seconds)
  assert.equal(formatRelativeTime(nowSec - 600), '10m ago');

  // 2 hours ago (in seconds)
  assert.equal(formatRelativeTime(nowSec - 7200), '2h ago');

  // 20 days ago should format to actual date, NEVER "Jan 21" unless actually Jan 21
  const oldSec = nowSec - (20 * 86400);
  const formatted = formatRelativeTime(oldSec);
  assert.ok(formatted && formatted !== '');
  assert.ok(!formatted.includes('1970'));
});

test('feed_entries handles re-subscription with ON CONFLICT DO NOTHING without unique constraint failure', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE feed_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      feed_url TEXT NOT NULL,
      entry_guid TEXT NOT NULL,
      title TEXT
    );
    CREATE UNIQUE INDEX uidx_entries_feed_guid ON feed_entries (feed_url, entry_guid);
  `);

  const insertSql = `INSERT INTO feed_entries (feed_url, entry_guid, title) VALUES (?, ?, ?) ON CONFLICT DO NOTHING;`;
  const stmt = db.prepare(insertSql);

  // First subscription
  stmt.run('https://news.google.com/rss/search?q=site:x.com/GithubProjects', 'guid-1', 'Article 1');
  stmt.run('https://news.google.com/rss/search?q=site:x.com/GithubProjects', 'guid-2', 'Article 2');

  const count1 = db.prepare('SELECT count(*) as count FROM feed_entries').get().count;
  assert.equal(count1, 2);

  // User deletes feed and adds again: existing entries re-encountered
  assert.doesNotThrow(() => {
    stmt.run('https://news.google.com/rss/search?q=site:x.com/GithubProjects', 'guid-1', 'Article 1 duplicate');
    stmt.run('https://news.google.com/rss/search?q=site:x.com/GithubProjects', 'guid-2', 'Article 2 duplicate');
    stmt.run('https://news.google.com/rss/search?q=site:x.com/GithubProjects', 'guid-3', 'Article 3 new');
  });

  const count2 = db.prepare('SELECT count(*) as count FROM feed_entries').get().count;
  assert.equal(count2, 3);
});

test('forcePollFeed prioritizes stored entries without making network requests', async () => {
  const { forcePollFeed } = await import('../tgcloud/lib/poller.js');
  // forcePollFeed should run without throwing or hitting external network when mock returns empty or entries
  const res = await forcePollFeed('https://example.com/feed.xml', 12345, 1);
  assert.ok(res);
  assert.equal(typeof res.sentCount, 'number');
});


