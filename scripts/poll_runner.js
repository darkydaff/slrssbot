#!/usr/bin/env node

/**
 * scripts/poll_runner.js — Automated Background Polling Daemon for rsstg.
 * Periodically invokes Telegram Serverless endpoints/poll to deliver updates automatically.
 *
 * Usage:
 *   node scripts/poll_runner.js [--interval=5]
 *   npm run poll:daemon
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_DIR = resolve(__dirname, '..');

const isOnce = process.argv.includes('--once');

// Default polling interval: 5 minutes (300,000 ms)
const argInterval = process.argv.find((a) => a.startsWith('--interval='));
const intervalMinutes = argInterval
  ? parseFloat(argInterval.split('=')[1])
  : parseFloat(process.env.POLL_INTERVAL || '5');

const INTERVAL_MS = Math.max(1, intervalMinutes) * 60 * 1000;

function log(msg) {
  const time = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log(`[${time}] ${msg}`);
}

let isRunning = false;
let timer = null;

async function runPoll() {
  if (isRunning) {
    log('Previous poll cycle still running, skipping this tick...');
    return;
  }

  isRunning = true;
  log(`Starting poll cycle for all active feeds...`);

  return new Promise((resolvePromise) => {
    const proc = spawn('npx', ['tgcloud', 'run', 'endpoints/poll', '{}'], {
      cwd: PROJECT_DIR,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    proc.on('close', (code) => {
      isRunning = false;

      if (code === 0) {
        // Parse results from stdout if present
        const match = stdout.match(/< ({[\s\S]*})/);
        if (match) {
          try {
            log(`Poll complete. Output:\n${match[1]}`);
          } catch {
            log(`Poll complete (exit code 0).`);
          }
        } else {
          log(`Poll complete (exit code 0).`);
        }
      } else {
        log(`Poll warning: exited with code ${code}.\n${stderr || stdout}`);
      }

      if (!isOnce) {
        log(`Next scheduled poll in ${intervalMinutes} minute(s).`);
      }
      resolvePromise();
    });

    proc.on('error', (err) => {
      isRunning = false;
      log(`Failed to execute tgcloud CLI: ${err.message}`);
      resolvePromise();
    });
  });
}

async function start() {
  if (isOnce) {
    log(`Running one-off poll cycle...`);
    await runPoll();
    process.exit(0);
  }

  log(`🚀 rsstg automated polling daemon started.`);
  log(`⏱️ Interval set to: ${intervalMinutes} minute(s).`);

  // Run initial poll immediately
  runPoll().catch((err) => log(`Initial poll error: ${err.message}`));

  // Schedule recurring timer
  timer = setInterval(() => {
    runPoll().catch((err) => log(`Poll error: ${err.message}`));
  }, INTERVAL_MS);
}


// Graceful termination
function stop(signal) {
  log(`Received ${signal}, shutting down polling daemon...`);
  if (timer) clearInterval(timer);
  process.exit(0);
}

process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));

start();
