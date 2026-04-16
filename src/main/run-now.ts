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
