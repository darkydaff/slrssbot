/**
 * Pure JavaScript RSS/Atom/JSON Feed Parser for Telegram Serverless (V8 Isolate).
 * Zero external dependencies.
 */

/**
 * Decode XML entities and CDATA.
 * @param {string} text
 * @returns {string}
 */
export function decodeXml(text) {
  if (!text) return '';
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .trim();
}

/**
 * Extract attribute value from an XML tag string.
 * @param {string} tagStr
 * @param {string} attrName
 * @returns {string|null}
 */
function getAttribute(tagStr, attrName) {
  const match = tagStr.match(new RegExp(`${attrName}=["']([^"']+)["']`, 'i'));
  return match ? match[1] : null;
}

/**
 * Extract text content of the first matching XML tag.
 * Handles self-closing tags and CDATA.
 * @param {string} xml
 * @param {string} tagName
 * @returns {string|null}
 */
function getTagContent(xml, tagName) {
  // Support namespaced tags e.g. content:encoded or dc:creator
  const escaped = tagName.replace(':', '\\:');
  const regex = new RegExp(`<${escaped}(?:\\s+[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, 'i');
  const match = xml.match(regex);
  return match ? decodeXml(match[1]) : null;
}

/**
 * Extract all matching blocks of a specific tag (e.g. all <item> or <entry> blocks).
 * @param {string} xml
 * @param {string} tagName
 * @returns {string[]}
 */
function getAllTags(xml, tagName) {
  const escaped = tagName.replace(':', '\\:');
  const regex = new RegExp(`<${escaped}(?:\\s+[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, 'gi');
  const matches = [];
  let match;
  while ((match = regex.exec(xml)) !== null) {
    matches.push(match[1]);
  }
  return matches;
}

/**
 * Extract enclosures / media attachments from an XML item/entry.
 * @param {string} block
 * @returns {Array<{url: string, type: string}>}
 */
function extractMedia(block) {
  const media = [];
  
  // 1. <enclosure url="..." type="..."/>
  const enclosureRegex = /<enclosure\s+([^>]*?)\/?>/gi;
  let enc;
  while ((enc = enclosureRegex.exec(block)) !== null) {
    const url = getAttribute(enc[1], 'url');
    const type = getAttribute(enc[1], 'type') || '';
    if (url) media.push({ url, type });
  }

  // 2. <media:content url="..." medium="image".../>
  const mediaRegex = /<media:content\s+([^>]*?)\/?>/gi;
  let m;
  while ((m = mediaRegex.exec(block)) !== null) {
    const url = getAttribute(m[1], 'url');
    const type = getAttribute(m[1], 'type') || getAttribute(m[1], 'medium') || '';
    if (url) media.push({ url, type });
  }

  // 3. Fallback: find first <img> tag inside description/content
  const imgRegex = /<img\s+[^>]*?src=["']([^"']+)["'][^>]*?>/i;
  const imgMatch = block.match(imgRegex);
  if (imgMatch && imgMatch[1]) {
    media.push({ url: imgMatch[1], type: 'image' });
  }

  return media;
}

/**
 * Parse an RSS 2.0 / RSS 1.0 feed XML string.
 * @param {string} xml
 * @returns {{title: string, link: string, description: string, items: Array}}
 */
function parseRss(xml) {
  const channelMatch = xml.match(/<channel(?:[\s>])([\s\S]*?)<\/channel>/i);
  const channelXml = channelMatch ? channelMatch[1] : xml;

  const title = getTagContent(channelXml, 'title') || 'Untitled Feed';
  const link = getTagContent(channelXml, 'link') || '';
  const description = getTagContent(channelXml, 'description') || '';

  const itemBlocks = getAllTags(xml, 'item');
  const items = itemBlocks.map((block) => {
    const itemTitle = getTagContent(block, 'title') || '';
    const itemLink = getTagContent(block, 'link') || '';
    const guid = getTagContent(block, 'guid') || itemLink || itemTitle;
    const contentEncoded = getTagContent(block, 'content:encoded');
    const description = getTagContent(block, 'description') || '';
    const author = getTagContent(block, 'dc:creator') || getTagContent(block, 'author') || '';
    const pubDateStr = getTagContent(block, 'pubDate') || getTagContent(block, 'dc:date');
    const pubDate = pubDateStr ? new Date(pubDateStr) : null;
    const media = extractMedia(block);

    return {
      guid: guid.trim(),
      title: itemTitle.trim(),
      link: itemLink.trim(),
      author: author.trim(),
      content: contentEncoded || description,
      pubDate: pubDate && !isNaN(pubDate.getTime()) ? pubDate : null,
      media,
    };
  });

  return { title, link, description, items };
}

/**
 * Parse an Atom 1.0 feed XML string.
 * @param {string} xml
 * @returns {{title: string, link: string, description: string, items: Array}}
 */
function parseAtom(xml) {
  const title = getTagContent(xml, 'title') || 'Untitled Atom Feed';
  const subtitle = getTagContent(xml, 'subtitle') || '';

  // In Atom, <link href="..." rel="alternate"/>
  let feedLink = '';
  const linkMatches = xml.match(/<link\s+[^>]*?href=["']([^"']+)["'][^>]*?>/gi) || [];
  for (const l of linkMatches) {
    if (!l.includes('rel=') || l.includes('rel="alternate"') || l.includes("rel='alternate'")) {
      feedLink = getAttribute(l, 'href') || '';
      break;
    }
  }

  const entryBlocks = getAllTags(xml, 'entry');
  const items = entryBlocks.map((block) => {
    const entryTitle = getTagContent(block, 'title') || '';
    const id = getTagContent(block, 'id') || '';
    
    // Find entry link
    let entryLink = '';
    const entryLinks = block.match(/<link\s+[^>]*?href=["']([^"']+)["'][^>]*?>/gi) || [];
    for (const el of entryLinks) {
      const rel = getAttribute(el, 'rel');
      if (!rel || rel === 'alternate') {
        entryLink = getAttribute(el, 'href') || '';
        break;
      }
    }
    if (!entryLink && entryLinks.length > 0) {
      entryLink = getAttribute(entryLinks[0], 'href') || '';
    }

    const summary = getTagContent(block, 'summary');
    const content = getTagContent(block, 'content');
    const author = getTagContent(block, 'name') || '';
    const updatedStr = getTagContent(block, 'updated') || getTagContent(block, 'published');
    const pubDate = updatedStr ? new Date(updatedStr) : null;
    const media = extractMedia(block);

    return {
      guid: (id || entryLink || entryTitle).trim(),
      title: entryTitle.trim(),
      link: entryLink.trim(),
      author: author.trim(),
      content: content || summary || '',
      pubDate: pubDate && !isNaN(pubDate.getTime()) ? pubDate : null,
      media,
    };
  });

  return { title, link: feedLink, description: subtitle, items };
}

/**
 * Parse a JSON Feed (version 1 or 1.1).
 * @param {string} text
 * @returns {{title: string, link: string, description: string, items: Array}}
 */
function parseJsonFeed(text) {
  const json = JSON.parse(text);
  const title = json.title || 'Untitled JSON Feed';
  const link = json.home_page_url || json.feed_url || '';
  const description = json.description || '';

  const items = (json.items || []).map((item) => {
    const media = [];
    if (item.image) {
      media.push({ url: item.image, type: 'image' });
    }
    if (item.attachments) {
      for (const att of item.attachments) {
        if (att.url) {
          media.push({ url: att.url, type: att.mime_type || '' });
        }
      }
    }

    const pubDate = item.date_published ? new Date(item.date_published) : null;

    return {
      guid: String(item.id || item.url || item.title).trim(),
      title: String(item.title || '').trim(),
      link: String(item.url || '').trim(),
      author: item.author?.name || item.authors?.[0]?.name || '',
      content: item.content_html || item.content_text || item.summary || '',
      pubDate: pubDate && !isNaN(pubDate.getTime()) ? pubDate : null,
      media,
    };
  });

  return { title, link, description, items };
}

/**
 * Universal feed parser. Detects RSS, Atom, or JSON Feed automatically.
 * @param {string} rawContent
 * @returns {{title: string, link: string, description: string, items: Array}}
 */
export function parseFeed(rawContent) {
  if (!rawContent || typeof rawContent !== 'string') {
    throw new Error('Feed content must be a non-empty string');
  }

  const trimmed = rawContent.trim();

  // 1. JSON Feed check
  if (trimmed.startsWith('{') && trimmed.includes('"version"') && trimmed.includes('jsonfeed.org')) {
    return parseJsonFeed(trimmed);
  }

  // 2. Atom Feed check
  if (trimmed.includes('<feed') && (trimmed.includes('http://www.w3.org/2005/Atom') || trimmed.includes('<entry>'))) {
    return parseAtom(trimmed);
  }

  // 3. RSS Feed check (RSS 0.9x, 1.0, 2.0)
  if (trimmed.includes('<rss') || trimmed.includes('<channel>') || trimmed.includes('<rdf:RDF')) {
    return parseRss(trimmed);
  }

  // 4. Fallback heuristic: check for <entry> vs <item>
  if (trimmed.includes('<entry')) {
    return parseAtom(trimmed);
  }
  if (trimmed.includes('<item')) {
    return parseRss(trimmed);
  }

  throw new Error('Unrecognized feed format (neither RSS, Atom, nor JSON Feed)');
}

