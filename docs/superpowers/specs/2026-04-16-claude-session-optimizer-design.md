# Claude Session Optimizer — Design

**Date:** 2026-04-16
**Status:** Approved (pending user review of written spec)

## Problem

Claude Code sessions are 5 hours long, anchored to the first `claude` ping of the session. If the user starts work at 9am and pings Claude at 9am, their session ends at 2pm — cutting off mid-afternoon. By pinging Claude earlier in the morning (e.g., 7am) with a near-no-op prompt, the 5-hour window shifts earlier (ending at noon), making it reset sooner in the working day and aligning better with an afternoon work block.

This app automates that warm-up: it fires `claude -p "<prompt>"` at user-scheduled times via `launchd`, so the user doesn't have to remember.

## Goals

- Schedule one or more recurring daily triggers (time + weekday selection) that fire `claude -p "<prompt>"` at the scheduled time.
- Triggers run even when the app UI is closed.
- Triggers run after sleep/shutdown catch-up (user confirmed: later-than-planned firing is still strictly better than no firing).
- Simple UI for editing schedule and viewing history.
- Minimal token consumption per trigger (configurable default prompt, e.g., `"ok"`).

## Non-Goals

- Cron-expression-level scheduling flexibility. Time + weekday checkboxes only.
- Per-trigger prompt overrides. One global default prompt applies to all triggers.
- Multi-user / multi-machine sync.
- Supporting OSes other than macOS (launchd is macOS-specific).

## Architecture

Three separable components, communicating only via files on disk:

```
┌──────────────────────┐      ┌──────────────────────────────┐
│  Electron UI app     │──────│ config.json                  │
│  (user-facing)       │      │ history.jsonl                │
│  edit schedule,      │      │ (~/Library/Application       │
│  view history,       │      │  Support/claude-session-     │
│  regenerate plists   │      │  optimizer/)                 │
└──────────────────────┘      └──────────────────────────────┘
           │                              ▲
           │ writes                       │ appends
           ▼                              │
┌──────────────────────┐      ┌──────────────────────────────┐
│ launchd plists       │─────▶│ trigger.js (Node script)     │
│ (~/Library/          │ runs │ spawns `claude -p "<prompt>"`│
│  LaunchAgents/)      │      │ captures result              │
│ one per trigger      │      │ appends to history.jsonl     │
└──────────────────────┘      └──────────────────────────────┘
```

### Component 1: Electron UI app

Single-window Electron app, bundled as `claude-session-optimizer.app`. Two panels (tabs or split-pane — TBD in implementation):

**Schedule panel**
- Global "Default prompt" text field at the top (applies to all triggers).
- Global "Path to `claude` binary" field (populated on first launch; editable later).
- List of triggers. Each row shows:
  - Enabled toggle
  - Time (24-hour HH:MM)
  - Weekday chips (Mon–Sun)
  - "Run Now" button (spawns trigger runner immediately, bypasses schedule)
  - Edit / Delete buttons
- "Add trigger" button.
- **Manual Save button** — regenerates plists and re-registers with launchd. Nothing is applied until Save is clicked.
- Toast on save: "Schedule updated — N triggers active."

**History panel**
- Table: timestamp | trigger label (e.g., "7:00 AM weekdays") | duration (ms) | exit code | status icon (check/x).
- Click a failed row to expand the error tail.
- "Clear history" button.
- Refreshes from `history.jsonl` on open and on a 5-second poll while visible.

**Settings (accessible from header or menu)**
- Failure notifications toggle (default: on).
- "Remove all schedules" button (unloads and deletes every plist this app created).

### Component 2: Trigger runner (`trigger.js`)

Tiny Node script bundled inside the `.app`, invoked by launchd. Not user-facing.

Logic:
1. Read `config.json` to get the default prompt and `claude` binary path.
2. Spawn `<claudePath> -p "<prompt>"` with:
   - 60-second timeout (kill the subprocess if it hangs).
   - Capture stdout + stderr to a 2KB rolling buffer (keep the tail).
3. Record: ISO timestamp, trigger ID (passed as argv), exit code, duration ms, output tail, success boolean.
4. Append one JSON line to `history.jsonl`.
5. Prune `history.jsonl`: keep entries where `(age < 30 days) OR (among last 100)`. (Whichever yields more — stated this way so a burst of old entries can't evict new ones.)
6. On non-zero exit AND failure-notifications-enabled: post a macOS notification via `osascript -e 'display notification ...'` (avoids needing a notification entitlement).

Takes the trigger ID as a single argv so the plist can pass it in and the history entry can attribute correctly.

### Component 3: launchd plists

One plist per trigger, written to `~/Library/LaunchAgents/com.dbbaskette.claude-session-optimizer.<triggerId>.plist`.

Key fields:
- `Label`: `com.dbbaskette.claude-session-optimizer.<triggerId>`
- `ProgramArguments`: `["/path/to/node", "/path/to/trigger.js", "<triggerId>"]` (uses the Node bundled in Electron or system Node — decided in implementation).
- `StartCalendarInterval`: array of `{Hour, Minute, Weekday}` dicts — one dict per selected weekday. (launchd's Weekday is 0=Sun, 1=Mon, …, 6=Sat.)
- `StandardOutPath` / `StandardErrorPath`: `/tmp/com.dbbaskette.claude-session-optimizer.<triggerId>.log` (for debugging launchd itself; normal history lives in `history.jsonl`).
- `RunAtLoad`: `false`.

Disabled triggers: plist is unloaded via `launchctl bootout` but kept on disk for fast re-enable. Alternative: remove file entirely. Implementation plan will decide.

## Data Shapes

### `config.json`

```json
{
  "version": 1,
  "defaultPrompt": "ok",
  "claudePath": "/usr/local/bin/claude",
  "failureNotifications": true,
  "triggers": [
    {
      "id": "t_abc123",
      "label": "Morning warm-up",
      "enabled": true,
      "hour": 7,
      "minute": 0,
      "weekdays": [1, 2, 3, 4, 5]
    }
  ]
}
```

### `history.jsonl` (one object per line)

```json
{"ts": "2026-04-16T07:00:02.431Z", "triggerId": "t_abc123", "triggerLabel": "Morning warm-up", "exitCode": 0, "durationMs": 2104, "ok": true, "outputTail": ""}
{"ts": "2026-04-16T07:00:01.882Z", "triggerId": "t_xyz789", "triggerLabel": "Lunch warm-up", "exitCode": 1, "durationMs": 540, "ok": false, "outputTail": "command not found: claude"}
```

## Key Flows

### First launch

1. App checks if `config.json` exists. If not, creates directory and writes a default (empty triggers, `defaultPrompt: "ok"`, `claudePath: ""`).
2. App checks if `claudePath` is set and the binary exists. If not, shows a modal: "Enter the path to your `claude` binary." Provides a file picker and a `which claude` hint (if launched from a terminal where `claude` is on PATH, offer the detected path as a default).
3. App requests notification permission (prompt handled by Electron / macOS).

### Edit and save

1. User adds/edits/deletes triggers, clicks Save.
2. App computes diff vs. currently-registered plists (read `~/Library/LaunchAgents/`).
3. For each removed trigger: `launchctl bootout gui/$UID <plist-path>` then delete the file.
4. For each added/changed trigger: write the plist, then `launchctl bootstrap gui/$UID <plist-path>`.
5. Write `config.json`.
6. Show toast.

### Trigger fires

1. launchd invokes `trigger.js <triggerId>`.
2. Runner executes the logic in Component 2.
3. History entry appended.
4. If the UI is open, its history-panel poll picks up the new entry within 5 seconds.

### Run Now

UI invokes `trigger.js <triggerId>` directly via `child_process.spawn`, bypassing launchd. Same code path, same history entry (with a flag `manual: true` if we want to distinguish later — implementation plan decides).

### Uninstall

"Remove all schedules" button: enumerate plists matching `com.dbbaskette.claude-session-optimizer.*`, `launchctl bootout` each, delete the files. Does NOT delete `config.json` or `history.jsonl` (user might want to reinstall later).

## Error Handling

| Failure | Behavior |
|---|---|
| `claude` binary not at configured path when trigger fires | Non-zero exit recorded in history; failure notification (if enabled). User fixes in UI. |
| `claude -p` hangs | Killed after 60s; history entry has `exitCode: null` and `outputTail: "TIMEOUT (60s)"`. |
| launchd registration fails on Save | Show error dialog with stderr from `launchctl`. Previous state untouched (we write plists first, then `launchctl bootstrap`; if bootstrap fails, the plist exists but isn't registered — acceptable, user can retry Save). |
| `history.jsonl` write fails | Log to stderr (which goes to the launchd log file). Do not retry. |
| Config file corrupted | UI refuses to start scheduling operations and shows a "Reset config" button. |

## Testing Strategy

- **Trigger runner (`trigger.js`)**: unit tests with a fake `claude` binary (a shell script that returns a configured exit code / output / delay). Verify history entry shape, timeout handling, pruning logic.
- **Plist generation**: snapshot tests — given a trigger config, assert exact plist XML output.
- **UI**: manual smoke test for now (schedule edit, save, history display). Automated UI tests are not worth the setup cost for a personal utility.
- **End-to-end**: one manual test script that adds a trigger for "one minute from now," waits, and verifies history was updated.

## Open Questions for Implementation Plan

- Exact Electron boilerplate choice (electron-forge, electron-vite, raw). Leaning `electron-vite` for fast TS + React dev loop.
- UI framework: React vs. Svelte vs. vanilla. Leaning React (most familiar, ecosystem).
- Whether to bundle Node or rely on Electron's Node for `trigger.js`. Bundling the full Electron runtime just to run a 100-line Node script is wasteful; on the other hand, requiring a system Node install is a support burden. Most likely: find Electron's Node binary inside the app bundle and invoke it directly from launchd.
- Trigger ID generation format (e.g., `t_<shortuuid>` or timestamp-based). Must be URL/filename-safe.

## Out of Scope

- Windows or Linux support.
- Cloud sync of config across machines.
- Analytics or telemetry.
- Auto-update mechanism.
- Menu bar presence (app is a regular dock app; close the window to hide it).
