/**
 * handlers/callback_query.js — Handles inline keyboard interactions.
 */

import { api, db } from 'sdk';
import { eq } from 'sdk/db';
import { subscriptions, chatSettings } from '../schema.js';
import { t, getChatLanguage, SUPPORTED_LANGUAGES, normalizeLanguageCode } from '../lib/i18n.js';
import { MINI_APP_URL } from '../lib/config.js';

export default async function (callbackQuery, ctx) {
  if (!callbackQuery || !callbackQuery.data) return;

  const data = callbackQuery.data;
  const queryId = callbackQuery.id;
  const message = callbackQuery.message;
  const chatId = message?.chat?.id;
  const fromLang = callbackQuery.from?.language_code;

  // 1. Language switcher callback
  if (data === 'show_lang') {
    const lang = await getChatLanguage(chatId, fromLang);
    const keyboard = [];
    const entries = Object.entries(SUPPORTED_LANGUAGES);
    for (let i = 0; i < entries.length; i += 2) {
      const row = [];
      const [c1, item1] = entries[i];
      row.push({ text: `${item1.flag} ${item1.native}`, callback_data: `set_lang:${c1}` });
      if (entries[i + 1]) {
        const [c2, item2] = entries[i + 1];
        row.push({ text: `${item2.flag} ${item2.native}`, callback_data: `set_lang:${c2}` });
      }
      keyboard.push(row);
    }
    keyboard.push([{ text: `🌐 Auto (Telegram App)`, callback_data: `set_lang:auto` }]);

    await api.answerCallbackQuery({ callback_query_id: queryId });
    if (message) {
      await api.editMessageText({
        chat_id: chatId,
        message_id: message.message_id,
        text: t(lang, 'choose_lang'),
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: keyboard },
      });
    }
    return;
  }

  if (data.startsWith('set_lang:')) {
    const chosenLang = data.replace('set_lang:', '').trim();
    const saveLang = chosenLang === 'auto' ? 'auto' : normalizeLanguageCode(chosenLang);

    await db.insert(chatSettings).values({
      chatId,
      lang: saveLang,
    }).onConflictDoUpdate({
      target: chatSettings.chatId,
      set: { lang: saveLang },
    }).run();

    const activeLang = saveLang === 'auto' ? normalizeLanguageCode(fromLang) : saveLang;
    const langObj = SUPPORTED_LANGUAGES[activeLang] || SUPPORTED_LANGUAGES.en;
    const langLabel = `${langObj.flag} ${langObj.native}`;

    await api.answerCallbackQuery({
      callback_query_id: queryId,
      text: t(activeLang, 'lang_changed', { lang: langLabel }).replace(/<[^>]+>/g, ''),
    });

    if (message) {
      await api.editMessageText({
        chat_id: chatId,
        message_id: message.message_id,
        text: t(activeLang, 'lang_changed', { lang: langLabel }),
        parse_mode: 'HTML',
      });
    }
    return;
  }

  // Help info
  if (data === 'help_info') {
    const lang = await getChatLanguage(chatId, fromLang);
    const help = `${t(lang, 'help_guide_title')}

${t(lang, 'sub_help')}

${t(lang, 'unsub_help')}

${t(lang, 'manage_help')}`;

    await api.answerCallbackQuery({ callback_query_id: queryId });
    if (message) {
      await api.editMessageText({
        chat_id: chatId,
        message_id: message.message_id,
        text: help,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: t(lang, 'btn_open_reader'), web_app: { url: MINI_APP_URL } }],
            [
              { text: t(lang, 'btn_my_subs'), callback_data: 'set_list' },
              { text: t(lang, 'btn_language'), callback_data: 'show_lang' },
            ],
          ],
        },
      });
    }
    return;
  }

  // 1. Unsubscribe action
  if (data.startsWith('unsub:')) {
    const lang = await getChatLanguage(chatId, fromLang);
    const subId = parseInt(data.replace('unsub:', ''), 10);
    if (!subId) {
      await api.answerCallbackQuery({ callback_query_id: queryId, text: 'Invalid request.' });
      return;
    }

    const sub = await db.select().from(subscriptions).where(eq(subscriptions.id, subId)).get();
    if (!sub) {
      await api.answerCallbackQuery({ callback_query_id: queryId, text: t(lang, 'sub_not_found').replace(/<[^>]+>/g, '') });
      if (message) {
        await api.editMessageText({
          chat_id: chatId,
          message_id: message.message_id,
          text: t(lang, 'sub_not_found'),
        });
      }
      return;
    }

    await db.delete(subscriptions).where(eq(subscriptions.id, subId)).run();

    await api.answerCallbackQuery({
      callback_query_id: queryId,
      text: t(lang, 'unsub_success', { title: sub.customTitle || sub.feedUrl }).replace(/<[^>]+>/g, ''),
    });

    if (message) {
      await api.editMessageText({
        chat_id: chatId,
        message_id: message.message_id,
        text: t(lang, 'unsub_success', { title: sub.customTitle || sub.feedUrl }),
        parse_mode: 'HTML',
      });
    }
    return;
  }

  // 2. Open Settings for a feed: set_feed:<subId>
  if (data.startsWith('set_feed:')) {
    const lang = await getChatLanguage(chatId, fromLang);
    const subId = parseInt(data.replace('set_feed:', ''), 10);
    const sub = await db.select().from(subscriptions).where(eq(subscriptions.id, subId)).get();
    if (!sub) {
      await api.answerCallbackQuery({ callback_query_id: queryId, text: t(lang, 'sub_not_found').replace(/<[^>]+>/g, '') });
      return;
    }

    const modeLabels = {
      default: t(lang, 'mode_default'),
      instant_view: t(lang, 'mode_default'),
      telegraph: t(lang, 'mode_telegraph'),
      photo: t(lang, 'mode_photo'),
      link_only: t(lang, 'mode_link_only'),
    };

    const currentMode = modeLabels[sub.sendMode] || sub.sendMode || t(lang, 'mode_default');
    const text = t(lang, 'settings_title', { title: sub.customTitle || sub.feedUrl, mode: currentMode });

    const keyboard = [
      [{ text: t(lang, 'mode_default'), callback_data: `set_mode:${sub.id}:default` }],
      [{ text: t(lang, 'mode_telegraph'), callback_data: `set_mode:${sub.id}:telegraph` }],
      [{ text: t(lang, 'mode_photo'), callback_data: `set_mode:${sub.id}:photo` }],
      [{ text: t(lang, 'mode_link_only'), callback_data: `set_mode:${sub.id}:link_only` }],
      [{ text: t(lang, 'btn_back_settings'), callback_data: 'set_list' }],
    ];

    await api.answerCallbackQuery({ callback_query_id: queryId });
    if (message) {
      await api.editMessageText({
        chat_id: chatId,
        message_id: message.message_id,
        text,
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: keyboard },
      });
    }
    return;
  }

  // 3. Set delivery mode: set_mode:<subId>:<mode>
  if (data.startsWith('set_mode:')) {
    const lang = await getChatLanguage(chatId, fromLang);
    const [, subIdStr, newMode] = data.split(':');
    const subId = parseInt(subIdStr, 10);

    const sub = await db.select().from(subscriptions).where(eq(subscriptions.id, subId)).get();
    if (!sub) {
      await api.answerCallbackQuery({ callback_query_id: queryId, text: t(lang, 'sub_not_found').replace(/<[^>]+>/g, '') });
      return;
    }

    await db.update(subscriptions)
      .set({ sendMode: newMode })
      .where(eq(subscriptions.id, subId))
      .run();

    const modeLabels = {
      default: t(lang, 'mode_default'),
      instant_view: t(lang, 'mode_default'),
      telegraph: t(lang, 'mode_telegraph'),
      photo: t(lang, 'mode_photo'),
      link_only: t(lang, 'mode_link_only'),
    };

    await api.answerCallbackQuery({
      callback_query_id: queryId,
      text: `${modeLabels[newMode] || newMode}`,
    });

    const text = t(lang, 'settings_updated', {
      title: sub.customTitle || sub.feedUrl,
      mode: modeLabels[newMode] || newMode,
    });

    const keyboard = [
      [{ text: t(lang, 'btn_back_settings'), callback_data: 'set_list' }],
    ];

    if (message) {
      await api.editMessageText({
        chat_id: chatId,
        message_id: message.message_id,
        text,
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: keyboard },
      });
    }
    return;
  }

  // 4. Return to Settings list: set_list
  if (data === 'set_list') {
    const lang = await getChatLanguage(chatId, fromLang);
    const subs = await db.select()
      .from(subscriptions)
      .where(eq(subscriptions.chatId, chatId))
      .all();

    if (subs.length === 0) {
      await api.answerCallbackQuery({ callback_query_id: queryId, text: t(lang, 'no_subs').replace(/<[^>]+>/g, '') });
      return;
    }

    const keyboard = subs.slice(0, 10).map((s) => [{
      text: `⚙️ ${s.customTitle || s.feedUrl}`,
      callback_data: `set_feed:${s.id}`,
    }]);

    await api.answerCallbackQuery({ callback_query_id: queryId });
    if (message) {
      await api.editMessageText({
        chat_id: chatId,
        message_id: message.message_id,
        text: t(lang, 'feed_delivery_mode'),
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: keyboard },
      });
    }
    return;
  }

  const defaultLang = await getChatLanguage(chatId, fromLang);
  await api.answerCallbackQuery({
    callback_query_id: queryId,
    text: t(defaultLang, 'action_completed'),
  });
}
