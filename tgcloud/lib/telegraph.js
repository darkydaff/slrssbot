/**
 * Telegraph API Client for Instant View articles.
 * https://telegra.ph/api
 *
 * Supports rich DOM AST generation, entity decoding,
 * persistent token storage via botConfig in DB, and 64KB safe payload budgeting.
 */

import { fetch } from 'sdk';
import { botConfig } from '../schema.js';
import { eq } from 'sdk/db';

const TELEGRAPH_ENDPOINTS = [
  'https://slrssbot-poller.darkydaff.workers.dev/telegraph',
  'https://api.telegra.ph',
];

/**
 * Dispatch Telegraph API request with automatic edge proxy fallback.
 * @param {string} method
 * @param {object} payload
 * @returns {Promise<any>}
 */
async function telegraphRequest(method, payload) {
  let lastError = null;
  for (const endpoint of TELEGRAPH_ENDPOINTS) {
    try {
      const res = await fetch(`${endpoint}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        lastError = new Error(`HTTP ${res.status}`);
        continue;
      }
      const data = await res.json();
      if (!data.ok) {
        lastError = new Error(data.error || 'Telegraph API error');
        continue;
      }
      return data.result;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error(`Telegraph ${method} failed`);
}

// Cached in-memory token per isolate execution
let cachedAccessToken = null;

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
 * Extract an attribute from a tag string.
 * @param {string} tagStr
 * @param {string} attrName
 * @returns {string|null}
 */
export function getAttribute(tagStr, attrName) {
  if (!tagStr) return null;
  const match = tagStr.match(new RegExp(`${attrName}\\s*=\\s*(?:["']([^"']+)["']|([^\\s>]+))`, 'i'));
  const val = match ? (match[1] || match[2] || '') : null;
  return val ? decodeEntities(val.trim()) : null;
}

/**
 * Format recognized video/social URLs into Telegraph's native embed path.
 * Returns null if not recognized as a supported Telegraph embed.
 * @param {string} url
 * @returns {string|null}
 */
export function extractVideoEmbed(url) {
  if (!url || typeof url !== 'string') return null;
  const clean = decodeEntities(url.trim());
  const ytMatch = clean.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i);
  if (ytMatch) {
    return `/embed/youtube?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${ytMatch[1]}`)}`;
  }
  const vimeoMatch = clean.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
  if (vimeoMatch) {
    return `/embed/vimeo?url=${encodeURIComponent(`https://vimeo.com/${vimeoMatch[1]}`)}`;
  }
  const twMatch = clean.match(/(?:twitter|x)\.com\/\w+\/status\/(\d+)/i);
  if (twMatch) {
    return `/embed/twitter?url=${encodeURIComponent(clean)}`;
  }
  return null;
}

/**
 * Validate that a URL looks like an actual image and not an HTML embed or video stream.
 * @param {string} url
 * @returns {boolean}
 */
export function isValidImageUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const clean = url.trim();
  if (clean.startsWith('data:') || clean.startsWith('blob:') || clean.startsWith('javascript:')) return false;
  if (extractVideoEmbed(clean)) return false;
  if (/youtube\.com|youtu\.be|vimeo\.com|twitter\.com|x\.com/i.test(clean)) return false;
  if (/\/(embed|player)\//i.test(clean)) return false;
  if (/\.(mp4|webm|ogg|mp3|wav|m4a|html|php)(\?.*)?$/i.test(clean)) return false;
  return true;
}

/**
 * Check if a list of nodes contains non-whitespace text or visual elements.
 * Prevents emitting empty paragraphs that break Instant View readers.
 * @param {Array<object|string>} nodes
 * @returns {boolean}
 */
export function hasMeaningfulContent(nodes) {
  if (!nodes || nodes.length === 0) return false;
  return nodes.some((n) => {
    if (typeof n === 'string') return n.trim().length > 0;
    if (n && (n.tag === 'img' || n.tag === 'hr' || n.tag === 'iframe' || n.tag === 'video')) return true;
    if (n && n.children) return hasMeaningfulContent(n.children);
    return false;
  });
}

/**
 * Parse an inline HTML fragment into Telegraph inline nodes.
 * Supports: b, strong, i, em, u, s, code, a, and text strings.
 * @param {string} html
 * @returns {Array<object|string>}
 */
export function parseInlineNodes(html) {
  if (!html) return [];

  const root = { children: [] };
  const stack = [root];

  const tagRegex = /<(\/)?([a-z0-9_-]+)([^>]*)>/gi;
  let lastIndex = 0;
  let match;

  while ((match = tagRegex.exec(html)) !== null) {
    const textChunk = html.slice(lastIndex, match.index);
    if (textChunk) {
      const decoded = decodeEntities(textChunk);
      if (decoded) {
        stack[stack.length - 1].children.push(decoded);
      }
    }
    lastIndex = tagRegex.lastIndex;

    const isClose = Boolean(match[1]);
    const rawTag = match[2].toLowerCase();
    const attrsStr = match[3] || '';

    // Convert tag name to Telegraph allowed inline tag
    let normTag = null;
    if (rawTag === 'b' || rawTag === 'strong') normTag = 'b';
    else if (rawTag === 'i' || rawTag === 'em') normTag = 'i';
    else if (rawTag === 'u' || rawTag === 'ins') normTag = 'u';
    else if (rawTag === 's' || rawTag === 'strike' || rawTag === 'del') normTag = 's';
    else if (rawTag === 'code') normTag = 'code';
    else if (rawTag === 'a') normTag = 'a';
    else if (rawTag === 'br') {
      stack[stack.length - 1].children.push('\n');
      continue;
    }

    if (!normTag) {
      continue;
    }

    if (isClose) {
      // Find matching tag in stack from top to bottom
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tag === normTag) {
          stack.length = i;
          break;
        }
      }
    } else {
      const node = { tag: normTag, children: [] };
      if (normTag === 'a') {
        const href = getAttribute(attrsStr, 'href');
        if (href && (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('tg://') || href.startsWith('mailto:'))) {
          node.attrs = { href };
        } else {
          // If no valid href, omit link and keep contents
          normTag = null;
        }
      }

      if (normTag) {
        stack[stack.length - 1].children.push(node);
        stack.push(node);
      }
    }
  }

  const remaining = html.slice(lastIndex);
  if (remaining) {
    const decoded = decodeEntities(remaining);
    if (decoded) {
      stack[stack.length - 1].children.push(decoded);
    }
  }

  // Flatten empty or text-only children arrays
  function cleanChildren(children) {
    const res = [];
    for (const c of children) {
      if (typeof c === 'string') {
        if (c) res.push(c);
      } else if (c && c.tag) {
        c.children = cleanChildren(c.children || []);
        if (c.children.length > 0 || c.tag === 'img' || c.tag === 'hr') {
          res.push(c);
        }
      }
    }
    return res;
  }

  return cleanChildren(root.children);
}

/**
 * Convert arbitrary article HTML into compliant Telegraph Node AST.
 * Allowed Telegraph tags:
 * a, aside, b, blockquote, br, code, em, figcaption, figure, h3, h4, hr, i, iframe, img, li, ol, p, pre, s, strong, u, ul, video.
 * Enforces ~55KB max JSON payload size for Telegraph API safety.
 *
 * @param {string} html
 * @param {object} [opts]
 * @returns {Array<object|string>}
 */
export function htmlToTelegraphNodes(html, opts = {}) {
  if (!html) return [{ tag: 'p', children: ['No content.'] }];

  // 1. Strip comments, dangerous, and irrelevant elements
  let cleaned = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '')
    .replace(/<form\b[^<]*(?:(?!<\/form>)<[^<]*)*<\/form>/gi, '')
    .replace(/<button\b[^<]*(?:(?!<\/button>)<[^<]*)*<\/button>/gi, '')
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '');

  // 2. Tokenize blocks: figure, h1-h6, p, blockquote, ul, ol, pre, hr, iframe, video, table
  const blockRegex = /<(figure|h[1-6]|p|blockquote|ul|ol|pre|hr|iframe|video|table)\b([^>]*)>([\s\S]*?)<\/\1>|<(hr|img|iframe|video)\b([^>]*)\/?>/gi;
  const nodes = [];
  let lastIndex = 0;
  let match;

  function pushNode(node) {
    if (!node) return;
    const currentSize = JSON.stringify(nodes).length;
    if (currentSize > 55000) {
      return false; // Stop adding when reaching payload ceiling
    }
    nodes.push(node);
    return true;
  }

  while ((match = blockRegex.exec(cleaned)) !== null) {
    // Process loose text between blocks
    const between = cleaned.slice(lastIndex, match.index).trim();
    if (between) {
      const paragraphs = between.split(/\n{2,}/);
      for (const p of paragraphs) {
        const cleanP = p.replace(/<[^>]+>/g, '').trim();
        if (cleanP) {
          const inline = parseInlineNodes(p);
          if (hasMeaningfulContent(inline)) {
            if (!pushNode({ tag: 'p', children: inline })) break;
          }
        }
      }
    }
    lastIndex = blockRegex.lastIndex;

    const tagName = (match[1] || match[4] || '').toLowerCase();
    const tagAttrs = match[2] || match[5] || '';
    const innerHtml = match[3] || '';

    // Standalone <img>
    if (tagName === 'img') {
      const src = getAttribute(tagAttrs, 'src') || getAttribute(tagAttrs, 'data-src');
      if (src && isValidImageUrl(src)) {
        pushNode({
          tag: 'figure',
          children: [{ tag: 'img', attrs: { src } }],
        });
      }
      continue;
    }

    // Standalone <iframe> (outside figure)
    if (tagName === 'iframe') {
      const src = getAttribute(tagAttrs, 'src') || getAttribute(innerHtml, 'src');
      if (src) {
        const embed = extractVideoEmbed(src);
        if (embed) {
          pushNode({ tag: 'figure', children: [{ tag: 'iframe', attrs: { src: embed } }] });
        } else {
          pushNode({
            tag: 'p',
            children: ['🎧 ', { tag: 'a', attrs: { href: src }, children: ['Listen to embedded media / podcast'] }],
          });
        }
      }
      continue;
    }

    // Standalone <video> (outside figure)
    if (tagName === 'video') {
      const src = getAttribute(tagAttrs, 'src') || getAttribute(innerHtml, 'src');
      if (src) {
        pushNode({ tag: 'figure', children: [{ tag: 'video', attrs: { src } }] });
      }
      continue;
    }

    // <figure> container (may hold img, iframe, or video)
    if (tagName === 'figure') {
      // 1. Check for iframe (e.g. YouTube / Vimeo / Podcast embed)
      const iframeMatch = innerHtml.match(/<iframe\b([^>]*)>/i);
      if (iframeMatch) {
        const src = getAttribute(iframeMatch[1], 'src');
        if (src) {
          const embed = extractVideoEmbed(src);
          if (embed) {
            pushNode({ tag: 'figure', children: [{ tag: 'iframe', attrs: { src: embed } }] });
          } else {
            pushNode({
              tag: 'p',
              children: ['🎧 ', { tag: 'a', attrs: { href: src }, children: ['Listen to embedded media / podcast'] }],
            });
          }
        }
        continue;
      }

      // 2. Check for img
      const imgMatch = innerHtml.match(/<img\b([^>]*)>/i);
      if (imgMatch) {
        const imgSrc = getAttribute(imgMatch[1], 'src') || getAttribute(imgMatch[1], 'data-src');
        if (imgSrc && isValidImageUrl(imgSrc)) {
          const figChildren = [{ tag: 'img', attrs: { src: imgSrc } }];
          const capMatch = innerHtml.match(/<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/i);
          if (capMatch && capMatch[1].trim()) {
            const capText = decodeEntities(capMatch[1].replace(/<[^>]+>/g, '').trim());
            if (capText) {
              figChildren.push({ tag: 'figcaption', children: [capText] });
            }
          }
          pushNode({ tag: 'figure', children: figChildren });
        }
        continue;
      }

      // 3. Check for video
      const vidMatch = innerHtml.match(/<video\b([^>]*)>/i);
      if (vidMatch) {
        const src = getAttribute(vidMatch[1], 'src');
        if (src) {
          pushNode({ tag: 'figure', children: [{ tag: 'video', attrs: { src } }] });
        }
        continue;
      }

      continue;
    }

    // Headings: h1, h2, h3 -> h3; h4, h5, h6 -> h4
    if (/^h[1-6]$/.test(tagName)) {
      const targetTag = ['h1', 'h2', 'h3'].includes(tagName) ? 'h3' : 'h4';
      const inline = parseInlineNodes(innerHtml);
      if (hasMeaningfulContent(inline)) {
        pushNode({ tag: targetTag, children: inline });
      }
      continue;
    }

    // Blockquote
    if (tagName === 'blockquote') {
      const inline = parseInlineNodes(innerHtml);
      if (hasMeaningfulContent(inline)) {
        pushNode({ tag: 'blockquote', children: inline });
      }
      continue;
    }

    // Lists (ul, ol)
    if (tagName === 'ul' || tagName === 'ol') {
      const liMatches = innerHtml.match(/<li\b[^>]*>([\s\S]*?)<\/li>/gi) || [];
      const liNodes = [];
      for (const li of liMatches) {
        const liContent = li.replace(/^<li\b[^>]*>/i, '').replace(/<\/li>$/i, '');
        const liInline = parseInlineNodes(liContent);
        if (hasMeaningfulContent(liInline)) {
          liNodes.push({ tag: 'li', children: liInline });
        }
      }
      if (liNodes.length > 0) {
        pushNode({ tag: tagName, children: liNodes });
      }
      continue;
    }

    // Preformatted Code
    if (tagName === 'pre') {
      const codeClean = decodeEntities(innerHtml.replace(/<\/?code\b[^>]*>/gi, '').trim());
      if (codeClean) {
        pushNode({ tag: 'pre', children: [codeClean] });
      }
      continue;
    }

    // Tables (convert to clean monospace preformatted blocks)
    if (tagName === 'table') {
      const rows = innerHtml.match(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi) || [];
      const lines = [];
      for (const row of rows) {
        const cells = (row.match(/<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi) || [])
          .map((c) => decodeEntities(c.replace(/<[^>]+>/g, '').trim()))
          .filter(Boolean);
        if (cells.length > 0) {
          lines.push(cells.join('  |  '));
        }
      }
      if (lines.length > 0) {
        pushNode({ tag: 'pre', children: [lines.join('\n')] });
      }
      continue;
    }

    // Horizontal Rule
    if (tagName === 'hr') {
      pushNode({ tag: 'hr' });
      continue;
    }

    // Standard Paragraph
    if (tagName === 'p') {
      // Check if paragraph is just wrapping an iframe
      const pIframeMatch = innerHtml.match(/<iframe\b([^>]*)>/i);
      if (pIframeMatch) {
        const src = getAttribute(pIframeMatch[1], 'src');
        if (src) {
          const embed = extractVideoEmbed(src);
          if (embed) {
            pushNode({ tag: 'figure', children: [{ tag: 'iframe', attrs: { src: embed } }] });
          } else {
            pushNode({
              tag: 'p',
              children: ['🎧 ', { tag: 'a', attrs: { href: src }, children: ['Listen to embedded media / podcast'] }],
            });
          }
          continue;
        }
      }

      // Check if paragraph is just wrapping an image
      const pImgMatch = innerHtml.match(/<img\b([^>]*)>/i);
      if (pImgMatch) {
        const imgSrc = getAttribute(pImgMatch[1], 'src') || getAttribute(pImgMatch[1], 'data-src');
        if (imgSrc && isValidImageUrl(imgSrc)) {
          const nonImgText = innerHtml.replace(/<img\b[^>]*>/gi, '').replace(/<[^>]+>/g, '').trim();
          if (!nonImgText) {
            pushNode({
              tag: 'figure',
              children: [{ tag: 'img', attrs: { src: imgSrc } }],
            });
            continue;
          }
        }
      }

      const inline = parseInlineNodes(innerHtml);
      if (hasMeaningfulContent(inline)) {
        pushNode({ tag: 'p', children: inline });
      }
    }
  }

  // Handle remaining trailing text
  const trailing = cleaned.slice(lastIndex).trim();
  if (trailing) {
    const inline = parseInlineNodes(trailing);
    if (hasMeaningfulContent(inline)) {
      pushNode({ tag: 'p', children: inline });
    }
  }

  // Fallback if no block matched (e.g. raw text or simple HTML without paragraph tags)
  if (nodes.length === 0) {
    const rawParagraphs = cleaned
      .replace(/<br\s*\/?>/gi, '\n')
      .split(/\n{2,}/)
      .map((s) => s.trim())
      .filter(Boolean);

    for (const p of rawParagraphs) {
      const inline = parseInlineNodes(p);
      if (hasMeaningfulContent(inline)) {
        nodes.push({ tag: 'p', children: inline });
      }
    }
  }

  if (nodes.length === 0) {
    nodes.push({ tag: 'p', children: ['Content available at original link.'] });
  }

  return nodes;
}

/**
 * Create a Telegraph account or return cached/persisted token.
 * Persists token to database table `bot_config` if db is available.
 * @param {string} [shortName]
 * @param {object} [dbInstance]
 * @returns {Promise<string>} access_token
 */
export async function getOrCreateTelegraphAccount(shortName = 'RSSTelegramBot', dbInstance = null) {
  if (cachedAccessToken) return cachedAccessToken;

  // 1. Try reading persisted token from database
  if (dbInstance) {
    try {
      const stored = await dbInstance
        .select()
        .from(botConfig)
        .where(eq(botConfig.key, 'telegraph_token'))
        .get();

      if (stored?.value) {
        cachedAccessToken = stored.value;
        return cachedAccessToken;
      }
    } catch {
      // Ignore DB fetch failure and continue to create
    }
  }

  // 2. Create account on Telegraph
  const result = await telegraphRequest('createAccount', {
    short_name: shortName,
    author_name: 'RSS to Telegram',
  });

  cachedAccessToken = result.access_token;

  // 3. Persist new token to database for future isolate runs
  if (dbInstance && cachedAccessToken) {
    try {
      await dbInstance.insert(botConfig).values({
        key: 'telegraph_token',
        value: cachedAccessToken,
        updatedAt: new Date(),
      }).onConflictDoUpdate({
        target: botConfig.key,
        set: { value: cachedAccessToken, updatedAt: new Date() },
      }).run();
    } catch {
      // Non-fatal if config table cannot be written
    }
  }

  return cachedAccessToken;
}

/**
 * Create a Telegraph page and return its URL for Instant View.
 * @param {object} params
 * @param {string} params.title Article title
 * @param {string} params.contentHtml Full HTML content of the article
 * @param {string} [params.authorName]
 * @param {string} [params.authorUrl]
 * @param {string} [params.leadImageUrl] Cover image to prepend if not present
 * @param {object} [params.dbInstance]
 * @returns {Promise<string>} Full telegra.ph URL
 */
export async function createTelegraphPage({ title, contentHtml, authorName, authorUrl, leadImageUrl, dbInstance }) {
  const token = await getOrCreateTelegraphAccount('RSSTelegramBot', dbInstance);
  const contentNodes = htmlToTelegraphNodes(contentHtml, { authorUrl });

  // If a lead cover image is available and the content doesn't start with one, prepend it
  if (leadImageUrl && isValidImageUrl(leadImageUrl)) {
    const startsWithImage = contentNodes[0]?.tag === 'figure' && contentNodes[0]?.children?.[0]?.tag === 'img';
    if (!startsWithImage) {
      contentNodes.unshift({
        tag: 'figure',
        children: [{ tag: 'img', attrs: { src: leadImageUrl } }],
      });
    }
  }

  const payload = {
    access_token: token,
    title: (title || 'Untitled Post').slice(0, 250),
    author_name: (authorName || 'RSS Feed').slice(0, 120),
    author_url: authorUrl || undefined,
    content: contentNodes,
    return_content: false,
  };

  const result = await telegraphRequest('createPage', payload);
  return result.url;
}
