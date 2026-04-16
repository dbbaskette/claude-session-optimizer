import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { readConfig, writeConfig } from '../src/main/config';
import { DEFAULT_CONFIG } from '../src/shared/types';

let tmpHome: string;

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'cso-config-'));
});

describe('config', () => {
  it('readConfig returns DEFAULT_CONFIG when file does not exist', () => {
    expect(readConfig(tmpHome)).toEqual(DEFAULT_CONFIG);
  });

  it('writeConfig creates directory and file; readConfig round-trips', () => {
    const cfg = { ...DEFAULT_CONFIG, defaultPrompt: 'hello', claudePath: '/usr/bin/claude' };
    writeConfig(cfg, tmpHome);
    expect(readConfig(tmpHome)).toEqual(cfg);
  });

  it('readConfig returns DEFAULT_CONFIG when file contents are invalid JSON', () => {
    const dir = path.join(tmpHome, 'Library/Application Support/claude-session-optimizer');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'config.json'), '{ not json');
    expect(readConfig(tmpHome)).toEqual(DEFAULT_CONFIG);
  });

  it('readConfig fills missing fields with defaults (forward-compat)', () => {
    const dir = path.join(tmpHome, 'Library/Application Support/claude-session-optimizer');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ version: 1, defaultPrompt: 'x' }));
    const cfg = readConfig(tmpHome);
    expect(cfg.defaultPrompt).toBe('x');
    expect(cfg.triggers).toEqual([]);
    expect(cfg.failureNotifications).toBe(true);
  });
});
