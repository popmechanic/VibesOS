import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseSkillFrontmatter } from '../../server/config.js';
import { extractImportMapFromHtml, extractImportMap, IMPORTMAP_REGEX } from '../../lib/extract-import-map.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPTS_DIR = join(__dirname, '..', '..');
const PLUGIN_ROOT = join(SCRIPTS_DIR, '..');

describe('extract-import-map.js', () => {
  it('exits with code 0', () => {
    const result = execSync(`bun ${join(SCRIPTS_DIR, 'lib', 'extract-import-map.js')}`, {
      cwd: PLUGIN_ROOT,
      encoding: 'utf8',
    });
    expect(result).toBeTruthy();
  });

  it('produces valid JSON', () => {
    const result = execSync(`bun ${join(SCRIPTS_DIR, 'lib', 'extract-import-map.js')}`, {
      cwd: PLUGIN_ROOT,
      encoding: 'utf8',
    });
    const parsed = JSON.parse(result.trim());
    expect(parsed).toBeDefined();
  });

  it('contains the authoritative import map entries', () => {
    const result = execSync(`bun ${join(SCRIPTS_DIR, 'lib', 'extract-import-map.js')}`, {
      cwd: PLUGIN_ROOT,
      encoding: 'utf8',
    });
    const parsed = JSON.parse(result.trim());

    // Verify key entries exist
    expect(parsed).toHaveProperty('react');
    expect(parsed).toHaveProperty('react-dom');
    expect(parsed).toHaveProperty('@fireproof/core');
    expect(parsed).toHaveProperty('oauth4webapi');
    expect(parsed).toHaveProperty('use-fireproof');

    // Verify React entries use ?external pattern for Fireproof
    expect(parsed['@fireproof/core']).toContain('?external=react,react-dom');
  });

  it('matches the base template import map exactly', () => {
    // Use the exported function to extract directly from the template
    const templatePath = join(PLUGIN_ROOT, 'source-templates', 'base', 'template.html');
    const templateHtml = readFileSync(templatePath, 'utf8');
    const templateImports = extractImportMapFromHtml(templateHtml);

    // Get output from the extraction script (CLI mode)
    const result = execSync(`bun ${join(SCRIPTS_DIR, 'lib', 'extract-import-map.js')}`, {
      cwd: PLUGIN_ROOT,
      encoding: 'utf8',
    });
    const scriptImports = JSON.parse(result.trim());

    // They must be identical
    expect(scriptImports).toEqual(templateImports);
  });

  it('completes in under 500ms', () => {
    const start = performance.now();
    execSync(`bun ${join(SCRIPTS_DIR, 'lib', 'extract-import-map.js')}`, {
      cwd: PLUGIN_ROOT,
      encoding: 'utf8',
    });
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(500);
  });

  it('extractImportMapFromHtml throws on HTML without importmap', () => {
    const html = '<html><head></head><body></body></html>';
    expect(() => extractImportMapFromHtml(html)).toThrow('No <script type="importmap"> found');
  });

  it('extractImportMap returns the same result as CLI invocation', () => {
    const fnResult = extractImportMap();
    const cliResult = JSON.parse(
      execSync(`bun ${join(SCRIPTS_DIR, 'lib', 'extract-import-map.js')}`, {
        cwd: PLUGIN_ROOT,
        encoding: 'utf8',
      }).trim()
    );
    expect(fnResult).toEqual(cliResult);
  });

  it('IMPORTMAP_REGEX handles script tags with extra attributes', () => {
    const html = '<script type="importmap" data-foo="bar">{"imports":{"react":"https://esm.sh/react"}}</script>';
    const match = html.match(IMPORTMAP_REGEX);
    expect(match).toBeTruthy();
    const parsed = JSON.parse(match[1]);
    expect(parsed.imports).toHaveProperty('react');
  });
});

describe('sell SKILL.md import map consistency', () => {
  it('uses dynamic injection instead of hardcoded import map', () => {
    const skillPath = join(PLUGIN_ROOT, 'skills', 'sell', 'SKILL.md');
    const content = readFileSync(skillPath, 'utf8');

    // Should contain the !`command` injection placeholder
    expect(content).toContain('!`');
    expect(content).toContain('extract-import-map.js');

    // Should NOT contain hardcoded version strings from the import map
    // (Version strings in prose text like "React 19" are fine;
    //  hardcoded esm.sh URLs in the import map section are not)
    const importMapSection = content.split('## Import Map')[1]?.split('##')[0] || '';
    expect(importMapSection).not.toMatch(/esm\.sh\/stable\/react@[\d.]+/);
  });

  it('injection placeholder is outside markdown code fences', () => {
    const skillPath = join(PLUGIN_ROOT, 'skills', 'sell', 'SKILL.md');
    const content = readFileSync(skillPath, 'utf8');

    // The !`command` placeholder must NOT be inside a ``` code fence,
    // because Claude Code's text substitution may not process inside fences
    const importMapSection = content.split('## Import Map')[1]?.split('##')[0] || '';
    const lines = importMapSection.split('\n');
    let inFence = false;
    for (const line of lines) {
      if (line.trim().startsWith('```')) {
        inFence = !inFence;
      }
      if (inFence && line.includes('!`')) {
        throw new Error(
          '!`command` placeholder found inside a code fence: "' + line.trim() + '". ' +
          'Claude Code may not process dynamic injection inside fenced code blocks.'
        );
      }
    }
  });
});

const ALL_SKILLS = ['vibes', 'cloudflare', 'sell', 'launch', 'test', 'upload-dmg', 'design', 'riff'];

describe('SKILL.md frontmatter integrity', () => {
  for (const skill of ALL_SKILLS) {
    it(`${skill}/SKILL.md has valid frontmatter with name field`, () => {
      const skillPath = join(PLUGIN_ROOT, 'skills', skill, 'SKILL.md');
      const content = readFileSync(skillPath, 'utf8');
      const frontmatter = parseSkillFrontmatter(content);
      expect(frontmatter.name).toBe(skill);
    });

    it(`${skill}/SKILL.md has a non-empty description`, () => {
      const skillPath = join(PLUGIN_ROOT, 'skills', skill, 'SKILL.md');
      const content = readFileSync(skillPath, 'utf8');
      const frontmatter = parseSkillFrontmatter(content);
      expect(frontmatter.description).toBeTruthy();
      expect(frontmatter.description.length).toBeGreaterThan(10);
    });
  }
});

describe('SKILL.md source-of-truth consistency', () => {
  // Read the authoritative import map once using the exported function
  const templatePath = join(PLUGIN_ROOT, 'source-templates', 'base', 'template.html');
  const templateHtml = readFileSync(templatePath, 'utf8');
  const authoritativeImports = extractImportMapFromHtml(templateHtml);

  it('sell SKILL.md import map section contains no hardcoded esm.sh URLs', () => {
    const content = readFileSync(join(PLUGIN_ROOT, 'skills', 'sell', 'SKILL.md'), 'utf8');
    // After our edit, the import map section uses !`command` injection, not hardcoded URLs.
    // Verify that there are truly no esm.sh versioned URLs remaining in the section.
    const importMapSection = content.split('## Import Map')[1]?.split('---')[0] || '';
    const esmUrls = importMapSection.match(/esm\.sh\/stable\/\S+/g) || [];
    expect(esmUrls).toHaveLength(0);
  });

  it('OIDC constants in auth-constants.js match expected format', () => {
    // This test guards against accidental changes to the constants file
    const constantsPath = join(PLUGIN_ROOT, 'scripts', 'lib', 'auth-constants.js');
    const constants = readFileSync(constantsPath, 'utf8');

    expect(constants).toContain("OIDC_AUTHORITY = 'https://vibesos.com'");
    expect(constants).toContain("OIDC_CLIENT_ID = '");
    expect(constants).toContain("DEPLOY_API_URL = 'https://share.vibesos.com'");
  });

  it('plugin.json version is a valid semver string', () => {
    const pluginJson = JSON.parse(readFileSync(join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'), 'utf8'));
    expect(pluginJson.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('base template import map has ?external=react,react-dom on @fireproof/core', () => {
    // This is a critical invariant documented in .claude/rules/react-singleton.md
    expect(authoritativeImports['@fireproof/core']).toContain('?external=react,react-dom');
  });
});
