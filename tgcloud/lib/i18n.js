/**
 * tgcloud/lib/i18n.js — Internationalization for Telegram Bot
 *
 * Supported languages:
 *  - en: English (default)
 *  - zh-Hans: 简体中文 (Simplified Chinese)
 *  - zh-Hant: 繁體中文 (Traditional Chinese)
 *  - es: Español (Spanish)
 *  - it: Italiano (Italian)
 *  - fr: Français (French)
 *  - de: Deutsch (German)
 *  - uk: Українська (Ukrainian)
 *  - tr: Türkçe (Turkish)
 *  - ja: 日本語 (Japanese)
 *  - pt: Português (Portuguese)
 *  - id: Bahasa Indonesia (Indonesian)
 *
 * Note: Russian ('ru') is normalized to Ukrainian ('uk').
 */

import { db } from 'sdk';
import { eq } from 'sdk/db';
import { chatSettings } from '../schema.js';

export const SUPPORTED_LANGUAGES = {
  en: { name: 'English', native: 'English', flag: '🇬🇧' },
  'zh-Hans': { name: 'Simplified Chinese', native: '简体中文', flag: '🇨🇳' },
  'zh-Hant': { name: 'Traditional Chinese', native: '繁體中文', flag: '🇹🇼' },
  es: { name: 'Spanish', native: 'Español', flag: '🇪🇸' },
  it: { name: 'Italian', native: 'Italiano', flag: '🇮🇹' },
  fr: { name: 'French', native: 'Français', flag: '🇫🇷' },
  de: { name: 'German', native: 'Deutsch', flag: '🇩🇪' },
  uk: { name: 'Ukrainian', native: 'Українська', flag: '🇺🇦' },
  tr: { name: 'Turkish', native: 'Türkçe', flag: '🇹🇷' },
  ja: { name: 'Japanese', native: '日本語', flag: '🇯🇵' },
  pt: { name: 'Portuguese', native: 'Português', flag: '🇵🇹' },
  id: { name: 'Indonesian', native: 'Bahasa Indonesia', flag: '🇮🇩' },
};

export function normalizeLanguageCode(rawCode) {
  if (!rawCode || typeof rawCode !== 'string') return 'en';
  const clean = rawCode.toLowerCase().trim().replace('_', '-');

  // Policy: Russian ('ru') is normalized to Ukrainian ('uk')
  if (clean === 'ru' || clean.startsWith('ru-') || clean.startsWith('ru_')) {
    return 'uk';
  }

  if (SUPPORTED_LANGUAGES[clean]) return clean;

  if (clean.startsWith('zh-hant') || clean.startsWith('zh-tw') || clean.startsWith('zh-hk')) {
    return 'zh-Hant';
  }
  if (clean.startsWith('zh')) {
    return 'zh-Hans';
  }
  if (clean.startsWith('es')) return 'es';
  if (clean.startsWith('it')) return 'it';
  if (clean.startsWith('fr')) return 'fr';
  if (clean.startsWith('de')) return 'de';
  if (clean.startsWith('uk')) return 'uk';
  if (clean.startsWith('tr')) return 'tr';
  if (clean.startsWith('ja')) return 'ja';
  if (clean.startsWith('pt')) return 'pt';
  if (clean.startsWith('id')) return 'id';

  return 'en';
}

const MESSAGES = {
  "en": {
    "welcome_title": "<b>Welcome to RSS to Telegram Bot!</b> 📡",
    "welcome_desc": "A modern serverless RSS reader powered by Telegram's cloud platform.",
    "key_features": "✨ <b>Key Capabilities:</b>",
    "feat_reader": "• <b>📖 Mini App Reader:</b> Open the full-featured RSS Reader WebApp to read full articles, browse feeds, and manage subscriptions!",
    "feat_autodetect": "• <b>Auto-Detection:</b> Paste any website or blog link (Substack, WordPress, Medium, 9to5Google, GitHub) — the bot finds the feed automatically!",
    "feat_instant_view": "• <b>⚡ Instant View & Full-Text:</b> Turns truncated news snippets and long Telegram posts into Telegraph Instant View articles with direct links back to origin.",
    "feat_channel": "• <b>Telegram Channels:</b> Follow public Telegram channels via <code>/sub @channel</code> with album support and instant view.",
    "feat_broadcast": "• <b>📢 Channel Delivery:</b> Send RSS feeds into channels you manage via <code>/sub @your_channel &lt;url&gt;</code>.",
    "feat_opml": "• <b>OPML Import/Export:</b> Send an <code>.opml</code> file to import all feeds at once.",
    "commands_header": "📋 <b>Commands:</b>",
    "cmd_reader": "• <code>/reader</code> — Open the RSS Reader Mini App",
    "cmd_sub": "• <code>/sub &lt;url|@channel&gt;</code> — Subscribe to a feed or Telegram channel",
    "cmd_unsub": "• <code>/unsub [url]</code> — Unsubscribe (or tap inline button)",
    "cmd_list": "• <code>/list</code> — View active subscriptions with quick actions",
    "cmd_set": "• <code>/set</code> — Toggle delivery mode (⚡ Instant View, 🖼️ Photo Banner, 🔗 Link Only)",
    "cmd_lang": "• <code>/lang</code> — Change language interface",
    "cmd_poll": "• <code>/poll</code> — Check for new updates",
    "cmd_force_poll": "• <code>/force_poll</code> — Force-send the latest message immediately",
    "cmd_export": "• <code>/export</code> — Export subscriptions as OPML",
    "cmd_help": "• <code>/help</code> — Detailed syntax and examples",
    "btn_open_reader": "📖 Open RSS Reader",
    "btn_my_subs": "📋 My Subscriptions",
    "btn_help": "❓ Help",
    "btn_settings": "⚙️ Settings",
    "btn_language": "🌐 Language",
    "btn_read_original": "🌐 Read Original",
    "btn_instant_view": "⚡ Instant View",
    "btn_channel_post": "📢 Channel Post",
    "btn_watch_video": "📹 Watch Video in Telegram",
    "btn_listen_podcast": "🎙️ Listen to Podcast Episode",
    "help_guide_title": "📖 <b>RSS to Telegram Bot — Command Guide</b>",
    "sub_help": "➕ <b>Subscribe:</b>\n• <code>/sub https://techcrunch.com</code> <i>(Auto-detects WordPress/Atom/RSS)</i>\n• <code>/sub https://example.substack.com</code> <i>(Auto-detects Substack)</i>\n• <code>/sub @channel</code> <i>(Follow a public Telegram channel)</i>\n• <code>/sub @my_channel https://feed-url</code> <i>(Deliver feeds to a channel you own)</i>",
    "unsub_help": "➖ <b>Unsubscribe:</b>\n• <code>/unsub &lt;url&gt;</code> — Unsubscribe a specific feed\n• <code>/unsub</code> — Interactive inline button list to remove feeds\n• <code>/unsub @my_channel &lt;url&gt;</code> — Remove from a channel",
    "manage_help": "📋 <b>Manage & Configure:</b>\n• <code>/list</code> — Show active subscriptions with fast unsubscribe buttons\n• <code>/set</code> — Change delivery mode (⚡ Instant View, 🖼️ Photo, 🔗 Link Only)\n• <code>/lang</code> — Switch language interface\n• <code>/poll</code> — Trigger immediate feed check\n• <code>/force_poll</code> — Force-send the latest message immediately\n• <code>/export</code> — Download all your feeds as an OPML file\n• <b>OPML Import:</b> Send any <code>.opml</code> file to import subscriptions automatically",
    "no_subs": "📭 You have no active subscriptions yet.\nAdd one with <code>/sub &lt;url|@channel&gt;</code>",
    "choose_lang": "🌐 <b>Choose your preferred language:</b>\nSelect an option below to change the bot interface language:",
    "lang_changed": "✅ Language changed to <b>{lang}</b>.",
    "invalid_url": "⚠️ Please provide a valid feed URL or @channel handle.",
    "sub_success": "✅ <b>Subscribed successfully!</b>\n\n📌 <b>Feed:</b> {title}\n🔗 <b>URL:</b> {url}",
    "already_subscribed": "ℹ️ You are already subscribed to this feed.",
    "sub_not_found": "⚠️ Subscription not found.",
    "unsub_success": "✅ Unsubscribed from: <b>{title}</b>",
    "settings_title": "⚙️ <b>Settings for:</b>\n<b>{title}</b>\n\n<b>Current Mode:</b> {mode}\n\nSelect delivery mode:",
    "mode_default": "⚡ Instant View / Preview (Default)",
    "mode_telegraph": "📄 Always Telegraph",
    "mode_photo": "🖼️ Photo Banner + Caption",
    "mode_link_only": "🔗 Link Only (Compact)",
    "force_poll_start": "⚡ <b>Force Polling:</b> Fetching the latest posts from your subscriptions...",
    "force_poll_done": "⚡ <b>Force Poll Complete:</b> Delivered <b>{count}</b> latest post(s) into this chat.",
    "btn_watch_youtube": "▶️ Watch on YouTube",
    "view_in_telegram": "View in Telegram",
    "listen_podcast": "Listen to Podcast Episode (Audio)",
    "watch_youtube": "Watch Video on YouTube",
    "watch_video_telegram": "Watch Video in Telegram",
    "forwarded_from": "Forwarded from",
    "in_reply_to": "In reply to",
    "post_num": "Post",
    "btn_back_settings": "« Back to Settings",
    "app_title": "RSS Reader WebApp",
    "btn_unsub_num": "❌ Unsub #{num}",
    "btn_auto_lang": "🌐 Auto (Telegram App)",
    "action_completed": "Action completed.",
    "feed_delivery_mode": "⚙️ <b>Configure Feed Delivery Mode:</b>\nSelect a subscription to change how it is sent:",
    "settings_updated": "✅ <b>Settings Updated!</b>\n\n<b>Feed:</b> {title}\n<b>New Mode:</b> {mode}",
    "select_feed_unsub": "<b>Select a feed to unsubscribe from {target}:</b>",
    "subs_for": "📋 <b>Subscriptions for {target} ({count}):</b>\n\n",
    "no_subs_for": "📭 <b>No active subscriptions for {target}.</b>\n\nAdd one using: <code>/sub &lt;url&gt;</code>",
    "already_subscribed_chat": "⚠️ <b>Already Subscribed:</b>\n<b>Target:</b> {target}\n<b>Feed:</b> <code>{url}</code>",
    "discovering_feed": "⏳ Discovering feed for <code>{url}</code>...",
    "sub_usage": "<b>Usage:</b>\n• <code>/sub &lt;url&gt;</code>\n• <code>/sub @channel &lt;url&gt;</code>\n\n<i>Example:</i>\n<code>/sub https://techcrunch.com</code>",
    "instant_view": "Instant View",
    "read_original": "Read Original",
    "view_post_in_telegram": "View post in Telegram"
  },
  "zh-Hans": {
    "welcome_title": "<b>欢迎使用 RSS to Telegram 机器人！</b> 📡",
    "welcome_desc": "基于 Telegram 云原生无服务器架构构建的高性能 RSS 阅读器。",
    "key_features": "✨ <b>核心功能：</b>",
    "feat_reader": "• <b>📖 小程序阅读器：</b> 启动功能完整的 RSS Reader WebApp，沉浸式阅读全文、浏览源及管理订阅！",
    "feat_autodetect": "• <b>智能源探测：</b> 粘贴任何网站或博客链接（Substack、WordPress、Medium、GitHub），自动发现 RSS/Atom 源！",
    "feat_instant_view": "• <b>⚡ 即时预览 (Instant View)：</b> 自动提取正文并转换为 Telegraph Instant View，提供原生极速阅读体验。",
    "feat_channel": "• <b>Telegram 频道订阅：</b> 支持使用 <code>/sub @channel</code> 订阅公开频道，完整保留相册与图文排版。",
    "feat_broadcast": "• <b>📢 频道广播：</b> 使用 <code>/sub @your_channel &lt;url&gt;</code> 将更新推送到你管理的频道。",
    "feat_opml": "• <b>OPML 导入与导出：</b> 直接发送 <code>.opml</code> 文件即可一键批量导入所有订阅。",
    "commands_header": "📋 <b>可用命令：</b>",
    "cmd_reader": "• <code>/reader</code> — 打开 RSS 阅读器小程序",
    "cmd_sub": "• <code>/sub &lt;链接|@频道&gt;</code> — 订阅 RSS 源或公开频道",
    "cmd_unsub": "• <code>/unsub [链接]</code> — 退订指定源或呼出交互退订列表",
    "cmd_list": "• <code>/list</code> — 查看当前订阅列表及快捷操作",
    "cmd_set": "• <code>/set</code> — 切换推送模式（⚡ 即时预览、🖼️ 大图模式、🔗 仅链接）",
    "cmd_lang": "• <code>/lang</code> — 切换界面语言",
    "cmd_poll": "• <code>/poll</code> — 立即检查新更新",
    "cmd_force_poll": "• <code>/force_poll</code> — 强制推送最新文章",
    "cmd_export": "• <code>/export</code> — 导出订阅为 OPML 文件",
    "cmd_help": "• <code>/help</code> — 详细语法与使用指南",
    "btn_open_reader": "📖 打开 RSS 阅读器",
    "btn_my_subs": "📋 我的订阅",
    "btn_help": "❓ 帮助指南",
    "btn_settings": "⚙️ 设置",
    "btn_language": "🌐 语言 (Language)",
    "btn_read_original": "🌐 查看原文",
    "btn_instant_view": "⚡ 即时预览",
    "btn_channel_post": "📢 原文消息",
    "btn_watch_video": "📹 在 Telegram 中观看视频",
    "btn_listen_podcast": "🎙️ 播放播客音频",
    "help_guide_title": "📖 <b>RSS to Telegram 机器人 — 命令指南</b>",
    "sub_help": "➕ <b>订阅方式：</b>\n• <code>/sub https://techcrunch.com</code> <i>(自动探测 WordPress/Atom/RSS)</i>\n• <code>/sub https://example.substack.com</code> <i>(自动探测 Substack)</i>\n• <code>/sub @channel</code> <i>(关注公开 Telegram 频道)</i>\n• <code>/sub @my_channel https://feed-url</code> <i>(推送到你管理的频道)</i>",
    "unsub_help": "➖ <b>退订方式：</b>\n• <code>/unsub &lt;url&gt;</code> — 退订指定源\n• <code>/unsub</code> — 呼出交互按钮退订\n• <code>/unsub @my_channel &lt;url&gt;</code> — 从频道退订",
    "manage_help": "📋 <b>管理与配置：</b>\n• <code>/list</code> — 显示活跃订阅并支持快速退订\n• <code>/set</code> — 调整推送模式 (⚡ 即时预览、🖼️ 大图模式、🔗 仅链接)\n• <code>/lang</code> — 切换界面语言\n• <code>/poll</code> — 立即执行更新探测\n• <code>/force_poll</code> — 强制推送最新文章\n• <code>/export</code> — 导出订阅为 OPML 备份\n• <b>OPML 导入：</b> 发送 <code>.opml</code> 文件即可自动批量导入",
    "no_subs": "📭 你当前没有任何订阅。\n请使用 <code>/sub &lt;url|@channel&gt;</code> 添加订阅。",
    "choose_lang": "🌐 <b>请选择你偏好的语言：</b>\n点击下方按钮切换机器人与小程序界面语言：",
    "lang_changed": "✅ 语言已更改为 <b>{lang}</b>。",
    "invalid_url": "⚠️ 请输入有效的 RSS 链接或 @频道 名称。",
    "sub_success": "✅ <b>订阅成功！</b>\n\n📌 <b>订阅源：</b> {title}\n🔗 <b>链接：</b> {url}",
    "already_subscribed": "ℹ️ 你已经订阅了该源。",
    "sub_not_found": "⚠️ 未找到该订阅。",
    "unsub_success": "✅ 已成功退订：<b>{title}</b>",
    "settings_title": "⚙️ <b>订阅设置：</b>\n<b>{title}</b>\n\n<b>当前模式：</b> {mode}\n\n选择推送模式：",
    "mode_default": "⚡ 即时预览 / 摘要 (默认)",
    "mode_telegraph": "📄 始终生成 Telegraph",
    "mode_photo": "🖼️ 大图配文模式",
    "mode_link_only": "🔗 仅发送链接 (精简)",
    "force_poll_start": "⚡ <b>强制更新探测中：</b> 正在拉取各订阅源最新文章...",
    "force_poll_done": "⚡ <b>强制更新完成：</b> 已将 <b>{count}</b> 篇最新文章推送到此聊天。",
    "btn_watch_youtube": "▶️ 在 YouTube 上观看",
    "view_in_telegram": "在 Telegram 中查看",
    "listen_podcast": "收听播客单集 (音频)",
    "watch_youtube": "在 YouTube 上观看视频",
    "watch_video_telegram": "在 Telegram 中观看视频",
    "forwarded_from": "转发自",
    "in_reply_to": "回复",
    "post_num": "消息",
    "btn_back_settings": "« 返回设置",
    "app_title": "RSS 阅读器小程序",
    "btn_unsub_num": "❌ 退订 #{num}",
    "btn_auto_lang": "🌐 自动 (跟随 Telegram 应用)",
    "action_completed": "操作已完成。",
    "feed_delivery_mode": "⚙️ <b>配置推送模式：</b>\n选择要调整推送方式的订阅：",
    "settings_updated": "✅ <b>设置已更新！</b>\n\n<b>订阅：</b> {title}\n<b>新模式：</b> {mode}",
    "select_feed_unsub": "<b>请选择要从 {target} 退订的源：</b>",
    "subs_for": "📋 <b>{target} 的当前订阅 ({count})：</b>\n\n",
    "no_subs_for": "📭 <b>{target} 暂无任何活跃订阅。</b>\n\n使用 <code>/sub &lt;链接&gt;</code> 添加订阅。",
    "already_subscribed_chat": "⚠️ <b>已存在订阅：</b>\n<b>目标：</b> {target}\n<b>源：</b> <code>{url}</code>",
    "discovering_feed": "⏳ 正在探测源地址 <code>{url}</code>...",
    "sub_usage": "<b>使用说明：</b>\n• <code>/sub &lt;链接&gt;</code>\n• <code>/sub @频道 &lt;链接&gt;</code>\n\n<i>示例：</i>\n<code>/sub https://techcrunch.com</code>",
    "instant_view": "即时预览",
    "read_original": "查看原文",
    "view_post_in_telegram": "在 Telegram 中查看消息"
  },
  "zh-Hant": {
    "welcome_title": "<b>歡迎使用 RSS to Telegram 機器人！</b> 📡",
    "welcome_desc": "基於 Telegram 雲原生無伺服器架構構建的高效能 RSS 閱讀器。",
    "key_features": "✨ <b>核心功能：</b>",
    "feat_reader": "• <b>📖 小程式閱讀器：</b> 開啟功能完整的 RSS Reader WebApp，沉浸式閱讀全文、瀏覽來源及管理訂閱！",
    "feat_autodetect": "• <b>智慧來源偵測：</b> 貼上任何網站或部落格連結，自動發現 RSS/Atom 來源！",
    "feat_instant_view": "• <b>⚡ 即時預覽 (Instant View)：</b> 自動擷取內文並轉換為 Telegraph 即時預覽，提供原生極速閱讀體驗。",
    "feat_channel": "• <b>Telegram 頻道訂閱：</b> 支援使用 <code>/sub @channel</code> 訂閱公開頻道。",
    "feat_broadcast": "• <b>📢 頻道廣播：</b> 將更新推送到您管理的頻道。",
    "feat_opml": "• <b>OPML 匯入與匯出：</b> 發送 <code>.opml</code> 檔案即可批量匯入所有訂閱。",
    "commands_header": "📋 <b>可用指令：</b>",
    "cmd_reader": "• <code>/reader</code> — 開啟 RSS 閱讀器小程式",
    "cmd_sub": "• <code>/sub &lt;連結|@頻道&gt;</code> — 訂閱 RSS 來源或公開頻道",
    "cmd_unsub": "• <code>/unsub [連結]</code> — 退訂指定來源",
    "cmd_list": "• <code>/list</code> — 查看目前訂閱清單",
    "cmd_set": "• <code>/set</code> — 切換推送模式",
    "cmd_lang": "• <code>/lang</code> — 切換介面語言",
    "cmd_poll": "• <code>/poll</code> — 立即檢查新更新",
    "cmd_force_poll": "• <code>/force_poll</code> — 強制推送最新文章",
    "cmd_export": "• <code>/export</code> — 匯出訂閱為 OPML 檔案",
    "cmd_help": "• <code>/help</code> — 詳細說明與指南",
    "btn_open_reader": "📖 開啟 RSS 閱讀器",
    "btn_my_subs": "📋 我的訂閱",
    "btn_help": "❓ 說明指南",
    "btn_settings": "⚙️ 設定",
    "btn_language": "🌐 語言 (Language)",
    "btn_read_original": "🌐 查看原文",
    "btn_instant_view": "⚡ 即時預覽",
    "btn_channel_post": "📢 原文訊息",
    "btn_watch_video": "📹 在 Telegram 中觀看影片",
    "btn_listen_podcast": "🎙️ 播放 Podcast 音訊",
    "help_guide_title": "📖 <b>RSS to Telegram 機器人 — 指令指南</b>",
    "sub_help": "➕ <b>訂閱方式：</b>\n• <code>/sub https://techcrunch.com</code> <i>(自動探測 WordPress/Atom/RSS)</i>\n• <code>/sub https://example.substack.com</code> <i>(自動探測 Substack)</i>\n• <code>/sub @channel</code> <i>(關注公開 Telegram 頻道)</i>\n• <code>/sub @my_channel https://feed-url</code> <i>(推送到您管理的頻道)</i>",
    "unsub_help": "➖ <b>退訂方式：</b>\n• <code>/unsub &lt;url&gt;</code> — 退訂指定來源\n• <code>/unsub</code> — 呼出互動按鈕退訂\n• <code>/unsub @my_channel &lt;url&gt;</code> — 從頻道退訂",
    "manage_help": "📋 <b>管理與設定：</b>\n• <code>/list</code> — 顯示活躍訂閱並支援快速退訂\n• <code>/set</code> — 調整推送模式 (⚡ 即時預覽、🖼️ 大圖模式、🔗 僅連結)\n• <code>/lang</code> — 切換介面語言\n• <code>/poll</code> — 立即檢查更新\n• <code>/force_poll</code> — 強制推送最新文章\n• <code>/export</code> — 匯出訂閱為 OPML 備份\n• <b>OPML 匯入：</b> 發送 <code>.opml</code> 檔案即可自動批量匯入",
    "no_subs": "📭 目前沒有任何訂閱。\n請使用 <code>/sub &lt;url|@channel&gt;</code> 新增訂閱。",
    "choose_lang": "🌐 <b>請選擇偏好的語言：</b>",
    "lang_changed": "✅ 語言已更改為 <b>{lang}</b>。",
    "invalid_url": "⚠️ 請提供有效的 RSS 連結或 @頻道 名稱。",
    "sub_success": "✅ <b>訂閱成功！</b>\n\n📌 <b>訂閱源：</b> {title}\n🔗 <b>連結：</b> {url}",
    "already_subscribed": "ℹ️ 您已經訂閱過此來源。",
    "sub_not_found": "⚠️ 未找到該訂閱。",
    "unsub_success": "✅ 已成功退訂：<b>{title}</b>",
    "settings_title": "⚙️ <b>設定：</b>\n<b>{title}</b>\n\n<b>目前模式：</b> {mode}",
    "mode_default": "⚡ 即時預覽 / 摘要 (預設)",
    "mode_telegraph": "📄 始終生成 Telegraph",
    "mode_photo": "🖼️ 大圖配文模式",
    "mode_link_only": "🔗 僅發送連結 (精簡)",
    "force_poll_start": "⚡ 正在拉取各訂閱源最新文章...",
    "force_poll_done": "⚡ 已將 <b>{count}</b> 篇最新文章推送到此聊天。",
    "btn_watch_youtube": "▶️ 在 YouTube 上觀看",
    "view_in_telegram": "在 Telegram 中檢視",
    "listen_podcast": "收聽播客單集 (音訊)",
    "watch_youtube": "在 YouTube 上觀看影片",
    "watch_video_telegram": "在 Telegram 中觀看影片",
    "forwarded_from": "轉發自",
    "in_reply_to": "回覆",
    "post_num": "訊息",
    "btn_back_settings": "« 返回設定",
    "app_title": "RSS 閱讀器小程式",
    "btn_unsub_num": "❌ 退訂 #{num}",
    "btn_auto_lang": "🌐 自動 (跟隨 Telegram 應用)",
    "action_completed": "操作已完成。",
    "feed_delivery_mode": "⚙️ <b>設定推送模式：</b>\n選擇要調整推送方式的訂閱：",
    "settings_updated": "✅ <b>設定已更新！</b>\n\n<b>訂閱：</b> {title}\n<b>新模式：</b> {mode}",
    "select_feed_unsub": "<b>請選擇要從 {target} 退訂的來源：</b>",
    "subs_for": "📋 <b>{target} 的目前訂閱 ({count})：</b>\n\n",
    "no_subs_for": "📭 <b>{target} 目前沒有任何活躍訂閱。</b>\n\n使用 <code>/sub &lt;連結&gt;</code> 新增訂閱。",
    "already_subscribed_chat": "⚠️ <b>已存在訂閱：</b>\n<b>目標：</b> {target}\n<b>來源：</b> <code>{url}</code>",
    "discovering_feed": "⏳ 正在探測來源地址 <code>{url}</code>...",
    "sub_usage": "<b>使用說明：</b>\n• <code>/sub &lt;連結&gt;</code>\n• <code>/sub @頻道 &lt;連結&gt;</code>\n\n<i>範例：</i>\n<code>/sub https://techcrunch.com</code>",
    "instant_view": "即時預覽",
    "read_original": "查看原文",
    "view_post_in_telegram": "在 Telegram 中檢視訊息"
  },
  "es": {
    "welcome_title": "<b>¡Bienvenido al bot RSS para Telegram!</b> 📡",
    "welcome_desc": "Lector RSS serverless moderno y de alto rendimiento en la nube de Telegram.",
    "key_features": "✨ <b>Funcionalidades destacadas:</b>",
    "feat_reader": "• <b>📖 Mini App Reader:</b> ¡Abre la WebApp completa para leer artículos, navegar fuentes y gestionar suscripciones!",
    "feat_autodetect": "• <b>Detección automática:</b> Pega cualquier enlace de blog o web y el bot detecta el feed al instante.",
    "feat_instant_view": "• <b>⚡ Vista rápida:</b> Convierte noticias y publicaciones largas en artículos Telegraph de vista rápida.",
    "feat_channel": "• <b>Canales de Telegram:</b> Sigue canales públicos con <code>/sub @canal</code>.",
    "feat_broadcast": "• <b>📢 Publicación en canales:</b> Envía feeds a canales que administras con <code>/sub @tu_canal &lt;url&gt;</code>.",
    "feat_opml": "• <b>Importar/Exportar OPML:</b> Envía un archivo <code>.opml</code> para importar todos tus feeds a la vez.",
    "commands_header": "📋 <b>Comandos:</b>",
    "cmd_reader": "• <code>/reader</code> — Abrir la Mini App RSS Reader",
    "cmd_sub": "• <code>/sub &lt;url|@canal&gt;</code> — Suscribirse a un feed o canal",
    "cmd_unsub": "• <code>/unsub [url]</code> — Cancelar suscripción",
    "cmd_list": "• <code>/list</code> — Ver suscripciones activas",
    "cmd_set": "• <code>/set</code> — Configurar modo de entrega (⚡ Vista rápida, 🖼️ Foto, 🔗 Solo enlace)",
    "cmd_lang": "• <code>/lang</code> — Cambiar idioma",
    "cmd_poll": "• <code>/poll</code> — Buscar nuevas actualizaciones",
    "cmd_force_poll": "• <code>/force_poll</code> — Forzar envío del último post",
    "cmd_export": "• <code>/export</code> — Exportar suscripciones en OPML",
    "cmd_help": "• <code>/help</code> — Guía completa de ayuda",
    "btn_open_reader": "📖 Abrir lector RSS",
    "btn_my_subs": "📋 Mis suscripciones",
    "btn_help": "❓ Ayuda",
    "btn_settings": "⚙️ Ajustes",
    "btn_language": "🌐 Idioma",
    "btn_read_original": "🌐 Leer original",
    "btn_instant_view": "⚡ Vista rápida",
    "btn_channel_post": "📢 Ver en canal",
    "btn_watch_video": "📹 Ver video en Telegram",
    "btn_listen_podcast": "🎙️ Escuchar podcast",
    "help_guide_title": "📖 <b>Bot RSS para Telegram — Guía de comandos</b>",
    "sub_help": "➕ <b>Suscribirse:</b>\n• <code>/sub https://techcrunch.com</code> <i>(Detecta WordPress/Atom/RSS)</i>\n• <code>/sub https://example.substack.com</code> <i>(Detecta Substack)</i>\n• <code>/sub @canal</code> <i>(Seguir un canal público de Telegram)</i>\n• <code>/sub @mi_canal https://feed-url</code> <i>(Enviar publicaciones a tu canal)</i>",
    "unsub_help": "➖ <b>Cancelar suscripción:</b>\n• <code>/unsub &lt;url&gt;</code> — Cancelar suscripción a un feed\n• <code>/unsub</code> — Lista de botones interactivos para cancelar\n• <code>/unsub @mi_canal &lt;url&gt;</code> — Eliminar feed de un canal",
    "manage_help": "📋 <b>Gestión y configuración:</b>\n• <code>/list</code> — Ver suscripciones activas con botones de baja\n• <code>/set</code> — Cambiar modo de entrega (⚡ Vista rápida, 🖼️ Foto, 🔗 Solo enlace)\n• <code>/lang</code> — Cambiar idioma de la interfaz\n• <code>/poll</code> — Comprobar feeds de inmediato\n• <code>/force_poll</code> — Enviar la última publicación ahora\n• <code>/export</code> — Descargar suscripciones como archivo OPML\n• <b>Importar OPML:</b> Envía un archivo <code>.opml</code> para importar en lote",
    "no_subs": "📭 No tienes suscripciones activas todavía.\nAñade una con <code>/sub &lt;url|@canal&gt;</code>",
    "choose_lang": "🌐 <b>Elige tu idioma preferido:</b>",
    "lang_changed": "✅ Idioma cambiado a <b>{lang}</b>.",
    "invalid_url": "⚠️ Proporciona una URL de feed o canal @válido.",
    "sub_success": "✅ <b>¡Suscrito con éxito!</b>\n\n📌 <b>Feed:</b> {title}\n🔗 <b>URL:</b> {url}",
    "already_subscribed": "ℹ️ Ya estás suscrito a este feed.",
    "sub_not_found": "⚠️ Suscripción no encontrada.",
    "unsub_success": "✅ Suscripción cancelada para: <b>{title}</b>",
    "settings_title": "⚙️ <b>Ajustes para:</b>\n<b>{title}</b>\n\n<b>Modo actual:</b> {mode}",
    "mode_default": "⚡ Vista rápida (Por defecto)",
    "mode_telegraph": "📄 Siempre Telegraph",
    "mode_photo": "🖼️ Foto con texto",
    "mode_link_only": "🔗 Solo enlace (Compacto)",
    "force_poll_start": "⚡ Comprobando últimas publicaciones...",
    "force_poll_done": "⚡ Se enviaron <b>{count}</b> publicaciones recientes.",
    "btn_watch_youtube": "▶️ Ver en YouTube",
    "view_in_telegram": "Ver en Telegram",
    "listen_podcast": "Escuchar episodio de podcast (Audio)",
    "watch_youtube": "Ver video en YouTube",
    "watch_video_telegram": "Ver video en Telegram",
    "forwarded_from": "Reenviado de",
    "in_reply_to": "En respuesta a",
    "post_num": "Mensaje",
    "btn_back_settings": "« Volver a ajustes",
    "app_title": "Lector RSS Mini App",
    "btn_unsub_num": "❌ Cancelar #{num}",
    "btn_auto_lang": "🌐 Automático (App Telegram)",
    "action_completed": "Acción completada.",
    "feed_delivery_mode": "⚙️ <b>Configurar modo de entrega:</b>\nSelecciona una suscripción para cambiar cómo se envía:",
    "settings_updated": "✅ <b>¡Ajustes actualizados!</b>\n\n<b>Feed:</b> {title}\n<b>Nuevo modo:</b> {mode}",
    "select_feed_unsub": "<b>Selecciona un feed para cancelar suscripción en {target}:</b>",
    "subs_for": "📋 <b>Suscripciones para {target} ({count}):</b>\n\n",
    "no_subs_for": "📭 <b>No hay suscripciones activas para {target}.</b>\n\nAñade una con: <code>/sub &lt;url&gt;</code>",
    "already_subscribed_chat": "⚠️ <b>Ya suscrito:</b>\n<b>Destino:</b> {target}\n<b>Feed:</b> <code>{url}</code>",
    "discovering_feed": "⏳ Buscando feed para <code>{url}</code>...",
    "sub_usage": "<b>Uso:</b>\n• <code>/sub &lt;url&gt;</code>\n• <code>/sub @canal &lt;url&gt;</code>\n\n<i>Ejemplo:</i>\n<code>/sub https://techcrunch.com</code>",
    "instant_view": "Vista rápida",
    "read_original": "Leer original",
    "view_post_in_telegram": "Ver publicación en Telegram"
  },
  "it": {
    "welcome_title": "<b>Benvenuto nel bot RSS per Telegram!</b> 📡",
    "welcome_desc": "Un lettore RSS moderno e veloce basato sulla piattaforma cloud di Telegram.",
    "key_features": "✨ <b>Funzionalità principali:</b>",
    "feat_reader": "• <b>📖 Mini App Reader:</b> Apri la WebApp per leggere articoli completi e gestire i feed!",
    "feat_autodetect": "• <b>Rilevamento automatico:</b> Incolla qualsiasi link e il bot trova il feed RSS automaticamente.",
    "feat_instant_view": "• <b>⚡ Apertura rapida:</b> Converte articoli lunghi in pagine Telegraph ad apertura rapida.",
    "feat_channel": "• <b>Canali Telegram:</b> Segui canali pubblici con <code>/sub @canale</code>.",
    "feat_broadcast": "• <b>📢 Invio su canali:</b> Invia aggiornamenti ai tuoi canali.",
    "feat_opml": "• <b>Importazione/Esportazione OPML:</b> Invia un file <code>.opml</code> per importare tutti i feed.",
    "commands_header": "📋 <b>Comandi:</b>",
    "cmd_reader": "• <code>/reader</code> — Apri la Mini App Reader",
    "cmd_sub": "• <code>/sub &lt;url|@canale&gt;</code> — Iscriviti a un feed o canale",
    "cmd_unsub": "• <code>/unsub [url]</code> — Disiscriviti",
    "cmd_list": "• <code>/list</code> — Mostra le tue iscrizioni",
    "cmd_set": "• <code>/set</code> — Modalità di consegna (⚡ Apertura rapida, 🖼️ Foto, 🔗 Solo link)",
    "cmd_lang": "• <code>/lang</code> — Cambia lingua",
    "cmd_poll": "• <code>/poll</code> — Controlla aggiornamenti",
    "cmd_force_poll": "• <code>/force_poll</code> — Forza invio ultimi post",
    "cmd_export": "• <code>/export</code> — Esporta feed in OPML",
    "cmd_help": "• <code>/help</code> — Guida completa",
    "btn_open_reader": "📖 Apri RSS Reader",
    "btn_my_subs": "📋 Iscrizioni",
    "btn_help": "❓ Aiuto",
    "btn_settings": "⚙️ Impostazioni",
    "btn_language": "🌐 Lingua",
    "btn_read_original": "🌐 Leggi originale",
    "btn_instant_view": "⚡ Apertura rapida",
    "btn_channel_post": "📢 Post del canale",
    "btn_watch_video": "📹 Guarda video su Telegram",
    "btn_listen_podcast": "🎙️ Ascolta podcast",
    "help_guide_title": "📖 <b>Bot RSS per Telegram — Guida ai comandi</b>",
    "sub_help": "➕ <b>Iscriviti:</b>\n• <code>/sub https://techcrunch.com</code> <i>(Rileva automaticamente WordPress/Atom/RSS)</i>\n• <code>/sub https://example.substack.com</code> <i>(Rileva Substack)</i>\n• <code>/sub @canale</code> <i>(Segui un canale Telegram pubblico)</i>\n• <code>/sub @mio_canale https://feed-url</code> <i>(Invia articoli a un tuo canale)</i>",
    "unsub_help": "➖ <b>Disiscrizione:</b>\n• <code>/unsub &lt;url&gt;</code> — Disiscriviti da un feed specifico\n• <code>/unsub</code> — Elenco pulsanti interattivi per disiscriversi\n• <code>/unsub @mio_canale &lt;url&gt;</code> — Rimuovi feed da un canale",
    "manage_help": "📋 <b>Gestione e configurazione:</b>\n• <code>/list</code> — Mostra iscrizioni attive con pulsanti rapidi\n• <code>/set</code> — Modalità di consegna (⚡ Apertura rapida, 🖼️ Foto, 🔗 Solo link)\n• <code>/lang</code> — Cambia lingua interfaccia\n• <code>/poll</code> — Controlla aggiornamenti subito\n• <code>/force_poll</code> — Forza l’invio dell’ultimo post subito\n• <code>/export</code> — Scarica le iscrizioni in formato OPML\n• <b>Importazione OPML:</b> Invia un file <code>.opml</code> per importare in blocco",
    "no_subs": "📭 Nessuna iscrizione attiva.\nAggiungine una con <code>/sub &lt;url|@canale&gt;</code>",
    "choose_lang": "🌐 <b>Scegli la tua lingua:</b>",
    "lang_changed": "✅ Lingua cambiata in <b>{lang}</b>.",
    "invalid_url": "⚠️ Inserisci un URL o canale @valido.",
    "sub_success": "✅ <b>Iscrizione completata!</b>\n\n📌 <b>Feed:</b> {title}\n🔗 <b>URL:</b> {url}",
    "already_subscribed": "ℹ️ Sei già iscritto a questo feed.",
    "sub_not_found": "⚠️ Iscrizione non trovata.",
    "unsub_success": "✅ Disiscrizione completata da: <b>{title}</b>",
    "settings_title": "⚙️ <b>Impostazioni per:</b>\n<b>{title}</b>\n\n<b>Modalità:</b> {mode}",
    "mode_default": "⚡ Apertura rapida (Predefinito)",
    "mode_telegraph": "📄 Sempre Telegraph",
    "mode_photo": "🖼️ Immagine + testo",
    "mode_link_only": "🔗 Solo link",
    "force_poll_start": "⚡ Recupero ultimi articoli in corso...",
    "force_poll_done": "⚡ Inviati <b>{count}</b> post recenti.",
    "btn_watch_youtube": "▶️ Guarda su YouTube",
    "view_in_telegram": "Visualizza su Telegram",
    "listen_podcast": "Ascolta episodio podcast (Audio)",
    "watch_youtube": "Guarda video su YouTube",
    "watch_video_telegram": "Guarda video su Telegram",
    "forwarded_from": "Inoltrato da",
    "in_reply_to": "In risposta a",
    "post_num": "Messaggio",
    "btn_back_settings": "« Torna alle impostazioni",
    "app_title": "RSS Reader Mini App",
    "btn_unsub_num": "❌ Disiscriviti #{num}",
    "btn_auto_lang": "🌐 Automatico (App Telegram)",
    "action_completed": "Azione completata.",
    "feed_delivery_mode": "⚙️ <b>Configura modalità di consegna:</b>\nSeleziona un’iscrizione per cambiare come viene inviata:",
    "settings_updated": "✅ <b>Impostazioni aggiornate!</b>\n\n<b>Feed:</b> {title}\n<b>Nuova modalità:</b> {mode}",
    "select_feed_unsub": "<b>Seleziona un feed da cui disiscriverti per {target}:</b>",
    "subs_for": "📋 <b>Iscrizioni per {target} ({count}):</b>\n\n",
    "no_subs_for": "📭 <b>Nessuna iscrizione attiva per {target}.</b>\n\nAggiungine una con: <code>/sub &lt;url&gt;</code>",
    "already_subscribed_chat": "⚠️ <b>Già iscritto:</b>\n<b>Destinazione:</b> {target}\n<b>Feed:</b> <code>{url}</code>",
    "discovering_feed": "⏳ Rilevamento feed per <code>{url}</code>...",
    "sub_usage": "<b>Uso:</b>\n• <code>/sub &lt;url&gt;</code>\n• <code>/sub @canale &lt;url&gt;</code>\n\n<i>Esempio:</i>\n<code>/sub https://techcrunch.com</code>",
    "instant_view": "Apertura rapida",
    "read_original": "Leggi originale",
    "view_post_in_telegram": "Visualizza post su Telegram"
  },
  "fr": {
    "welcome_title": "<b>Bienvenue sur le bot RSS pour Telegram !</b> 📡",
    "welcome_desc": "Un lecteur RSS sans serveur moderne hébergé sur le cloud Telegram.",
    "key_features": "✨ <b>Fonctionnalités clés :</b>",
    "feat_reader": "• <b>📖 Mini App Reader :</b> Ouvrez la WebApp complète pour lire des articles et gérer vos flux !",
    "feat_autodetect": "• <b>Détection auto :</b> Collez n’importe quel lien de blog ou site web.",
    "feat_instant_view": "• <b>⚡ Aperçu rapide :</b> Convertit les articles en pages Telegraph à ouverture instantanée.",
    "feat_channel": "• <b>Canaux Telegram :</b> Suivez des canaux avec <code>/sub @canal</code>.",
    "feat_broadcast": "• <b>📢 Diffusion :</b> Publiez les flux vers vos canaux.",
    "feat_opml": "• <b>OPML Import/Export :</b> Envoyez un fichier <code>.opml</code> pour importer vos flux.",
    "commands_header": "📋 <b>Commandes :</b>",
    "cmd_reader": "• <code>/reader</code> — Ouvrir la Mini App Reader",
    "cmd_sub": "• <code>/sub &lt;url|@canal&gt;</code> — S’abonner à un flux ou canal",
    "cmd_unsub": "• <code>/unsub [url]</code> — Se désabonner",
    "cmd_list": "• <code>/list</code> — Voir vos abonnements",
    "cmd_set": "• <code>/set</code> — Mode d’envoi (⚡ Aperçu rapide, 🖼️ Photo, 🔗 Lien seul)",
    "cmd_lang": "• <code>/lang</code> — Changer de langue",
    "cmd_poll": "• <code>/poll</code> — Vérifier les mises à jour",
    "cmd_force_poll": "• <code>/force_poll</code> — Forcer l’envoi des derniers posts",
    "cmd_export": "• <code>/export</code> — Exporter en OPML",
    "cmd_help": "• <code>/help</code> — Aide complète",
    "btn_open_reader": "📖 Ouvrir le lecteur RSS",
    "btn_my_subs": "📋 Mes abonnements",
    "btn_help": "❓ Aide",
    "btn_settings": "⚙️ Paramètres",
    "btn_language": "🌐 Langue",
    "btn_read_original": "🌐 Lire l’original",
    "btn_instant_view": "⚡ Aperçu rapide",
    "btn_channel_post": "📢 Post du canal",
    "btn_watch_video": "📹 Voir la vidéo sur Telegram",
    "btn_listen_podcast": "🎙️ Écouter le podcast",
    "help_guide_title": "📖 <b>Bot RSS pour Telegram — Guide des commandes</b>",
    "sub_help": "➕ <b>S’abonner :</b>\n• <code>/sub https://techcrunch.com</code> <i>(Détection auto WordPress/Atom/RSS)</i>\n• <code>/sub https://example.substack.com</code> <i>(Détection auto Substack)</i>\n• <code>/sub @canal</code> <i>(Suivre un canal Telegram public)</i>\n• <code>/sub @mon_canal https://feed-url</code> <i>(Diffuser vers votre canal)</i>",
    "unsub_help": "➖ <b>Se désabonner :</b>\n• <code>/unsub &lt;url&gt;</code> — Se désabonner d’un flux spécifique\n• <code>/unsub</code> — Liste de boutons interactifs pour se désabonner\n• <code>/unsub @mon_canal &lt;url&gt;</code> — Retirer un flux d’un canal",
    "manage_help": "📋 <b>Gestion et configuration :</b>\n• <code>/list</code> — Afficher les abonnements avec boutons rapides\n• <code>/set</code> — Mode d’envoi (⚡ Aperçu rapide, 🖼️ Photo, 🔗 Lien seul)\n• <code>/lang</code> — Changer la langue de l’interface\n• <code>/poll</code> — Vérifier immédiatement les nouveaux articles\n• <code>/force_poll</code> — Forcer l’envoi du dernier post maintenant\n• <code>/export</code> — Télécharger les abonnements en OPML\n• <b>Importation OPML :</b> Envoyez un fichier <code>.opml</code> pour importer en masse",
    "no_subs": "📭 Aucun abonnement actif.\nAjoutez-en un avec <code>/sub &lt;url|@canal&gt;</code>",
    "choose_lang": "🌐 <b>Choisissez votre langue préférée :</b>",
    "lang_changed": "✅ Langue changée en <b>{lang}</b>.",
    "invalid_url": "⚠️ Veuillez fournir une URL ou canal @valide.",
    "sub_success": "✅ <b>Abonnement réussi !</b>\n\n📌 <b>Flux :</b> {title}\n🔗 <b>URL :</b> {url}",
    "already_subscribed": "ℹ️ Vous êtes déjà abonné à ce flux.",
    "sub_not_found": "⚠️ Abonnement introuvable.",
    "unsub_success": "✅ Désabonné de : <b>{title}</b>",
    "settings_title": "⚙️ <b>Paramètres pour :</b>\n<b>{title}</b>\n\n<b>Mode actuel :</b> {mode}",
    "mode_default": "⚡ Aperçu rapide (Par défaut)",
    "mode_telegraph": "📄 Toujours Telegraph",
    "mode_photo": "🖼️ Photo avec texte",
    "mode_link_only": "🔗 Lien seul",
    "force_poll_start": "⚡ Récupération des derniers posts...",
    "force_poll_done": "⚡ <b>{count}</b> post(s) récent(s) distribué(s).",
    "btn_watch_youtube": "▶️ Regarder sur YouTube",
    "view_in_telegram": "Voir dans Telegram",
    "listen_podcast": "Écouter l’épisode de podcast (Audio)",
    "watch_youtube": "Regarder la vidéo sur YouTube",
    "watch_video_telegram": "Regarder la vidéo dans Telegram",
    "forwarded_from": "Transféré de",
    "in_reply_to": "En réponse à",
    "post_num": "Message",
    "btn_back_settings": "« Retour aux paramètres",
    "app_title": "Lecteur RSS Mini App",
    "btn_unsub_num": "❌ Se désabonner #{num}",
    "btn_auto_lang": "🌐 Auto (Application Telegram)",
    "action_completed": "Action terminée.",
    "feed_delivery_mode": "⚙️ <b>Configurer le mode de livraison :</b>\nSélectionnez un abonnement à modifier :",
    "settings_updated": "✅ <b>Paramètres mis à jour !</b>\n\n<b>Flux :</b> {title}\n<b>Nouveau mode :</b> {mode}",
    "select_feed_unsub": "<b>Sélectionnez un flux à désabonner pour {target} :</b>",
    "subs_for": "📋 <b>Abonnements pour {target} ({count}) :</b>\n\n",
    "no_subs_for": "📭 <b>Aucun abonnement actif pour {target}.</b>\n\nAjoutez-en un avec : <code>/sub &lt;url&gt;</code>",
    "already_subscribed_chat": "⚠️ <b>Déjà abonné :</b>\n<b>Cible :</b> {target}\n<b>Flux :</b> <code>{url}</code>",
    "discovering_feed": "⏳ Détection du flux pour <code>{url}</code>...",
    "sub_usage": "<b>Utilisation :</b>\n• <code>/sub &lt;url&gt;</code>\n• <code>/sub @canal &lt;url&gt;</code>\n\n<i>Exemple :</i>\n<code>/sub https://techcrunch.com</code>",
    "instant_view": "Aperçu rapide",
    "read_original": "Lire l’original",
    "view_post_in_telegram": "Voir le post dans Telegram"
  },
  "de": {
    "welcome_title": "<b>Willkommen beim RSS-zu-Telegram-Bot!</b> 📡",
    "welcome_desc": "Ein moderner serverloser RSS-Reader auf der Telegram-Cloud.",
    "key_features": "✨ <b>Hauptfunktionen:</b>",
    "feat_reader": "• <b>📖 Mini App Reader:</b> Öffne die vollwertige WebApp zum Lesen und Verwalten deiner Feeds!",
    "feat_autodetect": "• <b>Automatische Erkennung:</b> Beliebigen Link einfügen, Feed wird automatisch gefunden.",
    "feat_instant_view": "• <b>⚡ Schnellansicht:</b> Wandelt lange Artikel in Telegraph-Schnellansichten um.",
    "feat_channel": "• <b>Telegram-Kanäle:</b> Öffentliche Kanäle mit <code>/sub @kanal</code> abonnieren.",
    "feat_broadcast": "• <b>📢 Kanal-Weiterleitung:</b> Feeds an eigene Kanäle senden.",
    "feat_opml": "• <b>OPML-Import/Export:</b> Sende <code>.opml</code> zum Massenimport.",
    "commands_header": "📋 <b>Befehle:</b>",
    "cmd_reader": "• <code>/reader</code> — RSS Reader Mini App öffnen",
    "cmd_sub": "• <code>/sub &lt;url|@kanal&gt;</code> — Feed oder Kanal abonnieren",
    "cmd_unsub": "• <code>/unsub [url]</code> — Abbestellen",
    "cmd_list": "• <code>/list</code> — Abonnements anzeigen",
    "cmd_set": "• <code>/set</code> — Zustellmodus anpassen (⚡ Schnellansicht, 🖼️ Foto, 🔗 Nur Link)",
    "cmd_lang": "• <code>/lang</code> — Sprache ändern",
    "cmd_poll": "• <code>/poll</code> — Jetzt auf Updates prüfen",
    "cmd_force_poll": "• <code>/force_poll</code> — Neueste Beiträge sofort senden",
    "cmd_export": "• <code>/export</code> — Als OPML exportieren",
    "cmd_help": "• <code>/help</code> — Hilfe anzeigen",
    "btn_open_reader": "📖 RSS Reader öffnen",
    "btn_my_subs": "📋 Meine Abonnements",
    "btn_help": "❓ Hilfe",
    "btn_settings": "⚙️ Einstellungen",
    "btn_language": "🌐 Sprache",
    "btn_read_original": "🌐 Original lesen",
    "btn_instant_view": "⚡ Schnellansicht",
    "btn_channel_post": "📢 Kanalbeitrag",
    "btn_watch_video": "📹 Video in Telegram ansehen",
    "btn_listen_podcast": "🎙️ Podcast anhören",
    "help_guide_title": "📖 <b>RSS to Telegram Bot — Befehlsübersicht</b>",
    "sub_help": "➕ <b>Abonnieren:</b>\n• <code>/sub https://techcrunch.com</code> <i>(Auto-Erkennung WordPress/Atom/RSS)</i>\n• <code>/sub https://example.substack.com</code> <i>(Auto-Erkennung Substack)</i>\n• <code>/sub @kanal</code> <i>(Öffentlichem Telegram-Kanal folgen)</i>\n• <code>/sub @mein_kanal https://feed-url</code> <i>(Feeds in eigenen Kanal senden)</i>",
    "unsub_help": "➖ <b>Abbestellen:</b>\n• <code>/unsub &lt;url&gt;</code> — Bestimmten Feed abbestellen\n• <code>/unsub</code> — Interaktive Button-Liste zum Abbestellen\n• <code>/unsub @mein_kanal &lt;url&gt;</code> — Feed aus einem Kanal entfernen",
    "manage_help": "📋 <b>Verwaltung und Einstellungen:</b>\n• <code>/list</code> — Aktive Abonnements mit Schnellbuttons anzeigen\n• <code>/set</code> — Zustellmodus anpassen (⚡ Schnellansicht, 🖼️ Foto, 🔗 Nur Link)\n• <code>/lang</code> — Sprache der Oberfläche ändern\n• <code>/poll</code> — Feeds sofort auf Updates prüfen\n• <code>/force_poll</code> — Neuesten Beitrag sofort erzwingen\n• <code>/export</code> — Alle Feeds als OPML-Datei herunterladen\n• <b>OPML-Import:</b> Sende eine <code>.opml</code> Datei zum Massenimport",
    "no_subs": "📭 Keine aktiven Abonnements.\nFüge eins hinzu mit <code>/sub &lt;url|@kanal&gt;</code>",
    "choose_lang": "🌐 <b>Wähle deine bevorzugte Sprache:</b>",
    "lang_changed": "✅ Sprache geändert auf <b>{lang}</b>.",
    "invalid_url": "⚠️ Bitte gültige Feed-URL oder @Kanal angeben.",
    "sub_success": "✅ <b>Erfolgreich abonniert!</b>\n\n📌 <b>Feed:</b> {title}\n🔗 <b>URL:</b> {url}",
    "already_subscribed": "ℹ️ Du hast diesen Feed bereits abonniert.",
    "sub_not_found": "⚠️ Abonnement nicht gefunden.",
    "unsub_success": "✅ Abbestellt: <b>{title}</b>",
    "settings_title": "⚙️ <b>Einstellungen für:</b>\n<b>{title}</b>\n\n<b>Aktueller Modus:</b> {mode}",
    "mode_default": "⚡ Schnellansicht (Standard)",
    "mode_telegraph": "📄 Immer Telegraph",
    "mode_photo": "🖼️ Bild mit Text",
    "mode_link_only": "🔗 Nur Link",
    "force_poll_start": "⚡ Neueste Beiträge werden abgerufen...",
    "force_poll_done": "⚡ <b>{count}</b> aktuelle(r) Beitrag/Beiträge gesendet.",
    "btn_watch_youtube": "▶️ Auf YouTube ansehen",
    "view_in_telegram": "In Telegram anzeigen",
    "listen_podcast": "Podcast-Episode anhören (Audio)",
    "watch_youtube": "Video auf YouTube ansehen",
    "watch_video_telegram": "Video in Telegram ansehen",
    "forwarded_from": "Weitergeleitet von",
    "in_reply_to": "Als Antwort auf",
    "post_num": "Beitrag",
    "btn_back_settings": "« Zurück zu Einstellungen",
    "app_title": "RSS Reader Mini App",
    "btn_unsub_num": "❌ Abbestellen #{num}",
    "btn_auto_lang": "🌐 Automatisch (Telegram-App)",
    "action_completed": "Aktion abgeschlossen.",
    "feed_delivery_mode": "⚙️ <b>Zustellmodus konfigurieren:</b>\nWähle ein Abonnement aus:",
    "settings_updated": "✅ <b>Einstellungen aktualisiert!</b>\n\n<b>Feed:</b> {title}\n<b>Neuer Modus:</b> {mode}",
    "select_feed_unsub": "<b>Wähle einen Feed zum Abbestellen für {target}:</b>",
    "subs_for": "📋 <b>Abonnements für {target} ({count}):</b>\n\n",
    "no_subs_for": "📭 <b>Keine aktiven Abonnements für {target}.</b>\n\nHinzufügen mit: <code>/sub &lt;url&gt;</code>",
    "already_subscribed_chat": "⚠️ <b>Bereits abonniert:</b>\n<b>Ziel:</b> {target}\n<b>Feed:</b> <code>{url}</code>",
    "discovering_feed": "⏳ Feed wird gesucht für <code>{url}</code>...",
    "sub_usage": "<b>Verwendung:</b>\n• <code>/sub &lt;url&gt;</code>\n• <code>/sub @kanal &lt;url&gt;</code>\n\n<i>Beispiel:</i>\n<code>/sub https://techcrunch.com</code>",
    "instant_view": "Schnellansicht",
    "read_original": "Original lesen",
    "view_post_in_telegram": "Beitrag in Telegram anzeigen"
  },
  "uk": {
    "welcome_title": "<b>Ласкаво просимо до RSS to Telegram Bot!</b> 📡",
    "welcome_desc": "Сучасний серверлес RSS-рідер на хмарній платформі Telegram.",
    "key_features": "✨ <b>Ключові можливості:</b>",
    "feat_reader": "• <b>📖 Mini App Reader:</b> Відкривайте повнофункціональний WebApp для читання статей та керування підписками!",
    "feat_autodetect": "• <b>Автоматичне визначення:</b> Вставте будь-яке посилання на сайт чи блог — бот знайде RSS автоматично!",
    "feat_instant_view": "• <b>⚡ Швидкий перегляд:</b> Перетворює уривки новин і довгі дописи каналів у зручні сторінки Telegraph зі швидким переглядом.",
    "feat_channel": "• <b>Telegram-канали:</b> Підписуйтесь на публічні канали за допомогою <code>/sub @channel</code>.",
    "feat_broadcast": "• <b>📢 Трансляція в канали:</b> Надсилайте новини у власні канали.",
    "feat_opml": "• <b>Імпорт та експорт OPML:</b> Надішліть файл <code>.opml</code> для масового додавання підписок.",
    "commands_header": "📋 <b>Команди:</b>",
    "cmd_reader": "• <code>/reader</code> — Відкрити Mini App рідер",
    "cmd_sub": "• <code>/sub &lt;url|@канал&gt;</code> — Підписатися на стрічку або канал",
    "cmd_unsub": "• <code>/unsub [url]</code> — Скасувати підписку",
    "cmd_list": "• <code>/list</code> — Переглянути список підписок",
    "cmd_set": "• <code>/set</code> — Режим доставки (⚡ Швидкий перегляд, 🖼️ Фото, 🔗 Тільки посилання)",
    "cmd_lang": "• <code>/lang</code> — Змінити мову інтерфейсу",
    "cmd_poll": "• <code>/poll</code> — Перевірити оновлення зараз",
    "cmd_force_poll": "• <code>/force_poll</code> — Надіслати останні публікації",
    "cmd_export": "• <code>/export</code> — Експортувати підписки в OPML",
    "cmd_help": "• <code>/help</code> — Повна довідка",
    "btn_open_reader": "📖 Відкрити RSS рідер",
    "btn_my_subs": "📋 Мої підписки",
    "btn_help": "❓ Довідка",
    "btn_settings": "⚙️ Налаштування",
    "btn_language": "🌐 Мова (Language)",
    "btn_read_original": "🌐 Читати оригінал",
    "btn_instant_view": "⚡ Швидкий перегляд",
    "btn_channel_post": "📢 Допис каналу",
    "btn_watch_video": "📹 Дивитися відео в Telegram",
    "btn_listen_podcast": "🎙️ Слухати подкаст",
    "help_guide_title": "📖 <b>RSS to Telegram Bot — Довідка по командах</b>",
    "sub_help": "➕ <b>Підписка:</b>\n• <code>/sub https://techcrunch.com</code> <i>(Автовизначення WordPress/Atom/RSS)</i>\n• <code>/sub https://example.substack.com</code> <i>(Автовизначення Substack)</i>\n• <code>/sub @channel</code> <i>(Підписатися на публічний Telegram-канал)</i>\n• <code>/sub @my_channel https://feed-url</code> <i>(Транслювати стрічку у ваш канал)</i>",
    "unsub_help": "➖ <b>Скасування підписки:</b>\n• <code>/unsub &lt;url&gt;</code> — Скасувати конкретну підписку\n• <code>/unsub</code> — Інтерактивний список кнопок для відписки\n• <code>/unsub @my_channel &lt;url&gt;</code> — Видалити стрічку з каналу",
    "manage_help": "📋 <b>Керування та налаштування:</b>\n• <code>/list</code> — Список активних підписок зі швидким відписуванням\n• <code>/set</code> — Режим доставки (⚡ Швидкий перегляд, 🖼️ Фото, 🔗 Тільки посилання)\n• <code>/lang</code> — Змінити мову інтерфейсу\n• <code>/poll</code> — Негайна перевірка оновлень\n• <code>/force_poll</code> — Примусово надіслати останній допис\n• <code>/export</code> — Завантажити всі підписки у файлі OPML\n• <b>Імпорт OPML:</b> Надішліть файл <code>.opml</code> для автоматичного імпорту",
    "no_subs": "📭 У вас ще немає активних підписок.\nДодайте за допомогою <code>/sub &lt;url|@channel&gt;</code>",
    "choose_lang": "🌐 <b>Оберіть бажану мову:</b>",
    "lang_changed": "✅ Мову змінено на <b>{lang}</b>.",
    "invalid_url": "⚠️ Вкажіть дійсне посилання або @канал.",
    "sub_success": "✅ <b>Успішно підписано!</b>\n\n📌 <b>Стрічка:</b> {title}\n🔗 <b>URL:</b> {url}",
    "already_subscribed": "ℹ️ Ви вже підписані на цю стрічку.",
    "sub_not_found": "⚠️ Підписку не знайдено.",
    "unsub_success": "✅ Скасовано підписку на: <b>{title}</b>",
    "settings_title": "⚙️ <b>Налаштування для:</b>\n<b>{title}</b>\n\n<b>Поточний режим:</b> {mode}",
    "mode_default": "⚡ Швидкий перегляд (За замовчуванням)",
    "mode_telegraph": "📄 Завжди Telegraph",
    "mode_photo": "🖼️ Банер + текст",
    "mode_link_only": "🔗 Тільки посилання",
    "force_poll_start": "⚡ Отримання останніх дописів...",
    "force_poll_done": "⚡ Надіслано <b>{count}</b> останніх дописів.",
    "btn_watch_youtube": "▶️ Дивитися на YouTube",
    "view_in_telegram": "Переглянути в Telegram",
    "listen_podcast": "Слухати епізод подкасту (Аудіо)",
    "watch_youtube": "Дивитися відео на YouTube",
    "watch_video_telegram": "Дивитися відео в Telegram",
    "forwarded_from": "Переслано від",
    "in_reply_to": "У відповідь на",
    "post_num": "Допис",
    "btn_back_settings": "« Назад до налаштувань",
    "app_title": "RSS Reader Mini App",
    "btn_unsub_num": "❌ Відписатися #{num}",
    "btn_auto_lang": "🌐 Авто (Мова Telegram)",
    "action_completed": "Дію успішно виконано.",
    "feed_delivery_mode": "⚙️ <b>Налаштування режиму доставки:</b>\nОберіть підписку для зміни формату надсилання:",
    "settings_updated": "✅ <b>Налаштування оновлено!</b>\n\n<b>Стрічка:</b> {title}\n<b>Новий режим:</b> {mode}",
    "select_feed_unsub": "<b>Оберіть стрічку для скасування підписки для {target}:</b>",
    "subs_for": "📋 <b>Підписки для {target} ({count}):</b>\n\n",
    "no_subs_for": "📭 <b>Немає активних підписок для {target}.</b>\n\nДодайте за допомогою: <code>/sub &lt;url&gt;</code>",
    "already_subscribed_chat": "⚠️ <b>Вже підписані:</b>\n<b>Ціль:</b> {target}\n<b>Стрічка:</b> <code>{url}</code>",
    "discovering_feed": "⏳ Пошук RSS-стрічки для <code>{url}</code>...",
    "sub_usage": "<b>Використання:</b>\n• <code>/sub &lt;url&gt;</code>\n• <code>/sub @channel &lt;url&gt;</code>\n\n<i>Приклад:</i>\n<code>/sub https://techcrunch.com</code>",
    "instant_view": "Швидкий перегляд",
    "read_original": "Читати оригінал",
    "view_post_in_telegram": "Переглянути допис у Telegram"
  },
  "tr": {
    "welcome_title": "<b>RSS Telegram Botuna Hoş Geldiniz!</b> 📡",
    "welcome_desc": "Telegram bulut altyapısında çalışan modern sunucusuz RSS okuyucusu.",
    "key_features": "✨ <b>Öne Çıkan Özellikler:</b>",
    "feat_reader": "• <b>📖 Mini App Reader:</b> Makaleleri okumak ve akışları yönetmek için WebApp uygulamasını açın!",
    "feat_autodetect": "• <b>Otomatik Tespit:</b> Herhangi bir blog veya site linki yapıştırın, bot akışı kendisi bulur.",
    "feat_instant_view": "• <b>⚡ Hızlı Görünüm:</b> Makaleleri anında açılan Telegraph sayfalarına dönüştürür.",
    "feat_channel": "• <b>Telegram Kanalları:</b> <code>/sub @kanal</code> ile açık kanalları takip edin.",
    "feat_broadcast": "• <b>📢 Kanallara Yayın:</b> Akışları yönettiğiniz kanallara gönderin.",
    "feat_opml": "• <b>OPML İçe/Dışa Aktarma:</b> <code>.opml</code> dosyası göndererek toplu içe aktarın.",
    "commands_header": "📋 <b>Komutlar:</b>",
    "cmd_reader": "• <code>/reader</code> — RSS Reader Mini Uygulamasını Aç",
    "cmd_sub": "• <code>/sub &lt;url|@kanal&gt;</code> — Akış veya kanala abone ol",
    "cmd_unsub": "• <code>/unsub [url]</code> — Aboneliği iptal et",
    "cmd_list": "• <code>/list</code> — Abonelikleri listele",
    "cmd_set": "• <code>/set</code> — Gönderim modu (⚡ Hızlı Görünüm, 🖼️ Fotoğraf, 🔗 Yalnızca Bağlantı)",
    "cmd_lang": "• <code>/lang</code> — Dil değiştir",
    "cmd_poll": "• <code>/poll</code> — Güncellemeleri kontrol et",
    "cmd_force_poll": "• <code>/force_poll</code> — Son gönderileri hemen gönder",
    "cmd_export": "• <code>/export</code> — OPML olarak dışa aktar",
    "cmd_help": "• <code>/help</code> — Yardım rehberi",
    "btn_open_reader": "📖 RSS Okuyucuyu Aç",
    "btn_my_subs": "📋 Aboneliklerim",
    "btn_help": "❓ Yardım",
    "btn_settings": "⚙️ Ayarlar",
    "btn_language": "🌐 Dil (Language)",
    "btn_read_original": "🌐 Orijinali Oku",
    "btn_instant_view": "⚡ Hızlı Görünüm",
    "btn_channel_post": "📢 Kanal Gönderisi",
    "btn_watch_video": "📹 Videoyu Telegram’da İzle",
    "btn_listen_podcast": "🎙️ Podcast Dinle",
    "help_guide_title": "📖 <b>RSS to Telegram Bot — Komut Rehberi</b>",
    "sub_help": "➕ <b>Abone Olma:</b>\n• <code>/sub https://techcrunch.com</code> <i>(WordPress/Atom/RSS otomatik tespit)</i>\n• <code>/sub https://example.substack.com</code> <i>(Substack otomatik tespit)</i>\n• <code>/sub @kanal</code> <i>(Açık Telegram kanalını takip et)</i>\n• <code>/sub @benim_kanalim https://feed-url</code> <i>(Yönettiğiniz kanala akış gönderin)</i>",
    "unsub_help": "➖ <b>Abonelik İptali:</b>\n• <code>/unsub &lt;url&gt;</code> — Belirli bir akıştan çık\n• <code>/unsub</code> — Hızlı iptal için buton listesi aç\n• <code>/unsub @benim_kanalim &lt;url&gt;</code> — Kanaldan akışı kaldır",
    "manage_help": "📋 <b>Yönetim ve Yapılandırma:</b>\n• <code>/list</code> — Aktif abonelikleri ve hızlı iptal butonlarını göster\n• <code>/set</code> — Gönderim modu (⚡ Hızlı Görünüm, 🖼️ Fotoğraf, 🔗 Yalnızca Bağlantı)\n• <code>/lang</code> — Arayüz dilini değiştir\n• <code>/poll</code> — Akışları hemen denetle\n• <code>/force_poll</code> — Son gönderiyi hemen iletmeye zorla\n• <code>/export</code> — Tüm abonelikleri OPML dosyası olarak indir\n• <b>OPML İçe Aktarma:</b> Toplu içe aktarmak için bir <code>.opml</code> dosyası gönderin",
    "no_subs": "📭 Henüz aktif bir aboneliğiniz yok.\n<code>/sub &lt;url|@kanal&gt;</code> ile ekleyebilirsiniz.",
    "choose_lang": "🌐 <b>Tercih ettiğiniz dili seçin:</b>",
    "lang_changed": "✅ Dil <b>{lang}</b> olarak değiştirildi.",
    "invalid_url": "⚠️ Geçerli bir bağlantı veya @kanal belirtin.",
    "sub_success": "✅ <b>Başarıyla abone olundu!</b>\n\n📌 <b>Akış:</b> {title}\n🔗 <b>URL:</b> {url}",
    "already_subscribed": "ℹ️ Bu akışa zaten abonesiniz.",
    "sub_not_found": "⚠️ Abonelik bulunamadı.",
    "unsub_success": "✅ Abonelik iptal edildi: <b>{title}</b>",
    "settings_title": "⚙️ <b>Abonelik Ayarları:</b>\n<b>{title}</b>\n\n<b>Geçerli Mod:</b> {mode}",
    "mode_default": "⚡ Hızlı Görünüm (Varsayılan)",
    "mode_telegraph": "📄 Her Zaman Telegraph",
    "mode_photo": "🖼️ Fotoğraflı Gönderim",
    "mode_link_only": "🔗 Yalnızca Bağlantı",
    "force_poll_start": "⚡ Son gönderiler getiriliyor...",
    "force_poll_done": "⚡ <b>{count}</b> adet son gönderi iletildi.",
    "btn_watch_youtube": "▶️ YouTube’da İzle",
    "view_in_telegram": "Telegram’da Görüntüle",
    "listen_podcast": "Podcast Bölümünü Dinle (Ses)",
    "watch_youtube": "Videoyu YouTube’da İzle",
    "watch_video_telegram": "Videoyu Telegram’da İzle",
    "forwarded_from": "Şuradan iletildi:",
    "in_reply_to": "Şuna yanıt olarak:",
    "post_num": "Gönderi",
    "btn_back_settings": "« Ayarlara Geri Dön",
    "app_title": "RSS Reader Mini Uygulaması",
    "btn_unsub_num": "❌ İptal et #{num}",
    "btn_auto_lang": "🌐 Otomatik (Telegram Uygulaması)",
    "action_completed": "İşlem tamamlandı.",
    "feed_delivery_mode": "⚙️ <b>Gönderim Modunu Ayarla:</b>\nDeğiştirmek istediğiniz aboneliği seçin:",
    "settings_updated": "✅ <b>Ayarlar Güncellendi!</b>\n\n<b>Akış:</b> {title}\n<b>Yeni Mod:</b> {mode}",
    "select_feed_unsub": "<b>{target} için aboneliği iptal edilecek akışı seçin:</b>",
    "subs_for": "📋 <b>{target} için abonelikler ({count}):</b>\n\n",
    "no_subs_for": "📭 <b>{target} için aktif abonelik bulunamadı.</b>\n\n<code>/sub &lt;url&gt;</code> ile ekleyebilirsiniz.",
    "already_subscribed_chat": "⚠️ <b>Zaten abone olundu:</b>\n<b>Hedef:</b> {target}\n<b>Akış:</b> <code>{url}</code>",
    "discovering_feed": "⏳ <code>{url}</code> için akış aranıyor...",
    "sub_usage": "<b>Kullanım:</b>\n• <code>/sub &lt;url&gt;</code>\n• <code>/sub @kanal &lt;url&gt;</code>\n\n<i>Örnek:</i>\n<code>/sub https://techcrunch.com</code>",
    "instant_view": "Hızlı Görünüm",
    "read_original": "Orijinali Oku",
    "view_post_in_telegram": "Gönderiyi Telegram’da Görüntüle"
  },
  "ja": {
    "welcome_title": "<b>RSS to Telegram Bot へようこそ！</b> 📡",
    "welcome_desc": "Telegram クラウド上で動作するモダンなサーバーレス RSS リーダーです。",
    "key_features": "✨ <b>主な特徴：</b>",
    "feat_reader": "• <b>📖 Mini App リーダー:</b> 全機能搭載の WebApp で記事の閲覧やフィード管理を行えます！",
    "feat_autodetect": "• <b>自動フィード検出:</b> ブログやサイトの URL を貼るだけで、RSS を自動検出します。",
    "feat_instant_view": "• <b>⚡ インスタント表示：</b> 長文記事を瞬時に開く Telegraph 形式に自動変換します。",
    "feat_channel": "• <b>Telegram チャンネル:</b> <code>/sub @channel</code> で公開チャンネルを購読可能です。",
    "feat_broadcast": "• <b>📢 チャンネル配信:</b> 管理しているチャンネルへ記事を自動配信できます。",
    "feat_opml": "• <b>OPML インポート/エクスポート:</b> <code>.opml</code> ファイルを送るだけで一括登録できます。",
    "commands_header": "📋 <b>コマンド一覧：</b>",
    "cmd_reader": "• <code>/reader</code> — RSS リーダーアプリを開く",
    "cmd_sub": "• <code>/sub &lt;url|@channel&gt;</code> — フィードまたはチャンネルを購読",
    "cmd_unsub": "• <code>/unsub [url]</code> — 購読解除",
    "cmd_list": "• <code>/list</code> — 購読リストを表示",
    "cmd_set": "• <code>/set</code> — 配信モード変更 (⚡ インスタント表示、🖼️ 画像付き、🔗 リンクのみ)",
    "cmd_lang": "• <code>/lang</code> — 言語を切り替え",
    "cmd_poll": "• <code>/poll</code> — 今すぐ更新を確認",
    "cmd_force_poll": "• <code>/force_poll</code> — 最新記事を強制配信",
    "cmd_export": "• <code>/export</code> — OPML 形式でエクスポート",
    "cmd_help": "• <code>/help</code> — ヘルプを表示",
    "btn_open_reader": "📖 RSS リーダーを開く",
    "btn_my_subs": "📋 登録リスト",
    "btn_help": "❓ ヘルプ",
    "btn_settings": "⚙️ 設定",
    "btn_language": "🌐 言語 (Language)",
    "btn_read_original": "🌐 元記事を読む",
    "btn_instant_view": "⚡ インスタント表示",
    "btn_channel_post": "📢 チャンネル投稿",
    "btn_watch_video": "📹 Telegram で動画を見る",
    "btn_listen_podcast": "🎙️ ポッドキャストを聴く",
    "help_guide_title": "📖 <b>RSS to Telegram Bot — コマンドガイド</b>",
    "sub_help": "➕ <b>購読登録：</b>\n• <code>/sub https://techcrunch.com</code> <i>(WordPress/Atom/RSSを自動検出)</i>\n• <code>/sub https://example.substack.com</code> <i>(Substackを自動検出)</i>\n• <code>/sub @channel</code> <i>(公開Telegramチャンネルを購読)</i>\n• <code>/sub @my_channel https://feed-url</code> <i>(管理チャンネルへ自動配信)</i>",
    "unsub_help": "➖ <b>購読解除：</b>\n• <code>/unsub &lt;url&gt;</code> — 指定したフィードを解除\n• <code>/unsub</code> — ボタン一覧から選択して解除\n• <code>/unsub @my_channel &lt;url&gt;</code> — チャンネルから解除",
    "manage_help": "📋 <b>管理と設定：</b>\n• <code>/list</code> — 登録フィード一覧とクイック解除ボタンを表示\n• <code>/set</code> — 配信モード変更 (⚡ インスタント表示、🖼️ 画像付き、🔗 リンクのみ)\n• <code>/lang</code> — インターフェース言語を切り替え\n• <code>/poll</code> — 今すぐ更新を確認\n• <code>/force_poll</code> — 最新記事を今すぐ強制配信\n• <code>/export</code> — 全フィードをOPML形式でダウンロード\n• <b>OPMLインポート：</b> <code>.opml</code> ファイルを送信して一括登録",
    "no_subs": "📭 登録されたフィードはありません。\n<code>/sub &lt;url|@channel&gt;</code> で追加できます。",
    "choose_lang": "🌐 <b>ご希望の言語を選択してください：</b>",
    "lang_changed": "✅ 言語を <b>{lang}</b> に変更しました。",
    "invalid_url": "⚠️ 有効な URL または @チャンネル を指定してください。",
    "sub_success": "✅ <b>購読登録が完了しました！</b>\n\n📌 <b>フィード：</b> {title}\n🔗 <b>URL：</b> {url}",
    "already_subscribed": "ℹ️ このフィードは既に登録されています。",
    "sub_not_found": "⚠️ 登録が見つかりませんでした。",
    "unsub_success": "✅ 購読を解除しました：<b>{title}</b>",
    "settings_title": "⚙️ <b>設定：</b>\n<b>{title}</b>\n\n<b>現在のモード：</b> {mode}",
    "mode_default": "⚡ インスタント表示 (デフォルト)",
    "mode_telegraph": "📄 常に Telegraph",
    "mode_photo": "🖼️ 画像付き",
    "mode_link_only": "🔗 リンクのみ",
    "force_poll_start": "⚡ 最新記事を取得中...",
    "force_poll_done": "⚡ <b>{count}</b> 件の最新記事を送信しました。",
    "btn_watch_youtube": "▶️ YouTube で視聴",
    "view_in_telegram": "Telegram で見る",
    "listen_podcast": "ポッドキャストを聴く (音声)",
    "watch_youtube": "YouTube で動画を視聴",
    "watch_video_telegram": "Telegram で動画を視聴",
    "forwarded_from": "転送元:",
    "in_reply_to": "返信先:",
    "post_num": "投稿",
    "btn_back_settings": "« 設定に戻る",
    "app_title": "RSSリーダー Mini App",
    "btn_unsub_num": "❌ 解除 #{num}",
    "btn_auto_lang": "🌐 自動 (Telegram 設定)",
    "action_completed": "処理が完了しました。",
    "feed_delivery_mode": "⚙️ <b>配信モードの設定：</b>\n変更する登録フィードを選択してください：",
    "settings_updated": "✅ <b>設定を更新しました！</b>\n\n<b>フィード：</b> {title}\n<b>新しいモード：</b> {mode}",
    "select_feed_unsub": "<b>{target} から購読解除するフィードを選択：</b>",
    "subs_for": "📋 <b>{target} の登録リスト ({count})：</b>\n\n",
    "no_subs_for": "📭 <b>{target} の登録フィードはありません。</b>\n\n<code>/sub &lt;url&gt;</code> で追加できます。",
    "already_subscribed_chat": "⚠️ <b>既に登録済みです：</b>\n<b>宛先：</b> {target}\n<b>フィード：</b> <code>{url}</code>",
    "discovering_feed": "⏳ <code>{url}</code> のフィードを検出中...",
    "sub_usage": "<b>使い方：</b>\n• <code>/sub &lt;url&gt;</code>\n• <code>/sub @チャンネル &lt;url&gt;</code>\n\n<i>例：</i>\n<code>/sub https://techcrunch.com</code>",
    "instant_view": "インスタント表示",
    "read_original": "元記事を読む",
    "view_post_in_telegram": "Telegram で投稿を見る"
  },
  "pt": {
    "welcome_title": "<b>Bem-vindo ao Bot RSS para Telegram!</b> 📡",
    "welcome_desc": "Um leitor RSS serverless moderno e rápido na nuvem do Telegram.",
    "key_features": "✨ <b>Recursos principais:</b>",
    "feat_reader": "• <b>📖 Mini App Reader:</b> Abra o WebApp para ler artigos completos e gerenciar feeds!",
    "feat_autodetect": "• <b>Detecção automática:</b> Cole qualquer link de site ou blog para encontrar o feed.",
    "feat_instant_view": "• <b>⚡ Visualização Rápida:</b> Converte posts em páginas Telegraph de abertura instantânea.",
    "feat_channel": "• <b>Canais do Telegram:</b> Siga canais públicos com <code>/sub @canal</code>.",
    "feat_broadcast": "• <b>📢 Transmissão em canais:</b> Envie feeds para canais que você gerencia.",
    "feat_opml": "• <b>Importação/Exportação OPML:</b> Envie um arquivo <code>.opml</code> para importar feeds.",
    "commands_header": "📋 <b>Comandos:</b>",
    "cmd_reader": "• <code>/reader</code> — Abrir Mini App RSS Reader",
    "cmd_sub": "• <code>/sub &lt;url|@canal&gt;</code> — Inscrever-se em feed ou canal",
    "cmd_unsub": "• <code>/unsub [url]</code> — Cancelar inscrição",
    "cmd_list": "• <code>/list</code> — Ver inscrições ativas",
    "cmd_set": "• <code>/set</code> — Modo de entrega (⚡ Visualização Rápida, 🖼️ Foto, 🔗 Apenas link)",
    "cmd_lang": "• <code>/lang</code> — Mudar idioma",
    "cmd_poll": "• <code>/poll</code> — Verificar novidades",
    "cmd_force_poll": "• <code>/force_poll</code> — Forçar envio do último post",
    "cmd_export": "• <code>/export</code> — Exportar em OPML",
    "cmd_help": "• <code>/help</code> — Guia de ajuda",
    "btn_open_reader": "📖 Abrir Leitor RSS",
    "btn_my_subs": "📋 Minhas Inscrições",
    "btn_help": "❓ Ajuda",
    "btn_settings": "⚙️ Configurações",
    "btn_language": "🌐 Idioma",
    "btn_read_original": "🌐 Ler original",
    "btn_instant_view": "⚡ Visualização Rápida",
    "btn_channel_post": "📢 Post do canal",
    "btn_watch_video": "📹 Ver vídeo no Telegram",
    "btn_listen_podcast": "🎙️ Ouvir podcast",
    "help_guide_title": "📖 <b>Bot RSS para Telegram — Guia de Comandos</b>",
    "sub_help": "➕ <b>Inscrever-se:</b>\n• <code>/sub https://techcrunch.com</code> <i>(Detecta WordPress/Atom/RSS)</i>\n• <code>/sub https://example.substack.com</code> <i>(Detecta Substack)</i>\n• <code>/sub @canal</code> <i>(Seguir um canal público do Telegram)</i>\n• <code>/sub @meu_canal https://feed-url</code> <i>(Enviar feeds para o seu canal)</i>",
    "unsub_help": "➖ <b>Cancelar inscrição:</b>\n• <code>/unsub &lt;url&gt;</code> — Cancelar feed específico\n• <code>/unsub</code> — Lista com botões interativos para cancelar\n• <code>/unsub @meu_canal &lt;url&gt;</code> — Remover feed de um canal",
    "manage_help": "📋 <b>Gerenciamento e Configuração:</b>\n• <code>/list</code> — Ver inscrições ativas com botões rápidos\n• <code>/set</code> — Modo de entrega (⚡ Visualização Rápida, 🖼️ Foto, 🔗 Apenas link)\n• <code>/lang</code> — Alterar idioma da interface\n• <code>/poll</code> — Verificar novidades imediatamente\n• <code>/force_poll</code> — Forçar envio do último post agora\n• <code>/export</code> — Baixar todas as inscrições como arquivo OPML\n• <b>Importação OPML:</b> Envie qualquer arquivo <code>.opml</code> para importar em lote",
    "no_subs": "📭 Nenhuma inscrição ativa.\nAdicione com <code>/sub &lt;url|@canal&gt;</code>",
    "choose_lang": "🌐 <b>Escolha seu idioma de preferência:</b>",
    "lang_changed": "✅ Idioma alterado para <b>{lang}</b>.",
    "invalid_url": "⚠️ Informe uma URL de feed ou @canal válido.",
    "sub_success": "✅ <b>Inscrição realizada!</b>\n\n📌 <b>Feed:</b> {title}\n🔗 <b>URL:</b> {url}",
    "already_subscribed": "ℹ️ Você já está inscrito neste feed.",
    "sub_not_found": "⚠️ Inscrição não encontrada.",
    "unsub_success": "✅ Inscrição cancelada para: <b>{title}</b>",
    "settings_title": "⚙️ <b>Configurações para:</b>\n<b>{title}</b>\n\n<b>Modo atual:</b> {mode}",
    "mode_default": "⚡ Visualização Rápida (Padrão)",
    "mode_telegraph": "📄 Sempre Telegraph",
    "mode_photo": "🖼️ Foto com legenda",
    "mode_link_only": "🔗 Apenas link",
    "force_poll_start": "⚡ Buscando posts mais recentes...",
    "force_poll_done": "⚡ <b>{count}</b> post(s) recente(s) enviado(s).",
    "btn_watch_youtube": "▶️ Assistir no YouTube",
    "view_in_telegram": "Ver no Telegram",
    "listen_podcast": "Ouvir episódio de podcast (Áudio)",
    "watch_youtube": "Assistir ao vídeo no YouTube",
    "watch_video_telegram": "Assistir ao vídeo no Telegram",
    "forwarded_from": "Encaminhado de",
    "in_reply_to": "Em resposta a",
    "post_num": "Mensagem",
    "btn_back_settings": "« Voltar às configurações",
    "app_title": "RSS Reader Mini App",
    "btn_unsub_num": "❌ Cancelar #{num}",
    "btn_auto_lang": "🌐 Automático (App Telegram)",
    "action_completed": "Ação concluída.",
    "feed_delivery_mode": "⚙️ <b>Configurar modo de entrega:</b>\nSelecione uma inscrição para alterar como ela é enviada:",
    "settings_updated": "✅ <b>Configurações atualizadas!</b>\n\n<b>Feed:</b> {title}\n<b>Novo modo:</b> {mode}",
    "select_feed_unsub": "<b>Selecione um feed para cancelar inscrição de {target}:</b>",
    "subs_for": "📋 <b>Inscrições de {target} ({count}):</b>\n\n",
    "no_subs_for": "📭 <b>Nenhuma inscrição ativa para {target}.</b>\n\nAdicione com: <code>/sub &lt;url&gt;</code>",
    "already_subscribed_chat": "⚠️ <b>Já inscrito:</b>\n<b>Destino:</b> {target}\n<b>Feed:</b> <code>{url}</code>",
    "discovering_feed": "⏳ Detectando feed para <code>{url}</code>...",
    "sub_usage": "<b>Uso:</b>\n• <code>/sub &lt;url&gt;</code>\n• <code>/sub @canal &lt;url&gt;</code>\n\n<i>Exemplo:</i>\n<code>/sub https://techcrunch.com</code>",
    "instant_view": "Visualização Rápida",
    "read_original": "Ler original",
    "view_post_in_telegram": "Ver post no Telegram"
  },
  "id": {
    "welcome_title": "<b>Selamat datang di RSS to Telegram Bot!</b> 📡",
    "welcome_desc": "Pembaca RSS serverless modern bertenaga cloud Telegram.",
    "key_features": "✨ <b>Fitur Utama:</b>",
    "feat_reader": "• <b>📖 Mini App Reader:</b> Buka WebApp lengkap untuk membaca artikel dan mengelola langganan!",
    "feat_autodetect": "• <b>Deteksi Otomatis:</b> Cukup tempel tautan situs apa pun, bot akan menemukan feed otomatis.",
    "feat_instant_view": "• <b>⚡ Tampilan Cepat:</b> Mengubah artikel menjadi tampilan cepat Telegraph.",
    "feat_channel": "• <b>Saluran Telegram:</b> Ikuti saluran publik dengan <code>/sub @saluran</code>.",
    "feat_broadcast": "• <b>📢 Siaran Saluran:</b> Kirim artikel ke saluran yang Anda kelola.",
    "feat_opml": "• <b>Impor/Ekspor OPML:</b> Kirim file <code>.opml</code> untuk mengimpor langganan.",
    "commands_header": "📋 <b>Perintah:</b>",
    "cmd_reader": "• <code>/reader</code> — Buka Mini App RSS Reader",
    "cmd_sub": "• <code>/sub &lt;url|@saluran&gt;</code> — Berlangganan feed atau saluran",
    "cmd_unsub": "• <code>/unsub [url]</code> — Berhenti berlangganan",
    "cmd_list": "• <code>/list</code> — Lihat daftar langganan",
    "cmd_set": "• <code>/set</code> — Ubah mode pengiriman (⚡ Tampilan Cepat, 🖼️ Foto, 🔗 Hanya Tautan)",
    "cmd_lang": "• <code>/lang</code> — Ubah bahasa",
    "cmd_poll": "• <code>/poll</code> — Periksa pembaruan sekarang",
    "cmd_force_poll": "• <code>/force_poll</code> — Kirim postingan terbaru segera",
    "cmd_export": "• <code>/export</code> — Ekspor sebagai OPML",
    "cmd_help": "• <code>/help</code> — Bantuan lengkap",
    "btn_open_reader": "📖 Buka RSS Reader",
    "btn_my_subs": "📋 Langganan Saya",
    "btn_help": "❓ Bantuan",
    "btn_settings": "⚙️ Pengaturan",
    "btn_language": "🌐 Bahasa",
    "btn_read_original": "🌐 Baca Asli",
    "btn_instant_view": "⚡ Tampilan Cepat",
    "btn_channel_post": "📢 Postingan Saluran",
    "btn_watch_video": "📹 Tonton Video di Telegram",
    "btn_listen_podcast": "🎙️ Dengarkan Podcast",
    "help_guide_title": "📖 <b>RSS to Telegram Bot — Panduan Perintah</b>",
    "sub_help": "➕ <b>Berlangganan:</b>\n• <code>/sub https://techcrunch.com</code> <i>(Deteksi otomatis WordPress/Atom/RSS)</i>\n• <code>/sub https://example.substack.com</code> <i>(Deteksi otomatis Substack)</i>\n• <code>/sub @saluran</code> <i>(Ikuti saluran publik Telegram)</i>\n• <code>/sub @saluran_saya https://feed-url</code> <i>(Kirim feed ke saluran Anda)</i>",
    "unsub_help": "➖ <b>Berhenti Berlangganan:</b>\n• <code>/unsub &lt;url&gt;</code> — Berhenti dari feed tertentu\n• <code>/unsub</code> — Daftar tombol interaktif untuk berhenti\n• <code>/unsub @saluran_saya &lt;url&gt;</code> — Hapus feed dari saluran",
    "manage_help": "📋 <b>Kelola dan Konfigurasi:</b>\n• <code>/list</code> — Tampilkan langganan aktif dengan tombol cepat\n• <code>/set</code> — Ubah mode pengiriman (⚡ Tampilan Cepat, 🖼️ Foto, 🔗 Hanya Tautan)\n• <code>/lang</code> — Ganti bahasa antarmuka\n• <code>/poll</code> — Periksa pembaruan feed sekarang\n• <code>/force_poll</code> — Paksa kirim postingan terbaru sekarang\n• <code>/export</code> — Unduh semua feed sebagai file OPML\n• <b>Impor OPML:</b> Kirim file <code>.opml</code> apa saja untuk impor massal",
    "no_subs": "📭 Belum ada langganan aktif.\nTambahkan dengan <code>/sub &lt;url|@saluran&gt;</code>",
    "choose_lang": "🌐 <b>Pilih bahasa yang Anda inginkan:</b>",
    "lang_changed": "✅ Bahasa diubah ke <b>{lang}</b>.",
    "invalid_url": "⚠️ Masukkan URL atau @saluran yang valid.",
    "sub_success": "✅ <b>Berhasil berlangganan!</b>\n\n📌 <b>Feed:</b> {title}\n🔗 <b>URL:</b> {url}",
    "already_subscribed": "ℹ️ Anda sudah berlangganan feed ini.",
    "sub_not_found": "⚠️ Langganan tidak ditemukan.",
    "unsub_success": "✅ Berhenti berlangganan dari: <b>{title}</b>",
    "settings_title": "⚙️ <b>Pengaturan untuk:</b>\n<b>{title}</b>\n\n<b>Mode saat ini:</b> {mode}",
    "mode_default": "⚡ Tampilan Cepat (Bawaan)",
    "mode_telegraph": "📄 Selalu Telegraph",
    "mode_photo": "🖼️ Foto dengan teks",
    "mode_link_only": "🔗 Hanya Tautan",
    "force_poll_start": "⚡ Mengambil postingan terbaru...",
    "force_poll_done": "⚡ <b>{count}</b> postingan terbaru terkirim.",
    "btn_watch_youtube": "▶️ Tonton di YouTube",
    "view_in_telegram": "Lihat di Telegram",
    "listen_podcast": "Dengarkan Episode Podcast (Audio)",
    "watch_youtube": "Tonton Video di YouTube",
    "watch_video_telegram": "Tonton Video di Telegram",
    "forwarded_from": "Diteruskan dari",
    "in_reply_to": "Membalas ke",
    "post_num": "Postingan",
    "btn_back_settings": "« Kembali ke Pengaturan",
    "app_title": "RSS Reader Mini App",
    "btn_unsub_num": "❌ Batal #{num}",
    "btn_auto_lang": "🌐 Otomatis (Aplikasi Telegram)",
    "action_completed": "Tindakan selesai.",
    "feed_delivery_mode": "⚙️ <b>Atur Mode Pengiriman Feed:</b>\nPilih langganan untuk mengubah cara pengirimannya:",
    "settings_updated": "✅ <b>Pengaturan Diperbarui!</b>\n\n<b>Feed:</b> {title}\n<b>Mode Baru:</b> {mode}",
    "select_feed_unsub": "<b>Pilih feed untuk berhenti berlangganan dari {target}:</b>",
    "subs_for": "📋 <b>Langganan untuk {target} ({count}):</b>\n\n",
    "no_subs_for": "📭 <b>Tidak ada langganan aktif untuk {target}.</b>\n\nTambahkan dengan: <code>/sub &lt;url&gt;</code>",
    "already_subscribed_chat": "⚠️ <b>Sudah Berlangganan:</b>\n<b>Tujuan:</b> {target}\n<b>Feed:</b> <code>{url}</code>",
    "discovering_feed": "⏳ Mendeteksi feed untuk <code>{url}</code>...",
    "sub_usage": "<b>Penggunaan:</b>\n• <code>/sub &lt;url&gt;</code>\n• <code>/sub @saluran &lt;url&gt;</code>\n\n<i>Contoh:</i>\n<code>/sub https://techcrunch.com</code>",
    "instant_view": "Tampilan Cepat",
    "read_original": "Baca Asli",
    "view_post_in_telegram": "Lihat postingan di Telegram"
  }
};

export const COMMAND_DESCRIPTIONS = {
  "en": [
    {
      "command": "reader",
      "description": "📖 Open RSS Reader Mini App"
    },
    {
      "command": "sub",
      "description": "Subscribe to feed or channel"
    },
    {
      "command": "unsub",
      "description": "Unsubscribe from a feed"
    },
    {
      "command": "list",
      "description": "List active subscriptions"
    },
    {
      "command": "set",
      "description": "Configure delivery mode (Instant View/Photo)"
    },
    {
      "command": "lang",
      "description": "Change language interface"
    },
    {
      "command": "poll",
      "description": "Check feeds for new posts"
    },
    {
      "command": "force_poll",
      "description": "Force deliver latest post immediately"
    },
    {
      "command": "export",
      "description": "Export subscriptions to OPML file"
    },
    {
      "command": "help",
      "description": "Show complete command guide"
    }
  ],
  "uk": [
    {
      "command": "reader",
      "description": "📖 Відкрити RSS-рідер Mini App"
    },
    {
      "command": "sub",
      "description": "Підписатися на стрічку або канал"
    },
    {
      "command": "unsub",
      "description": "Скасувати підписку на стрічку"
    },
    {
      "command": "list",
      "description": "Список активних підписок"
    },
    {
      "command": "set",
      "description": "Налаштувати режим доставки"
    },
    {
      "command": "lang",
      "description": "Змінити мову інтерфейсу"
    },
    {
      "command": "poll",
      "description": "Перевірити оновлення зараз"
    },
    {
      "command": "force_poll",
      "description": "Негайно надіслати останній допис"
    },
    {
      "command": "export",
      "description": "Експортувати підписки в OPML"
    },
    {
      "command": "help",
      "description": "Повна довідка та інструкція"
    }
  ],
  "zh-Hans": [
    {
      "command": "reader",
      "description": "📖 打开 RSS 阅读器小程序"
    },
    {
      "command": "sub",
      "description": "订阅 RSS 源或公开频道"
    },
    {
      "command": "unsub",
      "description": "退订指定源或频道"
    },
    {
      "command": "list",
      "description": "查看当前订阅列表"
    },
    {
      "command": "set",
      "description": "配置推送模式 (即时预览/大图/链接)"
    },
    {
      "command": "lang",
      "description": "切换界面语言"
    },
    {
      "command": "poll",
      "description": "立即检查新更新"
    },
    {
      "command": "force_poll",
      "description": "强制推送最新文章"
    },
    {
      "command": "export",
      "description": "导出订阅为 OPML 文件"
    },
    {
      "command": "help",
      "description": "查看完整使用指南"
    }
  ],
  "zh-Hant": [
    {
      "command": "reader",
      "description": "📖 開啟 RSS 閱讀器小程式"
    },
    {
      "command": "sub",
      "description": "訂閱 RSS 來源或公開頻道"
    },
    {
      "command": "unsub",
      "description": "退訂指定來源或頻道"
    },
    {
      "command": "list",
      "description": "檢視目前訂閱清單"
    },
    {
      "command": "set",
      "description": "設定推送模式 (即時預覽/大圖/連結)"
    },
    {
      "command": "lang",
      "description": "切換介面語言"
    },
    {
      "command": "poll",
      "description": "立即檢查更新"
    },
    {
      "command": "force_poll",
      "description": "強制推送最新文章"
    },
    {
      "command": "export",
      "description": "匯出訂閱為 OPML 檔案"
    },
    {
      "command": "help",
      "description": "檢視完整使用指南"
    }
  ],
  "es": [
    {
      "command": "reader",
      "description": "📖 Abrir lector RSS Mini App"
    },
    {
      "command": "sub",
      "description": "Suscribirse a un feed o canal"
    },
    {
      "command": "unsub",
      "description": "Cancelar suscripción a un feed"
    },
    {
      "command": "list",
      "description": "Ver suscripciones activas"
    },
    {
      "command": "set",
      "description": "Configurar modo de entrega"
    },
    {
      "command": "lang",
      "description": "Cambiar idioma de la interfaz"
    },
    {
      "command": "poll",
      "description": "Buscar nuevas publicaciones"
    },
    {
      "command": "force_poll",
      "description": "Enviar la última publicación ahora"
    },
    {
      "command": "export",
      "description": "Exportar suscripciones a OPML"
    },
    {
      "command": "help",
      "description": "Guía de comandos y ayuda"
    }
  ],
  "it": [
    {
      "command": "reader",
      "description": "📖 Apri RSS Reader Mini App"
    },
    {
      "command": "sub",
      "description": "Iscriviti a feed o canale"
    },
    {
      "command": "unsub",
      "description": "Annulla iscrizione a un feed"
    },
    {
      "command": "list",
      "description": "Mostra iscrizioni attive"
    },
    {
      "command": "set",
      "description": "Configura modalità di consegna"
    },
    {
      "command": "lang",
      "description": "Cambia lingua dell’interfaccia"
    },
    {
      "command": "poll",
      "description": "Controlla nuovi aggiornamenti"
    },
    {
      "command": "force_poll",
      "description": "Invia subito l’ultimo post"
    },
    {
      "command": "export",
      "description": "Esporta iscrizioni in OPML"
    },
    {
      "command": "help",
      "description": "Guida comandi e istruzioni"
    }
  ],
  "fr": [
    {
      "command": "reader",
      "description": "📖 Ouvrir le lecteur RSS Mini App"
    },
    {
      "command": "sub",
      "description": "S’abonner à un flux ou canal"
    },
    {
      "command": "unsub",
      "description": "Se désabonner d’un flux"
    },
    {
      "command": "list",
      "description": "Liste des abonnements actifs"
    },
    {
      "command": "set",
      "description": "Configurer le mode d’envoi"
    },
    {
      "command": "lang",
      "description": "Changer la langue de l’interface"
    },
    {
      "command": "poll",
      "description": "Vérifier les nouveaux articles"
    },
    {
      "command": "force_poll",
      "description": "Envoyer le dernier post immédiatement"
    },
    {
      "command": "export",
      "description": "Exporter les abonnements en OPML"
    },
    {
      "command": "help",
      "description": "Afficher le guide des commandes"
    }
  ],
  "de": [
    {
      "command": "reader",
      "description": "📖 RSS Reader Mini App öffnen"
    },
    {
      "command": "sub",
      "description": "Feed oder Kanal abonnieren"
    },
    {
      "command": "unsub",
      "description": "Feed abbestellen"
    },
    {
      "command": "list",
      "description": "Aktive Abonnements auflisten"
    },
    {
      "command": "set",
      "description": "Zustellmodus anpassen"
    },
    {
      "command": "lang",
      "description": "Sprache ändern"
    },
    {
      "command": "poll",
      "description": "Auf neue Beiträge prüfen"
    },
    {
      "command": "force_poll",
      "description": "Neuesten Beitrag sofort senden"
    },
    {
      "command": "export",
      "description": "Abonnements als OPML exportieren"
    },
    {
      "command": "help",
      "description": "Befehlsübersicht anzeigen"
    }
  ],
  "tr": [
    {
      "command": "reader",
      "description": "📖 RSS Reader Uygulamasını Aç"
    },
    {
      "command": "sub",
      "description": "Akış veya kanala abone ol"
    },
    {
      "command": "unsub",
      "description": "Abonelikten çık"
    },
    {
      "command": "list",
      "description": "Aktif abonelikleri listele"
    },
    {
      "command": "set",
      "description": "Teslimat modunu yapılandır"
    },
    {
      "command": "lang",
      "description": "Arayüz dilini değiştir"
    },
    {
      "command": "poll",
      "description": "Yeni gönderileri denetle"
    },
    {
      "command": "force_poll",
      "description": "Son gönderiyi hemen ilet"
    },
    {
      "command": "export",
      "description": "Abonelikleri OPML olarak dışa aktar"
    },
    {
      "command": "help",
      "description": "Komut kılavuzunu görüntüle"
    }
  ],
  "ja": [
    {
      "command": "reader",
      "description": "📖 RSSリーダーを開く"
    },
    {
      "command": "sub",
      "description": "フィードまたはチャンネルを購読"
    },
    {
      "command": "unsub",
      "description": "購読を解除"
    },
    {
      "command": "list",
      "description": "購読リストを表示"
    },
    {
      "command": "set",
      "description": "配信モードを設定"
    },
    {
      "command": "lang",
      "description": "言語を変更"
    },
    {
      "command": "poll",
      "description": "最新の投稿を確認"
    },
    {
      "command": "force_poll",
      "description": "最新の投稿を今すぐ配信"
    },
    {
      "command": "export",
      "description": "OPML形式でエクスポート"
    },
    {
      "command": "help",
      "description": "コマンド一覧とヘルプを表示"
    }
  ],
  "pt": [
    {
      "command": "reader",
      "description": "📖 Abrir Leitor RSS Mini App"
    },
    {
      "command": "sub",
      "description": "Inscrever-se em feed ou canal"
    },
    {
      "command": "unsub",
      "description": "Cancelar inscrição de feed"
    },
    {
      "command": "list",
      "description": "Listar inscrições ativas"
    },
    {
      "command": "set",
      "description": "Configurar modo de entrega"
    },
    {
      "command": "lang",
      "description": "Alterar idioma da interface"
    },
    {
      "command": "poll",
      "description": "Verificar novos artigos"
    },
    {
      "command": "force_poll",
      "description": "Enviar publicação mais recente agora"
    },
    {
      "command": "export",
      "description": "Exportar inscrições para OPML"
    },
    {
      "command": "help",
      "description": "Exibir guia de comandos"
    }
  ],
  "id": [
    {
      "command": "reader",
      "description": "📖 Buka Mini App Pembaca RSS"
    },
    {
      "command": "sub",
      "description": "Berlangganan umpan atau saluran"
    },
    {
      "command": "unsub",
      "description": "Berhenti berlangganan"
    },
    {
      "command": "list",
      "description": "Daftar langganan aktif"
    },
    {
      "command": "set",
      "description": "Atur mode pengiriman"
    },
    {
      "command": "lang",
      "description": "Ubah bahasa antarmuka"
    },
    {
      "command": "poll",
      "description": "Periksa pembaruan baru"
    },
    {
      "command": "force_poll",
      "description": "Kirim postingan terbaru sekarang"
    },
    {
      "command": "export",
      "description": "Ekspor langganan ke OPML"
    },
    {
      "command": "help",
      "description": "Panduan lengkap perintah"
    }
  ]
};

/**
 * Register localized bot commands with Telegram Bot API across all supported languages.
 * Telegram clients querying commands in Ukrainian or Russian will receive Ukrainian commands.
 * Other supported locales receive their native commands, and default fallback is English.
 * @param {object} api
 */
export async function registerAllBotCommands(api) {
  try {
    // 1. Default (English)
    await api.setMyCommands({ commands: COMMAND_DESCRIPTIONS.en }).catch(() => {});

    // 2. Specific language scopes
    const langMappings = [
      { code: 'uk', commands: COMMAND_DESCRIPTIONS.uk },
      // Explicit requirement: Telegram clients set to Russian ('ru') receive Ukrainian commands
      { code: 'ru', commands: COMMAND_DESCRIPTIONS.uk },
      { code: 'zh', commands: COMMAND_DESCRIPTIONS['zh-Hans'] },
      { code: 'es', commands: COMMAND_DESCRIPTIONS.es },
      { code: 'it', commands: COMMAND_DESCRIPTIONS.it },
      { code: 'fr', commands: COMMAND_DESCRIPTIONS.fr },
      { code: 'de', commands: COMMAND_DESCRIPTIONS.de },
      { code: 'tr', commands: COMMAND_DESCRIPTIONS.tr },
      { code: 'ja', commands: COMMAND_DESCRIPTIONS.ja },
      { code: 'pt', commands: COMMAND_DESCRIPTIONS.pt },
      { code: 'id', commands: COMMAND_DESCRIPTIONS.id },
    ];

    for (const { code, commands } of langMappings) {
      await api.setMyCommands({ commands, language_code: code }).catch(() => {});
    }
  } catch (err) {
    console.warn('[registerAllBotCommands] Failed to set bot commands:', err.message);
  }
}



/**
 * Get translated text for given lang and key
 * @param {string} lang
 * @param {string} key
 * @param {object} [params]
 * @returns {string}
 */
export function t(lang, key, params = {}) {
  const code = normalizeLanguageCode(lang);
  const langDict = MESSAGES[code] || MESSAGES.en;
  let text = langDict[key] || MESSAGES.en[key] || key;

  for (const [k, v] of Object.entries(params)) {
    text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
  }
  return text;
}

/**
 * Fetch chat's preferred language from SQLite or default to user's Telegram language
 * @param {number} chatId
 * @param {string|null} [userLangCode]
 * @returns {Promise<string>}
 */
export async function getChatLanguage(chatId, userLangCode = null) {
  try {
    const setting = await db.select()
      .from(chatSettings)
      .where(eq(chatSettings.chatId, chatId))
      .get();

    if (setting?.lang && setting.lang !== 'auto') {
      return normalizeLanguageCode(setting.lang);
    }
  } catch {
    // Fall back to user language
  }

  return normalizeLanguageCode(userLangCode);
}

