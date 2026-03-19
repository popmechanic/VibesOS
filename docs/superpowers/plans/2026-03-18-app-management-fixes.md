# App Management Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the split-state "current app" architecture, fix rename persistence, fix gallery staleness, and fix screenshot capture.

**Architecture:** Remove `ctx.currentApp` from the server. Every HTTP and WebSocket request includes the app name from the client. Add a server-side rename endpoint, refresh the gallery on navigation, and vendor `dom-to-image-more` locally.

**Tech Stack:** Bun, TypeScript (server), vanilla JS (editor.html), vitest (tests)

**Spec:** `docs/superpowers/specs/2026-03-18-app-management-bugs-design.md`

**Task ordering note:** Task 1 makes `currentAppDir`/`resolveAppJsxPath` accept an explicit `appName` param. Since the new signatures handle `undefined` gracefully, callers that still pass no second arg continue to work (they get `null` back, same as when `ctx.currentApp` was null). Tasks 2-5 update all callers to pass the app name explicitly. Task 6 then removes `ctx.currentApp` from the TypeScript interface — safe because all callers are already updated. This ordering keeps the code compilable after every commit.

---

### Task 1: Update `app-context.js` — Add `appName` Parameter

**Files:**
- Modify: `scripts/server/app-context.js:11-18`
- Modify: `scripts/__tests__/unit/app-context.test.js:20-29`

- [ ] **Step 1: Update the test to use the new signature**

In `scripts/__tests__/unit/app-context.test.js`, change the `currentAppDir` tests to pass `appName` as a second argument instead of relying on `ctx.currentApp`:

```javascript
describe('currentAppDir', () => {
  it('returns null when no app name given', () => {
    const ctx = { appsDir: '/tmp/apps' };
    expect(currentAppDir(ctx)).toBeNull();
    expect(currentAppDir(ctx, null)).toBeNull();
    expect(currentAppDir(ctx, '')).toBeNull();
  });

  it('returns the app directory path when app name given', () => {
    const ctx = { appsDir: '/tmp/apps' };
    expect(currentAppDir(ctx, 'my-app')).toBe('/tmp/apps/my-app');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd scripts && npx vitest run __tests__/unit/app-context.test.js --reporter=verbose`
Expected: FAIL — `currentAppDir` still reads `ctx.currentApp`, ignores the second argument.

- [ ] **Step 3: Update `currentAppDir` and `resolveAppJsxPath`**

In `scripts/server/app-context.js`, change both functions:

```javascript
export function currentAppDir(ctx, appName) {
  if (!appName) return null;
  return join(ctx.appsDir, appName);
}

export function resolveAppJsxPath(ctx, appName) {
  const dir = currentAppDir(ctx, appName);
  return join(dir || ctx.projectRoot, 'app.jsx');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd scripts && npx vitest run __tests__/unit/app-context.test.js --reporter=verbose`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/server/app-context.js scripts/__tests__/unit/app-context.test.js
git commit -m "refactor: make currentAppDir accept explicit appName parameter"
```

---

### Task 2: Update `router.ts` — HTTP Handlers Read `?app=` Parameter

**Files:**
- Modify: `scripts/server/router.ts:188-193` (`serveAppJsx`)
- Modify: `scripts/server/router.ts:195-198` (`serveThemes`)
- Modify: `scripts/server/router.ts:242-257` (`serveAppFrame`)
- Modify: `scripts/server/router.ts:372-374` (`editorAppExists`)
- Modify: `scripts/server/router.ts:529-548` (`editorLoadApp`)
- Modify: `scripts/server/router.ts:550-562` (`editorSaveApp`)
- Modify: `scripts/server/router.ts:579-588` (`editorWriteApp`)
- Modify: `scripts/server/router.ts:629-658` (route table)
- Modify: `scripts/server/config.ts:211` (`getRecommendedThemeIds` signature)

- [ ] **Step 1: Update `getRecommendedThemeIds` in `config.ts`**

Change the function signature and first line:

```typescript
export function getRecommendedThemeIds(ctx, appName?: string) {
  const appDir = currentAppDir(ctx, appName);
```

- [ ] **Step 2: Update `serveAppJsx` to read `?app=` param**

Change signature from `(ctx: ServerContext)` to `(ctx: ServerContext, url: URL)` and read app name:

```typescript
async function serveAppJsx(ctx: ServerContext, url: URL): Promise<Response> {
  const appName = sanitizeAppName(url.searchParams.get('app') || '');
  const appPath = resolveAppJsxPath(ctx, appName || undefined);
  const file = Bun.file(appPath);
  if (!(await file.exists())) return new Response('// app.jsx not yet generated\n', { headers: { 'Content-Type': 'text/javascript', ...corsHeaders() } });
  return new Response(file, { headers: { 'Content-Type': 'text/javascript', ...corsHeaders() } });
}
```

- [ ] **Step 3: Update `serveThemes` to pass `?app=` to `getRecommendedThemeIds`**

```typescript
function serveThemes(ctx: ServerContext, url: URL): Response {
  const appName = sanitizeAppName(url.searchParams.get('app') || '');
  const recommended = getRecommendedThemeIds(ctx, appName || undefined);
  const result = ctx.themes.map((t: any) => ({ ...t, recommended: recommended.has(t.id), colors: ctx.themeColors[t.id] || null }));
  return json(result);
}
```

- [ ] **Step 4: Update `serveAppFrame` to read `?app=` and pass to `assembleAppFrame`**

```typescript
function serveAppFrame(ctx: ServerContext, url: URL): Response {
  const appName = sanitizeAppName(url.searchParams.get('app') || '');
  const appDir = currentAppDir(ctx, appName || undefined);
  const appPath = appDir ? join(appDir, 'app.jsx') : null;
  if (!appPath || !existsSync(appPath)) {
    return new Response(`<!DOCTYPE html>
<html><head><style>
  body { margin: 0; display: flex; align-items: center; justify-content: center;
         height: 100vh; font-family: system-ui; color: #888; background: inherit; }
</style></head>
<body><p>Waiting for app to be generated...</p></body></html>`, {
      headers: { 'Content-Type': 'text/html', ...corsHeaders() },
    });
  }
  const assembled = assembleAppFrame(ctx, appName);
  return new Response(assembled, { headers: { 'Content-Type': 'text/html', ...corsHeaders() } });
}
```

- [ ] **Step 5: Update `editorAppExists` to read `?app=`**

```typescript
function editorAppExists(ctx: ServerContext, url: URL): Response {
  const appName = sanitizeAppName(url.searchParams.get('app') || '');
  return json({ exists: existsSync(resolveAppJsxPath(ctx, appName || undefined)) });
}
```

- [ ] **Step 6: Update `editorLoadApp` — remove `ctx.currentApp` write**

In `editorLoadApp` (line 529-548), remove `ctx.currentApp = name;` (line 546). Keep everything else (copy-on-write for examples, the `{ ok: true, currentApp: name }` response field is fine to keep as data).

- [ ] **Step 7: Update `editorSaveApp` — remove `ctx.currentApp` write, use `?app=` for source**

```typescript
function editorSaveApp(ctx: ServerContext, url: URL): Response {
  const name = sanitizeAppName(url.searchParams.get('name') || '');
  if (!name) return new Response('Missing name', { status: 400, headers: corsHeaders() });
  const appName = sanitizeAppName(url.searchParams.get('app') || '') || undefined;
  const appSrc = resolveAppJsxPath(ctx, appName);
  if (!existsSync(appSrc)) return new Response('No app.jsx to save', { status: 404, headers: corsHeaders() });
  const dest = join(ctx.appsDir, name);
  mkdirSync(dest, { recursive: true });
  if (resolve(appSrc) !== resolve(join(dest, 'app.jsx'))) {
    copyFileSync(appSrc, join(dest, 'app.jsx'));
  }
  return json({ ok: true });
}
```

- [ ] **Step 8: Update `editorWriteApp` to read `?app=`**

```typescript
async function editorWriteApp(ctx: ServerContext, req: Request, url: URL): Promise<Response> {
  try {
    const appName = sanitizeAppName(url.searchParams.get('app') || '') || undefined;
    const appPath = resolveAppJsxPath(ctx, appName);
    const body = await readBodyWithLimit(req, MAX_APP_WRITE_SIZE);
    writeFileSync(appPath, body.toString('utf-8'));
    return json({ ok: true });
  } catch (err: any) {
    return json({ error: err.message }, err.status || 400);
  }
}
```

- [ ] **Step 9: Update the route table to pass `url` to updated handlers**

In the route table (line 629-658), update these entries:

```typescript
case 'GET /app.jsx':                   return serveAppJsx(ctx, url);
case 'GET /themes':                    return serveThemes(ctx, url);
case 'GET /app-frame':                return serveAppFrame(ctx, url);
case 'GET /editor/app-exists':        return editorAppExists(ctx, url);
case 'POST /editor/apps/write':       return editorWriteApp(ctx, req, url);
```

- [ ] **Step 10: Verify build and existing tests pass**

Run: `cd scripts && npx vitest run --reporter=verbose`
Expected: All tests PASS.

- [ ] **Step 11: Commit**

```bash
git add scripts/server/router.ts scripts/server/config.ts
git commit -m "refactor: HTTP handlers read app name from query param, remove ctx.currentApp writes"
```

---

### Task 3: Update `assembleAppFrame` and `handleGenerate`

**Files:**
- Modify: `scripts/server/handlers/generate.ts:342-373` (`assembleAppFrame`)
- Modify: `scripts/server/handlers/generate.ts:19` (`handleGenerate` signature)
- Modify: `scripts/server/handlers/generate.ts:28-37` (auto-save previous app)
- Modify: `scripts/server/handlers/generate.ts:45,221,223,333,335` (remaining call sites)

- [ ] **Step 1: Change `assembleAppFrame` to accept `appName` parameter**

In `scripts/server/handlers/generate.ts`, update the function at line 342:

```typescript
export function assembleAppFrame(ctx, appName?: string) {
  const templatePath = TEMPLATES.vibesBasic;
  if (!existsSync(templatePath)) {
    return `<html><body><h1>Template not found</h1><p>${templatePath}</p></body></html>`;
  }

  let template = readFileSync(templatePath, 'utf-8');

  const appDir = currentAppDir(ctx, appName);
  if (!appDir) {
    return `<html><body><h1>No app active</h1></body></html>`;
  }
  // ... rest unchanged
```

- [ ] **Step 2: Update `handleGenerate` signature and auto-save block**

Add `previousApp` parameter to the end of the signature:

```typescript
export async function handleGenerate(ctx: ServerContext, onEvent: EventCallback, userPrompt: string, themeId: string | undefined, model: string | undefined, reference: any = null, useAI: boolean = false, previousApp: string | undefined = undefined) {
```

Update lines 28-37 to use `previousApp` instead of `ctx.currentApp`:

```typescript
  if (previousApp) {
    try {
      const prevDir = currentAppDir(ctx, previousApp);
      const prevIndexPath = join(prevDir, 'index.html');
      const assembled = assembleAppFrame(ctx, previousApp);
      writeFileSync(prevIndexPath, assembled);
      console.log(`[Generate] Auto-saved index.html for "${previousApp}"`);
    } catch (e) {
      console.warn(`[Generate] Auto-save failed for "${previousApp}": ${e.message}`);
    }
  }
```

- [ ] **Step 3: Replace remaining `currentAppDir(ctx)` calls with local `appDir`**

In `handleGenerate`, the local `appDir` is created at line 43: `const appDir = join(ctx.appsDir, appName)`. Replace these calls:
- Line 221: `cwd: currentAppDir(ctx)` → `cwd: appDir`
- Line 223: `sanitizeAppJsx(currentAppDir(ctx))` → `sanitizeAppJsx(appDir)`
- Line 333: `cwd: currentAppDir(ctx)` → `cwd: appDir`
- Line 335: `sanitizeAppJsx(currentAppDir(ctx))` → `sanitizeAppJsx(appDir)`

Also remove `ctx.currentApp = appName;` at line 45.

- [ ] **Step 4: Verify tests pass**

Run: `cd scripts && npx vitest run --reporter=verbose`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/server/handlers/generate.ts
git commit -m "refactor: assembleAppFrame accepts appName, handleGenerate uses local appDir"
```

---

### Task 4: Update Remaining Subprocess Handlers

**Files:**
- Modify: `scripts/server/handlers/chat.ts:23` (signature + 3 call sites)
- Modify: `scripts/server/handlers/theme.ts:62,277` (signatures + 7 call sites across 3 functions)
- Modify: `scripts/server/handlers/deploy.ts:22` (signature + 1 call site)
- Modify: `scripts/server/handlers/create-theme.ts:152` (signature + 1 call site)

- [ ] **Step 1: Update `handleChat`**

Add `appName` parameter to the end of the signature:

```typescript
export async function handleChat(ctx: ServerContext, onEvent: EventCallback, message: string, effects: string[] = [], animationId: string | null = null, model: string | undefined, reference: any = null, skillId: string | null = null, appName: string | undefined = undefined) {
```

Replace the 3 call sites:
- Line 25: `currentAppDir(ctx) || ctx.projectRoot` → `currentAppDir(ctx, appName) || ctx.projectRoot`
- Line 220: `cwd: currentAppDir(ctx) || ctx.projectRoot` → `cwd: currentAppDir(ctx, appName) || ctx.projectRoot`
- Line 222: `sanitizeAppJsx(currentAppDir(ctx) || ctx.projectRoot)` → `sanitizeAppJsx(currentAppDir(ctx, appName) || ctx.projectRoot)`

- [ ] **Step 2: Update `handleThemeSwitch` and its internal helpers**

`theme.ts` has 7 `currentAppDir(ctx)` call sites across 3 functions. All three need `appName` threaded through:

**`handleThemeSwitch`** (line 62) — add `appName` parameter:
```typescript
export async function handleThemeSwitch(ctx: ServerContext, onEvent: EventCallback, themeId: string, model: string | undefined, appName: string | undefined = undefined) {
```
Replace `currentAppDir(ctx)` at line 79 with `currentAppDir(ctx, appName)`.
Thread `appName` to the internal helper calls (lines 94, 96).

**`handleThemeSwitchMultiPass`** (internal, not exported) — add `appName` parameter to its signature. Replace `currentAppDir(ctx)` at lines 179, 206 with `currentAppDir(ctx, appName)`.

**`handleThemeSwitchLegacy`** (internal, not exported) — add `appName` parameter to its signature. Replace `currentAppDir(ctx)` at lines 220, 269, 271 with `currentAppDir(ctx, appName)`.

Total: 7 call sites across 3 functions.

- [ ] **Step 3: Update `handlePaletteTheme`**

Add `appName` parameter:

```typescript
export async function handlePaletteTheme(ctx: ServerContext, onEvent: EventCallback, colors: Record<string, string>, appName: string | undefined = undefined) {
```

Replace `currentAppDir(ctx)` at line 283 with `currentAppDir(ctx, appName)`.

- [ ] **Step 4: Update `handleDeploy`**

Add `appName` parameter:

```typescript
export async function handleDeploy(ctx: ServerContext, onEvent: EventCallback, target: string, name: string, token?: string, appName: string | undefined = undefined) {
```

Replace `currentAppDir(ctx)` at line 61 with `currentAppDir(ctx, appName)`.

- [ ] **Step 5: Update `handleSaveTheme`**

Add `appName` parameter to `handleSaveTheme` in `create-theme.ts`. Replace `resolveAppJsxPath(ctx)` at line 158 with `resolveAppJsxPath(ctx, appName)`.

- [ ] **Step 6: Verify tests pass**

Run: `cd scripts && npx vitest run --reporter=verbose`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add scripts/server/handlers/chat.ts scripts/server/handlers/theme.ts scripts/server/handlers/deploy.ts scripts/server/handlers/create-theme.ts
git commit -m "refactor: all subprocess handlers accept explicit appName parameter"
```

---

### Task 5: Update `ws.ts` — Pass App Name Through to Handlers

**Files:**
- Modify: `scripts/server/ws.ts:113-204`

- [ ] **Step 1: Update all dispatch calls to pass `msg.app`**

In the WS message handler switch statement, update each case:

```typescript
case 'chat':
  await handleChat(ctx, onEvent, msg.message, msg.effects || [], msg.animationId || null, msg.model, msg.reference || null, msg.skillId || null, msg.app || undefined);
  break;

case 'generate':
  await handleGenerate(ctx, onEvent, msg.prompt, msg.themeId, msg.model, msg.reference || null, !!msg.useAI, msg.previousApp || undefined);
  break;

case 'theme':
  await handleThemeSwitch(ctx, onEvent, msg.themeId, msg.model, msg.app || undefined);
  break;

case 'deploy':
  await handleDeploy(ctx, onEvent, msg.target, msg.name, undefined, msg.app || undefined);
  break;

case 'save_theme':
  // ... name validation unchanged ...
  await handleSaveTheme(ctx, onEvent, name, msg.model, msg.app || undefined);
  break;

case 'palette_theme':
  await handlePaletteTheme(ctx, onEvent, msg.colors, msg.app || undefined);
  break;
```

- [ ] **Step 2: Update `save_app` handler to use `msg.app` as source**

`msg.app` is the source app (which `app.jsx` to copy from), `msg.name` is the destination name (where to save it):

```typescript
case 'save_app': {
  const name = (msg.name || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 63);
  if (!name) {
    onEvent({ type: 'error', message: 'App name is required' });
    break;
  }
  const sourceApp = msg.app || undefined;
  const appSrc = resolveAppJsxPath(ctx, sourceApp);
  if (!existsSync(appSrc)) {
    onEvent({ type: 'error', message: 'No app.jsx to save' });
    break;
  }
  const dest = join(ctx.appsDir, name);
  mkdirSync(dest, { recursive: true });
  if (resolve(appSrc) !== resolve(join(dest, 'app.jsx'))) {
    copyFileSync(appSrc, join(dest, 'app.jsx'));
  }
  onEvent({ type: 'app_saved', name });
  console.log(`[Save] Saved app to ${dest}`);
  break;
}
```

Note: removed `ctx.currentApp = name;`.

- [ ] **Step 3: Verify tests pass**

Run: `cd scripts && npx vitest run --reporter=verbose`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add scripts/server/ws.ts
git commit -m "refactor: WS handler passes app name to all subprocess handlers, removes ctx.currentApp"
```

---

### Task 6: Remove `ctx.currentApp` from `ServerContext`

Now that all callers have been updated (Tasks 2-5), it's safe to remove the field from the TypeScript interface.

**Files:**
- Modify: `scripts/server/config.ts:17-37` (remove `currentApp` from interface)
- Modify: `scripts/server/config.ts` (remove initialization in `loadConfig()`)

- [ ] **Step 1: Remove `currentApp` from the `ServerContext` interface**

In `scripts/server/config.ts`, remove line 32 (`currentApp: string | null;`) from the `ServerContext` interface.

- [ ] **Step 2: Remove `currentApp` initialization**

Search for where `currentApp: null` is set in the `loadConfig()` return object (around line 100-130 in config.ts). Remove it.

- [ ] **Step 3: Verify no remaining references to `ctx.currentApp`**

```bash
cd scripts && grep -r 'ctx\.currentApp' server/ --include='*.ts' --include='*.js'
```

Expected: No matches.

- [ ] **Step 4: Run all tests**

Run: `cd scripts && npx vitest run --reporter=verbose`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/server/config.ts
git commit -m "refactor: remove currentApp from ServerContext — all callers now use explicit appName"
```

---

### Task 7: Add Rename Endpoint to `router.ts`

**Files:**
- Modify: `scripts/server/router.ts` (add `editorRenameApp` function + route)

- [ ] **Step 1: Add the rename handler function**

Add this function to `router.ts` after `editorSaveApp`. Also add imports: `renameSync` from `'fs'`, and `loadRegistry`, `saveRegistry` from `'../lib/registry.js'`.

```typescript
function editorRenameApp(ctx: ServerContext, url: URL): Response {
  const from = sanitizeAppName(url.searchParams.get('from') || '');
  const to = sanitizeAppName(url.searchParams.get('to') || '');
  if (!from || !to) return new Response('Missing from/to', { status: 400, headers: corsHeaders() });
  if (from === to) return json({ ok: true, name: to });

  const srcDir = join(ctx.appsDir, from);
  const destDir = join(ctx.appsDir, to);
  if (!existsSync(srcDir)) return new Response('App not found', { status: 404, headers: corsHeaders() });
  if (existsSync(destDir)) return new Response('Destination already exists', { status: 409, headers: corsHeaders() });

  renameSync(srcDir, destDir);

  // Update deployment registry if this app was deployed
  try {
    const reg = loadRegistry();
    if (reg.apps[from]) {
      reg.apps[to] = { ...reg.apps[from], name: to };
      delete reg.apps[from];
      saveRegistry(reg);
    }
  } catch (e) {
    console.warn(`[Rename] Registry update failed: ${e.message}`);
  }

  return json({ ok: true, name: to });
}
```

- [ ] **Step 2: Add the route to the route table**

In the switch statement (after the `POST /editor/apps/save` line), add:

```typescript
case 'POST /editor/apps/rename':     return editorRenameApp(ctx, url);
```

- [ ] **Step 3: Verify tests pass**

Run: `cd scripts && npx vitest run --reporter=verbose`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add scripts/server/router.ts
git commit -m "feat: add POST /editor/apps/rename endpoint with registry update"
```

---

### Task 8: Vendor `dom-to-image-more` and Add Route

**Files:**
- Create: `assets/vendor/dom-to-image-more.min.js`
- Modify: `scripts/server/router.ts` (add vendor route)

- [ ] **Step 1: Download `dom-to-image-more`**

```bash
mkdir -p assets/vendor
curl -o assets/vendor/dom-to-image-more.min.js https://cdn.jsdelivr.net/npm/dom-to-image-more@3/dist/dom-to-image-more.min.js
```

- [ ] **Step 2: Add route to serve it**

In `router.ts`, add a route in the switch statement:

```typescript
case 'GET /vendor/dom-to-image-more.min.js': {
  const vendorPath = join(ctx.projectRoot, 'assets', 'vendor', 'dom-to-image-more.min.js');
  const vendorFile = Bun.file(vendorPath);
  return new Response(vendorFile, { headers: { 'Content-Type': 'text/javascript', ...corsHeaders() } });
}
```

- [ ] **Step 3: Commit**

```bash
git add assets/vendor/dom-to-image-more.min.js scripts/server/router.ts
git commit -m "feat: vendor dom-to-image-more locally for WKWebView screenshot capture"
```

---

### Task 9: Update `editor.html` — Client Sends App Name with All Requests

**Files:**
- Modify: `skills/vibes/templates/editor.html`

This is the largest task. All changes are in `editor.html`.

- [ ] **Step 1: Update `loadPreview()` and `reloadPreview()` to send `?app=`**

At line 4439, change `loadPreview()`:

```javascript
function loadPreview() {
    const frame = document.getElementById('previewFrame');
    const appParam = currentAppName ? 'app=' + encodeURIComponent(currentAppName) + '&' : '';
    frame.src = '/app-frame?' + appParam + 't=' + Date.now();
}
```

At line 4463, in `reloadPreview()`, change the iframe src similarly:

```javascript
const appParam = currentAppName ? 'app=' + encodeURIComponent(currentAppName) + '&' : '';
frame.src = '/app-frame?' + appParam + 't=' + Date.now();
```

- [ ] **Step 2: Update `versionPush()` to send `?app=`**

At line 4360, change:

```javascript
const appParam = currentAppName ? '?app=' + encodeURIComponent(currentAppName) : '';
const res = await fetch('/app.jsx' + appParam);
```

- [ ] **Step 3: Add `app` field to ALL WebSocket messages**

Find every `ws.send(JSON.stringify({...}))` call and add the `app` field. Use `grep` for `ws.send(JSON.stringify` to find all locations. The complete list:

**`save_app` messages (3 locations):**
- `autoSaveApp()` (line 4105): add `app: currentAppName`
- `doSave()` (line 4130): add `app: currentAppName`
- `loadAndRedeploy()` (line 3313): add `app: currentAppName`

**`chat` message:** Add `app: currentAppName` to the payload object (near line 5347).

**`generate` message:** Add `previousApp: currentAppName` (so server can auto-save previous app).

**`theme` (theme_switch) message:** Add `app: currentAppName`.

**`deploy` messages (2 locations):**
- The "publish update" shortcut (near line 4558): add `app: currentAppName`
- The full deploy dialog (near line 4573): add `app: currentAppName`

**`save_theme` message:** Add `app: currentAppName`.

**`palette_theme` message:** Add `app: currentAppName`.

- [ ] **Step 4: Simplify `useExistingApp()`**

Replace the function at line 4350:

```javascript
function useExistingApp() {
    if (currentAppName) {
        loadSavedApp(currentAppName);
    } else {
        document.getElementById('chatMessages').innerHTML = '';
        setPhase('edit');
        loadPreview();
        versionPush();
    }
}
```

- [ ] **Step 5: Update `navigateHome()` to refresh gallery**

At line 3512, change:

```javascript
function navigateHome() {
    closeEditSettings();
    setPhase('generate');
    checkExistingApps();
}
```

- [ ] **Step 6: Update `promptRenameApp()` to use rename endpoint**

Replace the function at line 4192:

```javascript
function promptRenameApp() {
    promptAppName((newName) => {
      if (!newName || newName === currentAppName) return;
      const oldName = currentAppName;
      fetch('/editor/apps/rename?from=' + encodeURIComponent(oldName) + '&to=' + encodeURIComponent(newName), { method: 'POST' })
        .then(r => {
          if (!r.ok) throw new Error(r.status === 409 ? 'An app with that name already exists' : 'Rename failed');
          return r.json();
        })
        .then(() => {
          currentAppName = newName;
          updateAppNameDisplay(currentPhase === 'edit');
        })
        .catch(err => {
          alert('Rename failed: ' + err.message);
        });
    });
}
```

- [ ] **Step 7: Update `captureScreenshot()` — local vendor + silent param**

Change the function signature at line 4205:

```javascript
async function captureScreenshot(silent) {
```

Change the CDN URL at line 4231:

```javascript
script.src = '/vendor/dom-to-image-more.min.js';
```

Change the error handler at line 4258-4259:

```javascript
} catch (err) {
    console.warn('[Screenshot] Capture failed:', err);
    if (!silent) addMessage('system', 'Screenshot capture failed — thumbnail may not update.');
}
```

Update the `deploy_complete` handler (line 3814) to pass `silent=true`:

```javascript
captureScreenshot(true);
```

- [ ] **Step 8: Update theme fetch to include app name**

Find where `/themes` is fetched (search for `fetch('/themes')` or `fetch('/themes?`) and add the app parameter:

```javascript
const appParam = currentAppName ? '?app=' + encodeURIComponent(currentAppName) : '';
fetch('/themes' + appParam)
```

- [ ] **Step 9: Verify the editor loads and works**

Start the server: `VIBES_ROOT=$(pwd) bun scripts/server.ts --mode=editor`

Manual test checklist:
1. Page loads without errors
2. Generate a new app — preview shows correctly
3. Save the app — screenshot is captured
4. Rename via header input — old name gone, new name shows
5. Go home — gallery refreshes and shows the app
6. Click app card — correct app loads
7. Click "Continue current app" — correct app loads
8. Chat message — changes apply to correct app

- [ ] **Step 10: Commit**

```bash
git add skills/vibes/templates/editor.html
git commit -m "feat: client-authoritative state — editor sends app name with all requests

Eliminates ctx.currentApp desync bugs. Adds gallery refresh on
navigateHome, rename via server endpoint, local dom-to-image-more
for screenshots, and silent mode for deploy screenshots."
```

---

### Task 10: Final Verification

- [ ] **Step 1: Run all tests**

```bash
cd scripts && npm test
```

Expected: All unit, integration, and fixture tests pass.

- [ ] **Step 2: Manual E2E test**

Start the server and verify all test scenarios from the spec's Testing table:

| Change | Verification |
|--------|-------------|
| Client-authoritative state | Generate app, restart server, verify preview loads correctly |
| Rename | Generate, rename, go home, verify old name gone, new name in gallery |
| Gallery refresh | Generate, go home, verify new app in gallery without reload |
| useExistingApp | Save, go home, click "Continue current app", verify correct app |
| Screenshot | Save, verify `~/.vibes/apps/{name}/screenshot.png` exists |
| Generate flow | Generate new app, verify preview shows new app |
| Chat/theme | Open app, chat or switch theme, verify changes to correct app |

- [ ] **Step 3: Commit any test fixes if needed**
