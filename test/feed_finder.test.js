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

test('getPlatformFeedCandidates detects Reddit subreddits and users', () => {
  const subCandidates = getPlatformFeedCandidates('https://www.reddit.com/r/technology');
  assert.ok(subCandidates.includes('https://www.reddit.com/r/technology/.rss'));

  const userCandidates = getPlatformFeedCandidates('https://reddit.com/user/spez');
  assert.ok(userCandidates.includes('https://reddit.com/user/spez/.rss'));
});

test('getPlatformFeedCandidates detects YouTube channels, playlists and handles', () => {
  const channelCandidates = getPlatformFeedCandidates('https://www.youtube.com/channel/UC1234567890abcdef');
  assert.ok(channelCandidates.includes('https://www.youtube.com/feeds/videos.xml?channel_id=UC1234567890abcdef'));

  const playlistCandidates = getPlatformFeedCandidates('https://www.youtube.com/playlist?list=PL1234567890');
  assert.ok(playlistCandidates.includes('https://www.youtube.com/feeds/videos.xml?playlist_id=PL1234567890'));

  const htmlWithId = '<meta itemprop="channelId" content="UC9999999999999999999999" />';
  const handleCandidates = getPlatformFeedCandidates('https://www.youtube.com/@mkbhd', htmlWithId);
  assert.ok(handleCandidates.includes('https://www.youtube.com/feeds/videos.xml?channel_id=UC9999999999999999999999'));
});

test('getPlatformFeedCandidates detects GitHub repositories, releases and commits', () => {
  const repoCandidates = getPlatformFeedCandidates('https://github.com/torvalds/linux');
  assert.ok(repoCandidates.includes('https://github.com/torvalds/linux/releases.atom'));
  assert.ok(repoCandidates.includes('https://github.com/torvalds/linux/commits.atom'));

  const tagCandidates = getPlatformFeedCandidates('https://github.com/torvalds/linux/tags');
  assert.ok(tagCandidates.includes('https://github.com/torvalds/linux/tags.atom'));
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


