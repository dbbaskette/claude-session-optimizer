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
