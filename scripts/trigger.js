#!/usr/bin/env node
// Plain Node script invoked by launchd. No TypeScript, no bundling.
// argv[2] = triggerId. HOME env var locates config/history.

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const HOME = process.env.HOME || require('os').homedir();
const APP_DIR = path.join(HOME, 'Library', 'Application Support', 'claude-session-optimizer');
const CONFIG_PATH = path.join(APP_DIR, 'config.json');
const HISTORY_PATH = path.join(APP_DIR, 'history.jsonl');

const MAX_ENTRIES = 100;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 60_000;
const timeoutMs = parseInt(process.env.CSO_TIMEOUT_MS || String(DEFAULT_TIMEOUT_MS), 10);

const triggerId = process.argv[2];
const manual = process.env.CSO_MANUAL === '1';

if (!triggerId) {
  console.error('trigger.js: missing triggerId argv');
  process.exit(2);
}

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  } catch {
    return null;
  }
}

function appendEntry(entry) {
  fs.mkdirSync(APP_DIR, { recursive: true });
  fs.appendFileSync(HISTORY_PATH, JSON.stringify(entry) + '\n');
}

function pruneHistory(now = Date.now()) {
  if (!fs.existsSync(HISTORY_PATH)) return;
  const lines = fs.readFileSync(HISTORY_PATH, 'utf-8').split('\n').filter(Boolean);
  const entries = [];
  for (const l of lines) {
    try { entries.push(JSON.parse(l)); } catch { /* skip */ }
  }
  if (entries.length === 0) return;
  const last100Start = Math.max(0, entries.length - MAX_ENTRIES);
  const kept = entries.filter((e, i) => {
    const ageOk = (now - Date.parse(e.ts)) < MAX_AGE_MS;
    return ageOk || i >= last100Start;
  });
  if (kept.length !== entries.length) {
    fs.writeFileSync(HISTORY_PATH, kept.map(e => JSON.stringify(e)).join('\n') + '\n');
  }
}

function notify(title, body) {
  try {
    const esc = s => s.replace(/"/g, '\\"');
    spawn('osascript', ['-e', `display notification "${esc(body)}" with title "${esc(title)}"`],
      { detached: true, stdio: 'ignore' }).unref();
  } catch { /* ignore */ }
}

function tail(buf, n) {
  const s = buf.toString('utf-8');
  return s.length <= n ? s : s.slice(s.length - n);
}

function recordAndExit(entry, cfg) {
  appendEntry(entry);
  pruneHistory();
  if (!entry.ok && cfg && cfg.failureNotifications) {
    notify('Claude session warm-up failed',
      `${entry.triggerLabel || entry.triggerId}: ${entry.outputTail.slice(0, 120) || 'exit ' + entry.exitCode}`);
  }
  process.exit(entry.ok ? 0 : 1);
}

// --- main ---
const cfg = readConfig();
const now = new Date();
const baseEntry = {
  ts: now.toISOString(),
  triggerId,
  triggerLabel: '',
  exitCode: null,
  durationMs: 0,
  ok: false,
  outputTail: '',
  ...(manual ? { manual: true } : {}),
};

if (!cfg) {
  recordAndExit({ ...baseEntry, outputTail: 'config.json missing or invalid' }, null);
}

const trigger = (cfg.triggers || []).find(t => t.id === triggerId);
if (!trigger && !manual) {
  recordAndExit({ ...baseEntry, outputTail: `unknown trigger: ${triggerId}` }, cfg);
}
baseEntry.triggerLabel = trigger ? trigger.label : triggerId;

if (!cfg.claudePath) {
  recordAndExit({ ...baseEntry, outputTail: 'claudePath is not configured' }, cfg);
}

const startedAt = Date.now();
const child = spawn(cfg.claudePath, ['-p', cfg.defaultPrompt || 'ok'], { stdio: ['ignore', 'pipe', 'pipe'] });

let out = Buffer.alloc(0);
let err = Buffer.alloc(0);
child.stdout.on('data', d => { out = Buffer.concat([out, d]).slice(-2048); });
child.stderr.on('data', d => { err = Buffer.concat([err, d]).slice(-2048); });

const timer = setTimeout(() => {
  child.kill('SIGKILL');
  recordAndExit({
    ...baseEntry,
    durationMs: Date.now() - startedAt,
    exitCode: null,
    ok: false,
    outputTail: `TIMEOUT (${timeoutMs}ms)\n` + tail(Buffer.concat([out, err]), 1800),
  }, cfg);
}, timeoutMs);

child.on('error', e => {
  clearTimeout(timer);
  recordAndExit({
    ...baseEntry,
    durationMs: Date.now() - startedAt,
    outputTail: `spawn error: ${e.message}`,
  }, cfg);
});

child.on('exit', code => {
  clearTimeout(timer);
  const combined = Buffer.concat([out, err]);
  recordAndExit({
    ...baseEntry,
    durationMs: Date.now() - startedAt,
    exitCode: code,
    ok: code === 0,
    outputTail: tail(combined, 2000),
  }, cfg);
});
