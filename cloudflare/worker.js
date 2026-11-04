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
    throw new Error(
      `Telegram Cloud returned non-JSON response (HTTP ${res.status}) for ${method} ${path}`
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
        },
      });
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

    return Response.json({ ok: false, error: 'Not Found' }, { status: 404 });
  },
};

