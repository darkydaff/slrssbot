/**
 * OPML (Outline Processor Markup Language) Import and Export Utilities.
 */

import { decodeXml } from './rss.js';

/**
 * Parse an OPML file string into an array of feed objects.
 * @param {string} xml
 * @returns {Array<{title: string, xmlUrl: string, htmlUrl: string}>}
 */
export function parseOpml(xml) {
  if (!xml || typeof xml !== 'string') return [];

  const feeds = [];
  const outlineRegex = /<outline\s+([^>]*?)\/?>/gi;
  let match;

  while ((match = outlineRegex.exec(xml)) !== null) {
    const attrs = match[1];
    const xmlUrlMatch = attrs.match(/xmlUrl=["']([^"']+)["']/i);
    if (!xmlUrlMatch) continue;

    const xmlUrl = decodeXml(xmlUrlMatch[1]);
    const titleMatch = attrs.match(/(?:title|text)=["']([^"']+)["']/i);
    const title = titleMatch ? decodeXml(titleMatch[1]) : xmlUrl;
    const htmlUrlMatch = attrs.match(/htmlUrl=["']([^"']+)["']/i);
    const htmlUrl = htmlUrlMatch ? decodeXml(htmlUrlMatch[1]) : '';

    feeds.push({ title, xmlUrl, htmlUrl });
  }

  return feeds;
}

/**
 * Generate an OPML 2.0 XML string from a list of subscriptions.
 * @param {Array<{title: string, feedUrl: string}>} subscriptions
 * @param {string} [title]
 * @returns {string}
 */
export function generateOpml(subscriptions, title = 'Telegram RSS Subscriptions') {
  const now = new Date().toUTCString();
  const escapeAttr = (s) => (s || '').replace(/"/g, '&quot;').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  let outlines = '';
  for (const sub of subscriptions) {
    const subTitle = escapeAttr(sub.customTitle || sub.title || sub.feedUrl);
    const subUrl = escapeAttr(sub.feedUrl);
    outlines += `      <outline type="rss" text="${subTitle}" title="${subTitle}" xmlUrl="${subUrl}"/>\n`;
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

