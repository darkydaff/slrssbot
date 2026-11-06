import { db, EndpointError } from 'sdk';
import { eq, and } from 'sdk/db';
import { subscriptions, feedStates, feedEntries, chatSettings } from '../schema.js';
import { discoverAndParseFeed } from '../lib/feed_finder.js';
import { pollSingleFeed } from '../lib/poller.js';
import { extractCleanSummary } from '../lib/formatter.js';
import { normalizeLanguageCode } from '../lib/i18n.js';

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

      await db.insert(subscriptions).values({
        chatId: userId,
        feedUrl,
        customTitle,
        sendMode,
      }).run();

      return {
        success: true,
        feed: {
          feedUrl,
          title: customTitle,
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

  // 4. Refresh Single Feed
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

  throw new EndpointError(`Unknown action: ${action}`, { code: 'UNKNOWN_ACTION' });
}

