# Generate Live Preview Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Immediately transition to the edit view on generate submit and show live preview updates as Claude writes code.

**Architecture:** On generate submit, the editor switches to edit phase immediately (instead of waiting for completion). The existing HMR watcher (`hmr.ts`) is instantiated in `server.ts` and receives tool_result events via an `onEvent` wrapper in `ws.ts`. Valid JSX writes trigger `assembleAppFrame()` and broadcast assembled HTML. The editor creates blob URLs for iframe updates to preserve localStorage access.

**Tech Stack:** TypeScript (server), HTML/JS (editor), Babel parser (JSX validation)

**Spec:** `docs/superpowers/specs/2026-03-17-generate-live-preview-design.md`

---

### Task 1: Instantiate HMR watcher in server and expose to WebSocket handler

**Files:**
- Modify: `scripts/server.ts:39-60`
- Modify: `scripts/server/ws.ts:90-100`

- [ ] **Step 1: Import and instantiate HMR watcher in server.ts**

In `scripts/server.ts`, add the import at the top (after existing imports):

```typescript
import { createHmrWatcher, type HmrWatcher } from './server/hmr.ts';
import { broadcast } from './server/ws.ts';
```

Then after `const wsHandler = createWsHandler(ctx);` (line 59), add:

```typescript
  // HMR watcher for live preview during generation (editor mode only)
  const hmrWatcher = ctx.mode === 'editor' ? createHmrWatcher(ctx, broadcast) : null;
```

Pass the watcher to the WS handler. Change line 59 from:

```typescript
  const wsHandler = createWsHandler(ctx);
```

to:

```typescript
  const wsHandler = createWsHandler(ctx, hmrWatcher);
```

Update the `StartServerResult` interface (line 33-37) to include the watcher:

```typescript
export interface StartServerResult {
  server: ReturnType<typeof Bun.serve>;
  ctx: ServerContext;
  shutdown: () => void;
  hmrWatcher?: HmrWatcher | null;
}
```

And add `hmrWatcher` to the return statement:

```typescript
  return { server, ctx, shutdown, hmrWatcher };
```

Also add `hmrWatcher.stop()` to the `shutdown` function so the watcher is cleaned up when the server stops:

```typescript
  function shutdown() {
    if (hmrWatcher) hmrWatcher.stop();
    // ... existing shutdown logic ...
  }
```

- [ ] **Step 2: Accept hmrWatcher in createWsHandler**

In `scripts/server/ws.ts`, update `createWsHandler` signature (line 90):

```typescript
export function createWsHandler(ctx: ServerContext, hmrWatcher?: HmrWatcher | null) {
```

Add the import at the top:

```typescript
import type { HmrWatcher } from './hmr.ts';
```

- [ ] **Step 3: Wrap onEvent to forward tool_result events to HMR watcher**

In `scripts/server/ws.ts`, update `createEventAdapter` (line 63) to accept an optional HMR watcher and intercept tool_result events **before** `translateEvent` strips internal fields:

```typescript
export function createEventAdapter(ws: ServerWebSocket<WsData>, hmrWatcher?: HmrWatcher | null): EventCallback {
  return (event: any) => {
    // Forward tool_result to HMR watcher before translateEvent strips _toolName/_filePath
    if (hmrWatcher && event.type === 'tool_result') {
      hmrWatcher.onToolResult(event);
    }
    try {
      for (const msg of translateEvent(event)) {
        ws.send(JSON.stringify(msg));
      }
    } catch (err: any) {
      if (err?.message?.includes('WebSocket') || ws.readyState !== 1) return;
      throw err;
    }
  };
}
```

Update the `open` handler (line 97) to pass the watcher:

```typescript
    open(ws: ServerWebSocket<WsData>) {
      console.log('[WS] Client connected');
      ws.data.onEvent = createEventAdapter(ws, hmrWatcher);
      connectedClients.add(ws);
    },
```

- [ ] **Step 4: Start/stop HMR watcher on generate and chat requests**

In `scripts/server/ws.ts`, in the `message` handler's switch statement, wrap the generate and chat cases to manage the HMR watcher lifecycle:

Use `try/finally` to ensure the watcher stops even if the handler throws.

For the `generate` case (around line 118):

```typescript
          case 'generate':
            if (hmrWatcher) hmrWatcher.start();
            try {
              await handleGenerate(ctx, onEvent, msg.prompt, msg.themeId, msg.model, msg.reference || null, !!msg.useAI);
            } finally {
              if (hmrWatcher) hmrWatcher.stop();
            }
            break;
```

For the `chat` case (around line 114):

```typescript
          case 'chat':
            if (hmrWatcher) hmrWatcher.start();
            try {
              await handleChat(ctx, onEvent, msg.message, msg.effects || [], msg.animationId || null, msg.model, msg.reference || null, msg.skillId || null, !!msg.useAI);
            } finally {
              if (hmrWatcher) hmrWatcher.stop();
            }
            break;
```

**Note:** `chat.ts` and `generate.ts` do NOT need modifications — the HMR watcher receives events via the `createEventAdapter` wrapper in `ws.ts`, which intercepts `tool_result` events before `translateEvent` strips internal fields. This covers both generate and chat in one place.

- [ ] **Step 5: Commit**

```bash
git add scripts/server.ts scripts/server/ws.ts
git commit -m "feat(server): wire up HMR watcher for live preview during generation"
```

---

### Task 2: Add `hmr_update` WebSocket handler and blob URL preview update in editor

**Files:**
- Modify: `skills/vibes/templates/editor.html`

- [ ] **Step 1: Add `isGenerating` flag**

In the editor's `<script>` section, find `let isThinking = false;` (line 3075). Add the new flag right after:

```javascript
  let isGenerating = false;
  let lastBlobUrl = null;
```

- [ ] **Step 2: Add `hmr_update` WebSocket message handler**

In the `ws.onmessage` handler (around line 3653), add a case for `hmr_update` after the existing message type checks. Find the `} else if (msg.type === 'cancelled') {` block and add before it:

```javascript
      } else if (msg.type === 'hmr_update') {
        // Live preview update — replace iframe content via blob URL
        const frame = document.getElementById('previewFrame');
        if (frame && msg.html) {
          if (lastBlobUrl) URL.revokeObjectURL(lastBlobUrl);
          const blob = new Blob([msg.html], { type: 'text/html' });
          lastBlobUrl = URL.createObjectURL(blob);
          frame.src = lastBlobUrl;
          // Show live content — make overlay semi-transparent and show LIVE badge
          const overlay = document.getElementById('previewOverlay');
          if (overlay) {
            overlay.classList.add('has-content');
            document.getElementById('previewLiveBadge').style.display = '';
          }
        }
```

- [ ] **Step 3: Commit**

```bash
git add skills/vibes/templates/editor.html
git commit -m "feat(editor): add hmr_update handler with blob URL preview updates"
```

---

### Task 3: Immediate phase transition on generate submit

**Files:**
- Modify: `skills/vibes/templates/editor.html`

- [ ] **Step 1: Modify `startGenerate()` to switch phase immediately**

Replace the body of `startGenerate()` (around line 4225). After the existing validation checks and payload construction, instead of just sending the WS message, also transition to edit phase. Find the end of `startGenerate()` where `ws.send(JSON.stringify(payload))` is called and add the phase transition:

After `ws.send(JSON.stringify(payload));` and `genClearReference();` (lines 4267-4268), add:

```javascript
    // Immediately transition to edit view
    isGenerating = true;
    setPhase('edit');
    addMessage('user', prompt);
    setThinking(true, 0, 'Starting Claude...', 0);
    showPreviewOverlay();
```

Remove the block at lines 4242-4246 that resets back to generate phase:

```javascript
    // If re-generating from edit phase, reset UI state
    if (currentPhase === 'edit') {
      document.getElementById('chatMessages').innerHTML = '';
      setPhase('generate');
    }
```

Replace it with:

```javascript
    // Clear chat for fresh generation
    document.getElementById('chatMessages').innerHTML = '';
```

- [ ] **Step 2: Update the `app_updated` handler**

Replace the `app_updated` handler (lines 3669-3680):

```javascript
      } else if (msg.type === 'app_updated') {
        console.log('[app_updated] phase:', currentPhase, 'isGenerating:', isGenerating);
        setThinking(false);
        if (!isVersionNav) versionPush();
        if (isGenerating) {
          isGenerating = false;
          hidePreviewOverlay();
          reloadPreview(); // Final reload with post-processed code
          autoSaveApp();
        } else {
          reloadPreview();
        }
```

- [ ] **Step 3: Update the `status` handler for dual progress routing**

Replace the `status` handler (lines 3656-3663):

```javascript
      if (msg.type === 'status') {
        if (msg.status === 'saving_theme') {
          updateSaveThemeProgress(msg.progress, msg.stage, msg.elapsed);
        } else if (isGenerating) {
          // During generation: update both chat indicator and preview overlay
          setThinking(true, msg.progress, msg.stage, msg.elapsed);
          updatePreviewOverlay(msg.progress, msg.stage);
        } else if (currentPhase === 'generate') {
          updateGenerateProgress(msg.progress, msg.stage, msg.elapsed);
        } else {
          setThinking(true, msg.progress, msg.stage, msg.elapsed);
        }
```

- [ ] **Step 4: Update error and cancel handlers**

Replace the `error` handler (lines 3681-3691):

```javascript
      } else if (msg.type === 'error') {
        setThinking(false);
        if (isGenerating) {
          isGenerating = false;
          hidePreviewOverlay();
        }
        if (currentPhase === 'generate') {
          document.getElementById('generateProgress').classList.remove('active');
          document.getElementById('generateActions').style.display = '';
          document.getElementById('generateBtn').disabled = false;
          const errEl = document.getElementById('generateError');
          errEl.textContent = msg.message;
          errEl.style.display = '';
        }
        addMessage('error', msg.message);
```

Replace the `cancelled` handler (lines 3692-3699):

```javascript
      } else if (msg.type === 'cancelled') {
        setThinking(false);
        if (isGenerating) {
          isGenerating = false;
          hidePreviewOverlay();
        }
        if (currentPhase === 'generate') {
          document.getElementById('generateProgress').classList.remove('active');
          document.getElementById('generateActions').style.display = '';
          document.getElementById('generateBtn').disabled = false;
        }
        addMessage('system', 'Request cancelled.');
```

- [ ] **Step 5: Commit**

```bash
git add skills/vibes/templates/editor.html
git commit -m "feat(editor): immediate phase transition to edit view on generate submit"
```

---

### Task 4: Preview overlay with themed placeholder and progress

**Files:**
- Modify: `skills/vibes/templates/editor.html` (CSS + HTML + JS)

**Note:** Task 3 calls `showPreviewOverlay`/`hidePreviewOverlay`/`updatePreviewOverlay` which are defined in this task. Implement Task 4 before Task 3 when executing, or implement all editor.html changes together in a single pass.

- [ ] **Step 1: Disable `.preview-panel.thinking` opacity during generation**

The existing CSS `.preview-panel.thinking { opacity: 0.5; }` (line 1089) would cause double-dimming with the new overlay. Change it to skip opacity when the overlay is active:

```css
    .preview-panel.thinking:not(:has(.preview-overlay:not(.hidden))) { opacity: 0.5; transition: opacity 0.3s; }
```

Or simpler — since the overlay handles the visual feedback during generation, just remove the opacity rule and replace with:

```css
    .preview-panel.thinking { transition: opacity 0.3s; }
```

- [ ] **Step 2: Add CSS for preview overlay**

Find the `.chat-send svg` CSS rule. Add after it:

```css
    /* Preview overlay for generation progress */
    .preview-overlay {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: var(--vibes-near-black, #1a1a1a);
      z-index: 10;
      transition: opacity 0.3s ease;
    }
    .preview-overlay.hidden { opacity: 0; pointer-events: none; }
    .preview-overlay.has-content { background: rgba(0,0,0,0.4); }
    .preview-overlay .preview-progress-label {
      font-size: 0.8125rem;
      color: #999;
      margin-bottom: 0.5rem;
      font-weight: 600;
    }
    .preview-overlay .preview-progress-bar {
      width: 60%;
      max-width: 240px;
      height: 4px;
      background: #333;
      border-radius: 2px;
      overflow: hidden;
    }
    .preview-overlay .preview-progress-fill {
      height: 100%;
      background: var(--vibes-blue, #4a9eff);
      border-radius: 2px;
      transition: width 0.3s ease;
    }
    .preview-overlay .preview-live-badge {
      position: absolute;
      top: 0.5rem;
      right: 0.5rem;
      font-size: 0.5rem;
      font-weight: 800;
      background: var(--vibes-blue, #4a9eff);
      color: #fff;
      padding: 0.1rem 0.4rem;
      border-radius: 3px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .preview-overlay .vibes-logo-loader {
      width: 64px;
      height: 64px;
      margin-bottom: 1rem;
      opacity: 0.6;
      animation: pulse 2s ease-in-out infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 0.4; transform: scale(0.95); }
      50% { opacity: 0.8; transform: scale(1.05); }
    }
```

- [ ] **Step 2: Add preview overlay HTML**

Find the preview iframe in the edit phase HTML. Search for `id="previewFrame"`. The iframe is inside a container. Add the overlay div as a sibling, right before the iframe. The container needs `position: relative` for the absolute overlay to work. Find the preview panel div (search for `previewPanel`) and add `position:relative` to its style if not already present, then add the overlay:

```html
          <div class="preview-overlay hidden" id="previewOverlay">
            <div class="preview-live-badge" style="display:none" id="previewLiveBadge">LIVE</div>
            <div id="previewLogoLoader" class="vibes-logo-loader">
              <svg viewBox="0 0 100 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="0" y="0" width="100" height="40" rx="20" fill="#222"/>
                <text x="50" y="26" text-anchor="middle" fill="#f0f0f0" font-family="system-ui" font-size="16" font-weight="800">VIBES</text>
              </svg>
            </div>
            <div class="preview-progress-label" id="previewProgressLabel">Starting Claude...</div>
            <div class="preview-progress-bar">
              <div class="preview-progress-fill" id="previewProgressFill" style="width:0%"></div>
            </div>
          </div>
```

- [ ] **Step 3: Add JavaScript for overlay show/hide/update**

Add these functions near the `setThinking` function:

```javascript
  function showPreviewOverlay() {
    const overlay = document.getElementById('previewOverlay');
    overlay.classList.remove('hidden', 'has-content');
    document.getElementById('previewLiveBadge').style.display = 'none';
    document.getElementById('previewProgressLabel').textContent = 'Starting Claude...';
    document.getElementById('previewProgressFill').style.width = '0%';
    // Theme background is stored by the theme_selected handler (Task 5)
    if (window.__selectedThemeBg) {
      overlay.style.background = window.__selectedThemeBg;
    } else {
      overlay.style.background = '';
    }
  }

  function hidePreviewOverlay() {
    const overlay = document.getElementById('previewOverlay');
    overlay.classList.add('hidden');
    if (lastBlobUrl) {
      URL.revokeObjectURL(lastBlobUrl);
      lastBlobUrl = null;
    }
  }

  function updatePreviewOverlay(progress, stage) {
    document.getElementById('previewProgressFill').style.width = (progress || 0) + '%';
    if (stage) document.getElementById('previewProgressLabel').textContent = stage;
  }
```

- [ ] **Step 4: Show LIVE badge when HMR content arrives**

In the `hmr_update` handler (from Task 2), the line `overlay.classList.add('has-content')` already makes the overlay semi-transparent. Also show the LIVE badge:

```javascript
          document.getElementById('previewLiveBadge').style.display = '';
```

This is already handled in the Task 2 handler — verify the `has-content` class and badge display are present.

- [ ] **Step 5: Commit**

```bash
git add skills/vibes/templates/editor.html
git commit -m "feat(editor): add preview overlay with progress and themed placeholder"
```

---

### Task 5: Expose theme colors to client for placeholder

**Files:**
- Modify: `scripts/server/handlers/generate.ts`
- Modify: `skills/vibes/templates/editor.html`

- [ ] **Step 1: Include theme colors in the `theme_selected` event**

In `scripts/server/handlers/generate.ts`, find where `theme_selected` is emitted (line 463):

```typescript
  onEvent({ type: 'theme_selected', themeId, themeName });
```

Add the theme's background color from `ctx.themeColors`:

```typescript
  const colors = ctx.themeColors[themeId] || null;
  onEvent({ type: 'theme_selected', themeId, themeName, themeBackground: colors?.bg || null });
```

- [ ] **Step 2: Handle theme_selected in editor to store background color**

In the editor's WebSocket message handler, find the `theme_selected` handler. Add storage of the background color:

```javascript
      } else if (msg.type === 'theme_selected') {
        // ... existing theme selection code ...
        // Store theme background for preview overlay
        if (msg.themeBackground) {
          window.__selectedThemeBg = msg.themeBackground;
        }
```

- [ ] **Step 3: Use stored theme background in showPreviewOverlay**

The `showPreviewOverlay()` function (defined in Task 4) already reads from `window.__selectedThemeBg`. No additional changes needed — Task 5 just ensures the value is populated before the overlay checks it.

- [ ] **Step 4: Commit**

```bash
git add scripts/server/handlers/generate.ts skills/vibes/templates/editor.html
git commit -m "feat: pass theme background color to client for preview placeholder"
```

---

### Task 6: Manual integration test

- [ ] **Step 1: Start the server**

```bash
VIBES_ROOT="${CLAUDE_PLUGIN_ROOT:-$(pwd)}"
bun "$VIBES_ROOT/scripts/server.ts" --mode=editor
```

- [ ] **Step 2: Test in browser**

Open `http://localhost:3333`. Enter a prompt and click Generate. Verify:
- Editor immediately switches to edit view (chat + preview split)
- Chat shows the user's prompt message with a progress indicator below
- Preview area shows overlay with progress bar
- As Claude writes code, the preview updates with partial app (LIVE badge appears)
- When generation completes, overlay disappears, app is fully visible

- [ ] **Step 3: Test error handling**

Disconnect network or cancel mid-generation. Verify:
- Error/cancellation message appears in chat
- Overlay dismisses
- `isGenerating` resets (user can send new messages)

- [ ] **Step 4: Test chat edits after generation**

After initial generation completes, send a chat edit ("change the background to blue"). Verify:
- HMR watcher activates for the chat edit
- Preview updates live during the edit
- Overlay does not reappear (only shows during `isGenerating`)
