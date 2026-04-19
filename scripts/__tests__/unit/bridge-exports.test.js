/**
 * Structural tests for the oidc-bridge module (OIDC auth only)
 * and TinyBase import map entries in templates.
 *
 * The bridge still provides OIDC components for private app auth.
 * Fireproof data/sync imports have been replaced by TinyBase.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '../../..');
const BRIDGE_PATH = resolve(ROOT, 'bundles/oidc-bridge.js');
const BASE_TEMPLATE_PATH = resolve(ROOT, 'source-templates/base/template.html');

const bridgeSource = readFileSync(BRIDGE_PATH, 'utf8');
const baseTemplate = readFileSync(BASE_TEMPLATE_PATH, 'utf8');

describe('oidc-bridge exports', () => {
  it('exports OIDCProvider component', () => {
    expect(bridgeSource).toContain('export function OIDCProvider');
  });

  it('exports SignedIn component', () => {
    expect(bridgeSource).toContain('export function SignedIn');
  });

  it('exports SignedOut component', () => {
    expect(bridgeSource).toContain('export function SignedOut');
  });

  it('exports SignInButton component', () => {
    expect(bridgeSource).toContain('export function SignInButton');
  });

  it('exports UserButton component', () => {
    expect(bridgeSource).toContain('export function UserButton');
  });

  it('exports useUser hook', () => {
    expect(bridgeSource).toContain('export function useUser');
  });

  it('exports useOIDCContext hook', () => {
    expect(bridgeSource).toContain('export function useOIDCContext');
  });

  it('does NOT import from @fireproof/core', () => {
    expect(bridgeSource).not.toContain('from "@fireproof/core"');
    expect(bridgeSource).not.toContain("from '@fireproof/core'");
  });
});

describe('TinyBase import map entries', () => {
  it('base template has TinyBase entries', () => {
    expect(baseTemplate).toContain('"tinybase"');
    expect(baseTemplate).toContain('"tinybase/mergeable-store"');
    expect(baseTemplate).toContain('"tinybase/ui-react"');
  });

  it('base template does NOT have Fireproof import map entries', () => {
    expect(baseTemplate).not.toContain('"use-fireproof"');
    expect(baseTemplate).not.toContain('"@fireproof/core"');
  });
});

describe('generated templates contain TinyBase import map entries', () => {
  const templatePaths = [
    { rel: 'skills/vibes/templates/index.html', name: 'vibes' },
    { rel: 'skills/riff/templates/index.html', name: 'riff' },
    { rel: 'skills/factory/templates/unified.html', name: 'factory' },
  ];

  for (const { rel, name } of templatePaths) {
    it(`${name} template has TinyBase entries`, () => {
      const html = readFileSync(resolve(ROOT, rel), 'utf8');
      expect(html).toContain('"tinybase"');
      expect(html).toContain('"tinybase/ui-react"');
    });

    it(`${name} template does NOT have Fireproof import map entries`, () => {
      const html = readFileSync(resolve(ROOT, rel), 'utf8');
      expect(html).not.toContain('"use-fireproof"');
      expect(html).not.toContain('"@fireproof/core"');
    });
  }
});

describe('OIDC bridge dynamic import uses absolute path', () => {
  // Guards against the leftover `await import("use-fireproof")` stub that
  // crashed tenant apps at load. The bridge is served at /oidc-bridge.js
  // by the Deploy API — see scripts/lib/deploy-files.js.
  const sources = [
    'skills/vibes/template.delta.html',
    'skills/riff/template.delta.html',
    'skills/factory/template.delta.html',
    'skills/vibes/templates/index.html',
    'skills/riff/templates/index.html',
    'skills/factory/templates/unified.html',
  ];

  for (const rel of sources) {
    it(`${rel} imports the OIDC bridge by path, not "use-fireproof"`, () => {
      const html = readFileSync(resolve(ROOT, rel), 'utf8');
      expect(html).not.toMatch(/import\(\s*["']use-fireproof["']\s*\)/);
    });
  }
});
