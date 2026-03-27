# Template Neutralization & Auth Code Separation

**Date:** 2026-03-27
**Status:** Approved
**Scope:** Remove forced visual styles from templates, neutralize component class aesthetics, extract auth code from public apps

## Problem

The template system forces visual styles on every generated app regardless of what the user asked for:

1. **Global forced styles** — `body::before` creates a rounded inset frame, `body::after` overlays a 32px grid, `body` sets background/font/color, `.grid-background` forces a dark bg with grid lines. Every app inherits these whether it wants them or not.
2. **Component aesthetic lock-in** — `.btn`, `.card`, `.badge`, `.alert`, `.tabs`, `.accordion` all force `text-transform: uppercase`, `letter-spacing: 0.05em`, and brutalist `4px 4px` box-shadows. Apps using these classes cannot escape the neo-brutalist aesthetic without `!important` overrides.
3. **Error boundary hardcoded colors** — AppErrorBoundary uses hardcoded cream (#e8e4df), tan (#CCCDC8), and brutalist shadows instead of theme tokens, breaking visual continuity when an app crashes.
4. **Auth dead code in public apps** — Every public app ships ~500 lines of auth infrastructure (AuthScreen, OIDC loading, SignedIn/SignedOut) that never executes. This has caused real bugs: the auth gate can accidentally render and block the app with an unremovable cream overlay.

### Root Cause

These are legacy patterns from a previous vibes.diy codebase. The template should be structural scaffolding — the theme and LLM own the visual identity.

## Design

### Principle

**Templates are structural, not visual.** They provide the React runtime, TinyBase sync, import maps, and neutral component scaffolding. All visual decisions — backgrounds, shadows, typography treatment, color schemes — belong to the theme, which the LLM generates based on what the user asked for.

### 1. Remove Global Forced Styles

**File:** `scripts/lib/design-tokens.js` (VIBES_THEME_CSS string and TOKEN_CATALOG)

| Current | Action |
|---------|--------|
| `body { background: var(--vibes-black); font-family: var(--font-sans); color: var(--color-text); }` | Keep only `margin: 0; padding: 0;` |
| `body::before` (rounded inset frame with `--color-background`) | Remove entirely |
| `body::after` (32px grid overlay with `--grid-color`) | Remove entirely |
| `#container { padding: 20px; }` | Keep structural layout |
| `.vibes-content, .grid-background { ... }` | Remove the rule entirely |
| `--grid-size`, `--grid-color` tokens in TOKEN_CATALOG | Remove (no longer referenced) |
| `--content-grid-bg`, `--content-grid-color`, `--content-grid-size` tokens | Keep in catalog as available ingredients (inert without a rule applying them) |

**File:** `source-templates/base/template.html`

| Current | Action |
|---------|--------|
| `#container { background: var(--color-background, #1a1a1a); }` | Remove the `background` property. Keep `min-height: 100vh` (structural) |

### 2. Neutralize Component Classes

**File:** `scripts/lib/design-tokens.js` (VIBES_THEME_CSS string)

**Remove from ALL component classes:**

| Property | Reason |
|----------|--------|
| `text-transform: uppercase` | Aesthetic choice — theme decides |
| `letter-spacing: 0.05em` | Aesthetic choice — theme decides |
| `box-shadow: 4px 4px 0px 0px var(--comp-border)` | Brutalist aesthetic — theme decides |
| `box-shadow: 4px 4px 0px 0px var(--comp-accent)` (focus) | Brutalist focus — replace with neutral |
| `transform: translate(0px, 0px)` | Brutalist offset base — theme decides |
| Hardcoded `font-family` declarations | Let components inherit from app |

**Keep on all components:**

| Property | Reason |
|----------|--------|
| `--comp-*` token-based colors | Theme-driven, not hardcoded |
| `display`, `padding`, `border-radius`, `overflow` | Structural layout |
| `border: 2px solid var(--comp-border)` | Structural (border presence is a reasonable default) |
| `cursor: pointer`, `transition` | Interaction behavior |

**Affected classes:** `.btn`, `.btn:hover`, `.btn:active`, `.card`, `.card-title`, `.card-header`, `.badge`, `.alert`, `.alert-title`, `.tabs-list`, `.tabs-trigger`, `.accordion-trigger`, `.input:focus`, `.textarea:focus`, `.select:focus`

**Focus style replacement:** `box-shadow: 4px 4px 0px 0px var(--comp-accent)` → `box-shadow: 0 0 0 2px var(--comp-accent)` (neutral focus ring)

### 3. Error Boundary Theme-Awareness

**Files:** `skills/vibes/template.delta.html`, `skills/riff/template.delta.html`

Replace all hardcoded colors in AppErrorBoundary with CSS custom properties:

| Hardcoded | Replacement |
|-----------|-------------|
| `backgroundColor: "#CCCDC8"` (tan wrapper) | `backgroundColor: "var(--color-background, #f5f5f4)"` |
| `backgroundColor: "#e8e4df"` (cream card bg) | `backgroundColor: "var(--comp-bg, #f5f5f4)"` |
| Grid `backgroundImage` on wrapper | Remove |
| `border: "3px solid #1a1a1a"` | `border: "2px solid var(--comp-border, #1a1a1a)"` |
| `color: '#1a1a1a'` (title) | `color: "var(--comp-text, #1a1a1a)"` |
| `color: '#555'` (subtitle, message) | `color: "var(--comp-text, #555)"` |
| `boxShadow: '4px 4px 0px #1a1a1a'` (card) | Remove |
| `boxShadow` on primary/secondary buttons | Remove brutalist shadows |
| Hardcoded `fontFamily` on container/message | Remove (inherit from app) |

Fallback values ensure the error boundary remains legible if tokens aren't set.

### 4. Auth Code Separation

**Architecture:** Compositional injection. Auth code lives in a separate file. Assembly injects it only for private apps.

#### New file: `source-templates/auth/auth-gate.html`

Extract from `skills/vibes/template.delta.html`:

- `AuthScreen` component and all style functions (`getScreenContainerStyle`, `getOverlayStyle`, `getBlackBorderWrapperStyle`, `getContainerStyle`, `getButtonsContainerStyle`)
- `CARD_URLS` and card animation code
- OIDC dynamic import block from `initApp()`
- `SignedIn`/`SignedOut` gate logic (the `AuthGate` component and OIDC `<Provider>` wrapper)
- `SharingBridge` component
- Auth-related window globals (`window.AuthScreen`, `window.SignedIn`, `window.SignedOut`, `window.SignInButton`, `window.UserButton`, `window.useUser`, `window.useOIDCContext`)

#### What stays in the base delta:

- `AppShell` renders the app directly — the current `config.public` branch becomes the only code path
- `SyncStatusDot` (used by both public and private)
- `AppErrorBoundary` (used by both)
- `HiddenMenuWrapper` / `VibesPanel` (used by both)
- Store creation and sync setup
- `startSync()` function (public sync doesn't need auth tokens)

#### Injection mechanism:

Add an injection marker to the delta:
```html
<!-- AUTH:INJECT -->
```

**`scripts/assemble.js` changes:**
- Accept a `--private` flag or detect from app config
- When private: read `source-templates/auth/auth-gate.html`, inject at the `<!-- AUTH:INJECT -->` marker
- When public: strip the marker (or leave it as an HTML comment — harmless)
- The auth gate code modifies `AppShell` to wrap the app in `OIDCProvider` + `SignedIn`/`SignedOut` — this needs to be done via a well-defined integration point (e.g., the auth module replaces a `{/* AUTH_WRAPPER */}` placeholder in AppShell's JSX)

#### AppShell integration pattern:

Public AppShell (base delta):
```jsx
function AppShell() {
  // ... store setup, sync ...
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
```

Auth gate injection replaces the inner render with the OIDC-wrapped version. The specific mechanism (template replacement, function override, or conditional) is an implementation detail — the key contract is:

- Public: AppShell renders `<App />` directly
- Private: AppShell wraps `<App />` in `OIDCProvider` > `SignedIn`/`SignedOut` > `AuthGate`

#### Editor server (`scripts/server/handlers/generate.ts`):
- Preview always assembles as public (no auth injection). This is the current behavior made explicit.

#### Deploy API contract:
- No changes needed. `__APP_PUBLIC__` is still set by the Deploy API. The difference is that public apps no longer contain auth code at all, rather than having it gated by a runtime flag.

### 5. Skill & Docs Updates

| File | Change |
|------|--------|
| `skills/vibes/references/generation-rules.md` | Remove `className="grid-background"` instruction. Replace with guidance to define background in app's own CSS via `--color-background` or custom styles |
| `skills/vibes/defaults/style-prompt.txt` | Remove grid-background reference. Update layout guidance to say themes own the background treatment |
| `build/design-tokens.txt` | Auto-regenerated by build script — will reflect removed rules and updated component classes |

### 6. Impact on Existing Apps

**319 deployed apps:** Already deployed HTML is immutable. No existing deployed app is affected.

**150 apps using `className="grid-background"`:** On reassembly/redeploy, the class becomes a no-op. The app's own theme CSS (which most apps already define) takes over. Net effect: apps that were fighting the template's background now render cleanly.

**Apps relying on brutalist component defaults:** On reassembly, `.btn` loses its uppercase/shadow, `.card` loses its brutalist shadow. Apps that defined their own component styles in `@theme` sections are unaffected. Apps that relied entirely on template defaults will look cleaner but less opinionated — this is the intended outcome.

### Build & Verification

1. `bun scripts/build-design-tokens.js --force` — regenerate CSS + TXT from modified tokens
2. `bun scripts/build-components.js --force` — if component files touched
3. `bun scripts/merge-templates.js --force` — regenerate all skill templates
4. `cd scripts && npm test` — run all existing tests
5. Manual verification:
   - Assemble a public app → verify zero auth code in output HTML
   - Assemble a private app → verify auth gate present and functional
   - Open a public app in editor preview → verify no overlay, no forced styles
   - Check that `--comp-*` tokens still work for theming components
