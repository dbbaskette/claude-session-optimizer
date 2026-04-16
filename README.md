# Claude Session Optimizer

A macOS menu app that schedules tiny `claude -p` warm-up pings via `launchd` so your 5-hour Claude Code session window starts earlier in the day.

## Why

A Claude Code session's 5-hour window is anchored to the **first ping** of that session — not a fixed daily reset. If you don't touch Claude until 9am, your session ends at 2pm. Ping it at 7am with a no-op prompt and the window shifts to end at noon, giving you a fresh session for the afternoon.

This app automates the warm-up ping so you don't have to remember.

## How it works

Three components, communicating only through files on disk:

1. **Electron UI** — edit schedule, view history, manage settings.
2. **`scripts/trigger.js`** — a tiny Node script `launchd` invokes on schedule. Spawns `claude -p "<prompt>"`, captures result, appends to `history.jsonl`.
3. **`launchd` plists** — one per trigger, written to `~/Library/LaunchAgents/com.dbbaskette.claude-session-optimizer.*.plist`.

Config and history live in `~/Library/Application Support/claude-session-optimizer/`.

Because `launchd` owns scheduling, triggers fire even when the UI is closed, and missed firings (e.g. machine asleep) run on wake — always an improvement over not firing at all.

## Requirements

- macOS (uses `launchd`; Windows/Linux not supported)
- Node.js installed somewhere (`which node`)
- Claude Code CLI installed (`which claude`)

## Development

```bash
npm install --include=dev
npm run dev          # launch Electron app in dev mode
npm test             # run unit tests (vitest)
npm run typecheck    # tsc --noEmit on both tsconfigs
npm run build        # compile main/preload/renderer to out/
npm run package      # build + electron-builder → .dmg in dist/
```

### Project layout

```
src/
  main/         Electron main process — config, history, plist, launchctl, IPC
  preload/      contextBridge exposing a typed window.api
  renderer/     React UI (Schedule / History / Settings tabs)
  shared/       types shared between main and renderer
scripts/
  trigger.js    standalone Node runner invoked by launchd
tests/          vitest unit tests
docs/superpowers/
  specs/        design doc
  plans/        task-by-task implementation plan
```

## First-launch setup

On first launch the app auto-detects your `node` and `claude` binaries via `command -v` in a login shell. If either can't be found you're prompted to set them manually. Paths are saved in `config.json` and used by every trigger fire.

## Usage

1. **Schedule tab** — set a default prompt (e.g. `"ok"`), add one or more triggers. Each trigger has a time, selected weekdays, and an enabled toggle. Click **Save** to regenerate plists and re-register with `launchd`.
2. **History tab** — table of past fires, newest first. Click a failed row to expand the error tail.
3. **Settings tab** — toggle failure notifications, override detected paths, or remove all schedules.

### Run Now

Every trigger row has a **Run Now** button that invokes `trigger.js` immediately (bypassing `launchd`). Same code path, same history entry.

## Uninstall

Settings → **Remove all schedules** unloads every plist this app created and deletes the files. Config and history are preserved in case you want to reinstall.

## License

Private personal project.
