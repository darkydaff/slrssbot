/**
 * Feed Differential Engine & Broadcast Worker for Telegram Serverless.
 */

import { db, api, fetch, BotApiError } from 'sdk';
import { eq, and, sql, desc } from 'sdk/db';
import { subscriptions, feedStates, feedEntries } from '../schema.js';
import { parseFeed } from './rss.js';
import { formatPost, formatChannelPost, matchesFilter, truncate, extractCleanSummary, decodeEntities, cleanArticleContent } from './formatter.js';
import { getChatLanguage } from './i18n.js';
import { createTelegraphPage, editTelegraphPage } from './telegraph.js';
import { isTeaserContent, fetchAndExtractArticle } from './article_extractor.js';
import { parseUrl } from './feed_finder.js';
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
async function deliverItemToSubscriber({ sub, formatted, originalUrl, title, performer, isChannelPost = false }) {
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

    // 2. Video delivery (Telegram channel post with video or RSS video enclosure)
    if (formatted.videoUrl && sub.sendMode !== 'link_only') {
      try {
        const caption = truncate(formatted.text, 1020);
        await api.sendVideo({
          chat_id: sub.chatId,
          video: formatted.videoUrl,
          caption,
          parse_mode: 'HTML',
          reply_markup: formatted.replyMarkup,
        });
        return;
      } catch (err) {
        console.warn('[deliverItemToSubscriber] sendVideo failed, falling back to photo/text:', err.message);
        // Fall back to photo or text
      }
    }

    // 3. Photo Album or Single Photo:
    // Only send as photos/albums if:
    //  a) It's a Telegram channel post with photos, OR
    //  b) The user explicitly set sendMode: 'photo' in settings
    // For standard RSS feeds (Substack, blogs, news), default mode ALWAYS uses text + link preview
    // so Telegram generates the native ⚡ Instant View reader button!
    const sendAsMedia = (isChannelPost && formatted.photos && formatted.photos.length > 0) || (sub.sendMode === 'photo');

    if (sendAsMedia && sub.sendMode !== 'link_only') {
      // 2a. Multi-photo album (media group of 2-10 photos)
      if (formatted.photos && formatted.photos.length > 1) {
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

      // 2b. Single photo with caption
      if (formatted.photoUrl) {
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
    }

    // 3. Default / Instant View mode:
    // Clean text message with rich link preview.
    // Telegram's servers automatically parse Substack, Medium, WordPress, etc.
    // and render the native ⚡ Instant View button directly inside Telegram!
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
      description: channelData.channelDescription || null,
      siteUrl: channelData.channelUrl || null,
      lastCheckedAt: new Date(),
      lastError: null,
      errorCount: 0,
    }).onConflictDoUpdate({
      target: feedStates.feedUrl,
      set: {
        title: channelTitle,
        description: channelData.channelDescription || null,
        siteUrl: channelData.channelUrl || null,
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

      const boldMatch = (post.textHtml || '').match(/<b>(.*?)<\/b>/i);
      const firstLine = (post.plainText || '').split('\n')[0].trim();
      let pageTitle = channelTitle;
      if (boldMatch && boldMatch[1]) {
        pageTitle = decodeEntities(boldMatch[1].replace(/<[^>]+>/g, '')).trim().slice(0, 100);
      } else if (firstLine && firstLine.length > 5 && firstLine.length < 100) {
        pageTitle = decodeEntities(firstLine);
      } else if (post.id) {
        pageTitle = `${channelTitle} #${post.id}`;
      }
      pageTitle = decodeEntities(pageTitle);

      const mediaItems = [];
      if (post.photos && post.photos.length > 0) {
        for (const p of post.photos) {
          mediaItems.push({ url: p, type: 'image' });
        }
      }
      if (post.videoUrl) {
        mediaItems.push({ url: post.videoUrl, type: 'video' });
      }

      const summaryText = extractCleanSummary(post.plainText || post.textHtml || '');
      const contentHtml = post.textHtml || `<p>${post.plainText || ''}</p>`;
      const leadImg = post.photos?.[0] || post.photoUrl || null;

      if (existing) {
        // Backfill data if empty or if previously corrupted or has unescaped entities
        const currentContent = existing.content || '';
        const currentTitle = existing.title || '';
        const hasEntities = currentTitle.includes('&quot;') || currentTitle.includes('&#') || currentContent.includes('&#');
        const isCorrupted = Boolean(
          (post.replyTo && post.replyTo.text && currentContent.includes(post.replyTo.text)) ||
          existing.content !== contentHtml ||
          existing.leadImageUrl !== leadImg ||
          existing.title !== pageTitle ||
          hasEntities
        );
        if (!existing.title || !existing.content || isCorrupted) {
          await db.update(feedEntries)
            .set({
              title: pageTitle,
              link: post.url,
              author: channelTitle,
              summary: summaryText,
              content: contentHtml,
              leadImageUrl: leadImg,
              media: mediaItems,
            })
            .where(eq(feedEntries.id, existing.id))
            .run();
        }
        continue;
      }

      // Check if channel post is eligible for Telegraph Instant View:
      // Channel posts only generate Telegraph if:
      // 1) The subscriber explicitly selected 'telegraph' mode, OR
      // 2) The post text exceeds single message limits (>1200 chars without video, or >1020 chars with video)
      let telegraphUrl = null;
      const textLen = (post.plainText || '').length;
      const shouldGenerateTelegraph = subs.some((s) => s.sendMode === 'telegraph') ||
        (textLen > 1200 && !post.videoUrl) ||
        (textLen > 1020 && post.videoUrl);

      if (shouldGenerateTelegraph) {
        try {
          let postContentHtml = '';
          if (post.photos && post.photos.length > 0) {
            for (const pUrl of post.photos) {
              postContentHtml += `<figure><img src="${pUrl}"/></figure>`;
            }
          }
          if (post.replyTo) {
            const replyTitle = post.replyTo.author ? `In reply to ${post.replyTo.author}` : 'In reply to post';
            postContentHtml += `<blockquote>${replyTitle} (<a href="${post.replyTo.url}">view</a>): ${escapeHtml(post.replyTo.text || '')}</blockquote>`;
          }
          postContentHtml += post.textHtml || `<p>${post.plainText || ''}</p>`;
          if (post.forwardedFrom) {
            const fLink = post.forwardedFrom.url
              ? `<a href="${post.forwardedFrom.url}">${post.forwardedFrom.name}</a>`
              : post.forwardedFrom.name;
            postContentHtml += `<blockquote>Forwarded from ${fLink}</blockquote>`;
          }
          postContentHtml += `<p><hr><a href="${post.url}">Original message on Telegram</a></p>`;

          telegraphUrl = await createTelegraphPage({
            title: pageTitle,
            contentHtml: postContentHtml,
            authorName: channelTitle,
            authorUrl: post.url,
            leadImageUrl: leadImg,
            dbInstance: db,
          });
          console.log('[pollSingleTelegramChannel] Generated telegraphUrl:', telegraphUrl);
        } catch (err) {
          console.error('[pollSingleTelegramChannel] createTelegraphPage error:', err.message);
          // Fallback to regular delivery
        }
      }

      // Record entry as processed with all metadata
      await db.insert(feedEntries).values({
        feedUrl,
        entryGuid: guid,
        title: pageTitle,
        link: post.url,
        author: channelTitle,
        summary: summaryText,
        content: contentHtml,
        leadImageUrl: leadImg,
        media: mediaItems,
        telegraphUrl,
        publishedAt: post.pubDate || new Date(),
      }).onConflictDoNothing().run();

      newItemsCount++;

      // Broadcast to subscribers
      for (const sub of subs) {
        if (!matchesFilter({ title: '', content: post.plainText }, sub.filterInclude, sub.filterExclude)) {
          continue;
        }

        const subLang = await getChatLanguage(sub.chatId);
        const formatted = formatChannelPost(post, sub.customTitle || channelTitle, {
          sendMode: sub.sendMode,
          customTitle: sub.customTitle,
          telegraphUrl,
          lang: subLang,
        });

        await deliverItemToSubscriber({
          sub,
          formatted,
          originalUrl: telegraphUrl || post.url,
          title: post.id ? `Post #${post.id}` : undefined,
          performer: channelTitle,
          isChannelPost: true,
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

    // Check if any existing entries for this feed need backfilling (e.g. missing title/content/link or short teaser)
    const incomplete = await db.get(
      sql`SELECT count(*) AS c FROM feed_entries WHERE feed_url = ${feedUrl} AND (title IS NULL OR content IS NULL OR title = 'Untitled' OR link = '' OR length(content) < 500)`
    );
    const needsBackfill = incomplete && incomplete.c > 0;

    const headers = {
      'User-Agent': USER_AGENT,
      'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, application/json, */*',
    };

    // Only send caching headers if there are no incomplete entries needing backfill
    if (!needsBackfill) {
      if (state?.etag) {
        headers['If-None-Match'] = state.etag;
      }
      if (state?.lastModified) {
        headers['If-Modified-Since'] = state.lastModified;
      }
    }

    let res;
    try {
      res = await fetch(feedUrl, { headers });
    } catch (fetchErr) {
      const u = parseUrl(feedUrl);
      if (u && !u.hostname.startsWith('www.') && !u.hostname.includes('t.me')) {
        const fallbackUrl = feedUrl.replace('://', '://www.');
        res = await fetch(fallbackUrl, { headers });
      } else {
        throw fetchErr;
      }
    }

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
      description: parsedFeed.description || null,
      siteUrl: parsedFeed.link || null,
      etag,
      lastModified,
      lastCheckedAt: new Date(),
      lastError: null,
      errorCount: 0,
    }).onConflictDoUpdate({
      target: feedStates.feedUrl,
      set: {
        title: parsedFeed.title,
        description: parsedFeed.description || null,
        siteUrl: parsedFeed.link || null,
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

      const existingNeedsEnrichment = existing && (
        !existing.title ||
        !existing.content ||
        existing.title === 'Untitled' ||
        !existing.link ||
        existing.content.length < 500 ||
        isTeaserContent(existing.content)
      );

      // If already processed and fully populated, skip
      if (existing && !existingNeedsEnrichment) {
        continue;
      }

      // Telegraph generation logic with full-text article extraction for teasers (e.g. 9to5Google, WordPress)
      let telegraphUrl = null;
      let articleBody = item.content || item.description || '';
      let articleAuthor = item.author || parsedFeed.title;
      let articleTitle = item.title;
      let articleLeadImage = item.imageUrl || item.enclosure?.url || null;

      // If the RSS feed content itself is a teaser/snippet or under 800 chars, extract full text from item.link.
      // If the RSS feed already provided substantive content (e.g. 404 Media has 7KB+ text), use it directly.
      const isTeaser = isTeaserContent(articleBody) || articleBody.length < 800;
      const shouldExtract = item.link && (isTeaser || subs.some((s) => s.sendMode === 'telegraph'));

      if (shouldExtract) {
        try {
          const extracted = await fetchAndExtractArticle(item.link);
          if (extracted?.contentHtml && extracted.contentHtml.length > articleBody.length) {
            articleBody = extracted.contentHtml;
            if (extracted.author) articleAuthor = extracted.author;
            if (extracted.title) articleTitle = extracted.title;
          }
          if (extracted?.leadImage && !articleLeadImage) {
            articleLeadImage = extracted.leadImage;
          }
        } catch {
          // Fall back to feed content
        }
      }

      const itemSummary = extractCleanSummary(articleBody || item.description || item.content || '');
      let itemContent = cleanArticleContent(articleBody || item.content || item.description || '');
      const itemLeadImg = articleLeadImage || item.imageUrl || item.enclosure?.url || (item.media?.find(m => m.type?.startsWith('image') || /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(m.url))?.url) || null;
      const itemMedia = item.media || [];

      if (existing) {
        let updatedTelegraphUrl = existing.telegraphUrl;
        if (existing.telegraphUrl && articleBody && articleBody.length > 500) {
          try {
            const newUrl = await editTelegraphPage({
              pagePathOrUrl: existing.telegraphUrl,
              title: articleTitle || item.title || existing.title,
              contentHtml: articleBody,
              authorName: articleAuthor || existing.author,
              authorUrl: item.link,
              leadImageUrl: itemLeadImg,
              dbInstance: db,
            });
            if (newUrl) updatedTelegraphUrl = newUrl;
          } catch (tErr) {
            console.warn('[pollSingleFeed] backfill editTelegraphPage failed:', tErr?.message);
          }
        }

        // Backfill existing entry in DB so the Mini App displays full title, links, and text
        await db.update(feedEntries)
          .set({
            title: articleTitle || item.title || existing.title || 'Untitled',
            link: item.link || existing.link || '',
            author: articleAuthor || existing.author || '',
            summary: itemSummary || existing.summary || '',
            content: itemContent || existing.content || '',
            leadImageUrl: itemLeadImg || existing.leadImageUrl || null,
            telegraphUrl: updatedTelegraphUrl,
            media: (itemMedia && itemMedia.length > 0) ? itemMedia : existing.media,
          })
          .where(eq(feedEntries.id, existing.id))
          .run();
        continue;
      }

      // Generate Telegraph page if content is substantive (>800 chars) or requested by subscriber
      if (articleBody && (articleBody.length > 800 || subs.some((s) => s.sendMode === 'telegraph' || s.sendMode === 'instant_view'))) {
        try {
          telegraphUrl = await createTelegraphPage({
            title: articleTitle,
            contentHtml: articleBody,
            authorName: articleAuthor,
            authorUrl: item.link,
            leadImageUrl: articleLeadImage,
            dbInstance: db,
          });
          console.log('[pollSingleFeed] Generated telegraphUrl:', telegraphUrl);
          if (telegraphUrl) {
            try {
              const telContent = await fetchAndExtractArticle(telegraphUrl);
              if (telContent?.contentHtml && telContent.contentHtml.length > 500) {
                // Preserve podcast players, audio tags, and media iframes that Telegraph cannot host
                const mediaEmbeds = (itemContent || articleBody).match(/<iframe\b[^>]*src=["'][^"']*(?:megaphone|transistor|spotify|simplecast|podbean|buzzsprout|libsyn|anchor\.fm|youtube|vimeo)[^"']*["'][^>]*>[\s\S]*?<\/iframe>|<audio\b[\s\S]*?<\/audio>/gi);
                let enrichedHtml = telContent.contentHtml;
                if (mediaEmbeds) {
                  for (const embed of mediaEmbeds) {
                    if (!enrichedHtml.includes(embed)) {
                      enrichedHtml = embed + '\n' + enrichedHtml;
                    }
                  }
                }
                itemContent = enrichedHtml;
              }
            } catch {}
          }
        } catch (err) {
          console.error('[pollSingleFeed] createTelegraphPage error:', err.message);
          // Continue without Telegraph if service fails
        }
      }

      // Record entry as processed with full article content and metadata
      await db.insert(feedEntries).values({
        feedUrl,
        entryGuid: guid,
        title: articleTitle || item.title || 'Untitled',
        link: item.link || '',
        author: articleAuthor || '',
        summary: itemSummary,
        content: itemContent,
        leadImageUrl: itemLeadImg,
        media: itemMedia,
        telegraphUrl,
        publishedAt: item.pubDate || new Date(),
      }).onConflictDoNothing().run();

      newItemsCount++;

      // Broadcast to all subscribers
      for (const sub of subs) {
        if (!matchesFilter(item, sub.filterInclude, sub.filterExclude)) {
          continue;
        }

        const subLang = await getChatLanguage(sub.chatId);
        const formatted = formatPost(item, sub.customTitle || parsedFeed.title, {
          sendMode: sub.sendMode,
          telegraphUrl,
          lang: subLang,
        });

        await deliverItemToSubscriber({
          sub,
          formatted,
          originalUrl: telegraphUrl || item.link,
          title: item.title,
          performer: parsedFeed.title,
          isChannelPost: false,
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
    const legacySubs = await db.select()
      .from(subscriptions)
      .where(sql`${subscriptions.feedUrl} LIKE '%tg.i-c-a.su%' OR ${subscriptions.feedUrl} LIKE '%/telegram/channel/%'`)
      .all();

    if (!legacySubs || legacySubs.length === 0) {
      return;
    }

    for (const s of legacySubs) {
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
  } catch {
    // Ignore migration failures
  }
}

/**
 * Poll all active feeds registered across subscriptions.
 * Processes feeds in concurrent batches to prevent serverless execution timeouts.
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
  const BATCH_SIZE = 3;

  for (let i = 0; i < activeSubs.length; i += BATCH_SIZE) {
    const batch = activeSubs.slice(i, i + BATCH_SIZE);
    const settled = await Promise.allSettled(batch.map((row) => pollSingleFeed(row.feedUrl)));

    for (let j = 0; j < settled.length; j++) {
      const outcome = settled[j];
      if (outcome.status === 'fulfilled') {
        results.push(outcome.value);
      } else {
        results.push({
          feedUrl: batch[j].feedUrl,
          newItemsCount: 0,
          error: outcome.reason?.message || 'Polling error',
        });
      }
    }
  }

  return results;
}

/**
 * Force deliver the latest item(s) from a feed regardless of seen status.
 * Prioritizes local database storage to avoid redundant external network requests
 * and rate-limiting when the feed was already polled and stored.
 * @param {string} feedUrl
 * @param {number} chatId
 * @param {number} [count]
 * @returns {Promise<{title: string, sentCount: number, error: string|null}>}
 */
export async function forcePollFeed(feedUrl, chatId, count = 1) {
  const isChannel = isTelegramChannelUrl(feedUrl);

  const sub = (await db.select()
    .from(subscriptions)
    .where(and(eq(subscriptions.chatId, chatId), eq(subscriptions.feedUrl, feedUrl)))
    .get()) || { chatId, sendMode: 'default', customTitle: null };

  // 1. Try delivering directly from local storage if entries are already cached
  const storedEntries = await db.select()
    .from(feedEntries)
    .where(eq(feedEntries.feedUrl, feedUrl))
    .orderBy(desc(feedEntries.publishedAt), desc(feedEntries.id))
    .limit(count)
    .all();

  if (storedEntries.length > 0) {
    let sentCount = 0;
    const subLang = await getChatLanguage(chatId);
    // If count > 1, send oldest to newest
    const entriesToSend = [...storedEntries].reverse();

    for (const entry of entriesToSend) {
      let telegraphUrl = entry.telegraphUrl;
      const articleBody = entry.content || entry.summary || '';

      if (!telegraphUrl && articleBody && (articleBody.length > 800 || sub?.sendMode === 'telegraph' || sub?.sendMode === 'instant_view')) {
        try {
          telegraphUrl = await createTelegraphPage({
            title: entry.title,
            contentHtml: articleBody,
            authorName: entry.author || sub?.customTitle || 'Article',
            authorUrl: entry.link,
            leadImageUrl: entry.leadImageUrl,
            dbInstance: db,
          });
          // Cache telegraphUrl on entry
          await db.update(feedEntries)
            .set({ telegraphUrl })
            .where(eq(feedEntries.id, entry.id))
            .run();
        } catch (err) {
          console.warn('[forcePollFeed] createTelegraphPage error:', err.message);
        }
      }

      let formatted;
      if (isChannel) {
        const post = {
          id: entry.entryGuid ? parseInt(entry.entryGuid.split('/').pop(), 10) : null,
          channel: extractChannelUsername(feedUrl),
          url: entry.link,
          textHtml: entry.content,
          plainText: entry.summary,
          photos: Array.isArray(entry.media) ? entry.media.filter((m) => m.type === 'image').map((m) => m.url) : [],
          photoUrl: entry.leadImageUrl,
          hasVideo: Array.isArray(entry.media) && entry.media.some((m) => m.type === 'video'),
          videoUrl: Array.isArray(entry.media) ? entry.media.find((m) => m.type === 'video')?.url : null,
          forwardedFrom: null,
        };

        formatted = formatChannelPost(post, sub?.customTitle || entry.author || 'Channel', {
          sendMode: sub?.sendMode,
          customTitle: sub?.customTitle,
          telegraphUrl,
          lang: subLang,
        });
      } else {
        const item = {
          title: entry.title,
          link: entry.link,
          author: entry.author,
          content: entry.content,
          description: entry.summary,
          imageUrl: entry.leadImageUrl,
          media: entry.media || [],
          pubDate: entry.publishedAt,
        };

        formatted = formatPost(item, sub?.customTitle || entry.author || 'Feed', {
          sendMode: sub?.sendMode,
          telegraphUrl,
          lang: subLang,
        });
      }

      await deliverItemToSubscriber({
        sub,
        formatted,
        originalUrl: telegraphUrl || entry.link,
        title: entry.title,
        performer: entry.author,
        isChannelPost: isChannel,
      });
      sentCount++;
    }

    return { title: sub.customTitle || storedEntries[0]?.author || feedUrl, sentCount, error: null };
  }

  // 2. Fallback to network fetch if storage has no entries yet
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
        let telegraphUrl = null;
        const textLen = (post.plainText || '').length;
        const shouldGenerateTelegraph = sub?.sendMode === 'telegraph' ||
          (textLen > 1200 && !post.videoUrl) ||
          (textLen > 1020 && post.videoUrl);

        if (shouldGenerateTelegraph) {
          try {
            const boldMatch = (post.textHtml || '').match(/<b>(.*?)<\/b>/i);
            const firstLine = (post.plainText || '').split('\n')[0].trim();
            let pageTitle = data.channelTitle;
            if (boldMatch && boldMatch[1]) {
              pageTitle = boldMatch[1].replace(/<[^>]+>/g, '').trim().slice(0, 100);
            } else if (firstLine && firstLine.length > 10 && firstLine.length < 90) {
              pageTitle = firstLine;
            } else if (post.id) {
              pageTitle = `${data.channelTitle} #${post.id}`;
            }

            let postContentHtml = '';
            if (post.photos && post.photos.length > 0) {
              for (const pUrl of post.photos) {
                postContentHtml += `<figure><img src="${pUrl}"/></figure>`;
              }
            }
            if (post.replyTo) {
              const replyTitle = post.replyTo.author ? `In reply to ${post.replyTo.author}` : 'In reply to post';
              postContentHtml += `<blockquote>${replyTitle} (<a href="${post.replyTo.url}">view</a>): ${escapeHtml(post.replyTo.text || '')}</blockquote>`;
            }
            postContentHtml += post.textHtml || `<p>${post.plainText || ''}</p>`;
            if (post.forwardedFrom) {
              const fLink = post.forwardedFrom.url
                ? `<a href="${post.forwardedFrom.url}">${post.forwardedFrom.name}</a>`
                : post.forwardedFrom.name;
              postContentHtml += `<blockquote>Forwarded from ${fLink}</blockquote>`;
            }
            postContentHtml += `<p><hr><a href="${post.url}">Original message on Telegram</a></p>`;

            telegraphUrl = await createTelegraphPage({
              title: pageTitle,
              contentHtml: postContentHtml,
              authorName: data.channelTitle,
              authorUrl: post.url,
              leadImageUrl: post.photos?.[0] || post.photoUrl,
              dbInstance: db,
            });
          } catch {
            // Fallback
          }
        }

        const subLang = await getChatLanguage(chatId);
        const formatted = formatChannelPost(post, sub?.customTitle || data.channelTitle, {
          sendMode: sub?.sendMode,
          customTitle: sub?.customTitle,
          telegraphUrl,
          lang: subLang,
        });

        await deliverItemToSubscriber({
          sub,
          formatted,
          originalUrl: telegraphUrl || post.url,
          title: post.id ? `Post #${post.id}` : undefined,
          performer: data.channelTitle,
          isChannelPost: true,
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

    let res;
    try {
      res = await fetch(feedUrl, { headers });
    } catch (fetchErr) {
      const u = parseUrl(feedUrl);
      if (u && !u.hostname.startsWith('www.') && !u.hostname.includes('t.me')) {
        const fallbackUrl = feedUrl.replace('://', '://www.');
        res = await fetch(fallbackUrl, { headers });
      } else {
        throw fetchErr;
      }
    }
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
      let articleBody = item.content || item.description || '';
      let articleAuthor = item.author || parsedFeed.title;
      let articleTitle = item.title;
      let articleLeadImage = item.imageUrl || item.enclosure?.url || null;

      // Extract full text if teaser
      if (item.link && (isTeaserContent(articleBody) || (articleBody.length < 1500 && sub?.sendMode === 'telegraph'))) {
        try {
          const extracted = await fetchAndExtractArticle(item.link);
          if (extracted?.contentHtml && extracted.contentHtml.length > articleBody.length) {
            articleBody = extracted.contentHtml;
            if (extracted.author) articleAuthor = extracted.author;
            if (extracted.title) articleTitle = extracted.title;
          }
          if (extracted?.leadImage && !articleLeadImage) {
            articleLeadImage = extracted.leadImage;
          }
        } catch {
          // Fallback
        }
      }

      if (articleBody && (articleBody.length > 800 || sub?.sendMode === 'telegraph' || sub?.sendMode === 'instant_view')) {
        try {
          telegraphUrl = await createTelegraphPage({
            title: articleTitle,
            contentHtml: articleBody,
            authorName: articleAuthor,
            authorUrl: item.link,
            leadImageUrl: articleLeadImage,
            dbInstance: db,
          });
          console.log('[forcePollFeed] Successfully generated telegraphUrl:', telegraphUrl);
        } catch (err) {
          console.error('[forcePollFeed] createTelegraphPage error:', err.message);
          // Fallback to regular message
        }
      }

      const subLang = await getChatLanguage(chatId);
      const formatted = formatPost(item, sub?.customTitle || parsedFeed.title, {
        sendMode: sub?.sendMode,
        telegraphUrl,
        lang: subLang,
      });

      await deliverItemToSubscriber({
        sub,
        formatted,
        originalUrl: telegraphUrl || item.link,
        title: item.title,
        performer: parsedFeed.title,
        isChannelPost: false,
      });
      sentCount++;
    }

    return { title: parsedFeed.title, sentCount, error: null };
  } catch (err) {
    return { title: feedUrl, sentCount: 0, error: err.message };
  }
}
