/**
 * Telegram Message Formatter and HTML Sanitizer for RSS feeds.
 * Ensures HTML conforms strictly to Telegram Bot API HTML parse mode.
 */

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
 * @param {string} text
 * @returns {string}
 */
export function decodeEntities(text) {
  if (!text) return '';
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
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
  text = text.replace(/<\/(p|div|h[1-6]|li|blockquote|tr|table|article|section)>/gi, '\n\n');
  text = text.replace(/<li[^>]*>/gi, '• ');

  // 3. Normalize supported tags:
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
  // <blockquote>
  text = text.replace(/<\/?blockquote(?:\s+[^>]*)?>/gi, (match) => match.startsWith('</') ? '</blockquote>' : '<blockquote>');

  // 4. Preserve <a> tags with href; strip other attributes
  text = text.replace(/<a\s+[^>]*?href=["']([^"']+)["'][^>]*?>/gi, '<a href="$1">');
  text = text.replace(/<\/a>/gi, '</a>');

  // 5. Strip all other tags but keep text
  // Match any tag that is not one of our allowed list:
  text = text.replace(/<\/?(?!(\/?(b|i|u|s|code|pre|blockquote|a|tg-spoiler)\b))[^>]+>/gi, '');

  // 6. Decode unnecessary entities while preserving valid tags
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
 * @param {object} item
 * @param {string} feedTitle
 * @param {object} [opts]
 * @returns {{text: string, photoUrl: string|null}}
 */
export function formatPost(item, feedTitle, opts = {}) {
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

  const photo = item.media && item.media.length > 0 ? item.media[0].url : null;
  const isPhoto = Boolean(photo && opts.sendMode !== 'link_only');

  const maxBodyLength = isPhoto ? 700 : 3200; // Leave room for header and footer
  const truncatedBody = truncate(cleanBody, maxBodyLength);

  let footer = '';
  if (opts.telegraphUrl) {
    footer += `\n⚡ <a href="${escapeHtml(opts.telegraphUrl)}">Instant View</a>`;
  }
  if (link) {
    footer += `\n🔗 <a href="${escapeHtml(link)}">Read Original</a>`;
  }

  const fullText = `${header}${truncatedBody}${footer}`.trim();

  return {
    text: fullText,
    photoUrl: isPhoto ? photo : null,
  };
}

/**
 * Format a native Telegram channel post into a message payload.
 * Follows clean Telegram channel rules: no fake repeated article title,
 * clean rich text, forwarded attribution, and original post link.
 * @param {object} post
 * @param {string} channelTitle
 * @param {object} [opts]
 * @returns {{text: string, photoUrl: string|null, canSendPhoto: boolean}}
 */
export function formatChannelPost(post, channelTitle, opts = {}) {
  const displayTitle = escapeHtml(opts.customTitle || channelTitle || post.channel || 'Telegram Channel');
  const postUrl = post.url || `https://t.me/${post.channel}/${post.id}`;

  if (opts.sendMode === 'link_only') {
    return {
      text: `<b>${displayTitle}</b>\n🔗 <a href="${escapeHtml(postUrl)}">View post in Telegram</a>`,
      photoUrl: null,
      canSendPhoto: false,
    };
  }

  let header = `<b>${displayTitle}</b>\n`;
  if (post.forwardedFrom) {
    if (post.forwardedFrom.url) {
      header += `<i>Forwarded from <a href="${escapeHtml(post.forwardedFrom.url)}">${escapeHtml(post.forwardedFrom.name)}</a></i>\n\n`;
    } else {
      header += `<i>Forwarded from ${escapeHtml(post.forwardedFrom.name)}</i>\n\n`;
    }
  } else if (post.textHtml) {
    header += `\n`;
  }

  const cleanBody = post.textHtml || '';
  const photo = post.photoUrl || (post.photos && post.photos.length > 0 ? post.photos[0] : null);
  const footer = `\n\n🔗 <a href="${escapeHtml(postUrl)}">View in Telegram</a>`;

  const fullMessage = `${header}${cleanBody}${footer}`.trim();
  const isPhotoMode = opts.sendMode === 'photo';
  const fitsCaption = fullMessage.length <= 1020;

  if (photo && (isPhotoMode || fitsCaption)) {
    let captionText = fullMessage;
    if (captionText.length > 1020) {
      const allowedBody = 1020 - header.length - footer.length;
      captionText = `${header}${truncate(cleanBody, Math.max(allowedBody, 100))}${footer}`.trim();
    }
    return {
      text: captionText,
      photoUrl: photo,
      canSendPhoto: true,
    };
  }

  const truncatedText = truncate(cleanBody, 3600);
  return {
    text: `${header}${truncatedText}${footer}`.trim(),
    photoUrl: photo,
    canSendPhoto: false,
  };
}


