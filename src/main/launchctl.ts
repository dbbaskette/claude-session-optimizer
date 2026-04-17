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

// launchctl bootout exit codes / stderr for "service isn't loaded":
//   3   → "Could not find specified service"
//   5   → "Boot-out failed: 5: Input/output error" (macOS's way of saying not loaded)
//   36  → "no such process"
//   113 → "service already unloaded"
const BOOTOUT_NOT_LOADED_STATUSES = new Set([3, 5, 36, 113]);
const BOOTOUT_NOT_LOADED_PATTERNS = [
  /could not find/i,
  /no such process/i,
  /boot-out failed/i,
  /not loaded/i,
];

export function bootoutPlist(plistPath: string, uid?: number): void {
  const r = runLaunchctl(['bootout', domainTarget(uid), plistPath]);
  if (r.status === 0) return;
  if (BOOTOUT_NOT_LOADED_STATUSES.has(r.status)) return; // idempotent
  if (BOOTOUT_NOT_LOADED_PATTERNS.some(p => p.test(r.stderr))) return; // idempotent
  throw new Error(`launchctl bootout failed: ${r.stderr.trim()}`);
}
