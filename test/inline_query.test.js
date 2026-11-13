import { test } from 'node:test';
import assert from 'node:assert/strict';
import handleInlineQuery, {
  parseInlineQueryText,
  formatInlineArticleResult,
  isValidHttpUrl,
} from '../tgcloud/handlers/inline_query.js';
import { t, normalizeLanguageCode } from '../tgcloud/lib/i18n.js';

test('parseInlineQueryText parses empty, multi-word, and #starred queries', () => {
  assert.deepEqual(parseInlineQueryText(''), { isStarredOnly: false, terms: [] });
  assert.deepEqual(parseInlineQueryText('   '), { isStarredOnly: false, terms: [] });

  assert.deepEqual(parseInlineQueryText('linux kernel 6.12'), {
    isStarredOnly: false,
    terms: ['linux', 'kernel', '6.12'],
  });

  assert.deepEqual(parseInlineQueryText('#starred rust async'), {
    isStarredOnly: true,
    terms: ['rust', 'async'],
  });

  assert.deepEqual(parseInlineQueryText('starred:'), {
    isStarredOnly: true,
    terms: [],
  });

  // Caps at 5 terms
  const capped = parseInlineQueryText('one two three four five six seven');
  assert.equal(capped.terms.length, 5);
});

test('isValidHttpUrl validates HTTP and HTTPS URLs safely', () => {
  assert.equal(isValidHttpUrl('https://example.com/post'), true);
  assert.equal(isValidHttpUrl('http://blog.example.org/rss'), true);
  assert.equal(isValidHttpUrl('javascript:alert(1)'), false);
  assert.equal(isValidHttpUrl('/relative/path'), false);
  assert.equal(isValidHttpUrl(''), false);
  assert.equal(isValidHttpUrl(null), false);
});

test('formatInlineArticleResult produces rich Telegram InlineQueryResultArticle with Instant View', () => {
  const row = {
    id: 42,
    feed_url: 'https://example.com/feed.xml',
    feedTitle: 'Tech & Science <Daily>',
    title: 'New Quantum Chip & Benchmarks',
    link: 'https://example.com/quantum-chip',
    telegraph_url: 'https://telegra.ph/New-Quantum-Chip-01-01',
    lead_image_url: 'https://example.com/thumb.jpg',
    author: 'Alice Smith',
    summary: '<p>Researchers announced a <b>major</b> breakthrough in error correction.</p>',
    published_at: 1704067200, // 2024-01-01
  };

  const result = formatInlineArticleResult(row, 'en');

  assert.equal(result.type, 'article');
  assert.equal(result.id, '42');
  assert.equal(result.title, 'New Quantum Chip & Benchmarks');
  assert.equal(result.url, 'https://telegra.ph/New-Quantum-Chip-01-01');
  assert.equal(result.thumbnail_url, 'https://example.com/thumb.jpg');
  assert.ok(result.description.includes('Tech & Science <Daily>'));
  assert.ok(result.description.includes('2024-01-01'));
  assert.ok(result.description.includes('major breakthrough'));

  const html = result.input_message_content.message_text;
  assert.equal(result.input_message_content.parse_mode, 'HTML');
  assert.ok(html.includes('<b>New Quantum Chip &amp; Benchmarks</b>'));
  assert.ok(html.includes('Tech &amp; Science &lt;Daily&gt;'));
  assert.ok(html.includes('Alice Smith'));
  assert.ok(html.includes('https://telegra.ph/New-Quantum-Chip-01-01'));
  assert.ok(html.includes('https://example.com/quantum-chip'));

  const buttons = result.reply_markup.inline_keyboard[0];
  assert.equal(buttons.length, 2);
  assert.equal(buttons[0].url, 'https://telegra.ph/New-Quantum-Chip-01-01');
  assert.equal(buttons[1].url, 'https://example.com/quantum-chip');
});

test('formatInlineArticleResult omits invalid URLs and handles missing Telegraph URL', () => {
  const row = {
    id: 99,
    feed_url: 'https://example.com/rss',
    feedTitle: 'Example Blog',
    title: 'Untitled',
    link: 'https://example.com/post-99',
    telegraph_url: null,
    lead_image_url: 'javascript:alert(1)',
    summary: 'Short fallback summary text',
    published_at: null,
  };

  const result = formatInlineArticleResult(row, 'uk');

  assert.equal(result.title, 'Short fallback summary text');
  assert.equal(result.url, 'https://example.com/post-99');
  assert.equal(result.thumbnail_url, undefined);
  assert.equal(result.reply_markup.inline_keyboard[0].length, 1);
  assert.equal(result.reply_markup.inline_keyboard[0][0].text, t('uk', 'btn_read_original'));
});

test('inline_add_subs_btn is localized and Russian normalizes to Ukrainian', () => {
  const ukLang = normalizeLanguageCode('ru');
  assert.equal(ukLang, 'uk');
  assert.ok(t(ukLang, 'inline_add_subs_btn').includes('RSS'));
  assert.ok(t('en', 'inline_add_subs_btn').includes('RSS'));
});

test('handleInlineQuery safely handles empty/malformed updates and empty subscriptions', async () => {
  // Missing ID / from -> returns cleanly without throwing
  await handleInlineQuery(null, {});
  await handleInlineQuery({}, {});

  // Valid shape against sdk_mock DB (0 subscriptions)
  await handleInlineQuery({
    id: 'query_123',
    from: { id: 999999, language_code: 'en' },
    query: 'linux',
    offset: '',
  }, {});
});

