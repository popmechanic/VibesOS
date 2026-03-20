# TinyBase Vibes Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Fireproof with TinyBase as the data layer for generated Vibes apps, eliminating Connect provisioning (R2, D1, cloud-backend workers, dashboard workers, ECDSA tokens) and replacing it with a single Durable Object class for sync.

**Architecture:** Client apps use TinyBase MergeableStore with OPFS persistence and a reconnecting WebSocket synchronizer. Server-side, a single `AppSyncDO` Durable Object (extending `WsServerDurableObject`) handles per-app CRDT sync with SQLite persistence in fragmented mode. The dispatch worker routes WebSocket upgrades to DOs and static HTML requests to user workers via Workers for Platforms.

**Tech Stack:** TinyBase v8, React 19, Cloudflare Workers + Durable Objects, Workers for Platforms, esm.sh CDN, Pocket ID OIDC

---

## Scope

This plan covers 5 subsystems, each building on the previous:

1. **Dispatch Worker + Durable Object** — The new sync server
2. **Client Template** — New HTML base template with TinyBase boilerplate
3. **Deploy Pipeline** — Simplified deploy-api and CLI deploy script
4. **Builder Agent** — Updated SKILL.md and prompt with TinyBase idioms
5. **Cleanup** — Remove Fireproof infrastructure

Each task produces working, testable software.

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `dispatch-worker/src/index.ts` | Dispatch worker: routes subdomains → user workers, WS upgrades → DOs, auth gate |
| `dispatch-worker/src/do.ts` | `AppSyncDO` class extending `WsServerDurableObject` with fragmented SQLite persistence |
| `dispatch-worker/wrangler.toml` | Worker config with DO binding, KV binding, WfP dispatch binding |
| `dispatch-worker/package.json` | Dependencies: tinybase, hono |
| `dispatch-worker/tsconfig.json` | TypeScript config for Workers |
| `source-templates/base/template.html` | **Modified** — new import map (TinyBase replaces Fireproof), new config shape |
| `skills/vibes/template.delta.html` | **Modified** — TinyBase boilerplate replaces Fireproof OIDC bridge |
| `scripts/__tests__/unit/tinybase-template.test.js` | Unit tests for new template assembly |
| `scripts/__tests__/unit/tinybase-deploy.test.js` | Unit tests for simplified deploy flow |

### Modified Files

| File | Changes |
|------|---------|
| `deploy-api/src/index.ts` | Remove Connect provisioning, remove crypto/connect/ledger-discovery imports, simplify deploy endpoint to skip R2/D1/cloud-backend/dashboard, add `wsUrl` + `public` to KV record, inject `__APP_CONFIG__` instead of `__VIBES_CONFIG__`. **Keep** the Pocket ID registration flow (`registerAppInPocketId`) for private apps. |
| `deploy-api/src/types.ts` | Simplify `ConnectInfo` → remove R2/D1 fields, add `wsUrl`/`public` to `SubdomainRecord` |
| `deploy-api/wrangler.toml` | Remove R2/D1 secrets that are no longer needed |
| `scripts/deploy-cloudflare.js` | Remove Connect result handling, update registry save |
| `scripts/assemble.js` | New config injection (`__APP_CONFIG__` shape), remove Connect URL placeholders |
| `scripts/lib/assembly-utils.js` | Update validation for new template (TinyBase globals instead of Fireproof) |
| `scripts/lib/deploy-files.js` | Remove `fireproof-oidc-bridge.js` bundling |
| `scripts/lib/paths.js` | No changes needed (template paths stay the same) |
| `scripts/merge-templates.js` | No structural changes (delta merge system stays) |
| `scripts/server/handlers/deploy.ts` | Update `__VIBES_CONFIG__` references to `__APP_CONFIG__` |
| `scripts/server/router.ts` | Remove Fireproof/OIDC bridge references |
| `scripts/generate-riff.js` | Remove `useFireproofClerk` import reference |
| `skills/vibes/SKILL.md` | Rewrite data layer section: TinyBase hooks replace Fireproof |
| `skills/riff/template.delta.html` | Replace Fireproof imports with TinyBase (same pattern as vibes delta) |
| `skills/sell/template.delta.html` | Replace `use-fireproof` OIDC bridge imports with TinyBase equivalents |
| `skills/cloudflare/SKILL.md` | Update deploy instructions for simplified flow |
| `skills/launch/prompts/builder.md` | Update builder prompt with TinyBase patterns |
| `scripts/__tests__/unit/bridge-exports.test.js` | Remove or rewrite — tests Fireproof bridge exports |
| `scripts/__tests__/integration/assembly-pipeline.test.js` | Update assertions from `__VIBES_CONFIG__` to `__APP_CONFIG__` |
| `scripts/__tests__/unit/assemble-validation.test.js` | Update if it asserts Fireproof-specific content |

### Files to Remove (Task 5)

| File | Reason |
|------|--------|
| `deploy-api/src/connect.ts` | R2/D1/Connect provisioning no longer needed |
| `deploy-api/src/crypto.ts` | ECDSA session tokens no longer needed |
| `deploy-api/src/ledger-discovery.ts` | Fireproof ledger discovery no longer needed |
| `deploy-api/bundles/cloud-backend.txt` | Connect cloud-backend bundle |
| `deploy-api/bundles/dashboard.txt` | Connect dashboard bundle |
| `deploy-api/scripts/build-connect-bundles.sh` | Connect bundle build script |

**Note:** `bundles/fireproof-oidc-bridge.js` is NOT removed yet — it provides OIDC auth components for private apps. Remove it only after building a lightweight OIDC-only replacement.

---

## Task 1: Dispatch Worker + Durable Object

The new sync infrastructure. A standalone Cloudflare Worker with a `AppSyncDO` Durable Object class that handles all TinyBase CRDT sync.

**Files:**
- Create: `dispatch-worker/src/do.ts`
- Create: `dispatch-worker/src/index.ts`
- Create: `dispatch-worker/wrangler.toml`
- Create: `dispatch-worker/package.json`
- Create: `dispatch-worker/tsconfig.json`

### Step 1.1: Scaffold dispatch-worker project

- [ ] **Create `dispatch-worker/package.json`**

```json
{
  "name": "vibes-sync-dispatcher",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy"
  },
  "dependencies": {
    "tinybase": "^8",
    "hono": "^4"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4",
    "typescript": "^5",
    "wrangler": "^4"
  }
}
```

- [ ] **Create `dispatch-worker/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "esModuleInterop": true
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Install dependencies**

Run: `cd dispatch-worker && npm install`
Expected: node_modules created, lockfile generated

### Step 1.2: Implement AppSyncDO

- [ ] **Create `dispatch-worker/src/do.ts`**

```typescript
import { WsServerDurableObject } from 'tinybase/synchronizers/synchronizer-ws-server-durable-object';
import { createMergeableStore } from 'tinybase/mergeable-store';
import { createDurableObjectSqlStoragePersister } from 'tinybase/persisters/persister-durable-object-sql-storage';

export class AppSyncDO extends WsServerDurableObject {
  createPersister() {
    return createDurableObjectSqlStoragePersister(
      createMergeableStore(),
      this.ctx.storage.sql,
      { mode: 'fragmented' },
    );
  }
}
```

**Why fragmented mode:** Stores each table/row/cell as separate SQLite rows, avoiding the 2MB per-row limit that JSON mode hits with large stores. This is specified in the design doc.

**Verification step:** After `npm install`, confirm the module exists: `ls dispatch-worker/node_modules/tinybase/persisters/persister-durable-object-sql-storage*`. If unavailable in the published TinyBase v8 package, fall back to `createDurableObjectStoragePersister` from `persister-durable-object-storage` with a prefix arg and file an issue upstream.

### Step 1.3: Implement dispatch worker

- [ ] **Create `dispatch-worker/src/index.ts`**

```typescript
import { AppSyncDO } from './do';

export { AppSyncDO };

interface Env {
  APP_SYNC: DurableObjectNamespace;
  APP_META: KVNamespace;
  DISPATCH: { get(name: string): { fetch(request: Request): Promise<Response> } };
  OIDC_JWKS_URL: string;
}

// Minimal JWT verification — extracts and validates RS256 tokens
// Reuses the same JWKS fetch + verify logic from deploy-api/src/index.ts
let cachedJwks: { keys: JsonWebKey[]; fetchedAt: number } | null = null;
const JWKS_TTL = 5 * 60_000;

async function fetchJwks(url: string): Promise<JsonWebKey[]> {
  if (cachedJwks && Date.now() - cachedJwks.fetchedAt < JWKS_TTL) {
    return cachedJwks.keys;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
  const data = (await res.json()) as { keys: JsonWebKey[] };
  cachedJwks = { keys: data.keys, fetchedAt: Date.now() };
  return data.keys;
}

async function verifyJwt(token: string, jwksUrl: string): Promise<boolean> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;

    const header = JSON.parse(atob(parts[0].replace(/-/g, '+').replace(/_/g, '/')));
    if (header.alg !== 'RS256') return false;

    const keys = await fetchJwks(jwksUrl);
    const jwk = header.kid
      ? keys.find((k: any) => k.kid === header.kid)
      : keys.find((k: any) => k.kty === 'RSA');
    if (!jwk) return false;

    const cryptoKey = await crypto.subtle.importKey(
      'jwk', jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false, ['verify']
    );

    const sigBase64 = parts[2].replace(/-/g, '+').replace(/_/g, '/');
    const sigPadded = sigBase64 + '='.repeat((4 - sigBase64.length % 4) % 4);
    const sigBinary = atob(sigPadded);
    const signature = new Uint8Array(sigBinary.length);
    for (let i = 0; i < sigBinary.length; i++) signature[i] = sigBinary.charCodeAt(i);

    const signedData = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', cryptoKey, signature, signedData);
    if (!valid) return false;

    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    const now = Math.floor(Date.now() / 1000);
    return typeof payload.exp === 'number' && payload.exp > now;
  } catch {
    return false;
  }
}

function getSubdomain(request: Request): string {
  const host = new URL(request.url).hostname;
  // my-app.vibesos.com → my-app
  const parts = host.split('.');
  return parts.length > 2 ? parts[0] : host;
}

function getTokenFromRequest(request: Request): string | null {
  // Check query param first (WebSocket can't set headers in browser)
  const url = new URL(request.url);
  const qToken = url.searchParams.get('token');
  if (qToken) return qToken;

  // Check Authorization header
  const auth = request.headers.get('Authorization');
  if (auth?.startsWith('Bearer ')) return auth.slice(7);

  return null;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // WebSocket upgrade → route to Durable Object
    // Sync URL: wss://sync.vibesos.com/my-app
    if (request.headers.get('upgrade')?.toLowerCase() === 'websocket') {
      const appName = url.pathname.slice(1); // "/my-app" → "my-app"
      if (!appName) {
        return new Response('Missing app name in path', { status: 400 });
      }

      // Auth gate for private apps
      // Deploy API writes `app-meta:${name}` keys to the shared REGISTRY_KV namespace
      const appMeta = await env.APP_META.get(`app-meta:${appName}`, { type: 'json' }) as
        { public?: boolean } | null;

      if (appMeta && !appMeta.public) {
        const token = getTokenFromRequest(request);
        if (!token) {
          return new Response('Unauthorized', { status: 401 });
        }
        const valid = await verifyJwt(token, env.OIDC_JWKS_URL);
        if (!valid) {
          return new Response('Unauthorized', { status: 401 });
        }
      }

      const doId = env.APP_SYNC.idFromName(appName);
      return env.APP_SYNC.get(doId).fetch(request);
    }

    // Static assets → route to User Worker via WfP dispatch
    const appName = getSubdomain(request);
    return env.DISPATCH.get(appName).fetch(request);
  },
};
```

### Step 1.4: Create wrangler config

- [ ] **Create `dispatch-worker/wrangler.toml`**

```toml
name = "vibes-sync-dispatcher"
main = "src/index.ts"
compatibility_date = "2025-01-01"
account_id = "e33948793047032de7f5e18ec342a7d1"

[vars]
OIDC_JWKS_URL = "https://vibesos.com/.well-known/jwks.json"

[[durable_objects.bindings]]
name = "APP_SYNC"
class_name = "AppSyncDO"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["AppSyncDO"]

[[kv_namespaces]]
binding = "APP_META"
id = "215847e525304ab29b9127c70672fc86"

# Workers for Platforms dispatch namespace for user workers
[[dispatch_namespaces]]
binding = "DISPATCH"
namespace = "vibes-apps"
```

**Note:** The `APP_META` KV namespace uses the same KV namespace as the deploy API's `REGISTRY_KV` (ID `215847e525304ab29b9127c70672fc86`). The dispatch worker reads keys prefixed with `app-meta:` (written by the deploy API during deploy). The dispatch namespace `vibes-apps` matches the existing WfP namespace.

### Step 1.5: Verify the DO compiles

- [ ] **Run TypeScript check**

Run: `cd dispatch-worker && npx tsc --noEmit`
Expected: No errors (or only expected TinyBase type issues that Wrangler handles)

- [ ] **Verify TinyBase DO persister availability**

Run: `ls dispatch-worker/node_modules/tinybase/persisters/`
Expected: Check for `persister-durable-object-storage` or `persister-durable-object-sql-storage`. Update `do.ts` to use whichever is available, preferring SQL storage with fragmented mode.

### Step 1.6: Commit

- [ ] **Commit**

```bash
git add dispatch-worker/
git commit -m "feat: add TinyBase sync dispatch worker with AppSyncDO"
```

---

## Task 2: Client Template — TinyBase Boilerplate

Replace the Fireproof imports, OIDC bridge, and Connect config with TinyBase MergeableStore, OPFS persistence, and reconnecting WebSocket synchronizer.

**Files:**
- Modify: `source-templates/base/template.html`
- Modify: `skills/vibes/template.delta.html`
- Modify: `scripts/lib/deploy-files.js`
- Create: `scripts/__tests__/unit/tinybase-template.test.js`

### Step 2.1: Write failing test for new template structure

- [ ] **Create `scripts/__tests__/unit/tinybase-template.test.js`**

```javascript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = join(__dirname, '..', '..', '..');

describe('TinyBase template', () => {
  it('base template has TinyBase import map entries', () => {
    const base = readFileSync(join(PLUGIN_ROOT, 'source-templates/base/template.html'), 'utf8');
    expect(base).toContain('"tinybase"');
    expect(base).toContain('"tinybase/mergeable-store"');
    expect(base).toContain('"tinybase/ui-react"');
    expect(base).not.toContain('"use-fireproof"');
    expect(base).not.toContain('"@fireproof/core"');
  });

  it('base template has __APP_CONFIG__ instead of __VIBES_CONFIG__', () => {
    const base = readFileSync(join(PLUGIN_ROOT, 'source-templates/base/template.html'), 'utf8');
    expect(base).toContain('__APP_CONFIG__');
    expect(base).not.toContain('__VIBES_CONFIG__');
  });

  it('vibes delta uses TinyBase hooks not Fireproof', () => {
    const delta = readFileSync(join(PLUGIN_ROOT, 'skills/vibes/template.delta.html'), 'utf8');
    expect(delta).toContain('createMergeableStore');
    expect(delta).toContain('createWsSynchronizer');
    expect(delta).toContain('useApp');
    expect(delta).not.toContain('useFireproof');
    expect(delta).not.toContain('useFireproofClerk');
  });

  it('vibes delta exposes TinyBase hooks as globals', () => {
    const delta = readFileSync(join(PLUGIN_ROOT, 'skills/vibes/template.delta.html'), 'utf8');
    expect(delta).toContain('window.useTable');
    expect(delta).toContain('window.useRow');
    expect(delta).toContain('window.useCell');
    expect(delta).toContain('window.useRowIds');
    expect(delta).toContain('window.useSortedRowIds');
    expect(delta).toContain('window.useAddRowCallback');
  });
});
```

- [ ] **Run test to verify it fails**

Run: `cd scripts && npx vitest run __tests__/unit/tinybase-template.test.js`
Expected: FAIL — current templates use Fireproof

### Step 2.2: Update base template import map

- [ ] **Modify `source-templates/base/template.html`**

Replace the import map section (the `<script type="importmap">` block at ~line 100-117) with:

```html
<script type="importmap">
  {
    "imports": {
      "react": "https://esm.sh/stable/react@19.2.4",
      "react/jsx-runtime": "https://esm.sh/stable/react@19.2.4/jsx-runtime",
      "react/jsx-dev-runtime": "https://esm.sh/stable/react@19.2.4/jsx-dev-runtime",
      "react-dom": "https://esm.sh/stable/react-dom@19.2.4",
      "react-dom/client": "https://esm.sh/stable/react-dom@19.2.4/client",
      "tinybase": "https://esm.sh/tinybase@8?external=react,react-dom",
      "tinybase/mergeable-store": "https://esm.sh/tinybase@8/mergeable-store?external=react,react-dom",
      "tinybase/ui-react": "https://esm.sh/tinybase@8/ui-react?external=react,react-dom",
      "tinybase/persisters/persister-browser": "https://esm.sh/tinybase@8/persisters/persister-browser?external=react,react-dom",
      "tinybase/synchronizers/synchronizer-ws-client": "https://esm.sh/tinybase@8/synchronizers/synchronizer-ws-client?external=react,react-dom",
      "oauth4webapi": "https://esm.sh/stable/oauth4webapi@3.3.0"
    }
  }
</script>
```

**Critical:** All TinyBase imports use `?external=react,react-dom` to prevent the React singleton problem (see `.claude/rules/react-singleton.md`).

Replace the `window.__VIBES_CONFIG__` block (~line 119-136) with:

```html
<script>
  window.__APP_CONFIG__ = {
    appName: "__APP_NAME__",
    wsUrl: "__WS_URL__",
    public: __APP_PUBLIC__,
    oidcAuthority: "__OIDC_AUTHORITY__",
    oidcClientId: "__OIDC_CLIENT_ID__",
    deployApiUrl: "__DEPLOY_API_URL__",
    aiProxyUrl: "__AI_PROXY_URL__"
  };
</script>
```

Remove the `fireproof-oidc-bridge.js` script tag at line 114 (`"use-fireproof": "/fireproof-oidc-bridge.js"`).

Remove the Fireproof Connect-specific window globals (`__VIBES_JOINED__`, `__VIBES_SHARED_LEDGER__`). **Keep** `__VIBES_THEMES__` — it's part of the theme switching system, not Fireproof-specific.

Keep: `SyncStatusDot` (it already reads `window.__VIBES_SYNC_STATUS__` via the `vibes-sync-status-change` event — the delta template writes to this same global, so no changes needed), `useVibesPanelEvents`, theme switching. `SharingBridge` can be stubbed to a no-op for now (sharing will be redesigned for TinyBase's room-based model).

**Important:** The base template also has `window.__VIBES_CONFIG__` references inside the `SharingBridge` and `handlePublicLinkRequest` functions (for `deployApiUrl` and `oidcToken`). Update ALL occurrences of `window.__VIBES_CONFIG__` to `window.__APP_CONFIG__` throughout the base template, not just the declaration block.

### Step 2.3: Rewrite vibes delta template

- [ ] **Modify `skills/vibes/template.delta.html`**

Replace the entire file with the TinyBase boilerplate:

```html
<script type="text/babel" data-type="module">
  import React, { useState, useEffect, useRef, useCallback, useMemo, useContext, createContext, Fragment } from "react";
  import ReactDOMClient from "react-dom/client";
  import { createMergeableStore } from "tinybase/mergeable-store";
  import { createLocalPersister } from "tinybase/persisters/persister-browser";
  import { createWsSynchronizer } from "tinybase/synchronizers/synchronizer-ws-client";
  import { Provider, useTable, useRow, useCell, useValue, useValues, useRowIds, useSortedRowIds, useRowCount, useAddRowCallback, useSetCellCallback, useSetRowCallback, useSetPartialRowCallback, useDelRowCallback, useDelCellCallback, useSetValueCallback } from "tinybase/ui-react";

  // Expose TinyBase hooks as globals for generated app code
  window.useTable = useTable;
  window.useRow = useRow;
  window.useCell = useCell;
  window.useValue = useValue;
  window.useValues = useValues;
  window.useRowIds = useRowIds;
  window.useSortedRowIds = useSortedRowIds;
  window.useRowCount = useRowCount;
  window.useAddRowCallback = useAddRowCallback;
  window.useSetCellCallback = useSetCellCallback;
  window.useSetRowCallback = useSetRowCallback;
  window.useSetPartialRowCallback = useSetPartialRowCallback;
  window.useDelRowCallback = useDelRowCallback;
  window.useDelCellCallback = useDelCellCallback;
  window.useSetValueCallback = useSetValueCallback;

  // --- App Context ---
  const AppContext = createContext(null);
  function useApp() { return useContext(AppContext); }
  window.useApp = useApp;

  // --- Reconnecting WebSocket Synchronizer ---
  function createReconnectingSynchronizer(store, wsUrl, onStatusChange) {
    let synchronizer = null;
    let backoff = 1000;
    let destroyed = false;
    let reconnectTimer = null;

    function scheduleReconnect() {
      if (destroyed || reconnectTimer) return;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, Math.min(backoff *= 2, 30000));
    }

    async function connect() {
      if (destroyed) return;
      try {
        const ws = new WebSocket(wsUrl);
        synchronizer = await createWsSynchronizer(store, ws);
        await synchronizer.startSync();
        backoff = 1000;
        onStatusChange(true);
        ws.addEventListener('error', () => {});
        ws.addEventListener('close', () => {
          onStatusChange(false);
          scheduleReconnect();
        });
      } catch {
        scheduleReconnect();
      }
    }

    connect();
    return () => {
      destroyed = true;
      clearTimeout(reconnectTimer);
      synchronizer?.destroy();
    };
  }

  // __VIBES_APP_CODE__

  // --- App Shell ---
  const config = window.__APP_CONFIG__;

  // Create MergeableStore with unique client ID
  const clientId = localStorage.getItem('tinybase_client_id')
    ?? (localStorage.setItem('tinybase_client_id', crypto.randomUUID()),
       localStorage.getItem('tinybase_client_id'));
  const store = createMergeableStore(clientId);

  // Use shared error components from base template
  const ConfigError = window.ConfigError;
  const LoadingError = window.LoadingError;

  function AppShell() {
    const [isReady, setIsReady] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [user, setUser] = useState(null);

    // Hook must be called unconditionally (Rules of Hooks)
    window.useVibesPanelEvents('Vibes');

    useEffect(() => {
      let destroySync = null;

      async function init() {
        // 1. Local persistence (localStorage fallback — OPFS can be added later)
        const persister = createLocalPersister(store, `tinybase_${config.appName}`);
        await persister.startAutoPersisting([{}, {}]); // [{tables}, {values}] — empty initial content for first-ever load
        setIsReady(true);

        // 2. Sync (if wsUrl configured)
        if (config.wsUrl && !config.wsUrl.startsWith('__')) {
          destroySync = createReconnectingSynchronizer(
            store,
            config.wsUrl,
            (syncing) => {
              setIsSyncing(syncing);
              // Update SyncStatusDot
              window.__VIBES_SYNC_STATUS__ = syncing ? 'synced' : 'reconnecting';
              window.dispatchEvent(new Event('vibes-sync-status-change'));
            },
          );
        }
      }

      init();
      return () => { if (destroySync) destroySync(); };
    }, []);

    const hasOidc = !!(config?.oidcAuthority && !config.oidcAuthority.startsWith('__') &&
      config?.oidcClientId && !config.oidcClientId.startsWith('__'));

    // Public app or no OIDC — render directly
    if (config.public || !hasOidc) {
      return (
        <Provider store={store}>
          <AppContext.Provider value={{ isReady, isSyncing, user: null }}>
            <HiddenMenuWrapper menuContent={<VibesPanel />}>
              <App />
            </HiddenMenuWrapper>
          </AppContext.Provider>
        </Provider>
      );
    }

    // Private app — OIDC gate
    if (!window.OIDCProvider) {
      return <LoadingError error={window.__OIDC_LOAD_ERROR__ || 'OIDC components not available'} />;
    }

    const { OIDCProvider, SignedIn, SignedOut, SignInButton } = window.OIDCComponents;
    const AuthScreen = window.AuthScreen;
    const VibesButton = window.VibesButton;
    const RED = window.RED;

    const AuthGate = () => (
      <AuthScreen title="Sign in to continue" message="This app requires authentication." showCard={true}>
        <SignInButton>
          <VibesButton data-vibes-signin variant={RED} buttonType="form">Sign In</VibesButton>
        </SignInButton>
      </AuthScreen>
    );

    return (
      <Provider store={store}>
        <SyncStatusDot />
        <OIDCProvider authority={config.oidcAuthority} clientId={config.oidcClientId}>
          <SignedOut><AuthGate /></SignedOut>
          <SignedIn>
            <AppContext.Provider value={{ isReady, isSyncing, user }}>
              <HiddenMenuWrapper menuContent={<VibesPanel />}>
                <App />
              </HiddenMenuWrapper>
            </AppContext.Provider>
          </SignedIn>
        </OIDCProvider>
      </Provider>
    );
  }

  // Load OIDC components for private apps.
  // We keep the existing fireproof-oidc-bridge.js deployed as a file — it provides
  // OIDCProvider, SignedIn, SignedOut, SignInButton, useUser, useOIDCContext.
  // We just stop using useFireproof/useFireproofClerk from it (TinyBase handles data).
  // The bridge remains the auth layer until a lighter OIDC-only component is built.
  async function initApp() {
    const hasOidc = !!(config?.oidcAuthority && !config.oidcAuthority.startsWith('__') &&
      config?.oidcClientId && !config.oidcClientId.startsWith('__'));

    if (hasOidc && !config.public) {
      try {
        // Dynamic import of OIDC bridge — still deployed as /fireproof-oidc-bridge.js
        // Only the auth components are used; Fireproof data hooks are ignored.
        const oidcModule = await import("/fireproof-oidc-bridge.js");
        window.OIDCProvider = oidcModule.OIDCProvider;
        window.OIDCComponents = {
          OIDCProvider: oidcModule.OIDCProvider,
          SignedIn: oidcModule.SignedIn,
          SignedOut: oidcModule.SignedOut,
          SignInButton: oidcModule.SignInButton,
          UserButton: oidcModule.UserButton,
        };
        window.SignedIn = oidcModule.SignedIn;
        window.SignedOut = oidcModule.SignedOut;
        window.SignInButton = oidcModule.SignInButton;
        window.UserButton = oidcModule.UserButton;
        window.useUser = oidcModule.useUser;
        window.useOIDCContext = oidcModule.useOIDCContext;
      } catch (err) {
        console.error('Failed to load OIDC components:', err);
        window.__OIDC_LOAD_ERROR__ = err.message || String(err);
      }
    }

    const rootElement = document.getElementById("container");
    ReactDOMClient.createRoot(rootElement).render(<AppShell />);
  }

  initApp();
</script>
```

**Important notes:**
- **OIDC for private apps:** The existing `fireproof-oidc-bridge.js` is kept deployed as a static file and loaded via dynamic import for private apps. Only its auth components (OIDCProvider, SignedIn, etc.) are used — the Fireproof data hooks (useFireproof, useFireproofClerk) are ignored. TinyBase handles all data. This means the bridge JS file is still bundled in deploys but the Fireproof *infrastructure* (Connect, R2, D1) is eliminated. A future task will replace the bridge with a lighter OIDC-only component.
- The `Provider` from `tinybase/ui-react` wraps the entire app, making all TinyBase hooks work.
- `store` is created at module level (outside React) since it's a singleton.
- The import map in the base template does NOT include `use-fireproof` or `@fireproof/core` — the bridge is loaded via absolute path (`/fireproof-oidc-bridge.js`), not via the import map.

### Step 2.4: Keep deploy-files.js OIDC bridge bundling (for now)

- [ ] **Verify `scripts/lib/deploy-files.js` — NO changes needed**

The OIDC bridge (`bundles/fireproof-oidc-bridge.js`) is still deployed as a static file to provide auth components for private apps. The bridge is loaded via absolute path (`/fireproof-oidc-bridge.js`) in the delta template's `initApp()`, NOT via the import map. The import map no longer has a `use-fireproof` entry.

A future task will replace this bridge with a lighter OIDC-only component and remove this bundling.

### Step 2.5: Rebuild merged templates

- [ ] **Run merge-templates**

Run: `bun scripts/merge-templates.js --force`
Expected: Templates regenerated successfully

### Step 2.6: Run new template tests

- [ ] **Run tests**

Run: `cd scripts && npx vitest run __tests__/unit/tinybase-template.test.js`
Expected: All tests PASS

### Step 2.7: Run existing template tests

- [ ] **Verify no regressions in existing tests**

Run: `cd scripts && npx vitest run __tests__/unit/template-merge.test.js`
Expected: PASS (or expected failures if tests assert Fireproof-specific content — update those tests)

### Step 2.8: Commit

- [ ] **Commit**

```bash
git add source-templates/ skills/vibes/template.delta.html scripts/lib/deploy-files.js scripts/__tests__/unit/tinybase-template.test.js
git commit -m "feat: replace Fireproof with TinyBase in client templates"
```

---

## Task 3: Simplified Deploy Pipeline

Update the deploy API and CLI deploy script to use the new `__APP_CONFIG__` shape and skip Connect provisioning.

**Files:**
- Modify: `deploy-api/src/index.ts`
- Modify: `deploy-api/src/types.ts`
- Modify: `scripts/assemble.js`
- Modify: `scripts/deploy-cloudflare.js`
- Modify: `scripts/lib/assembly-utils.js`
- Create: `scripts/__tests__/unit/tinybase-deploy.test.js`

### Step 3.1: Write failing test for new assembly config

- [ ] **Create `scripts/__tests__/unit/tinybase-deploy.test.js`**

```javascript
import { describe, it, expect } from 'vitest';

describe('TinyBase assembly config injection', () => {
  it('injects __APP_CONFIG__ with appName and wsUrl', () => {
    // Simulate what assemble.js does
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
```

- [ ] **Run test to verify it passes** (this tests the concept, not integration)

Run: `cd scripts && npx vitest run __tests__/unit/tinybase-deploy.test.js`
Expected: PASS

### Step 3.2: Update assembly-utils.js validation

- [ ] **Modify `scripts/lib/assembly-utils.js`**

The `validateAssembly` function checks for `export default function` or `function App`. This stays the same — TinyBase apps still export a default App component.

No changes needed unless the validation checks for Fireproof-specific strings. Verify by reading the current code (already read above — confirmed no Fireproof-specific checks).

### Step 3.3: Update assemble.js

- [ ] **Modify `scripts/assemble.js`**

The current assemble.js injects `__VITE_OIDC_AUTHORITY__`, `__VITE_OIDC_CLIENT_ID__`, etc. Update to inject the new `__APP_CONFIG__` placeholders:

Replace the OIDC constant injection block (~lines 57-61) with:

```javascript
// Inject shared constants
output = output.replaceAll('__OIDC_AUTHORITY__', OIDC_AUTHORITY);
output = output.replaceAll('__OIDC_CLIENT_ID__', OIDC_CLIENT_ID);
output = output.replaceAll('__DEPLOY_API_URL__', DEPLOY_API_URL);
output = output.replaceAll('__AI_PROXY_URL__', AI_PROXY_URL);
// App-specific config injected at deploy time by the Deploy API:
// __APP_NAME__, __WS_URL__, __APP_PUBLIC__
```

Remove the old `__VITE_*` replacements. The Deploy API will handle `__APP_NAME__`, `__WS_URL__`, and `__APP_PUBLIC__` injection at deploy time.

### Step 3.4: Update deploy-api types

- [ ] **Modify `deploy-api/src/types.ts`**

Simplify `ConnectInfo` — it's no longer needed for Connect provisioning. Replace with a simpler app metadata type:

```typescript
export interface AppSyncConfig {
  wsUrl: string;
  public: boolean;
}

export interface SubdomainRecord {
  owner: string;
  collaborators?: Array<{ userId: string; email?: string; role?: string }>;
  oidcClientId?: string;
  userGroupId?: string;
  sync?: AppSyncConfig;
  publicInvite?: { token: string; right: string; createdAt: string };
  createdAt?: string;
  updatedAt?: string;
}
```

Remove `ConnectInfo` interface and `connectProvisioned` field.

### Step 3.5: Update deploy-api/src/index.ts

- [ ] **Modify `deploy-api/src/index.ts`**

Key changes:
1. Remove `import { provisionConnect, resetConnect } from "./connect"`
2. Remove `import CLOUD_BACKEND_BUNDLE` and `import DASHBOARD_BUNDLE`
3. Remove `import { discoverLedgerId } from "./ledger-discovery"`
4. Remove the Connect provisioning block (~lines 542-567)
5. Remove Connect URL injection (~lines 570-574)
6. Remove shared ledger injection (~lines 577-597)
7. **Keep** the entire `registerAppInPocketId` function and its usage — private apps still need per-app OIDC clients and user groups in Pocket ID
8. Add new `__APP_CONFIG__` injection:

```typescript
// Inject app config into HTML before deploy
const wsUrl = `wss://sync.vibesos.com/${name}`;
const isPublic = body.public ?? true; // Default to public

if (files["index.html"]) {
  // Use replaceAll since some placeholders may appear in multiple locations
  files["index.html"] = files["index.html"]
    .replaceAll('__APP_NAME__', name)
    .replaceAll('__WS_URL__', wsUrl)
    .replaceAll('__APP_PUBLIC__', String(isPublic));
}

// Write app metadata to KV for the dispatch worker's auth gate
await env.REGISTRY_KV.put(`app-meta:${name}`, JSON.stringify({
  public: isPublic,
  oidcClientId,
}));
```

9. Update the `SubdomainRecord` saved to KV — remove `connectProvisioned` and `connect`, add `sync`:

```typescript
const record: SubdomainRecord = existing
  ? { ...existing, oidcClientId, userGroupId, sync: { wsUrl, public: isPublic }, updatedAt: now }
  : { owner: userId, collaborators: [], oidcClientId, userGroupId, sync: { wsUrl, public: isPublic }, createdAt: now, updatedAt: now };
```

10. Update `DeployResponse` — remove `connect` field, add `wsUrl`:

```typescript
const response: DeployResponse = {
  ok: true,
  url: deployedUrl,
  name,
  wsUrl,
};
```

### Step 3.6: Update deploy-cloudflare.js

- [ ] **Modify `scripts/deploy-cloudflare.js`**

Remove the Connect info handling (~lines 121-131). Update registry save:

```javascript
// Save app metadata to registry
setApp(name, {
  name,
  app: { workerName: name, url: deployedUrl },
  wsUrl: result.wsUrl,
});
```

### Step 3.7: Verify existing deploy tests

- [ ] **Run integration tests**

Run: `cd scripts && npx vitest run __tests__/integration/deploy-cloudflare-connect.test.js`
Expected: May fail due to Connect-specific assertions — update or skip

Run: `cd scripts && npx vitest run __tests__/integration/assembly-pipeline.test.js`
Expected: May fail if it checks for `__VIBES_CONFIG__` — update assertions

### Step 3.8: Commit

- [ ] **Commit**

```bash
git add deploy-api/src/index.ts deploy-api/src/types.ts scripts/assemble.js scripts/deploy-cloudflare.js scripts/lib/assembly-utils.js scripts/__tests__/
git commit -m "feat: simplify deploy pipeline for TinyBase (remove Connect provisioning)"
```

---

## Task 4: Builder Agent — SKILL.md Update

Rewrite the data layer section of the vibes SKILL.md to teach the builder agent TinyBase idioms instead of Fireproof.

**Files:**
- Modify: `skills/vibes/SKILL.md`
- Modify: `skills/cloudflare/SKILL.md` (if it references Connect)
- Modify: `skills/launch/prompts/builder.md` (if it exists and references Fireproof)

### Step 4.1: Read current SKILL.md data section

- [ ] **Read the Fireproof API section**

Read: `skills/vibes/SKILL.md` (search for "Fireproof API" section)
Understand the current patterns to ensure we replace them completely.

### Step 4.2: Rewrite SKILL.md data layer section

- [ ] **Replace the Fireproof API section in `skills/vibes/SKILL.md`**

Replace the entire "Fireproof API" section with the content from the design document's "Generated Code Contract" and "Builder Agent Instructions" sections. Key content:

**Globals Available:**
```
React, useState, useEffect, useRef, useCallback, useMemo,
createContext, useContext,
useApp,
useTable, useRow, useCell, useValue, useValues,
useRowIds, useSortedRowIds, useRowCount,
useAddRowCallback, useSetCellCallback, useSetRowCallback,
useSetPartialRowCallback, useDelRowCallback, useDelCellCallback,
useSetValueCallback
```

**Data Access Patterns:**
- `useApp()` for `isReady`, `isSyncing`, `user`
- TinyBase hooks directly as globals for all data operations
- Fine-grained reactivity: each component calls its own hooks
- Pagination via `useSortedRowIds` with offset/limit (PAGE_SIZE 25)
- `useAddRowCallback` for adding rows (with deps array)
- MapCell pattern for toggles/increments via `useSetCellCallback`
- `useSetPartialRowCallback` over `useSetRowCallback`
- Values for app-level state, Tables for collections

**What Generated Code Must Never Contain:**
- `import` statements
- `createStore`, `createMergeableStore`, `createPersister`, `createSynchronizer`
- WebSocket URLs, auth logic, connection handling
- Direct `store.*` method calls — use callback hooks exclusively
- Schema definitions or store configuration

**Common Mistakes (new section):**
- Using `useTable` on large tables instead of `useRowIds` + `useCell` in children
- Missing deps in `useAddRowCallback` causing stale closures
- Using `useSetRowCallback` which replaces the entire row (use `useSetPartialRowCallback`)
- Putting objects/arrays in cells (cell-level LWW loses concurrent edits)

### Step 4.3: Update Core Rules in SKILL.md

- [ ] **Update references throughout SKILL.md**

Search and replace:
- `useFireproofClerk` → explain that data hooks are TinyBase globals
- `useFireproof` → `useApp()` for status, TinyBase hooks for data
- `database.put` / `database.del` → explain callback hooks pattern
- `useLiveQuery` → `useTable`, `useRowIds`, `useRow`
- `useDocument` → `useRow` + `useCell`
- Any `doc._id` references → row IDs are auto-generated strings
- `useAllDocs` → `useRowIds` + map over children

### Step 4.4: Update Import Map Note

- [ ] **Update the Import Map Note in Pre-Flight Check**

Replace the current note about `use-fireproof` → `/fireproof-oidc-bridge.js` with:

> **Import Map Note**: The import map points TinyBase modules to esm.sh CDN URLs with `?external=react,react-dom` to prevent the React singleton problem. All TinyBase hooks are exposed as globals by the template — generated code uses them directly without imports.

### Step 4.5: Update cloudflare SKILL.md if needed

- [ ] **Read and update `skills/cloudflare/SKILL.md`**

If it references Connect provisioning, update to reflect the simplified deploy flow.

### Step 4.6: Commit

- [ ] **Commit**

```bash
git add skills/vibes/SKILL.md skills/cloudflare/SKILL.md
git commit -m "feat: rewrite builder instructions for TinyBase data layer"
```

---

## Task 5: Cleanup — Remove Fireproof Infrastructure

Remove files that are no longer needed.

**Files:**
- Delete: `deploy-api/src/connect.ts`
- Delete: `deploy-api/src/crypto.ts`
- Delete: `deploy-api/src/ledger-discovery.ts`
- Delete: `deploy-api/bundles/cloud-backend.txt`
- Delete: `deploy-api/bundles/dashboard.txt`
- Delete: `deploy-api/scripts/build-connect-bundles.sh`
- Modify: `deploy-api/wrangler.toml` (remove unused secrets)
- Modify: `CLAUDE.md` (update references)
- Modify: `scripts/__tests__/unit/bridge-exports.test.js` (remove or rewrite)
- Modify: `scripts/__tests__/integration/assembly-pipeline.test.js` (update assertions)
- Modify: `scripts/server/handlers/deploy.ts` (update config references)
- Modify: `scripts/server/router.ts` (remove Fireproof references)

**Note:** `bundles/fireproof-oidc-bridge.js` is NOT deleted — it provides OIDC auth components for private apps.

### Step 5.1: Delete Connect provisioning files

- [ ] **Delete files**

```bash
git rm deploy-api/src/connect.ts
git rm deploy-api/src/crypto.ts
git rm deploy-api/src/ledger-discovery.ts
git rm -f deploy-api/src/__tests__/ledger-discovery.test.ts  # if exists
git rm deploy-api/bundles/cloud-backend.txt
git rm deploy-api/bundles/dashboard.txt
git rm deploy-api/scripts/build-connect-bundles.sh
```

### Step 5.2: Update deploy-api/wrangler.toml

- [ ] **Remove unused secrets comments**

Remove comments for `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `SERVICE_API_KEY` since they're no longer used.

### Step 5.3: Update CLAUDE.md

- [ ] **Update references in `CLAUDE.md`**

Key changes:
- Remove "Connect provisioning" from deploy workflow description
- Update "Non-Obvious Files" table — remove connect.ts, crypto.ts, bridge entries
- Add dispatch-worker entries
- Update "Resetting Connect State" section → replace with "Resetting App Sync State" (simpler — just delete the DO)
- Update "Fireproof API Reference" section → "TinyBase API Reference"
- Remove `docs/fireproof.txt` reference
- Update import map description

### Step 5.4: Update riff delta template

- [ ] **Modify `skills/riff/template.delta.html`**

This delta imports `useFireproofClerk` at line 4. Replace with the same TinyBase boilerplate pattern as the vibes delta (TinyBase imports, hook globals, MergeableStore setup, Provider). The riff delta is structurally similar to the vibes delta — apply the same changes.

### Step 5.4b: Assess sell delta template

- [ ] **Read and assess `skills/sell/template.delta.html`**

The sell delta has multi-tenant SaaS patterns that are deeply intertwined with Fireproof's ledger concept. This is a larger rewrite and is flagged as a separate follow-up task. For now, verify it still compiles after the base template import map changes. If it breaks, add a `TODO: TinyBase migration` comment at the top and skip it.

### Step 5.4c: Update server-side files with Fireproof references

- [ ] **Modify `scripts/server/handlers/deploy.ts`**

Update Connect info handling (`result.connect`, `connect.apiUrl`, `connect.cloudUrl`) to use `result.wsUrl` instead. Remove references to Connect provisioning results.

- [ ] **Modify `scripts/server/router.ts`**

Remove Connect-specific references. **Keep** the serving route for `/fireproof-oidc-bridge.js` — it provides auth components for private apps.

- [ ] **Modify `scripts/generate-riff.js`**

Remove `useFireproofClerk` import reference (line ~68).

### Step 5.4d: Update test files

- [ ] **Modify `scripts/__tests__/unit/bridge-exports.test.js`**

This tests Fireproof bridge exports. Either remove or rewrite to test the bridge still provides OIDC components.

- [ ] **Modify `scripts/__tests__/integration/assembly-pipeline.test.js`**

Update assertions from `__VIBES_CONFIG__` to `__APP_CONFIG__`.

### Step 5.5: Run full test suite

- [ ] **Run all tests**

Run: `cd scripts && npx vitest run`
Expected: All tests pass (or known failures from tests that need updating)

### Step 5.6: Verify template build pipeline

- [ ] **Rebuild all templates**

```bash
bun scripts/build-components.js --force
bun scripts/build-design-tokens.js --force
bun scripts/merge-templates.js --force
```

Expected: All three commands succeed

### Step 5.7: Verify assembly works end-to-end

- [ ] **Assemble a test fixture**

```bash
bun scripts/assemble.js scripts/__tests__/fixtures/minimal.jsx /tmp/tinybase-test.html
```

Expected: Output file created, contains `__APP_CONFIG__`, contains TinyBase imports, does NOT contain Fireproof references

### Step 5.8: Commit

- [ ] **Commit**

```bash
git add deploy-api/src/ deploy-api/wrangler.toml deploy-api/bundles/ CLAUDE.md skills/riff/ skills/sell/ scripts/server/ scripts/generate-riff.js scripts/__tests__/
git commit -m "chore: remove Fireproof Connect infrastructure, update remaining references"
```

---

## Post-Implementation Notes

### Not in Scope (follow-up work)

1. **Lightweight OIDC-only component** — Private apps currently work by keeping the existing `fireproof-oidc-bridge.js` deployed and only using its auth components (OIDCProvider, SignedIn, SignedOut, etc.). A future task should build a lighter OIDC component using `oauth4webapi` directly, removing the Fireproof bundle dependency entirely. This will also need to pass JWT tokens to the WebSocket connection for the dispatch worker's auth gate.

2. **OPFS persistence** — The template currently uses `createLocalPersister` (localStorage, ~5-10MB cap). Upgrading to OPFS with `createOpfsPersister` removes the size limit but needs browser compatibility testing (Firefox private browsing, older Safari). Add as enhancement after core integration works.

3. **Sell/SaaS template** — The sell template has multi-tenant patterns deeply tied to Fireproof's ledger concept. TinyBase uses room-based sync (one DO per app), so multi-tenant routing needs redesign. This is a separate task.

4. **Deploy the dispatch worker** — The dispatch worker needs to be deployed to Cloudflare and DNS configured for `sync.vibesos.com`. This requires infrastructure work (CF dashboard, DNS records).

5. **Editor server** — The editor server (`scripts/server.ts`) may need updates for TinyBase-aware preview. Check if it references Fireproof directly.

6. **SharingBridge** — The current sharing/invite system is deeply tied to Fireproof's ledger concept. With TinyBase, sharing is simpler (all users in the same DO room), but the invite flow and UI need redesign.
