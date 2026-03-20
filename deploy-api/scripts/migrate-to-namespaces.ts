/**
 * One-time migration: move existing workers from standalone CF Workers
 * to dispatch namespaces, and clean up Workers Domain entries.
 *
 * Usage: bun deploy-api/scripts/migrate-to-namespaces.ts [--phase 2|3|4] [--dry-run]
 *
 * Phase 2: Migrate app workers to vibes-apps namespace (ALREADY DONE — included for completeness)
 * Phase 3: Migrate dashboard workers via Deploy API redeploy
 * Phase 4: Delete orphaned Workers Domain entries
 *
 * Run without --phase to execute all phases sequentially.
 */

const ACCOUNT_ID = 'e33948793047032de7f5e18ec342a7d1';
const APP_NAMESPACE = 'vibes-apps';
const CONNECT_NAMESPACE = 'vibes-connect';
const DEPLOY_API_URL = 'https://share.vibesos.com';

function getToken(): string {
  const configPath = `${process.env.HOME}/.wrangler/config/default.toml`;
  const content = require('fs').readFileSync(configPath, 'utf-8');
  const match = content.match(/oauth_token\s*=\s*"([^"]+)"/);
  if (!match) throw new Error('No oauth_token found in wrangler config');
  return match[1];
}

const TOKEN = getToken();
const headers = { Authorization: `Bearer ${TOKEN}` };
const dryRun = process.argv.includes('--dry-run');

async function cfApi(path: string, opts?: RequestInit) {
  return fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...opts,
    headers: { ...headers, ...(opts?.headers || {}) },
  });
}

async function getOidcToken(): Promise<string> {
  const { getAccessToken } = await import('../../scripts/lib/cli-auth.js');
  const { OIDC_AUTHORITY, OIDC_CLIENT_ID } = await import('../../scripts/lib/auth-constants.js');
  const tokens = await getAccessToken({ authority: OIDC_AUTHORITY, clientId: OIDC_CLIENT_ID });
  return tokens.accessToken;
}

// Phase 2: Migrate app workers (ALREADY DONE — kept for reference)
async function migrateAppWorkers() {
  console.log('\n=== Phase 2: App Workers ===');
  console.log('App workers were already migrated during the smoke test (44/44 OK).');
  console.log('Skipping Phase 2.\n');
}

// Phase 3: Migrate dashboard workers via Deploy API redeploy
async function migrateDashboardWorkers() {
  console.log('\n=== Phase 3: Migrate Dashboard Workers ===\n');

  const domainsRes = await cfApi(`/accounts/${ACCOUNT_ID}/workers/domains`);
  const domainsData = await domainsRes.json() as any;
  const connectDomains = (domainsData.result || []).filter((d: any) =>
    d.hostname.startsWith('connect-') && d.hostname.endsWith('.vibesos.com')
  );

  console.log(`Found ${connectDomains.length} dashboard Workers Domains to migrate`);

  // Verify naming convention invariant — skip non-standard legacy workers
  const nonStandard: string[] = [];
  const standardDomains = connectDomains.filter((domain: any) => {
    const expected = `fireproof-dashboard-${domain.hostname.split('.')[0].replace(/^connect-/, '')}`;
    if (domain.service !== expected) {
      nonStandard.push(`${domain.hostname} → ${domain.service} (expected ${expected})`);
      return false;
    }
    return true;
  });
  if (nonStandard.length > 0) {
    console.log(`Skipping ${nonStandard.length} non-standard naming:`);
    nonStandard.forEach(s => console.log(`  ${s}`));
  }
  // Replace connectDomains with only standard ones
  const domainsToMigrate = standardDomains;

  // Get OIDC token for Deploy API calls
  console.log('Getting OIDC token...');
  const authToken = await getOidcToken();

  let migrated = 0, skipped = 0, failed = 0;

  for (const domain of domainsToMigrate) {
    const appName = domain.hostname.split('.')[0].replace(/^connect-/, '');
    console.log(`\n[${appName}] Triggering redeploy...`);

    try {
      // Fetch the app's HTML from the existing app worker
      const appRes = await fetch(`https://${appName}.vibesos.com/`);
      if (!appRes.ok) {
        console.log(`  SKIP: App not reachable (${appRes.status})`);
        skipped++;
        continue;
      }
      const html = await appRes.text();

      if (dryRun) {
        console.log(`  DRY RUN: Would redeploy ${appName} (${html.length} bytes)`);
        migrated++;
        continue;
      }

      // Call the Deploy API to redeploy — this re-provisions the dashboard
      // worker to the namespace with full secret bindings
      const deployRes = await fetch(`${DEPLOY_API_URL}/deploy`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: appName,
          files: { 'index.html': html },
        }),
      });
      const deployData = await deployRes.json() as any;

      if (!deployData.ok) {
        console.error(`  FAIL: Deploy API error: ${deployData.error}`);
        failed++;
        continue;
      }

      // Verify the dashboard is reachable through the dispatcher
      const verifyRes = await fetch(`https://connect-${appName}.vibesos.com/api`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      console.log(`  Verify: connect-${appName}.vibesos.com/api → ${verifyRes.status}`);

      console.log(`  OK: Redeployed to namespace`);
      migrated++;
    } catch (e) {
      console.error(`  FAIL: ${e instanceof Error ? e.message : String(e)}`);
      failed++;
    }
  }

  console.log(`\nPhase 3 complete: ${migrated} migrated, ${skipped} skipped, ${failed} failed`);
}

// Phase 4: Clean up Workers Domain entries
async function cleanup() {
  console.log('\n=== Phase 4: Cleanup Workers Domains ===\n');

  const domainsRes = await cfApi(`/accounts/${ACCOUNT_ID}/workers/domains`);
  const domainsData = await domainsRes.json() as any;
  const allDomains = (domainsData.result || []).filter((d: any) =>
    d.hostname.endsWith('.vibesos.com')
  );

  // These should be kept (infrastructure workers, not in namespace)
  const keep = new Set([
    'vibesos.com',           // pocket-id
    'share.vibesos.com',     // vibes-deploy-api
    'install.vibesos.com',   // install-vibesos (also has Workers Route)
    'ai.vibesos.com',        // vibes-ai-proxy
  ]);

  const toDelete = allDomains.filter((d: any) => !keep.has(d.hostname));
  console.log(`Total vibesos.com Workers Domains: ${allDomains.length}`);
  console.log(`To keep: ${keep.size} (${[...keep].join(', ')})`);
  console.log(`To delete: ${toDelete.length}`);

  if (dryRun) {
    console.log('\nDRY RUN — would delete:');
    for (const d of toDelete) {
      console.log(`  ${d.hostname} → ${d.service}`);
    }
    return;
  }

  let deleted = 0, errors = 0;
  for (const d of toDelete) {
    try {
      const res = await cfApi(`/accounts/${ACCOUNT_ID}/workers/domains/${d.id}`, {
        method: 'DELETE',
      });
      const data = await res.json() as any;
      if (data.success) {
        deleted++;
      } else {
        console.error(`  FAIL: ${d.hostname}: ${JSON.stringify(data.errors)}`);
        errors++;
      }
    } catch (e) {
      console.error(`  FAIL: ${d.hostname}: ${e instanceof Error ? e.message : String(e)}`);
      errors++;
    }
  }

  console.log(`\nDeleted ${deleted} Workers Domains, ${errors} errors`);

  // Show remaining
  const remaining = await cfApi(`/accounts/${ACCOUNT_ID}/workers/domains`);
  const remainingData = await remaining.json() as any;
  const stillPresent = (remainingData.result || []).filter((d: any) =>
    d.hostname.endsWith('.vibesos.com')
  );
  console.log(`\nRemaining Workers Domains: ${stillPresent.length}`);
  for (const d of stillPresent) {
    console.log(`  ${d.hostname} → ${d.service}`);
  }
}

// Main
const phase = process.argv.find(a => a.startsWith('--phase='))?.split('=')[1];
(async () => {
  try {
    if (!phase || phase === '2') await migrateAppWorkers();
    if (!phase || phase === '3') await migrateDashboardWorkers();
    if (!phase || phase === '4') await cleanup();
  } catch (e) {
    console.error('Migration failed:', e);
    process.exit(1);
  }
})();
