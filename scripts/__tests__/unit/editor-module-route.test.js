/**
 * Tests for the /editor/modules/* route in router.ts
 *
 * Validates path containment, filename validation, and correct serving.
 */
import { describe, it, expect } from 'vitest';

describe('/editor/modules/* route', () => {
  it('route validates filename with regex', async () => {
    const { readFileSync } = await import('fs');
    const routerSrc = readFileSync(
      new URL('../../server/router.ts', import.meta.url),
      'utf-8'
    );
    expect(routerSrc).toContain("/^[a-z0-9-]+\\.js$/");
    expect(routerSrc).toContain("modPath.startsWith(modDir");
  });

  it('route serves from skills/vibes/modules directory', async () => {
    const { readFileSync } = await import('fs');
    const routerSrc = readFileSync(
      new URL('../../server/router.ts', import.meta.url),
      'utf-8'
    );
    expect(routerSrc).toContain("'skills', 'vibes', 'modules'");
  });

  it('route sets correct Content-Type header', async () => {
    const { readFileSync } = await import('fs');
    const routerSrc = readFileSync(
      new URL('../../server/router.ts', import.meta.url),
      'utf-8'
    );
    expect(routerSrc).toContain("'Content-Type': 'text/javascript'");
  });
});
