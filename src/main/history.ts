import fs from 'fs';
import { HistoryEntry } from '../shared/types';
import { appSupportDir, historyPath } from './paths';

const MAX_ENTRIES = 100;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function parseLines(raw: string): HistoryEntry[] {
  const out: HistoryEntry[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      out.push(JSON.parse(trimmed));
    } catch {
      // skip malformed line
    }
  }
  return out;
}

export function readHistory(home?: string): HistoryEntry[] {
  const p = historyPath(home);
  if (!fs.existsSync(p)) return [];
  return parseLines(fs.readFileSync(p, 'utf-8'));
}

export function appendHistoryEntry(entry: HistoryEntry, home?: string): void {
  fs.mkdirSync(appSupportDir(home), { recursive: true });
  fs.appendFileSync(historyPath(home), JSON.stringify(entry) + '\n', 'utf-8');
}

/** Keep entries where age<30d OR among last 100. */
export function pruneHistory(home?: string, now: number = Date.now()): void {
  const p = historyPath(home);
  if (!fs.existsSync(p)) return;
  const all = parseLines(fs.readFileSync(p, 'utf-8'));
  if (all.length === 0) return;

  const last100Start = Math.max(0, all.length - MAX_ENTRIES);

  const kept = all.filter((e, i) => {
    const ageOk = (now - Date.parse(e.ts)) < MAX_AGE_MS;
    const inLast100 = i >= last100Start;
    return ageOk || inLast100;
  });

  if (kept.length === all.length) return;
  fs.writeFileSync(p, kept.map(e => JSON.stringify(e)).join('\n') + '\n', 'utf-8');
}
