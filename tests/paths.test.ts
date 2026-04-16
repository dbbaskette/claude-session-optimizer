import { describe, it, expect } from 'vitest';
import * as paths from '../src/main/paths';

describe('paths', () => {
  it('appSupportDir is under HOME/Library/Application Support', () => {
    const dir = paths.appSupportDir('/Users/someone');
    expect(dir).toBe('/Users/someone/Library/Application Support/claude-session-optimizer');
  });

  it('configPath is config.json inside app support dir', () => {
    expect(paths.configPath('/Users/x')).toBe(
      '/Users/x/Library/Application Support/claude-session-optimizer/config.json'
    );
  });

  it('historyPath is history.jsonl inside app support dir', () => {
    expect(paths.historyPath('/Users/x')).toBe(
      '/Users/x/Library/Application Support/claude-session-optimizer/history.jsonl'
    );
  });

  it('launchAgentsDir is HOME/Library/LaunchAgents', () => {
    expect(paths.launchAgentsDir('/Users/x')).toBe('/Users/x/Library/LaunchAgents');
  });

  it('plistPath uses com.dbbaskette prefix and trigger id', () => {
    expect(paths.plistPath('/Users/x', 't_abc')).toBe(
      '/Users/x/Library/LaunchAgents/com.dbbaskette.claude-session-optimizer.t_abc.plist'
    );
  });

  it('plistLabel returns the bundle-id-style label', () => {
    expect(paths.plistLabel('t_abc')).toBe('com.dbbaskette.claude-session-optimizer.t_abc');
  });
});
