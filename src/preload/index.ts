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
