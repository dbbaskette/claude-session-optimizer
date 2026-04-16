# Claude Session Optimizer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an Electron app that schedules `claude -p "<prompt>"` runs at user-specified times via `launchd`, so the user's 5-hour session window can start earlier in the day. Closing the app does not stop the schedule.

**Architecture:** Three components communicating only via files on disk — (1) Electron UI for editing the schedule + viewing history, (2) a standalone Node script (`trigger.js`) that `launchd` invokes at scheduled times and which spawns `claude -p`, (3) one `launchd` plist per trigger in `~/Library/LaunchAgents/`. Config and history live in `~/Library/Application Support/claude-session-optimizer/`.

**Tech Stack:** Electron + TypeScript + React (via `electron-vite`), Vitest for unit tests, `electron-builder` for packaging. Trigger script is plain Node (no TS compilation) so it has no runtime dependencies beyond `node`.

**Reference:** Design doc at [docs/superpowers/specs/2026-04-16-claude-session-optimizer-design.md](../specs/2026-04-16-claude-session-optimizer-design.md).

---

## File Structure

```
claude-session-optimizer/
├── package.json
├── electron.vite.config.ts
├── tsconfig.json
├── tsconfig.node.json
├── vitest.config.ts
├── .gitignore
├── index.html                         # renderer entry (loaded by electron-vite)
├── scripts/
│   └── trigger.js                     # plain Node — what launchd invokes
├── src/
│   ├── shared/
│   │   └── types.ts                   # Trigger, AppConfig, HistoryEntry
│   ├── main/
│   │   ├── index.ts                   # Electron main process
│   │   ├── ipc.ts                     # IPC handler registration
│   │   ├── paths.ts                   # app support dir, LaunchAgents dir
│   │   ├── config.ts                  # read/write config.json
│   │   ├── history.ts                 # read/append/prune history.jsonl
│   │   ├── plist.ts                   # generate launchd plist XML
│   │   ├── launchctl.ts               # bootstrap/bootout wrappers
│   │   ├── detect-paths.ts            # find node/claude on PATH
│   │   ├── scheduler.ts               # apply config diff to launchd
│   │   └── run-now.ts                 # spawn trigger.js directly
│   ├── preload/
│   │   └── index.ts                   # contextBridge → window.api
│   └── renderer/
│       ├── main.tsx                   # React entry
│       ├── App.tsx                    # tab container
│       ├── api.ts                     # typed wrappers around window.api
│       ├── global.d.ts
│       ├── styles.css
│       └── components/
│           ├── SchedulePanel.tsx
│           ├── TriggerRow.tsx
│           ├── TriggerEditor.tsx      # modal for add/edit
│           ├── HistoryPanel.tsx
│           ├── SettingsPanel.tsx
│           └── FirstLaunchModal.tsx
└── tests/
    ├── fixtures/
    │   └── fake-claude.sh             # scripted fake `claude` binary
    ├── paths.test.ts
    ├── config.test.ts
    ├── history.test.ts
    ├── plist.test.ts
    ├── launchctl.test.ts
    └── trigger.test.ts
```

**Process invocation policy:** The plan uses `child_process.spawn` (async) and `child_process.spawnSync` (sync) — never `child_process.exec`. No user input is ever passed through a shell. Shell-based PATH lookup (`/bin/bash -lc 'which node'`) uses hardcoded arguments only.

---

## Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.node.json`, `electron.vite.config.ts`, `vitest.config.ts`, `.gitignore`, `index.html`, `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/main.tsx`, `src/renderer/App.tsx`, `src/renderer/styles.css`

- [ ] **Step 1.1: Initialize git**

```bash
cd /Users/dbbaskette/Projects/claude-session-optimizer
git init
```

- [ ] **Step 1.2: Create `.gitignore`**

```gitignore
node_modules/
out/
dist/
.vite/
.DS_Store
*.log
coverage/
```

- [ ] **Step 1.3: Create `package.json`**

```json
{
  "name": "claude-session-optimizer",
  "version": "0.1.0",
  "description": "Schedule claude -p warm-ups to shift your 5-hour session window earlier.",
  "main": "out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "package": "electron-vite build && electron-builder",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@vitejs/plugin-react": "^4.2.0",
    "electron": "^29.0.0",
    "electron-builder": "^24.9.0",
    "electron-vite": "^2.0.0",
    "typescript": "^5.3.0",
    "vite": "^5.0.0",
    "vitest": "^1.2.0"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "build": {
    "appId": "com.dbbaskette.claude-session-optimizer",
    "productName": "Claude Session Optimizer",
    "files": ["out/**/*", "scripts/**/*"],
    "extraResources": [
      { "from": "scripts/trigger.js", "to": "trigger.js" }
    ],
    "mac": {
      "category": "public.app-category.developer-tools",
      "target": ["dmg"]
    }
  }
}
```

- [ ] **Step 1.4: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "jsx": "react-jsx",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "allowSyntheticDefaultImports": true,
    "types": ["node", "vitest/globals"]
  },
  "include": ["src/**/*", "tests/**/*"]
}
```

- [ ] **Step 1.5: Create `tsconfig.node.json`**

```json
{
  "compilerOptions": {
    "composite": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "target": "ES2022"
  },
  "include": ["electron.vite.config.ts", "vitest.config.ts"]
}
```

- [ ] **Step 1.6: Create `electron.vite.config.ts`**

```ts
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  main: {
    build: { outDir: 'out/main', rollupOptions: { input: resolve(__dirname, 'src/main/index.ts') } },
  },
  preload: {
    build: { outDir: 'out/preload', rollupOptions: { input: resolve(__dirname, 'src/preload/index.ts') } },
  },
  renderer: {
    root: '.',
    build: { outDir: 'out/renderer', rollupOptions: { input: resolve(__dirname, 'index.html') } },
    plugins: [react()],
  },
});
```

- [ ] **Step 1.7: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
```

- [ ] **Step 1.8: Create `index.html`**

```html
<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>Claude Session Optimizer</title>
    <link rel="stylesheet" href="/src/renderer/styles.css" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/renderer/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 1.9: Create minimal `src/main/index.ts`**

```ts
import { app, BrowserWindow } from 'electron';
import path from 'path';

function createWindow() {
  const win = new BrowserWindow({
    width: 720,
    height: 560,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
    },
  });
  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

- [ ] **Step 1.10: Create minimal `src/preload/index.ts`**

```ts
// Will be populated in Task 8.
export {};
```

- [ ] **Step 1.11: Create minimal `src/renderer/main.tsx`**

```tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

createRoot(document.getElementById('root')!).render(<App />);
```

- [ ] **Step 1.12: Create minimal `src/renderer/App.tsx`**

```tsx
import React from 'react';

export default function App() {
  return <div style={{ padding: 24 }}>Claude Session Optimizer — scaffold OK</div>;
}
```

- [ ] **Step 1.13: Create empty `src/renderer/styles.css`**

```css
body { font-family: -apple-system, system-ui, sans-serif; margin: 0; }
```

- [ ] **Step 1.14: Install dependencies and verify dev works**

```bash
npm install
npm run dev
```

Expected: Electron window opens showing "Claude Session Optimizer — scaffold OK". Close the app and continue.

- [ ] **Step 1.15: Verify typecheck passes**

```bash
npm run typecheck
```

Expected: exit 0, no output.

- [ ] **Step 1.16: Commit**

```bash
git add .
git commit -m "chore: scaffold electron-vite + react + typescript + vitest"
```

---

## Task 2: Shared types and paths module

**Files:**
- Create: `src/shared/types.ts`
- Create: `src/main/paths.ts`
- Test: `tests/paths.test.ts`

- [ ] **Step 2.1: Create `src/shared/types.ts`**

```ts
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday

export interface Trigger {
  id: string;              // e.g. "t_abc123" — filename-safe
  label: string;
  enabled: boolean;
  hour: number;            // 0–23
  minute: number;          // 0–59
  weekdays: Weekday[];     // 1–5 for weekdays, 0 and 6 for weekend
}

export interface AppConfig {
  version: 1;
  defaultPrompt: string;
  claudePath: string;              // absolute path to `claude` binary
  nodePath: string;                // absolute path to `node` binary (used in plist)
  failureNotifications: boolean;
  triggers: Trigger[];
}

export interface HistoryEntry {
  ts: string;                      // ISO-8601
  triggerId: string;
  triggerLabel: string;
  exitCode: number | null;         // null => timeout
  durationMs: number;
  ok: boolean;
  outputTail: string;
  manual?: boolean;                // true if invoked via Run Now
}

export const DEFAULT_CONFIG: AppConfig = {
  version: 1,
  defaultPrompt: 'ok',
  claudePath: '',
  nodePath: '',
  failureNotifications: true,
  triggers: [],
};
```

- [ ] **Step 2.2: Write failing test for `paths.ts`**

Create `tests/paths.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import * as paths from '../src/main/paths';

describe('paths', () => {
  it('appSupportDir is under HOME/Library/Application Support', () => {
    const dir = paths.appSupportDir('/Users/someone');
    expect(dir).toBe('/Users/someone/Library/Application Support/claude-session-optimizer');
  });

  it('configPath is config.json inside app support dir', () => {
    expect(paths.configPath('/Users/x')).toBe(
      '/Users/x/Library/Application Support/claude-session-optimizer/config.json'
    );
  });

  it('historyPath is history.jsonl inside app support dir', () => {
    expect(paths.historyPath('/Users/x')).toBe(
      '/Users/x/Library/Application Support/claude-session-optimizer/history.jsonl'
    );
  });

  it('launchAgentsDir is HOME/Library/LaunchAgents', () => {
    expect(paths.launchAgentsDir('/Users/x')).toBe('/Users/x/Library/LaunchAgents');
  });

  it('plistPath uses com.dbbaskette prefix and trigger id', () => {
    expect(paths.plistPath('/Users/x', 't_abc')).toBe(
      '/Users/x/Library/LaunchAgents/com.dbbaskette.claude-session-optimizer.t_abc.plist'
    );
  });

  it('plistLabel returns the bundle-id-style label', () => {
    expect(paths.plistLabel('t_abc')).toBe('com.dbbaskette.claude-session-optimizer.t_abc');
  });
});
```

- [ ] **Step 2.3: Run test, confirm failure**

```bash
npm test -- tests/paths.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 2.4: Implement `src/main/paths.ts`**

```ts
import path from 'path';
import os from 'os';

export const APP_DIR_NAME = 'claude-session-optimizer';
export const BUNDLE_ID_PREFIX = 'com.dbbaskette.claude-session-optimizer';

export function appSupportDir(home = os.homedir()): string {
  return path.join(home, 'Library', 'Application Support', APP_DIR_NAME);
}

export function configPath(home = os.homedir()): string {
  return path.join(appSupportDir(home), 'config.json');
}

export function historyPath(home = os.homedir()): string {
  return path.join(appSupportDir(home), 'history.jsonl');
}

export function launchAgentsDir(home = os.homedir()): string {
  return path.join(home, 'Library', 'LaunchAgents');
}

export function plistLabel(triggerId: string): string {
  return `${BUNDLE_ID_PREFIX}.${triggerId}`;
}

export function plistPath(home: string, triggerId: string): string {
  return path.join(launchAgentsDir(home), `${plistLabel(triggerId)}.plist`);
}
```

- [ ] **Step 2.5: Re-run tests, verify pass**

```bash
npm test -- tests/paths.test.ts
```

Expected: all 6 tests pass.

- [ ] **Step 2.6: Commit**

```bash
git add src/shared/types.ts src/main/paths.ts tests/paths.test.ts
git commit -m "feat: add shared types and path helpers"
```

---

## Task 3: Config read/write

**Files:**
- Create: `src/main/config.ts`
- Test: `tests/config.test.ts`

- [ ] **Step 3.1: Write failing tests for config module**

Create `tests/config.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { readConfig, writeConfig } from '../src/main/config';
import { DEFAULT_CONFIG } from '../src/shared/types';

let tmpHome: string;

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'cso-config-'));
});

describe('config', () => {
  it('readConfig returns DEFAULT_CONFIG when file does not exist', () => {
    expect(readConfig(tmpHome)).toEqual(DEFAULT_CONFIG);
  });

  it('writeConfig creates directory and file; readConfig round-trips', () => {
    const cfg = { ...DEFAULT_CONFIG, defaultPrompt: 'hello', claudePath: '/usr/bin/claude' };
    writeConfig(cfg, tmpHome);
    expect(readConfig(tmpHome)).toEqual(cfg);
  });

  it('readConfig returns DEFAULT_CONFIG when file contents are invalid JSON', () => {
    const dir = path.join(tmpHome, 'Library/Application Support/claude-session-optimizer');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'config.json'), '{ not json');
    expect(readConfig(tmpHome)).toEqual(DEFAULT_CONFIG);
  });

  it('readConfig fills missing fields with defaults (forward-compat)', () => {
    const dir = path.join(tmpHome, 'Library/Application Support/claude-session-optimizer');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ version: 1, defaultPrompt: 'x' }));
    const cfg = readConfig(tmpHome);
    expect(cfg.defaultPrompt).toBe('x');
    expect(cfg.triggers).toEqual([]);
    expect(cfg.failureNotifications).toBe(true);
  });
});
```

- [ ] **Step 3.2: Run, confirm failure**

```bash
npm test -- tests/config.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3.3: Implement `src/main/config.ts`**

```ts
import fs from 'fs';
import { AppConfig, DEFAULT_CONFIG } from '../shared/types';
import { appSupportDir, configPath } from './paths';

export function readConfig(home?: string): AppConfig {
  const p = configPath(home);
  if (!fs.existsSync(p)) return { ...DEFAULT_CONFIG };
  try {
    const raw = fs.readFileSync(p, 'utf-8');
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function writeConfig(cfg: AppConfig, home?: string): void {
  const dir = appSupportDir(home);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(configPath(home), JSON.stringify(cfg, null, 2), 'utf-8');
}
```

- [ ] **Step 3.4: Run tests, verify pass**

```bash
npm test -- tests/config.test.ts
```

Expected: all 4 tests pass.

- [ ] **Step 3.5: Commit**

```bash
git add src/main/config.ts tests/config.test.ts
git commit -m "feat: config read/write with defaults and corruption tolerance"
```

---

## Task 4: History append + prune

**Files:**
- Create: `src/main/history.ts`
- Test: `tests/history.test.ts`

- [ ] **Step 4.1: Write failing tests**

Create `tests/history.test.ts`:

```ts
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
```

- [ ] **Step 4.2: Run, confirm failure**

```bash
npm test -- tests/history.test.ts
```

- [ ] **Step 4.3: Implement `src/main/history.ts`**

```ts
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
```

- [ ] **Step 4.4: Run tests, verify pass**

```bash
npm test -- tests/history.test.ts
```

Expected: all 6 tests pass.

- [ ] **Step 4.5: Commit**

```bash
git add src/main/history.ts tests/history.test.ts
git commit -m "feat: history append + 30d-or-last-100 pruning"
```

---

## Task 5: Plist generation

**Files:**
- Create: `src/main/plist.ts`
- Test: `tests/plist.test.ts`

- [ ] **Step 5.1: Write failing tests**

Create `tests/plist.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { generatePlist } from '../src/main/plist';
import { Trigger } from '../src/shared/types';

const base: Trigger = {
  id: 't_abc',
  label: 'Morning',
  enabled: true,
  hour: 7,
  minute: 30,
  weekdays: [1, 2, 3, 4, 5],
};

describe('plist', () => {
  it('wraps label with bundle id prefix', () => {
    const xml = generatePlist(base, '/usr/local/bin/node', '/app/trigger.js');
    expect(xml).toContain('<string>com.dbbaskette.claude-session-optimizer.t_abc</string>');
  });

  it('includes node binary + script + trigger id as ProgramArguments', () => {
    const xml = generatePlist(base, '/usr/local/bin/node', '/app/trigger.js');
    expect(xml).toContain('<key>ProgramArguments</key>');
    expect(xml).toMatch(/<string>\/usr\/local\/bin\/node<\/string>\s*<string>\/app\/trigger\.js<\/string>\s*<string>t_abc<\/string>/s);
  });

  it('emits one StartCalendarInterval dict per weekday', () => {
    const xml = generatePlist(base, '/u/node', '/a/t.js');
    const matches = xml.match(/<key>Weekday<\/key>/g) ?? [];
    expect(matches.length).toBe(5);
  });

  it('emits hour and minute correctly', () => {
    const xml = generatePlist(base, '/u/node', '/a/t.js');
    expect(xml).toContain('<key>Hour</key>\n      <integer>7</integer>');
    expect(xml).toContain('<key>Minute</key>\n      <integer>30</integer>');
  });

  it('sets RunAtLoad to false and includes stdout/stderr log paths', () => {
    const xml = generatePlist(base, '/u/node', '/a/t.js');
    expect(xml).toContain('<key>RunAtLoad</key>\n  <false/>');
    expect(xml).toMatch(/<key>StandardOutPath<\/key>\s*<string>\/tmp\/com\.dbbaskette\.claude-session-optimizer\.t_abc\.log<\/string>/);
    expect(xml).toMatch(/<key>StandardErrorPath<\/key>\s*<string>\/tmp\/com\.dbbaskette\.claude-session-optimizer\.t_abc\.log<\/string>/);
  });

  it('produces valid XML declaration and DOCTYPE', () => {
    const xml = generatePlist(base, '/u/node', '/a/t.js');
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<!DOCTYPE plist');
  });
});
```

- [ ] **Step 5.2: Run, confirm failure**

```bash
npm test -- tests/plist.test.ts
```

- [ ] **Step 5.3: Implement `src/main/plist.ts`**

```ts
import { Trigger } from '../shared/types';
import { plistLabel } from './paths';

function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function generatePlist(trigger: Trigger, nodePath: string, triggerScriptPath: string): string {
  const label = plistLabel(trigger.id);
  const intervals = trigger.weekdays.map(wd => `    <dict>
      <key>Hour</key>
      <integer>${trigger.hour}</integer>
      <key>Minute</key>
      <integer>${trigger.minute}</integer>
      <key>Weekday</key>
      <integer>${wd}</integer>
    </dict>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${xmlEscape(label)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xmlEscape(nodePath)}</string>
    <string>${xmlEscape(triggerScriptPath)}</string>
    <string>${xmlEscape(trigger.id)}</string>
  </array>
  <key>StartCalendarInterval</key>
  <array>
${intervals}
  </array>
  <key>RunAtLoad</key>
  <false/>
  <key>StandardOutPath</key>
  <string>/tmp/${xmlEscape(label)}.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/${xmlEscape(label)}.log</string>
</dict>
</plist>
`;
}
```

- [ ] **Step 5.4: Run tests, verify pass**

```bash
npm test -- tests/plist.test.ts
```

- [ ] **Step 5.5: Commit**

```bash
git add src/main/plist.ts tests/plist.test.ts
git commit -m "feat: launchd plist generation"
```

---

## Task 6: launchctl wrappers

Uses `child_process.spawnSync` (argv-based, no shell) — never `exec`.

**Files:**
- Create: `src/main/launchctl.ts`
- Test: `tests/launchctl.test.ts`

- [ ] **Step 6.1: Write failing tests**

Create `tests/launchctl.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const spawnSyncMock = vi.fn();
vi.mock('child_process', () => ({ spawnSync: spawnSyncMock }));

import { bootstrapPlist, bootoutPlist, domainTarget } from '../src/main/launchctl';

beforeEach(() => {
  spawnSyncMock.mockReset();
  spawnSyncMock.mockReturnValue({ status: 0, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) });
});

describe('launchctl', () => {
  it('domainTarget is gui/<uid>', () => {
    expect(domainTarget(501)).toBe('gui/501');
  });

  it('bootstrapPlist invokes launchctl bootstrap <domain> <path>', () => {
    bootstrapPlist('/path/to.plist', 501);
    expect(spawnSyncMock).toHaveBeenCalledWith(
      'launchctl',
      ['bootstrap', 'gui/501', '/path/to.plist'],
      expect.anything()
    );
  });

  it('bootoutPlist invokes launchctl bootout <domain> <path>', () => {
    bootoutPlist('/path/to.plist', 501);
    expect(spawnSyncMock).toHaveBeenCalledWith(
      'launchctl',
      ['bootout', 'gui/501', '/path/to.plist'],
      expect.anything()
    );
  });

  it('bootoutPlist swallows "Could not find" errors (idempotent)', () => {
    spawnSyncMock.mockReturnValueOnce({ status: 3, stdout: Buffer.alloc(0), stderr: Buffer.from('Could not find service') });
    expect(() => bootoutPlist('/x.plist', 501)).not.toThrow();
  });

  it('bootstrapPlist throws on non-zero status', () => {
    spawnSyncMock.mockReturnValueOnce({ status: 5, stdout: Buffer.alloc(0), stderr: Buffer.from('permission denied') });
    expect(() => bootstrapPlist('/x.plist', 501)).toThrow(/permission/);
  });
});
```

- [ ] **Step 6.2: Run, confirm failure**

```bash
npm test -- tests/launchctl.test.ts
```

- [ ] **Step 6.3: Implement `src/main/launchctl.ts`**

```ts
import { spawnSync } from 'child_process';

export function domainTarget(uid: number = process.getuid ? process.getuid()! : 501): string {
  return `gui/${uid}`;
}

function runLaunchctl(args: string[]): { status: number; stderr: string } {
  const r = spawnSync('launchctl', args, { stdio: 'pipe' });
  return { status: r.status ?? 0, stderr: r.stderr?.toString() ?? '' };
}

export function bootstrapPlist(plistPath: string, uid?: number): void {
  const r = runLaunchctl(['bootstrap', domainTarget(uid), plistPath]);
  if (r.status !== 0) throw new Error(`launchctl bootstrap failed: ${r.stderr.trim()}`);
}

export function bootoutPlist(plistPath: string, uid?: number): void {
  const r = runLaunchctl(['bootout', domainTarget(uid), plistPath]);
  if (r.status === 0) return;
  if (/could not find/i.test(r.stderr) || /no such process/i.test(r.stderr)) return; // idempotent
  throw new Error(`launchctl bootout failed: ${r.stderr.trim()}`);
}
```

- [ ] **Step 6.4: Run tests, verify pass**

```bash
npm test -- tests/launchctl.test.ts
```

- [ ] **Step 6.5: Commit**

```bash
git add src/main/launchctl.ts tests/launchctl.test.ts
git commit -m "feat: launchctl bootstrap/bootout wrappers with idempotent bootout"
```

---

## Task 7: Trigger runner script

This is a plain Node script (no TypeScript) that `launchd` invokes.

**Files:**
- Create: `scripts/trigger.js`
- Create: `tests/fixtures/fake-claude.sh`
- Test: `tests/trigger.test.ts`

- [ ] **Step 7.1: Create fake claude binary**

Create `tests/fixtures/fake-claude.sh`:

```bash
#!/bin/bash
# Behavior controlled by env vars:
#   FAKE_EXIT - exit code (default 0)
#   FAKE_STDOUT - string to write to stdout
#   FAKE_STDERR - string to write to stderr
#   FAKE_SLEEP - seconds to sleep before exit
[ -n "$FAKE_STDOUT" ] && echo "$FAKE_STDOUT"
[ -n "$FAKE_STDERR" ] && echo "$FAKE_STDERR" 1>&2
[ -n "$FAKE_SLEEP" ] && sleep "$FAKE_SLEEP"
exit "${FAKE_EXIT:-0}"
```

Make it executable:

```bash
chmod +x tests/fixtures/fake-claude.sh
```

- [ ] **Step 7.2: Write failing tests**

Create `tests/trigger.test.ts`:

```ts
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
```

- [ ] **Step 7.3: Run tests, confirm failure**

```bash
npm test -- tests/trigger.test.ts
```

Expected: FAIL — script doesn't exist.

- [ ] **Step 7.4: Implement `scripts/trigger.js`**

```js
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
```

- [ ] **Step 7.5: Run tests, verify pass**

```bash
npm test -- tests/trigger.test.ts
```

Expected: all 4 tests pass.

- [ ] **Step 7.6: Commit**

```bash
git add scripts/trigger.js tests/fixtures/fake-claude.sh tests/trigger.test.ts
git commit -m "feat: trigger runner script with timeout, history, notifications"
```

---

## Task 8: Path detection, scheduler orchestration, IPC bridge

Ties config → plist → launchctl together and exposes IPC to the renderer.

**Files:**
- Create: `src/main/detect-paths.ts`
- Create: `src/main/run-now.ts`
- Create: `src/main/scheduler.ts`
- Create: `src/main/ipc.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 8.1: Create `src/main/detect-paths.ts`**

Uses `spawnSync` with fixed argv — no user input enters the command line.

```ts
import { spawnSync } from 'child_process';

/** Resolve a command's absolute path using a login shell (so nvm/homebrew setups are picked up). */
function whichInLoginShell(cmd: string): string {
  // cmd is hardcoded in our callers — but sanity-check it anyway.
  if (!/^[a-z][a-z0-9_-]*$/i.test(cmd)) return '';
  const r = spawnSync('/bin/bash', ['-lc', `command -v ${cmd}`], { stdio: 'pipe', encoding: 'utf-8' });
  if (r.status !== 0) return '';
  return (r.stdout ?? '').trim();
}

export function detectNodePath(): string { return whichInLoginShell('node'); }
export function detectClaudePath(): string { return whichInLoginShell('claude'); }
```

- [ ] **Step 8.2: Create `src/main/run-now.ts`**

```ts
import { spawn } from 'child_process';
import { app } from 'electron';
import path from 'path';

/** Absolute path to trigger.js in both dev and packaged app. */
export function triggerScriptPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'trigger.js');
  }
  return path.join(app.getAppPath(), 'scripts', 'trigger.js');
}

export function runTriggerNow(triggerId: string, nodePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(nodePath, [triggerScriptPath(), triggerId], {
      env: { ...process.env, CSO_MANUAL: '1' },
      stdio: 'ignore',
      detached: true,
    });
    child.on('error', reject);
    child.unref();
    resolve();
  });
}
```

- [ ] **Step 8.3: Create `src/main/scheduler.ts`**

```ts
import fs from 'fs';
import path from 'path';
import { AppConfig, Trigger } from '../shared/types';
import { launchAgentsDir, plistPath, BUNDLE_ID_PREFIX } from './paths';
import { generatePlist } from './plist';
import { bootstrapPlist, bootoutPlist } from './launchctl';
import { triggerScriptPath } from './run-now';

export function listOurPlists(home?: string): string[] {
  const dir = launchAgentsDir(home);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.startsWith(BUNDLE_ID_PREFIX) && f.endsWith('.plist'))
    .map(f => path.join(dir, f));
}

function triggerIdFromPlistPath(p: string): string {
  const base = path.basename(p, '.plist');
  return base.substring(BUNDLE_ID_PREFIX.length + 1); // strip prefix + '.'
}

export function applyConfig(cfg: AppConfig, home?: string): void {
  const activeTriggers: Trigger[] = cfg.triggers.filter(t => t.enabled);
  const activeIds = new Set(activeTriggers.map(t => t.id));

  // Remove plists no longer in the active set.
  for (const existing of listOurPlists(home)) {
    const tid = triggerIdFromPlistPath(existing);
    if (!activeIds.has(tid)) {
      bootoutPlist(existing);
      try { fs.unlinkSync(existing); } catch { /* already gone */ }
    }
  }

  // Re-write and load every active trigger (idempotent — content changes picked up).
  fs.mkdirSync(launchAgentsDir(home), { recursive: true });
  for (const t of activeTriggers) {
    const p = plistPath(home ?? require('os').homedir(), t.id);
    bootoutPlist(p);
    fs.writeFileSync(p, generatePlist(t, cfg.nodePath, triggerScriptPath()), 'utf-8');
    bootstrapPlist(p);
  }
}

export function removeAllSchedules(home?: string): void {
  for (const p of listOurPlists(home)) {
    bootoutPlist(p);
    try { fs.unlinkSync(p); } catch { /* ignore */ }
  }
}
```

- [ ] **Step 8.4: Create `src/main/ipc.ts`**

```ts
import { ipcMain } from 'electron';
import { readConfig, writeConfig } from './config';
import { readHistory } from './history';
import { applyConfig, removeAllSchedules } from './scheduler';
import { runTriggerNow } from './run-now';
import { detectNodePath, detectClaudePath } from './detect-paths';
import { AppConfig } from '../shared/types';

export function registerIpc(): void {
  ipcMain.handle('config:read', () => readConfig());

  ipcMain.handle('config:save', (_e, cfg: AppConfig) => {
    writeConfig(cfg);
    applyConfig(cfg);
    return { ok: true };
  });

  ipcMain.handle('history:read', () => readHistory());

  ipcMain.handle('run-now', async (_e, triggerId: string) => {
    const cfg = readConfig();
    if (!cfg.nodePath) throw new Error('nodePath not configured');
    await runTriggerNow(triggerId, cfg.nodePath);
    return { ok: true };
  });

  ipcMain.handle('detect-paths', () => ({
    nodePath: detectNodePath(),
    claudePath: detectClaudePath(),
  }));

  ipcMain.handle('remove-all-schedules', () => {
    removeAllSchedules();
    return { ok: true };
  });
}
```

- [ ] **Step 8.5: Replace `src/preload/index.ts`**

```ts
import { contextBridge, ipcRenderer } from 'electron';
import type { AppConfig, HistoryEntry } from '../shared/types';

const api = {
  readConfig: (): Promise<AppConfig> => ipcRenderer.invoke('config:read'),
  saveConfig: (cfg: AppConfig): Promise<{ ok: true }> => ipcRenderer.invoke('config:save', cfg),
  readHistory: (): Promise<HistoryEntry[]> => ipcRenderer.invoke('history:read'),
  runNow: (triggerId: string): Promise<{ ok: true }> => ipcRenderer.invoke('run-now', triggerId),
  detectPaths: (): Promise<{ nodePath: string; claudePath: string }> => ipcRenderer.invoke('detect-paths'),
  removeAllSchedules: (): Promise<{ ok: true }> => ipcRenderer.invoke('remove-all-schedules'),
};

contextBridge.exposeInMainWorld('api', api);

export type Api = typeof api;
```

- [ ] **Step 8.6: Update `src/main/index.ts` to register IPC**

Replace the file contents with:

```ts
import { app, BrowserWindow } from 'electron';
import path from 'path';
import { registerIpc } from './ipc';

function createWindow() {
  const win = new BrowserWindow({
    width: 820,
    height: 640,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
    },
  });
  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
```

- [ ] **Step 8.7: Verify typecheck and dev launch**

```bash
npm run typecheck
npm run dev
```

Expected: app launches, still showing scaffold text (UI hasn't been built yet). Close.

- [ ] **Step 8.8: Commit**

```bash
git add src/main/detect-paths.ts src/main/run-now.ts src/main/scheduler.ts src/main/ipc.ts src/main/index.ts src/preload/index.ts
git commit -m "feat: wire scheduler + IPC bridge"
```

---

## Task 9: Renderer — API module, types, shell layout

**Files:**
- Create: `src/renderer/api.ts`
- Create: `src/renderer/global.d.ts`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/styles.css`

- [ ] **Step 9.1: Create `src/renderer/global.d.ts`**

```ts
import type { Api } from '../preload/index';

declare global {
  interface Window {
    api: Api;
  }
}
```

- [ ] **Step 9.2: Create `src/renderer/api.ts`**

```ts
import type { AppConfig, HistoryEntry, Trigger } from '../shared/types';

export const api = {
  readConfig: () => window.api.readConfig(),
  saveConfig: (cfg: AppConfig) => window.api.saveConfig(cfg),
  readHistory: () => window.api.readHistory(),
  runNow: (triggerId: string) => window.api.runNow(triggerId),
  detectPaths: () => window.api.detectPaths(),
  removeAllSchedules: () => window.api.removeAllSchedules(),
};

export function newTriggerId(): string {
  return 't_' + Math.random().toString(36).slice(2, 10);
}

export function defaultTrigger(): Trigger {
  return {
    id: newTriggerId(),
    label: 'New trigger',
    enabled: true,
    hour: 7,
    minute: 0,
    weekdays: [1, 2, 3, 4, 5],
  };
}

export type { AppConfig, HistoryEntry, Trigger };
```

- [ ] **Step 9.3: Replace `src/renderer/styles.css`**

```css
body { font-family: -apple-system, system-ui, sans-serif; margin: 0; background: #f6f6f7; color: #222; }
.container { padding: 16px 24px; }
.tabs { display: flex; gap: 8px; border-bottom: 1px solid #ddd; padding: 12px 24px 0; background: #fff; }
.tab { padding: 8px 14px; cursor: pointer; border-bottom: 2px solid transparent; }
.tab.active { border-bottom-color: #0a84ff; font-weight: 600; }
.row { display: flex; align-items: center; gap: 12px; padding: 10px; border-bottom: 1px solid #eee; background: #fff; }
.row:first-child { border-top: 1px solid #eee; }
.btn { padding: 6px 12px; border-radius: 6px; border: 1px solid #ccc; background: #fafafa; cursor: pointer; }
.btn.primary { background: #0a84ff; color: #fff; border-color: #0a84ff; }
.btn.danger { background: #ffecec; color: #b00020; border-color: #f3c2c2; }
.toast { position: fixed; bottom: 20px; right: 20px; background: #222; color: #fff; padding: 10px 16px; border-radius: 6px; }
.field { display: flex; flex-direction: column; margin-bottom: 12px; }
.field label { font-size: 12px; color: #555; margin-bottom: 4px; }
.field input, .field textarea { padding: 6px 8px; border: 1px solid #ccc; border-radius: 4px; font: inherit; }
.weekday-chip { display: inline-block; padding: 4px 8px; margin: 2px; border-radius: 12px; border: 1px solid #ccc; cursor: pointer; font-size: 12px; }
.weekday-chip.on { background: #0a84ff; color: #fff; border-color: #0a84ff; }
table.history { width: 100%; border-collapse: collapse; background: #fff; }
table.history th, table.history td { padding: 6px 10px; border-bottom: 1px solid #eee; text-align: left; font-size: 13px; }
.status-ok { color: #1b8c3a; }
.status-fail { color: #b00020; }
.modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; }
.modal { background: #fff; padding: 20px; border-radius: 8px; min-width: 400px; }
```

- [ ] **Step 9.4: Replace `src/renderer/App.tsx`**

```tsx
import React, { useEffect, useState } from 'react';
import { api, type AppConfig } from './api';
import SchedulePanel from './components/SchedulePanel';
import HistoryPanel from './components/HistoryPanel';
import SettingsPanel from './components/SettingsPanel';
import FirstLaunchModal from './components/FirstLaunchModal';

type Tab = 'schedule' | 'history' | 'settings';

export default function App() {
  const [cfg, setCfg] = useState<AppConfig | null>(null);
  const [tab, setTab] = useState<Tab>('schedule');
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => { api.readConfig().then(setCfg); }, []);

  if (!cfg) return <div className="container">Loading…</div>;

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const needsFirstLaunch = !cfg.claudePath || !cfg.nodePath;

  return (
    <>
      <div className="tabs">
        <div className={`tab ${tab === 'schedule' ? 'active' : ''}`} onClick={() => setTab('schedule')}>Schedule</div>
        <div className={`tab ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>History</div>
        <div className={`tab ${tab === 'settings' ? 'active' : ''}`} onClick={() => setTab('settings')}>Settings</div>
      </div>
      <div className="container">
        {tab === 'schedule' && <SchedulePanel cfg={cfg} setCfg={setCfg} showToast={showToast} />}
        {tab === 'history' && <HistoryPanel />}
        {tab === 'settings' && <SettingsPanel cfg={cfg} setCfg={setCfg} showToast={showToast} />}
      </div>
      {toast && <div className="toast">{toast}</div>}
      {needsFirstLaunch && <FirstLaunchModal cfg={cfg} setCfg={setCfg} />}
    </>
  );
}
```

- [ ] **Step 9.5: Create placeholder component files so TypeScript compiles**

Create `src/renderer/components/SchedulePanel.tsx`:

```tsx
import React from 'react';
import type { AppConfig } from '../api';

interface Props {
  cfg: AppConfig;
  setCfg: (c: AppConfig) => void;
  showToast: (msg: string) => void;
}

export default function SchedulePanel(_: Props) { return <div>Schedule (stub)</div>; }
```

Create `src/renderer/components/HistoryPanel.tsx`:

```tsx
import React from 'react';
export default function HistoryPanel() { return <div>History (stub)</div>; }
```

Create `src/renderer/components/SettingsPanel.tsx`:

```tsx
import React from 'react';
import type { AppConfig } from '../api';

interface Props {
  cfg: AppConfig;
  setCfg: (c: AppConfig) => void;
  showToast: (msg: string) => void;
}

export default function SettingsPanel(_: Props) { return <div>Settings (stub)</div>; }
```

Create `src/renderer/components/FirstLaunchModal.tsx`:

```tsx
import React from 'react';
import type { AppConfig } from '../api';

interface Props {
  cfg: AppConfig;
  setCfg: (c: AppConfig) => void;
}

export default function FirstLaunchModal(_: Props) { return null; }
```

- [ ] **Step 9.6: Verify typecheck and dev**

```bash
npm run typecheck
npm run dev
```

Expected: tabs visible, no crash, stubs render.

- [ ] **Step 9.7: Commit**

```bash
git add src/renderer/
git commit -m "feat: renderer shell — tabs, API bridge, component stubs"
```

---

## Task 10: Schedule panel (list + add/edit + save)

**Files:**
- Modify: `src/renderer/components/SchedulePanel.tsx`
- Create: `src/renderer/components/TriggerRow.tsx`
- Create: `src/renderer/components/TriggerEditor.tsx`

- [ ] **Step 10.1: Create `src/renderer/components/TriggerRow.tsx`**

```tsx
import React from 'react';
import type { Trigger } from '../api';
import { api } from '../api';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface Props {
  trigger: Trigger;
  onChange: (t: Trigger) => void;
  onDelete: () => void;
  onEdit: () => void;
  showToast: (msg: string) => void;
}

export default function TriggerRow({ trigger, onChange, onDelete, onEdit, showToast }: Props) {
  const weekdayStr = trigger.weekdays.length === 7 ? 'daily'
    : trigger.weekdays.length === 0 ? 'never'
    : trigger.weekdays.map(w => DAYS[w]).join(' ');

  const hhmm = `${String(trigger.hour).padStart(2, '0')}:${String(trigger.minute).padStart(2, '0')}`;

  const handleRunNow = async () => {
    try {
      await api.runNow(trigger.id);
      showToast(`"${trigger.label}" triggered — check History in a few seconds.`);
    } catch (e: any) {
      showToast(`Run failed: ${e.message}`);
    }
  };

  return (
    <div className="row">
      <input type="checkbox" checked={trigger.enabled} onChange={e => onChange({ ...trigger, enabled: e.target.checked })} />
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600 }}>{trigger.label}</div>
        <div style={{ fontSize: 12, color: '#666' }}>{hhmm} · {weekdayStr}</div>
      </div>
      <button className="btn" onClick={handleRunNow}>Run Now</button>
      <button className="btn" onClick={onEdit}>Edit</button>
      <button className="btn danger" onClick={onDelete}>Delete</button>
    </div>
  );
}
```

- [ ] **Step 10.2: Create `src/renderer/components/TriggerEditor.tsx`**

```tsx
import React, { useState } from 'react';
import type { Trigger, Weekday } from '../../shared/types';

const DAYS: { label: string; value: Weekday }[] = [
  { label: 'Sun', value: 0 }, { label: 'Mon', value: 1 }, { label: 'Tue', value: 2 },
  { label: 'Wed', value: 3 }, { label: 'Thu', value: 4 }, { label: 'Fri', value: 5 },
  { label: 'Sat', value: 6 },
];

interface Props {
  trigger: Trigger;
  onSave: (t: Trigger) => void;
  onCancel: () => void;
}

export default function TriggerEditor({ trigger, onSave, onCancel }: Props) {
  const [draft, setDraft] = useState<Trigger>(trigger);

  const toggleDay = (d: Weekday) => {
    setDraft(prev => ({
      ...prev,
      weekdays: prev.weekdays.includes(d)
        ? prev.weekdays.filter(w => w !== d)
        : [...prev.weekdays, d].sort((a, b) => a - b) as Weekday[],
    }));
  };

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>Edit trigger</h3>
        <div className="field">
          <label>Label</label>
          <input value={draft.label} onChange={e => setDraft({ ...draft, label: e.target.value })} />
        </div>
        <div className="field">
          <label>Time</label>
          <input type="time" value={`${String(draft.hour).padStart(2, '0')}:${String(draft.minute).padStart(2, '0')}`}
            onChange={e => {
              const [h, m] = e.target.value.split(':').map(Number);
              setDraft({ ...draft, hour: h, minute: m });
            }} />
        </div>
        <div className="field">
          <label>Days</label>
          <div>
            {DAYS.map(d => (
              <span key={d.value}
                className={`weekday-chip ${draft.weekdays.includes(d.value) ? 'on' : ''}`}
                onClick={() => toggleDay(d.value)}>{d.label}</span>
            ))}
          </div>
        </div>
        <div style={{ textAlign: 'right', marginTop: 16 }}>
          <button className="btn" onClick={onCancel}>Cancel</button>{' '}
          <button className="btn primary" onClick={() => onSave(draft)}>OK</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 10.3: Replace `src/renderer/components/SchedulePanel.tsx`**

```tsx
import React, { useState } from 'react';
import { api, defaultTrigger, type AppConfig, type Trigger } from '../api';
import TriggerRow from './TriggerRow';
import TriggerEditor from './TriggerEditor';

interface Props {
  cfg: AppConfig;
  setCfg: (c: AppConfig) => void;
  showToast: (msg: string) => void;
}

export default function SchedulePanel({ cfg, setCfg, showToast }: Props) {
  const [editing, setEditing] = useState<Trigger | null>(null);
  const [dirty, setDirty] = useState(false);

  const updateCfg = (patch: Partial<AppConfig>) => {
    setCfg({ ...cfg, ...patch });
    setDirty(true);
  };

  const updateTrigger = (t: Trigger) => {
    updateCfg({ triggers: cfg.triggers.map(x => x.id === t.id ? t : x) });
  };

  const addTrigger = () => {
    const t = defaultTrigger();
    updateCfg({ triggers: [...cfg.triggers, t] });
    setEditing(t);
  };

  const deleteTrigger = (id: string) => {
    updateCfg({ triggers: cfg.triggers.filter(t => t.id !== id) });
  };

  const save = async () => {
    try {
      await api.saveConfig(cfg);
      setDirty(false);
      const count = cfg.triggers.filter(t => t.enabled).length;
      showToast(`Schedule updated — ${count} trigger${count === 1 ? '' : 's'} active.`);
    } catch (e: any) {
      showToast(`Save failed: ${e.message}`);
    }
  };

  return (
    <>
      <div className="field">
        <label>Default prompt (sent by every trigger)</label>
        <input value={cfg.defaultPrompt} onChange={e => updateCfg({ defaultPrompt: e.target.value })} />
      </div>
      <div className="field">
        <label>Path to <code>claude</code> binary</label>
        <input value={cfg.claudePath} onChange={e => updateCfg({ claudePath: e.target.value })} />
      </div>
      <div style={{ margin: '16px 0', display: 'flex', justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0 }}>Triggers</h3>
        <button className="btn" onClick={addTrigger}>+ Add trigger</button>
      </div>
      <div>
        {cfg.triggers.length === 0 && <div style={{ color: '#888', padding: 20, textAlign: 'center' }}>No triggers yet.</div>}
        {cfg.triggers.map(t => (
          <TriggerRow key={t.id} trigger={t}
            onChange={updateTrigger}
            onDelete={() => deleteTrigger(t.id)}
            onEdit={() => setEditing(t)}
            showToast={showToast} />
        ))}
      </div>
      <div style={{ marginTop: 24, textAlign: 'right' }}>
        <button className="btn primary" disabled={!dirty} onClick={save}>Save</button>
      </div>
      {editing && (
        <TriggerEditor trigger={editing}
          onSave={t => { updateTrigger(t); setEditing(null); }}
          onCancel={() => setEditing(null)} />
      )}
    </>
  );
}
```

- [ ] **Step 10.4: Typecheck + manual smoke**

```bash
npm run typecheck
npm run dev
```

Add a trigger, edit its time/days, verify Save becomes enabled when dirty.

- [ ] **Step 10.5: Commit**

```bash
git add src/renderer/components/
git commit -m "feat: schedule panel — list, add/edit/delete, dirty-tracked save"
```

---

## Task 11: History panel

**Files:**
- Modify: `src/renderer/components/HistoryPanel.tsx`

- [ ] **Step 11.1: Replace `src/renderer/components/HistoryPanel.tsx`**

```tsx
import React, { useEffect, useState } from 'react';
import { api, type HistoryEntry } from '../api';

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString();
}

export default function HistoryPanel() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [expandedTs, setExpandedTs] = useState<string | null>(null);

  const refresh = () => api.readHistory().then(h => setEntries([...h].reverse()));

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, []);

  if (entries.length === 0) {
    return <div style={{ color: '#888', padding: 20, textAlign: 'center' }}>No runs yet.</div>;
  }

  return (
    <table className="history">
      <thead>
        <tr>
          <th>Time</th>
          <th>Trigger</th>
          <th>Duration</th>
          <th>Exit</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {entries.map(e => (
          <React.Fragment key={e.ts + e.triggerId}>
            <tr onClick={() => setExpandedTs(expandedTs === e.ts ? null : e.ts)} style={{ cursor: e.ok ? 'default' : 'pointer' }}>
              <td>{fmtTime(e.ts)}{e.manual ? ' (manual)' : ''}</td>
              <td>{e.triggerLabel || e.triggerId}</td>
              <td>{fmtDuration(e.durationMs)}</td>
              <td>{e.exitCode === null ? 'timeout' : e.exitCode}</td>
              <td className={e.ok ? 'status-ok' : 'status-fail'}>{e.ok ? '✓' : '✗'}</td>
            </tr>
            {expandedTs === e.ts && !e.ok && (
              <tr>
                <td colSpan={5} style={{ background: '#fff6f6', fontFamily: 'monospace', fontSize: 12, whiteSpace: 'pre-wrap' }}>
                  {e.outputTail || '(no output captured)'}
                </td>
              </tr>
            )}
          </React.Fragment>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 11.2: Manual smoke**

```bash
npm run dev
```

Click History tab — should show "No runs yet."

- [ ] **Step 11.3: Commit**

```bash
git add src/renderer/components/HistoryPanel.tsx
git commit -m "feat: history panel with 5s polling and expandable error tails"
```

---

## Task 12: First-launch setup modal

**Files:**
- Modify: `src/renderer/components/FirstLaunchModal.tsx`

- [ ] **Step 12.1: Replace `src/renderer/components/FirstLaunchModal.tsx`**

```tsx
import React, { useEffect, useState } from 'react';
import { api, type AppConfig } from '../api';

interface Props {
  cfg: AppConfig;
  setCfg: (c: AppConfig) => void;
}

export default function FirstLaunchModal({ cfg, setCfg }: Props) {
  const [claudePath, setClaudePath] = useState(cfg.claudePath);
  const [nodePath, setNodePath] = useState(cfg.nodePath);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.detectPaths().then(d => {
      if (!claudePath && d.claudePath) setClaudePath(d.claudePath);
      if (!nodePath && d.nodePath) setNodePath(d.nodePath);
    });
  }, []);

  const confirm = async () => {
    if (!claudePath || !nodePath) {
      setErr('Both paths are required.');
      return;
    }
    setBusy(true);
    const next = { ...cfg, claudePath, nodePath };
    try {
      await api.saveConfig(next);
      setCfg(next);
    } catch (e: any) {
      setErr(e.message);
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h3>Setup</h3>
        <p style={{ fontSize: 13, color: '#555' }}>
          We need absolute paths to <code>claude</code> and <code>node</code> — launchd runs with a minimal PATH and can't find them otherwise.
        </p>
        <div className="field">
          <label>Path to <code>claude</code></label>
          <input value={claudePath} onChange={e => setClaudePath(e.target.value)} placeholder="/usr/local/bin/claude" />
        </div>
        <div className="field">
          <label>Path to <code>node</code></label>
          <input value={nodePath} onChange={e => setNodePath(e.target.value)} placeholder="/usr/local/bin/node" />
        </div>
        {err && <div style={{ color: '#b00020', marginBottom: 12 }}>{err}</div>}
        <div style={{ textAlign: 'right' }}>
          <button className="btn primary" disabled={busy} onClick={confirm}>Continue</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 12.2: Manual smoke**

Delete config to simulate first launch:

```bash
rm -rf "$HOME/Library/Application Support/claude-session-optimizer"
npm run dev
```

Modal should appear with pre-filled detected paths. Click Continue → modal dismisses. Relaunch — modal stays dismissed.

- [ ] **Step 12.3: Commit**

```bash
git add src/renderer/components/FirstLaunchModal.tsx
git commit -m "feat: first-launch setup modal with path auto-detection"
```

---

## Task 13: Settings panel

**Files:**
- Modify: `src/renderer/components/SettingsPanel.tsx`

- [ ] **Step 13.1: Replace `src/renderer/components/SettingsPanel.tsx`**

```tsx
import React, { useState } from 'react';
import { api, type AppConfig } from '../api';

interface Props {
  cfg: AppConfig;
  setCfg: (c: AppConfig) => void;
  showToast: (msg: string) => void;
}

export default function SettingsPanel({ cfg, setCfg, showToast }: Props) {
  const [busy, setBusy] = useState(false);

  const updateAndSave = async (patch: Partial<AppConfig>) => {
    const next = { ...cfg, ...patch };
    setCfg(next);
    await api.saveConfig(next);
  };

  const removeAll = async () => {
    if (!confirm('Unload and delete every trigger plist we installed? (Config and history stay.)')) return;
    setBusy(true);
    try {
      await api.removeAllSchedules();
      await updateAndSave({ triggers: cfg.triggers.map(t => ({ ...t, enabled: false })) });
      showToast('All schedules removed.');
    } catch (e: any) {
      showToast(`Remove failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="field">
        <label>
          <input type="checkbox" checked={cfg.failureNotifications}
            onChange={e => updateAndSave({ failureNotifications: e.target.checked })} />
          {' '}Show macOS notification when a trigger fails
        </label>
      </div>
      <div className="field">
        <label>Path to <code>node</code></label>
        <input value={cfg.nodePath} onChange={e => updateAndSave({ nodePath: e.target.value })} />
      </div>
      <hr style={{ margin: '20px 0', border: 'none', borderTop: '1px solid #ddd' }} />
      <button className="btn danger" disabled={busy} onClick={removeAll}>Remove all schedules</button>
    </>
  );
}
```

- [ ] **Step 13.2: Commit**

```bash
git add src/renderer/components/SettingsPanel.tsx
git commit -m "feat: settings panel — notifications toggle, node path, remove-all"
```

---

## Task 14: End-to-end smoke test (real launchd)

Manual verification. Confirms the whole pipeline fires real launchd jobs.

- [ ] **Step 14.1: Start dev app**

```bash
npm run dev
```

- [ ] **Step 14.2: Add a trigger scheduled 2 minutes from now**

- Determine the current time + 2 minutes.
- In the UI, add a trigger with label "Smoke test", that time, all 7 weekday chips selected, enabled.
- Click Save — toast should show "Schedule updated — 1 trigger active."

- [ ] **Step 14.3: Verify plist was written and loaded**

```bash
ls ~/Library/LaunchAgents/ | grep claude-session-optimizer
launchctl print gui/$UID/com.dbbaskette.claude-session-optimizer.t_* 2>&1 | head -30
```

Expected: one plist file; `launchctl print` returns details without "Could not find service".

- [ ] **Step 14.4: Test Run Now button**

Click Run Now next to the trigger. Wait ~3 seconds. Click History tab. Expected: one entry with `(manual)` suffix and a ✓.

- [ ] **Step 14.5: Wait for scheduled fire**

Wait until the scheduled minute. Check History — a second entry should appear (without `(manual)`).

If it doesn't appear within 30 seconds of the scheduled time, check `/tmp/com.dbbaskette.claude-session-optimizer.*.log` for launchd's stdout/stderr.

- [ ] **Step 14.6: Delete the smoke-test trigger**

In the UI, click Delete on the row, then Save. Verify:

```bash
ls ~/Library/LaunchAgents/ | grep claude-session-optimizer
```

Expected: no plist files remain.

---

## Task 15: Packaging

**Files:**
- Already configured in `package.json` (Task 1)

- [ ] **Step 15.1: Build the app**

```bash
npm run package
```

Expected: `dist/Claude Session Optimizer-0.1.0-arm64.dmg` (or similar) is produced. Open the DMG and drag the app to Applications.

- [ ] **Step 15.2: Launch the packaged app and re-run smoke test**

Open `/Applications/Claude Session Optimizer.app`. Repeat Task 14 steps 14.2–14.6 against the packaged build.

Note: in the packaged build, `trigger.js` lives at `Contents/Resources/trigger.js` (because of the `extraResources` setting in `package.json`). The `triggerScriptPath()` helper in `src/main/run-now.ts` handles both dev and packaged cases.

- [ ] **Step 15.3: Commit**

```bash
git add -A
git commit -m "chore: verify packaged build works end-to-end"
```

---

## Done

At this point you have:
- A working Electron UI for editing a schedule and viewing history.
- Real `launchd` integration — scheduled runs fire even when the app is closed.
- A trigger runner that captures exit code/duration/tail of output.
- First-launch setup, failure notifications, and a clean uninstall path.
- Unit tests for every non-UI module plus a manual smoke-test script for the whole pipeline.

Deferred (revisit if needed):
- Bundling Electron's Node binary instead of requiring system Node.
- Menu bar presence.
- Dark-mode styling.
