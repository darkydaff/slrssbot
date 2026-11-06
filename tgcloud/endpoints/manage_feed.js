import { db, EndpointError } from 'sdk';
import { eq, and } from 'sdk/db';
import { subscriptions, feedStates, feedEntries, chatSettings } from '../schema.js';
import { discoverAndParseFeed } from '../lib/feed_finder.js';
import { pollSingleFeed } from '../lib/poller.js';
import { extractCleanSummary } from '../lib/formatter.js';
import { normalizeLanguageCode } from '../lib/i18n.js';
import { parseOpml, generateOpml } from '../lib/opml.js';

export default async function (input, ctx) {
  const user = ctx.initData?.user;
  if (!user?.id) {
    throw new EndpointError('Authentication required', { code: 'UNAUTHORIZED' });
  }

  const userId = user.id;
  const action = input?.action;

  // 1. Subscribe
  if (action === 'subscribe') {
    const rawUrl = String(input?.url || '').trim();
    if (!rawUrl) {
      throw new EndpointError('Please provide a valid feed URL or @channel handle', { code: 'INVALID_URL' });
    }

    try {
      const discovery = await discoverAndParseFeed(rawUrl);
      const feedUrl = discovery.feedUrl;
      const parsedFeed = discovery.feed;

      // Check if already subscribed
      const existing = await db.select()
        .from(subscriptions)
        .where(and(eq(subscriptions.chatId, userId), eq(subscriptions.feedUrl, feedUrl)))
        .get();

      if (existing) {
        throw new EndpointError('You are already subscribed to this feed', { code: 'ALREADY_SUBSCRIBED' });
      }

      // Save feed state
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

      // Store initial items with full content so reader has them ready immediately
      const items = (parsedFeed.items || []).slice(0, 30);
      for (const item of items) {
        const guid = item.guid || item.link || item.title;
        if (guid) {
          const itemBody = item.content || item.description || '';
          const itemSummary = extractCleanSummary(itemBody);
          const itemLeadImg = item.imageUrl || item.enclosure?.url || (item.media?.find((m) => m.type?.startsWith('image') || /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(m.url))?.url) || null;

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
      const customTitle = input?.customTitle ? String(input.customTitle).trim() : parsedFeed.title;
      const sendMode = input?.sendMode || 'default';
      const category = input?.category ? String(input.category).trim() : 'General';

      await db.insert(subscriptions).values({
        chatId: userId,
        feedUrl,
        customTitle,
        category,
        sendMode,
      }).run();

      return {
        success: true,
        feed: {
          feedUrl,
          title: customTitle,
          category,
          serverTitle: parsedFeed.title,
          description: parsedFeed.description || null,
          itemCount: items.length,
        },
      };
    } catch (err) {
      if (err instanceof EndpointError) throw err;
      throw new EndpointError(err.message || 'Failed to discover or subscribe to feed', { code: 'DISCOVERY_FAILED' });
    }
  }

  // 2. Update Feed
  if (action === 'update') {
    const feedUrl = String(input?.feedUrl || '').trim();
    if (!feedUrl) {
      throw new EndpointError('Missing feedUrl', { code: 'INVALID_INPUT' });
    }

    const sub = await db.select()
      .from(subscriptions)
      .where(and(eq(subscriptions.chatId, userId), eq(subscriptions.feedUrl, feedUrl)))
      .get();

    if (!sub) {
      throw new EndpointError('Subscription not found', { code: 'NOT_FOUND' });
    }

    const updateFields = {};
    if (typeof input?.customTitle === 'string') updateFields.customTitle = input.customTitle.trim();
    if (typeof input?.category === 'string') updateFields.category = input.category.trim() || 'General';
    if (typeof input?.sendMode === 'string') updateFields.sendMode = input.sendMode;
    if (typeof input?.paused === 'boolean') updateFields.paused = input.paused;

    if (Object.keys(updateFields).length > 0) {
      await db.update(subscriptions)
        .set(updateFields)
        .where(eq(subscriptions.id, sub.id))
        .run();
    }

    return { success: true };
  }

  // 3. Unsubscribe
  if (action === 'unsubscribe') {
    const feedUrl = String(input?.feedUrl || '').trim();
    if (!feedUrl) {
      throw new EndpointError('Missing feedUrl', { code: 'INVALID_INPUT' });
    }

    await db.delete(subscriptions)
      .where(and(eq(subscriptions.chatId, userId), eq(subscriptions.feedUrl, feedUrl)))
      .run();

    return { success: true };
  }

  // 4. Refresh Single Feed or All Feeds
  if (action === 'refresh') {
    const feedUrl = String(input?.feedUrl || '').trim();
    if (feedUrl) {
      const outcome = await pollSingleFeed(feedUrl);
      return { success: true, outcome };
    }

    // Refresh all user's feeds
    const userSubs = await db.select()
      .from(subscriptions)
      .where(and(eq(subscriptions.chatId, userId), eq(subscriptions.paused, false)))
      .all();

    const results = [];
    for (const sub of userSubs) {
      try {
        const res = await pollSingleFeed(sub.feedUrl);
        results.push(res);
      } catch (err) {
        results.push({ feedUrl: sub.feedUrl, error: err.message });
      }
    }

    return { success: true, results };
  }

  // 5. Change User Language Preference
  if (action === 'set_lang') {
    const rawLang = String(input?.lang || 'auto').trim();
    const saveLang = rawLang === 'auto' ? 'auto' : normalizeLanguageCode(rawLang);

    await db.insert(chatSettings).values({
      chatId: userId,
      lang: saveLang,
    }).onConflictDoUpdate({
      target: chatSettings.chatId,
      set: { lang: saveLang },
    }).run();

    return { success: true, lang: saveLang };
  }

  // 6. Generate or Get External Sync API Key
  if (action === 'generate_api_key' || action === 'get_api_key') {
    let setting = await db.select()
      .from(chatSettings)
      .where(eq(chatSettings.chatId, userId))
      .get();

    if (!setting?.apiKey || action === 'generate_api_key') {
      const newKey = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
      await db.insert(chatSettings).values({
        chatId: userId,
        apiKey: newKey,
      }).onConflictDoUpdate({
        target: chatSettings.chatId,
        set: { apiKey: newKey },
      }).run();
      return { success: true, apiKey: newKey };
    }

    return { success: true, apiKey: setting.apiKey };
  }

  // 7. Export OPML Document
  if (action === 'export_opml') {
    const userSubs = await db.select()
      .from(subscriptions)
      .where(eq(subscriptions.chatId, userId))
      .all();

    const allStates = await db.select().from(feedStates).all();
    const stateMap = new Map(allStates.map((s) => [s.feedUrl, s]));

    const feedList = (userSubs || []).map((sub) => {
      const state = stateMap.get(sub.feedUrl);
      return {
        title: sub.customTitle || state?.title || sub.feedUrl,
        feedUrl: sub.feedUrl,
        siteUrl: state?.siteUrl || null,
        category: sub.category || 'General',
      };
    });

    const opmlXml = generateOpml(feedList, `RSS Subscriptions - User ${userId}`);
    return { success: true, opmlXml, count: feedList.length };
  }

  // 8. Import OPML Document
  if (action === 'import_opml') {
    const xml = String(input?.opmlXml || '').trim();
    if (!xml) {
      throw new EndpointError('Missing opmlXml', { code: 'INVALID_INPUT' });
    }

    const feeds = parseOpml(xml);
    if (feeds.length === 0) {
      throw new EndpointError('No valid RSS feeds found in OPML', { code: 'EMPTY_OPML' });
    }

    let importedCount = 0;
    for (const item of feeds) {
      try {
        const existing = await db.select()
          .from(subscriptions)
          .where(and(eq(subscriptions.chatId, userId), eq(subscriptions.feedUrl, item.xmlUrl)))
          .get();

        if (!existing) {
          await db.insert(subscriptions).values({
            chatId: userId,
            feedUrl: item.xmlUrl,
            customTitle: item.title || item.xmlUrl,
            category: item.category || 'General',
            sendMode: 'default',
          }).run();
          importedCount++;
        }
      } catch (err) {
        console.warn(`[import_opml] Skipped ${item.xmlUrl}: ${err.message}`);
      }
    }

    return { success: true, totalParsed: feeds.length, importedCount };
  }

  throw new EndpointError(`Unknown action: ${action}`, { code: 'UNKNOWN_ACTION' });
}

