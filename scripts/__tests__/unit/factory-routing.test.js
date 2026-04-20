/**
 * Regression guard for the factory template's getRouteInfo() router.
 *
 * The factory skill declared path-based tenancy in the 2026-03-28 billing
 * design spec, but getRouteInfo()'s production branch only inspected
 * hostname. That meant `phase6-launch.vibesos.com/marcuse` fell into the
 * apex-hostname branch and returned { route: 'landing' }, so anonymous
 * visitors on a tenant path saw the marketing hero instead of the
 * tenant subtree's AuthGate. These asserts pin the current path-based
 * behavior so the migration cannot silently regress.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '../../..');
const TEMPLATE = readFileSync(
  resolve(ROOT, 'skills/factory/templates/unified.html'),
  'utf8'
);

describe('factory getRouteInfo — path-based tenancy', () => {
  it('derives firstSegment from window.location.pathname', () => {
    expect(TEMPLATE).toMatch(
      /window\.location\.pathname\.split\(['"]\/['"]\)\.filter\(Boolean\)\[0\]/
    );
  });

  it('routes /admin path to the admin app', () => {
    expect(TEMPLATE).toContain("firstSegment === 'admin'");
    expect(TEMPLATE).toMatch(
      /firstSegment === ['"]admin['"].*route: ['"]admin['"]/
    );
  });

  it('routes non-empty non-admin path to the tenant app', () => {
    expect(TEMPLATE).toMatch(
      /if \(firstSegment\) return \{ route: ['"]tenant['"], subdomain: firstSegment \}/
    );
  });

  it('still supports subdomain-based tenancy for backwards compat', () => {
    expect(TEMPLATE).toMatch(/hostname\.endsWith\(`\.\$\{APP_DOMAIN\}`\)/);
    expect(TEMPLATE).toMatch(
      /hostname\.slice\(0, -\(APP_DOMAIN\.length \+ 1\)\)/
    );
  });

  it('apex hostname with no path still renders the landing page', () => {
    // Within the hostname === APP_DOMAIN branch, the final return (after
    // the firstSegment checks) must fall back to landing.
    const apexBranch = TEMPLATE.match(
      /if \(hostname === APP_DOMAIN[^{]*\{[\s\S]*?\n\s{8}\}/
    );
    expect(apexBranch).not.toBeNull();
    expect(apexBranch[0]).toContain("return { route: 'landing', subdomain: null }");
  });
});
