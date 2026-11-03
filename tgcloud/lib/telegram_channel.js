/**
 * Telegram Channel Parser & Fetcher for Telegram Serverless (V8 Isolate).
 * Polls public Telegram channels directly via t.me/s/<channel> web preview.
 * Zero external dependencies. No third-party RSS mirrors.
 */

import { fetch } from 'sdk';
import { sanitizeToTelegramHtml } from './formatter.js';

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
 * Clean Telegram widget HTML into compliant Telegram parse_mode: HTML.
 * @param {string} rawHtml
 * @returns {string}
 */
export function cleanWidgetTextHtml(rawHtml) {
  if (!rawHtml) return '';

  let text = rawHtml;

  // 1. Replace <br> and <br/> with newline
  text = text.replace(/<br\s*\/?>/gi, '\n');

  // 2. Remove javascript onclick / onhover confirm dialogs injected by Telegram web
  text = text.replace(/<a\s+[^>]*?href=["']([^"']+)["'][^>]*?>([\s\S]*?)<\/a>/gi, '<a href="$1">$2</a>');

  // 3. Convert emoji image tags (<i class="emoji" style="background-image:url(...)"><b>emoji</b></i>) to text
  text = text.replace(/<i\s+[^>]*?class=["'][^"']*emoji[^"']*["'][^>]*><b>([\s\S]*?)<\/b><\/i>/gi, '$1');

  // 4. Pass through standard sanitizer
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

    // Extract text content
    const textMatch = postHtml.match(/<div class="[^"]*tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    const rawTextHtml = textMatch ? textMatch[1] : '';
    const cleanText = cleanWidgetTextHtml(rawTextHtml);
    const plainText = cleanText.replace(/<[^>]+>/g, '').trim();

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

    // Extract media photos and video thumbnails (excluding avatars and reactions)
    const photos = [];
    const mediaRegex = /<(?:a|i)\s+[^>]*?class="[^"]*(?:photo_wrap|grouped_layer|video_thumb)[^"]*"[^>]*?style="[^"]*background-image:url\('([^']+)'\)/gi;
    let m;
    while ((m = mediaRegex.exec(postHtml)) !== null) {
      const pUrl = m[1];
      if (pUrl && !photos.includes(pUrl)) {
        photos.push(pUrl);
      }
    }

    // Check video
    const videoMatch = postHtml.match(/<video[^>]*src="([^"]+)"/i);
    const hasVideo = Boolean(videoMatch || postHtml.includes('js-message_video_player'));

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
      hasVideo,
      pubDate,
      forwardedFrom,
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

  const gateways = [
    `https://r.jina.ai/${canonicalUrl}`,
  ];

  let lastError = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    for (const gwUrl of gateways) {
      try {
        const res = await fetch(gwUrl, {
          headers: {
            'X-Return-Format': 'html',
          },
        });

        if (!res.ok) {
          lastError = new Error(`Gateway returned HTTP ${res.status}`);
          continue;
        }

        const html = await res.text();
        if (!html || !html.includes('tgme_widget_message')) {
          lastError = new Error('Gateway response did not contain channel widget');
          continue;
        }

        return parseChannelHtml(html, cleanUsername);
      } catch (err) {
        lastError = err;
      }
    }

    if (attempt === 0) {
      await new Promise((r) => setTimeout(r, 600));
    }
  }

  throw new Error(`Failed to fetch public channel @${cleanUsername}: ${lastError ? lastError.message : 'Channel not found or empty'}`);
}

