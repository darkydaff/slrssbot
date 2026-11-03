/**
 * Feed Differential Engine & Broadcast Worker for Telegram Serverless.
 */

import { db, api, fetch, BotApiError } from 'sdk';
import { eq, and, sql } from 'sdk/db';
import { subscriptions, feedStates, feedEntries } from '../schema.js';
import { parseFeed } from './rss.js';
import { formatPost, formatChannelPost, matchesFilter, truncate } from './formatter.js';
import { createTelegraphPage } from './telegraph.js';
import {
  isTelegramChannelUrl,
  extractChannelUsername,
  fetchChannelData,
  getCanonicalChannelUrl,
} from './telegram_channel.js';

const USER_AGENT = 'TelegramServerlessRSSBot/1.0 (+https://core.telegram.org/bots/serverless)';

/**
 * Dispatch formatted post to a subscriber using the best Telegram API delivery method:
 * 1. Audio podcast -> api.sendAudio (falls back to photo/album or text on error)
 * 2. Multi-photo album -> api.sendMediaGroup (falls back to single photo or text on error)
 * 3. Single photo -> api.sendPhoto (falls back to text on error)
 * 4. Rich text message -> api.sendMessage with link preview
 * Automatically handles 403 (bot blocked) by pausing the subscription.
 */
async function deliverItemToSubscriber({ sub, formatted, originalUrl, title, performer }) {
  try {
    // 1. Audio enclosure (Podcast)
    if (formatted.audioUrl && sub.sendMode !== 'link_only') {
      try {
        const caption = truncate(formatted.text, 1020);
        await api.sendAudio({
          chat_id: sub.chatId,
          audio: formatted.audioUrl,
          caption,
          parse_mode: 'HTML',
          title: title || undefined,
          performer: performer || undefined,
          reply_markup: formatted.replyMarkup,
        });
        return;
      } catch {
        // Fall back to album, photo, or text
      }
    }

    // 2. Multi-photo album (media group of 2-10 photos)
    if (
      formatted.photos &&
      formatted.photos.length > 1 &&
      sub.sendMode !== 'link_only' &&
      (sub.sendMode === 'photo' || formatted.canSendMediaGroup !== false)
    ) {
      try {
        const caption = truncate(formatted.text, 1020);
        const mediaGroup = formatted.photos.slice(0, 10).map((url, idx) => {
          const item = { type: 'photo', media: url };
          if (idx === 0) {
            item.caption = caption;
            item.parse_mode = 'HTML';
          }
          return item;
        });

        await api.sendMediaGroup({
          chat_id: sub.chatId,
          media: mediaGroup,
        });
        return;
      } catch {
        // Fall back to single photo or text
      }
    }

    // 3. Single photo with caption
    if (
      formatted.photoUrl &&
      sub.sendMode !== 'link_only' &&
      (sub.sendMode === 'photo' || formatted.canSendPhoto)
    ) {
      try {
        const caption = truncate(formatted.text, 1020);
        await api.sendPhoto({
          chat_id: sub.chatId,
          photo: formatted.photoUrl,
          caption,
          parse_mode: 'HTML',
          reply_markup: formatted.replyMarkup,
        });
        return;
      } catch {
        // Fall back to text message
      }
    }

    // 4. Clean text message with rich link preview
    await api.sendMessage({
      chat_id: sub.chatId,
      text: formatted.text,
      parse_mode: 'HTML',
      link_preview_options: originalUrl
        ? {
            url: originalUrl,
            prefer_large_media: true,
            show_above_text: false,
          }
        : undefined,
      reply_markup: formatted.replyMarkup,
    });
  } catch (sendErr) {
    if (sendErr instanceof BotApiError && sendErr.code === 403) {
      await db.update(subscriptions)
        .set({ paused: true })
        .where(eq(subscriptions.id, sub.id))
        .run();
    }
  }
}

/**
 * Poll a Telegram public channel directly, process new posts, and broadcast to subscribers.
 * @param {string} feedUrl
 * @returns {Promise<{feedUrl: string, newItemsCount: number, error: string|null}>}
 */
export async function pollSingleTelegramChannel(feedUrl) {
  try {
    const channelUsername = extractChannelUsername(feedUrl);
    if (!channelUsername) {
      throw new Error(`Invalid Telegram channel URL: ${feedUrl}`);
    }

    const channelData = await fetchChannelData(channelUsername);
    const channelTitle = channelData.channelTitle || channelUsername;

    // Update feed state in DB
    await db.insert(feedStates).values({
      feedUrl,
      title: channelTitle,
      lastCheckedAt: new Date(),
      lastError: null,
      errorCount: 0,
    }).onConflictDoUpdate({
      target: feedStates.feedUrl,
      set: {
        title: channelTitle,
        lastCheckedAt: new Date(),
        lastError: null,
        errorCount: 0,
      },
    }).run();

    // Fetch active subscribers for this channel
    const subs = await db.select()
      .from(subscriptions)
      .where(and(eq(subscriptions.feedUrl, feedUrl), eq(subscriptions.paused, false)))
      .all();

    if (subs.length === 0) {
      return { feedUrl, newItemsCount: 0, error: null };
    }

    let newItemsCount = 0;
    // Process posts in chronological order (oldest to newest)
    const posts = channelData.posts || [];

    for (const post of posts) {
      const guid = post.guid;
      if (!guid) continue;

      const existing = await db.select()
        .from(feedEntries)
        .where(and(eq(feedEntries.feedUrl, feedUrl), eq(feedEntries.entryGuid, guid)))
        .get();

      if (existing) {
        continue;
      }

      // Record entry as processed first (deduplication)
      await db.insert(feedEntries).values({
        feedUrl,
        entryGuid: guid,
        publishedAt: post.pubDate || new Date(),
      }).onConflictDoNothing({ target: feedEntries.id }).run();

      newItemsCount++;

      // Broadcast to subscribers
      for (const sub of subs) {
        if (!matchesFilter({ title: '', content: post.plainText }, sub.filterInclude, sub.filterExclude)) {
          continue;
        }

        const formatted = formatChannelPost(post, sub.customTitle || channelTitle, {
          sendMode: sub.sendMode,
          customTitle: sub.customTitle,
        });

        await deliverItemToSubscriber({
          sub,
          formatted,
          originalUrl: post.url,
          title: post.id ? `Post #${post.id}` : undefined,
          performer: channelTitle,
        });
      }
    }

    return { feedUrl, newItemsCount, error: null };
  } catch (err) {
    const errorMsg = err.message || 'Unknown channel polling error';
    await db.update(feedStates)
      .set({ lastCheckedAt: new Date(), lastError: errorMsg })
      .where(eq(feedStates.feedUrl, feedUrl))
      .run();
    return { feedUrl, newItemsCount: 0, error: errorMsg };
  }
}

/**
 * Poll a single feed by URL, process new entries, and broadcast to subscribers.
 * @param {string} feedUrl
 * @returns {Promise<{feedUrl: string, newItemsCount: number, error: string|null}>}
 */
export async function pollSingleFeed(feedUrl) {
  if (isTelegramChannelUrl(feedUrl)) {
    return pollSingleTelegramChannel(feedUrl);
  }

  try {
    const state = await db.select().from(feedStates).where(eq(feedStates.feedUrl, feedUrl)).get();

    const headers = {
      'User-Agent': USER_AGENT,
      'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, application/json, */*',
    };

    if (state?.etag) {
      headers['If-None-Match'] = state.etag;
    }
    if (state?.lastModified) {
      headers['If-Modified-Since'] = state.lastModified;
    }

    const res = await fetch(feedUrl, { headers });

    // 304 Not Modified: no new content
    if (res.status === 304) {
      await db.update(feedStates)
        .set({ lastCheckedAt: new Date(), errorCount: 0, lastError: null })
        .where(eq(feedStates.feedUrl, feedUrl))
        .run();
      return { feedUrl, newItemsCount: 0, error: null };
    }

    if (!res.ok) {
      const errorMsg = `HTTP ${res.status}: ${res.statusText}`;
      await db.update(feedStates)
        .set({
          lastCheckedAt: new Date(),
          lastError: errorMsg,
          errorCount: (state?.errorCount || 0) + 1,
        })
        .where(eq(feedStates.feedUrl, feedUrl))
        .run();
      return { feedUrl, newItemsCount: 0, error: errorMsg };
    }

    const rawText = await res.text();
    const parsedFeed = parseFeed(rawText);

    const etag = res.headers.get('etag');
    const lastModified = res.headers.get('last-modified');

    // Update feed state
    await db.insert(feedStates).values({
      feedUrl,
      title: parsedFeed.title,
      etag,
      lastModified,
      lastCheckedAt: new Date(),
      lastError: null,
      errorCount: 0,
    }).onConflictDoUpdate({
      target: feedStates.feedUrl,
      set: {
        title: parsedFeed.title,
        etag,
        lastModified,
        lastCheckedAt: new Date(),
        lastError: null,
        errorCount: 0,
      },
    }).run();

    // Fetch active subscribers for this feed
    const subs = await db.select()
      .from(subscriptions)
      .where(and(eq(subscriptions.feedUrl, feedUrl), eq(subscriptions.paused, false)))
      .all();

    if (subs.length === 0) {
      return { feedUrl, newItemsCount: 0, error: null };
    }

    // Check which items are new
    let newItemsCount = 0;
    // Process items in chronological order (oldest to newest)
    const items = [...parsedFeed.items].reverse();

    for (const item of items) {
      const guid = item.guid || item.link || item.title;
      if (!guid) continue;

      const existing = await db.select()
        .from(feedEntries)
        .where(and(eq(feedEntries.feedUrl, feedUrl), eq(feedEntries.entryGuid, guid)))
        .get();

      if (existing) {
        continue;
      }

      // Record entry as processed first (deduplication)
      await db.insert(feedEntries).values({
        feedUrl,
        entryGuid: guid,
        publishedAt: item.pubDate || new Date(),
      }).onConflictDoNothing({ target: feedEntries.id }).run();

      newItemsCount++;

      // Broadcast to all subscribers
      let telegraphUrl = null;
      if (item.content && (item.content.length > 1500 || subs.some((s) => s.sendMode === 'telegraph'))) {
        try {
          telegraphUrl = await createTelegraphPage({
            title: item.title,
            contentHtml: item.content,
            authorName: parsedFeed.title,
            authorUrl: item.link,
          });
        } catch {
          // Continue without Telegraph if service fails
        }
      }

      for (const sub of subs) {
        if (!matchesFilter(item, sub.filterInclude, sub.filterExclude)) {
          continue;
        }

        const formatted = formatPost(item, sub.customTitle || parsedFeed.title, {
          sendMode: sub.sendMode,
          telegraphUrl,
        });

        await deliverItemToSubscriber({
          sub,
          formatted,
          originalUrl: item.link,
          title: item.title,
          performer: parsedFeed.title,
        });
      }
    }

    return { feedUrl, newItemsCount, error: null };
  } catch (err) {
    const errorMsg = err.message || 'Unknown polling error';
    await db.update(feedStates)
      .set({ lastCheckedAt: new Date(), lastError: errorMsg })
      .where(eq(feedStates.feedUrl, feedUrl))
      .run();
    return { feedUrl, newItemsCount: 0, error: errorMsg };
  }
}

/**
 * Automatically migrate legacy mirror feed URLs to canonical Telegram channel URLs.
 */
export async function migrateLegacySubscriptions() {
  try {
    const allSubs = await db.select().from(subscriptions).all();
    for (const s of allSubs) {
      if (s.feedUrl.includes('tg.i-c-a.su/rss/') || s.feedUrl.includes('/telegram/channel/')) {
        const username = extractChannelUsername(s.feedUrl);
        if (username) {
          const canonicalUrl = getCanonicalChannelUrl(username);

          // Update subscription
          await db.update(subscriptions)
            .set({ feedUrl: canonicalUrl })
            .where(eq(subscriptions.id, s.id))
            .run();

          // Migrate feedStates if exists
          const oldState = await db.select().from(feedStates).where(eq(feedStates.feedUrl, s.feedUrl)).get();
          if (oldState) {
            await db.insert(feedStates).values({
              feedUrl: canonicalUrl,
              title: oldState.title,
              lastCheckedAt: oldState.lastCheckedAt,
              errorCount: 0,
            }).onConflictDoUpdate({
              target: feedStates.feedUrl,
              set: {
                title: oldState.title,
                lastCheckedAt: oldState.lastCheckedAt,
              },
            }).run();

            await db.delete(feedStates).where(eq(feedStates.feedUrl, s.feedUrl)).run();
          }

          // Migrate feedEntries
          await db.update(feedEntries)
            .set({ feedUrl: canonicalUrl })
            .where(eq(feedEntries.feedUrl, s.feedUrl))
            .run();
        }
      }
    }
  } catch {
    // Ignore migration failures
  }
}

/**
 * Poll all active feeds registered across subscriptions.
 * @returns {Promise<Array<{feedUrl: string, newItemsCount: number, error: string|null}>>}
 */
export async function pollAllFeeds() {
  // Migrate any legacy subscriptions on poll
  await migrateLegacySubscriptions();

  // Get all unique feed URLs from active subscriptions
  const activeSubs = await db.select({ feedUrl: subscriptions.feedUrl })
    .from(subscriptions)
    .where(eq(subscriptions.paused, false))
    .groupBy(subscriptions.feedUrl)
    .all();

  const results = [];
  for (const row of activeSubs) {
    const res = await pollSingleFeed(row.feedUrl);
    results.push(res);
  }

  return results;
}

/**
 * Force deliver the latest item(s) from a feed regardless of seen status.
 * @param {string} feedUrl
 * @param {number} chatId
 * @param {number} [count]
 * @returns {Promise<{title: string, sentCount: number, error: string|null}>}
 */
export async function forcePollFeed(feedUrl, chatId, count = 1) {
  if (isTelegramChannelUrl(feedUrl)) {
    try {
      const channelUsername = extractChannelUsername(feedUrl);
      const data = await fetchChannelData(channelUsername);
      const posts = (data.posts || []).slice(-count);
      if (posts.length === 0) {
        return { title: data.channelTitle, sentCount: 0, error: null };
      }

      const sub = (await db.select()
        .from(subscriptions)
        .where(and(eq(subscriptions.chatId, chatId), eq(subscriptions.feedUrl, feedUrl)))
        .get()) || { chatId, sendMode: 'default', customTitle: null };

      let sentCount = 0;
      for (const post of posts) {
        const formatted = formatChannelPost(post, sub?.customTitle || data.channelTitle, {
          sendMode: sub?.sendMode,
          customTitle: sub?.customTitle,
        });

        await deliverItemToSubscriber({
          sub,
          formatted,
          originalUrl: post.url,
          title: post.id ? `Post #${post.id}` : undefined,
          performer: data.channelTitle,
        });
        sentCount++;
      }

      return { title: data.channelTitle, sentCount, error: null };
    } catch (err) {
      return { title: feedUrl, sentCount: 0, error: err.message };
    }
  }

  try {
    const headers = {
      'User-Agent': USER_AGENT,
      'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, application/json, */*',
    };

    const res = await fetch(feedUrl, { headers });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const rawText = await res.text();
    const parsedFeed = parseFeed(rawText);

    const items = (parsedFeed.items || []).slice(0, count);
    if (items.length === 0) {
      return { title: parsedFeed.title, sentCount: 0, error: null };
    }

    const sub = (await db.select()
      .from(subscriptions)
      .where(and(eq(subscriptions.chatId, chatId), eq(subscriptions.feedUrl, feedUrl)))
      .get()) || { chatId, sendMode: 'default', customTitle: null };

    let sentCount = 0;
    for (const item of items) {
      let telegraphUrl = null;
      if (item.content && (item.content.length > 1500 || sub?.sendMode === 'telegraph')) {
        try {
          telegraphUrl = await createTelegraphPage({
            title: item.title,
            contentHtml: item.content,
            authorName: parsedFeed.title,
            authorUrl: item.link,
          });
        } catch {
          // Fallback to regular message
        }
      }

      const formatted = formatPost(item, sub?.customTitle || parsedFeed.title, {
        sendMode: sub?.sendMode,
        telegraphUrl,
      });

      await deliverItemToSubscriber({
        sub,
        formatted,
        originalUrl: item.link,
        title: item.title,
        performer: parsedFeed.title,
      });
      sentCount++;
    }

    return { title: parsedFeed.title, sentCount, error: null };
  } catch (err) {
    return { title: feedUrl, sentCount: 0, error: err.message };
  }
}
