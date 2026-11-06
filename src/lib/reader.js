/**
 * Reader Typography & Theme Utilities
 */

/**
 * Strip inline colors, backgrounds, and sizes from extracted article HTML
 * so they don't break reader theme contrast (e.g. black-on-black or white-on-white).
 * Preserves structural/layout styles like text-align, width, height, margin.
 *
 * @param {string} html
 * @returns {string}
 */
export function cleanArticleContent(html) {
  if (!html || typeof html !== 'string') return '';
  return html
    // Strip color, background, font-size, font-family, line-height from inline style attributes
    .replace(/\s*style=(["'])([\s\S]*?)\1/gi, (match, quote, styleStr) => {
      const preserved = styleStr
        .split(';')
        .map((s) => s.trim())
        .filter((prop) => {
          if (!prop) return false;
          const colonIdx = prop.indexOf(':');
          if (colonIdx === -1) return false;
          const key = prop.slice(0, colonIdx).trim().toLowerCase();
          // Remove styles that conflict with reader typography and themes
          if (
            key === 'color' ||
            key === 'background' ||
            key === 'background-color' ||
            key === 'font-size' ||
            key === 'font-family' ||
            key === 'line-height'
          ) {
            return false;
          }
          return true;
        })
        .join('; ');
      return preserved ? ` style="${preserved}"` : '';
    })
    // Replace legacy font tags: <font color="..." size="..." face="..."> with neutral <span>
    .replace(/<font\b[^>]*>/gi, '<span>')
    .replace(/<\/font>/gi, '</span>')
    // Remove RSS syndication boilerplate notices (e.g. "The post ... first appeared on ...")
    .replace(/<p\b[^>]*>(?:The post\b|Цей пост\b|Пост\b|Стаття\b)[\s\S]*?(?:first appeared on|вперше з'явилося на|вперше опубліковано на)[\s\S]*?<\/p>/gi, '')
    // Remove promotional footers & widgets
    .replace(/<div\b[^>]*class=["'][^"']*(?:visitor-promo|ad-disclaimer-container|google-preferred-source-badge|outpost-pub-container|sharedaddy|jp-relatedposts|likes-widget-placeholder|jetpack-likes-widget-wrapper)[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, '');
}

export const FONT_SIZE_MAP = {
  sm: '0.9375rem',  // 15px
  base: '1.0625rem', // 17px
  lg: '1.25rem',    // 20px
  xl: '1.4375rem',  // 23px
};

export const LINE_HEIGHT_MAP = {
  tight: '1.45',
  normal: '1.7',
  loose: '2.0',
};

export const FONT_FAMILY_MAP = {
  sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  serif: 'Georgia, Cambria, "Times New Roman", Times, serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
};

export const FONT_SIZE_OPTIONS = [
  { key: 'sm', label: 'Small', text: 'A-' },
  { key: 'base', label: 'Default', text: 'A' },
  { key: 'lg', label: 'Large', text: 'A+' },
  { key: 'xl', label: 'Extra', text: 'A++' },
];

export const FONT_FAMILY_OPTIONS = [
  { key: 'sans', label: 'Sans (Clean)' },
  { key: 'serif', label: 'Serif (Book)' },
  { key: 'mono', label: 'Mono (Code)' },
];

export const LINE_SPACING_OPTIONS = [
  { key: 'tight', label: 'Tight' },
  { key: 'normal', label: 'Normal' },
  { key: 'loose', label: 'Relaxed' },
];

export const THEME_OPTIONS = [
  { key: 'system', label: 'System', icon: '📱', bg: 'var(--tg-theme-secondary-bg-color, #f3f4f6)', fg: 'var(--tg-theme-text-color, #111827)', border: 'var(--tg-theme-secondary-bg-color, #e5e7eb)' },
  { key: 'light', label: 'Light', icon: '☀️', bg: '#ffffff', fg: '#1e293b', border: '#e2e8f0' },
  { key: 'sepia', label: 'Sepia', icon: '📖', bg: '#fbf0d9', fg: '#433022', border: '#e8d6b8' },
  { key: 'dark', label: 'Dark', icon: '🌙', bg: '#18181b', fg: '#e4e4e7', border: '#3f3f46' },
  { key: 'oled', label: 'OLED', icon: '🖤', bg: '#000000', fg: '#ffffff', border: '#262626' },
];

