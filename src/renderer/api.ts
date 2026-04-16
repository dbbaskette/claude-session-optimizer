import type { AppConfig, HistoryEntry, Trigger } from '../shared/types';

export const api = {
  readConfig: () => window.api.readConfig(),
  saveConfig: (cfg: AppConfig) => window.api.saveConfig(cfg),
  readHistory: () => window.api.readHistory(),
  runNow: (triggerId: string) => window.api.runNow(triggerId),
  detectPaths: () => window.api.detectPaths(),
  removeAllSchedules: () => window.api.removeAllSchedules(),
};

export function newTriggerId(): string {
  return 't_' + Math.random().toString(36).slice(2, 10);
}

export function defaultTrigger(): Trigger {
  return {
    id: newTriggerId(),
    label: 'New trigger',
    enabled: true,
    hour: 7,
    minute: 0,
    weekdays: [1, 2, 3, 4, 5],
  };
}

export type { AppConfig, HistoryEntry, Trigger };
