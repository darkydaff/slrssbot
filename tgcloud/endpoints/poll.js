/**
 * Endpoint to trigger scheduled RSS & Telegram channel polling.
 * Can be triggered via Mini App or npx tgcloud run endpoints/poll '{}'.
 */

import { pollAllFeeds } from '../lib/poller.js';

export default async function (input, ctx) {
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
