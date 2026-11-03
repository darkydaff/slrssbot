/**
 * Telegraph API Client for Instant View articles.
 * https://telegra.ph/api
 */

import { fetch } from 'sdk';

const TELEGRAPH_API = 'https://api.telegra.ph';

// Cached in-memory token per isolate execution
let cachedAccessToken = null;

/**
 * Create a Telegraph account or return cached token.
 * @param {string} [shortName]
 * @returns {Promise<string>} access_token
 */
export async function getOrCreateTelegraphAccount(shortName = 'RSSTelegramBot') {
  if (cachedAccessToken) return cachedAccessToken;

  const res = await fetch(`${TELEGRAPH_API}/createAccount`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      short_name: shortName,
      author_name: 'RSS to Telegram',
    }),
  });

  if (!res.ok) {
    throw new Error(`Telegraph createAccount failed: HTTP ${res.status}`);
  }

  const data = await res.json();
  if (!data.ok) {
    throw new Error(`Telegraph createAccount error: ${data.error}`);
  }

  cachedAccessToken = data.result.access_token;
  return cachedAccessToken;
}

/**
 * Convert simple HTML string into Telegraph Node array.
 * Allowed tags: a, aside, b, blockquote, br, code, em, figcaption, figure, h3, h4, hr, i, iframe, img, li, ol, p, pre, s, strong, u, ul, video.
 * @param {string} html
 * @returns {Array<object|string>}
 */
export function htmlToTelegraphNodes(html) {
  if (!html) return [{ tag: 'p', children: ['No content.'] }];

  // Split by block tags to form paragraphs
  const blocks = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|blockquote|h[1-6])>/gi, '\n\n')
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);

  const nodes = [];

  for (const block of blocks) {
    // Check if block contains an image: <img ... src="..." ...>
    const imgMatch = block.match(/<img\s+[^>]*?src=["']([^"']+)["'][^>]*?>/i);
    if (imgMatch && imgMatch[1]) {
      nodes.push({
        tag: 'figure',
        children: [
          { tag: 'img', attrs: { src: imgMatch[1] } },
        ],
      });
      continue;
    }

    // Strip remaining tags except simple text for telegraph nodes
    const cleanText = block.replace(/<[^>]+>/g, '').trim();
    if (cleanText) {
      nodes.push({
        tag: 'p',
        children: [cleanText],
      });
    }
  }

  if (nodes.length === 0) {
    nodes.push({ tag: 'p', children: ['Content available at original link.'] });
  }

  return nodes;
}

/**
 * Create a Telegraph page and return its URL for Instant View.
 * @param {object} params
 * @param {string} params.title Article title
 * @param {string} params.contentHtml Full HTML content of the article
 * @param {string} [params.authorName]
 * @param {string} [params.authorUrl]
 * @returns {Promise<string>} Full telegra.ph URL
 */
export async function createTelegraphPage({ title, contentHtml, authorName, authorUrl }) {
  const token = await getOrCreateTelegraphAccount();
  const contentNodes = htmlToTelegraphNodes(contentHtml);

  const payload = {
    access_token: token,
    title: (title || 'Untitled Post').slice(0, 250),
    author_name: (authorName || 'RSS Feed').slice(0, 120),
    author_url: authorUrl || undefined,
    content: contentNodes,
    return_content: false,
  };

  const res = await fetch(`${TELEGRAPH_API}/createPage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`Telegraph createPage failed: HTTP ${res.status}`);
  }

  const data = await res.json();
  if (!data.ok) {
    throw new Error(`Telegraph error: ${data.error}`);
  }

  return data.result.url;
}

