# slrssbot

RSS to Telegram Serverless Bot. Hosted on Telegram Serverless (`tgcloud`) with automated scheduling via Cloudflare Workers.

## Overview

`slrssbot` delivers syndication updates (RSS, Atom, JSON Feed, and public Telegram channels) to Telegram users, groups, and channels without requiring dedicated server infrastructure.

- **Execution Environment:** Telegram Serverless (V8 isolate platform)
- **Database:** Persistent Cloud SQLite (`sdk/db`)
- **Scheduler:** Cloudflare Workers Cron Trigger (`wrangler`)
- **Protocol Support:** RSS 0.9x / 1.0 / 2.0, Atom 1.0, JSON Feed 1.x, Telegram Channel Web / RSS Mirrored feeds

## Specification & Standards Conformance

| Standard / Interface | Implementation |
| :--- | :--- |
| **RSS 2.0** | `tgcloud/lib/rss.js` (XML parser, enclosures, guid, pubDate) |
| **Atom 1.0** (RFC 4287) | `tgcloud/lib/rss.js` (`feed`, `entry`, `link[rel=alternate]`) |
| **JSON Feed 1.1** | `tgcloud/lib/rss.js` (JSON specification compliant) |
| **OPML 2.0** | `tgcloud/lib/opml.js` (Import and export) |
| **HTTP/1.1 Conditional Requests** (RFC 7232) | `ETag`, `If-None-Match`, `If-Modified-Since` cache validation |
| **Telegram Bot API HTML** | `tgcloud/lib/formatter.js` (Sanitization to supported tags only) |

## Command Reference

| Command | Arguments | Description |
| :--- | :--- | :--- |
| `/start` | None | Initialize bot session and display usage |
| `/help` | None | Display available commands and filter syntax |
| `/sub` | `<url>` or `@channel` | Subscribe current chat to feed or channel |
| `/unsub` | `[url]` | Unsubscribe from feed or launch interactive list |
| `/list` | None | List active subscriptions with inline keyboard controls |
| `/poll` | None | Trigger immediate check for new entries |
| `/export` | None | Export all active subscriptions as an OPML document |
| `/set` | `<setting> <val>` | Configure delivery mode (`default`, `link_only`, `photo`) |

Sending an `.opml` or `.xml` file to the bot automatically imports subscriptions.

## Architecture

```
slrssbot/
├── cloudflare/
│   └── worker.js             # Cloudflare Worker cron trigger & HTTP proxy
├── docs/
│   └── tgcloud-sdk.md        # Telegram Serverless SDK reference
├── scripts/
│   ├── poll_runner.js        # Node.js background poller runner
│   └── systemd/              # Linux systemd user service & timer units
├── test/                     # Node.js test suite
├── tgcloud/
│   ├── schema.js             # SQLite DDL (subscriptions, states, deduplication)
│   ├── endpoints/
│   │   └── poll.js           # Management API invocation endpoint
│   ├── handlers/
│   │   ├── message.js        # Bot API message update handler
│   │   └── callback_query.js # Bot API callback query handler
│   └── lib/
│       ├── feed_finder.js    # Web discovery for auto-locating feeds
│       ├── formatter.js      # Telegram HTML sanitizer & template compiler
│       ├── opml.js           # OPML import/export parser
│       ├── poller.js         # Differential engine and broadcast pipeline
│       ├── rss.js            # RSS/Atom/JSON feed parser
│       ├── telegram_channel.js # Public channel fetcher & parser
│       └── telegraph.js      # Telegraph API publisher
├── package.json
├── tgcloud.jsonc
└── wrangler.toml             # Cloudflare Workers configuration
```

## Deployment & Operations

### 1. Telegram Serverless Deployment

Prerequisites: Node.js >= 18, `@tgcloud/cli`.

```bash
# Verify local module state against cloud revision
npm run status

# Push modules to Telegram Serverless
npm run deploy

# Apply database migrations when tgcloud/schema.js changes
npx tgcloud migrate

# Run poll endpoint directly
npm run poll
```

### 2. Cloudflare Edge Scheduling (Recommended)

Scheduled execution runs on Cloudflare Workers edge runtime every 5 minutes (`*/5 * * * *`).

```bash
# Authenticate with Cloudflare
npx wrangler login

# Deploy worker and cron trigger
npm run cf:deploy

# Configure Telegram Serverless access token
npm run cf:secret
# Enter token format: app<id>:<secret>

# Tail live worker execution logs
npm run cf:tail
```

### 3. Alternative Local Polling

For self-hosted Linux environments:

```bash
# Systemd user timer (runs every 5 minutes)
systemctl --user list-timers rsstg-poller.timer

# Background daemon runner
npm run poll:daemon -- --interval=5
```

## Verification & Testing

```bash
# Execute unit test suite
npm test
```
