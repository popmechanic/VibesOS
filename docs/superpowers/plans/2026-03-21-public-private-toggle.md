# Public/Private Toggle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add progressive "Use theme?" / "Private?" / "Use AI?" chips to the editor prompt form, controlling theme selection, OIDC auth gating, and AI feature availability at deploy time.

**Architecture:** Three chip buttons replace the existing "Themed" and "Use AI" buttons. "Use AI?" is hidden until "Private" is active. State is tracked in editor JS variables and passed through WebSocket messages to the server, which stores `isPrivate` per app and uses it at deploy time to set `__APP_PUBLIC__`.

**Tech Stack:** HTML/CSS/JS in editor.html, TypeScript in server handlers

---

## File Structure

| File | Change |
|------|--------|
| `skills/vibes/templates/editor.html` | Replace chip buttons, update JS state management, update deploy message |
| `scripts/server/ws.ts` | Pass `isPrivate` from generate and deploy messages to handlers |
| `scripts/server/handlers/generate.ts` | Store `isPrivate` in app metadata file |
| `scripts/server/handlers/deploy.ts` | Read `isPrivate` from app metadata, set `__APP_PUBLIC__` |

---

## Task 1: Editor UI — Progressive Chips

Replace the two existing chip buttons with three progressive chips.

**Files:**
- Modify: `skills/vibes/templates/editor.html`

- [ ] **Step 1: Replace chip HTML**

Find the two button elements at approximately line 2724-2725:

```html
<button class="theme-mode-chip" id="themeModeChip" onclick="toggleThemeMode()">Themed</button>
<button class="theme-mode-chip" id="genAiChip" onclick="toggleGenAI()">Use AI</button>
```

Replace with:

```html
<button class="theme-mode-chip" id="useThemeChip" onclick="toggleUseTheme()">Use theme?</button>
<button class="theme-mode-chip" id="privateChip" onclick="togglePrivate()">Private?</button>
<button class="theme-mode-chip" id="useAiChip" onclick="toggleUseAI()" style="display:none;">Use AI?</button>
```

- [ ] **Step 2: Replace JS state and toggle functions**

Find the existing state and functions (approximately lines 4664-4691):

```javascript
let customThemeMode = false;
let genAIEnabled = false;

function toggleGenAI() {
  genAIEnabled = !genAIEnabled;
  const chip = document.getElementById('genAiChip');
  if (chip) chip.classList.toggle('active', genAIEnabled);
}

function setThemeMode(custom) {
  customThemeMode = custom;
  const carousel = document.getElementById('themeCarousel');
  const chip = document.getElementById('themeModeChip');
  if (carousel) carousel.classList.toggle('custom-mode', custom);
  if (chip) {
    chip.textContent = custom ? 'Custom' : 'Themed';
    chip.classList.toggle('custom', custom);
  }
}

function toggleThemeMode() {
  setThemeMode(!customThemeMode);
}

// Legacy compat
function setThemeCarouselOverridden(overridden) {
  setThemeMode(overridden);
}
```

Replace with:

```javascript
let useThemeEnabled = false;
let privateEnabled = false;
let useAIEnabled = false;

function toggleUseTheme() {
  useThemeEnabled = !useThemeEnabled;
  const chip = document.getElementById('useThemeChip');
  const carousel = document.getElementById('themeCarousel');
  if (chip) {
    chip.textContent = useThemeEnabled ? 'Use theme' : 'Use theme?';
    chip.classList.toggle('active', useThemeEnabled);
  }
  if (carousel) carousel.classList.toggle('custom-mode', !useThemeEnabled);
}

function togglePrivate() {
  privateEnabled = !privateEnabled;
  const chip = document.getElementById('privateChip');
  const aiChip = document.getElementById('useAiChip');
  if (chip) {
    chip.textContent = privateEnabled ? 'Private' : 'Private?';
    chip.classList.toggle('active', privateEnabled);
  }
  if (!privateEnabled) {
    // Deselect and hide Use AI when Private is turned off
    useAIEnabled = false;
    if (aiChip) {
      aiChip.style.display = 'none';
      aiChip.textContent = 'Use AI?';
      aiChip.classList.remove('active');
    }
  } else {
    if (aiChip) aiChip.style.display = '';
  }
}

function toggleUseAI() {
  if (!privateEnabled) return; // Can't enable AI without Private
  useAIEnabled = !useAIEnabled;
  const chip = document.getElementById('useAiChip');
  if (chip) {
    chip.textContent = useAIEnabled ? 'Use AI' : 'Use AI?';
    chip.classList.toggle('active', useAIEnabled);
  }
}

// Legacy compat — theme carousel uses this
function setThemeMode(custom) {
  if (custom && !useThemeEnabled) return; // don't override if theme not enabled
  const carousel = document.getElementById('themeCarousel');
  if (carousel) carousel.classList.toggle('custom-mode', custom);
}

function setThemeCarouselOverridden(overridden) {
  setThemeMode(overridden);
}
```

- [ ] **Step 3: Auto-activate "Use theme" when theme carousel is clicked**

Find the `selectThemeCarousel` function (approximately line 3972):

```javascript
function selectThemeCarousel(id) {
  selectedThemeId = id;
  document.getElementById('themeSelect').value = id;
  document.querySelectorAll('.theme-carousel-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.themeId === id);
  });
}
```

Add auto-activation at the end:

```javascript
function selectThemeCarousel(id) {
  selectedThemeId = id;
  document.getElementById('themeSelect').value = id;
  document.querySelectorAll('.theme-carousel-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.themeId === id);
  });
  // Auto-activate "Use theme" when a theme is selected
  if (!useThemeEnabled) {
    useThemeEnabled = true;
    const chip = document.getElementById('useThemeChip');
    if (chip) {
      chip.textContent = 'Use theme';
      chip.classList.add('active');
    }
    const carousel = document.getElementById('themeCarousel');
    if (carousel) carousel.classList.remove('custom-mode');
  }
}
```

- [ ] **Step 4: Update the generate payload**

Find the payload construction (approximately line 4359):

```javascript
const payload = { type: 'generate', prompt, themeId: skipTheme ? null : (themeId || null), model: getModel(), useAI: genAIEnabled, previousApp: currentAppName };
```

Replace with:

```javascript
const skipTheme = !useThemeEnabled || hasReference;
const payload = { type: 'generate', prompt, themeId: skipTheme ? null : (themeId || null), model: getModel(), useAI: useAIEnabled, isPrivate: privateEnabled, previousApp: currentAppName };
```

Note: Also find and update the `skipTheme` variable definition above this line. The old code uses `customThemeMode` — replace with `!useThemeEnabled`:

Find: `const skipTheme = customThemeMode || hasReference;`
Replace: Remove this line (it's now inline in the payload).

- [ ] **Step 5: Update the deploy message to include isPrivate**

Find the deploy message sends (approximately lines 4594 and 4609):

```javascript
ws.send(JSON.stringify({ type: 'deploy', target: 'cloudflare', name: appName, app: currentAppName }));
```

and:

```javascript
ws.send(JSON.stringify({ type: 'deploy', target, name, app: currentAppName }));
```

Add `isPrivate: privateEnabled` to both:

```javascript
ws.send(JSON.stringify({ type: 'deploy', target: 'cloudflare', name: appName, app: currentAppName, isPrivate: privateEnabled }));
```

```javascript
ws.send(JSON.stringify({ type: 'deploy', target, name, app: currentAppName, isPrivate: privateEnabled }));
```

- [ ] **Step 6: Commit**

```bash
git add skills/vibes/templates/editor.html
git commit -m "feat: progressive Use theme / Private / Use AI chips in editor"
```

---

## Task 2: Server — Pass isPrivate Through

Wire `isPrivate` from WebSocket messages through to the handlers, and use it at deploy time.

**Files:**
- Modify: `scripts/server/ws.ts`
- Modify: `scripts/server/handlers/deploy.ts`

- [ ] **Step 1: Update ws.ts generate handler**

Find the generate case (approximately line 118-119):

```typescript
case 'generate':
  await handleGenerate(ctx, onEvent, msg.prompt, msg.themeId, msg.model, msg.reference || null, !!msg.useAI, msg.previousApp || undefined);
```

The `isPrivate` flag doesn't need to go to `handleGenerate` — the generate handler creates the app code, which is auth-agnostic. But we need to store it so the deploy handler can read it.

Write `isPrivate` to a metadata file in the app directory:

```typescript
case 'generate': {
  await handleGenerate(ctx, onEvent, msg.prompt, msg.themeId, msg.model, msg.reference || null, !!msg.useAI, msg.previousApp || undefined);
  // Store isPrivate for deploy handler
  const appDir = currentAppDir(ctx, msg.previousApp || undefined) || join(ctx.appsDir, msg.prompt ? slugifyPrompt(msg.prompt) : 'untitled');
  // This is a best-effort — the app directory may not exist yet during generation
  break;
}
```

Actually, the simpler approach: store `isPrivate` per app in a server-side Map on the ctx object. Add to the generate handler after app creation.

Better yet: pass `isPrivate` with the deploy message (we already did this in Task 1 Step 5). The deploy handler reads it directly from the message. No metadata file needed.

- [ ] **Step 2: Update ws.ts deploy handler**

Find the deploy case (approximately line 132-133):

```typescript
case 'deploy':
  await handleDeploy(ctx, onEvent, msg.target, msg.name, undefined, msg.app || undefined);
```

Replace with:

```typescript
case 'deploy':
  await handleDeploy(ctx, onEvent, msg.target, msg.name, undefined, msg.app || undefined, !!msg.isPrivate);
```

- [ ] **Step 3: Update deploy.ts to accept and use isPrivate**

Find the function signature (approximately line 22):

```typescript
export async function handleDeploy(ctx: ServerContext, onEvent: EventCallback, target: string, name: string, token?: string, appNameOverride: string | undefined = undefined) {
```

Add `isPrivate` parameter:

```typescript
export async function handleDeploy(ctx: ServerContext, onEvent: EventCallback, target: string, name: string, token?: string, appNameOverride: string | undefined = undefined, isPrivate: boolean = false) {
```

Then find where the files map is built and the Deploy API is called. The deploy message body needs `public: !isPrivate`:

Find the fetch call (approximately line 155):

```typescript
body: JSON.stringify({ name: appName, files }),
```

Replace with:

```typescript
body: JSON.stringify({ name: appName, files, public: !isPrivate }),
```

This tells the Deploy API to set `__APP_PUBLIC__` to `false` for private apps and `true` for public apps.

- [ ] **Step 4: Run tests**

```bash
cd scripts && npx vitest run
```

- [ ] **Step 5: Commit**

```bash
git add scripts/server/ws.ts scripts/server/handlers/deploy.ts
git commit -m "feat: pass isPrivate from editor to deploy handler, set __APP_PUBLIC__"
```

---

## Task 3: Test End-to-End

- [ ] **Step 1: Restart editor server**

```bash
bun scripts/server.ts --mode=editor
```

- [ ] **Step 2: Test public app (default)**

Generate an app with default settings (no chips active). Deploy it. Verify:
- `curl -s https://appname.vibesos.com/ | grep -o "public:[^,]*"` shows `public: true`
- App loads without sign-in gate

- [ ] **Step 3: Test private app with AI**

Generate an app with "Private" and "Use AI" enabled. Deploy it. Verify:
- `curl -s https://appname.vibesos.com/ | grep -o "public:[^,]*"` shows `public: false`
- App shows sign-in gate (OIDC)
- After sign-in, AI features work (no "AI proxy not configured" error)

- [ ] **Step 4: Test progressive disclosure**

In the editor:
- Verify "Use AI?" chip is hidden by default
- Click "Private?" → verify it becomes "Private" and "Use AI?" appears
- Click "Private" again to deselect → verify "Use AI?" disappears and deselects
- Click a theme in the carousel → verify "Use theme?" becomes "Use theme"

- [ ] **Step 5: Commit any fixes**

```bash
git add -A && git commit -m "fix: end-to-end testing fixes for public/private toggle"
```
