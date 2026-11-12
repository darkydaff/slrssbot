import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldPollFeed, pruneOldEntries } from '../tgcloud/lib/poller.js';

test('shouldPollFeed allows polling healthy feeds or feeds with fewer than 3 errors', () => {
  const now = Date.now();

  // Fresh feed, never checked
  assert.equal(shouldPollFeed(null, now), true);
  assert.equal(shouldPollFeed({}, now), true);

  // Healthy feed checked 1 minute ago
  const healthyRecent = {
    errorCount: 0,
    lastCheckedAt: new Date(now - 60 * 1000),
  };
  assert.equal(shouldPollFeed(healthyRecent, now), true);

  // Feed with 1 or 2 occasional errors
  const minorError = {
    errorCount: 2,
    lastCheckedAt: new Date(now - 120 * 1000),
  };
  assert.equal(shouldPollFeed(minorError, now), true);
});

test('shouldPollFeed backs off feeds with 3 to 5 errors to 30 minutes', () => {
  const now = Date.now();

  // Checked 10 minutes ago (< 30m) -> should NOT poll yet
  const recentlyFailed = {
    errorCount: 3,
    lastCheckedAt: new Date(now - 10 * 60 * 1000),
  };
  assert.equal(shouldPollFeed(recentlyFailed, now), false);

  // Checked 35 minutes ago (> 30m) -> SHOULD poll now
  const dueFailed = {
    errorCount: 4,
    lastCheckedAt: new Date(now - 35 * 60 * 1000),
  };
  assert.equal(shouldPollFeed(dueFailed, now), true);
});

test('shouldPollFeed backs off feeds with 6 to 11 errors to 2 hours', () => {
  const now = Date.now();

  // Checked 45 minutes ago (< 2h) -> should NOT poll yet
  const failed6 = {
    errorCount: 6,
    lastCheckedAt: new Date(now - 45 * 60 * 1000),
  };
  assert.equal(shouldPollFeed(failed6, now), false);

  // Checked 2.5 hours ago (> 2h) -> SHOULD poll now
  const due6 = {
    errorCount: 8,
    lastCheckedAt: new Date(now - 150 * 60 * 1000),
  };
  assert.equal(shouldPollFeed(due6, now), true);
});

test('shouldPollFeed backs off severe failing feeds (>=12 errors) to 6 hours', () => {
  const now = Date.now();

  // Checked 4 hours ago (< 6h) -> should NOT poll
  const severe = {
    errorCount: 15,
    lastCheckedAt: new Date(now - 4 * 3600 * 1000),
  };
  assert.equal(shouldPollFeed(severe, now), false);

  // Checked 7 hours ago (> 6h) -> SHOULD poll
  const dueSevere = {
    errorCount: 20,
    lastCheckedAt: new Date(now - 7 * 3600 * 1000),
  };
  assert.equal(shouldPollFeed(dueSevere, now), true);
});

test('pruneOldEntries runs cleanly and reports pruned count', async () => {
  const outcome = await pruneOldEntries({ retentionDays: 45, keepMinPerFeed: 15 });
  assert.equal(typeof outcome.prunedCount, 'number');
  assert.equal(outcome.error, null);
});

