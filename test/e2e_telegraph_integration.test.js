import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatPost, formatChannelPost } from '../tgcloud/lib/formatter.js';
import { isTeaserContent, extractArticleFromHtml } from '../tgcloud/lib/article_extractor.js';
import { htmlToTelegraphNodes } from '../tgcloud/lib/telegraph.js';

test('End-to-End Teaser to Telegraph Workflow (9to5Google scenario)', () => {
  // 1. Ingestion: RSS feed item only contains a short teaser summary ending in more-link
  const feedItem = {
    guid: 'https://9to5google.com/2026/11/04/pixel-deals-sample',
    title: 'Mid-week Android deals: Pixel discounts, games, and more',
    link: 'https://9to5google.com/2026/11/04/pixel-deals-sample',
    author: '9to5Google',
    content: '<div class="feat-image"><img src="https://9to5google.com/img.jpg" /></div><p>Today best deals on Google hardware...</p><a href="https://9to5google.com/2026/11/04/pixel-deals-sample" class="more-link">more…</a>',
  };

  // 2. Detection: System identifies it as teaser content requiring extraction
  assert.equal(isTeaserContent(feedItem.content), true);

  // 3. Web Extraction: Fetches destination webpage and extracts full article container
  const mockWebpageHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Mid-week Android deals: Pixel discounts, games, and more - 9to5Google</title>
        <meta property="og:title" content="Mid-week Android deals: Pixel discounts, games, and more">
        <meta property="og:image" content="https://9to5google.com/img.jpg">
        <meta name="author" content="Justin Kahn">
      </head>
      <body>
        <div class="container med post-content">
          <figure><img src="https://9to5google.com/img.jpg" alt="Deals collage"/></figure>
          <p>Today's best Google Play app and game deals are ready, including top games and hardware.</p>
          <h3>Hardware Discounts</h3>
          <p>We still have the best deal ever on the 2026 Pixel 11 Pro with $100 off all models.</p>
          <ul>
            <li>Pixel 11 Pro - $350 off</li>
            <li>Pixel Watch 5 - $100 off</li>
          </ul>
          <p>Read all deals listed above and enjoy the savings.</p>
        </div>
      </body>
    </html>
  `;

  const extracted = extractArticleFromHtml(mockWebpageHtml, feedItem.link);
  assert.ok(extracted);
  assert.equal(extracted.title, 'Mid-week Android deals: Pixel discounts, games, and more');
  assert.equal(extracted.author, 'Justin Kahn');
  assert.ok(extracted.contentHtml.includes('Hardware Discounts'));
  assert.ok(extracted.contentHtml.includes('Pixel Watch 5 - $100 off'));

  // 4. Telegraph AST Generation: Converts full extracted HTML into Telegraph DOM nodes
  const telegraphNodes = htmlToTelegraphNodes(extracted.contentHtml);
  assert.ok(telegraphNodes.length >= 4);

  const h3Node = telegraphNodes.find((n) => n.tag === 'h3');
  assert.ok(h3Node);
  assert.ok(JSON.stringify(h3Node).includes('Hardware Discounts'));

  const ulNode = telegraphNodes.find((n) => n.tag === 'ul');
  assert.ok(ulNode);
  assert.equal(ulNode.children.length, 2);

  // 5. Message Delivery: Formats message with dual Instant View and Origin website buttons
  const mockTelegraphUrl = 'https://telegra.ph/Mid-week-Android-deals-11-04';
  const formatted = formatPost(feedItem, '9to5Google', {
    telegraphUrl: mockTelegraphUrl,
  });

  assert.ok(formatted.text.includes('⚡ <a href="https://telegra.ph/Mid-week-Android-deals-11-04">Instant View</a>'));
  assert.ok(formatted.text.includes('🔗 <a href="https://9to5google.com/2026/11/04/pixel-deals-sample">Read Original</a>'));

  // Check inline keyboard buttons
  const buttons = formatted.replyMarkup?.inline_keyboard;
  assert.ok(Array.isArray(buttons));
  assert.equal(buttons[0][0].text, '⚡ Instant View');
  assert.equal(buttons[0][0].url, mockTelegraphUrl);
  assert.equal(buttons[0][1].text, '🌐 Read Original');
  assert.equal(buttons[0][1].url, feedItem.link);
});

test('End-to-End Long Telegram Channel Post to Telegraph Workflow', () => {
  // 1. Ingestion: Long post in public Telegram channel
  const longChannelPost = {
    id: 4242,
    channel: 'geopolitics_daily',
    url: 'https://t.me/geopolitics_daily/4242',
    textHtml: '<b>Weekly Global Analysis</b>\n\n' + 'Comprehensive report on global trade logistics and energy markets. '.repeat(15),
    plainText: 'Weekly Global Analysis\n\n' + 'Comprehensive report on global trade logistics and energy markets. '.repeat(15),
    photos: ['https://cdn.example.com/map1.jpg', 'https://cdn.example.com/map2.jpg'],
    photoUrl: 'https://cdn.example.com/map1.jpg',
    hasVideo: false,
    forwardedFrom: null,
  };

  // 2. Length check: Post exceeds threshold
  assert.ok(longChannelPost.plainText.length > 700);

  // 3. Telegraph AST generation: Converts post text and album photos into Telegraph nodes
  let postHtml = '';
  for (const p of longChannelPost.photos) {
    postHtml += `<figure><img src="${p}"/></figure>`;
  }
  postHtml += longChannelPost.textHtml;
  postHtml += `<p><hr><a href="${longChannelPost.url}">Original post on Telegram</a></p>`;

  const nodes = htmlToTelegraphNodes(postHtml);
  assert.ok(nodes.length >= 3);
  const figures = nodes.filter((n) => n.tag === 'figure');
  assert.equal(figures.length, 2);

  // 4. Message formatting: Produces dual Instant View and Channel link buttons
  const mockTelegraphUrl = 'https://telegra.ph/Weekly-Global-Analysis-4242';
  const formatted = formatChannelPost(longChannelPost, 'Geopolitics Daily', {
    telegraphUrl: mockTelegraphUrl,
  });

  assert.ok(formatted.text.includes('⚡ <a href="https://telegra.ph/Weekly-Global-Analysis-4242">Instant View</a>'));
  assert.ok(formatted.text.includes('🔗 <a href="https://t.me/geopolitics_daily/4242">View in Telegram</a>'));

  const buttons = formatted.replyMarkup?.inline_keyboard;
  assert.ok(Array.isArray(buttons));
  assert.equal(buttons[0][0].text, '⚡ Instant View');
  assert.equal(buttons[0][0].url, mockTelegraphUrl);
  assert.equal(buttons[0][1].text, '📢 Channel Post');
  assert.equal(buttons[0][1].url, longChannelPost.url);
});

