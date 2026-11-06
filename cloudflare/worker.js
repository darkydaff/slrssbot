/**
 * Cloudflare Worker Cron Trigger for slrssbot (Telegram Serverless RSS Bot).
 *
 * Replaces unreliable GitHub Actions scheduled workflows with Cloudflare's edge
 * Cron Triggers. Every scheduled tick fetches the currently deployed modules
 * from Telegram Cloud (`GET /<appId>/manage/get`) and invokes `endpoints/poll`
 * (`POST /<appId>/manage/run`).
 *
 * Required secret:
 *   TGCLOUD_TOKEN — CLI access token from @BotFather (format: "app<id>:<secret>")
 *
 * Optional secret / env vars:
 *   POLL_SECRET      — Custom bearer/query secret for manual HTTP `/poll` calls
 *   TG_CLOUD_API_URL — Override Telegram Cloud base URL (default: https://cloud.telegram.org)
 */

const DEFAULT_BASE_URL = 'https://cloud.telegram.org';
const TARGET_MODULE = 'endpoints/poll';
const TOKEN_REGEX = /^(app\d+):[A-Za-z0-9_-]+$/;

// Warm-isolate fallback cache in case GET /manage/get has a transient hiccup
let cachedSources = null;
let cachedRevision = null;

/**
 * Validate that a proxy target URL is safe:
 * - Only public HTTP/HTTPS
 * - Disallow loopback, link-local, private IPv4/IPv6, and internal hostnames
 */
export function isAllowedProxyUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      host.endsWith('.lan')
    ) {
      return false;
    }
    // Block loopback, private IPv4 ranges, link-local (169.254.x.x / cloud metadata)
    if (
      /^127\.\d+\.\d+\.\d+$/.test(host) ||
      /^10\.\d+\.\d+\.\d+$/.test(host) ||
      /^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(host) ||
      /^192\.168\.\d+\.\d+$/.test(host) ||
      /^169\.254\.\d+\.\d+$/.test(host) ||
      host === '0.0.0.0' ||
      host === '[::1]' ||
      host.startsWith('fc00:') ||
      host.startsWith('fe80:')
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate TGCLOUD_TOKEN and extract the public appId ("app<id>").
 */
export function parseTgCloudToken(rawToken) {
  const token = (rawToken || '').trim();
  if (!token) {
    throw new Error(
      'Missing TGCLOUD_TOKEN secret. Set it with: npx wrangler secret put TGCLOUD_TOKEN'
    );
  }
  const match = token.match(TOKEN_REGEX);
  if (!match) {
    throw new Error('Invalid TGCLOUD_TOKEN format. Expected "app<id>:<secret>".');
  }
  return { token, appId: match[1] };
}

/**
 * Perform an authenticated request to the Telegram Serverless Management API.
 */
async function tgCloudRequest(baseUrl, appId, token, method, path, body, fetchImpl = fetch) {
  const cleanBase = (baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const url = `${cleanBase}/${appId}/manage${path}`;

  const res = await fetchImpl(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const rawText = await res.text();
  let data;
  try {
    data = JSON.parse(rawText);
  } catch {
    const preview = (rawText || '').slice(0, 300).trim();
    throw new Error(
      `Telegram Cloud returned non-JSON response (HTTP ${res.status}) for ${method} ${path}: ${preview || '(empty body)'}`
    );
  }

  if (!data || typeof data.ok !== 'boolean') {
    throw new Error(`Unexpected response envelope from Telegram Cloud for ${method} ${path}`);
  }

  if (!data.ok) {
    const desc = data.description || data.error || `HTTP ${res.status}`;
    const err = new Error(`Telegram Cloud error (${method} ${path}): ${desc}`);
    err.status = res.status;
    err.code = data.error_code ?? data.error;
    err.parameters = data.parameters || {};
    throw err;
  }

  return data.result;
}

/**
 * Fetch the deployed module sources and execute `endpoints/poll` on Telegram Serverless.
 */
export async function triggerTelegramCloudPoll(env, fetchImpl = fetch) {
  const { token, appId } = parseTgCloudToken(env?.TGCLOUD_TOKEN);
  const baseUrl = env?.TG_CLOUD_API_URL || DEFAULT_BASE_URL;

  let sources = null;
  let revision = null;

  try {
    const state = await tgCloudRequest(baseUrl, appId, token, 'GET', '/get', undefined, fetchImpl);
    if (state?.canonical_modules && Object.keys(state.canonical_modules).length > 0) {
      sources = state.canonical_modules;
      revision = state.revision ?? null;
      cachedSources = sources;
      cachedRevision = revision;
    }
  } catch (err) {
    if (cachedSources) {
      console.warn(
        `Warning: GET /manage/get failed (${err.message}); falling back to cached revision ${cachedRevision}.`
      );
      sources = cachedSources;
      revision = cachedRevision;
    } else {
      throw err;
    }
  }

  if (!sources || !(TARGET_MODULE in sources)) {
    throw new Error(
      `Module "${TARGET_MODULE}" is not deployed on ${appId}. Run "npm run deploy" ("npx tgcloud push") first.`
    );
  }

  let lastErr = null;
  // Retry up to 2 times on transient Telegram Cloud 5xx or gateway errors
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const runData = await tgCloudRequest(
        baseUrl,
        appId,
        token,
        'POST',
        '/run',
        {
          module: TARGET_MODULE,
          sources,
          args: {},
          ctx: {},
        },
        fetchImpl
      );

      // Forward server-side console logs to Cloudflare Worker logs
      if (Array.isArray(runData?.log)) {
        for (const entry of runData.log) {
          const msg = entry.M ?? entry.m ?? '';
          const origin =
            typeof entry.o === 'string'
              ? entry.o
              : entry.o?.m
                ? `${entry.o.m}:${entry.o.l ?? ''}`
                : '';
          const prefix = origin ? `[${origin}] ` : '';
          if (entry._ === 'err') console.error(`${prefix}${msg}`);
          else if (entry._ === 'wrn') console.warn(`${prefix}${msg}`);
          else console.log(`${prefix}${msg}`);
        }
      }

      return {
        ok: true,
        appId,
        revision,
        executionTimeMs: runData?.time != null ? Math.round(runData.time * 1000) : null,
        pollResult: runData?.result ?? null,
      };
    } catch (err) {
      lastErr = err;
      if (attempt < 2) {
        console.warn(`[poll] POST /run attempt ${attempt} failed (${err.message}), retrying in 2s...`);
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }

  throw lastErr;
}

/**
 * Execute an arbitrary deployed module on Telegram Serverless with custom arguments.
 */
export async function runTelegramCloudModule(moduleName, args = {}, env, fetchImpl = fetch) {
  const { token, appId } = parseTgCloudToken(env?.TGCLOUD_TOKEN);
  const baseUrl = env?.TG_CLOUD_API_URL || DEFAULT_BASE_URL;

  let sources = cachedSources;
  if (!sources) {
    const state = await tgCloudRequest(baseUrl, appId, token, 'GET', '/get', undefined, fetchImpl);
    if (state?.canonical_modules) {
      sources = state.canonical_modules;
      cachedSources = sources;
      cachedRevision = state.revision;
    }
  }

  const runData = await tgCloudRequest(
    baseUrl,
    appId,
    token,
    'POST',
    '/run',
    {
      module: moduleName,
      sources,
      args,
      ctx: {},
    },
    fetchImpl
  );

  return runData?.result;
}

/**
 * Verify if an incoming HTTP request is authorized to trigger a manual poll.
 */
function isAuthorizedRequest(request, url, env) {
  const authHeader = request.headers.get('Authorization') || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const headerSecret = (request.headers.get('X-Poll-Secret') || '').trim();
  const querySecret = (url.searchParams.get('secret') || '').trim();
  const provided = bearer || headerSecret || querySecret;

  if (!provided) return false;

  const pollSecret = (env?.POLL_SECRET || '').trim();
  const tgToken = (env?.TGCLOUD_TOKEN || '').trim();

  if (pollSecret && provided === pollSecret) return true;
  if (tgToken && provided === tgToken) return true;

  return false;
}

export default {
  /**
   * Cloudflare Cron Trigger entrypoint.
   */
  async scheduled(controller, env, _ctx) {
    const startedAt = Date.now();
    console.log(
      `[cron] Starting scheduled poll (${controller?.cron || 'manual'}) at ${new Date(startedAt).toISOString()}`
    );

    const summary = await triggerTelegramCloudPoll(env);
    const elapsedMs = Date.now() - startedAt;

    console.log(
      `[cron] Poll finished in ${elapsedMs}ms (app=${summary.appId}, rev=${summary.revision}, feedsChecked=${summary.pollResult?.feedsChecked ?? 0})`
    );
  },

  /**
   * HTTP entrypoint for health checks and authenticated manual triggers.
   */
  async fetch(request, env, _ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/' || url.pathname === '/health') {
      return Response.json({
        ok: true,
        service: 'slrssbot-poller',
        runtime: 'cloudflare-workers',
        endpoints: {
          health: 'GET /health',
          poll: 'POST /poll (Authorization: Bearer <POLL_SECRET or TGCLOUD_TOKEN>)',
          telegraph: 'ANY /telegraph/* (High-availability Telegraph edge proxy)',
          channel: 'GET /channel/:username (Telegram public channel HTML edge proxy)',
          imageProxy: 'GET /image-proxy?url=... (Image CDN bridge for Bot API & Telegraph)',
        },
      });
    }

    if (url.pathname.startsWith('/image-proxy') || url.pathname.startsWith('/media-proxy')) {
      const targetUrl = url.searchParams.get('url');
      if (!targetUrl) return new Response('Missing url query parameter', { status: 400 });
      if (!isAllowedProxyUrl(targetUrl)) {
        return new Response('Disallowed or invalid URL for media proxy', { status: 400 });
      }

      try {
        const fetchHeaders = {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': '*/*',
        };
        const rangeHeader = request.headers.get('Range');
        if (rangeHeader) {
          fetchHeaders['Range'] = rangeHeader;
        }

        const mediaRes = await fetch(targetUrl, {
          headers: fetchHeaders,
        });
        if (!mediaRes.ok && mediaRes.status !== 206) {
          return new Response(`Failed to fetch media: HTTP ${mediaRes.status}`, { status: mediaRes.status });
        }

        const resHeaders = new Headers();
        resHeaders.set('Content-Type', mediaRes.headers.get('Content-Type') || 'application/octet-stream');
        if (mediaRes.headers.get('Content-Length')) {
          resHeaders.set('Content-Length', mediaRes.headers.get('Content-Length'));
        }
        if (mediaRes.headers.get('Content-Range')) {
          resHeaders.set('Content-Range', mediaRes.headers.get('Content-Range'));
        }
        if (mediaRes.headers.get('Accept-Ranges')) {
          resHeaders.set('Accept-Ranges', mediaRes.headers.get('Accept-Ranges'));
        }
        resHeaders.set('Cache-Control', 'public, max-age=86400');
        resHeaders.set('Access-Control-Allow-Origin', '*');

        return new Response(mediaRes.body, {
          status: mediaRes.status,
          headers: resHeaders,
        });
      } catch (err) {
        return Response.json({ ok: false, error: err.message }, { status: 502 });
      }
    }

    if (url.pathname.startsWith('/channel/')) {
      const channelUsername = url.pathname.replace(/^\/channel\//, '').replace(/^@/, '');
      const tmeUrl = `https://t.me/s/${channelUsername}`;

      try {
        const res = await fetch(tmeUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
        });
        const html = await res.text();
        return new Response(html, {
          status: res.status,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'public, max-age=60',
            'Access-Control-Allow-Origin': '*',
          },
        });
      } catch (err) {
        return Response.json({ ok: false, error: err.message }, { status: 502 });
      }
    }

    if (url.pathname.startsWith('/telegraph/')) {
      const telegraphMethod = url.pathname.replace(/^\/telegraph\//, '');
      const targetUrl = `https://api.telegra.ph/${telegraphMethod}`;

      const forwardHeaders = {
        'Content-Type': request.headers.get('Content-Type') || 'application/json',
      };

      try {
        const bodyText = request.method !== 'GET' && request.method !== 'HEAD'
          ? await request.text()
          : undefined;

        const res = await fetch(targetUrl, {
          method: request.method,
          headers: forwardHeaders,
          body: bodyText,
        });

        const resBody = await res.text();
        return new Response(resBody, {
          status: res.status,
          headers: {
            'Content-Type': res.headers.get('Content-Type') || 'application/json',
          },
        });
      } catch (err) {
        return Response.json({ ok: false, error: err.message }, { status: 502 });
      }
    }

    if (url.pathname === '/poll') {
      if (!isAuthorizedRequest(request, url, env)) {
        return Response.json(
          {
            ok: false,
            error:
              'Unauthorized. Provide Authorization: Bearer <POLL_SECRET> (or <TGCLOUD_TOKEN>).',
          },
          { status: 401 }
        );
      }

      try {
        const result = await triggerTelegramCloudPoll(env);
        return Response.json(result);
      } catch (err) {
        console.error('[http] Poll error:', err);
        return Response.json(
          {
            ok: false,
            error: err.message,
          },
          { status: 500 }
        );
      }
    }

    // Fever API routing (e.g. /fever or /api/fever)
    if (url.pathname === '/fever' || url.pathname === '/api/fever') {
      try {
        const queryArgs = Object.fromEntries(url.searchParams.entries());
        let bodyArgs = {};
        if (request.method === 'POST') {
          const ct = request.headers.get('Content-Type') || '';
          if (ct.includes('application/json')) {
            try { bodyArgs = await request.json(); } catch {}
          } else if (ct.includes('application/x-www-form-urlencoded')) {
            const formData = await request.formData();
            bodyArgs = Object.fromEntries(formData.entries());
          }
        }
        const combinedArgs = { ...queryArgs, ...bodyArgs };
        const result = await runTelegramCloudModule('endpoints/fever', combinedArgs, env);
        return new Response(JSON.stringify(result || {}), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      } catch (err) {
        return Response.json({ ok: false, error: err.message }, { status: 500 });
      }
    }

    // Google Reader API ClientLogin
    if (url.pathname === '/accounts/ClientLogin') {
      const token = `slrss_${Date.now()}`;
      return new Response(`SID=none\nLSID=none\nAuth=${token}\n`, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // Google Reader API (/reader/api/0/*)
    if (url.pathname.startsWith('/reader/api/0/')) {
      try {
        const endpoint = url.pathname.replace(/^\/reader\/api\/0\//, '');
        const queryArgs = Object.fromEntries(url.searchParams.entries());
        let bodyArgs = {};
        if (request.method === 'POST') {
          const ct = request.headers.get('Content-Type') || '';
          if (ct.includes('application/json')) {
            try { bodyArgs = await request.json(); } catch {}
          } else if (ct.includes('application/x-www-form-urlencoded')) {
            const formData = await request.formData();
            bodyArgs = Object.fromEntries(formData.entries());
          }
        }
        const authHeader = request.headers.get('Authorization') || '';
        const combinedArgs = { endpoint, ...queryArgs, ...bodyArgs, authorization: authHeader };
        const result = await runTelegramCloudModule('endpoints/greader', combinedArgs, env);
        return new Response(JSON.stringify(result || {}), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      } catch (err) {
        return Response.json({ ok: false, error: err.message }, { status: 500 });
      }
    }

    return Response.json({ ok: false, error: 'Not Found' }, { status: 404 });
  },
};

