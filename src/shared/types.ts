export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday

export interface Trigger {
  id: string;              // e.g. "t_abc123" — filename-safe
  label: string;
  enabled: boolean;
  hour: number;            // 0–23
  minute: number;          // 0–59
  weekdays: Weekday[];     // 1–5 for weekdays, 0 and 6 for weekend
}

export interface AppConfig {
  version: 1;
  defaultPrompt: string;
  claudePath: string;              // absolute path to `claude` binary
  nodePath: string;                // absolute path to `node` binary (used in plist)
  failureNotifications: boolean;
  triggers: Trigger[];
}

export interface HistoryEntry {
  ts: string;                      // ISO-8601
  triggerId: string;
  triggerLabel: string;
  exitCode: number | null;         // null => timeout
  durationMs: number;
  ok: boolean;
  outputTail: string;
  manual?: boolean;                // true if invoked via Run Now
}

export const DEFAULT_CONFIG: AppConfig = {
  version: 1,
  defaultPrompt: 'ok',
  claudePath: '',
  nodePath: '',
  failureNotifications: true,
  triggers: [],
};
