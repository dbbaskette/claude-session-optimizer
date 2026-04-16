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
