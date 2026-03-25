# Public App Per-User Identity

**Date:** 2026-03-25
**Status:** Approved

## Problem

Public apps have no user identity. When an app needs per-user state (voting, turns, preferences), all users share the `'anonymous'` fallback identifier, so one person's action overwrites everyone else's.

Private apps solve this with OIDC email — every user signs in and gets a unique email as their identifier. Public apps have no auth, so `useUser()` is undefined.

## Solution

When the agent detects multiplayer/per-user patterns in a public app prompt, it generates a username picker gate before the main app. The self-selected username becomes the unique identifier for per-user state, replacing `oidcUser.email` in the same patterns that already work for private apps.

## Detection

The agent already classifies apps in Step 0 (app classification before table design). For public apps, if the prompt implies per-user state — voting, turns, "each user gets", collaborative editing, teams, scoring, polls — the agent treats it as a **public multiplayer** app and generates the username gate.

Single-player public apps (calculators, timers, dashboards, simple tools) skip it entirely.

## Mechanics

### Username Picker

1. On first visit, the app shows a username input before the main UI.
2. The agent styles this to feel native to the app — guidance describes UX flow only, not aesthetics. The picker should feel organically part of the app, not a separate system screen.
3. No uniqueness enforcement — if two people pick the same name, they'll see the issue and one will change it. Enforcing uniqueness adds complexity the agent has to get right.

### Storage

1. The chosen username is saved to `localStorage` under `vibes_username_{appName}`.
2. The username is registered in a shared `users` TinyBase table keyed by the username string: `{ username, joinedAt }`.
3. All per-user rows use `createdBy: username` — same pattern as private apps use with email.

### Return Visits

1. On return visits, check `localStorage` first. If a username exists, skip the picker and go straight to the app.
2. A "change name" affordance is available somewhere in the UI — the agent decides placement and style to fit the app.

### Identity Resolution Pattern

The agent generates a `useIdentity()` pattern (or equivalent inline logic) that provides the current user's identifier regardless of app type:

- **Private app:** `oidcUser.email` (from `useUser()`)
- **Public multiplayer app:** self-selected username (from localStorage + `users` table)
- **Public single-player app:** no identity needed, no gate shown

## Doc Changes

### multiplayer-guide.md

New section "Public Multiplayer Apps" covering:
- When it applies (public app + per-user state detected)
- The username gate UX pattern (mechanics only, not aesthetics)
- The `users` table registration pattern
- How `createdBy` works with usernames instead of email
- Return visit behavior (localStorage auto-resume)

### data-api.md

Update the `useUser()` / "Getting the Signed-In User" section to:
- Explain that `useUser()` is for private apps only
- Reference the multiplayer guide's public multiplayer section for public apps needing per-user state
- Clarify that `'anonymous'` fallback is for preview mode, not for public multiplayer

### generation-rules.md

Add public multiplayer to Step 0 classification:
- If public app + prompt implies per-user state → public multiplayer → generate username gate
- If public app + single-player → no gate needed

### bug-prevention.md

Update the `'anonymous'` fallback guidance:
- The `'anonymous'` fallback is for **preview mode only** (testing before deploy)
- Public apps that need per-user state must use the username gate pattern, not the anonymous fallback
- If multiple users all show as `'anonymous'`, per-user state is broken

## What Doesn't Change

- **Private app flow** — unchanged, email remains the identifier
- **Template deltas** — no changes; this is entirely agent-generated code guided by skill docs
- **The `useUser()` guard pattern** — still needed for preview mode; the username pattern is orthogonal
- **Single-player public apps** — no username gate, no per-user state needed
