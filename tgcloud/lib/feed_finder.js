/**
 * Auto-detection of RSS, Atom, and JSON feeds from arbitrary website URLs.
 * Handles Substack, WordPress, Medium, GitHub, and Telegram public channels.
 * Pure JS without relying on global URL class (for minimal V8 isolates).
 */

import { fetch } from 'sdk';
import { parseFeed } from './rss.js';
import {
  isTelegramChannelUrl,
  extractChannelUsername,
  fetchChannelData,
} from './telegram_channel.js';

const USER_AGENT = 'TelegramServerlessRSSBot/1.0 (+https://core.telegram.org/bots/serverless)';

/**
 * Lightweight pure-JS URL parser (does not depend on global URL).
 * @param {string} raw
 * @returns {{origin: string, protocol: string, hostname: string, host: string, pathname: string, search: string}|null}
 */
export function parseUrl(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const match = raw.trim().match(/^(https?:\/\/)?([^/?#]+)(.*)$/i);
  if (!match) return null;

  const protocol = match[1] || 'https://';
  const hostAndPort = match[2];
  const rest = match[3] || '';

  const [pathnameAndSearch] = rest.split('#');
  const [pathname, search] = (pathnameAndSearch || '').split('?');

  const hostname = hostAndPort.split(':')[0].toLowerCase();
  const origin = `${protocol.toLowerCase()}${hostAndPort.toLowerCase()}`;

  return {
    origin,
    protocol: protocol.toLowerCase(),
    hostname,
    host: hostAndPort.toLowerCase(),
    pathname: pathname ? (pathname.startsWith('/') ? pathname : `/${pathname}`) : '/',
    search: search ? `?${search}` : '',
  };
}

/**
 * Resolve relative URL to absolute without relying on global URL.
 * @param {string} relative
 * @param {string} base
 * @returns {string}
 */
export function resolveUrl(relative, base) {
  if (!relative) return base;
  if (/^https?:\/\//i.test(relative)) return relative;
  if (relative.startsWith('//')) {
    const baseProto = (base.match(/^https?:/i) || ['https:'])[0];
    return `${baseProto}${relative}`;
  }

  const parsedBase = parseUrl(base);
  if (!parsedBase) return relative;

  if (relative.startsWith('/')) {
    return `${parsedBase.origin}${relative}`;
  }

  const baseDir = parsedBase.pathname.substring(0, parsedBase.pathname.lastIndexOf('/') + 1) || '/';
  return `${parsedBase.origin}${baseDir}${relative}`;
}

/**
 * Extract <link rel="alternate" type="..." href="..."> feed URLs from HTML.
 * @param {string} html
 * @param {string} baseUrl
 * @returns {string[]}
 */
export function extractFeedLinksFromHtml(html, baseUrl) {
  const found = [];
  const linkRegex = /<link\s+[^>]*?rel=["'](?:alternate|feed|service\.feed)["'][^>]*?>/gi;
  let match;

  while ((match = linkRegex.exec(html)) !== null) {
    const tag = match[0];
    const isFeedType = /type=["']application\/(rss\+xml|atom\+xml|json|xml)["']/i.test(tag) ||
      /type=["']text\/xml["']/i.test(tag);
    if (!isFeedType) continue;

    const hrefMatch = tag.match(/href=["']([^"']+)["']/i);
    if (hrefMatch && hrefMatch[1]) {
      const absUrl = resolveUrl(hrefMatch[1].trim(), baseUrl);
      if (!found.includes(absUrl)) {
        found.push(absUrl);
      }
    }
  }

  return found;
}

/**
 * Generate platform-specific candidate feed URLs for common sites (Substack, WordPress, Medium, Telegram, etc.).
 * @param {string} rawUrl
 * @param {string} [html]
 * @returns {string[]}
 */
export function getPlatformFeedCandidates(rawUrl, html = '') {
  const candidates = [];
  try {
    let cleanUrl = rawUrl.trim();
    if (cleanUrl.startsWith('@')) {
      cleanUrl = `https://t.me/${cleanUrl.slice(1)}`;
    }

    const u = parseUrl(cleanUrl);
    if (!u) return [];

    const host = u.hostname;
    const path = u.pathname.replace(/\/+$/, '');

    // 1. Substack
    if (host.endsWith('substack.com') || (html && html.includes('substackcdn.com'))) {
      candidates.push(`${u.origin}/feed`);
    }

    // 2. Medium
    if (host.includes('medium.com')) {
      if (path.startsWith('/@')) {
        candidates.push(`${u.origin}/feed${path}`);
      } else {
        candidates.push(`${u.origin}/feed`);
      }
    }

    // 3. WordPress
    if (html && (html.includes('wp-content') || html.includes('name="generator" content="WordPress'))) {
      candidates.push(`${u.origin}${path}/feed/`);
      candidates.push(`${u.origin}${path}/?feed=rss2`);
      candidates.push(`${u.origin}/feed/`);
    }

    // 4. GitHub
    if (host === 'github.com' && path.includes('/releases')) {
      candidates.push(`${u.origin}${path}.atom`);
    }

    // Generic fallbacks
    candidates.push(`${u.origin}${path}/feed`);
    candidates.push(`${u.origin}${path}/rss`);
    candidates.push(`${u.origin}${path}/feed.xml`);
    candidates.push(`${u.origin}${path}/rss.xml`);
    candidates.push(`${u.origin}${path}/atom.xml`);
    candidates.push(`${u.origin}/feed`);
    candidates.push(`${u.origin}/rss.xml`);
  } catch {
    // Ignore invalid URLs
  }

  // Deduplicate and filter out the original URL itself
  return [...new Set(candidates)].filter((c) => c !== rawUrl);
}

/**
 * Find and parse a feed from a given URL, auto-detecting RSS/Atom/JSON if a regular webpage was given.
 * @param {string} initialUrl
 * @returns {Promise<{feedUrl: string, feed: object, rawText: string, headers: Headers}>}
 */
export async function discoverAndParseFeed(initialUrl) {
  let targetUrl = initialUrl.trim();
  if (targetUrl.startsWith('@')) {
    targetUrl = `https://t.me/${targetUrl.slice(1)}`;
  } else if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    targetUrl = `https://${targetUrl}`;
  }

  if (isTelegramChannelUrl(targetUrl)) {
    const channelData = await fetchChannelData(targetUrl);
    return {
      feedUrl: channelData.channelUrl,
      isTelegram: true,
      title: channelData.channelTitle,
      feed: {
        title: channelData.channelTitle,
        link: channelData.channelUrl,
        description: channelData.channelDescription,
        items: channelData.posts.map((p) => ({
          guid: p.guid,
          title: p.plainText.slice(0, 100) || p.channelTitle,
          link: p.url,
          pubDate: p.pubDate,
          content: p.textHtml,
        })),
      },
      rawText: '',
      headers: null,
      channelData,
    };
  }

  const reqHeaders = {
    'User-Agent': USER_AGENT,
    'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, application/json, text/html, */*',
  };

  let candidates = [];

  try {
    // 1. Try fetching initial URL
    const res = await fetch(targetUrl, { headers: reqHeaders });
    if (res.ok) {
      const text = await res.text();
      try {
        const feed = parseFeed(text);
        return { feedUrl: targetUrl, isTelegram: false, feed, rawText: text, headers: res.headers };
      } catch {
        // Not directly a feed, extract HTML links
        candidates.push(...extractFeedLinksFromHtml(text, targetUrl));
        candidates.push(...getPlatformFeedCandidates(targetUrl, text));
      }
    }
  } catch {
    // Network/CORS/SSRF error, fallback to candidate heuristics
    candidates.push(...getPlatformFeedCandidates(targetUrl));
  }

  // Deduplicate candidates
  candidates = [...new Set(candidates)];

  // Try each candidate URL sequentially
  for (const candidate of candidates) {
    try {
      const candRes = await fetch(candidate, { headers: reqHeaders });
      if (!candRes.ok) continue;

      const candText = await candRes.text();
      const feed = parseFeed(candText);
      return { feedUrl: candidate, feed, rawText: candText, headers: candRes.headers };
    } catch {
      // Continue to next candidate
    }
  }

  throw new Error(`No valid RSS, Atom, or JSON feed could be found at ${targetUrl}`);
}
