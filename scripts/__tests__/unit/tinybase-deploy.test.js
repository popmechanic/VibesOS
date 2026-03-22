import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = join(__dirname, '..', '..', '..');

describe('TinyBase assembly config injection', () => {
  it('injects __APP_CONFIG__ with appName and wsUrl', () => {
    const template = `window.__APP_CONFIG__ = {
    appName: "__APP_NAME__",
    wsUrl: "__WS_URL__",
    public: __APP_PUBLIC__
  };`;
    const output = template
      .replace('__APP_NAME__', 'test-app')
      .replace('__WS_URL__', 'wss://sync.vibesos.com/test-app')
      .replace('__APP_PUBLIC__', 'true');
    expect(output).toContain('appName: "test-app"');
    expect(output).toContain('wsUrl: "wss://sync.vibesos.com/test-app"');
    expect(output).toContain('public: true');
  });
});

describe('deploy script public link provisioning', () => {
  it('deploy script calls provisionInviteLink', () => {
    const script = readFileSync(join(PLUGIN_ROOT, 'scripts/deploy-cloudflare.js'), 'utf8');
    expect(script).toContain('provisionInviteLink');
  });

  it('provision-invite-link helper calls Deploy API', () => {
    const helper = readFileSync(join(PLUGIN_ROOT, 'scripts/lib/provision-invite-link.js'), 'utf8');
    expect(helper).toContain('/public-link');
    expect(helper).toContain('/status/');
  });
});
