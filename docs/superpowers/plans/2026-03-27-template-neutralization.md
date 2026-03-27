# Template Neutralization & Auth Code Separation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all forced visual styles from templates, neutralize component class aesthetics, theme-ify the error boundary, and extract auth code so public apps ship zero auth infrastructure.

**Architecture:** Four workstreams: (1) strip global forced styles from `design-tokens.js`, (2) neutralize component classes in same file, (3) replace hardcoded colors in error boundary with theme tokens, (4) extract auth code from vibes delta into a composable module injected only for private apps. All template changes flow through the existing build pipeline (`build-design-tokens.js` → `merge-templates.js`).

**Tech Stack:** JavaScript/CSS, Bun build scripts, Vitest tests

**Spec:** `docs/superpowers/specs/2026-03-27-template-neutralization-design.md`

---

### Task 1: Remove Global Forced Styles from design-tokens.js

**Files:**
- Modify: `scripts/lib/design-tokens.js:76-82` (TOKEN_CATALOG vibes-grid)
- Modify: `scripts/lib/design-tokens.js:195-240` (VIBES_THEME_CSS body/frame/grid/grid-background)
- Modify: `scripts/lib/design-tokens.js:859-869` (DOC_CATEGORIES)

- [ ] **Step 1: Remove `--grid-size` and `--grid-color` from TOKEN_CATALOG**

These tokens only existed for `body::after` which we're removing. Keep the `--content-grid-*` tokens as available ingredients.

In `scripts/lib/design-tokens.js`, replace the `'vibes-grid'` entry:

```javascript
  'vibes-grid': {
    '--content-grid-bg': '#2a2a2a',
    '--content-grid-color': 'rgba(255, 255, 255, 0.3)',
    '--content-grid-size': '32px',
  },
```

- [ ] **Step 2: Strip forced styles from VIBES_THEME_CSS**

Replace lines 195-240 of `VIBES_THEME_CSS` (from `body {` through the `.grid-background` rule) with a minimal reset:

```javascript
export const VIBES_THEME_CSS = `
      body {
        margin: 0;
        padding: 0;
      }
      #container {
        position: relative;
        z-index: 2;
        width: 100%;
        min-height: 100vh;
        padding: 20px;
      }

      /* Neo-Brutalist Button — uses --comp-* tokens so LLM overrides don't affect wrapper buttons */
```

This removes:
- `body` background, font-family, color
- `body::before` (rounded frame)
- `body::after` (grid overlay)
- `.vibes-content, .grid-background` rule

- [ ] **Step 3: Remove 'vibes-grid' from DOC_CATEGORIES if grid tokens are no longer documented**

Actually, keep `'vibes-grid'` in DOC_CATEGORIES — the `--content-grid-*` tokens are still available. No change needed here.

- [ ] **Step 4: Run the build to verify no syntax errors**

Run: `cd /Users/marcusestes/Websites/VibesCLI/VibesOS && bun scripts/build-design-tokens.js --force`
Expected: Generates `build/design-tokens.css` and `build/design-tokens.txt` without errors.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/design-tokens.js
git commit -m "refactor: remove forced global styles from template (body frame, grid, background)"
```

---

### Task 2: Neutralize Component Classes

**Files:**
- Modify: `scripts/lib/design-tokens.js:242-852` (VIBES_THEME_CSS component classes)

This task removes aesthetic opinions from all component classes: `text-transform: uppercase`, `letter-spacing: 0.05em`, brutalist `box-shadow`, `transform: translate()`, and hardcoded `font-family`.

- [ ] **Step 1: Neutralize `.btn` class (lines ~242-278)**

Replace the `.btn` and variant rules with:

```css
      /* Button — uses --comp-* tokens so LLM overrides don't affect wrapper buttons */
      .btn {
        display: inline-block;
        padding: 1rem 2rem;
        border-radius: 12px;
        font-size: 1rem;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.15s ease;
        position: relative;
        background: var(--comp-bg);
        color: var(--comp-text);
        border: 2px solid var(--comp-border);
        text-decoration: none;
      }
      .btn:hover {
        opacity: 0.9;
      }
      .btn:active {
        opacity: 0.8;
      }
      .btn.btn-red { background: var(--comp-accent-red); color: var(--comp-accent-text); }
      .btn.btn-yellow { background: var(--comp-accent-yellow); color: var(--comp-text); }
      .btn.btn-gray { background: var(--comp-accent-gray); color: var(--comp-accent-text); }
```

Removed: `text-transform`, `letter-spacing`, `transform`, `box-shadow`, `font-family`. Hover/active use opacity instead of brutalist offset. Color variants use background instead of shadow.

- [ ] **Step 2: Neutralize `.card` and `.card-title` (lines ~283-324)**

Replace:

```css
      /* Card */
      .card {
        background: var(--comp-bg);
        color: var(--comp-text);
        border: 2px solid var(--comp-border);
        border-radius: 12px;
        overflow: hidden;
      }
      .card-header {
        padding: var(--spacing-4) var(--spacing-6);
        border-bottom: 2px solid var(--comp-border);
        background: var(--comp-accent);
      }
      .card-title {
        font-size: var(--text-lg);
        font-weight: var(--font-weight-bold);
        color: var(--comp-accent-text);
        margin: 0;
      }
      .card-description {
        font-size: var(--text-sm);
        color: rgba(255, 255, 255, 0.8);
        margin: var(--spacing-1) 0 0 0;
      }
      .card-content {
        padding: var(--spacing-6);
      }
      .card-footer {
        padding: var(--spacing-4) var(--spacing-6);
        border-top: 2px solid var(--comp-border);
        display: flex;
        align-items: center;
        gap: var(--spacing-2);
      }
      .card.card-red .card-header { background: var(--comp-accent-red); }
      .card.card-yellow .card-header { background: var(--comp-accent-yellow); }
      .card.card-yellow .card-title { color: var(--comp-text); }
      .card.card-yellow .card-description { color: rgba(0, 0, 0, 0.6); }
      .card.card-gray .card-header { background: var(--comp-accent-gray); }
```

Removed: `box-shadow: 4px 4px`, `text-transform: uppercase`, `letter-spacing: 0.05em` from `.card-title`.

- [ ] **Step 3: Neutralize `.input`, `.textarea`, `.select` focus styles**

Replace the focus rules:

For `.input:focus` (line ~342):
```css
      .input:focus {
        box-shadow: 0 0 0 2px var(--comp-accent);
      }
```

Remove `font-family: var(--font-sans);` from `.input` (line ~332).

For `.textarea:focus` (line ~377):
```css
      .textarea:focus {
        box-shadow: 0 0 0 2px var(--comp-accent);
      }
```

Remove `font-family: var(--font-sans);` from `.textarea` (line ~365).

For `.select:focus` (line ~518):
```css
      .select:focus {
        box-shadow: 0 0 0 2px var(--comp-accent);
      }
```

Remove `font-family: var(--font-sans);` from `.select` (line ~502).

- [ ] **Step 4: Neutralize `.label`**

Replace:

```css
      /* Label */
      .label {
        display: block;
        font-size: var(--text-sm);
        font-weight: var(--font-weight-bold);
        color: var(--comp-text);
        margin-bottom: var(--spacing-1);
      }
```

Removed: `text-transform: uppercase`, `letter-spacing: 0.05em`.

- [ ] **Step 5: Neutralize `.badge`**

Replace:

```css
      /* Badge */
      .badge {
        display: inline-flex;
        align-items: center;
        padding: var(--spacing-1) var(--spacing-3);
        font-size: var(--text-xs);
        font-weight: var(--font-weight-bold);
        background: var(--comp-bg);
        color: var(--comp-text);
        border: 2px solid var(--comp-border);
        border-radius: var(--radius-full);
      }
```

Removed: `text-transform: uppercase`, `letter-spacing: 0.05em`.

- [ ] **Step 6: Neutralize `.alert` and `.alert-title`**

Replace:

```css
      /* Alert */
      .alert {
        background: var(--comp-bg);
        color: var(--comp-text);
        border: 2px solid var(--comp-border);
        border-radius: 12px;
        padding: var(--spacing-4) var(--spacing-6);
      }
      .alert-title {
        font-size: var(--text-base);
        font-weight: var(--font-weight-bold);
        margin: 0 0 var(--spacing-1) 0;
      }
```

Removed: `border-left: 8px solid var(--comp-accent)` (aesthetic choice), `text-transform`, `letter-spacing`.

- [ ] **Step 7: Neutralize `.table-head`**

Replace:

```css
      .table-head {
        padding: var(--spacing-3) var(--spacing-4);
        font-size: var(--text-sm);
        font-weight: var(--font-weight-bold);
        text-align: left;
        color: var(--comp-bg);
      }
```

Removed: `text-transform: uppercase`, `letter-spacing: 0.05em`.

- [ ] **Step 8: Neutralize `.tabs-trigger`**

Replace:

```css
      .tabs-trigger {
        flex: 1;
        padding: var(--spacing-3) var(--spacing-4);
        font-size: var(--text-sm);
        font-weight: var(--font-weight-bold);
        background: transparent;
        color: var(--comp-bg);
        border: none;
        cursor: pointer;
        transition: background 0.15s ease;
      }
```

Removed: `text-transform: uppercase`, `letter-spacing: 0.05em`, `font-family: var(--font-sans)`.

- [ ] **Step 9: Neutralize `.accordion-trigger`**

Replace:

```css
      .accordion-trigger {
        display: block;
        width: 100%;
        padding: var(--spacing-4) var(--spacing-6);
        font-size: var(--text-base);
        font-weight: var(--font-weight-bold);
        cursor: pointer;
        color: var(--comp-text);
        list-style: none;
      }
```

Removed: `text-transform: uppercase`, `letter-spacing: 0.05em`, `font-family: var(--font-sans)`.

- [ ] **Step 10: Neutralize `.dialog-title` and `.sheet-title`**

For `.dialog-title`:
```css
      .dialog-title {
        font-size: var(--text-lg);
        font-weight: var(--font-weight-bold);
        color: var(--comp-accent-text);
        margin: 0;
      }
```

For `.sheet-title`:
```css
      .sheet-title {
        font-size: var(--text-lg);
        font-weight: var(--font-weight-bold);
        color: var(--comp-accent-text);
        margin: 0;
      }
```

Removed: `text-transform: uppercase`, `letter-spacing: 0.05em` from both.

- [ ] **Step 11: Neutralize `.dialog` and `.sheet` and `.dropdown-content` box-shadows**

For `.dialog`:
```css
      .dialog {
        background: var(--comp-bg);
        color: var(--comp-text);
        border: 2px solid var(--comp-border);
        border-radius: 12px;
        padding: 0;
        max-width: 480px;
        width: 90%;
      }
```

For `.sheet`:
```css
      .sheet {
        position: fixed;
        top: 0;
        right: 0;
        height: 100%;
        max-width: 400px;
        width: 90%;
        background: var(--comp-bg);
        color: var(--comp-text);
        border: none;
        border-left: 2px solid var(--comp-border);
        padding: 0;
        margin: 0;
      }
```

For `.dropdown-content`:
```css
      .dropdown-content {
        position: absolute;
        top: calc(100% + 4px);
        left: 0;
        min-width: 180px;
        background: var(--comp-bg);
        border: 2px solid var(--comp-border);
        border-radius: 12px;
        padding: var(--spacing-2) 0;
        z-index: 50;
      }
```

Removed: brutalist `box-shadow` from `.dialog`, `.sheet`, `.dropdown-content`.

- [ ] **Step 12: Neutralize `.nav-link` and `.dropdown-trigger`**

For `.nav-link`:
```css
      .nav-link {
        padding: var(--spacing-2) var(--spacing-4);
        font-size: var(--text-sm);
        font-weight: var(--font-weight-bold);
        color: var(--comp-text);
        text-decoration: none;
        border-radius: 8px;
        transition: background 0.15s ease;
      }
```

For `.dropdown-trigger`:
```css
      .dropdown-trigger {
        display: inline-block;
        padding: var(--spacing-3) var(--spacing-4);
        font-size: var(--text-sm);
        font-weight: var(--font-weight-bold);
        background: var(--comp-bg);
        color: var(--comp-text);
        border: 2px solid var(--comp-border);
        border-radius: 8px;
        cursor: pointer;
      }
```

Removed: `text-transform: uppercase`, `letter-spacing: 0.05em`, `font-family: var(--font-sans)` from both.

- [ ] **Step 13: Remove `.avatar-fallback` uppercase**

Replace:
```css
      .avatar-fallback {
        text-transform: uppercase;
      }
```

With nothing — remove the rule entirely. Avatar fallback text casing is a theme decision.

- [ ] **Step 14: Run the build**

Run: `cd /Users/marcusestes/Websites/VibesCLI/VibesOS && bun scripts/build-design-tokens.js --force`
Expected: Generates without errors.

- [ ] **Step 15: Commit**

```bash
git add scripts/lib/design-tokens.js
git commit -m "refactor: neutralize component classes — remove brutalist shadows, uppercase, letter-spacing"
```

---

### Task 3: Update build-design-tokens.js TXT Generation

**Files:**
- Modify: `scripts/build-design-tokens.js:124-219` (generateTXT function)

The `generateTXT()` function has a hardcoded duplicate of the old VIBES_THEME_CSS. It needs to match the new neutralized version.

- [ ] **Step 1: Replace the hardcoded VIBES THEME CSS section**

Replace lines 124-202 (from `lines.push("## VIBES THEME CSS")` through the last `.btn` push) with:

```javascript
  lines.push("## VIBES THEME CSS");
  lines.push("");
  lines.push("The template provides minimal structural styles. All visual design (backgrounds, shadows, typography treatment) is defined by the app's theme.");
  lines.push("");
  lines.push("```css");
  lines.push("body { margin: 0; padding: 0; }");
  lines.push("#container { position: relative; z-index: 2; width: 100%; min-height: 100vh; padding: 20px; }");
  lines.push("```");
  lines.push("");
  lines.push("**Buttons:** Use `className=\"btn\"` for structurally styled buttons. Variants: `btn-red`, `btn-yellow`, `btn-gray`.");
  lines.push('Example: `<button className="btn">Click Me</button>`');
```

- [ ] **Step 2: Update Rules for Generated Code (lines ~206-218)**

Replace rules 10-11 with updated guidance:

```javascript
  lines.push("10. **Define your app's background** in a `:root` style block or on your root container div — the template provides no background.");
  lines.push("11. **Components are structurally styled** with token-based colors and layout. Add visual flair (shadows, text-transform, animations) in your theme CSS.");
```

- [ ] **Step 3: Run the build and verify TXT output**

Run: `cd /Users/marcusestes/Websites/VibesCLI/VibesOS && bun scripts/build-design-tokens.js --force`
Expected: `build/design-tokens.txt` no longer references grid-background, brutalist shadows, or uppercase.

Run: `grep -c "grid-background\|brutalist\|uppercase" build/design-tokens.txt`
Expected: 0 (or only from component catalog docs which are generated separately)

- [ ] **Step 4: Commit**

```bash
git add scripts/build-design-tokens.js
git commit -m "refactor: update design-tokens TXT generation to match neutralized styles"
```

---

### Task 4: Remove #container Background from Base Template

**Files:**
- Modify: `source-templates/base/template.html:107-111`

- [ ] **Step 1: Remove the background property**

In `source-templates/base/template.html`, replace:

```css
      /* Full-viewport background wrapper — picks up app's --color-background */
      #container {
        min-height: 100vh;
        background: var(--color-background, #1a1a1a);
      }
```

With:

```css
      #container {
        min-height: 100vh;
      }
```

- [ ] **Step 2: Rebuild templates**

Run: `cd /Users/marcusestes/Websites/VibesCLI/VibesOS && bun scripts/merge-templates.js --force`
Expected: All `skills/*/templates/*.html` regenerated. Check that `skills/vibes/templates/index.html` no longer has `background: var(--color-background` on `#container`.

Run: `grep "color-background" skills/vibes/templates/index.html`
Expected: No matches for `#container` background (may appear elsewhere in component code, which is fine).

- [ ] **Step 3: Commit**

```bash
git add source-templates/base/template.html
git commit -m "refactor: remove forced background from #container in base template"
```

---

### Task 5: Theme-ify Error Boundary

**Files:**
- Modify: `skills/vibes/template.delta.html:191-313` (AppErrorBoundary render)
- Modify: `skills/riff/template.delta.html` (same error boundary code)

- [ ] **Step 1: Replace hardcoded error boundary styles in vibes delta**

In `skills/vibes/template.delta.html`, replace the style objects (lines 192-263) with theme-aware versions:

```javascript
      const wrapperStyle = {
        minHeight: '100vh',
        backgroundColor: 'var(--color-background, #f5f5f4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
      };
      const cardStyle = {
        background: 'var(--comp-bg, #fafafa)',
        border: '2px solid var(--comp-border, #1a1a1a)',
        borderRadius: '12px',
        maxWidth: '560px',
        width: '100%',
        overflow: 'hidden',
      };
      const titleStyle = {
        fontSize: 'clamp(2rem, 5vw, 3.5rem)',
        fontWeight: 800,
        color: 'var(--comp-text, #1a1a1a)',
        textAlign: 'center',
        padding: '1.5rem 1.5rem 0',
        marginBottom: '0.25rem',
      };
      const subtitleStyle = {
        fontSize: '0.95rem',
        color: 'var(--comp-text, #555)',
        textAlign: 'center',
        marginBottom: '1rem',
      };
      const msgStyle = {
        fontSize: '0.8rem',
        color: 'var(--comp-text, #555)',
        fontFamily: "ui-monospace, 'SF Mono', Monaco, 'Cascadia Code', monospace",
        background: 'rgba(128,128,128,0.1)',
        padding: '0.4rem 0.75rem',
        borderRadius: '6px',
        border: '1px solid rgba(128,128,128,0.15)',
        lineHeight: 1.4,
        margin: '0 1.5rem 1.25rem',
      };
      const actionsStyle = {
        padding: '0 1.5rem 1.5rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        alignItems: 'center',
      };
      const btnBase = {
        width: '100%',
        padding: '0.65rem 0.9rem',
        background: 'var(--comp-bg, #fafafa)',
        color: 'var(--comp-text, #1a1a1a)',
        border: '2px solid var(--comp-border, #1a1a1a)',
        borderRadius: '12px',
        fontSize: '0.8125rem',
        lineHeight: 1.5,
        fontWeight: 600,
        cursor: 'pointer',
        fontFamily: 'inherit',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem',
        transition: '0.2s',
      };
      const primaryShadow = {};
      const secondaryShadow = {};
```

Key changes:
- `wrapperStyle`: uses `var(--color-background)`, removes grid `backgroundImage`, removes hardcoded `fontFamily`
- `cardStyle`: uses `var(--comp-bg)`, removes brutalist `boxShadow`
- Text colors: use `var(--comp-text)` with neutral fallbacks
- `msgStyle`: uses `rgba(128,128,128,...)` for theme-neutral tints instead of hardcoded grays
- `primaryShadow`/`secondaryShadow`: emptied (no forced shadows)

- [ ] **Step 2: Update the technical details styles**

In the same file, the `<details>` and `<pre>` sections (lines ~290-313) use inline hardcoded colors. Replace:

For the `<details>` summary (line ~291):
```javascript
              <summary style={{ padding: '0.75rem 1.5rem', fontSize: '0.75rem', color: 'var(--comp-text, #999)', cursor: 'pointer', userSelect: 'none' }}>
```

For the `<pre>` (lines ~294-299):
```javascript
              <pre style={{
                margin: 0, padding: '0.75rem 1.5rem 1rem', fontSize: '0.7rem',
                fontFamily: "ui-monospace, 'SF Mono', Monaco, 'Cascadia Code', monospace",
                lineHeight: 1.4, color: 'var(--comp-text, #666)', background: 'rgba(128,128,128,0.05)',
                overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                borderBottomLeftRadius: '10px', borderBottomRightRadius: '10px',
              }}>
```

For the console label (line ~305):
```javascript
                    <span style={{ fontWeight: 600, color: 'var(--comp-text, #999)', fontFamily: 'inherit', fontSize: '0.7rem' }}>Recent console:</span>
```

- [ ] **Step 3: Apply identical changes to riff delta**

Copy the same style changes to `skills/riff/template.delta.html`. The error boundary code starts at a different line but the style objects are identical. Search for `wrapperStyle`, `cardStyle`, `titleStyle`, etc. and apply the same replacements.

- [ ] **Step 4: Rebuild templates**

Run: `cd /Users/marcusestes/Websites/VibesCLI/VibesOS && bun scripts/merge-templates.js --force`
Expected: Templates regenerated. Verify no `#CCCDC8`, `#e8e4df`, or `#fffff0` in error boundary sections.

Run: `grep -n "CCCDC8\|e8e4df" skills/vibes/templates/index.html`
Expected: No matches.

Run: `grep -n "CCCDC8\|e8e4df" skills/riff/templates/index.html`
Expected: No matches.

- [ ] **Step 5: Commit**

```bash
git add skills/vibes/template.delta.html skills/riff/template.delta.html
git commit -m "refactor: replace hardcoded error boundary colors with theme tokens"
```

---

### Task 6: Extract Auth Code into Composable Module

**Files:**
- Create: `source-templates/auth/auth-gate.html`
- Modify: `skills/vibes/template.delta.html:317-468` (AppShell and initApp)

This is the largest task. We extract auth-only code from the vibes delta into a separate file, and modify AppShell to only include the public rendering path. Assembly injects the auth module for private apps.

- [ ] **Step 1: Create `source-templates/auth/auth-gate.html`**

This file contains the auth-only code that gets injected into private apps. It will be inserted inside the `<script type="text/babel">` block, after AppShell is defined but before `initApp()`.

Create `source-templates/auth/auth-gate.html`:

```html
  // === AUTH GATE (injected for private apps only) ===

  // Override AppShell for private app with OIDC gate
  const _PublicAppShell = AppShell;

  function AppShell() {
    const [isReady, setIsReady] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [user, setUser] = useState(null);

    window.useVibesPanelEvents('Vibes');

    useEffect(() => {
      let destroySync = null;
      let persister = null;

      async function init() {
        persister = createLocalPersister(store, `tinybase_${config.appName}`);
        await persister.startAutoPersisting([{}, {}]);
        setIsReady(true);

        if (config.wsUrl && !config.wsUrl.startsWith('__')) {
          startSync();
        }
      }

      function startSync() {
        if (destroySync) return;
        let syncUrl = config.wsUrl;
        const token = sessionStorage.getItem('vibes_oidc_access_token');
        if (!token) return;
        syncUrl += (syncUrl.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(token);
        destroySync = createReconnectingSynchronizer(
          store,
          syncUrl,
          (syncing) => {
            setIsSyncing(syncing);
            window.__VIBES_SYNC_STATUS__ = syncing ? 'synced' : 'reconnecting';
            window.dispatchEvent(new Event('vibes-sync-status-change'));
          },
        );
      }

      function onOidcReady() { startSync(); }
      window.addEventListener('vibes-oidc-ready', onOidcReady);

      init();
      return () => {
        window.removeEventListener('vibes-oidc-ready', onOidcReady);
        if (destroySync) destroySync();
        if (persister) persister.destroy();
      };
    }, []);

    if (!isReady) {
      return (
        <div style={{ padding: '2rem', textAlign: 'center', opacity: 0.5, fontFamily: 'system-ui' }}>
          Loading...
        </div>
      );
    }

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
            <SharingBridge />
            <AppContext.Provider value={{ isReady, isSyncing, user }}>
              <HiddenMenuWrapper menuContent={<VibesPanel />}>
                <AppErrorBoundary><App /></AppErrorBoundary>
              </HiddenMenuWrapper>
            </AppContext.Provider>
          </SignedIn>
        </OIDCProvider>
      </Provider>
    );
  }

  // Override initApp for private apps — load OIDC before render
  const _publicInitApp = typeof initApp === 'function' ? initApp : null;

  async function initApp() {
    try {
      const oidcModule = await import("/oidc-bridge.js");
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

    if (!window.useUser) {
      window.useUser = () => ({ email: null, name: null, sub: null });
    }
    if (!window.useOIDCContext) {
      window.useOIDCContext = () => ({ user: null, isAuthenticated: false });
    }

    const rootElement = document.getElementById("container");
    ReactDOMClient.createRoot(rootElement).render(<AppShell />);
  }

  initApp();
```

- [ ] **Step 2: Simplify vibes delta AppShell to public-only**

Replace the AppShell function and everything after it (lines 317-468) in `skills/vibes/template.delta.html` with:

```jsx
  function AppShell() {
    const [isReady, setIsReady] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);

    window.useVibesPanelEvents('Vibes');

    useEffect(() => {
      let destroySync = null;
      let persister = null;

      async function init() {
        persister = createLocalPersister(store, `tinybase_${config.appName}`);
        await persister.startAutoPersisting([{}, {}]);
        setIsReady(true);

        if (config.wsUrl && !config.wsUrl.startsWith('__')) {
          destroySync = createReconnectingSynchronizer(
            store,
            config.wsUrl,
            (syncing) => {
              setIsSyncing(syncing);
              window.__VIBES_SYNC_STATUS__ = syncing ? 'synced' : 'reconnecting';
              window.dispatchEvent(new Event('vibes-sync-status-change'));
            },
          );
        }
      }

      init();
      return () => {
        if (destroySync) destroySync();
        if (persister) persister.destroy();
      };
    }, []);

    if (!isReady) {
      return (
        <div style={{ padding: '2rem', textAlign: 'center', opacity: 0.5, fontFamily: 'system-ui' }}>
          Loading...
        </div>
      );
    }

    return (
      <Provider store={store}>
        <SyncStatusDot />
        <AppContext.Provider value={{ isReady, isSyncing, user: null }}>
          <HiddenMenuWrapper menuContent={<VibesPanel />}>
            <AppErrorBoundary><App /></AppErrorBoundary>
          </HiddenMenuWrapper>
        </AppContext.Provider>
      </Provider>
    );
  }

  // Provide safe stubs for auth hooks so generated code
  // that calls useUser() doesn't crash in public apps.
  if (!window.useUser) {
    window.useUser = () => ({ email: null, name: null, sub: null });
  }
  if (!window.useOIDCContext) {
    window.useOIDCContext = () => ({ user: null, isAuthenticated: false });
  }

  // <!-- AUTH:INJECT -->

  const rootElement = document.getElementById("container");
  ReactDOMClient.createRoot(rootElement).render(<AppShell />);
</script>
```

Key changes:
- AppShell only has the public code path (no OIDC branching, no `config.public` check)
- No `hasOidc` variable needed
- Sync uses `config.wsUrl` directly (no token injection — public apps don't need auth tokens)
- `initApp()` is gone — replaced with inline render
- `<!-- AUTH:INJECT -->` marker placed before the render call
- Safe auth stubs (`useUser`, `useOIDCContext`) provided for public apps

- [ ] **Step 3: Commit**

```bash
git add source-templates/auth/auth-gate.html skills/vibes/template.delta.html
git commit -m "refactor: extract auth code into composable module, simplify vibes delta to public-only"
```

---

### Task 7: Update Assembly to Inject Auth for Private Apps

**Files:**
- Modify: `scripts/assemble.js`
- Modify: `scripts/lib/assembly-utils.js` (add AUTH_INJECT_MARKER constant)

- [ ] **Step 1: Add AUTH_INJECT_MARKER to assembly-utils.js**

In `scripts/lib/assembly-utils.js`, find where `APP_PLACEHOLDER` is defined and add:

```javascript
export const AUTH_INJECT_MARKER = '// <!-- AUTH:INJECT -->';
```

- [ ] **Step 2: Add `--private` flag and auth injection to assemble.js**

In `scripts/assemble.js`, add the import for the new constant and the auth gate file reading:

After the existing imports (line 19), add:

```javascript
import { AUTH_INJECT_MARKER } from './lib/assembly-utils.js';
```

Update the `APP_PLACEHOLDER` import to include `AUTH_INJECT_MARKER`:

```javascript
import { APP_PLACEHOLDER, AUTH_INJECT_MARKER, validateAssembly, loadAndValidateTemplate, checkForbiddenPatterns, stripOidcImportBlock } from './lib/assembly-utils.js';
```

After the `const evalMode` line (line 27), add:

```javascript
  const privateMode = process.argv.includes('--private');
```

After the OIDC constants injection (after line 69), add the auth gate injection:

```javascript
  // Inject auth gate for private apps
  if (privateMode && output.includes(AUTH_INJECT_MARKER)) {
    const authGatePath = resolve(import.meta.dirname, '../source-templates/auth/auth-gate.html');
    if (!existsSync(authGatePath)) {
      throw new Error(`Auth gate template not found: ${authGatePath}`);
    }
    const authGateCode = readFileSync(authGatePath, 'utf8');
    output = output.replace(AUTH_INJECT_MARKER, authGateCode);
    console.log('[private] Auth gate injected');
  } else if (!privateMode && output.includes(AUTH_INJECT_MARKER)) {
    // Public app — strip the marker
    output = output.replace(AUTH_INJECT_MARKER, '');
  }
```

- [ ] **Step 3: Rebuild templates and test assembly**

Run: `cd /Users/marcusestes/Websites/VibesCLI/VibesOS && bun scripts/merge-templates.js --force`

Test public assembly:
Run: `cd /Users/marcusestes/Websites/VibesCLI/VibesOS && bun scripts/assemble.js scripts/__tests__/fixtures/tinybase-basic.jsx /tmp/test-public.html`
Expected: No errors. Check output has no OIDC code:
Run: `grep -c "OIDCProvider\|SignedIn\|SignedOut\|AuthScreen\|AuthGate" /tmp/test-public.html`
Expected: 0

Test private assembly:
Run: `cd /Users/marcusestes/Websites/VibesCLI/VibesOS && bun scripts/assemble.js --private scripts/__tests__/fixtures/tinybase-basic.jsx /tmp/test-private.html`
Expected: No errors. Check output has OIDC code:
Run: `grep -c "OIDCProvider\|SignedIn\|SignedOut\|AuthGate" /tmp/test-private.html`
Expected: > 0

- [ ] **Step 4: Commit**

```bash
git add scripts/assemble.js scripts/lib/assembly-utils.js
git commit -m "feat: add --private flag to assembler for auth gate injection"
```

---

### Task 8: Update Editor Server for Public-Only Preview

**Files:**
- Modify: `scripts/server/handlers/generate.ts:96-107`

The editor server already runs apps as public. With the new architecture, no auth code exists in the template unless injected. Verify the server doesn't need changes.

- [ ] **Step 1: Verify editor server doesn't reference auth injection**

Run: `grep -n "AUTH_INJECT\|auth-gate\|private" /Users/marcusestes/Websites/VibesCLI/VibesOS/scripts/server/handlers/generate.ts`
Expected: No matches for AUTH_INJECT or auth-gate. If `private` appears, verify it's not related to auth injection.

The editor server uses `populateConnectConfig` which sets `__APP_PUBLIC__: 'true'`. With the new architecture, there's no `__APP_PUBLIC__` placeholder in the public template anymore (it was removed with the `config.public` branching). But the placeholder replacement is harmless — it just won't match anything.

- [ ] **Step 2: Clean up `__APP_PUBLIC__` references if they no longer exist in templates**

Check if `__APP_PUBLIC__` still appears in the generated template:
Run: `grep "__APP_PUBLIC__" /Users/marcusestes/Websites/VibesCLI/VibesOS/skills/vibes/templates/index.html`

If it no longer appears (because the `config.public` check was removed from AppShell), then the `APP_CONFIG_PLACEHOLDERS` entry in `env-utils.js` is dead code. Remove it:

In `scripts/lib/env-utils.js`, update:
```javascript
export const APP_CONFIG_PLACEHOLDERS = {
  '__APP_NAME__': 'preview-app',
  '__WS_URL__': '__WS_URL__',
};
```

Also check `source-templates/base/template.html` for the `__APP_CONFIG__` block — if it still has `public: __APP_PUBLIC__`, that needs to stay for the auth-gate module (which checks `config.public` at runtime). But wait — in the new architecture, public apps don't have the `config.public` check. And private apps have their own AppShell override.

Actually, the `__APP_CONFIG__` block in `base/template.html` includes `public: __APP_PUBLIC__`. The auth-gate module's `startSync()` needs to know it's private (to inject tokens). So `__APP_PUBLIC__` should remain in the base template config for private apps to use. Leave it.

- [ ] **Step 3: Commit if any changes were made**

```bash
git add scripts/lib/env-utils.js scripts/server/handlers/generate.ts
git commit -m "chore: clean up editor server for public-only preview"
```

(Skip if no changes needed.)

---

### Task 9: Update Skill Documentation

**Files:**
- Modify: `skills/vibes/references/generation-rules.md:78-84`
- Modify: `skills/vibes/defaults/style-prompt.txt:100-104`

- [ ] **Step 1: Update generation-rules.md**

Replace lines 78-84 in `skills/vibes/references/generation-rules.md`:

```markdown
**In your generated code:**
- **Wrap your App in a full-page container div** with `min-height: 100vh` and an explicit `background-color` — never leave the page background transparent or unstyled
- Use `var(--token-name)` references — NOT hardcoded color values
- Use `--color-*` for semantic colors, `--radius-*` for border-radius
- Use `className="btn"` for buttons (structurally styled with token-based colors)
- **Pick components from the catalog** (card, input, badge, table, etc.), then write CSS for their class names using the design tokens
- Override `--color-*` tokens in a `:root` style block for per-app theming
- **Define your visual identity in CSS** — backgrounds, shadows, text-transform, animations. The template provides structure; your theme provides the look.
```

- [ ] **Step 2: Update style-prompt.txt**

Replace lines 100-104 in `skills/vibes/defaults/style-prompt.txt`:

```
LAYOUT PRINCIPLES:
- **ALWAYS wrap the entire app in a full-page div** with `min-height: 100vh` and an explicit `background-color` — the page must NEVER have a transparent or unstyled background
- Mobile-first: single column on phones, expand to 2-4 columns at md/lg breakpoints
- Generous whitespace — let components breathe (gap: 1rem-2rem between sections)
- Sticky headers or bottom navigation for key actions
- Define your app's background, shadows, and typography treatment in your theme CSS — the template provides no visual defaults
```

- [ ] **Step 3: Commit**

```bash
git add skills/vibes/references/generation-rules.md skills/vibes/defaults/style-prompt.txt
git commit -m "docs: update generation rules and style prompt for neutral templates"
```

---

### Task 10: Final Rebuild and Test

**Files:**
- All build outputs

- [ ] **Step 1: Full rebuild**

```bash
cd /Users/marcusestes/Websites/VibesCLI/VibesOS
bun scripts/build-design-tokens.js --force
bun scripts/build-components.js --force
bun scripts/merge-templates.js --force
```

Expected: All three succeed without errors.

- [ ] **Step 2: Run all tests**

Run: `cd /Users/marcusestes/Websites/VibesCLI/VibesOS/scripts && npm test`
Expected: All tests pass.

- [ ] **Step 3: Verify public template has no auth code**

Run: `grep -c "AuthScreen\|AuthGate\|SignedOut\|SignedIn\|OIDCProvider\|oidc-bridge" /Users/marcusestes/Websites/VibesCLI/VibesOS/skills/vibes/templates/index.html`

Expected: 0 or very low count (only if referenced in comments or non-auth contexts like `ConfigError`/`LoadingError` which reference `AuthScreen` — these should also have been cleaned up).

- [ ] **Step 4: Verify public template has no forced styles**

Run: `grep -c "body::before\|body::after\|grid-background\|text-transform: uppercase\|letter-spacing: 0.05em\|4px 4px 0px" /Users/marcusestes/Websites/VibesCLI/VibesOS/skills/vibes/templates/index.html`

Expected: 0 for body::before, body::after, grid-background. Low count for uppercase/shadow (only in non-design-tokens code like HiddenMenuWrapper, which is out of scope).

- [ ] **Step 5: Test assembly end-to-end**

Public:
```bash
cd /Users/marcusestes/Websites/VibesCLI/VibesOS
bun scripts/assemble.js scripts/__tests__/fixtures/tinybase-basic.jsx /tmp/test-public.html
grep -c "OIDCProvider" /tmp/test-public.html
```
Expected: 0

Private:
```bash
bun scripts/assemble.js --private scripts/__tests__/fixtures/tinybase-basic.jsx /tmp/test-private.html
grep -c "OIDCProvider" /tmp/test-private.html
```
Expected: > 0

- [ ] **Step 6: Commit final state**

```bash
git add -A
git commit -m "chore: final rebuild after template neutralization"
```
