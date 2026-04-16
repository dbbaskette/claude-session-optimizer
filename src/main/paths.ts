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
