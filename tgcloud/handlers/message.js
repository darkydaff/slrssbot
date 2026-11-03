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
import { subscriptions, feedStates, feedEntries } from '../schema.js';
import { discoverAndParseFeed } from '../lib/feed_finder.js';
import { parseOpml, generateOpml } from '../lib/opml.js';
import { pollSingleFeed, pollAllFeeds, forcePollFeed } from '../lib/poller.js';
import { escapeHtml } from '../lib/formatter.js';

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
      await handleStart(chatId);
      break;

    case '/help':
      await handleHelp(chatId);
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
      await handlePoll(chatId, args, command === '/force_poll');
      break;

    case '/set':
    case '/settings':
      await handleSet(message, args);
      break;

    case '/export':
      await handleExport(message, args);
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
async function resolveTargetChat(message, args) {
  const currentChatId = message.chat.id;
  const fromId = message.from?.id;

  // If user only passed @channel without a feed URL, treat it as a request to follow that public channel
  if (args.length === 1 && args[0].startsWith('@')) {
    return {
      targetChatId: currentChatId,
      targetTitle: message.chat.title || 'this chat',
      remainingArgs: [`https://t.me/s/${args[0].slice(1)}`],
    };
  }

  // If user passed a lone chat ID (-100...) without a feed URL
  if (args.length === 1 && /^-100\d+$/.test(args[0])) {
    return {
      error: `ℹ️ <b>Missing Feed URL:</b>\nTo subscribe a channel to an RSS feed, include the feed URL:\n<code>/sub ${escapeHtml(args[0])} &lt;feed_url&gt;</code>`,
    };
  }

  // Check if first argument is a channel handle (@channel) or chat ID (-100...) with a URL following it
  if (args.length > 1 && (args[0].startsWith('@') || /^-100\d+$/.test(args[0]))) {
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

  // Subscribing in current chat
  return {
    targetChatId: currentChatId,
    targetTitle: message.chat.title || 'this chat',
    remainingArgs: args,
  };
}

/**
 * Register bot commands with Telegram so the [/] Menu button works everywhere.
 */
async function syncBotCommands() {
  try {
    await api.setMyCommands({
      commands: [
        { command: 'sub', description: 'Subscribe to feed or channel' },
        { command: 'unsub', description: 'Unsubscribe from a feed' },
        { command: 'list', description: 'List active subscriptions' },
        { command: 'set', description: 'Configure delivery mode (Instant View/Photo)' },
        { command: 'poll', description: 'Check feeds for new posts' },
        { command: 'force_poll', description: 'Force deliver latest post immediately' },
        { command: 'export', description: 'Export subscriptions to OPML file' },
        { command: 'help', description: 'Show complete command guide' },
      ],
    });
  } catch {
    // Ignore if rate limited or failed
  }
}

/**
 * /start command
 */
async function handleStart(chatId) {
  // Sync the menu commands with Telegram
  syncBotCommands().catch(() => {});

  const welcome = `<b>Welcome to RSS to Telegram Bot!</b> 📡

A modern serverless RSS reader powered by Telegram's cloud platform.

✨ <b>Key Capabilities:</b>
• <b>Auto-Detection:</b> Paste any website or blog link (Substack, WordPress, Medium, GitHub) — the bot finds the feed automatically!
• <b>Telegram Channels:</b> Follow public Telegram channels via <code>/sub @channel</code>.
• <b>⚡ Instant View:</b> Reads articles smoothly inside Telegram with native Instant View.
• <b>📢 Channel Delivery:</b> Send RSS feeds into channels you manage via <code>/sub @your_channel &lt;url&gt;</code>.
• <b>OPML Import/Export:</b> Send an <code>.opml</code> file to import all feeds at once.

📋 <b>All Commands:</b>
• <code>/sub &lt;url|@channel&gt;</code> — Subscribe to a feed or Telegram channel
• <code>/unsub [url]</code> — Unsubscribe (or tap inline button)
• <code>/list</code> — View active subscriptions with quick actions
• <code>/set</code> — Toggle delivery mode (⚡ Instant View, 🖼️ Photo Banner, 🔗 Link Only)
• <code>/poll</code> — Check for new updates
• <code>/force_poll</code> — Force-send the latest message immediately
• <code>/export</code> — Export subscriptions as OPML
• <code>/help</code> — Detailed syntax and examples

<i>Tip: You can also tap the <b>[ / ] Menu</b> button next to the message input to quickly select any command!</i>`;

  await api.sendMessage({
    chat_id: chatId,
    text: welcome,
    parse_mode: 'HTML',
  });
}

/**
 * /help command
 */
async function handleHelp(chatId) {
  const help = `📖 <b>RSS to Telegram Bot — Command Guide</b>

➕ <b>Subscribe:</b>
• <code>/sub https://techcrunch.com</code> <i>(Auto-detects WordPress/Atom/RSS)</i>
• <code>/sub https://godesulloh.substack.com</code> <i>(Auto-detects Substack)</i>
• <code>/sub @Crimeanwind</code> <i>(Follow a public Telegram channel)</i>
• <code>/sub @my_channel https://feed-url</code> <i>(Deliver feeds to a channel you own)</i>

➖ <b>Unsubscribe:</b>
• <code>/unsub &lt;url&gt;</code> — Unsubscribe a specific feed
• <code>/unsub</code> — Interactive inline button list to remove feeds
• <code>/unsub @my_channel &lt;url&gt;</code> — Remove from a channel

📋 <b>Manage & Configure:</b>
• <code>/list</code> — Show active subscriptions with fast unsubscribe buttons
• <code>/set</code> — Choose between <b>⚡ Instant View</b>, <b>🖼️ Photo Banner</b>, or <b>🔗 Link Only</b>
• <code>/set @my_channel</code> — Configure delivery mode for a managed channel

🔄 <b>Polling & Updates:</b>
• <code>/poll</code> — Check all feeds for new updates
• <code>/force_poll</code> <i>(or <code>/poll force</code>)</i> — Force-deliver the latest post right now

📁 <b>OPML Backup:</b>
• <code>/export</code> — Download your subscriptions as a standard <code>.opml</code> file
• <b>Import:</b> Send any <code>.opml</code> document directly to this chat to batch import feeds!`;

  await api.sendMessage({
    chat_id: chatId,
    text: help,
    parse_mode: 'HTML',
  });
}

/**
 * /sub command with auto-discovery and channel support
 */
async function handleSub(message, args) {
  const chatId = message.chat.id;

  const target = await resolveTargetChat(message, args);
  if (target.error) {
    await api.sendMessage({ chat_id: chatId, text: target.error, parse_mode: 'HTML' });
    return;
  }

  const { targetChatId, targetTitle, remainingArgs } = target;

  if (remainingArgs.length === 0) {
    await api.sendMessage({
      chat_id: chatId,
      text: `<b>Usage:</b>\n• <code>/sub &lt;url&gt;</code>\n• <code>/sub @channel &lt;url&gt;</code>\n\n<i>Example:</i>\n<code>/sub https://godesulloh.substack.com/</code>`,
      parse_mode: 'HTML',
    });
    return;
  }

  const rawUrl = remainingArgs[0].trim();
  const statusMsg = await api.sendMessage({
    chat_id: chatId,
    text: `⏳ Discovering feed for <code>${escapeHtml(rawUrl)}</code>...`,
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
        text: `⚠️ <b>Already Subscribed:</b>\n<b>Target:</b> ${escapeHtml(targetTitle)}\n<b>Feed:</b> <code>${escapeHtml(feedUrl)}</code>`,
        parse_mode: 'HTML',
      });
      return;
    }

    // Save or update feed state
    await db.insert(feedStates).values({
      feedUrl,
      title: parsedFeed.title,
      etag: discovery.headers?.get('etag'),
      lastModified: discovery.headers?.get('last-modified'),
      lastCheckedAt: new Date(),
      errorCount: 0,
      lastError: null,
    }).onConflictDoUpdate({
      target: feedStates.feedUrl,
      set: {
        title: parsedFeed.title,
        lastCheckedAt: new Date(),
        errorCount: 0,
        lastError: null,
      },
    }).run();

    // Mark current entries as seen so we don't spam historical items immediately
    for (const item of (parsedFeed.items || []).slice(0, 30)) {
      const guid = item.guid || item.link || item.title;
      if (guid) {
        await db.insert(feedEntries).values({
          feedUrl,
          entryGuid: guid,
          publishedAt: item.pubDate || new Date(),
        }).onConflictDoNothing({ target: feedEntries.id }).run();
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

  const target = await resolveTargetChat(message, args);
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

  if (subs.length === 0) {
    await api.sendMessage({
      chat_id: chatId,
      text: `No subscriptions found for <b>${escapeHtml(targetTitle)}</b>.`,
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
    text: `<b>Select a feed to unsubscribe from ${escapeHtml(targetTitle)}:</b>`,
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

  const target = await resolveTargetChat(message, args);
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
      text: `📭 <b>No active subscriptions for ${escapeHtml(targetTitle)}.</b>\n\nAdd one using: <code>/sub &lt;url&gt;</code>`,
      parse_mode: 'HTML',
    });
    return;
  }

  let text = `📋 <b>Subscriptions for ${escapeHtml(targetTitle)} (${subs.length}):</b>\n\n`;
  const keyboard = [];

  for (let i = 0; i < subs.length; i++) {
    const s = subs[i];
    const name = s.customTitle || 'Feed';
    text += `${i + 1}. <a href="${escapeHtml(s.feedUrl)}">${escapeHtml(name)}</a>\n`;

    if (i < 8) {
      keyboard.push([
        { text: `❌ Unsub #${i + 1}`, callback_data: `unsub:${s.id}` },
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
 */
async function handlePoll(chatId, args = [], isForceCmd = false) {
  const isForce = isForceCmd || args[0]?.toLowerCase() === 'force' || args[0]?.toLowerCase() === 'latest';

  if (isForce) {
    const subs = await db.select()
      .from(subscriptions)
      .where(and(eq(subscriptions.chatId, chatId), eq(subscriptions.paused, false)))
      .all();

    if (subs.length === 0) {
      await api.sendMessage({
        chat_id: chatId,
        text: `📭 No active subscriptions to force poll in this chat. Add one with <code>/sub &lt;url&gt;</code>`,
        parse_mode: 'HTML',
      });
      return;
    }

    const msg = await api.sendMessage({
      chat_id: chatId,
      text: `⚡ <b>Force Polling:</b> Fetching the latest posts from your subscriptions...`,
      parse_mode: 'HTML',
    });

    let sentTotal = 0;
    const errors = [];

    for (const sub of subs) {
      const res = await forcePollFeed(sub.feedUrl, chatId, 1);
      if (res.error) {
        errors.push(`${sub.customTitle || sub.feedUrl}: ${res.error}`);
      } else {
        sentTotal += res.sentCount;
      }
    }

    let report = `⚡ <b>Force Poll Complete:</b> Delivered <b>${sentTotal}</b> latest post(s) into this chat.`;
    if (errors.length > 0) {
      report += `\n⚠️ <i>${errors.length} feeds had errors fetching.</i>`;
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

  const target = await resolveTargetChat(message, args);
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
      text: `📭 No active subscriptions for ${escapeHtml(targetTitle)}. Add one with <code>/sub &lt;url&gt;</code>`,
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
    text: `⚙️ <b>Configure Delivery Mode for ${escapeHtml(targetTitle)}:</b>\nSelect a subscription to choose between <b>⚡ Instant View</b>, <b>🖼️ Photo Banner</b>, or <b>🔗 Link Only</b>:`,
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

  const target = await resolveTargetChat(message, args);
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

  const statusMsg = await api.sendMessage({
    chat_id: chatId,
    text: `📥 Reading and importing OPML file...`,
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
        .where(and(eq(subscriptions.chatId, chatId), eq(subscriptions.feedUrl, f.xmlUrl)))
        .get();

      if (!existing) {
        await db.insert(subscriptions).values({
          chatId,
          feedUrl: f.xmlUrl,
          customTitle: f.title || f.xmlUrl,
        }).run();

        // Queue feed state check
        await pollSingleFeed(f.xmlUrl);
        importedCount++;
      }
    }

    await api.editMessageText({
      chat_id: chatId,
      message_id: statusMsg.message_id,
      text: `✅ <b>OPML Import Completed:</b>\n• Discovered: ${feeds.length}\n• Successfully imported: ${importedCount}`,
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
