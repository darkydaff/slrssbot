# slrssbot

RSS, Atom, JSON Feed, and Telegram channel syndication bot and Mini App running on Telegram Serverless (`tgcloud`) with scheduling via Cloudflare Workers.

## Overview

`slrssbot` parses syndication feeds and public Telegram channels, stores articles and media in SQLite, delivers updates to Telegram chats, channels, and groups, and provides a Telegram Mini App reader interface.

- **Runtime Environment:** Telegram Serverless (V8 Isolate)
- **Database:** Persistent SQLite via `sdk/db`
- **Mini App Client:** Single-page React application hosted via `tgcloud` static hosting
- **Scheduler:** Cloudflare Workers cron trigger (`wrangler`) or systemd timer

## Standards Conformance

| Standard | Identifier | Implementation Details |
| :--- | :--- | :--- |
| **Date and Time** | ISO 8601-1:2019 / RFC 3339 | Timestamps in storage and API payloads format as UTC strings (`YYYY-MM-DDTHH:mm:ss.sssZ`) or epoch integers. |
| **Language Codes** | ISO 639-1:2002 | Two-letter language codes for localization (`en`, `uk`, `es`, `it`, `fr`, `de`, `tr`, `ja`, `pt`, `id`). |
| **Language Tags** | BCP 47 / ISO 15897 | Script variants (`zh-Hans`, `zh-Hant`). Russian (`ru`) normalizes to Ukrainian (`uk`). |
| **Character Encoding** | ISO/IEC 10646:2020 / UTF-8 | UTF-8 encoding across XML/HTML parsers, SQLite storage, and Telegram Bot API. |
| **Data Interchange** | ISO/IEC 21778:2017 / RFC 8259 | JSON payload formatting in API endpoints and JSON Feed parser. |
| **Atom Syndication** | RFC 4287 | Atom 1.0 XML parsing (`feed`, `entry`, `link`, `author`, `summary`, `content`). |
| **RSS Syndication** | RSS 2.0 Specification | RSS 0.9x / 1.0 / 2.0 XML parsing (`channel`, `item`, `enclosure`, `guid`, `pubDate`). |
| **JSON Feed** | JSON Feed 1.1 | JSON Feed parsing (`items`, `attachments`, `author`). |
| **Subscription Outline** | OPML 2.0 | XML outline import and export (`opml`, `outline`). |
| **HTTP Conditional Requests** | RFC 7232 | `ETag`, `If-None-Match`, `Last-Modified`, and `If-Modified-Since` cache validation. |

## Command Reference

| Command | Parameters | Description |
| :--- | :--- | :--- |
| `/reader` | None | Opens the RSS Reader Mini App |
| `/start` | None | Displays welcome text and command list |
| `/help` | None | Displays detailed syntax guide and examples |
| `/sub` | `<url>` or `@channel` | Subscribes chat or channel to a feed |
| `/unsub` | `[url]` | Unsubscribes from a feed or displays interactive list |
| `/list` | None | Lists active subscriptions with unsubscribe controls |
| `/set` | None | Opens delivery mode selector (`default`, `telegraph`, `photo`, `link_only`) |
| `/lang` | `[code]` | Changes language interface |
| `/poll` | None | Checks subscriptions for new entries |
| `/force_poll` | None | Immediately delivers the latest entry from subscriptions |
| `/export` | None | Exports active subscriptions to an OPML 2.0 document |

Sending an `.opml` or `.xml` file to the bot initiates an automatic subscription import.

## Mini App API Endpoints

The Mini App interacts with the backend via `POST /api/<name>` using Telegram WebApp authentication (`ctx.initData`).

| Endpoint | Method | Request Payload | Response |
| :--- | :--- | :--- | :--- |
| `/api/get_articles` | POST | `{ filter: "all"\|"unread"\|"starred", feedUrl?, search?, limit?, offset? }` | `{ articles: Article[], total: number }` |
| `/api/get_article` | POST | `{ id: number }` | `{ article: Article }` |
| `/api/set_article_state` | POST | `{ entryId?, isRead?, isStarred?, markAllRead? }` | `{ ok: boolean }` |
| `/api/get_feeds` | POST | `{}` | `{ feeds: Feed[], stats: Stats }` |
| `/api/manage_feed` | POST | `{ action: "sub"\|"unsub"\|"pause"\|"resume"\|"set_mode"\|"set_lang", ... }` | Action-dependent result |
| `/api/poll` | POST | `{}` | `{ results: PollResult[] }` |

## Database Schema

Database managed via `tgcloud/schema.js`:

- `subscriptions`: Registered feed subscriptions per chat ID (`chat_id`, `feed_url`, `custom_title`, `send_mode`, `filter_include`, `filter_exclude`, `paused`, `created_at`).
- `feed_states`: HTTP cache validation headers and feed metadata (`feed_url`, `title`, `description`, `site_url`, `etag`, `last_modified`, `last_checked_at`, `error_count`, `last_error`).
- `feed_entries`: Permanent article, text, and media storage (`feed_url`, `entry_guid`, `title`, `link`, `author`, `summary`, `content`, `lead_image_url`, `media`, `telegraph_url`, `published_at`, `created_at`).
- `user_article_states`: Per-user reading progress and bookmarks (`user_id`, `entry_id`, `is_read`, `is_starred`, `read_at`, `starred_at`).
- `chat_settings`: Per-chat UI configuration (`chat_id`, `lang`, `enable_preview`, `display_template`).
- `bot_config`: Global configuration values (`key`, `value`, `updated_at`).

## Directory Structure

```
slrssbot/
├── cloudflare/
│   └── worker.js              # Cloudflare Workers cron poller trigger
├── dist/                      # Mini App production build (static site)
├── docs/
│   └── tgcloud-sdk.md         # Telegram Serverless SDK documentation
├── scripts/
│   ├── poll_runner.js         # Local background poller script
│   └── systemd/               # Linux systemd service and timer units
├── src/                       # Mini App source code (React + Tailwind CSS)
│   ├── components/            # UI components (Reader, ArticleList, Modals)
│   └── lib/                   # Client utilities (API, date, i18n, Telegram)
├── test/                      # Node.js test suite
├── tgcloud/
│   ├── endpoints/             # HTTP API endpoints (POST /api/<name>)
│   ├── handlers/              # Telegram update handlers (message, callback_query)
│   ├── lib/                   # Backend modules (RSS, extractor, poller, i18n)
│   └── schema.js              # SQLite database schema definition
├── package.json
├── tgcloud.jsonc              # Platform configuration and static routing
└── wrangler.toml              # Cloudflare Workers deployment config
```

## Operations

### Deployment

```bash
# Build frontend and push code to Telegram Serverless
npm run deploy

# Check deployment sync status
npm run status

# Apply database schema migrations
npx tgcloud migrate
```

### Scheduling

```bash
# Deploy Cloudflare Worker cron trigger (runs every 5 minutes)
npm run cf:deploy

# Configure Telegram Serverless auth token for cron trigger
npm run cf:secret
```

### Testing

```bash
# Run test suite
npm test
```
