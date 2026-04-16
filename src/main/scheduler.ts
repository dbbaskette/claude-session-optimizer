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
