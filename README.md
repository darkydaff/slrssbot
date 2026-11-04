# RSS to Telegram Serverless Bot (`slrssbot`)

A complete rewrite of [Rongronggg9/RSS-to-Telegram-Bot](https://github.com/Rongronggg9/RSS-to-Telegram-Bot) in modern JavaScript, natively hosted on **[Telegram Serverless](https://core.telegram.org/bots/serverless)** (`tgcloud`).

---

## 🚀 Features

- **Native Telegram Serverless Architecture:** Runs on Telegram's high-speed isolated V8 infrastructure. No VPS, Docker, or external servers to maintain.
- **Built-in Cloud SQLite Database:** Persistent subscriptions, feed caching, and entry deduplication managed with `sdk/db`.
- **Feed Standards Supported:** RSS 0.9x/1.0/2.0, Atom 1.0, and JSON Feed.
- **Native Public Telegram Channel Polling:** Follow public Telegram channels (`/sub @channel` or `/sub https://t.me/channel`) directly with native Telegram post formatting (no third-party RSS mirrors, no duplicated fake titles, preserves forward headers and rich formatting).
- **Rich Message Formatting:** Cleans arbitrary web HTML into Telegram-compliant HTML tags, formats links, and embeds images.
- **OPML Import / Export:** Bulk export subscriptions to `.opml` or upload any `.opml` file to import feeds automatically.
- **Deduplication & Conditional Requests:** Uses HTTP ETags, `If-Modified-Since`, and unique entry GUID tracking to minimize network overhead and eliminate duplicate notifications.
- **Interactive Controls:** Inline keyboard buttons for list navigation and quick unsubscribe actions.

---

## 💬 Bot Commands

| Command | Description |
| :--- | :--- |
| `/start` | Welcome overview and quick start guide |
| `/help` | Detailed command list and formatting syntax |
| `/sub <url>` | Subscribe to an RSS, Atom, or JSON feed |
| `/unsub [url]` | Unsubscribe from a feed (or display interactive buttons) |
| `/list` | List active subscriptions with inline action buttons |
| `/poll` | Trigger an immediate manual check of all feeds for updates |
| `/export` | Export all subscriptions to an OPML file |
| *Upload `.opml`* | Send an OPML document to the bot to batch import all feeds |

---

## 🛠️ CLI & Deployment (`tgcloud`)

Managed via `@tgcloud/cli`:

```bash
# Check status relative to Telegram Cloud
npm run status

# Deploy updated modules to Telegram Serverless
npm run deploy

# Run unit tests locally
npm test

# Run manual poll cycle
npm run poll

# Start continuous background polling daemon
npm run poll:daemon

# Inspect bot webhook configuration
npx tgcloud webhook
```

---

## ⏰ Automated Background Polling

Telegram Serverless executes on-demand when updates or API calls arrive. You can trigger continuous automatic polling in the cloud using **Cloudflare Workers Cron Triggers** (recommended) or locally:

### 1. Cloudflare Workers Cron Trigger (Recommended — Cloud & Free)
GitHub Actions scheduled workflows suffer from 15–60 minute delays and auto-disable on repo inactivity. Instead, deploy the lightweight Cloudflare Worker in `cloudflare/worker.js` (configured via `wrangler.toml` to run every 5 minutes on Cloudflare's edge):

```bash
# 1. Authenticate with Cloudflare (one-time)
npx wrangler login

# 2. Deploy the Cloudflare Worker & Cron Trigger
npm run cf:deploy

# 3. Store your Telegram Serverless CLI token (app<id>:<secret>) as an encrypted Worker secret
npm run cf:secret

# (Optional) Set a custom secret for manual HTTP POST /poll triggers
npx wrangler secret put POLL_SECRET

# View live cron execution logs from Cloudflare's edge
npm run cf:tail
```

You can also test the scheduled handler locally:
```bash
npm run cf:dev
# Then in another terminal:
curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"
```

### 2. Systemd User Timer (Local Linux)
Installed and running via `systemd --user` every 5 minutes:
```bash
# View timer status & next scheduled run
systemctl --user list-timers rsstg-poller.timer

# View live delivery logs
journalctl --user -u rsstg-poller.service -f
```

### 3. Standalone Background Daemon
Run directly or under tmux / screen:
```bash
npm run poll:daemon              # Default 5-minute interval
npm run poll:daemon -- --interval=10 # Custom 10-minute interval
```

### 4. Crontab Alternative
```text
*/5 * * * * cd /home/darkydaff/git/slrssbot && npm run poll >> /tmp/rsstg-poll.log 2>&1
```


---

## 📂 Project Structure

```text
rsstg/
├── docs/
│   └── tgcloud-sdk.md       # Official Telegram Serverless SDK reference
├── test/
│   └── rss.test.js          # Unit tests (feed parser, sanitizer, OPML)
├── tgcloud/
│   ├── schema.js            # SQLite tables (subscriptions, feed_states, feed_entries)
│   ├── handlers/
│   │   ├── message.js       # Commands (/start, /sub, /unsub, /list, /poll, /export, OPML)
│   │   └── callback_query.js# Interactive buttons & callbacks
│   ├── endpoints/
│   │   └── poll.js          # Scheduled poll endpoint
│   └── lib/
│       ├── telegram_channel.js # Direct public Telegram channel fetcher & parser
│       ├── rss.js           # Pure JS RSS/Atom/JSON feed parser
│       ├── formatter.js     # Telegram HTML sanitizer & post builder
│       ├── opml.js          # OPML import and export generator
│       └── poller.js        # Feed differential engine & broadcaster
├── package.json
└── tgcloud.jsonc
```

