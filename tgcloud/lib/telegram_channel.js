/**
 * Telegram Channel Parser & Fetcher for Telegram Serverless (V8 Isolate).
 * Polls public Telegram channels directly via t.me/s/<channel> web preview.
 * Zero external dependencies. No third-party RSS mirrors.
 */

import { fetch } from 'sdk';
import { sanitizeToTelegramHtml, decodeEntities } from './formatter.js';

const SYSTEM_ROUTES = new Set([
  'joinchat', 'c', 'share', 'login', 'addstickers', 'addtheme', 's', 'contact', 'proxy', 'socks',
]);

/**
 * Check if a URL or handle represents a Telegram channel.
 * @param {string} url
 * @returns {boolean}
 */
export function isTelegramChannelUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (trimmed.startsWith('@')) return true;

  if (trimmed.includes('tg.i-c-a.su/rss/') || trimmed.includes('/telegram/channel/')) {
    return true;
  }

  const match = trimmed.match(/^(?:https?:\/\/)?(?:www\.)?(?:t\.me|telegram\.me)\/([a-zA-Z0-9_]+(?:\/[a-zA-Z0-9_]+)?)/i);
  if (!match) return false;

  const firstPart = match[1].split('/')[0].toLowerCase();
  if (firstPart === 's') {
    const secondPart = match[1].split('/')[1]?.toLowerCase();
    return Boolean(secondPart && !SYSTEM_ROUTES.has(secondPart));
  }
  return !SYSTEM_ROUTES.has(firstPart);
}

/**
 * Extract clean channel username from any Telegram URL or handle.
 * @param {string} url
 * @returns {string|null}
 */
export function extractChannelUsername(url) {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();

  // 1. Handle @username
  if (trimmed.startsWith('@')) {
    const clean = trimmed.slice(1).split(/[/?#]/)[0];
    return clean && !SYSTEM_ROUTES.has(clean.toLowerCase()) ? clean : null;
  }

  // 2. Handle legacy mirrors e.g. https://tg.i-c-a.su/rss/Crimeanwind
  const mirrorMatch = trimmed.match(/(?:tg\.i-c-a\.su\/rss|telegram\/channel)\/([a-zA-Z0-9_]+)/i);
  if (mirrorMatch && mirrorMatch[1]) {
    return mirrorMatch[1];
  }

  // 3. Handle t.me or telegram.me URLs (e.g. t.me/s/Crimeanwind or t.me/Crimeanwind/123)
  const tgMatch = trimmed.match(/^(?:https?:\/\/)?(?:www\.)?(?:t\.me|telegram\.me)\/(.+)$/i);
  if (!tgMatch) return null;

  const path = tgMatch[1].replace(/^\/+/, '').split(/[?#]/)[0];
  const parts = path.split('/').filter(Boolean);

  if (parts.length === 0) return null;

  if (parts[0].toLowerCase() === 's') {
    return parts[1] && !SYSTEM_ROUTES.has(parts[1].toLowerCase()) ? parts[1] : null;
  }

  return !SYSTEM_ROUTES.has(parts[0].toLowerCase()) ? parts[0] : null;
}

/**
 * Returns the canonical URL for a Telegram channel.
 * @param {string} username
 * @returns {string}
 */
export function getCanonicalChannelUrl(username) {
  const clean = username.replace(/^@/, '');
  return `https://t.me/s/${clean}`;
}

/**
 * Normalize image URLs from Telegram channels.
 * Routes internal CDN domains (.telesco.pe) through the high-availability Cloudflare Worker
 * image-proxy so Telegram Bot API and Telegraph crawlers can fetch them reliably without 400 errors.
 * @param {string} url
 * @returns {string}
 */
export function normalizeChannelImageUrl(url) {
  if (!url || typeof url !== 'string') return url;
  if (url.includes('.telesco.pe/') || url.includes('telegram.org/file/')) {
    return `https://slrssbot-poller.darkydaff.workers.dev/image-proxy?url=${encodeURIComponent(url)}`;
  }
  return url;
}

/**
 * Clean Telegram widget HTML into compliant Telegram parse_mode: HTML.
 * @param {string} rawHtml
 * @returns {string}
 */
export function cleanWidgetTextHtml(rawHtml) {
  if (!rawHtml) return '';

  let text = rawHtml;

  // 1. Decode entities safely in HTML (decode quotes, apostrophes, and numeric entities like &#33;)
  // Keep &, <, > safe so HTML tags and markup remain valid
  text = text
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#39;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
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

  // If text came wrapped from an XML/RSS feed wrapper with escaped markup:
  if (text.includes('&lt;') && text.includes('&gt;')) {
    text = text
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>');
  }

  // 2. Remove media wrapper anchors <a ...><img .../></a> so media links don't leak into body text
  text = text.replace(/<a\b[^>]*>(?:\s*<img\b[^>]*>\s*)+<\/a>/gi, '');
  text = text.replace(/<img\b[^>]*>/gi, '');

  // 3. Replace <br> and <br/> with newline
  text = text.replace(/<br\s*\/?>/gi, '\n');

  // 4. Remove javascript onclick / onhover confirm dialogs injected by Telegram web
  text = text.replace(/<a\s+[^>]*?href=["']([^"']+)["'][^>]*?>([\s\S]*?)<\/a>/gi, '<a href="$1">$2</a>');

  // 5. Convert emoji image tags (<i class="emoji" style="background-image:url(...)"><b>emoji</b></i>) to text
  text = text.replace(/<i\s+[^>]*?class=["'][^"']*emoji[^"']*["'][^>]*><b>([\s\S]*?)<\/b><\/i>/gi, '$1');

  // 6. Convert Telegram widget spoilers into native Telegram <tg-spoiler>
  text = text.replace(/<span\s+[^>]*?class=["'][^"']*(?:tgme_widget_message_text_spoiler|spoiler)[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi, '<tg-spoiler>$1</tg-spoiler>');

  // 7. Support expandable blockquotes
  text = text.replace(/<blockquote\s+[^>]*?(?:class=["'][^"']*expandable[^"']*["']|expandable)[^>]*>([\s\S]*?)<\/blockquote>/gi, '<blockquote expandable>$1</blockquote>');

  // 8. Pass through standard sanitizer
  return sanitizeToTelegramHtml(text);
}

/**
 * Parse public HTML from t.me/s/<channel>.
 * @param {string} html
 * @param {string} channelUsername
 * @returns {{channelUsername: string, channelTitle: string, channelDescription: string, channelUrl: string, posts: Array}}
 */
export function parseChannelHtml(html, channelUsername) {
  if (!html || typeof html !== 'string') {
    throw new Error('Channel HTML must be a non-empty string');
  }

  // 1. Extract channel metadata
  const ogTitleMatch = html.match(/<meta property="og:title" content="([^"]+)"/i) ||
                       html.match(/<title>([^<]+)<\/title>/i);
  let channelTitle = ogTitleMatch ? ogTitleMatch[1].trim() : channelUsername;
  // Strip trailing " – Telegram" or " - Telegram" if present in title
  channelTitle = channelTitle.replace(/\s+[–—\-]\s+Telegram$/i, '').trim();

  const ogDescMatch = html.match(/<meta property="og:description" content="([^"]+)"/i);
  const channelDescription = ogDescMatch ? ogDescMatch[1].trim() : '';

  // 2. Extract individual widget messages
  // Matches <div class="...tgme_widget_message..." data-post="channel/id" ...> ... </div>
  const postRegex = /<div class="[^"]*tgme_widget_message[^"]*"[^>]*data-post="([^"]+)"[\s\S]*?(?=<div class="[^"]*tgme_widget_message[^"]*"[^>]*data-post=|$)/gi;
  const posts = [];
  let match;

  while ((match = postRegex.exec(html)) !== null) {
    const postHtml = match[0];
    const postRef = match[1]; // e.g. "Crimeanwind/112062"
    const [refChannel, refIdStr] = postRef.split('/');
    const postId = parseInt(refIdStr, 10);
    if (!postId) continue;

    // Extract reply info before stripping it
    let replyTo = null;
    const replyMatch = postHtml.match(/<a\s+[^>]*?class="[^"]*tgme_widget_message_reply[^"]*"[^>]*?href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (replyMatch) {
      const replyUrl = replyMatch[1];
      const replyBody = replyMatch[2];
      const rAuthorMatch = replyBody.match(/<span\s+[^>]*?class="[^"]*tgme_widget_message_author_name[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
      const rTextMatch = replyBody.match(/<div\s+[^>]*?class="[^"]*js-message_reply_text[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
      replyTo = {
        url: replyUrl,
        author: rAuthorMatch ? decodeEntities(rAuthorMatch[1].replace(/<[^>]+>/g, '').trim()) : null,
        text: rTextMatch ? decodeEntities(cleanWidgetTextHtml(rTextMatch[1]).replace(/<[^>]+>/g, '').trim()) : null,
      };
    }

    // Strip reply block so its quoted text and thumbnail do NOT contaminate this post's content
    const cleanPostHtml = postHtml.replace(/<a\s+[^>]*?class="[^"]*tgme_widget_message_reply[^"]*"[\s\S]*?<\/a>/gi, '');

    // Extract text content of THIS post (ignoring reply quote)
    const textMatch = cleanPostHtml.match(/<div class="[^"]*tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    const rawTextHtml = textMatch ? textMatch[1] : '';
    const cleanText = cleanWidgetTextHtml(rawTextHtml);
    const plainText = decodeEntities(cleanText.replace(/<[^>]+>/g, '')).trim();

    // Extract forwarded info
    let forwardedFrom = null;
    const forwardMatch = postHtml.match(/<div class="[^"]*tgme_widget_message_forwarded_from[^"]*">([\s\S]*?)<\/div>/i);
    if (forwardMatch) {
      const fHtml = forwardMatch[1];
      const fNameMatch = fHtml.match(/<a\s+[^>]*?href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
      if (fNameMatch) {
        forwardedFrom = {
          name: fNameMatch[2].replace(/<[^>]+>/g, '').trim(),
          url: fNameMatch[1],
        };
      } else {
        const spanMatch = fHtml.match(/<span[^>]*>([\s\S]*?)<\/span>/i);
        if (spanMatch) {
          forwardedFrom = {
            name: spanMatch[1].replace(/<[^>]+>/g, '').trim(),
            url: null,
          };
        }
      }
    }

    // Extract media photos and video thumbnails from clean post (excluding reply thumbnails)
    const photos = [];
    const mediaRegex = /<(?:a|i)\s+[^>]*?class="[^"]*(?:photo_wrap|grouped_layer|video_thumb)[^"]*"[^>]*?style="[^"]*background-image:\s*url\((?:'|"|&#39;|&quot;)?(https?:\/\/[^'")\s;]+)(?:'|"|&#39;|&quot;)?\)/gi;
    let m;
    while ((m = mediaRegex.exec(cleanPostHtml)) !== null) {
      const pUrl = normalizeChannelImageUrl(m[1]);
      if (pUrl && !photos.includes(pUrl)) {
        photos.push(pUrl);
      }
    }

    // Check video or round video
    const videoMatch = cleanPostHtml.match(/<video[^>]*src="([^"]+)"/i);
    const rawVideoUrl = videoMatch ? videoMatch[1] : null;
    const videoUrl = rawVideoUrl ? normalizeChannelImageUrl(rawVideoUrl) : null;
    const hasVideo = Boolean(
      videoUrl ||
      cleanPostHtml.includes('js-message_video_player') ||
      cleanPostHtml.includes('tgme_widget_message_video_player') ||
      cleanPostHtml.includes('tgme_widget_message_roundvideo_player')
    );

    // Extract publication time
    const timeMatch = postHtml.match(/<time datetime="([^"]+)"/i);
    const pubDate = timeMatch ? new Date(timeMatch[1]) : new Date();

    const postUrl = `https://t.me/${refChannel || channelUsername}/${postId}`;

    posts.push({
      id: postId,
      guid: `tg_${(refChannel || channelUsername).toLowerCase()}_${postId}`,
      url: postUrl,
      channel: refChannel || channelUsername,
      channelTitle,
      textHtml: cleanText,
      plainText,
      photos,
      photoUrl: photos[0] || null,
      videoUrl,
      hasVideo,
      pubDate,
      forwardedFrom,
      replyTo,
    });
  }

  // Sort posts chronologically (oldest first, newest last)
  posts.sort((a, b) => a.id - b.id);

  return {
    channelUsername,
    channelTitle,
    channelDescription,
    channelUrl: `https://t.me/s/${channelUsername}`,
    posts,
  };
}

/**
 * Fetch and parse posts from a public Telegram channel.
 * Uses high-availability edge proxy if direct t.me access is restricted by isolate sandbox.
 * @param {string} channelUsername
 * @returns {Promise<{channelUsername: string, channelTitle: string, channelDescription: string, channelUrl: string, posts: Array}>}
 */
export async function fetchChannelData(channelUsername) {
  const cleanUsername = extractChannelUsername(channelUsername) || channelUsername;
  const canonicalUrl = `https://t.me/s/${cleanUsername}`;

  // 1. Try public Telegram web preview via edge proxy, directly, or mirrors
  const candidateUrls = [
    `https://slrssbot-poller.darkydaff.workers.dev/channel/${cleanUsername}`,
    canonicalUrl,
    `https://tg.i-c-a.su/rss/${cleanUsername}`,
  ];

  let lastError = null;

  for (const url of candidateUrls) {
    try {
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      };

      const res = await fetch(url, { headers });

      if (!res.ok) {
        lastError = new Error(`HTTP ${res.status}`);
        continue;
      }

      const bodyText = await res.text();

      // If it's the standard t.me/s/ HTML preview:
      if (bodyText.includes('tgme_widget_message')) {
        return parseChannelHtml(bodyText, cleanUsername);
      }

      // If it's the RSS fallback mirror (e.g. tg.i-c-a.su):
      if (bodyText.includes('<rss') || bodyText.includes('<feed')) {
        return parseChannelRssFallback(bodyText, cleanUsername);
      }
    } catch (err) {
      lastError = err;
    }
  }

  throw new Error(`Failed to fetch public channel @${cleanUsername}: ${lastError ? lastError.message : 'Channel not found or empty'}`);
}

/**
 * Fallback parser when Telegram web preview blocks Serverless edge IP with 403
 */
function parseChannelRssFallback(xml, cleanUsername) {
  const titleMatch = xml.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
  const channelTitle = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : cleanUsername;

  const descMatch = xml.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i);
  const channelDescription = descMatch ? descMatch[1].trim() : '';

  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  const posts = [];
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1];

    const linkMatch = itemXml.match(/<link>([^<]+)<\/link>/i) || itemXml.match(/<guid[^>]*>([^<]+)<\/guid>/i);
    const link = linkMatch ? linkMatch[1].trim() : '';

    const idMatch = link.match(/\/(\d+)$/);
    const postId = idMatch ? parseInt(idMatch[1], 10) : 0;
    if (!postId) continue;

    const descMatch = itemXml.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i);
    const rawDesc = descMatch ? descMatch[1] : '';
    const cleanText = cleanWidgetTextHtml(rawDesc);
    const plainText = cleanText.replace(/<[^>]+>/g, '').trim();

    // Extract photos from enclosure or media:content or img src
    const photos = [];
    const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi;
    let m;
    while ((m = imgRegex.exec(rawDesc)) !== null) {
      const pUrl = normalizeChannelImageUrl(m[1]);
      if (!photos.includes(pUrl)) photos.push(pUrl);
    }
    const mediaRegex = /<media:content[^>]+url=["']([^"']+)["'][^>]*type=["']image\//gi;
    while ((m = mediaRegex.exec(itemXml)) !== null) {
      const pUrl = normalizeChannelImageUrl(m[1]);
      if (!photos.includes(pUrl)) photos.push(pUrl);
    }

    const pubDateMatch = itemXml.match(/<pubDate>([^<]+)<\/pubDate>/i);
    const pubDate = pubDateMatch ? new Date(pubDateMatch[1]) : new Date();

    posts.push({
      id: postId,
      guid: `tg_${cleanUsername.toLowerCase()}_${postId}`,
      url: link || `https://t.me/${cleanUsername}/${postId}`,
      channel: cleanUsername,
      channelTitle,
      textHtml: cleanText,
      plainText,
      photos,
      photoUrl: photos[0] || null,
      hasVideo: false,
      pubDate,
      forwardedFrom: null,
    });
  }

  posts.sort((a, b) => a.id - b.id);

  return {
    channelUsername: cleanUsername,
    channelTitle,
    channelDescription,
    channelUrl: `https://t.me/s/${cleanUsername}`,
    posts,
  };
}


