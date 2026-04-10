import { describe, it, expect, vi, beforeEach } from 'vitest';

// Top-level mock - vi.mock is hoisted so this runs before imports
vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe('pickFolder', () => {
  it('returns selected folder path on macOS', async () => {
    const { execSync } = await import('child_process');
    execSync.mockReturnValue('/Users/marcus/Projects/my-app/\n');

    const { pickFolder } = await import('../../lib/folder-picker.js');

    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });

    const result = pickFolder();

    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });

    expect(result).toBe('/Users/marcus/Projects/my-app');
  });

  it('returns null when user cancels (osascript exits non-zero)', async () => {
    const { execSync } = await import('child_process');
    execSync.mockImplementation(() => {
      throw new Error('Command failed: osascript -e ...');
    });

    const { pickFolder } = await import('../../lib/folder-picker.js');

    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });

    const result = pickFolder();

    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });

    expect(result).toBeNull();
  });

  it('throws on non-macOS platforms', async () => {
    const { pickFolder } = await import('../../lib/folder-picker.js');

    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

    expect(() => pickFolder()).toThrow(/not supported/i);

    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
  });
});
