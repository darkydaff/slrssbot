import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractFeedLinksFromHtml, getPlatformFeedCandidates } from '../tgcloud/lib/feed_finder.js';
import { isTelegramChannelUrl, extractChannelUsername } from '../tgcloud/lib/telegram_channel.js';

test('extractFeedLinksFromHtml extracts standard RSS and Atom links from HTML head', () => {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <link rel="alternate" type="application/rss+xml" title="RSS Feed" href="/rss.xml" />
        <link rel="alternate" type="application/atom+xml" title="Atom Feed" href="https://example.com/atom.xml" />
        <link rel="stylesheet" href="/style.css" />
      </head>
      <body><h1>My Blog</h1></body>
    </html>
  `;

  const links = extractFeedLinksFromHtml(html, 'https://example.com');
  assert.equal(links.length, 2);
  assert.equal(links[0], 'https://example.com/rss.xml');
  assert.equal(links[1], 'https://example.com/atom.xml');
});

test('getPlatformFeedCandidates detects Substack feeds', () => {
  const candidates = getPlatformFeedCandidates('https://godesulloh.substack.com/');
  assert.ok(candidates.includes('https://godesulloh.substack.com/feed'));
});

test('getPlatformFeedCandidates detects WordPress feeds from html generator', () => {
  const html = '<meta name="generator" content="WordPress 6.4" /><script src="/wp-content/themes/test.js"></script>';
  const candidates = getPlatformFeedCandidates('https://myblog.com', html);
  assert.ok(candidates.includes('https://myblog.com/feed/'));
  assert.ok(candidates.includes('https://myblog.com/?feed=rss2'));
});

test('getPlatformFeedCandidates detects Medium publications', () => {
  const candidates = getPlatformFeedCandidates('https://medium.com/@username');
  assert.ok(candidates.includes('https://medium.com/feed/@username'));
});

test('isTelegramChannelUrl and extractChannelUsername handle public channels directly', () => {
  assert.equal(isTelegramChannelUrl('https://t.me/Crimeanwind'), true);
  assert.equal(isTelegramChannelUrl('https://t.me/s/durov'), true);
  assert.equal(isTelegramChannelUrl('@telegram'), true);
  assert.equal(extractChannelUsername('https://t.me/Crimeanwind'), 'Crimeanwind');
  assert.equal(extractChannelUsername('https://t.me/s/durov'), 'durov');
  assert.equal(extractChannelUsername('@telegram'), 'telegram');
  assert.equal(extractChannelUsername('https://tg.i-c-a.su/rss/Crimeanwind'), 'Crimeanwind');
});


