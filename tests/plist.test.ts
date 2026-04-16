import { describe, it, expect } from 'vitest';
import { generatePlist } from '../src/main/plist';
import { Trigger } from '../src/shared/types';

const base: Trigger = {
  id: 't_abc',
  label: 'Morning',
  enabled: true,
  hour: 7,
  minute: 30,
  weekdays: [1, 2, 3, 4, 5],
};

describe('plist', () => {
  it('wraps label with bundle id prefix', () => {
    const xml = generatePlist(base, '/usr/local/bin/node', '/app/trigger.js');
    expect(xml).toContain('<string>com.dbbaskette.claude-session-optimizer.t_abc</string>');
  });

  it('includes node binary + script + trigger id as ProgramArguments', () => {
    const xml = generatePlist(base, '/usr/local/bin/node', '/app/trigger.js');
    expect(xml).toContain('<key>ProgramArguments</key>');
    expect(xml).toMatch(/<string>\/usr\/local\/bin\/node<\/string>\s*<string>\/app\/trigger\.js<\/string>\s*<string>t_abc<\/string>/s);
  });

  it('emits one StartCalendarInterval dict per weekday', () => {
    const xml = generatePlist(base, '/u/node', '/a/t.js');
    const matches = xml.match(/<key>Weekday<\/key>/g) ?? [];
    expect(matches.length).toBe(5);
  });

  it('emits hour and minute correctly', () => {
    const xml = generatePlist(base, '/u/node', '/a/t.js');
    expect(xml).toContain('<key>Hour</key>\n      <integer>7</integer>');
    expect(xml).toContain('<key>Minute</key>\n      <integer>30</integer>');
  });

  it('sets RunAtLoad to false and includes stdout/stderr log paths', () => {
    const xml = generatePlist(base, '/u/node', '/a/t.js');
    expect(xml).toContain('<key>RunAtLoad</key>\n  <false/>');
    expect(xml).toMatch(/<key>StandardOutPath<\/key>\s*<string>\/tmp\/com\.dbbaskette\.claude-session-optimizer\.t_abc\.log<\/string>/);
    expect(xml).toMatch(/<key>StandardErrorPath<\/key>\s*<string>\/tmp\/com\.dbbaskette\.claude-session-optimizer\.t_abc\.log<\/string>/);
  });

  it('produces valid XML declaration and DOCTYPE', () => {
    const xml = generatePlist(base, '/u/node', '/a/t.js');
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<!DOCTYPE plist');
  });
});
