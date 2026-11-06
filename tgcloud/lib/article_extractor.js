/**
 * Pure JavaScript Full-Text Article Extractor for Telegram Serverless (V8 Isolate).
 * Extracts clean readable article content from web pages (9to5Google, Android Police, Substack, Medium, etc.).
 * Zero external dependencies.
 */

import { fetch } from 'sdk';
import { decodeEntities } from './telegraph.js';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 (compatible; TelegramRSSBot/2.0)';

/**
 * Check if RSS item content is merely a teaser/snippet rather than a full article.
 * @param {string} content
 * @returns {boolean}
 */
export function isTeaserContent(content) {
  if (!content) return true;
  const trimmed = content.trim();

  // 1. If content is already long and substantive (>= 1500 chars), it is definitively a full article
  if (trimmed.length >= 1500) {
    return false;
  }

  // 2. Under 500 characters is almost always an excerpt/summary
  if (trimmed.length < 500) {
    return true;
  }

  // 3. For snippets between 500 and 1500 characters, check if it terminates with teaser patterns
  const teaserPatterns = [
    /class=["'][^"']*(?:more-link|read-more|post-more|link-more|continue-reading|post-excerpt)[^"']*["']/i,
    /id=["']more-\d+["']/i,
    /<a\b[^>]*>[\s\S]*?(?:more…|more\.\.\.|read more|continue reading|view post|read the full post|читати далі|читать далее|подробнее|далі|weiterlesen|lire la suite|leer más)[\s\S]*?<\/a>/i,
    /(?:читати далі|читать далее|подробнее|read more|continue reading)[\s\S]*?(?:<\/a>|<\/p>|$)/i,
    /(?:\[&#8230;\]|\[\.\.\.\]|…|&hellip;)\s*(?:<\/p>)?\s*$/i,
    /…\s*$/i,
  ];

  return teaserPatterns.some((pattern) => pattern.test(trimmed));
}

/**
 * Resolve relative URL to absolute URL against a base URL.
 * @param {string} relative
 * @param {string} base
 * @returns {string}
 */
function resolveUrl(relative, base) {
  if (!relative || typeof relative !== 'string') return '';
  const clean = relative.trim();
  if (clean.startsWith('data:') || clean.startsWith('blob:') || clean.startsWith('javascript:')) {
    return '';
  }
  try {
    return new URL(clean, base).href;
  } catch {
    return clean;
  }
}

/**
 * Extract content inside an HTML opening tag while balancing nested tags of the same type.
 * Prevents premature truncation at the first nested </div>.
 * @param {string} html
 * @param {RegExp} openTagRegex
 * @returns {string|null}
 */
export function extractBalancedTag(html, openTagRegex) {
  const match = openTagRegex.exec(html);
  if (!match) return null;

  const contentStart = match.index + match[0].length;
  const tagName = match[1].toLowerCase();

  let depth = 1;
  const tagFinder = new RegExp(`<\/?${tagName}\\b[^>]*>`, 'gi');
  tagFinder.lastIndex = contentStart;

  let tagMatch;
  while ((tagMatch = tagFinder.exec(html)) !== null) {
    const isClose = tagMatch[0].startsWith('</');
    const isSelfClosing = tagMatch[0].endsWith('/>');
    if (isSelfClosing) continue;

    if (isClose) {
      depth--;
      if (depth === 0) {
        return html.slice(contentStart, tagMatch.index);
      }
    } else {
      depth++;
    }
  }

  return html.slice(contentStart);
}

/**
 * Clean and normalize image tags in extracted HTML.
 * Resolves lazy-loaded attributes (data-src, data-original, srcset) to real absolute src.
 * @param {string} html
 * @param {string} baseUrl
 * @returns {string}
 */
function normalizeImagesAndLinks(html, baseUrl) {
  let res = html;

  // 1. Normalize <img> tags
  res = res.replace(/<img\b([^>]*)>/gi, (match, attrs) => {
    // Check for lazy-loaded src
    const dataSrcMatch = attrs.match(/(?:data-src|data-original|data-lazy-src)=["']([^"']+)["']/i);
    const srcMatch = attrs.match(/\bsrc=["']([^"']+)["']/i);

    let chosenSrc = dataSrcMatch ? dataSrcMatch[1] : (srcMatch ? srcMatch[1] : '');

    // If src is a tiny SVG or 1x1 spacer, try srcset
    if ((!chosenSrc || chosenSrc.startsWith('data:')) && attrs.includes('srcset=')) {
      const srcsetMatch = attrs.match(/srcset=["']([^"']+)["']/i);
      if (srcsetMatch) {
        const candidates = srcsetMatch[1].split(',').map((s) => s.trim().split(/\s+/)[0]);
        if (candidates.length > 0 && candidates[candidates.length - 1]) {
          chosenSrc = candidates[candidates.length - 1];
        }
      }
    }

    if (!chosenSrc || chosenSrc.startsWith('data:')) {
      return '';
    }

    const absSrc = resolveUrl(chosenSrc, baseUrl);
    const altMatch = attrs.match(/\balt=["']([^"']*)["']/i);
    const alt = altMatch ? ` alt="${altMatch[1]}"` : '';

    return `<img src="${absSrc}"${alt}/>`;
  });

  // 2. Normalize <a> tags
  res = res.replace(/<a\b([^>]*)>/gi, (match, attrs) => {
    const hrefMatch = attrs.match(/\bhref=["']([^"']+)["']/i);
    if (!hrefMatch) return '<a>';
    const absHref = resolveUrl(hrefMatch[1], baseUrl);
    return `<a href="${absHref}">`;
  });

  return res;
}

/**
 * Extract clean article metadata and body from raw webpage HTML.
 * @param {string} html
 * @param {string} pageUrl
 * @returns {{title: string, author: string, leadImage: string|null, contentHtml: string}|null}
 */
export function extractArticleFromHtml(html, pageUrl) {
  if (!html || typeof html !== 'string') return null;

  // 1. Extract metadata
  const ogTitleMatch = html.match(/<meta property=["']og:title["'] content=["']([^"']+)["']/i);
  const docTitleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  let title = ogTitleMatch ? ogTitleMatch[1] : (docTitleMatch ? docTitleMatch[1] : '');
  title = decodeEntities(title.replace(/\s+[–—\-|\\]\s+.*$/i, '').trim());

  const ogImageMatch = html.match(/<meta property=["']og:image["'] content=["']([^"']+)["']/i);
  const leadImage = ogImageMatch ? decodeEntities(resolveUrl(ogImageMatch[1], pageUrl)) : null;

  const authorMeta = html.match(/<meta\s+name=["']author["']\s+content=["']([^"']+)["']/i) ||
                     html.match(/<meta\s+property=["']article:author["']\s+content=["']([^"']+)["']/i);
  let author = authorMeta ? decodeEntities(authorMeta[1].trim()) : '';

  if (!author) {
    const authorSpan = html.match(/<(?:span|a|div)\b[^>]*class=["'][^"']*(?:author-name|author__name|byline|author)[^"']*["'][^>]*>([\s\S]*?)<\/(?:span|a|div)>/i);
    if (authorSpan) {
      author = decodeEntities(authorSpan[1].replace(/<[^>]+>/g, '').trim());
    } else {
      const addressMatch = html.match(/<address\b[^>]*>([\s\S]*?)<\/address>/i);
      if (addressMatch) {
        author = decodeEntities(addressMatch[1].replace(/<[^>]+>/g, '').trim());
      }
    }
  }

  // 2. Remove script, style, comments, nav, headers, footers, sidebars, forms
  let cleanHtml = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, '')
    .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, '')
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '')
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '')
    .replace(/<aside\b[^<]*(?:(?!<\/aside>)<[^<]*)*<\/aside>/gi, '')
    .replace(/<form\b[^<]*(?:(?!<\/form>)<[^<]*)*<\/form>/gi, '')
    .replace(/<button\b[^<]*(?:(?!<\/button>)<[^<]*)*<\/button>/gi, '');

  // 3. Remove known advertisement and widget elements
  cleanHtml = cleanHtml.replace(/<div\b[^>]*class=["'][^"']*(?:advertisement|ad-container|ad_container|ad-wrapper|dfp-ad|widget_text|social-share|related-posts|comments|comment-section|newsletter-signup|cookie-banner|author-card|author-box|author-profile|author-bio|post-author|article-author)[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, '');

  // 4. Locate article container using balanced tag matching (prevents premature closure at nested <div>s)
  const isTelegraph = Boolean(pageUrl && (pageUrl.includes('telegra.ph') || pageUrl.includes('tephra.io')));
  const minTextLength = isTelegraph ? 50 : 300;

  const containerOpenTags = [
    // Standard CMS post containers (e.g. WordPress, Ghost, Substack, Medium, Telegraph, The Verge, Ars Technica)
    /<(div|article)\b[^>]*class=["'][^"']*(?:post-content|entry-content|\bentry\b|post-entry|post-body|entry-body|article-content|article__content|article__body|story-body|article-body|c-entry-content|gh-content|available-content|body__content|article-inner|tl_article_content)[^"']*["'][^>]*>/i,
    /<(div|article)\b[^>]*id=["'](?:_tl_editor|_tl_article_content|article-body|post-content)["'][^>]*>/i,
    // HTML5 article tag
    /<(article)\b[^>]*>/i,
    // Schema.org articleBody
    /<(div)\b[^>]*itemprop=["']articleBody["'][^>]*>/i,
    // Main content wrapper
    /<(main)\b[^>]*>/i,
  ];

  let rawContent = '';
  for (const pattern of containerOpenTags) {
    const extracted = extractBalancedTag(cleanHtml, pattern);
    if (extracted) {
      const textOnly = extracted.replace(/<[^>]+>/g, '').trim();
      if (textOnly.length >= minTextLength) {
        rawContent = extracted;
        break;
      }
    }
  }

  // Fallback: If no recognized container found, look for largest block with paragraphs
  if (!rawContent) {
    const divBlocks = cleanHtml.match(/<div\b[^>]*>([\s\S]*?)<\/div>/gi) || [];
    let bestBlock = '';
    let maxParagraphs = 0;

    for (const b of divBlocks) {
      const pCount = (b.match(/<p\b/gi) || []).length;
      if (pCount > maxParagraphs) {
        maxParagraphs = pCount;
        bestBlock = b;
      }
    }

    if (maxParagraphs >= 3) {
      rawContent = bestBlock;
    }
  }

  if (!rawContent) {
    return null;
  }

  // 5. Normalize images, links and relative paths
  let contentHtml = normalizeImagesAndLinks(rawContent, pageUrl);

  // 6. Strip any residual "Read more" / "Читати далі" buttons or teaser links inside the extracted content
  contentHtml = contentHtml
    .replace(/<div\b[^>]*class=["'][^"']*(?:link-more|more-link)[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, '')
    .replace(/<p\b[^>]*class=["'][^"']*(?:link-more|more-link)[^"']*["'][^>]*>[\s\S]*?<\/p>/gi, '');

  return {
    title: title || 'Untitled Article',
    author: author || '',
    leadImage,
    contentHtml,
  };
}

/**
 * Fetch a webpage directly and extract its article content.
 * Gracefully handles timeouts or 403 blocks.
 * @param {string} url
 * @param {object} [opts]
 * @returns {Promise<{title: string, author: string, leadImage: string|null, contentHtml: string}|null>}
 */
export async function fetchAndExtractArticle(url, opts = {}) {
  if (!url || !url.startsWith('http')) return null;

  try {
    const headers = {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    };

    let res = null;
    const fetchOptions = { headers };
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
      try {
        fetchOptions.signal = AbortSignal.timeout(8000);
      } catch {}
    }

    try {
      res = await fetch(url, fetchOptions);
    } catch (fetchErr) {
      // If bare apex domain failed network/DNS, attempt with www. prefix
      if (!url.includes('://www.')) {
        try {
          const u = new URL(url);
          u.hostname = `www.${u.hostname}`;
          res = await fetch(u.toString(), fetchOptions);
        } catch {}
      }
      if (!res) {
        console.warn('[fetchAndExtractArticle] fetch error:', url, fetchErr?.message);
        return null;
      }
    }

    if (!res.ok) {
      if (!url.includes('://www.')) {
        try {
          const u = new URL(url);
          u.hostname = `www.${u.hostname}`;
          const wwwRes = await fetch(u.toString(), fetchOptions);
          if (wwwRes.ok) {
            res = wwwRes;
          }
        } catch {}
      }
      if (!res.ok) {
        console.warn('[fetchAndExtractArticle] fetch failed:', url, res.status, res.statusText);
        return null;
      }
    }

    const htmlText = await res.text();
    return extractArticleFromHtml(htmlText, url);
  } catch (err) {
    console.warn('[fetchAndExtractArticle] error:', err?.message || err);
    return null;
  }
}

