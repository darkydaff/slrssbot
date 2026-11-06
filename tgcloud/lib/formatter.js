/**
 * Telegram Message Formatter and HTML Sanitizer for RSS feeds.
 * Ensures HTML conforms strictly to Telegram Bot API HTML parse mode.
 */

import { t } from './i18n.js';

/**
 * Escape raw text for Telegram HTML.
 * @param {string} text
 * @returns {string}
 */
export function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Decode common HTML entities.
 * Supports multi-pass decoding for double-escaped entities and all decimal/hex numeric entities.
 * @param {string} text
 * @returns {string}
 */
export function decodeEntities(text) {
  if (!text || typeof text !== 'string') return '';
  let str = text;
  for (let i = 0; i < 2; i++) {
    if (!str.includes('&')) break;
    str = str
      .replace(/&nbsp;/gi, ' ')
      .replace(/&quot;/gi, '"')
      .replace(/&apos;/gi, "'")
      .replace(/&#39;/gi, "'")
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
      .replace(/&#x([0-9a-fA-F]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/&amp;/gi, '&');
  }
  return str;
}

/**
 * Clean marketing widgets, subscription gates, hidden attributes, and promotional footers
 * from article HTML for pristine reading in the Mini App reader.
 * @param {string} html
 * @returns {string}
 */
export function cleanArticleContent(html) {
  if (!html || typeof html !== 'string') return '';
  let res = html;

  // 1. Remove hidden attribute from any elements (e.g. first-edition-gated-content)
  res = res.replace(/\s+hidden\b(=["']?(?:true|hidden)?["']?)?/gi, '');

  // 2. Remove first-edition subscription gate cards (9to5Google / Beehiiv)
  res = res.replace(/<div\b[^>]*class=["'][^"']*first-edition-gate[\s\S]*?(?=<div\b[^>]*class=["'][^"']*first-edition-gated-content)/gi, '');
  res = res.replace(/<div\b[^>]*class=["'][^"']*first-edition-gate["'][^>]*>[\s\S]*?<\/div>/gi, '');

  // 3. Remove promotional footers, affiliate disclaimers, and tracking widgets
  res = res.replace(/<div\b[^>]*class=["'][^"']*(?:visitor-promo|ad-disclaimer-container|google-preferred-source-badge|outpost-pub-container|sharedaddy|jp-relatedposts|likes-widget-placeholder|jetpack-likes-widget-wrapper)[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, '');
  res = res.replace(/<div\b[^>]*id=["'](?:after_disclaimer_placement|atatags-[^\"']*)[\"'][^>]*>[\s\S]*?<\/div>/gi, '');

  return res.trim();
}

/**
 * Convert arbitrary web HTML into Telegram-compatible HTML.
 * Telegram supports: <b>, <strong>, <i>, <em>, <u>, <ins>, <s>, <strike>, <del>,
 * <tg-spoiler>, <a href="...">, <code>, <pre>, <blockquote>.
 * @param {string} html
 * @returns {string}
 */
export function sanitizeToTelegramHtml(html) {
  if (!html) return '';

  let text = html;

  // 1. Remove dangerous script, style, iframe, svg, noscript tags and their contents
  text = text.replace(/<(script|style|iframe|svg|noscript)[^>]*>[\s\S]*?<\/\1>/gi, '');

  // 2. Replace block breaks with newlines
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/(p|div|h[1-6]|li|tr|table|article|section)>/gi, '\n\n');
  text = text.replace(/<li[^>]*>/gi, '• ');

  // 3. Normalize supported tags:
  // Spoilers: convert spoiler spans into <tg-spoiler>
  text = text.replace(/<span\s+[^>]*?class=["'][^"']*(?:tgme_widget_message_text_spoiler|spoiler)[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi, '<tg-spoiler>$1</tg-spoiler>');
  text = text.replace(/<\/?(tg-spoiler)(?:\s+[^>]*)?>/gi, (match) => match.startsWith('</') ? '</tg-spoiler>' : '<tg-spoiler>');

  // <b> and <strong> -> <b>
  text = text.replace(/<\/?(b|strong)(?:\s+[^>]*)?>/gi, (match) => match.startsWith('</') ? '</b>' : '<b>');
  // <i> and <em> -> <i>
  text = text.replace(/<\/?(i|em)(?:\s+[^>]*)?>/gi, (match) => match.startsWith('</') ? '</i>' : '<i>');
  // <u> and <ins> -> <u>
  text = text.replace(/<\/?(u|ins)(?:\s+[^>]*)?>/gi, (match) => match.startsWith('</') ? '</u>' : '<u>');
  // <s>, <strike>, <del> -> <s>
  text = text.replace(/<\/?(s|strike|del)(?:\s+[^>]*)?>/gi, (match) => match.startsWith('</') ? '</s>' : '<s>');
  // <code> and <pre>
  text = text.replace(/<\/?code(?:\s+[^>]*)?>/gi, (match) => match.startsWith('</') ? '</code>' : '<code>');
  text = text.replace(/<\/?pre(?:\s+[^>]*)?>/gi, (match) => match.startsWith('</') ? '</pre>' : '<pre>');
  // <blockquote> (preserve expandable attribute)
  text = text.replace(/<blockquote(?:\s+([^>]*))?>/gi, (match, attrs) => {
    if (attrs && /expandable/i.test(attrs)) {
      return '<blockquote expandable>';
    }
    return '<blockquote>';
  });
  text = text.replace(/<\/blockquote>/gi, '</blockquote>');

  // 4. Preserve <a> tags with href; strip other attributes
  text = text.replace(/<a\s+[^>]*?href=["']([^"']+)["'][^>]*?>/gi, '<a href="$1">');
  text = text.replace(/<\/a>/gi, '</a>');

  // 5. Strip all other tags but keep text
  // Match any tag that is not one of our allowed list:
  text = text.replace(/<\/?(?!(\/?(b|i|u|s|code|pre|blockquote|a|tg-spoiler)\b))[^>]+>/gi, '');

  // 6. Strip empty inline tags (e.g. <a href="..."></a>, <b></b>, <i></i>)
  text = text.replace(/<(b|i|u|s|code|pre|blockquote|a|tg-spoiler)\b[^>]*>\s*<\/\1>/gi, '');

  // 7. Decode unnecessary entities while preserving valid tags
  // Replace multiple sequential newlines with double newline
  text = text.replace(/\n{3,}/g, '\n\n').trim();

  return text;
}

/**
 * Truncate text cleanly without breaking HTML tags or character limits.
 * @param {string} text
 * @param {number} maxLength
 * @returns {string}
 */
export function truncate(text, maxLength = 3500) {
  if (!text || text.length <= maxLength) return text;

  // Simple safe truncation: cut at nearest space
  let cut = text.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(' ');
  if (lastSpace > maxLength - 200) {
    cut = cut.slice(0, lastSpace);
  }

  // Close any unclosed tags
  const openTags = [];
  const tagRegex = /<\/?([a-z0-9_-]+)(?:\s+[^>]*)?>/gi;
  let match;
  while ((match = tagRegex.exec(cut)) !== null) {
    const isClosing = match[0].startsWith('</');
    const tagName = match[1].toLowerCase();
    if (['b', 'i', 'u', 's', 'code', 'pre', 'blockquote', 'a', 'tg-spoiler'].includes(tagName)) {
      if (isClosing) {
        if (openTags[openTags.length - 1] === tagName) {
          openTags.pop();
        }
      } else {
        openTags.push(tagName);
      }
    }
  }

  while (openTags.length > 0) {
    const tag = openTags.pop();
    cut += `</${tag}>`;
  }

  return cut + '...';
}

/**
 * Check if item matches include and exclude filter rules.
 * @param {{title: string, content: string}} item
 * @param {string|null} includeRule
 * @param {string|null} excludeRule
 * @returns {boolean} True if post should be sent, false if filtered out.
 */
export function matchesFilter(item, includeRule, excludeRule) {
  const combined = `${item.title || ''} ${item.content || ''}`.toLowerCase();

  if (excludeRule) {
    const terms = excludeRule.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    for (const term of terms) {
      if (combined.includes(term)) {
        return false;
      }
    }
  }

  if (includeRule) {
    const terms = includeRule.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (terms.length > 0) {
      const hasAny = terms.some((term) => combined.includes(term));
      if (!hasAny) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Format a feed post into a Telegram message payload.
 * Supports podcasts (audio enclosures), YouTube videos, and multi-image galleries.
 * @param {object} item
 * @param {string} feedTitle
 * @param {object} [opts]
 * @returns {{text: string, photoUrl: string|null, photos: string[], audioUrl: string|null, replyMarkup?: object}}
 */
export function formatPost(item, feedTitle, opts = {}) {
  const lang = opts.lang || 'en';
  const title = escapeHtml(item.title || 'Untitled');
  const feed = escapeHtml(feedTitle || 'Feed');
  const link = item.link || '';
  const author = item.author ? ` • <i>${escapeHtml(item.author)}</i>` : '';

  let header = `<b>${feed}</b>${author}\n`;
  if (link) {
    header += `<a href="${escapeHtml(link)}"><b>${title}</b></a>\n\n`;
  } else {
    header += `<b>${title}</b>\n\n`;
  }

  const rawContent = item.content || item.description || '';
  const cleanBody = sanitizeToTelegramHtml(rawContent);

  // Extract images
  const imageMedia = (item.media || []).filter(
    (m) => !m.type || m.type.startsWith('image') || m.type === 'photo'
  );
  const photos = imageMedia.map((m) => m.url);
  const photo = photos[0] || null;
  const isPhoto = Boolean(photo && opts.sendMode === 'photo');

  // Extract audio enclosure (podcasts)
  const audioMedia = item.audio || (item.media || []).find(
    (m) => m.type && (m.type.startsWith('audio') || /\.(mp3|m4a|ogg|wav|aac)(\?|$)/i.test(m.url))
  );
  const audioUrl = audioMedia ? audioMedia.url : null;

  // Detect YouTube video
  const isYouTube = link && /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//i.test(link);

  const maxBodyLength = isPhoto ? 700 : 3200; // Leave room for header and footer
  const truncatedBody = truncate(cleanBody, maxBodyLength);

  let footer = '';
  if (audioUrl) {
    footer += `\n🎙️ <a href="${escapeHtml(audioUrl)}">${t(lang, 'listen_podcast')}</a>`;
  }
  if (isYouTube) {
    footer += `\n▶️ <a href="${escapeHtml(link)}">${t(lang, 'watch_youtube')}</a>`;
  }
  if (opts.telegraphUrl) {
    footer += `\n⚡ <a href="${escapeHtml(opts.telegraphUrl)}">${t(lang, 'instant_view')}</a>`;
  }
  if (link && !isYouTube) {
    footer += `\n🔗 <a href="${escapeHtml(link)}">${t(lang, 'read_original')}</a>`;
  }

  const fullText = `${header}${truncatedBody}${footer}`.trim();

  // Build inline keyboard reply_markup with localized buttons
  const inlineButtons = [];
  if (opts.telegraphUrl) {
    const row = [{ text: t(lang, 'btn_instant_view'), url: opts.telegraphUrl }];
    if (link) {
      row.push({ text: t(lang, 'btn_read_original'), url: link });
    }
    inlineButtons.push(row);
  } else if (link && !isYouTube && opts.sendMode === 'photo') {
    inlineButtons.push([{ text: t(lang, 'btn_read_original'), url: link }]);
  }

  if (audioUrl) {
    inlineButtons.push([{ text: t(lang, 'btn_listen_podcast'), url: audioUrl }]);
  }
  if (isYouTube) {
    inlineButtons.push([{ text: t(lang, 'btn_watch_youtube'), url: link }]);
  }

  return {
    text: fullText,
    photoUrl: isPhoto ? photo : null,
    photos: isPhoto ? photos : [],
    audioUrl,
    replyMarkup: inlineButtons.length > 0 ? { inline_keyboard: inlineButtons } : undefined,
  };
}

/**
 * Format a native Telegram channel post into a message payload.
 * Follows clean Telegram channel rules: no fake repeated article title,
 * clean rich text, forwarded attribution, albums, and original post link.
 * Supports dual-action Telegraph Instant View and native channel view.
 * @param {object} post
 * @param {string} channelTitle
 * @param {object} [opts]
 * @returns {{text: string, photoUrl: string|null, photos: string[], canSendPhoto: boolean, canSendMediaGroup: boolean, hasVideo: boolean, replyMarkup?: object}}
 */
export function formatChannelPost(post, channelTitle, opts = {}) {
  const lang = opts.lang || 'en';
  const displayTitle = escapeHtml(opts.customTitle || channelTitle || post.channel || 'Telegram Channel');
  const postUrl = post.url || `https://t.me/${post.channel}/${post.id}`;

  if (opts.sendMode === 'link_only') {
    return {
      text: `<b>${displayTitle}</b>\n🔗 <a href="${escapeHtml(postUrl)}">${t(lang, 'view_post_in_telegram')}</a>`,
      photoUrl: null,
      photos: [],
      canSendPhoto: false,
      canSendMediaGroup: false,
      hasVideo: Boolean(post.hasVideo),
    };
  }

  let header = `<b>${displayTitle}</b>\n`;
  if (post.forwardedFrom) {
    if (post.forwardedFrom.url) {
      header += `<i>${t(lang, 'forwarded_from')} <a href="${escapeHtml(post.forwardedFrom.url)}">${escapeHtml(post.forwardedFrom.name)}</a></i>\n\n`;
    } else {
      header += `<i>${t(lang, 'forwarded_from')} ${escapeHtml(post.forwardedFrom.name)}</i>\n\n`;
    }
  } else if (post.replyTo) {
    const replyNum = post.replyTo.url ? post.replyTo.url.split('/').pop() : '';
    const replyLabel = replyNum ? `${t(lang, 'post_num')} #${replyNum}` : t(lang, 'post_num');
    if (post.replyTo.url) {
      header += `<i>↩️ ${t(lang, 'in_reply_to')} <a href="${escapeHtml(post.replyTo.url)}">${escapeHtml(replyLabel)}</a></i>\n\n`;
    }
  } else if (post.textHtml) {
    header += `\n`;
  }

  const cleanBody = post.textHtml || '';
  const photos = post.photos && post.photos.length > 0 ? post.photos : (post.photoUrl ? [post.photoUrl] : []);
  const photo = photos[0] || null;

  let footer = '';
  if (opts.telegraphUrl) {
    footer += `\n\n⚡ <a href="${escapeHtml(opts.telegraphUrl)}">${t(lang, 'instant_view')}</a>`;
    footer += `\n🔗 <a href="${escapeHtml(postUrl)}">${t(lang, 'view_in_telegram')}</a>`;
  } else if (post.videoUrl) {
    footer += `\n\n🔗 <a href="${escapeHtml(postUrl)}">${t(lang, 'view_in_telegram')}</a>`;
  } else if (post.hasVideo) {
    footer += `\n\n📹 <a href="${escapeHtml(postUrl)}">${t(lang, 'watch_video_telegram')}</a>`;
  } else {
    footer += `\n\n🔗 <a href="${escapeHtml(postUrl)}">${t(lang, 'view_in_telegram')}</a>`;
  }

  const fullMessage = `${header}${cleanBody}${footer}`.trim();
  const isPhotoMode = opts.sendMode === 'photo';
  const fitsCaption = fullMessage.length <= 1020;

  // Build dual action inline keyboard buttons with localized labels
  const inlineButtons = [];
  if (opts.telegraphUrl) {
    inlineButtons.push([
      { text: t(lang, 'btn_instant_view'), url: opts.telegraphUrl },
      { text: t(lang, 'btn_channel_post'), url: postUrl },
    ]);
  } else {
    if (post.hasVideo && !post.videoUrl) {
      inlineButtons.push([{ text: t(lang, 'btn_watch_video'), url: postUrl }]);
    } else {
      inlineButtons.push([{ text: t(lang, 'btn_channel_post'), url: postUrl }]);
    }
  }
  const replyMarkup = inlineButtons.length > 0 ? { inline_keyboard: inlineButtons } : undefined;

  if ((post.videoUrl || photo) && opts.sendMode !== 'link_only') {
    let captionText = fullMessage;
    if (captionText.length > 1020) {
      const allowedBody = 1020 - header.length - footer.length;
      captionText = `${header}${truncate(cleanBody, Math.max(allowedBody, 100))}${footer}`.trim();
    }
    return {
      text: captionText,
      photoUrl: photo,
      photos,
      videoUrl: post.videoUrl || null,
      canSendVideo: Boolean(post.videoUrl),
      canSendPhoto: Boolean(photo),
      canSendMediaGroup: photos.length > 1 && !post.videoUrl,
      hasVideo: Boolean(post.hasVideo),
      replyMarkup,
    };
  }

  const maxTextLength = opts.telegraphUrl ? 1800 : 3600;
  const truncatedText = truncate(cleanBody, maxTextLength);
  return {
    text: `${header}${truncatedText}${footer}`.trim(),
    photoUrl: photo,
    photos,
    videoUrl: post.videoUrl || null,
    canSendVideo: Boolean(post.videoUrl),
    canSendPhoto: false,
    canSendMediaGroup: false,
    hasVideo: Boolean(post.hasVideo),
    replyMarkup,
  };
}

/**
 * Extract a clean, plain-text summary/excerpt from HTML or text.
 * @param {string} htmlOrText
 * @param {number} [maxLen]
 * @returns {string}
 */
export function extractCleanSummary(htmlOrText, maxLen = 280) {
  if (!htmlOrText || typeof htmlOrText !== 'string') return '';
  const rawText = htmlOrText
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<\/(p|div|h[1-6]|li|blockquote|tr|section|article)>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '');

  const text = decodeEntities(rawText)
    .replace(/\s+/g, ' ')
    .trim();

  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trim() + '…';
}


