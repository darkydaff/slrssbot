/**
 * OPML (Outline Processor Markup Language) Import and Export Utilities.
 * Supports hierarchical folder/category structure as used by Fluent Reader,
 * Google Reader API, NetNewsWire, Feedly, and Inoreader.
 */

import { decodeXml } from './rss.js';

/**
 * Parse an OPML file string into an array of feed objects with category support.
 * Handles nested folder outlines (<outline text="Tech"><outline xmlUrl="..."/></outline>).
 * @param {string} xml
 * @returns {Array<{title: string, xmlUrl: string, htmlUrl: string, category: string}>}
 */
export function parseOpml(xml) {
  if (!xml || typeof xml !== 'string') return [];

  const feeds = [];
  // Tokenize outline opening tags, closing tags, and self-closing tags
  const tokenRegex = /<(\/)?outline\b([^>]*?)(\/)?>/gi;
  const categoryStack = [];
  let match;

  while ((match = tokenRegex.exec(xml)) !== null) {
    const isClosing = Boolean(match[1]);
    const attrs = match[2] || '';
    const isSelfClosing = Boolean(match[3]);

    if (isClosing) {
      if (categoryStack.length > 0) {
        categoryStack.pop();
      }
      continue;
    }

    const xmlUrlMatch = attrs.match(/xmlUrl=["']([^"']+)["']/i);
    const titleMatch = attrs.match(/(?:title|text)=["']([^"']+)["']/i);

    if (xmlUrlMatch) {
      // It's a feed subscription outline
      const xmlUrl = decodeXml(xmlUrlMatch[1]);
      const title = titleMatch ? decodeXml(titleMatch[1]) : xmlUrl;
      const htmlUrlMatch = attrs.match(/htmlUrl=["']([^"']+)["']/i);
      const htmlUrl = htmlUrlMatch ? decodeXml(htmlUrlMatch[1]) : '';
      const category = categoryStack.length > 0 ? categoryStack[categoryStack.length - 1] : 'General';

      feeds.push({ title, xmlUrl, htmlUrl, category });

      // If it wasn't self-closing but had xmlUrl (rare), and wasn't explicitly closed
      if (!isSelfClosing && attrs.includes('>')) {
        // leaf item
      }
    } else {
      // It's a category/folder outline
      const folderName = titleMatch ? decodeXml(titleMatch[1]).trim() : '';
      if (!isSelfClosing && folderName) {
        categoryStack.push(folderName);
      }
    }
  }

  return feeds;
}

/**
 * Generate an OPML 2.0 XML string from a list of subscriptions, grouped by category.
 * @param {Array<{title?: string, customTitle?: string, feedUrl: string, category?: string}>} subscriptions
 * @param {string} [title]
 * @returns {string}
 */
export function generateOpml(subscriptions, title = 'Telegram RSS Subscriptions') {
  const now = new Date().toUTCString();
  const escapeAttr = (s) =>
    (s || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  // Group subscriptions by category
  const groups = new Map();
  for (const sub of subscriptions) {
    const cat = (sub.category || 'General').trim() || 'General';
    if (!groups.has(cat)) {
      groups.set(cat, []);
    }
    groups.get(cat).push(sub);
  }

  let outlines = '';

  for (const [category, subs] of groups.entries()) {
    const catAttr = escapeAttr(category);
    const isGeneral = category === 'General' && groups.size === 1;

    if (!isGeneral) {
      outlines += `    <outline text="${catAttr}" title="${catAttr}">\n`;
    }

    const indent = isGeneral ? '    ' : '      ';
    for (const sub of subs) {
      const subTitle = escapeAttr(sub.customTitle || sub.title || sub.feedUrl);
      const subUrl = escapeAttr(sub.feedUrl || sub.xmlUrl);
      const htmlAttr = sub.siteUrl ? ` htmlUrl="${escapeAttr(sub.siteUrl)}"` : '';
      outlines += `${indent}<outline type="rss" text="${subTitle}" title="${subTitle}" xmlUrl="${subUrl}"${htmlAttr}/>\n`;
    }

    if (!isGeneral) {
      outlines += `    </outline>\n`;
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>${escapeAttr(title)}</title>
    <dateCreated>${now}</dateCreated>
  </head>
  <body>
${outlines}  </body>
</opml>`;
}
