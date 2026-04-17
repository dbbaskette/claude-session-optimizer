import { describe, it, expect, vi, beforeEach } from 'vitest';

const { spawnSyncMock } = vi.hoisted(() => ({ spawnSyncMock: vi.fn() }));
vi.mock('child_process', () => ({ spawnSync: spawnSyncMock }));

import { bootstrapPlist, bootoutPlist, domainTarget } from '../src/main/launchctl';

beforeEach(() => {
  spawnSyncMock.mockReset();
  spawnSyncMock.mockReturnValue({ status: 0, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) });
});

describe('launchctl', () => {
  it('domainTarget is gui/<uid>', () => {
    expect(domainTarget(501)).toBe('gui/501');
  });

  it('bootstrapPlist invokes launchctl bootstrap <domain> <path>', () => {
    bootstrapPlist('/path/to.plist', 501);
    expect(spawnSyncMock).toHaveBeenCalledWith(
      'launchctl',
      ['bootstrap', 'gui/501', '/path/to.plist'],
      expect.anything()
    );
  });

  it('bootoutPlist invokes launchctl bootout <domain> <path>', () => {
    bootoutPlist('/path/to.plist', 501);
    expect(spawnSyncMock).toHaveBeenCalledWith(
      'launchctl',
      ['bootout', 'gui/501', '/path/to.plist'],
      expect.anything()
    );
  });

  it('bootoutPlist swallows "Could not find" errors (idempotent)', () => {
    spawnSyncMock.mockReturnValueOnce({ status: 3, stdout: Buffer.alloc(0), stderr: Buffer.from('Could not find service') });
    expect(() => bootoutPlist('/x.plist', 501)).not.toThrow();
  });

  it('bootoutPlist swallows macOS "Boot-out failed: 5: Input/output error" when service not loaded', () => {
    spawnSyncMock.mockReturnValueOnce({
      status: 5,
      stdout: Buffer.alloc(0),
      stderr: Buffer.from('Boot-out failed: 5: Input/output error\n'),
    });
    expect(() => bootoutPlist('/x.plist', 501)).not.toThrow();
  });

  it('bootoutPlist swallows exit 36 (no such process)', () => {
    spawnSyncMock.mockReturnValueOnce({ status: 36, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) });
    expect(() => bootoutPlist('/x.plist', 501)).not.toThrow();
  });

  it('bootoutPlist still throws on genuine failures (e.g. permission denied with exit 1)', () => {
    spawnSyncMock.mockReturnValueOnce({ status: 1, stdout: Buffer.alloc(0), stderr: Buffer.from('permission denied') });
    expect(() => bootoutPlist('/x.plist', 501)).toThrow(/permission/);
  });

  it('bootstrapPlist throws on non-zero status', () => {
    spawnSyncMock.mockReturnValueOnce({ status: 5, stdout: Buffer.alloc(0), stderr: Buffer.from('permission denied') });
    expect(() => bootstrapPlist('/x.plist', 501)).toThrow(/permission/);
  });
});
