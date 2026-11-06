import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseOpml, generateOpml } from '../tgcloud/lib/opml.js';
import feverEndpoint from '../tgcloud/endpoints/fever.js';
import greaderEndpoint from '../tgcloud/endpoints/greader.js';
import backupEndpoint from '../tgcloud/endpoints/backup.js';
import manageFeed from '../tgcloud/endpoints/manage_feed.js';
import getFeeds from '../tgcloud/endpoints/get_feeds.js';
import pollEndpoint from '../tgcloud/endpoints/poll.js';

test('OPML parser extracts nested folder categories', () => {
  const opmlWithCategories = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>Categorized Feeds</title></head>
  <body>
    <outline text="Technology" title="Technology">
      <outline type="rss" text="Hacker News" title="Hacker News" xmlUrl="https://news.ycombinator.com/rss"/>
      <outline type="rss" text="Ars Technica" title="Ars Technica" xmlUrl="https://arstechnica.com/feed/"/>
    </outline>
    <outline text="Finance" title="Finance">
      <outline type="rss" text="Bloomberg News" title="Bloomberg News" xmlUrl="https://bloomberg.com/feed"/>
    </outline>
    <outline type="rss" text="Standalone Feed" title="Standalone Feed" xmlUrl="https://example.com/rss"/>
  </body>
</opml>`;

  const feeds = parseOpml(opmlWithCategories);
  assert.equal(feeds.length, 4);

  const hn = feeds.find((f) => f.title === 'Hacker News');
  assert.ok(hn);
  assert.equal(hn.category, 'Technology');

  const bloomberg = feeds.find((f) => f.title === 'Bloomberg News');
  assert.ok(bloomberg);
  assert.equal(bloomberg.category, 'Finance');

  const standalone = feeds.find((f) => f.title === 'Standalone Feed');
  assert.ok(standalone);
  assert.equal(standalone.category, 'General');

  // Test OPML generation retains categories
  const generatedXml = generateOpml(feeds, 'Exported Feeds');
  assert.ok(generatedXml.includes('<outline text="Technology" title="Technology">'));
  assert.ok(generatedXml.includes('<outline text="Finance" title="Finance">'));
  assert.ok(generatedXml.includes('xmlUrl="https://news.ycombinator.com/rss"'));
});

test('Fever API endpoint handles auth and basic query', async () => {
  // Test unauthenticated
  const unauthRes = await feverEndpoint({}, { initData: null });
  assert.equal(unauthRes.auth, 0);

  // Test authenticated via Telegram context
  const authCtx = { initData: { user: { id: 777 } } };
  const authRes = await feverEndpoint({ groups: 1, feeds: 1 }, authCtx);
  assert.equal(authRes.auth, 1);
  assert.equal(authRes.api_version, 3);
  assert.ok(Array.isArray(authRes.groups));
  assert.ok(Array.isArray(authRes.feeds));
});

test('Google Reader API endpoint handles token, user-info, and subscription/list', async () => {
  const authCtx = { initData: { user: { id: 888 } } };

  const tokenRes = await greaderEndpoint({ endpoint: 'token' }, authCtx);
  assert.ok(tokenRes.token);
  assert.ok(tokenRes.token.includes('888'));

  const userRes = await greaderEndpoint({ endpoint: 'user-info' }, authCtx);
  assert.equal(userRes.userId, '888');

  const subsRes = await greaderEndpoint({ endpoint: 'subscription/list' }, authCtx);
  assert.ok(Array.isArray(subsRes.subscriptions));
});

test('Backup endpoint exports structured JSON and validates format on import', async () => {
  const authCtx = { initData: { user: { id: 999 } } };

  const exportRes = await backupEndpoint({ action: 'export' }, authCtx);
  assert.equal(exportRes.version, 1);
  assert.ok(Array.isArray(exportRes.subscriptions));
  assert.ok(Array.isArray(exportRes.readingStates));

  // Invalid import format rejected
  await assert.rejects(
    async () => backupEndpoint({ action: 'import', backupData: {} }, authCtx),
    (err) => err.parameters?.code === 'INVALID_FORMAT'
  );
});

test('Folder management actions create, rename, and delete custom folders', async () => {
  const authCtx = { initData: { user: { id: 1111 } } };

  // Create folder
  const createRes = await manageFeed({ action: 'create_folder', name: 'Science & Tech' }, authCtx);
  assert.equal(createRes.success, true);
  assert.equal(createRes.folder, 'Science & Tech');
  assert.ok(createRes.folders.includes('Science & Tech'));

  // Reject renaming or deleting default General folder
  await assert.rejects(
    async () => manageFeed({ action: 'rename_folder', oldName: 'General', newName: 'Base' }, authCtx),
    (err) => err.parameters?.code === 'CANNOT_RENAME_DEFAULT'
  );

  await assert.rejects(
    async () => manageFeed({ action: 'delete_folder', name: 'General' }, authCtx),
    (err) => err.parameters?.code === 'CANNOT_DELETE_DEFAULT'
  );

  // Rename folder
  const renameRes = await manageFeed({ action: 'rename_folder', oldName: 'Science & Tech', newName: 'Deep Tech' }, authCtx);
  assert.equal(renameRes.success, true);
  assert.equal(renameRes.newName, 'Deep Tech');
  assert.ok(renameRes.folders.includes('Deep Tech'));

  // Delete folder
  const deleteRes = await manageFeed({ action: 'delete_folder', name: 'Deep Tech' }, authCtx);
  assert.equal(deleteRes.success, true);
  assert.equal(deleteRes.deleted, 'Deep Tech');
  assert.ok(!deleteRes.folders.includes('Deep Tech'));
});

test('poll endpoint rejects calls from Mini App client and accepts cloud/cli execution', async () => {
  // Reject Mini App client with initData.user
  await assert.rejects(
    async () => pollEndpoint({}, { initData: { user: { id: 1234 } } }),
    (err) => err.parameters?.code === 'FORBIDDEN'
  );

  // Allow scheduled/cli calls with empty or non-client context
  const cliRes = await pollEndpoint({}, {});
  assert.equal(cliRes.ok, true);
});

test('get_feeds returns feeds with totalCount and unreadCount when subscriptions exist', async () => {
  const { db } = await import('sdk');
  const originalSelect = db.select;
  const originalAll = db.all;

  try {
    db.select = () => ({
      from: () => ({
        where: () => ({
          all: async () => [
            { id: 1, feedUrl: 'https://example.com/rss', customTitle: 'Test Feed', category: 'Tech', sendMode: 'default', paused: false },
          ],
          get: async () => ({ folders: ['Tech'] }),
        }),
        all: async () => [],
      }),
    });
    db.all = async () => [
      { feed_url: 'https://example.com/rss', total_count: 10, read_count: 2 },
    ];

    const res = await getFeeds({}, { initData: { user: { id: 777 } } });
    assert.equal(res.feeds.length, 1);
    assert.equal(res.feeds[0].totalCount, 10);
    assert.equal(res.feeds[0].unreadCount, 8);
    assert.equal(res.stats.totalFeeds, 1);
  } finally {
    db.select = originalSelect;
    db.all = originalAll;
  }
});

