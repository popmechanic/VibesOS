# Sharing/Invite System Reinstatement

**Date:** 2026-03-21
**Status:** Approved

## Summary

Re-activate the invite/sharing features that worked during the Fireproof era by wiring the client-side SharingBridge to the existing Deploy API endpoints. One UX improvement: public links are now auto-provisioned on deploy and stable (no more regeneration that breaks existing links).

## Background

The Deploy API already has full server-side invite infrastructure:
- `POST /apps/:name/invite` — finds/creates user via Pocket ID, adds to app's user group, returns OTA invite URL
- `POST /apps/:name/public-link` — generates UUID join token, stores on SubdomainRecord
- `GET /join/:app/:token` + `/join/callback` — PKCE flow that adds joining users to the group

The VibesPanel UI still dispatches the DOM events (`vibes-share-request`, `vibes-public-link-request`) but the SharingBridge that listened for them was stubbed out during the TinyBase migration.

## Scope

Three changes, all client-side except one small addition to the deploy script:

1. **`scripts/deploy-cloudflare.js`** — auto-provision public link on deploy
2. **`source-templates/base/template.html`** — reactivate SharingBridge component
3. **`components/VibesPanel/VibesPanel.tsx`** — swap "Generate Link" to "Copy Link"

No server-side (Deploy API) changes required.

## Design

### 1. Deploy-time public link provisioning

In `scripts/deploy-cloudflare.js`, after a successful deploy response:

1. Call `GET {deployApiUrl}/status/{appName}` to check if `publicInvite` exists
2. If missing, call `POST {deployApiUrl}/apps/{appName}/public-link` with the user's auth token
3. Log the join URL to terminal so the user sees it after deploy

This step is fire-and-forget — deploy succeeds regardless. Skip entirely for public apps (`__APP_PUBLIC__ === true`).

### 2. SharingBridge reactivation

Replace the stub `SharingBridge` in `source-templates/base/template.html` with a component that:

**On mount (when signed in):**
- Reads `appName` and `deployApiUrl` from `window.__APP_CONFIG__`
- Reads `accessToken` from `window.useOIDCContext()`
- Fetches `GET {deployApiUrl}/status/{appName}` to get existing `publicInvite.token`
- Computes join URL: `{deployApiUrl}/join/{appName}/{token}`
- Stores in a ref for instant access

**Event: `vibes-share-request`**
- Extracts `{ email }` from event detail
- Calls `POST {deployApiUrl}/apps/{appName}/invite` with Bearer token and `{ email }` body
- On success: dispatches `vibes-share-success` with `{ email, message, link }`
- On error: dispatches `vibes-share-error` with `{ error: { message } }`

**Event: `vibes-public-link-request`**
- Dispatches `vibes-public-link-success` with `{ link }` from cached join URL immediately
- Fallback: if no cached link, calls `POST /apps/:name/public-link`, caches result, then dispatches success

**Skip conditions:** If `appName` is placeholder (`__APP_NAME__`), `deployApiUrl` missing, or preview mode — do nothing. Renders `null`.

### 3. VibesPanel public link UI

Minimal changes to `components/VibesPanel/VibesPanel.tsx`:

- Remove "generating" intermediate state for public links
- Button starts as "Copy Link" (not "Generate Link")
- On click: dispatch `vibes-public-link-request` → SharingBridge responds instantly → link appears in input + copied to clipboard → "Copied!" feedback
- Keep error handler for edge case where no link exists
- No layout changes — dual-form structure stays identical

After editing, rebuild: `bun scripts/build-components.js --force && bun scripts/merge-templates.js --force`

## Data flow

```
Deploy CLI
  └─ deploy-cloudflare.js
       └─ POST /apps/:name/public-link (if not exists)
            └─ SubdomainRecord.publicInvite = { token, right, createdAt }

App loads (private, signed-in user)
  └─ SharingBridge mounts
       └─ GET /status/:name → caches publicInvite.token
       └─ Listens for DOM events

User clicks "Invite" → "Copy Link"
  └─ VibesPanel dispatches vibes-public-link-request
       └─ SharingBridge dispatches vibes-public-link-success { link }
            └─ VibesPanel copies to clipboard, shows "Copied!"

User clicks "Invite" → types email → "Submit"
  └─ VibesPanel dispatches vibes-share-request { email }
       └─ SharingBridge calls POST /apps/:name/invite
            └─ Deploy API → Pocket ID (find/create user, add to group, OTA)
                 └─ SharingBridge dispatches vibes-share-success { email, link }
                      └─ VibesPanel shows confirmation + "Copy Invite Link"
```

## Files modified

| File | Change |
|------|--------|
| `scripts/deploy-cloudflare.js` | Add public link provisioning after deploy |
| `source-templates/base/template.html` | Replace SharingBridge stub with working component |
| `components/VibesPanel/VibesPanel.tsx` | Swap "Generate Link" → "Copy Link", remove generating state |
| `build/vibes-menu.js` | Regenerated via build-components.js |
| `skills/*/templates/index.html` | Regenerated via merge-templates.js |
