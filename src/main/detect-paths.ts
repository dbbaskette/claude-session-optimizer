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
