/**
 * handlers/callback_query.js — Handles inline keyboard interactions.
 */

import { api, db } from 'sdk';
import { eq } from 'sdk/db';
import { subscriptions } from '../schema.js';

export default async function (callbackQuery, ctx) {
  if (!callbackQuery || !callbackQuery.data) return;

  const data = callbackQuery.data;
  const queryId = callbackQuery.id;
  const message = callbackQuery.message;
  const chatId = message?.chat?.id;

  // 1. Unsubscribe action
  if (data.startsWith('unsub:')) {
    const subId = parseInt(data.replace('unsub:', ''), 10);
    if (!subId) {
      await api.answerCallbackQuery({ callback_query_id: queryId, text: 'Invalid request.' });
      return;
    }

    const sub = await db.select().from(subscriptions).where(eq(subscriptions.id, subId)).get();
    if (!sub) {
      await api.answerCallbackQuery({ callback_query_id: queryId, text: 'Subscription not found or already deleted.' });
      if (message) {
        await api.editMessageText({
          chat_id: chatId,
          message_id: message.message_id,
          text: `⚠️ That subscription no longer exists.`,
        });
      }
      return;
    }

    await db.delete(subscriptions).where(eq(subscriptions.id, subId)).run();

    await api.answerCallbackQuery({
      callback_query_id: queryId,
      text: 'Unsubscribed successfully.',
    });

    if (message) {
      await api.editMessageText({
        chat_id: chatId,
        message_id: message.message_id,
        text: `✅ Unsubscribed from: <b>${sub.customTitle || sub.feedUrl}</b>`,
        parse_mode: 'HTML',
      });
    }
    return;
  }

  // 2. Open Settings for a feed: set_feed:<subId>
  if (data.startsWith('set_feed:')) {
    const subId = parseInt(data.replace('set_feed:', ''), 10);
    const sub = await db.select().from(subscriptions).where(eq(subscriptions.id, subId)).get();
    if (!sub) {
      await api.answerCallbackQuery({ callback_query_id: queryId, text: 'Subscription not found.' });
      return;
    }

    const modeLabels = {
      default: '⚡ Instant View / Preview (Default)',
      instant_view: '⚡ Instant View / Preview',
      photo: '🖼️ Photo Banner + Caption',
      link_only: '🔗 Link Only (Compact)',
    };

    const currentMode = modeLabels[sub.sendMode] || sub.sendMode || '⚡ Instant View';
    const text = `⚙️ <b>Settings for:</b>\n<b>${sub.customTitle || sub.feedUrl}</b>\n\n<b>Current Mode:</b> ${currentMode}\n\nSelect delivery mode:`;

    const keyboard = [
      [{ text: '⚡ Instant View / Preview', callback_data: `set_mode:${sub.id}:instant_view` }],
      [{ text: '🖼️ Photo Banner + Caption', callback_data: `set_mode:${sub.id}:photo` }],
      [{ text: '🔗 Link Only (Compact)', callback_data: `set_mode:${sub.id}:link_only` }],
      [{ text: '🔙 Back to Settings List', callback_data: 'set_list' }],
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
    const [, subIdStr, newMode] = data.split(':');
    const subId = parseInt(subIdStr, 10);

    const sub = await db.select().from(subscriptions).where(eq(subscriptions.id, subId)).get();
    if (!sub) {
      await api.answerCallbackQuery({ callback_query_id: queryId, text: 'Subscription not found.' });
      return;
    }

    await db.update(subscriptions)
      .set({ sendMode: newMode })
      .where(eq(subscriptions.id, subId))
      .run();

    await api.answerCallbackQuery({
      callback_query_id: queryId,
      text: `Updated mode to: ${newMode}`,
    });

    const modeLabels = {
      instant_view: '⚡ Instant View / Preview',
      photo: '🖼️ Photo Banner + Caption',
      link_only: '🔗 Link Only (Compact)',
    };

    const text = `✅ <b>Settings Updated!</b>\n\n<b>Feed:</b> ${sub.customTitle || sub.feedUrl}\n<b>New Mode:</b> ${modeLabels[newMode] || newMode}`;

    const keyboard = [
      [{ text: '🔙 Back to Settings List', callback_data: 'set_list' }],
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
    const subs = await db.select()
      .from(subscriptions)
      .where(eq(subscriptions.chatId, chatId))
      .all();

    if (subs.length === 0) {
      await api.answerCallbackQuery({ callback_query_id: queryId, text: 'No subscriptions found.' });
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
        text: `⚙️ <b>Configure Feed Delivery Mode:</b>\nSelect a subscription to change how it is sent:`,
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: keyboard },
      });
    }
    return;
  }

  await api.answerCallbackQuery({
    callback_query_id: queryId,
    text: 'Action completed.',
  });
}
