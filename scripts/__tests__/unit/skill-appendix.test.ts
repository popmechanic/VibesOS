import { describe, it, expect, vi } from 'vitest';
import { join } from 'path';
import { buildSkillBlock } from '../../server/prompt-builders.ts';
import { parseSkillFrontmatter } from '../../server/config.ts';

describe('buildSkillAppendix', () => {
  // Import will fail until Task 6 implements it — that's expected
  it('reads all three core reference files and concatenates them', async () => {
    const { buildSkillAppendix } = await import('../../lib/claude-subprocess.js');
    const pluginRoot = join(__dirname, '..', '..', '..');
    const result = buildSkillAppendix(pluginRoot);

    expect(result).toContain('EDITOR ENVIRONMENT CONSTRAINTS');
    expect(result).toContain('Generation Rules');
    expect(result).toContain('useRowIds');
    expect(result).toMatch(/oklch/i);
  });

  it('warns when a core reference file is missing', async () => {
    const { buildSkillAppendix } = await import('../../lib/claude-subprocess.js');
    const spy = vi.spyOn(console, 'warn');
    buildSkillAppendix('/nonexistent/path');
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('WARNING: Core reference missing'));
    spy.mockRestore();
  });

  it('logs FATAL when no core files found', async () => {
    const { buildSkillAppendix } = await import('../../lib/claude-subprocess.js');
    const spy = vi.spyOn(console, 'error');
    buildSkillAppendix('/nonexistent/path');
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('FATAL'));
    spy.mockRestore();
  });
});

const pluginRoot = join(__dirname, '..', '..', '..');
const mockCtx = {
  pluginSkills: [
    {
      id: 'vibes/multiplayer-guide',
      name: 'Multiplayer Guide',
      skillMdPath: join(pluginRoot, 'skills/vibes/references/multiplayer-guide.md'),
    },
    {
      id: 'vibes/game-patterns',
      name: 'Game Patterns',
      skillMdPath: join(pluginRoot, 'skills/vibes/references/game-patterns.md'),
    },
  ],
};

describe('buildSkillBlock deduplication', () => {
  it('injects full content on first call', () => {
    const state = { lastSkillId: null, messageCount: 0 };
    const result = buildSkillBlock(mockCtx, 'vibes/multiplayer-guide', state);
    expect(result.block).toContain('SKILL CONTEXT');
    expect(result.block).toContain('Multiplayer');
    expect(result.newState.lastSkillId).toBe('vibes/multiplayer-guide');
    expect(result.newState.messageCount).toBe(0);
  });

  it('returns pointer on subsequent calls with same skill', () => {
    const state = { lastSkillId: 'vibes/multiplayer-guide', messageCount: 1 };
    const result = buildSkillBlock(mockCtx, 'vibes/multiplayer-guide', state);
    expect(result.block).toContain('provided earlier');
    expect(result.newState.messageCount).toBe(2);
  });

  it('re-injects full content on 5th message', () => {
    const state = { lastSkillId: 'vibes/multiplayer-guide', messageCount: 4 };
    const result = buildSkillBlock(mockCtx, 'vibes/multiplayer-guide', state);
    expect(result.block).toContain('SKILL CONTEXT');
    expect(result.newState.messageCount).toBe(0);
  });

  it('injects full content when skill changes', () => {
    const state = { lastSkillId: 'vibes/multiplayer-guide', messageCount: 1 };
    const result = buildSkillBlock(mockCtx, 'vibes/game-patterns', state);
    expect(result.block).toContain('SKILL CONTEXT');
    expect(result.newState.lastSkillId).toBe('vibes/game-patterns');
  });

  it('returns empty for unknown skill', () => {
    const state = { lastSkillId: null, messageCount: 0 };
    const result = buildSkillBlock(mockCtx, 'unknown/skill', state);
    expect(result.block).toBe('');
  });
});

describe('parseSkillFrontmatter inject field', () => {
  it('extracts inject field from frontmatter', () => {
    const content = '---\nname: Test\ninject: system-prompt\n---\nBody';
    const result = parseSkillFrontmatter(content);
    expect(result.inject).toBe('system-prompt');
  });

  it('returns undefined inject when not present', () => {
    const content = '---\nname: Test\n---\nBody';
    const result = parseSkillFrontmatter(content);
    expect(result.inject).toBeUndefined();
  });
});
