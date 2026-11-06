import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import worker, {
  parseTgCloudToken,
  triggerTelegramCloudPoll,
  isAllowedProxyUrl,
} from '../cloudflare/worker.js';

describe('Cloudflare Worker Poller', () => {
  it('validates and extracts appId from TGCLOUD_TOKEN', () => {
    const parsed = parseTgCloudToken('app123456:secret_token-XYZ_01');
    assert.equal(parsed.appId, 'app123456');
    assert.equal(parsed.token, 'app123456:secret_token-XYZ_01');

    assert.throws(() => parseTgCloudToken(''), /Missing TGCLOUD_TOKEN/);
    assert.throws(() => parseTgCloudToken('invalid_token'), /Invalid TGCLOUD_TOKEN/);
  });

  it('fetches deployed canonical_modules and executes endpoints/poll via Telegram Cloud API', async () => {
    const calls = [];
    const mockFetch = async (url, options) => {
      calls.push({ url, options });

      if (url.endsWith('/app999/manage/get')) {
        return new Response(
          JSON.stringify({
            ok: true,
            result: {
              revision: 7,
              canonical_modules: {
                'endpoints/poll': 'export default async function () { return { ok: true }; }',
                'lib/poller': 'export async function pollAllFeeds() { return []; }',
              },
            },
          }),
          { status: 200 }
        );
      }

      if (url.endsWith('/app999/manage/run')) {
        const body = JSON.parse(options.body);
        assert.equal(body.module, 'endpoints/poll');
        assert.ok(body.sources['endpoints/poll']);
        return new Response(
          JSON.stringify({
            ok: true,
            result: {
              time: 0.25,
              log: [{ _: 'log', t: 0.1, m: 'Polling 4 feeds' }],
              result: {
                ok: true,
                feedsChecked: 4,
                results: [],
              },
            },
          }),
          { status: 200 }
        );
      }

      throw new Error(`Unexpected URL: ${url}`);
    };

    const res = await triggerTelegramCloudPoll(
      { TGCLOUD_TOKEN: 'app999:mySecretToken123' },
      mockFetch
    );

    assert.equal(calls.length, 2);
    assert.equal(res.ok, true);
    assert.equal(res.appId, 'app999');
    assert.equal(res.revision, 7);
    assert.equal(res.executionTimeMs, 250);
    assert.equal(res.pollResult.feedsChecked, 4);
  });

  it('serves GET /health and protects POST /poll with bearer secret', async () => {
    const healthReq = new Request('https://slrssbot-poller.example.workers.dev/health');
    const healthRes = await worker.fetch(healthReq, {}, {});
    assert.equal(healthRes.status, 200);
    const healthJson = await healthRes.json();
    assert.equal(healthJson.ok, true);

    const unauthReq = new Request('https://slrssbot-poller.example.workers.dev/poll', {
      method: 'POST',
    });
    const unauthRes = await worker.fetch(
      unauthReq,
      { TGCLOUD_TOKEN: 'app999:mySecretToken123', POLL_SECRET: 'custom-secret' },
      {}
    );
    assert.equal(unauthRes.status, 401);
  });

  it('validates proxy URLs and blocks SSRF / loopback probes in media proxy', async () => {
    assert.equal(isAllowedProxyUrl('https://example.com/image.jpg'), true);
    assert.equal(isAllowedProxyUrl('http://cdn.site.org/media/audio.mp3'), true);

    // Block private/loopback/metadata URLs
    assert.equal(isAllowedProxyUrl('http://127.0.0.1/admin'), false);
    assert.equal(isAllowedProxyUrl('http://localhost:3000'), false);
    assert.equal(isAllowedProxyUrl('http://169.254.169.254/latest/meta-data'), false);
    assert.equal(isAllowedProxyUrl('http://10.0.0.1/internal'), false);
    assert.equal(isAllowedProxyUrl('http://192.168.1.1/router'), false);
    assert.equal(isAllowedProxyUrl('file:///etc/passwd'), false);
    assert.equal(isAllowedProxyUrl('javascript:alert(1)'), false);

    // HTTP endpoint test
    const blockedReq = new Request('https://slrssbot-poller.example.workers.dev/image-proxy?url=http://127.0.0.1/evil');
    const blockedRes = await worker.fetch(blockedReq, {}, {});
    assert.equal(blockedRes.status, 400);

    const missingReq = new Request('https://slrssbot-poller.example.workers.dev/image-proxy');
    const missingRes = await worker.fetch(missingReq, {}, {});
    assert.equal(missingRes.status, 400);
  });
});

