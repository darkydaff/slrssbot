/**
 * handlers/message.js — Handles incoming Telegram messages and commands.
 * Features:
 *  - Substack, WordPress, Medium & HTML <link> feed auto-discovery.
 *  - Channel & group targeting (/sub @channel <url> with admin checks).
 *  - OPML file import and export.
 *  - Manual update checks and interactive list/unsub.
 */

import { api, db, InputFile, BotApiError } from 'sdk';
import { eq, and } from 'sdk/db';
import { subscriptions, feedStates, feedEntries, chatSettings } from '../schema.js';
import { discoverAndParseFeed } from '../lib/feed_finder.js';
import { parseOpml, generateOpml } from '../lib/opml.js';
import { pollSingleFeed, pollAllFeeds, forcePollFeed } from '../lib/poller.js';
import { escapeHtml, extractCleanSummary } from '../lib/formatter.js';
import { t, getChatLanguage, SUPPORTED_LANGUAGES, normalizeLanguageCode, registerAllBotCommands } from '../lib/i18n.js';

export default async function (message, ctx) {
  if (!message || !message.chat) return;

  const chatId = message.chat.id;
  const fromId = message.from?.id;
  const text = (message.text || '').trim();

  // 1. Handle OPML document upload
  if (message.document) {
    const doc = message.document;
    const fileName = (doc.file_name || '').toLowerCase();
    if (fileName.endsWith('.opml') || fileName.endsWith('.xml')) {
      await handleOpmlUpload(message, doc);
      return;
    }
  }

  if (!text) return;

  // 2. Parse command and arguments
  const parts = text.split(/\s+/);
  const command = parts[0].toLowerCase().split('@')[0];
  const args = parts.slice(1);

  switch (command) {
    case '/start':
      await handleStart(chatId, message.from?.language_code);
      break;

    case '/help':
      await handleHelp(chatId, message.from?.language_code);
      break;

    case '/lang':
    case '/language':
    case '/set_lang':
      await handleLang(chatId, message.from?.language_code, args);
      break;

    case '/sub':
      await handleSub(message, args);
      break;

    case '/unsub':
      await handleUnsub(message, args);
      break;

    case '/list':
      await handleList(message, args);
      break;

    case '/poll':
    case '/check':
    case '/force_poll':
      await handlePoll(message, args, command === '/force_poll');
      break;

    case '/set':
    case '/settings':
      await handleSet(message, args);
      break;

    case '/export':
      await handleExport(message, args);
      break;

    case '/reader':
    case '/app':
      {
        const lang = await getChatLanguage(chatId, message.from?.language_code);
        await api.sendMessage({
          chat_id: chatId,
          text: `📖 <b>${t(lang, 'app_title')}</b>\n\n${t(lang, 'welcome_desc')}`,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: t(lang, 'btn_open_reader'), web_app: { url: 'https://app9057202653.tgcloud.ai' } }],
            ],
          },
        });
      }
      break;

    default:
      if (text.startsWith('/') && message.chat.type === 'private') {
        await api.sendMessage({
          chat_id: chatId,
          text: `Unknown command. Type /help to see all available commands.`,
        });
      }
      break;
  }
}

/**
 * Resolve target chat (current chat or specified channel/group).
 * Verifies that the sender and the bot have administrative permissions in the target chat.
 */
async function resolveTargetChat(message, args, isSubCommand = false) {
  const currentChatId = message.chat.id;
  const fromId = message.from?.id;

  // If user only passed @channel without a feed URL in /sub, treat it as a request to follow that public channel
  if (isSubCommand && args.length === 1 && args[0].startsWith('@')) {
    return {
      targetChatId: currentChatId,
      targetTitle: message.chat.title || 'this chat',
      remainingArgs: [`https://t.me/s/${args[0].slice(1)}`],
    };
  }

  // If user passed a lone chat ID (-100...) without a feed URL for /sub
  if (isSubCommand && args.length === 1 && /^-100\d+$/.test(args[0])) {
    return {
      error: `ℹ️ <b>Missing Feed URL:</b>\nTo subscribe a channel to an RSS feed, include the feed URL:\n<code>/sub ${escapeHtml(args[0])} &lt;feed_url&gt;</code>`,
    };
  }

  // Check if first argument is a channel handle (@channel) or chat ID (-100...)
  if (args.length >= 1 && (args[0].startsWith('@') || /^-100\d+$/.test(args[0]))) {
    const targetIdentifier = args[0];
    const remainingArgs = args.slice(1);

    try {
      const targetChat = await api.getChat({ chat_id: targetIdentifier });

      // In private chats or groups, verify that the calling user is an admin of the channel
      if (fromId) {
        const senderMember = await api.getChatMember({
          chat_id: targetChat.id,
          user_id: fromId,
        });

        if (!['creator', 'administrator'].includes(senderMember.status)) {
          return {
            error: `⚠️ You must be an administrator or creator of <b>${escapeHtml(targetChat.title || targetIdentifier)}</b> to manage subscriptions for it.`,
          };
        }
      }

      // Verify bot permissions in the target channel
      const me = await api.getMe();
      const botMember = await api.getChatMember({
        chat_id: targetChat.id,
        user_id: me.id,
      });

      if (botMember.status !== 'administrator') {
        return {
          error: `⚠️ The bot must be added as an <b>administrator</b> in <b>${escapeHtml(targetChat.title || targetIdentifier)}</b> with permission to post messages.`,
        };
      }

      return {
        targetChatId: targetChat.id,
        targetTitle: targetChat.title || targetIdentifier,
        remainingArgs,
      };
    } catch (err) {
      return {
        error: `❌ Could not find or access target chat <code>${escapeHtml(targetIdentifier)}</code>.\nMake sure the username/ID is correct and the bot has been added.`,
      };
    }
  }

  // Acting in current chat
  return {
    targetChatId: currentChatId,
    targetTitle: message.chat.title || 'this chat',
    remainingArgs: args,
  };
}

/**
 * Register bot commands with Telegram so the [/] Menu button works everywhere across all languages.
 */
async function syncBotCommands() {
  try {
    await registerAllBotCommands(api);
    try {
      await api.setChatMenuButton({
        menu_button: {
          type: 'web_app',
          text: '📖 Reader',
          web_app: { url: 'https://app9057202653.tgcloud.ai' },
        },
      });
    } catch {
      // Ignore if unsupported
    }
  } catch {
    // Ignore if rate limited or failed
  }
}

/**
 * /start command
 */
async function handleStart(chatId, fromLang = null) {
  // Sync the menu commands with Telegram
  syncBotCommands().catch(() => {});
  const lang = await getChatLanguage(chatId, fromLang);

  const welcome = `${t(lang, 'welcome_title')}

${t(lang, 'welcome_desc')}

${t(lang, 'key_features')}
${t(lang, 'feat_reader')}
${t(lang, 'feat_autodetect')}
${t(lang, 'feat_instant_view')}
${t(lang, 'feat_channel')}
${t(lang, 'feat_broadcast')}
${t(lang, 'feat_opml')}

${t(lang, 'commands_header')}
${t(lang, 'cmd_reader')}
${t(lang, 'cmd_sub')}
${t(lang, 'cmd_unsub')}
${t(lang, 'cmd_list')}
${t(lang, 'cmd_set')}
${t(lang, 'cmd_lang')}
${t(lang, 'cmd_poll')}
${t(lang, 'cmd_force_poll')}
${t(lang, 'cmd_export')}
${t(lang, 'cmd_help')}`;

  await api.sendMessage({
    chat_id: chatId,
    text: welcome,
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [{ text: t(lang, 'btn_open_reader'), web_app: { url: 'https://app9057202653.tgcloud.ai' } }],
        [
          { text: t(lang, 'btn_my_subs'), callback_data: 'set_list' },
          { text: t(lang, 'btn_language'), callback_data: 'show_lang' },
        ],
        [
          { text: t(lang, 'btn_help'), callback_data: 'help_info' },
        ],
      ],
    },
  });
}

/**
 * /help command
 */
async function handleHelp(chatId, fromLang = null) {
  const lang = await getChatLanguage(chatId, fromLang);

  const help = `${t(lang, 'help_guide_title')}

${t(lang, 'sub_help')}

${t(lang, 'unsub_help')}

${t(lang, 'manage_help')}`;

  await api.sendMessage({
    chat_id: chatId,
    text: help,
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [{ text: t(lang, 'btn_open_reader'), web_app: { url: 'https://app9057202653.tgcloud.ai' } }],
        [
          { text: t(lang, 'btn_my_subs'), callback_data: 'set_list' },
          { text: t(lang, 'btn_language'), callback_data: 'show_lang' },
        ],
      ],
    },
  });
}

/**
 * /lang command (interactive language switcher)
 */
async function handleLang(chatId, fromLang = null, args = []) {
  if (args[0]) {
    const rawCode = args[0].toLowerCase();
    const saveLang = rawCode === 'auto' ? 'auto' : normalizeLanguageCode(rawCode);

    await db.insert(chatSettings).values({
      chatId,
      lang: saveLang,
    }).onConflictDoUpdate({
      target: chatSettings.chatId,
      set: { lang: saveLang },
    }).run();

    const activeLang = saveLang === 'auto' ? normalizeLanguageCode(fromLang) : saveLang;
    const langObj = SUPPORTED_LANGUAGES[activeLang] || SUPPORTED_LANGUAGES.en;
    await api.sendMessage({
      chat_id: chatId,
      text: t(activeLang, 'lang_changed', { lang: `${langObj.flag} ${langObj.native}` }),
      parse_mode: 'HTML',
    });
    return;
  }

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
  keyboard.push([{ text: t(lang, 'btn_auto_lang'), callback_data: `set_lang:auto` }]);

  await api.sendMessage({
    chat_id: chatId,
    text: t(lang, 'choose_lang'),
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: keyboard },
  });
}

/**
 * /sub command with auto-discovery and channel support
 */
async function handleSub(message, args) {
  const chatId = message.chat.id;
  const lang = await getChatLanguage(chatId, message.from?.language_code);

  const target = await resolveTargetChat(message, args, true);
  if (target.error) {
    await api.sendMessage({ chat_id: chatId, text: target.error, parse_mode: 'HTML' });
    return;
  }

  const { targetChatId, targetTitle, remainingArgs } = target;

  if (remainingArgs.length === 0) {
    await api.sendMessage({
      chat_id: chatId,
      text: t(lang, 'sub_usage'),
      parse_mode: 'HTML',
    });
    return;
  }

  const rawUrl = remainingArgs[0].trim();
  const statusMsg = await api.sendMessage({
    chat_id: chatId,
    text: t(lang, 'discovering_feed', { url: escapeHtml(rawUrl) }),
    parse_mode: 'HTML',
  });

  try {
    // Auto-detect and parse feed
    const discovery = await discoverAndParseFeed(rawUrl);
    const feedUrl = discovery.feedUrl;
    const parsedFeed = discovery.feed;

    // Check if already subscribed in target chat
    const existing = await db.select()
      .from(subscriptions)
      .where(and(eq(subscriptions.chatId, targetChatId), eq(subscriptions.feedUrl, feedUrl)))
      .get();

    if (existing) {
      await api.editMessageText({
        chat_id: chatId,
        message_id: statusMsg.message_id,
        text: t(lang, 'already_subscribed_chat', { target: escapeHtml(targetTitle), url: escapeHtml(feedUrl) }),
        parse_mode: 'HTML',
      });
      return;
    }

    // Save or update feed state
    await db.insert(feedStates).values({
      feedUrl,
      title: parsedFeed.title,
      description: parsedFeed.description || null,
      siteUrl: parsedFeed.link || null,
      etag: discovery.headers?.get('etag'),
      lastModified: discovery.headers?.get('last-modified'),
      lastCheckedAt: new Date(),
      errorCount: 0,
      lastError: null,
    }).onConflictDoUpdate({
      target: feedStates.feedUrl,
      set: {
        title: parsedFeed.title,
        description: parsedFeed.description || null,
        siteUrl: parsedFeed.link || null,
        lastCheckedAt: new Date(),
        errorCount: 0,
        lastError: null,
      },
    }).run();

    // Mark current entries as seen and store full content so Mini App reader has initial items ready
    for (const item of (parsedFeed.items || []).slice(0, 30)) {
      const guid = item.guid || item.link || item.title;
      if (guid) {
        const itemBody = item.content || item.description || '';
        const itemSummary = extractCleanSummary(itemBody);
        const itemLeadImg = item.imageUrl || item.enclosure?.url || (item.media?.find(m => m.type?.startsWith('image') || /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(m.url))?.url) || null;
        await db.insert(feedEntries).values({
          feedUrl,
          entryGuid: guid,
          title: item.title || 'Untitled',
          link: item.link || '',
          author: item.author || parsedFeed.title || '',
          summary: itemSummary,
          content: itemBody,
          leadImageUrl: itemLeadImg,
          media: item.media || [],
          publishedAt: item.pubDate || new Date(),
        }).onConflictDoNothing().run();
      }
    }

    // Add subscription
    await db.insert(subscriptions).values({
      chatId: targetChatId,
      feedUrl,
      customTitle: parsedFeed.title,
    }).run();

    let confirmation = `✅ <b>Subscribed successfully!</b>\n\n`;
    confirmation += `• <b>Delivering to:</b> ${escapeHtml(targetTitle)}\n`;
    confirmation += `• <b>Title:</b> ${escapeHtml(parsedFeed.title)}\n`;
    if (discovery.isTelegram) {
      confirmation += `• <b>Channel:</b> <code>${escapeHtml(feedUrl)}</code> <i>(native Telegram polling)</i>\n`;
    } else if (feedUrl !== rawUrl) {
      confirmation += `• <b>Feed Source:</b> <code>${escapeHtml(feedUrl)}</code> <i>(auto-detected)</i>\n`;
    } else {
      confirmation += `• <b>Feed Source:</b> <code>${escapeHtml(feedUrl)}</code>\n`;
    }

    await api.editMessageText({
      chat_id: chatId,
      message_id: statusMsg.message_id,
      text: confirmation,
      parse_mode: 'HTML',
    });
  } catch (err) {
    await api.editMessageText({
      chat_id: chatId,
      message_id: statusMsg.message_id,
      text: `❌ <b>Failed to subscribe:</b>\n${escapeHtml(err.message)}`,
      parse_mode: 'HTML',
    });
  }
}

/**
 * /unsub command
 */
async function handleUnsub(message, args) {
  const chatId = message.chat.id;

  const target = await resolveTargetChat(message, args, false);
  if (target.error) {
    await api.sendMessage({ chat_id: chatId, text: target.error, parse_mode: 'HTML' });
    return;
  }

  const { targetChatId, targetTitle, remainingArgs } = target;

  if (remainingArgs.length > 0) {
    let feedUrl = remainingArgs[0].trim();
    if (!feedUrl.startsWith('http://') && !feedUrl.startsWith('https://')) {
      feedUrl = `https://${feedUrl}`;
    }

    const deleted = await db.delete(subscriptions)
      .where(and(eq(subscriptions.chatId, targetChatId), eq(subscriptions.feedUrl, feedUrl)))
      .returning({ id: subscriptions.id });

    if (deleted.length > 0) {
      await api.sendMessage({
        chat_id: chatId,
        text: `✅ Unsubscribed <b>${escapeHtml(targetTitle)}</b> from:\n<code>${escapeHtml(feedUrl)}</code>`,
        parse_mode: 'HTML',
      });
    } else {
      await api.sendMessage({
        chat_id: chatId,
        text: `⚠️ Subscription not found for:\n<code>${escapeHtml(feedUrl)}</code>`,
        parse_mode: 'HTML',
      });
    }
    return;
  }

  // Interactive buttons
  const subs = await db.select()
    .from(subscriptions)
    .where(eq(subscriptions.chatId, targetChatId))
    .all();

  const lang = await getChatLanguage(chatId, message.from?.language_code);

  if (subs.length === 0) {
    await api.sendMessage({
      chat_id: chatId,
      text: t(lang, 'no_subs_for', { target: escapeHtml(targetTitle) }),
      parse_mode: 'HTML',
    });
    return;
  }

  const keyboard = subs.slice(0, 10).map((sub) => [{
    text: `❌ ${sub.customTitle || sub.feedUrl}`,
    callback_data: `unsub:${sub.id}`,
  }]);

  await api.sendMessage({
    chat_id: chatId,
    text: t(lang, 'select_feed_unsub', { target: escapeHtml(targetTitle) }),
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: keyboard,
    },
  });
}

/**
 * /list command
 */
async function handleList(message, args) {
  const chatId = message.chat.id;
  const lang = await getChatLanguage(chatId, message.from?.language_code);

  const target = await resolveTargetChat(message, args, false);
  if (target.error) {
    await api.sendMessage({ chat_id: chatId, text: target.error, parse_mode: 'HTML' });
    return;
  }

  const { targetChatId, targetTitle } = target;

  const subs = await db.select()
    .from(subscriptions)
    .where(eq(subscriptions.chatId, targetChatId))
    .all();

  if (subs.length === 0) {
    await api.sendMessage({
      chat_id: chatId,
      text: t(lang, 'no_subs_for', { target: escapeHtml(targetTitle) }),
      parse_mode: 'HTML',
    });
    return;
  }

  let text = t(lang, 'subs_for', { target: escapeHtml(targetTitle), count: subs.length });
  const keyboard = [];

  for (let i = 0; i < subs.length; i++) {
    const s = subs[i];
    const name = s.customTitle || 'Feed';
    text += `${i + 1}. <a href="${escapeHtml(s.feedUrl)}">${escapeHtml(name)}</a>\n`;

    if (i < 8) {
      keyboard.push([
        { text: t(lang, 'btn_unsub_num', { num: i + 1 }), callback_data: `unsub:${s.id}` },
      ]);
    }
  }

  await api.sendMessage({
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: keyboard.length > 0 ? { inline_keyboard: keyboard } : undefined,
  });
}

/**
 * /poll command (supports /poll force or /force_poll to deliver latest posts)
 * Also supports /force_poll @channel to deliver latest post to a specific channel.
 */
async function handlePoll(message, args = [], isForceCmd = false) {
  const chatId = message.chat.id;
  let isForce = isForceCmd;
  const cleanArgs = [...args];

  if (!isForce && (cleanArgs[0]?.toLowerCase() === 'force' || cleanArgs[0]?.toLowerCase() === 'latest')) {
    isForce = true;
    cleanArgs.shift();
  }

  const target = await resolveTargetChat(message, cleanArgs, false);
  if (target.error) {
    await api.sendMessage({ chat_id: chatId, text: target.error, parse_mode: 'HTML' });
    return;
  }

  const { targetChatId, targetTitle } = target;

  if (isForce) {
    const subs = await db.select()
      .from(subscriptions)
      .where(and(eq(subscriptions.chatId, targetChatId), eq(subscriptions.paused, false)))
      .all();

    if (subs.length === 0) {
      await api.sendMessage({
        chat_id: chatId,
        text: `📭 No active subscriptions to force poll for <b>${escapeHtml(targetTitle)}</b>. Add one with <code>/sub &lt;url&gt;</code>`,
        parse_mode: 'HTML',
      });
      return;
    }

    const msg = await api.sendMessage({
      chat_id: chatId,
      text: `⚡ <b>Force Polling:</b> Fetching the latest posts for <b>${escapeHtml(targetTitle)}</b>...`,
      parse_mode: 'HTML',
    });

    let sentTotal = 0;
    const errors = [];

    for (const sub of subs) {
      const res = await forcePollFeed(sub.feedUrl, targetChatId, 1);
      if (res.error) {
        errors.push(`${sub.customTitle || sub.feedUrl}: ${res.error}`);
      } else {
        sentTotal += res.sentCount;
      }
    }

    let report = `⚡ <b>Force Poll Complete:</b> Delivered <b>${sentTotal}</b> latest post(s) into <b>${escapeHtml(targetTitle)}</b>.`;
    if (errors.length > 0) {
      report += `\n\n⚠️ <b>Errors:</b>\n` + errors.map((e) => `• <code>${escapeHtml(e)}</code>`).join('\n');
    }

    await api.editMessageText({
      chat_id: chatId,
      message_id: msg.message_id,
      text: report,
      parse_mode: 'HTML',
    });
    return;
  }

  const msg = await api.sendMessage({
    chat_id: chatId,
    text: `🔄 Checking feeds for updates...`,
  });

  const results = await pollAllFeeds();
  const totalNew = results.reduce((acc, r) => acc + (r.newItemsCount || 0), 0);
  const errors = results.filter((r) => r.error);

  let report = `✅ <b>Check Complete:</b>\n`;
  report += `• Feeds checked: <b>${results.length}</b>\n`;
  report += `• New items delivered: <b>${totalNew}</b>\n`;

  if (errors.length > 0) {
    report += `\n⚠️ <i>${errors.length} feeds encountered network errors.</i>`;
  }

  await api.editMessageText({
    chat_id: chatId,
    message_id: msg.message_id,
    text: report,
    parse_mode: 'HTML',
  });
}

/**
 * /set command: interactive delivery mode settings
 */
async function handleSet(message, args) {
  const chatId = message.chat.id;

  const target = await resolveTargetChat(message, args, false);
  if (target.error) {
    await api.sendMessage({ chat_id: chatId, text: target.error, parse_mode: 'HTML' });
    return;
  }

  const { targetChatId, targetTitle } = target;
  const lang = await getChatLanguage(chatId, message.from?.language_code);

  const subs = await db.select()
    .from(subscriptions)
    .where(eq(subscriptions.chatId, targetChatId))
    .all();

  if (subs.length === 0) {
    await api.sendMessage({
      chat_id: chatId,
      text: t(lang, 'no_subs_for', { target: escapeHtml(targetTitle) }),
      parse_mode: 'HTML',
    });
    return;
  }

  const keyboard = subs.slice(0, 10).map((s) => [{
    text: `⚙️ ${s.customTitle || s.feedUrl}`,
    callback_data: `set_feed:${s.id}`,
  }]);

  await api.sendMessage({
    chat_id: chatId,
    text: t(lang, 'feed_delivery_mode'),
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: keyboard,
    },
  });
}

/**
 * /export command
 */
async function handleExport(message, args) {
  const chatId = message.chat.id;

  const target = await resolveTargetChat(message, args, false);
  if (target.error) {
    await api.sendMessage({ chat_id: chatId, text: target.error, parse_mode: 'HTML' });
    return;
  }

  const { targetChatId, targetTitle } = target;

  const subs = await db.select()
    .from(subscriptions)
    .where(eq(subscriptions.chatId, targetChatId))
    .all();

  if (subs.length === 0) {
    await api.sendMessage({
      chat_id: chatId,
      text: `No subscriptions found for ${escapeHtml(targetTitle)}.`,
      parse_mode: 'HTML',
    });
    return;
  }

  const opmlContent = generateOpml(subs, `RSS Subscriptions - ${targetTitle}`);
  const bytes = new TextEncoder().encode(opmlContent);

  await api.sendDocument({
    chat_id: chatId,
    document: new InputFile(bytes, 'subscriptions.opml', { type: 'text/x-opml' }),
    caption: `📁 Exported ${subs.length} feeds from ${escapeHtml(targetTitle)} as OPML.`,
  });
}

/**
 * Handle uploaded OPML document
 */
async function handleOpmlUpload(message, doc) {
  const chatId = message.chat.id;

  const captionArgs = (message.caption || '').trim().split(/\s+/).filter(Boolean);
  const target = await resolveTargetChat(message, captionArgs, false);
  if (target.error) {
    await api.sendMessage({ chat_id: chatId, text: target.error, parse_mode: 'HTML' });
    return;
  }

  const { targetChatId, targetTitle } = target;

  const statusMsg = await api.sendMessage({
    chat_id: chatId,
    text: `📥 Reading and importing OPML file for <b>${escapeHtml(targetTitle)}</b>...`,
    parse_mode: 'HTML',
  });

  try {
    const bytes = await api.getFileContent(doc.file_id);
    const xml = new TextDecoder('utf-8').decode(bytes);
    const feeds = parseOpml(xml);

    if (feeds.length === 0) {
      await api.editMessageText({
        chat_id: chatId,
        message_id: statusMsg.message_id,
        text: `⚠️ No valid RSS/Atom feed links found in the OPML file.`,
      });
      return;
    }

    let importedCount = 0;
    for (const f of feeds) {
      const existing = await db.select()
        .from(subscriptions)
        .where(and(eq(subscriptions.chatId, targetChatId), eq(subscriptions.feedUrl, f.xmlUrl)))
        .get();

      if (!existing) {
        await db.insert(subscriptions).values({
          chatId: targetChatId,
          feedUrl: f.xmlUrl,
          customTitle: f.title || f.xmlUrl,
          category: f.category || 'General',
        }).run();

        // Queue feed state check
        await pollSingleFeed(f.xmlUrl);
        importedCount++;
      }
    }

    await api.editMessageText({
      chat_id: chatId,
      message_id: statusMsg.message_id,
      text: `✅ <b>OPML Import Completed for ${escapeHtml(targetTitle)}:</b>\n• Discovered: ${feeds.length}\n• Successfully imported: ${importedCount}`,
      parse_mode: 'HTML',
    });
  } catch (err) {
    await api.editMessageText({
      chat_id: chatId,
      message_id: statusMsg.message_id,
      text: `❌ <b>Failed to process OPML file:</b>\n${escapeHtml(err.message)}`,
      parse_mode: 'HTML',
    });
  }
}
