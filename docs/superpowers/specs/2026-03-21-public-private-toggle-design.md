# Public/Private Toggle with Progressive AI — Design

**Date:** 2026-03-21
**Status:** Approved

## Problem

Public TinyBase apps can't use AI because the AI proxy requires an OIDC token. Users need a way to choose whether their app is public (no auth, no AI) or private (OIDC sign-in, AI enabled).

## Goal

Add a progressive toggle UI to the editor prompt form: "Use theme?" and "Private?" chips, with "Use AI?" appearing only after Private is selected.

## UI Component

Three chip buttons in the prompt form row (same position as current "Themed" and "Use AI" chips):

**Chip states:**
- Inactive: outlined/ghost style, label ends with `?` (e.g., "Use theme?")
- Active: solid/filled style, question mark removed (e.g., "Use theme")
- "Use AI?" chip is hidden until "Private" is active

**Progressive disclosure:**
```
Default:        [Use theme?]  [Private?]
Theme selected: [Use theme]   [Private?]
Private on:     [Use theme?]  [Private]   [Use AI?]
AI on:          [Use theme?]  [Private]   [Use AI]
```

## Interactions

- Click `Use theme?` → becomes `Use theme` (active)
- Select theme from carousel → auto-activates `Use theme`
- Click `Private?` → becomes `Private` (active), reveals `Use AI?` chip
- Click `Use AI?` → becomes `Use AI` (active)
- Deselect `Private` → hides and deselects `Use AI`, reverts to `Private?`
- Deselect `Use theme` → deselects theme, reverts to `Use theme?`

## Data Flow

### Generate Message

The WebSocket generate message adds `isPrivate`:

```javascript
{ type: 'generate', prompt, themeId, model, useAI, isPrivate }
```

### Server: generate.ts

Receives `isPrivate` from the WebSocket message. Stores it in app metadata (alongside the app name) so the deploy handler can read it.

### Server: deploy.ts

Reads `isPrivate` from app metadata. When deploying:
- If `isPrivate` is true: sets `__APP_PUBLIC__` to `false`
- If `isPrivate` is false (default): sets `__APP_PUBLIC__` to `true`

### Template Runtime (no changes needed)

The template delta already handles both modes:
- `config.public === true`: renders app directly, no auth gate
- `config.public === false` + OIDC configured: loads OIDC bridge, shows sign-in gate, then renders app

### AI Instructions

When `useAI` is true in the generate message, `AI_INSTRUCTIONS_GENERATE` is appended to the prompt. This is existing behavior — no change needed.

## Files Changed

| File | Change |
|------|--------|
| `skills/vibes/templates/editor.html` | Replace "Themed"/"Use AI" chips with progressive "Use theme?"/"Private?"/"Use AI?" chips. Rename JS functions. Theme carousel auto-activates "Use theme". |
| `scripts/server/ws.ts` | Pass `isPrivate` field from generate message to handler |
| `scripts/server/handlers/generate.ts` | Accept and store `isPrivate` in app metadata |
| `scripts/server/handlers/deploy.ts` | Read `isPrivate` from app metadata, set `__APP_PUBLIC__` accordingly |
| `scripts/server/app-context.js` | Store `isPrivate` flag per app (alongside appName, directory) |

## What Doesn't Change

- Template delta (already handles public/private branching)
- Deploy API (already injects `__APP_PUBLIC__` and writes `app-meta:` KV keys)
- Dispatch worker auth gate (already reads `app-meta:` KV keys)
- SKILL.md / generate prompts (builder doesn't know about auth)
- OIDC bridge (already loaded for private apps)
- `bundles/vibes-ai.js` (already checks for OIDC token)
