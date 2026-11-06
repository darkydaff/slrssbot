import { db, EndpointError } from 'sdk';
import { eq, and, sql } from 'sdk/db';
import { feedEntries, userArticleStates, subscriptions, feedStates } from '../schema.js';
import { decodeEntities, cleanArticleContent } from '../lib/formatter.js';
import { isTeaserContent, fetchAndExtractArticle } from '../lib/article_extractor.js';

export default async function (input, ctx) {
  const user = ctx.initData?.user;
  if (!user?.id) {
    throw new EndpointError('Authentication required', { code: 'UNAUTHORIZED' });
  }

  const userId = user.id;
  const articleId = parseInt(input?.articleId, 10);
  if (!articleId) {
    throw new EndpointError('Invalid article ID', { code: 'INVALID_INPUT' });
  }

  const article = await db.select().from(feedEntries).where(eq(feedEntries.id, articleId)).get();
  if (!article) {
    throw new EndpointError('Article not found', { code: 'NOT_FOUND' });
  }

  // Auto-mark article as read safely without race condition crashes
  try {
    const existingState = await db.select()
      .from(userArticleStates)
      .where(and(eq(userArticleStates.userId, userId), eq(userArticleStates.entryId, articleId)))
      .get();

    if (existingState) {
      if (!existingState.isRead) {
        await db.update(userArticleStates)
          .set({ isRead: true, readAt: new Date() })
          .where(eq(userArticleStates.id, existingState.id))
          .run();
      }
    } else {
      await db.insert(userArticleStates).values({
        userId,
        entryId: articleId,
        isRead: true,
        isStarred: false,
        readAt: new Date(),
      }).onConflictDoNothing().run();
    }
  } catch (err) {
    console.warn('[get_article] auto-mark read error:', err?.message);
  }

  // Get feed info
  const sub = await db.select()
    .from(subscriptions)
    .where(and(eq(subscriptions.chatId, userId), eq(subscriptions.feedUrl, article.feedUrl)))
    .get();

  const state = await db.select()
    .from(feedStates)
    .where(eq(feedStates.feedUrl, article.feedUrl))
    .get();

  const feedTitle = decodeEntities(sub?.customTitle || state?.title || article.feedUrl);

  let rawContent = article.content || article.summary || '';
  let rawTitle = article.title || 'Untitled';
  let rawAuthor = article.author || '';
  let rawLeadImg = article.leadImageUrl || null;

  // On-demand full article extraction from original link if missing or a teaser snippet
  const isTeaser = !rawContent || rawContent.length < 500 || isTeaserContent(rawContent);
  if (isTeaser && article.link) {
    try {
      const extracted = await fetchAndExtractArticle(article.link);
      if (extracted?.contentHtml && extracted.contentHtml.length > rawContent.length) {
        rawContent = extracted.contentHtml;
        if (extracted.title && (rawTitle === 'Untitled' || !rawTitle)) {
          rawTitle = extracted.title;
        }
        if (extracted.author && !rawAuthor) {
          rawAuthor = extracted.author;
        }
        if (extracted.leadImage && !rawLeadImg) {
          rawLeadImg = extracted.leadImage;
        }

        // Persist full article into SQLite for instant subsequent views
        await db.update(feedEntries)
          .set({
            content: rawContent,
            title: rawTitle,
            author: rawAuthor,
            leadImageUrl: rawLeadImg,
          })
          .where(eq(feedEntries.id, article.id))
          .run();
      }
    } catch (err) {
      console.warn('[get_article] on-demand extraction failed:', err?.message);
    }
  }

  // Clean marketing widgets, hidden attributes, and promotional footers (e.g. 9to5Google subscription gates)
  rawContent = cleanArticleContent(rawContent);

  // If the cleaned content differs from the stored content, update SQLite so future reads are instantaneous
  if (rawContent !== article.content && rawContent.length > 300) {
    try {
      await db.update(feedEntries)
        .set({ content: rawContent })
        .where(eq(feedEntries.id, article.id))
        .run();
    } catch {}
  }

  // Safely decode entities in content while preserving HTML tags
  const cleanContent = rawContent
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (match, dec) => {
      const num = Number(dec);
      if (num === 38) return '&amp;';
      if (num === 60) return '&lt;';
      if (num === 62) return '&gt;';
      return String.fromCharCode(num);
    })
    .replace(/&#x([0-9a-fA-F]+);/gi, (match, hex) => {
      const num = parseInt(hex, 16);
      if (num === 38) return '&amp;';
      if (num === 60) return '&lt;';
      if (num === 62) return '&gt;';
      return String.fromCharCode(num);
    });

  const normalizeTimestamp = (ts) => {
    if (!ts) return null;
    if (ts instanceof Date) return ts.toISOString();
    if (typeof ts === 'number') {
      return new Date(ts < 1e11 ? ts * 1000 : ts).toISOString();
    }
    const num = Number(ts);
    if (!isNaN(num) && /^\d+$/.test(String(ts).trim())) {
      return new Date(num < 1e11 ? num * 1000 : num).toISOString();
    }
    const d = new Date(ts);
    return isNaN(d.getTime()) ? null : d.toISOString();
  };

  // Get up-to-date star state
  const finalState = await db.select()
    .from(userArticleStates)
    .where(and(eq(userArticleStates.userId, userId), eq(userArticleStates.entryId, articleId)))
    .get();

  return {
    article: {
      id: article.id,
      feedUrl: article.feedUrl,
      feedTitle,
      title: decodeEntities(rawTitle || 'Untitled'),
      link: article.link || '',
      author: decodeEntities(rawAuthor || feedTitle),
      summary: decodeEntities(article.summary || ''),
      content: cleanContent,
      leadImageUrl: rawLeadImg || null,
      media: article.media || [],
      telegraphUrl: article.telegraphUrl || null,
      publishedAt: normalizeTimestamp(article.publishedAt),
      createdAt: normalizeTimestamp(article.createdAt),
      isRead: true,
      isStarred: Boolean(finalState?.isStarred),
    },
  };
}

