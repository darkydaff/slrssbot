import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isTeaserContent,
  extractArticleFromHtml,
} from '../tgcloud/lib/article_extractor.js';

test('isTeaserContent detects short summaries and read-more links', () => {
  // Teaser with more-link (like 9to5Google)
  const teaser1 = '<p>A short paragraph about discounts.</p><a href="https://example.com" class="more-link">more…</a>';
  assert.equal(isTeaserContent(teaser1), true);

  // Short snippet
  const teaser2 = '<p>Just a brief note.</p>';
  assert.equal(isTeaserContent(teaser2), true);

  // WordPress Ukrainian teaser with link-more and Читати далі
  const teaser3 = '<p>' + 'Детальний опис книги та рецензія на конкурс оповідань. '.repeat(15) + '</p><div class="link-more"><a href="https://refchyt.wordpress.com/post">Читати далі</a></div>';
  assert.equal(isTeaserContent(teaser3), true);

  // Full article (>1500 chars without teaser link)
  const fullArticle = '<p>' + 'Detailed analysis and comprehensive coverage. '.repeat(40) + '</p>';
  assert.equal(isTeaserContent(fullArticle), false);
});

test('extractArticleFromHtml extracts title, author, lead image, and clean post content', () => {
  const samplePageHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Google Announces Pixel 10 Pro With Tensor G5 - 9to5Google</title>
        <meta property="og:title" content="Google Announces Pixel 10 Pro With Tensor G5">
        <meta property="og:image" content="https://9to5google.com/uploads/pixel10.jpg">
        <meta name="author" content="Abner Li">
      </head>
      <body>
        <header><nav><a href="/">Home</a></nav></header>
        <aside class="sidebar">Sidebar ads and links</aside>
        
        <div class="container med post-content">
          <figure class="featured-image">
            <img src="/uploads/pixel10.jpg" alt="Pixel 10 Pro"/>
          </figure>
          <p>Today Google officially announced the Pixel 10 Pro at its annual fall event.</p>
          <h3>New Tensor G5 Architecture</h3>
          <p>The device features an all-new custom chipset fabricated on TSMC's 3nm node.</p>
          <div class="ad-container">Buy stuff now!</div>
          <p>Battery life is rated at up to 36 hours of continuous usage.</p>
        </div>

        <footer>Copyright 2026</footer>
      </body>
    </html>
  `;

  const extracted = extractArticleFromHtml(samplePageHtml, 'https://9to5google.com/2026/10/pixel-10-pro/');

  assert.ok(extracted);
  assert.equal(extracted.title, 'Google Announces Pixel 10 Pro With Tensor G5');
  assert.equal(extracted.author, 'Abner Li');
  assert.equal(extracted.leadImage, 'https://9to5google.com/uploads/pixel10.jpg');

  // Verify content was extracted and cleaned
  assert.ok(extracted.contentHtml.includes('Today Google officially announced'));
  assert.ok(extracted.contentHtml.includes('New Tensor G5 Architecture'));
  assert.ok(extracted.contentHtml.includes('Battery life is rated at up to 36 hours'));

  // Relative URLs should be resolved to absolute URLs
  assert.ok(extracted.contentHtml.includes('src="https://9to5google.com/uploads/pixel10.jpg"'));

  // Ads, headers, nav, footers must NOT be in the extracted content
  assert.ok(!extracted.contentHtml.includes('Sidebar ads'));
  assert.ok(!extracted.contentHtml.includes('Buy stuff now!'));
  assert.ok(!extracted.contentHtml.includes('Copyright 2026'));
});

test('extractArticleFromHtml extracts full article with nested divs in entry container', () => {
  const wpPageHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>WordPress Blog Post with Nested Divs</title>
      </head>
      <body>
        <div class="entry">
          <p>This is the first section of the article before a nested widget.</p>
          <div class="social-widget">
            <span>Share this post!</span>
          </div>
          <p>This is the second section of the article which must NOT be truncated.</p>
          <div class="callout">
            <p>A nested callout quote inside the text.</p>
          </div>
          <p>And this is the final conclusion of the article.</p>
        </div>
      </body>
    </html>
  `;

  const extracted = extractArticleFromHtml(wpPageHtml, 'https://example-blog.wordpress.com/post/1');
  assert.ok(extracted);
  assert.ok(extracted.contentHtml.includes('This is the first section'));
  assert.ok(extracted.contentHtml.includes('This is the second section of the article which must NOT be truncated'));
  assert.ok(extracted.contentHtml.includes('And this is the final conclusion'));
});

test('isTeaserContent does not treat long substantive articles as teasers', () => {
  // Even if a 40KB article has an internal link with "read more" or "more-123", it's > 1800 chars so it's not a teaser
  const longArticle = '<p>' + 'In 1957, Beverly Garland starred in Decoy. '.repeat(100) + '</p>' +
    '<a href="#more-123">more…</a>' +
    '<p>' + 'She continued to star in multiple television series. '.repeat(50) + '</p>';
  
  assert.equal(longArticle.length > 1800, true);
  assert.equal(isTeaserContent(longArticle), false);
});

test('isTeaserContent detects WordPress feed excerpts with first appeared on as teasers', () => {
  const wpFeedSnippet = '<p>For World Jellyfish Day, I am combining my love of marine life with my otaku side! From Tentacool and Clara to Jellymon and JELEE-chan, here are five jellyfish-inspired anime picks, two Western animation favourites and some fascinating jellyfish facts. I have even included a few of my own aquarium recordings!</p>\n' +
    '<p><p>The post <a rel="nofollow" href="https://allanimemags.com/anime-jellyfish-characters/">5 Anime Jellyfish Characters to Celebrate World Jellyfish Day</a> first appeared on <a rel="nofollow" href="https://allanimemags.com">All About Anime and Manga</a>.</p></p>';

  assert.equal(isTeaserContent(wpFeedSnippet), true);
});



