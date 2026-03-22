# Sharing/Invite Reinstatement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-activate invite-by-email and copy-public-link sharing features by wiring the client-side SharingBridge to existing Deploy API endpoints.

**Architecture:** SharingBridge is a no-render React component in the base template that listens for DOM events from VibesPanel and calls Deploy API endpoints. Public links are auto-provisioned at deploy time so the UI is always "Copy Link" (never "Generate"). The component uses `window.useOIDCContext()` for auth tokens since it renders inside `<OIDCProvider>` in each delta template.

**Tech Stack:** React (createElement, no JSX — base template module script), Deploy API (fetch), Vitest (unit tests)

**Spec:** `docs/superpowers/specs/2026-03-21-sharing-reinstatement-design.md`

---

### Task 1: Add SharingBridge to vibes delta render tree

**Files:**
- Modify: `skills/vibes/template.delta.html:249` — add `<SharingBridge />` inside `<SignedIn>`
- Test: `scripts/__tests__/unit/tinybase-template.test.js` — add assertion

- [ ] **Step 1: Write the failing test**

In `scripts/__tests__/unit/tinybase-template.test.js`, add a new test at the end of the describe block:

```javascript
  it('vibes delta renders SharingBridge inside SignedIn', () => {
    const delta = readFileSync(join(PLUGIN_ROOT, 'skills/vibes/template.delta.html'), 'utf8');
    expect(delta).toContain('<SharingBridge />');
    // Must be inside SignedIn, before AppContext.Provider
    const sharingIdx = delta.indexOf('<SharingBridge />');
    const signedInIdx = delta.indexOf('<SignedIn>');
    const appCtxIdx = delta.indexOf('<AppContext.Provider', sharingIdx);
    expect(sharingIdx).toBeGreaterThan(signedInIdx);
    expect(sharingIdx).toBeLessThan(appCtxIdx);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd scripts && npx vitest run __tests__/unit/tinybase-template.test.js`
Expected: FAIL — `<SharingBridge />` not found in delta

- [ ] **Step 3: Add SharingBridge to vibes delta**

In `skills/vibes/template.delta.html`, inside the private app OIDC section, add `<SharingBridge />` on line 250 (after `<SignedIn>`, before `<AppContext.Provider>`):

```jsx
          <SignedIn>
            <SharingBridge />
            <AppContext.Provider value={{ isReady, isSyncing, user }}>
```

This matches the pattern in `skills/riff/template.delta.html:162`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd scripts && npx vitest run __tests__/unit/tinybase-template.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add skills/vibes/template.delta.html scripts/__tests__/unit/tinybase-template.test.js
git commit -m "feat: add SharingBridge to vibes delta render tree"
```

---

### Task 2: Reactivate SharingBridge in base template

**Files:**
- Modify: `source-templates/base/template.html:332-338` — replace stub with working component
- Test: `scripts/__tests__/unit/tinybase-template.test.js` — add assertion

The SharingBridge is in a `<script type="module">` block (plain ES module, not Babel/JSX), so it must use `React.createElement`, `React.useEffect`, `React.useRef`, `React.useState` — same style as `SyncStatusDot` above it in the file.

- [ ] **Step 1: Write the failing test**

In `scripts/__tests__/unit/tinybase-template.test.js`, add:

```javascript
  it('base template SharingBridge is not a stub', () => {
    const base = readFileSync(join(PLUGIN_ROOT, 'source-templates/base/template.html'), 'utf8');
    // Should contain the working SharingBridge, not the stub
    expect(base).toContain('SharingBridge');
    expect(base).toContain('vibes-share-request');
    expect(base).toContain('vibes-public-link-request');
    expect(base).toContain('vibes-share-success');
    expect(base).toContain('vibes-public-link-success');
    // Should NOT contain the stub comment
    expect(base).not.toContain('Stub — sharing will be redesigned');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd scripts && npx vitest run __tests__/unit/tinybase-template.test.js`
Expected: FAIL — base template contains stub comment, missing event names

- [ ] **Step 3: Replace SharingBridge stub with working component**

In `source-templates/base/template.html`, replace the stub (lines 332-338) with:

```javascript
      // === SharingBridge ===
      // Listens for VibesPanel DOM events and calls Deploy API endpoints.
      // Rendered inside OIDCProvider in delta templates — has access to useOIDCContext().
      function SharingBridge() {
        var oidc = window.useOIDCContext ? window.useOIDCContext() : {};
        var accessToken = oidc.accessToken;
        var config = window.__APP_CONFIG__ || {};
        var appName = config.appName;
        var deployApiUrl = config.deployApiUrl;
        var joinLinkRef = React.useRef(null);
        var fetchedRef = React.useRef(false);

        // Skip in preview mode, placeholder config, or when not signed in
        var skip = !appName || appName === '__APP_NAME__' || !deployApiUrl ||
                   deployApiUrl.startsWith('__') || !accessToken;

        // Fetch existing public link on mount
        React.useEffect(function() {
          if (skip || fetchedRef.current) return;
          fetchedRef.current = true;
          fetch(deployApiUrl + '/status/' + encodeURIComponent(appName), {
              headers: { 'Authorization': 'Bearer ' + accessToken }
            })
            .then(function(r) { return r.ok ? r.json() : null; })
            .then(function(data) {
              if (data && data.publicInvite && data.publicInvite.token) {
                joinLinkRef.current = deployApiUrl + '/join/' +
                  encodeURIComponent(appName) + '/' + data.publicInvite.token;
              }
            })
            .catch(function(err) {
              console.warn('[SharingBridge] Failed to fetch public link:', err);
            });
        }, [skip]);

        // Listen for share-request (email invite)
        React.useEffect(function() {
          if (skip) return;
          function handleShareRequest(e) {
            var detail = e.detail || {};
            var email = detail.email;
            if (!email) return;
            fetch(deployApiUrl + '/apps/' + encodeURIComponent(appName) + '/invite', {
              method: 'POST',
              headers: {
                'Authorization': 'Bearer ' + accessToken,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ email: email })
            })
            .then(function(r) {
              if (!r.ok) return r.json().then(function(err) { throw new Error(err.error || 'Invite failed'); });
              return r.json();
            })
            .then(function(data) {
              document.dispatchEvent(new CustomEvent('vibes-share-success', {
                detail: {
                  email: email,
                  message: 'Invitation sent to ' + email + '!',
                  link: data.inviteUrl || ''
                }
              }));
            })
            .catch(function(err) {
              document.dispatchEvent(new CustomEvent('vibes-share-error', {
                detail: { error: { message: err.message || 'Failed to send invitation.' } }
              }));
            });
          }
          document.addEventListener('vibes-share-request', handleShareRequest);
          return function() { document.removeEventListener('vibes-share-request', handleShareRequest); };
        }, [skip, accessToken]);

        // Listen for public-link-request (copy link)
        React.useEffect(function() {
          if (skip) return;
          function handlePublicLinkRequest(e) {
            // Return cached link immediately if available
            if (joinLinkRef.current) {
              document.dispatchEvent(new CustomEvent('vibes-public-link-success', {
                detail: { link: joinLinkRef.current }
              }));
              return;
            }
            // Fallback: provision a new link
            var detail = e.detail || {};
            fetch(deployApiUrl + '/apps/' + encodeURIComponent(appName) + '/public-link', {
              method: 'POST',
              headers: {
                'Authorization': 'Bearer ' + accessToken,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ right: detail.right || 'write' })
            })
            .then(function(r) {
              if (!r.ok) return r.json().then(function(err) { throw new Error(err.error || 'Failed to generate link'); });
              return r.json();
            })
            .then(function(data) {
              joinLinkRef.current = data.joinUrl;
              document.dispatchEvent(new CustomEvent('vibes-public-link-success', {
                detail: { link: data.joinUrl }
              }));
            })
            .catch(function(err) {
              document.dispatchEvent(new CustomEvent('vibes-public-link-error', {
                detail: { error: err.message || 'Failed to generate public link.' }
              }));
            });
          }
          document.addEventListener('vibes-public-link-request', handlePublicLinkRequest);
          return function() { document.removeEventListener('vibes-public-link-request', handlePublicLinkRequest); };
        }, [skip, accessToken]);

        return null;
      }
      window.SharingBridge = SharingBridge;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd scripts && npx vitest run __tests__/unit/tinybase-template.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add source-templates/base/template.html scripts/__tests__/unit/tinybase-template.test.js
git commit -m "feat: reactivate SharingBridge with Deploy API integration"
```

---

### Task 3: Auto-provision public link on deploy

**Files:**
- Modify: `scripts/deploy-cloudflare.js:116-127` — add public link provisioning after deploy
- Test: `scripts/__tests__/unit/tinybase-deploy.test.js` — add assertion

- [ ] **Step 1: Read existing deploy test file**

Read `scripts/__tests__/unit/tinybase-deploy.test.js` to understand current test patterns before writing the new test.

- [ ] **Step 2: Write the failing test**

In `scripts/__tests__/unit/tinybase-deploy.test.js`, add a test that verifies the deploy script contains the public link provisioning code:

```javascript
  it('deploy script provisions public link after deploy', () => {
    const script = readFileSync(join(PLUGIN_ROOT, 'scripts/deploy-cloudflare.js'), 'utf8');
    expect(script).toContain('/public-link');
    expect(script).toContain('/status/');
  });
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd scripts && npx vitest run __tests__/unit/tinybase-deploy.test.js`
Expected: FAIL — deploy script doesn't contain `/public-link` or `/status/`

- [ ] **Step 4: Add public link provisioning to deploy script**

In `scripts/deploy-cloudflare.js`, after the deploy result is received (after line 118 `const deployedUrl = ...`), add:

```javascript
  // Auto-provision public invite link for private apps (fire-and-forget)
  try {
    const statusResp = await fetch(`${DEPLOY_API_URL}/status/${encodeURIComponent(name)}`);
    if (statusResp.ok) {
      const statusData = await statusResp.json();
      // Only provision for private apps (have oidcClientId) without existing link
      if (statusData.oidcClientId && !statusData.publicInvite?.token) {
        const linkResp = await fetch(`${DEPLOY_API_URL}/apps/${encodeURIComponent(name)}/public-link`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${tokens.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ right: 'write' }),
        });
        if (linkResp.ok) {
          const linkData = await linkResp.json();
          if (linkData.joinUrl) {
            console.log(`Invite link: ${linkData.joinUrl}`);
          }
        }
      } else if (statusData.publicInvite?.token) {
        console.log(`Invite link: ${DEPLOY_API_URL}/join/${encodeURIComponent(name)}/${statusData.publicInvite.token}`);
      }
    }
  } catch (linkErr) {
    // Non-fatal — deploy already succeeded
    console.warn('Note: Could not provision invite link:', linkErr.message);
  }
```

Insert this block between the `setApp()` call (line 121-125) and the final `console.log` (line 127).

- [ ] **Step 5: Run test to verify it passes**

Run: `cd scripts && npx vitest run __tests__/unit/tinybase-deploy.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add scripts/deploy-cloudflare.js scripts/__tests__/unit/tinybase-deploy.test.js
git commit -m "feat: auto-provision public invite link on deploy"
```

---

### Task 4: Update VibesPanel "Generate Link" to "Copy Link"

**Files:**
- Modify: `components/VibesPanel/VibesPanel.tsx:67-78,262-296` — change button behavior
- No new test file needed — this is a UI behavior change tested via E2E

- [ ] **Step 1: Replace both public link handlers with unified handler**

In `components/VibesPanel/VibesPanel.tsx`:

First, **delete** the existing `handleGeneratePublicLink` function (lines 67-78) and the existing `handleCopyPublicLink` function (lines 80-86). Replace both with a single unified handler:

```typescript
  const handleCopyPublicLink = () => {
    if (publicLink) {
      navigator.clipboard.writeText(publicLink).then(() => {
        setPublicLinkCopied(true);
        setTimeout(() => setPublicLinkCopied(false), 2000);
      });
      return;
    }
    // First click: request link from SharingBridge (instant from cache)
    setPublicLinkStatus("generating");
    document.dispatchEvent(
      new CustomEvent("vibes-public-link-request", {
        detail: { right: "write" },
      }),
    );
  };
```

- [ ] **Step 2: Update the handlePublicLinkSuccess handler**

In the `useEffect` block (lines 139-143), update `handlePublicLinkSuccess` to also auto-copy the link:

```typescript
    const handlePublicLinkSuccess = (event: Event) => {
      const customEvent = event as CustomEvent<{ link: string }>;
      const link = customEvent.detail?.link || "";
      setPublicLinkStatus("success");
      setPublicLink(link);
      setPublicLinkMessage("Link copied!");
      if (link) {
        navigator.clipboard.writeText(link).then(() => {
          setPublicLinkCopied(true);
          setTimeout(() => setPublicLinkCopied(false), 2000);
        });
      }
    };
```

- [ ] **Step 3: Update the public link label, placeholder, and button**

In the public link form section:

Update the label (line 263-264) from `"Generate public link"` to `"Public link"`:

```tsx
                  <label style={getInviteLabelStyle()}>
                    Public link
                  </label>
```

Update the input placeholder (line 275) from `"Click below to generate"` to `"Click Copy Link below"`:

```tsx
                    placeholder={
                      publicLinkStatus === "generating"
                        ? "Generating..."
                        : publicLinkStatus === "error"
                          ? publicLinkMessage
                          : "Click Copy Link below"
                    }
```

Update the button (around lines 283-295) to use the unified handler and show "Copy Link" by default:

```tsx
                  <VibesButton
                    variant={YELLOW}
                    onClick={handleCopyPublicLink}
                    disabled={publicLinkStatus === "generating"}
                  >
                    {publicLinkStatus === "generating"
                      ? "Copying..."
                      : publicLinkCopied
                        ? "Copied!"
                        : "Copy Link"}
                  </VibesButton>
```

- [ ] **Step 4: Rebuild components and templates**

Run:
```bash
bun scripts/build-components.js --force
bun scripts/merge-templates.js --force
```

- [ ] **Step 5: Run existing tests to verify nothing broke**

Run: `cd scripts && npx vitest run`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add components/VibesPanel/VibesPanel.tsx build/vibes-menu.js
git commit -m "feat: change public link UI from Generate to Copy Link"
```

---

### Task 5: Regenerate templates and verify

**Files:**
- Regenerated: `skills/*/templates/index.html` (via merge-templates.js)

- [ ] **Step 1: Run template merge**

```bash
bun scripts/merge-templates.js --force
```

- [ ] **Step 2: Verify generated templates contain SharingBridge**

Run: `cd scripts && npx vitest run __tests__/unit/tinybase-template.test.js`
Expected: PASS

- [ ] **Step 3: Run full test suite**

Run: `cd scripts && npx vitest run`
Expected: All tests PASS

- [ ] **Step 4: Commit generated files**

```bash
git add skills/*/templates/*.html
git commit -m "chore: regenerate templates with SharingBridge"
```

---

### Task 6: Manual E2E verification

This task verifies the complete flow works end-to-end.

- [ ] **Step 1: Deploy a test app**

```bash
bun scripts/deploy-cloudflare.js --name test-sharing --file <path-to-test-app>
```

Verify:
- Deploy succeeds
- Terminal shows invite link after deploy

- [ ] **Step 2: Verify invite UI in browser**

Open the deployed app. Sign in. Open the Vibes menu → Invite.
- Public link section should show "Copy Link" button (not "Generate Link")
- Click "Copy Link" — link should be copied to clipboard, button shows "Copied!"
- Email invite: type an email, submit — should show success/error feedback

- [ ] **Step 3: Verify public link works**

Paste the copied link in an incognito window. Should:
- Redirect to Pocket ID login
- After auth, redirect back to the app with `?joined=true`
