import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFeed, decodeXml } from '../tgcloud/lib/rss.js';
import { sanitizeToTelegramHtml, escapeHtml, truncate, matchesFilter, formatPost } from '../tgcloud/lib/formatter.js';
import { parseOpml, generateOpml } from '../tgcloud/lib/opml.js';

test('decodeXml handles CDATA and XML entities', () => {
  const input = '<![CDATA[Hello & Welcome]]> &amp; &lt;World&gt;';
  const res = decodeXml(input);
  assert.equal(res, 'Hello & Welcome & <World>');
});

test('parseFeed parses standard RSS 2.0 correctly', () => {
  const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Tech News</title>
    <link>https://example.com</link>
    <description>Daily tech news</description>
    <item>
      <title>Big Announcement</title>
      <link>https://example.com/post/1</link>
      <guid>https://example.com/post/1</guid>
      <description><![CDATA[Summary of the announcement]]></description>
      <content:encoded><![CDATA[<p>Full body with <b>bold text</b> and <a href="https://example.com">links</a>.</p>]]></content:encoded>
      <pubDate>Mon, 02 Nov 2026 12:00:00 GMT</pubDate>
      <enclosure url="https://example.com/image.jpg" type="image/jpeg"/>
    </item>
  </channel>
</rss>`;

  const feed = parseFeed(rssXml);
  assert.equal(feed.title, 'Tech News');
  assert.equal(feed.items.length, 1);
  const item = feed.items[0];
  assert.equal(item.title, 'Big Announcement');
  assert.equal(item.link, 'https://example.com/post/1');
  assert.equal(item.guid, 'https://example.com/post/1');
  assert.ok(item.content.includes('Full body'));
  assert.equal(item.media.length, 1);
  assert.equal(item.media[0].url, 'https://example.com/image.jpg');
});

test('parseFeed parses Atom 1.0 correctly', () => {
  const atomXml = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Feed Example</title>
  <link href="https://example.org/feed" rel="self"/>
  <link href="https://example.org/"/>
  <entry>
    <title>Atom Entry 1</title>
    <link href="https://example.org/entry/1"/>
    <id>urn:uuid:1225c695-cfb8-4ebb-aaaa-80da344efa6a</id>
    <updated>2026-11-02T12:00:00Z</updated>
    <summary>Short atom summary</summary>
  </entry>
</feed>`;

  const feed = parseFeed(atomXml);
  assert.equal(feed.title, 'Atom Feed Example');
  assert.equal(feed.items.length, 1);
  const item = feed.items[0];
  assert.equal(item.title, 'Atom Entry 1');
  assert.equal(item.link, 'https://example.org/entry/1');
  assert.equal(item.guid, 'urn:uuid:1225c695-cfb8-4ebb-aaaa-80da344efa6a');
  assert.equal(item.content, 'Short atom summary');
});

test('sanitizeToTelegramHtml cleans unsupported tags and keeps allowed tags', () => {
  const raw = `
    <div>
      <p>Hello <strong>World</strong>!</p>
      <script>alert(1)</script>
      <iframe src="https://evil.com"></iframe>
      <ul>
        <li>First item</li>
        <li>Second item</li>
      </ul>
      <a href="https://telegram.org" target="_blank" class="btn">Telegram Link</a>
    </div>
  `;

  const cleaned = sanitizeToTelegramHtml(raw);
  assert.ok(!cleaned.includes('<script>'));
  assert.ok(!cleaned.includes('<iframe'));
  assert.ok(!cleaned.includes('<div>'));
  assert.ok(!cleaned.includes('<p>'));
  assert.ok(cleaned.includes('<b>World</b>'));
  assert.ok(cleaned.includes('• First item'));
  assert.ok(cleaned.includes('<a href="https://telegram.org">Telegram Link</a>'));
});

test('matchesFilter supports include and exclude keywords', () => {
  const item = { title: 'New release of Python 3.14', content: 'Exciting features' };
  
  assert.equal(matchesFilter(item, 'python, release', null), true);
  assert.equal(matchesFilter(item, 'javascript', null), false);
  assert.equal(matchesFilter(item, null, 'spam, crypto'), true);
  assert.equal(matchesFilter(item, null, 'python'), false);
});

test('OPML parse and generation works roundtrip', () => {
  const opmlXml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>Test OPML</title></head>
  <body>
    <outline type="rss" text="Hacker News" title="Hacker News" xmlUrl="https://news.ycombinator.com/rss"/>
    <outline type="rss" text="Lobsters" title="Lobsters" xmlUrl="https://lobste.rs/rss"/>
  </body>
</opml>`;

  const parsed = parseOpml(opmlXml);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].title, 'Hacker News');
  assert.equal(parsed[0].xmlUrl, 'https://news.ycombinator.com/rss');

  const generated = generateOpml(parsed.map((p) => ({ customTitle: p.title, feedUrl: p.xmlUrl })));
  assert.ok(generated.includes('xmlUrl="https://news.ycombinator.com/rss"'));
  assert.ok(generated.includes('xmlUrl="https://lobste.rs/rss"'));
});

test('parseFeed and formatPost extract podcast audio enclosures and YouTube links', () => {
  const podcastXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Tech Talks Podcast</title>
    <link>https://podcast.example.com</link>
    <item>
      <title>Episode 42: Building Serverless Bots</title>
      <link>https://podcast.example.com/ep42</link>
      <enclosure url="https://podcast.example.com/audio/ep42.mp3" type="audio/mpeg" length="45000000"/>
      <description>Deep dive into serverless architectures</description>
    </item>
  </channel>
</rss>`;

  const feed = parseFeed(podcastXml);
  assert.equal(feed.items.length, 1);
  const ep = feed.items[0];
  assert.ok(ep.audio);
  assert.equal(ep.audio.url, 'https://podcast.example.com/audio/ep42.mp3');

  const formatted = formatPost(ep, 'Tech Talks Podcast');
  assert.equal(formatted.audioUrl, 'https://podcast.example.com/audio/ep42.mp3');
  assert.ok(formatted.text.includes('Listen to Podcast Episode (Audio)'));
  assert.ok(formatted.replyMarkup?.inline_keyboard?.[0]?.[0]?.text?.includes('Listen to Podcast'));

  // Test YouTube formatting
  const ytItem = {
    title: 'New Keynote 2026',
    link: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    content: 'Full keynote presentation',
    media: [],
  };
  const fmtYt = formatPost(ytItem, 'YouTube Channel');
  assert.ok(fmtYt.text.includes('Watch Video on YouTube'));
  assert.ok(fmtYt.replyMarkup?.inline_keyboard?.[0]?.[0]?.text?.includes('Watch on YouTube'));
});

