/**
 * handlers/inline_query.js — Handles Telegram inline queries (`@bot <query>`).
 * Allows users to search their subscribed RSS articles (or `#starred` items)
 * from any Telegram chat and share them with rich formatting and Instant View links.
 */

import { api, db } from 'sdk';
import { eq, sql } from 'sdk/db';
import { subscriptions, feedStates } from '../schema.js';
import { escapeHtml, decodeEntities, extractCleanSummary } from '../lib/formatter.js';
import { t, getChatLanguage } from '../lib/i18n.js';
import { recordUserActivity } from '../lib/metrics.js';

const PAGE_SIZE = 15;
const MAX_TERMS = 5;

/**
 * Check whether a string is a valid HTTP/HTTPS URL.
 * @param {string} url
 * @returns {boolean}
 */
export function isValidHttpUrl(url) {
  return typeof url === 'string' && /^https?:\/\/\S+$/i.test(url.trim());
}

/**
 * Parse an inline query string into filter flags and search terms.
 * Supports `#starred` / `starred:` prefix to filter starred articles.
 * @param {string} rawQuery
 * @returns {{ isStarredOnly: boolean, terms: string[] }}
 */
export function parseInlineQueryText(rawQuery) {
  const cleaned = (rawQuery || '').trim();
  if (!cleaned) {
    return { isStarredOnly: false, terms: [] };
  }

  let isStarredOnly = false;
  const rawTokens = cleaned.split(/\s+/);
  const terms = [];

  for (const token of rawTokens) {
    const lower = token.toLowerCase();
    if (lower === '#starred' || lower === 'starred:' || lower === 'is:starred') {
      isStarredOnly = true;
      continue;
    }
    const trimmed = token.slice(0, 64);
    if (trimmed) {
      terms.push(trimmed);
    }
    if (terms.length >= MAX_TERMS) break;
  }

  return { isStarredOnly, terms };
}

/**
 * Format a timestamp (unix seconds, ms, or ISO string) into a short YYYY-MM-DD label.
 * @param {number|string|Date|null} ts
 * @returns {string}
 */
function formatShortDate(ts) {
  if (!ts) return '';
  let d;
  if (ts instanceof Date) {
    d = ts;
  } else if (typeof ts === 'number') {
    d = new Date(ts < 1e11 ? ts * 1000 : ts);
  } else {
    const num = Number(ts);
    if (!Number.isNaN(num) && /^\d+$/.test(String(ts).trim())) {
      d = new Date(num < 1e11 ? num * 1000 : num);
    } else {
      d = new Date(ts);
    }
  }
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

/**
 * Convert an article row into a Telegram InlineQueryResultArticle object.
 * @param {object} row
 * @param {string} [lang='en']
 * @returns {object}
 */
export function formatInlineArticleResult(row, lang = 'en') {
  const feedTitle = decodeEntities(row.feedTitle || row.feed_url || 'RSS Feed');
  const rawTitle = decodeEntities(row.title || '');
  const cleanSummary = extractCleanSummary(decodeEntities(row.summary || ''), 280);

  let displayTitle = rawTitle && rawTitle !== 'Untitled'
    ? rawTitle
    : (cleanSummary ? cleanSummary.slice(0, 100) : `${feedTitle} item`);
  if (displayTitle.length > 120) {
    displayTitle = `${displayTitle.slice(0, 117).trim()}...`;
  }

  const link = isValidHttpUrl(row.link) ? row.link.trim() : '';
  const telegraphUrl = isValidHttpUrl(row.telegraphUrl || row.telegraph_url)
    ? (row.telegraphUrl || row.telegraph_url).trim()
    : '';
  const leadImageUrl = isValidHttpUrl(row.leadImageUrl || row.lead_image_url)
    ? (row.leadImageUrl || row.lead_image_url).trim()
    : '';
  const author = decodeEntities(row.author || '');
  const dateStr = formatShortDate(row.publishedAt ?? row.published_at ?? row.createdAt ?? row.created_at);

  const metaParts = [feedTitle];
  if (dateStr) metaParts.push(dateStr);
  const metaHeader = metaParts.join(' • ');
  const description = cleanSummary
    ? `${metaHeader} — ${cleanSummary}`.slice(0, 160)
    : metaHeader.slice(0, 160);

  const primaryUrl = telegraphUrl || link;
  const titleHtml = primaryUrl
    ? `<a href="${escapeHtml(primaryUrl)}"><b>${escapeHtml(displayTitle)}</b></a>`
    : `<b>${escapeHtml(displayTitle)}</b>`;

  const bylineParts = [`📡 <i>${escapeHtml(feedTitle)}</i>`];
  if (author && author.toLowerCase() !== feedTitle.toLowerCase()) {
    bylineParts.push(`<i>${escapeHtml(author)}</i>`);
  }
  if (dateStr) {
    bylineParts.push(`<i>${escapeHtml(dateStr)}</i>`);
  }

  const lines = [titleHtml, bylineParts.join(' • ')];
  if (cleanSummary) {
    lines.push('', escapeHtml(cleanSummary));
  }

  const actionLinks = [];
  if (telegraphUrl) {
    actionLinks.push(`⚡ <a href="${escapeHtml(telegraphUrl)}">${escapeHtml(t(lang, 'instant_view'))}</a>`);
  }
  if (link) {
    actionLinks.push(`🌐 <a href="${escapeHtml(link)}">${escapeHtml(t(lang, 'read_original'))}</a>`);
  }
  if (actionLinks.length > 0) {
    lines.push('', actionLinks.join('  |  '));
  }

  const keyboardButtons = [];
  if (telegraphUrl) {
    keyboardButtons.push({ text: t(lang, 'btn_instant_view'), url: telegraphUrl });
  }
  if (link) {
    keyboardButtons.push({ text: t(lang, 'btn_read_original'), url: link });
  }

  const result = {
    type: 'article',
    id: String(row.id),
    title: displayTitle,
    description,
    input_message_content: {
      message_text: lines.join('\n').slice(0, 4096),
      parse_mode: 'HTML',
    },
  };

  if (primaryUrl) {
    result.url = primaryUrl;
  }
  if (leadImageUrl) {
    result.thumbnail_url = leadImageUrl;
  }
  if (keyboardButtons.length > 0) {
    result.reply_markup = { inline_keyboard: [keyboardButtons] };
  }

  return result;
}

export default async function (inlineQuery, _ctx) {
  if (!inlineQuery?.id || !inlineQuery?.from?.id) return;

  const userId = inlineQuery.from.id;
  const offset = Math.max(parseInt(inlineQuery.offset, 10) || 0, 0);

  recordUserActivity({
    userId,
    chatType: 'inline',
    command: 'inline_query',
  }).catch(() => {});

  const lang = await getChatLanguage(userId, inlineQuery.from?.language_code);

  const userSubs = await db.select()
    .from(subscriptions)
    .where(eq(subscriptions.chatId, userId))
    .all();

  if (!userSubs || userSubs.length === 0) {
    try {
      await api.answerInlineQuery({
        inline_query_id: inlineQuery.id,
        results: [],
        cache_time: 10,
        is_personal: true,
        button: {
          text: t(lang, 'inline_add_subs_btn'),
          start_parameter: 'inline_sub',
        },
      });
    } catch (err) {
      console.warn('[inline_query] answerInlineQuery (empty subs) failed:', err.message);
    }
    return;
  }

  const allStates = await db.select().from(feedStates).all();
  const stateMap = new Map(allStates.map((s) => [s.feedUrl, s]));
  const subMap = new Map(userSubs.map((s) => [s.feedUrl, s]));

  const { isStarredOnly, terms } = parseInlineQueryText(inlineQuery.query);

  let whereClause = sql`fe.feed_url IN (SELECT feed_url FROM subscriptions WHERE chat_id = ${userId})`;

  if (isStarredOnly) {
    whereClause = sql`${whereClause} AND uas.is_starred = 1`;
  }

  for (const term of terms) {
    const pattern = `%${term}%`;
    whereClause = sql`${whereClause} AND (fe.title LIKE ${pattern} OR fe.summary LIKE ${pattern} OR fe.author LIKE ${pattern} OR fe.feed_url LIKE ${pattern})`;
  }

  const queryLimit = PAGE_SIZE + 1;
  const rows = await db.all(sql`
    SELECT
      fe.id,
      fe.feed_url,
      fe.title,
      fe.link,
      fe.author,
      fe.summary,
      fe.lead_image_url,
      fe.telegraph_url,
      fe.published_at,
      fe.created_at
    FROM feed_entries fe
    LEFT JOIN user_article_states uas ON uas.entry_id = fe.id AND uas.user_id = ${userId}
    WHERE ${whereClause}
    ORDER BY fe.published_at DESC, fe.id DESC
    LIMIT ${queryLimit} OFFSET ${offset}
  `);

  const hasMore = rows.length > PAGE_SIZE;
  const pageRows = hasMore ? rows.slice(0, PAGE_SIZE) : rows;

  const results = pageRows.map((r) => {
    const sub = subMap.get(r.feed_url);
    const state = stateMap.get(r.feed_url);
    const feedTitle = sub?.customTitle || state?.title || r.feed_url;
    return formatInlineArticleResult({ ...r, feedTitle }, lang);
  });

  const nextOffset = hasMore ? String(offset + PAGE_SIZE) : '';

  try {
    await api.answerInlineQuery({
      inline_query_id: inlineQuery.id,
      results,
      cache_time: 15,
      is_personal: true,
      ...(nextOffset ? { next_offset: nextOffset } : {}),
    });
  } catch (err) {
    console.warn('[inline_query] answerInlineQuery failed:', err.message);
  }
}

