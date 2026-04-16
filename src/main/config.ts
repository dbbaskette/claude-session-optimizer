import fs from 'fs';
import { AppConfig, DEFAULT_CONFIG } from '../shared/types';
import { appSupportDir, configPath } from './paths';

export function readConfig(home?: string): AppConfig {
  const p = configPath(home);
  if (!fs.existsSync(p)) return { ...DEFAULT_CONFIG };
  try {
    const raw = fs.readFileSync(p, 'utf-8');
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function writeConfig(cfg: AppConfig, home?: string): void {
  const dir = appSupportDir(home);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(configPath(home), JSON.stringify(cfg, null, 2), 'utf-8');
}
