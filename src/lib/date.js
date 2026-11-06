/**
 * Date and relative time formatting helpers with full i18n support
 */

export function formatRelativeTime(dateInput, lang = 'en') {
  if (!dateInput) return '';
  let date;
  if (dateInput instanceof Date) {
    date = dateInput;
  } else if (typeof dateInput === 'number') {
    // If timestamp is in seconds (< 100 billion, before year 5138), convert to milliseconds
    date = new Date(dateInput < 1e11 ? dateInput * 1000 : dateInput);
  } else {
    const str = String(dateInput).trim();
    const numeric = Number(str);
    if (!isNaN(numeric) && /^\d+$/.test(str)) {
      date = new Date(numeric < 1e11 ? numeric * 1000 : numeric);
    } else {
      date = new Date(str);
    }
  }

  if (isNaN(date.getTime())) return '';
  const now = new Date();
  const diffSec = Math.floor((now - date) / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  const cleanLang = (lang || 'en').toLowerCase();

  if (cleanLang === 'en' || cleanLang.startsWith('en-')) {
    if (diffSec < 60) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    const opts = { month: 'short', day: 'numeric' };
    if (date.getFullYear() !== now.getFullYear()) {
      opts.year = 'numeric';
    }
    return date.toLocaleDateString('en-US', opts);
  }

  if (cleanLang === 'uk' || cleanLang.startsWith('uk-') || cleanLang === 'ru' || cleanLang.startsWith('ru-')) {
    if (diffSec < 60) return 'щойно';
    if (diffMin < 60) return `${diffMin} хв тому`;
    if (diffHours < 24) return `${diffHours} год тому`;
    if (diffDays === 1) return 'учора';
    if (diffDays < 7) return `${diffDays} дн. тому`;
    const opts = { month: 'short', day: 'numeric' };
    if (date.getFullYear() !== now.getFullYear()) {
      opts.year = 'numeric';
    }
    return date.toLocaleDateString('uk-UA', opts);
  }

  // Other supported languages: use Intl.RelativeTimeFormat
  const localeMap = {
    'zh-hans': 'zh-CN',
    'zh-hant': 'zh-TW',
    'zh': 'zh-CN',
  };
  const intlLocale = localeMap[cleanLang] || cleanLang;

  try {
    const rtf = new Intl.RelativeTimeFormat(intlLocale, { numeric: 'auto' });
    if (diffSec < 60) return rtf.format(0, 'second');
    if (diffMin < 60) return rtf.format(-diffMin, 'minute');
    if (diffHours < 24) return rtf.format(-diffHours, 'hour');
    if (diffDays < 7) return rtf.format(-diffDays, 'day');
  } catch {
    // Fallback
  }

  const opts = { month: 'short', day: 'numeric' };
  if (date.getFullYear() !== now.getFullYear()) {
    opts.year = 'numeric';
  }
  return date.toLocaleDateString(intlLocale, opts);
}

