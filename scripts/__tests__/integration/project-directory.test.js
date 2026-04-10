/**
 * Integration tests for the full project directory flow.
 *
 * Covers: vibes.json init, assembly in a project folder, backup placement,
 * registry recent-project persistence, and deploy-info merging.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execSync } from 'child_process';

const SCRIPTS_DIR = join(__dirname, '..', '..');

let workDir;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'vibes-project-test-'));
});

afterEach(() => {
  if (workDir) rmSync(workDir, { recursive: true, force: true });
  delete process.env.VIBES_HOME;
});

describe('project directory flow', () => {
  it('initVibesJson creates correct structure', async () => {
    const { initVibesJson, readVibesJson } = await import('../../lib/vibes-json.js');
    const projectDir = join(workDir, 'my-test-app');
    mkdirSync(projectDir);

    initVibesJson(projectDir);

    // vibes.json created with slugified name
    const config = readVibesJson(projectDir);
    expect(config.name).toBe('my-test-app');

    // .vibes directory created
    expect(existsSync(join(projectDir, '.vibes'))).toBe(true);
  });

  it('assembly works in a project folder', () => {
    const projectDir = join(workDir, 'assemble-test');
    mkdirSync(projectDir);

    // Create vibes.json
    writeFileSync(join(projectDir, 'vibes.json'), JSON.stringify({ name: 'assemble-test' }));

    // Write a minimal app.jsx
    writeFileSync(join(projectDir, 'app.jsx'), `
      function App() {
        return <div>Hello World</div>;
      }
    `);

    // Run assembly
    execSync(
      `bun ${join(SCRIPTS_DIR, 'assemble.js')} app.jsx index.html`,
      { cwd: projectDir, stdio: 'pipe' }
    );

    // Verify output
    expect(existsSync(join(projectDir, 'index.html'))).toBe(true);
    const html = readFileSync(join(projectDir, 'index.html'), 'utf8');
    expect(html).toContain('Hello World');
    expect(html).not.toContain('__VIBES_APP_CODE__');
  });

  it('backup goes to .vibes/backups/ in project folder', async () => {
    vi.resetModules();
    const { createBackup } = await import('../../lib/backup.js');

    const projectDir = join(workDir, 'backup-test');
    mkdirSync(projectDir);
    writeFileSync(join(projectDir, 'vibes.json'), JSON.stringify({ name: 'backup-test' }));
    writeFileSync(join(projectDir, 'index.html'), '<html>v1</html>');

    const backupPath = createBackup(join(projectDir, 'index.html'));
    expect(backupPath).toContain(join('.vibes', 'backups'));
    expect(existsSync(backupPath)).toBe(true);
  });

  it('recent projects persist across registry loads', async () => {
    process.env.VIBES_HOME = workDir;
    vi.resetModules();
    const registry = await import('../../lib/registry.js');

    const projectDir = join(workDir, 'persist-test');
    mkdirSync(projectDir);

    registry.addRecentProject({
      path: projectDir,
      name: 'persist-test',
      displayName: 'Persist Test',
    });

    // Reload module to simulate restart
    vi.resetModules();
    const registry2 = await import('../../lib/registry.js');
    const recents = registry2.getRecentProjects();
    expect(recents).toHaveLength(1);
    expect(recents[0].path).toBe(projectDir);
    expect(recents[0].displayName).toBe('Persist Test');
  });

  it('vibes.json writeVibesJson merges deploy info', async () => {
    const { initVibesJson, writeVibesJson, readVibesJson } = await import('../../lib/vibes-json.js');
    const projectDir = join(workDir, 'deploy-test');
    mkdirSync(projectDir);

    initVibesJson(projectDir);

    // Simulate deploy writing back
    writeVibesJson(projectDir, {
      deploy: {
        url: 'https://deploy-test.vibes.diy',
        workerName: 'vibes-app-deploy-test',
        deployedAt: '2026-04-09T19:30:00Z',
      },
    });

    const config = readVibesJson(projectDir);
    expect(config.name).toBe('deploy-test');
    expect(config.deploy.url).toBe('https://deploy-test.vibes.diy');
  });
});
