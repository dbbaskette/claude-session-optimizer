import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';

const TRIGGER_SCRIPT = path.resolve(__dirname, '../scripts/trigger.js');
const FAKE_CLAUDE = path.resolve(__dirname, 'fixtures/fake-claude.sh');

let tmpHome: string;

function writeConfig(cfg: any) {
  const dir = path.join(tmpHome, 'Library/Application Support/claude-session-optimizer');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(cfg));
}

function readHistoryRaw(): any[] {
  const p = path.join(tmpHome, 'Library/Application Support/claude-session-optimizer/history.jsonl');
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, 'utf-8').split('\n').filter(Boolean).map(l => JSON.parse(l));
}

function runTrigger(triggerId: string, env: Record<string, string> = {}) {
  return spawnSync('node', [TRIGGER_SCRIPT, triggerId], {
    env: { ...process.env, HOME: tmpHome, ...env },
    stdio: 'pipe',
  });
}

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'cso-trig-'));
});

describe('trigger.js', () => {
  it('writes success entry when claude exits 0', () => {
    writeConfig({
      version: 1,
      defaultPrompt: 'ok',
      claudePath: FAKE_CLAUDE,
      nodePath: '/usr/bin/node',
      failureNotifications: false,
      triggers: [{ id: 't1', label: 'Morning', enabled: true, hour: 7, minute: 0, weekdays: [1] }],
    });
    runTrigger('t1', { FAKE_EXIT: '0', FAKE_STDOUT: 'done' });
    const h = readHistoryRaw();
    expect(h.length).toBe(1);
    expect(h[0].ok).toBe(true);
    expect(h[0].exitCode).toBe(0);
    expect(h[0].triggerId).toBe('t1');
    expect(h[0].triggerLabel).toBe('Morning');
    expect(h[0].outputTail).toContain('done');
  });

  it('writes failure entry when claude exits non-zero', () => {
    writeConfig({
      version: 1, defaultPrompt: 'ok', claudePath: FAKE_CLAUDE, nodePath: '/usr/bin/node',
      failureNotifications: false,
      triggers: [{ id: 't1', label: 'M', enabled: true, hour: 7, minute: 0, weekdays: [1] }],
    });
    runTrigger('t1', { FAKE_EXIT: '2', FAKE_STDERR: 'boom' });
    const h = readHistoryRaw();
    expect(h[0].ok).toBe(false);
    expect(h[0].exitCode).toBe(2);
    expect(h[0].outputTail).toContain('boom');
  });

  it('writes timeout entry when claude hangs past the timeout', () => {
    writeConfig({
      version: 1, defaultPrompt: 'ok', claudePath: FAKE_CLAUDE, nodePath: '/usr/bin/node',
      failureNotifications: false,
      triggers: [{ id: 't1', label: 'M', enabled: true, hour: 7, minute: 0, weekdays: [1] }],
    });
    runTrigger('t1', { FAKE_SLEEP: '5', CSO_TIMEOUT_MS: '500' });
    const h = readHistoryRaw();
    expect(h[0].ok).toBe(false);
    expect(h[0].exitCode).toBe(null);
    expect(h[0].outputTail).toContain('TIMEOUT');
  });

  it('writes failure entry when triggerId is unknown', () => {
    writeConfig({
      version: 1, defaultPrompt: 'ok', claudePath: FAKE_CLAUDE, nodePath: '/usr/bin/node',
      failureNotifications: false,
      triggers: [],
    });
    runTrigger('missing');
    const h = readHistoryRaw();
    expect(h.length).toBe(1);
    expect(h[0].ok).toBe(false);
    expect(h[0].triggerId).toBe('missing');
    expect(h[0].outputTail).toContain('unknown trigger');
  });
});
