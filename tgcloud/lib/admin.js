/**
 * lib/admin.js — Admin verification and access control.
 * Restricts administrative commands (/stats, /admin, poller runs)
 * strictly to the bot creator.
 */

import { db } from 'sdk';
import { eq } from 'sdk/db';
import { botConfig } from '../schema.js';
import { ADMIN_USER_IDS } from './config.js';

let cachedDbAdminIds = null;
let lastCacheTime = 0;
const CACHE_TTL_MS = 60000; // 1 minute in-memory cache

/**
 * Retrieve all registered admin user IDs (from config.js + botConfig table).
 * @returns {Promise<number[]>}
 */
export async function getAdminIds() {
  const now = Date.now();
  if (cachedDbAdminIds && (now - lastCacheTime < CACHE_TTL_MS)) {
    return Array.from(new Set([...ADMIN_USER_IDS, ...cachedDbAdminIds]));
  }

  let dbAdmins = [];
  try {
    const row = await db.select()
      .from(botConfig)
      .where(eq(botConfig.key, 'admin_user_ids'))
      .get();

    if (row && row.value) {
      const parsed = JSON.parse(row.value);
      if (Array.isArray(parsed)) {
        dbAdmins = parsed.map(Number).filter(Boolean);
      }
    }
    cachedDbAdminIds = dbAdmins;
    lastCacheTime = now;
  } catch (err) {
    console.warn('[admin] Failed to fetch admin_user_ids from botConfig:', err.message);
  }

  return Array.from(new Set([...ADMIN_USER_IDS, ...dbAdmins]));
}

/**
 * Check whether a Telegram user ID has admin rights.
 * @param {number|string} userId
 * @returns {Promise<boolean>}
 */
export async function isAdmin(userId) {
  if (!userId) return false;
  const numericId = Number(userId);
  if (!numericId) return false;

  const adminIds = await getAdminIds();
  return adminIds.includes(numericId);
}

/**
 * Register a new admin user ID into the database.
 * @param {number|string} userId
 * @returns {Promise<number[]>}
 */
export async function addAdmin(userId) {
  const numericId = Number(userId);
  if (!numericId) throw new Error('Invalid user ID');

  const current = await getAdminIds();
  if (!current.includes(numericId)) {
    current.push(numericId);
  }

  await db.insert(botConfig)
    .values({
      key: 'admin_user_ids',
      value: JSON.stringify(current),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: botConfig.key,
      set: {
        value: JSON.stringify(current),
        updatedAt: new Date(),
      },
    })
    .run();

  cachedDbAdminIds = current;
  lastCacheTime = Date.now();
  return current;
}

