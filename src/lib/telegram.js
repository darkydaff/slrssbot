/**
 * Telegram WebApp Integration Utilities
 */

export const tg = typeof window !== 'undefined' ? window.Telegram?.WebApp : null;

/**
 * Helper to check if a hex color is dark
 */
function isColorDark(hex) {
  if (!hex || typeof hex !== 'string') return false;
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return false;
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return (r * 0.299 + g * 0.587 + b * 0.114) < 128;
}

/**
 * Initialize WebApp viewport and theme
 */
export function initTelegramApp() {
  if (!tg) return;
  try {
    tg.ready();
    tg.expand();
    tg.enableClosingConfirmation?.();

    const syncTheme = () => {
      const isDark =
        tg.colorScheme === 'dark' ||
        (tg.themeParams?.bg_color && isColorDark(tg.themeParams.bg_color)) ||
        (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);

      if (isDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }

      try {
        if (tg.setHeaderColor) {
          tg.setHeaderColor(tg.themeParams?.bg_color || 'bg_color');
        }
        if (tg.setBackgroundColor) {
          tg.setBackgroundColor(tg.themeParams?.bg_color || 'bg_color');
        }
      } catch {
        // Ignore header/background color errors if unsupported
      }
    };

    syncTheme();
    tg.onEvent?.('themeChanged', syncTheme);
  } catch (err) {
    console.warn('Error initializing Telegram WebApp:', err);
  }
}

/**
 * Trigger haptic vibration on user action
 * @param {'light'|'medium'|'heavy'|'rigid'|'soft'|'success'|'error'|'warning'} type
 */
export function hapticFeedback(type = 'light') {
  if (!tg?.HapticFeedback) return;
  try {
    if (['success', 'error', 'warning'].includes(type)) {
      tg.HapticFeedback.notificationOccurred(type);
    } else {
      tg.HapticFeedback.impactOccurred(type);
    }
  } catch {
    // Ignore in unsupported environments
  }
}

/**
 * Configure Telegram native BackButton
 * @param {(() => void)|null} onBackHandler
 */
export function setupBackButton(onBackHandler) {
  if (!tg?.BackButton) return () => {};

  if (onBackHandler) {
    tg.BackButton.show();
    tg.BackButton.onClick(onBackHandler);
    return () => {
      tg.BackButton.offClick(onBackHandler);
      tg.BackButton.hide();
    };
  } else {
    tg.BackButton.hide();
    return () => {};
  }
}

/**
 * Open external link using Telegram WebApp API
 * @param {string} url
 */
export function openExternalLink(url) {
  if (!url) return;
  if (tg?.openLink) {
    tg.openLink(url);
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

/**
 * Share URL or text via Telegram
 * @param {string} url
 * @param {string} text
 */
export function shareToTelegram(url, text = '') {
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  openExternalLink(shareUrl);
}

/**
 * Get current authenticated Telegram user info
 */
export function getTelegramUser() {
  return tg?.initDataUnsafe?.user || {
    id: 99999999,
    first_name: 'Demo',
    last_name: 'User',
    username: 'demouser',
  };
}

