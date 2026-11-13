/**
 * Endpoint to trigger scheduled RSS & Telegram channel polling.
 * Can be triggered via Mini App or npx tgcloud run endpoints/poll '{}'.
 */

import { db, EndpointError } from 'sdk';
import { subscriptions } from '../schema.js';
import { pollAllFeeds } from '../lib/poller.js';
import { isAdmin } from '../lib/admin.js';

export default async function (input, ctx) {
  // Reject calls originating directly from non-admin Mini App clients
  if (ctx?.initData?.user) {
    const userIsAdmin = await isAdmin(ctx.initData.user.id);
    if (!userIsAdmin) {
      throw new EndpointError('Scheduled polling cannot be triggered from the Mini App client', {
        code: 'FORBIDDEN',
      });
    }
  }

  try {
    const summary = await pollAllFeeds();
    return {
      ok: true,
      feedsChecked: summary.length,
      results: summary,
    };
  } catch (err) {
    console.error('Error during scheduled pollAllFeeds:', err);
    return {
      ok: false,
      error: err.message,
    };
  }
}
