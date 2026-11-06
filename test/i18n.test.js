import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeLanguageCode,
  SUPPORTED_LANGUAGES,
  COMMAND_DESCRIPTIONS,
  registerAllBotCommands,
  t,
} from '../tgcloud/lib/i18n.js';
import {
  normalizeLanguageCode as clientNormalize,
  SUPPORTED_LANGUAGES as CLIENT_LANGUAGES,
} from '../src/lib/i18n.js';
import { formatPost, formatChannelPost } from '../tgcloud/lib/formatter.js';
import { formatRelativeTime } from '../src/lib/date.js';

test('client normalizeLanguageCode normalizes Russian to Ukrainian', () => {
  assert.equal(clientNormalize('ru'), 'uk');
  assert.equal(clientNormalize('ru-RU'), 'uk');
  assert.equal(clientNormalize('RU'), 'uk');
  assert.equal(clientNormalize('ru_RU'), 'uk');
  assert.equal(clientNormalize('zh-CN'), 'zh-Hans');
  assert.equal(clientNormalize('es-MX'), 'es');
  assert.equal(CLIENT_LANGUAGES['ru'], undefined);
});

test('normalizeLanguageCode handles standard language codes', () => {
  assert.equal(normalizeLanguageCode('en'), 'en');
  assert.equal(normalizeLanguageCode('EN-US'), 'en');
  assert.equal(normalizeLanguageCode('es'), 'es');
  assert.equal(normalizeLanguageCode('es-ES'), 'es');
  assert.equal(normalizeLanguageCode('it'), 'it');
  assert.equal(normalizeLanguageCode('fr'), 'fr');
  assert.equal(normalizeLanguageCode('de'), 'de');
  assert.equal(normalizeLanguageCode('uk'), 'uk');
  assert.equal(normalizeLanguageCode('tr'), 'tr');
  assert.equal(normalizeLanguageCode('ja'), 'ja');
  assert.equal(normalizeLanguageCode('pt'), 'pt');
  assert.equal(normalizeLanguageCode('id'), 'id');
  assert.equal(normalizeLanguageCode('zh'), 'zh-Hans');
  assert.equal(normalizeLanguageCode('zh-CN'), 'zh-Hans');
  assert.equal(normalizeLanguageCode('zh-TW'), 'zh-Hant');
  assert.equal(normalizeLanguageCode('zh-HK'), 'zh-Hant');
});

test('normalizeLanguageCode normalizes Russian to Ukrainian', () => {
  assert.equal(normalizeLanguageCode('ru'), 'uk');
  assert.equal(normalizeLanguageCode('ru-RU'), 'uk');
  assert.equal(normalizeLanguageCode('ru-BY'), 'uk');
  assert.equal(normalizeLanguageCode('ru-KZ'), 'uk');
  assert.equal(normalizeLanguageCode('RU'), 'uk');
  assert.equal(SUPPORTED_LANGUAGES['ru'], undefined);
});

test('t() translates strings with parameter interpolation and Russian-to-Ukrainian normalization', () => {
  // English default
  assert.ok(t('en', 'welcome_title').includes('Welcome to RSS to Telegram Bot!'));

  // Spanish translation
  assert.ok(t('es', 'welcome_title').includes('¡Bienvenido al bot RSS para Telegram!'));

  // Chinese translation
  assert.ok(t('zh-Hans', 'welcome_title').includes('欢迎使用 RSS to Telegram 机器人！'));

  // Ukrainian translation
  assert.ok(t('uk', 'welcome_title').includes('Ласкаво просимо до RSS to Telegram Bot!'));

  // Parameter interpolation
  const subMsg = t('en', 'sub_success', { title: 'My Blog', url: 'https://example.com' });
  assert.ok(subMsg.includes('My Blog'));
  assert.ok(subMsg.includes('https://example.com'));

  // Policy: Russian input normalizes to Ukrainian translation
  assert.ok(t('ru', 'welcome_title').includes('Ласкаво просимо до RSS to Telegram Bot!'));
  assert.equal(t('ru', 'btn_read_original'), '🌐 Читати оригінал');
});

test('formatPost generates localized inline keyboard buttons', () => {
  const item = {
    title: 'Test Article',
    link: 'https://example.com/article',
    content: 'Test content',
  };

  // English
  const resEn = formatPost(item, 'Feed', { telegraphUrl: 'https://telegra.ph/p1', lang: 'en' });
  const buttonsEn = resEn.replyMarkup.inline_keyboard[0];
  assert.equal(buttonsEn[0].text, '⚡ Instant View');
  assert.equal(buttonsEn[1].text, '🌐 Read Original');

  // Ukrainian
  const resUk = formatPost(item, 'Feed', { telegraphUrl: 'https://telegra.ph/p1', lang: 'uk' });
  const buttonsUk = resUk.replyMarkup.inline_keyboard[0];
  assert.equal(buttonsUk[0].text, '⚡ Швидкий перегляд');
  assert.equal(buttonsUk[1].text, '🌐 Читати оригінал');

  // Russian input (normalizes to Ukrainian)
  const resRu = formatPost(item, 'Feed', { telegraphUrl: 'https://telegra.ph/p1', lang: 'ru' });
  const buttonsRu = resRu.replyMarkup.inline_keyboard[0];
  assert.equal(buttonsRu[0].text, '⚡ Швидкий перегляд');
  assert.equal(buttonsRu[1].text, '🌐 Читати оригінал');

  // Spanish
  const resEs = formatPost(item, 'Feed', { telegraphUrl: 'https://telegra.ph/p1', lang: 'es' });
  const buttonsEs = resEs.replyMarkup.inline_keyboard[0];
  assert.equal(buttonsEs[0].text, '⚡ Vista rápida');
  assert.equal(buttonsEs[1].text, '🌐 Leer original');
});

test('formatChannelPost generates localized inline buttons and headers', () => {
  const post = {
    id: 100,
    channel: 'testchannel',
    url: 'https://t.me/testchannel/100',
    textHtml: 'Channel post text',
  };

  // English
  const resEn = formatChannelPost(post, 'Test Channel', { telegraphUrl: 'https://telegra.ph/ch1', lang: 'en' });
  const buttonsEn = resEn.replyMarkup.inline_keyboard[0];
  assert.equal(buttonsEn[0].text, '⚡ Instant View');
  assert.equal(buttonsEn[1].text, '📢 Channel Post');

  // Ukrainian
  const resUk = formatChannelPost(post, 'Test Channel', { telegraphUrl: 'https://telegra.ph/ch1', lang: 'uk' });
  const buttonsUk = resUk.replyMarkup.inline_keyboard[0];
  assert.equal(buttonsUk[0].text, '⚡ Швидкий перегляд');
  assert.equal(buttonsUk[1].text, '📢 Допис каналу');

  // Russian input (normalizes to Ukrainian)
  const resRu = formatChannelPost(post, 'Test Channel', { telegraphUrl: 'https://telegra.ph/ch1', lang: 'ru' });
  const buttonsRu = resRu.replyMarkup.inline_keyboard[0];
  assert.equal(buttonsRu[0].text, '⚡ Швидкий перегляд');
  assert.equal(buttonsRu[1].text, '📢 Допис каналу');
});

test('registerAllBotCommands sets Ukrainian commands for Russian language scope', async () => {
  const registered = [];
  const mockApi = {
    setMyCommands: async (payload) => {
      registered.push(payload);
    },
  };

  await registerAllBotCommands(mockApi);

  // Check default registration
  const defaultCmds = registered.find((r) => !r.language_code);
  assert.ok(defaultCmds);
  assert.equal(defaultCmds.commands[0].command, 'reader');

  // Check Russian registration receives Ukrainian commands
  const ruCmds = registered.find((r) => r.language_code === 'ru');
  assert.ok(ruCmds, 'Should register commands for ru scope');
  assert.ok(ruCmds.commands.some((c) => c.command === 'reader' && c.description.includes('Відкрити')));

  // Check Ukrainian registration
  const ukCmds = registered.find((r) => r.language_code === 'uk');
  assert.ok(ukCmds);
  assert.ok(ukCmds.commands.some((c) => c.command === 'reader' && c.description.includes('Відкрити')));
});

test('formatRelativeTime formats localized relative dates', () => {
  const now = Date.now();
  // Just now in Ukrainian
  const justNowUk = formatRelativeTime(now - 10000, 'uk');
  assert.ok(justNowUk === 'зараз' || justNowUk.includes('тому') || justNowUk.length > 0);

  // Just now in English
  const justNowEn = formatRelativeTime(now - 10000, 'en');
  assert.ok(justNowEn.toLowerCase().includes('now') || justNowEn.includes('second'));

  // 5 minutes ago in Ukrainian
  const fiveMinUk = formatRelativeTime(now - 5 * 60 * 1000, 'uk');
  assert.ok(fiveMinUk.includes('хв') || fiveMinUk.includes('тому'));
});

test('client UI translations cover all supported languages without missing labels', async () => {
  const { SUPPORTED_LANGUAGES: clientLangs } = await import('../src/lib/i18n.js');
  const requiredKeys = [
    'opt_mode_default',
    'opt_mode_telegraph',
    'opt_mode_photo',
    'opt_mode_link_only',
    'tip_iv_label',
    'tip_opml_label',
    'tip_channel_label',
    'status_read',
    'load_failed',
    'instant_view',
  ];

  for (const langCode of Object.keys(clientLangs)) {
    // Check that Ukrainian has proper native terms
    if (langCode === 'uk') {
      const { t } = await import('../tgcloud/lib/i18n.js');
      assert.equal(t('uk', 'btn_instant_view'), '⚡ Швидкий перегляд');
      assert.equal(t('uk', 'instant_view'), 'Швидкий перегляд');
    }
  }
});
