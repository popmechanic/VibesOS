#!/usr/bin/env node
/**
 * Vibes App Assembler
 *
 * Inserts JSX app code into the template to create a complete HTML file.
 *
 * Usage:
 *   bun scripts/assemble.js <app.jsx> [output.html]
 *
 * Example:
 *   bun scripts/assemble.js app.jsx index.html
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { TEMPLATES } from './lib/paths.js';
import { createBackup } from './lib/backup.js';
import { OIDC_AUTHORITY, OIDC_CLIENT_ID, DEPLOY_API_URL, AI_PROXY_URL } from './lib/auth-constants.js';
import { APP_PLACEHOLDER, validateAssembly, loadAndValidateTemplate, checkForbiddenPatterns } from './lib/assembly-utils.js';
import { stripForTemplate } from './lib/strip-code.js';


async function main() {
  // Parse args
  const appPath = process.argv[2];
  const outputPath = process.argv[3] || 'index.html';

  if (!appPath) {
    throw new Error('Usage: bun scripts/assemble.js <app.jsx> [output.html]');
  }

  // Resolve paths
  const templatePath = TEMPLATES.vibesBasic;
  const resolvedAppPath = resolve(appPath);
  const resolvedOutputPath = resolve(outputPath);

  // Check app file exists
  if (!existsSync(resolvedAppPath)) {
    throw new Error(`App file not found: ${resolvedAppPath}`);
  }

  // Load and validate template (checks existence + placeholder)
  const template = loadAndValidateTemplate(templatePath, readFileSync);
  const appCode = readFileSync(resolvedAppPath, 'utf8').trim();

  console.log('Assembling (App config will be injected at deploy time)');

  // Strip imports/exports/destructuring that conflict with the template.
  // The vibes delta imports React hooks via ES import (added in 0e59bd2),
  // so React destructuring in app code causes duplicate declarations.
  const cleanedAppCode = stripForTemplate(appCode, { stripReactHooks: true });

  // Check for common builder mistakes
  const assemblyWarnings = checkForbiddenPatterns(cleanedAppCode);
  if (assemblyWarnings.length > 0) {
    console.warn('Assembly warnings:');
    assemblyWarnings.forEach(w => console.warn(`  - ${w}`));
  }

  // Assemble: insert app code at placeholder
  let output = template.replace(APP_PLACEHOLDER, cleanedAppCode);

  // Inject hardcoded OIDC constants (same for every app) — replaceAll for templates
  // with multiple occurrences of the same placeholder.
  output = output.replaceAll('__OIDC_AUTHORITY__', OIDC_AUTHORITY);
  output = output.replaceAll('__OIDC_CLIENT_ID__', OIDC_CLIENT_ID);
  output = output.replaceAll('__DEPLOY_API_URL__', DEPLOY_API_URL);
  output = output.replaceAll('__AI_PROXY_URL__', AI_PROXY_URL);

  // TODO(tinybase-deploy): TEMPORARY — inject safe defaults for TinyBase app config
  // so assembled HTML works standalone without the Deploy API replacing placeholders.
  // REMOVE THIS BLOCK after the updated Deploy API is deployed to Cloudflare and
  // merged to main. The Deploy API should handle __APP_NAME__, __WS_URL__, and
  // __APP_PUBLIC__ injection at deploy time — see deploy-api/src/index.ts.
  // Tracked in: docs/superpowers/plans/2026-03-20-tinybase-vibes-integration.md
  // (Post-Implementation Note #4: "Deploy the dispatch worker")
  const appName = resolvedOutputPath.match(/([^/]+)\/index\.html$/)?.[1]
    || resolvedAppPath.match(/([^/]+)\.jsx$/)?.[1]
    || 'vibes-app';
  output = output.replaceAll('__APP_NAME__', appName);
  output = output.replaceAll('__WS_URL__', '__WS_URL__');  // left as placeholder = sync skipped
  output = output.replaceAll('__APP_PUBLIC__', 'true');     // default to public (no auth gate)

  // Validate output
  const validationErrors = validateAssembly(output, appCode);
  if (validationErrors.length > 0) {
    const lines = ['Assembly failed:'];
    validationErrors.forEach(e => lines.push(`  - ${e}`));
    // Provide specific guidance based on error type
    const fixes = validationErrors.map(e => {
      if (e.includes('empty')) return 'Ensure app.jsx has content';
      if (e.includes('Placeholder')) return 'Template may be corrupted - rebuild with: bun scripts/merge-templates.js --force';
      if (e.includes('App component')) return 'Add "export default function App()" or "function App()"';
      if (e.includes('script tags')) return 'Check for unclosed <script> tags in template';
      return null;
    }).filter(Boolean);
    if (fixes.length > 0) {
      lines.push(`\nFix: ${fixes.join('; ')}`);
    }
    throw new Error(lines.join('\n'));
  }

  // Backup existing file if present
  const backupPath = createBackup(resolvedOutputPath);
  if (backupPath) {
    console.log(`Backed up: ${backupPath}`);
  }

  // Write output
  writeFileSync(resolvedOutputPath, output);
  console.log(`Created: ${resolvedOutputPath}`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
