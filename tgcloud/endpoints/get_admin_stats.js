/**
 * endpoints/get_admin_stats.js — Mini App endpoint to retrieve bot operations & traffic metrics.
 * Strictly restricted to bot administrators (creator).
 */

import { EndpointError } from 'sdk';
import { isAdmin } from '../lib/admin.js';
import { getAdminStats } from '../lib/metrics.js';

export default async function (input, ctx) {
  const userId = ctx?.initData?.user?.id;
  if (!userId) {
    throw new EndpointError('Authentication required', { code: 'UNAUTHORIZED' });
  }

  const userIsAdmin = await isAdmin(userId);
  if (!userIsAdmin) {
    throw new EndpointError('Access denied: Administrator privileges required', {
      code: 'FORBIDDEN',
    });
  }

  try {
    const stats = await getAdminStats();
    return {
      ok: true,
      stats,
    };
  } catch (err) {
    console.error('[get_admin_stats] endpoint error:', err);
    throw new EndpointError(`Failed to fetch admin stats: ${err.message}`, {
      code: 'INTERNAL_ERROR',
    });
  }
}

