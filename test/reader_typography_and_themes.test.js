import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  cleanArticleContent,
  calculateReadingTimeMinutes,
  formatReadingTime,
  extractPlainTextForSpeech,
} from '../src/lib/reader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('cleanArticleContent removes conflicting inline styles while preserving layout styles', () => {
  const dirtyHtml = `
    <div style="background-color: #ffffff; color: #111111; font-size: 14px; font-family: Roboto, sans-serif; text-align: center; width: 100%">
      <p style="color: black; line-height: 1.8; margin-bottom: 16px">Paragraph text</p>
      <span style="background: rgb(255, 255, 255); color: rgb(0, 0, 0)">Highlighted text</span>
      <font color="#ff0000" size="4">Legacy font tag</font>
    </div>
  `;

  const cleaned = cleanArticleContent(dirtyHtml);

  // Conflicting styles must be stripped
  assert.ok(!cleaned.includes('color: #111111'));
  assert.ok(!cleaned.includes('background-color: #ffffff'));
  assert.ok(!cleaned.includes('font-size: 14px'));
  assert.ok(!cleaned.includes('font-family: Roboto'));
  assert.ok(!cleaned.includes('color: black'));
  assert.ok(!cleaned.includes('line-height: 1.8'));
  assert.ok(!cleaned.includes('background: rgb(255, 255, 255)'));
  assert.ok(!cleaned.includes('<font'));
  assert.ok(!cleaned.includes('</font>'));

  // Harmless styles must be preserved
  assert.ok(cleaned.includes('text-align: center'));
  assert.ok(cleaned.includes('width: 100%'));
  assert.ok(cleaned.includes('margin-bottom: 16px'));
  assert.ok(cleaned.includes('<span>Legacy font tag</span>'));
});

test('calculateReadingTimeMinutes and formatReadingTime estimate reading time correctly', () => {
  // Short article: < 200 words -> 1 min
  const shortText = 'This is a brief announcement about our new serverless bot release.';
  assert.equal(calculateReadingTimeMinutes(shortText), 1);
  assert.equal(formatReadingTime(1, 'en'), '1 min read');
  assert.equal(formatReadingTime(1, 'uk'), '1 хв читання');
  assert.equal(formatReadingTime(1, 'zh-Hans'), '1 分钟阅读');

  // ~600 words -> ~3 min
  const mediumWords = Array(600).fill('technology').join(' ');
  assert.equal(calculateReadingTimeMinutes(mediumWords), 3);
  assert.equal(formatReadingTime(3, 'en'), '3 min read');
  assert.equal(formatReadingTime(3, 'uk'), '3 хв читання');
  assert.equal(formatReadingTime(3, 'es'), '3 min de lectura');

  // CJK characters (~400 CPM)
  const cjkText = '这是一篇关于无服务器架构与现代RSS阅读器设计的深度长文。'.repeat(30); // ~810 chars -> ~2 min
  assert.equal(calculateReadingTimeMinutes(cjkText), 2);
  assert.equal(formatReadingTime(2, 'zh-Hans'), '2 分钟阅读');
  assert.equal(formatReadingTime(2, 'ja'), '2 分で読める');
});

test('extractPlainTextForSpeech removes HTML tags and formats speech synthesis text cleanly', () => {
  const html = `
    <div>
      <h1>Breaking News</h1>
      <p>Scientists have made an <b>extraordinary</b> discovery.</p>
      <figure><img src="test.jpg"/><figcaption>Figure caption</figcaption></figure>
      <pre><code>const a = 1;</code></pre>
      <p>More details &amp; analysis at &lt;https://example.com&gt;.</p>
    </div>
  `;

  const speechText = extractPlainTextForSpeech(html);
  assert.ok(speechText.includes('Breaking News.'));
  assert.ok(speechText.includes('Scientists have made an extraordinary discovery.'));
  assert.ok(speechText.includes('More details & analysis at <https://example.com>.'));
  assert.ok(!speechText.includes('<code>'));
  assert.ok(!speechText.includes('const a = 1;'));
  assert.ok(!speechText.includes('<figure>'));
});

test('index.css contains full reader theme specifications and dynamic font-size overrides', () => {
  const cssPath = path.resolve(__dirname, '../src/index.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  // Sepia theme tokens
  assert.ok(css.includes('.reader-theme-sepia'), 'Defines .reader-theme-sepia');
  assert.ok(css.includes('--reader-bg: #fbf0d9'), 'Sepia has #fbf0d9 background');
  assert.ok(css.includes('--reader-text: #433022'), 'Sepia has #433022 high contrast text');

  // OLED theme tokens
  assert.ok(css.includes('.reader-theme-oled'), 'Defines .reader-theme-oled');
  assert.ok(css.includes('--reader-bg: #000000'), 'OLED has #000000 true black background');
  assert.ok(css.includes('--reader-text: #e5e5e5'), 'OLED has #e5e5e5 crisp light text');

  // Dark and Light themes
  assert.ok(css.includes('.reader-theme-dark'), 'Defines .reader-theme-dark');
  assert.ok(css.includes('--reader-bg: #18181b'), 'Dark has #18181b soft charcoal background');
  assert.ok(css.includes('.reader-theme-light'), 'Defines .reader-theme-light');
  assert.ok(css.includes('--reader-bg: #ffffff'), 'Light has #ffffff crisp paper background');

  // Dynamic typography sizing
  assert.ok(css.includes('--reader-font-size'), 'Uses --reader-font-size CSS variable');
  assert.ok(css.includes('--reader-line-height'), 'Uses --reader-line-height CSS variable');
  assert.ok(css.includes('--reader-font-family'), 'Uses --reader-font-family CSS variable');

  // Heading and text enforcement
  assert.ok(css.includes('.article-prose :is(p, span, div, li, ul, ol, figcaption, table, td, th)'));
  assert.ok(css.includes('.article-prose :is(h1, h2, h3, h4, h5, h6)'));
});
