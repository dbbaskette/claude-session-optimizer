import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { appendHistoryEntry, readHistory, pruneHistory } from '../src/main/history';
import { HistoryEntry } from '../src/shared/types';

let tmpHome: string;
beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'cso-hist-'));
});

function make(ts: string, ok = true): HistoryEntry {
  return { ts, triggerId: 't1', triggerLabel: 'Morning', exitCode: ok ? 0 : 1, durationMs: 100, ok, outputTail: '' };
}

describe('history', () => {
  it('readHistory returns [] when file missing', () => {
    expect(readHistory(tmpHome)).toEqual([]);
  });

  it('appendHistoryEntry creates directory and file', () => {
    appendHistoryEntry(make('2026-04-16T07:00:00.000Z'), tmpHome);
    expect(readHistory(tmpHome).length).toBe(1);
  });

  it('readHistory returns entries in file order (oldest first)', () => {
    appendHistoryEntry(make('2026-04-16T07:00:00.000Z'), tmpHome);
    appendHistoryEntry(make('2026-04-16T08:00:00.000Z'), tmpHome);
    const h = readHistory(tmpHome);
    expect(h.map(e => e.ts)).toEqual(['2026-04-16T07:00:00.000Z', '2026-04-16T08:00:00.000Z']);
  });

  it('pruneHistory keeps entries under 30 days old even if there are many', () => {
    const now = Date.parse('2026-04-16T00:00:00Z');
    for (let i = 0; i < 60; i++) {
      const ts = new Date(now - i * 1000).toISOString();
      appendHistoryEntry(make(ts), tmpHome);
    }
    pruneHistory(tmpHome, now);
    expect(readHistory(tmpHome).length).toBe(60);
  });

  it('pruneHistory drops old entries beyond the last 100', () => {
    const now = Date.parse('2026-04-16T00:00:00Z');
    for (let i = 0; i < 150; i++) {
      const ts = new Date(now - 60 * 86400_000 + i).toISOString();
      appendHistoryEntry(make(ts), tmpHome);
    }
    pruneHistory(tmpHome, now);
    expect(readHistory(tmpHome).length).toBe(100);
  });

  it('pruneHistory tolerates malformed lines', () => {
    const dir = path.join(tmpHome, 'Library/Application Support/claude-session-optimizer');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'history.jsonl'),
      '{"bad json\n' +
      JSON.stringify(make('2026-04-16T07:00:00.000Z')) + '\n');
    pruneHistory(tmpHome);
    expect(readHistory(tmpHome).length).toBe(1);
  });
});
