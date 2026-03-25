# Public App Per-User Identity

**Date:** 2026-03-25
**Status:** Approved

## Problem

Public apps have no meaningful user identity. When an app needs per-user state (voting, turns, preferences), all users share the `'anonymous'` fallback identifier, so one person's action overwrites everyone else's.

Private apps solve this with OIDC email — every user signs in and gets a unique email as their identifier. Public apps have no auth. Note: the template installs a `useUser` stub for public apps that returns `{ email: null }`, so `useUser` is technically defined but provides no useful identity.

## Solution

When the agent detects multiplayer/per-user patterns in a public app prompt, it generates a username picker gate before the main app. A stable UUID (generated once, stored in localStorage) becomes the actual identity key for per-user state. The self-selected display name is cosmetic — stored alongside the UUID but never used as a row key.

## Detection

The agent classifies apps in Step 0 (in `data-api.md`). For public apps, if the prompt implies per-user state — voting, turns, "each user gets", collaborative editing, teams, scoring, polls — the agent treats it as a **public multiplayer** app and generates the username gate.

Single-player public apps (calculators, timers, dashboards, simple tools) skip it entirely.

## Mechanics

### Username Picker

1. On first visit, the app shows a username input before the main UI.
2. The agent styles this to feel native to the app — guidance describes UX flow only, not aesthetics. The picker should feel organically part of the app, not a separate system screen.
3. No uniqueness enforcement on display names. If two people pick the same name, they'll see the issue and one can change it.
4. Username must be a non-empty trimmed string. The agent validates before accepting.

### Identity Model

localStorage stores a JSON object under `vibes_user_{appName}` (where `appName` is a hardcoded string the agent derives from the app name, e.g. `vibes_user_button_poll`):

```json
{ "id": "crypto.randomUUID()", "name": "Alice" }
```

- **`id` (UUID)** — the stable identity key. Used as `createdBy` in all per-user rows and as the row key in the `users` table. Never changes.
- **`name` (display name)** — cosmetic. Shown in UI, stored as a cell in the `users` table. Can be changed without breaking data.

This mirrors private apps where email is the stable key and firstName is the display name.

### Users Table

The `users` TinyBase table is keyed by UUID:

| Row Key (UUID) | `name` | `joinedAt` |
|---|---|---|
| `a1b2c3...` | Alice | 1711382400000 |
| `d4e5f6...` | Bob | 1711382401000 |

All per-user rows in other tables use `createdBy: uuid` — same pattern as private apps use with email.

### Return Visits

1. On return visits, check localStorage first. If a user object exists (has `id` and `name`), skip the picker and go straight to the app.
2. A "change name" affordance is available somewhere in the UI — the agent decides placement and style to fit the app. Changing the name updates only the `name` cell in the `users` table and the `name` field in localStorage. The UUID and all `createdBy` references remain stable.

### Username Picker Placement

The username picker must render **inside** the `App` component, after the `useApp()` call, so TinyBase sync is active when the user registers. The pattern is a `useState` gate:

```
function App() {
  const { isReady } = useApp();
  const [user, setUser] = useState(() => loadFromLocalStorage());

  if (!user) return <UsernamePickerUI onSubmit={...} />;
  return <MainAppUI user={user} />;
}
```

This is a pattern guide — the agent adapts the actual implementation and styling to fit each app.

### Identity Resolution

The agent provides the current user's identifier regardless of app type:

- **Private app:** `oidcUser.email` (from `useUser()`, checked via `useUser()?.user?.email` being a real string, not just `typeof useUser === 'function'`)
- **Public multiplayer app:** UUID from localStorage + `users` table
- **Public single-player app:** no identity needed, no gate shown

## Doc Changes

### multiplayer-guide.md

New section "Public Multiplayer Apps" covering:
- When it applies (public app + per-user state detected)
- The username gate UX pattern (mechanics only, not aesthetics)
- The UUID + display name identity model
- The `users` table registration pattern (keyed by UUID, `name` cell for display)
- How `createdBy` works with UUID instead of email
- Return visit behavior (localStorage auto-resume)
- Name changes update display only, identity stays stable

Revise existing "private apps required" statements (lines 82, 110) to: "Multiplayer apps need user identity. Private apps get this from OIDC email. Public apps can use the username gate pattern (see Public Multiplayer Apps section)."

### data-api.md

Update Step 0 classification to include public multiplayer:
- If public app + prompt implies per-user state → public multiplayer → generate username gate
- If public app + single-player → no gate needed

Update the `useUser()` / "Getting the Signed-In User" section:
- Clarify that `useUser()` provides meaningful identity in private apps only
- Note that the template installs a `useUser` stub for public apps (returns `{ email: null }`), so checking `typeof useUser === 'function'` does NOT distinguish private from public — check `useUser()?.user?.email` for a real string instead
- Reference the multiplayer guide's public multiplayer section for public apps needing per-user state
- Clarify that `'anonymous'` fallback is for preview mode only, not for public multiplayer

### generation-rules.md

Cross-reference the Step 0 classification in data-api.md for public multiplayer detection.

### bug-prevention.md

Update the `'anonymous'` fallback guidance:
- The `'anonymous'` fallback is for **preview mode only** (testing before deploy)
- Public apps that need per-user state must use the username gate pattern, not the anonymous fallback
- If multiple users all show as `'anonymous'`, per-user state is broken

New entry: "useUser() stub in public apps":
- `useUser` is always defined (template installs a stub for public apps)
- The stub returns `{ email: null }` — do not use `typeof useUser === 'function'` as a proxy for "is this a private app"
- Check `useUser()?.user?.email` for a truthy string to determine if real auth is available

## What Doesn't Change

- **Private app flow** — unchanged, email remains the identifier
- **Template deltas** — no changes; this is entirely agent-generated code guided by skill docs
- **The `useUser()` guard pattern** — still needed for preview mode (returns null email via stub). The username pattern is orthogonal.
- **Single-player public apps** — no username gate, no per-user state needed
