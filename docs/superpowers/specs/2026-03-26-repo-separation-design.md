# Repo Separation Design: VibesOS / vibes-infra / vibes-dev-tools

**Date:** 2026-03-26
**Status:** Draft (rev 5 — moved jwt-validation + ai-proxy test to infra)

## Summary

Split the current monolithic `vibes-skill` repository into three repositories that cleanly separate user-facing open-source plugin code from private backend infrastructure and internal development tooling.

## Motivation

The current repo mixes:
- **Open-source plugin code** (skills, templates, CLI tools) that end users need
- **Backend infrastructure** (Cloudflare Workers, OIDC identity server, AI proxy) that contains secrets, account IDs, and internal architecture details
- **Internal dev tooling** (eval/autoresearch) that only maintainers use

Distributing backend source creates security risks (exposed account IDs, architecture details) and clutters the open-source repo with code users can't use.

## The Three Repos

### VibesOS (public, existing repo — cleaned up)

The Claude Code plugin. Everything a user needs to install and use Vibes: skills, scripts, templates, components, build system, bundles, CLI auth/deploy client, local preview server, and tests.

The GitHub repo is already named `VibesOS`. The local directory will be renamed from `vibes-skill` to `VibesOS`.

The plugin `name` field in `plugin.json` stays `vibes` — that's the Claude Code plugin identifier.

### vibes-infra (private, new repo)

Backend infrastructure and operational code:
- Cloudflare Workers powering the platform
- Pocket ID OIDC identity server
- Desktop app (ElectroBun + build/sign/notarize/DMG)
- CI/CD, operational runbooks, and monitoring (future)
- All `.env` files and wrangler secrets

### vibes-dev-tools (private, new repo)

Internal development and quality tooling:
- Eval/autoresearch infrastructure (harness, parallel runner, scoring, SSR checks)
- Fixture verification
- Autoresearch agent definitions and plugin

## File Manifest

### vibes-infra gets:

| Path | Description |
|------|-------------|
| `deploy-api/` | Deploy API Worker (source, tests, wrangler.toml) |
| `dispatch-worker/` | TinyBase sync Durable Object |
| `ai-worker/` | OpenRouter AI proxy worker |
| `alchemy/` | Pocket ID OIDC server (container + worker) |
| `scripts/install-worker/` | DMG distribution worker |
| `scripts/__tests__/unit/install-worker.test.js` | Install worker unit test |
| `scripts/lib/jwt-validation.js` | JWT validation (only used by infra code) |
| `scripts/__tests__/unit/jwt-validation.test.js` | JWT validation unit test |
| `scripts/__tests__/unit/jwt-sync-check.test.js` | JWT sync check unit test |
| `scripts/__tests__/unit/ai-proxy.test.js` | AI proxy unit test |
| `scripts/install.sh` | CLI install script (served by install worker) |
| `scripts/build-desktop.sh` | Desktop build + sign + DMG |
| `scripts/templates/` | nginx/systemd configs for registry server |
| `skills/cloudflare/worker/` | Registry worker (vibes-registry, has KV namespace IDs and secrets) |
| `scripts/deployables/` | AI proxy server deploy script (ai-proxy.js for exe.dev VMs) |
| `skills/upload-dmg/` | DMG upload skill (depends on desktop pipeline + install worker) |
| `vibes-desktop/` | ElectroBun desktop app |
| `.env`, `.env.backup`, `.env.example` | Secrets and env templates |
| `.connect` | Legacy Connect config |
| `wrangler.jsonc`, `wrangler.jsonc.bak` | Root wrangler configs |

### vibes-dev-tools gets:

| Path | Description |
|------|-------------|
| `scripts/eval-harness.ts` | Tier 2 render-and-record harness |
| `scripts/eval-parallel.ts` | Parallel autoresearch orchestrator |
| `scripts/eval-report.ts` | Report generator |
| `scripts/eval-scoring.ts` | Triple-run scoring |
| `scripts/eval-ssr-check.ts` | Tier 1.5 SSR smoke test |
| `scripts/eval-static-check.js` | Static analysis check |
| `scripts/verify-tinybase-fixtures.mjs` | Fixture verification (JS) |
| `scripts/verify-tinybase-fixtures.sh` | Fixture verification (shell) |
| `autoresearch-vibes/` | Autoresearch plugin |
| `eval/` | Eval data/results |
| `eval-results-playground.html` | Eval results viewer |
| `eval-test.html` | Eval test page |
| `skills/autoresearch/` | Autoresearch skill (references eval scripts) |
| `.claude/agents/autoresearch-*.md` | Autoresearch agent definitions |
| `.claude/agent-memory/autoresearch-*/` | Autoresearch agent memory files |
| `scripts/__tests__/unit/eval-*.test.*` | Unit tests for eval scripts (6 files) |
| `scripts/__tests__/integration/eval-*.test.*` | Integration tests for eval scripts (3 files) |

### VibesOS keeps:

| Path | Description |
|------|-------------|
| `.claude-plugin/` | Plugin manifest |
| `skills/` | User-facing skills (vibes, cloudflare, sell, launch, riff, design, test, vibes-brainstorm). Note: `skills/autoresearch/` moves to dev-tools, `skills/upload-dmg/` and `skills/cloudflare/worker/` move to infra. |
| `plugins/` | Sub-plugins (julian) |
| `assets/` | Static assets (images, favicon, vendor JS) |
| `scripts/assemble.js`, `assemble-all.js`, `assemble-sell.js` | Template assembly |
| `scripts/deploy-cloudflare.js` | CLI deploy client |
| `scripts/merge-templates.js` | Template merge |
| `scripts/build-components.js` | Component build |
| `scripts/build-design-tokens.js` | Design token build |
| `scripts/generate-riff.js` | Riff generation |
| `scripts/server.ts`, `scripts/server/` | Local preview server |
| `scripts/lib/` | Shared libraries (cli-auth, auth-constants, paths, registry, etc.) |
| `scripts/__tests__/`, `scripts/vitest.config.js` | Tests |
| `scripts/package.json` | Scripts dependencies |
| `source-templates/` | Base HTML templates |
| `components/` | UI components |
| `bundles/` | Client-side bundles (OIDC bridge, AI integration, SSE parser) |
| `build/` | Build outputs (tracked subset) |
| `hooks/` | Plugin hooks |
| `examples/` | Example apps |
| `docs/` | Documentation |
| `.claude/rules/` | Shared Claude rules |
| `README.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `LICENSE` | Documentation |
| `.gitignore`, `.gitattributes` | Git config |

## Cross-Repo Boundaries

### VibesOS → vibes-infra (public calls private APIs)

The public repo is a pure API consumer. No source-level dependencies:
- `scripts/deploy-cloudflare.js` POSTs `{name, files}` to `https://share.vibesos.com/deploy`
- `scripts/lib/cli-auth.js` performs standard OIDC against `https://vibesos.com`
- `bundles/oidc-bridge.js` does the same OIDC flow in-browser for private app auth
- `scripts/lib/auth-constants.js` holds the public URLs — hardcoded, only change on domain migration

### VibesOS → vibes-dev-tools (no runtime dependency)

Dev-tools operates *on* the public repo (runs evals against SKILL.md, generates fixtures) but VibesOS doesn't import anything from dev-tools. Dev-tools would clone/reference VibesOS as a working directory.

### vibes-infra → VibesOS (one build-time dependency)

The desktop build script (`build-desktop.sh`) bundles plugin files into the `.app` via rsync. After the split, it needs a local VibesOS checkout. A `scripts/setup-deps.sh` in vibes-infra handles this:

```bash
#!/usr/bin/env bash
# Clone or update VibesOS for desktop builds
VIBES_PLUGIN_DIR="${VIBES_PLUGIN_DIR:-../VibesOS}"
if [ -d "$VIBES_PLUGIN_DIR/.git" ]; then
  git -C "$VIBES_PLUGIN_DIR" pull --ff-only
else
  git clone https://github.com/popmechanic/VibesOS.git "$VIBES_PLUGIN_DIR"
fi
echo "VibesOS available at $VIBES_PLUGIN_DIR"
```

The desktop build script reads `VIBES_PLUGIN_DIR` (defaulting to `../VibesOS`) instead of assuming the plugin lives in the same repo.

### No shared packages or monorepo tooling needed

The repos communicate only through:
1. HTTPS APIs (stable, versioned by URL)
2. OIDC standard protocol
3. The desktop build needing a plugin checkout at build time

## CLAUDE.md Migration

Sections removed from VibesOS's `CLAUDE.md` are not discarded — they seed the new repos:

### vibes-infra/CLAUDE.md gets:

- Deploy API Worker documentation
- Dispatch worker / Durable Objects documentation
- AI proxy worker documentation
- Pocket ID / alchemy documentation
- Desktop app sections (build, code signing, notarization, DMG gotchas, key files, desktop-specific behavior, external link handling, first-launch setup)
- `.env` / secrets documentation
- Cloudflare deployment internals (account-level, not the CLI client)
- Install worker documentation

### vibes-dev-tools/CLAUDE.md gets:

- Autoresearch (Parallel Autoresearch Engine) section
- Eval key scripts documentation
- Agent definitions reference
- Autoresearch scoring/reports documentation
- Autoresearch test harness documentation

### VibesOS/CLAUDE.md keeps:

- Agent Quick Reference (updated to remove infra/eval rows)
- TinyBase API Reference
- Environment Variables in SKILL.md
- Critical Rules (React singleton, import map, skills are atomic)
- Package Versions
- Architecture: JSX + Babel
- Local Development
- Restarting the Preview Server
- Testing (updated to remove eval references)
- Non-Obvious Files (updated to remove infra files)
- Cloudflare Deployment (client-side: the deploy script, auth flow, how apps deploy — remove `dispatch-worker/` internal reference)
- App-Level Static Assets
- Resetting App Sync State (user-facing troubleshooting)
- Adding or Removing Skills
- Plugin Versioning
- Terminal Workflow: Always Reassemble Before Deploy
- Commit Messages
- Template Build System (from .claude/rules/)

## Cleanup in VibesOS After Extraction

### Remove files
All paths listed in the vibes-infra and vibes-dev-tools manifests.

### Remove dead references in CLAUDE.md
- Remove: deploy-api, dispatch-worker, ai-worker, alchemy sections
- Remove: Desktop App and all sub-sections
- Remove: Autoresearch section and eval references
- Remove: `.env` documentation
- Remove: Non-Obvious Files entries for infra code (deploy-api/, dispatch-worker/, scripts/install-worker/)
- Update: Agent Quick Reference table (remove infra/eval rows)
- Update: Testing section (remove eval commands)
- Update: Deploy Workflow section — remove `dispatch-worker/` internal reference, keep client-side flow description

### Update .gitignore
Remove entries for: `alchemy/.alchemy/`, `.env`, `.connect`, `.env.backup`, `eval/`, `dist/`, `.mcp.json`, `eval-results-playground.html`, `eval-test.html`, `*.jsonc.bak`, `VIBES-SYSTEM-PROMPT-ANALYSIS.md`, `.git-backup/`, `.vibes-tmp/`, `skills/cloudflare/worker/public/`.

### Update README.md
Remove references to backend workers, update architecture description.

### Remove stale root files (verify not tracked)
`wrangler.jsonc`, `wrangler.jsonc.bak`, `.connect`, `.env`, `.env.backup`, `.env.example`, root `package.json` (59-byte one), `VIBES-SYSTEM-PROMPT-ANALYSIS.md`.

### Move .claude/agents/autoresearch-*.md to vibes-dev-tools
Keep other `.claude/agents/` and all `.claude/rules/`.

### Remove skills that moved
- `skills/autoresearch/` — moved to vibes-dev-tools
- `skills/upload-dmg/` — moved to vibes-infra
- `skills/cloudflare/worker/` — moved to vibes-infra (keep `skills/cloudflare/SKILL.md`)

### Rename local directory
`vibes-skill` → `VibesOS`

### Docs disposition
Design specs in `docs/superpowers/specs/` that relate to infrastructure (desktop, WfP migration) or eval (eval-v2, autoresearch) stay in VibesOS as historical record. They document design decisions even if the code has moved. New infra/eval specs going forward are written in their respective repos.

## Execution Order

### Step 1: Create vibes-infra
1. Clone current repo to a working directory
2. Run `git filter-repo` with infra paths:
   ```
   git filter-repo \
     --path deploy-api/ \
     --path dispatch-worker/ \
     --path ai-worker/ \
     --path alchemy/ \
     --path scripts/install-worker/ \
     --path scripts/__tests__/unit/install-worker.test.js \
     --path scripts/lib/jwt-validation.js \
     --path scripts/__tests__/unit/jwt-validation.test.js \
     --path scripts/__tests__/unit/jwt-sync-check.test.js \
     --path scripts/__tests__/unit/ai-proxy.test.js \
     --path scripts/install.sh \
     --path scripts/build-desktop.sh \
     --path scripts/templates/ \
     --path scripts/deployables/ \
     --path skills/cloudflare/worker/ \
     --path skills/upload-dmg/ \
     --path vibes-desktop/ \
     --path .env \
     --path .env.backup \
     --path .env.example \
     --path .connect \
     --path wrangler.jsonc \
     --path wrangler.jsonc.bak
   ```
3. Create `CLAUDE.md` from migrated sections
4. Add `scripts/setup-deps.sh` for VibesOS checkout
5. Update `scripts/build-desktop.sh` to use `VIBES_PLUGIN_DIR`
6. Create private GitHub repo, push

### Step 2: Create vibes-dev-tools
1. Clone current repo to a working directory
2. Run `git filter-repo` with eval/autoresearch paths:
   ```
   git filter-repo \
     --path scripts/eval-harness.ts \
     --path scripts/eval-parallel.ts \
     --path scripts/eval-report.ts \
     --path scripts/eval-scoring.ts \
     --path scripts/eval-ssr-check.ts \
     --path scripts/eval-static-check.js \
     --path scripts/verify-tinybase-fixtures.mjs \
     --path scripts/verify-tinybase-fixtures.sh \
     --path skills/autoresearch/ \
     --path autoresearch-vibes/ \
     --path eval/ \
     --path eval-results-playground.html \
     --path eval-test.html \
     --path .claude/agents/autoresearch-cross-pollinator.md \
     --path .claude/agents/autoresearch-generator.md \
     --path .claude/agents/autoresearch-mutator.md \
     --path .claude/agents/autoresearch-orchestrator.md \
     --path .claude/agents/autoresearch-red-teamer.md \
     --path .claude/agent-memory/autoresearch-cross-pollinator/ \
     --path .claude/agent-memory/autoresearch-red-teamer/ \
     --path scripts/__tests__/unit/eval-ablation.test.ts \
     --path scripts/__tests__/unit/eval-directives.test.ts \
     --path scripts/__tests__/unit/eval-harness.test.ts \
     --path scripts/__tests__/unit/eval-report.test.ts \
     --path scripts/__tests__/unit/eval-scoring.test.ts \
     --path scripts/__tests__/unit/eval-shim.test.js \
     --path scripts/__tests__/unit/eval-ssr-check.test.ts \
     --path scripts/__tests__/unit/eval-static-check.test.js \
     --path scripts/__tests__/integration/eval-assembly.test.js \
     --path scripts/__tests__/integration/eval-pipeline.test.ts \
     --path scripts/__tests__/integration/eval-sync-replay.test.ts
   ```
3. Create `CLAUDE.md` from migrated sections
4. Create own `scripts/package.json` with eval-specific dependencies
5. Create private GitHub repo, push

### Step 3: Clean up VibesOS
1. Delete extracted files from the repo
2. Update `CLAUDE.md` — remove migrated sections, update tables/references
3. Update `.gitignore` — remove entries for deleted paths
4. Update `README.md` — remove backend references
5. Remove `.env.example`
6. Move `.claude/agents/autoresearch-*.md` out (already in dev-tools via filter-repo)
7. Rename local directory `vibes-skill` → `VibesOS`
8. Commit and push

### Step 4: Verify
1. **VibesOS:** `claude --plugin .` loads successfully, skills work, `cd scripts && npm test` passes
2. **vibes-infra:** Desktop build works with `setup-deps.sh` checkout, `wrangler deploy` works for each worker
3. **vibes-dev-tools:** Eval harness runs against a VibesOS checkout

### Step 5: Update project memory
Update memory files that reference the old monolithic structure.

## Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| `git filter-repo` rewrites commit SHAs | Accept this — the original repo preserves full history. Cross-reference by date/message, not SHA. |
| Desktop build breaks without plugin files | `setup-deps.sh` + `VIBES_PLUGIN_DIR` env var with default `../VibesOS` |
| Dev-tools scripts have hardcoded paths | Update paths to accept `VIBES_ROOT` env var pointing to VibesOS checkout |
| Missing files discovered after split | The original repo's history is the backup — files can be recovered |
| CI/CD needs access to multiple repos | vibes-infra CI can clone public VibesOS. Dev-tools CI can do the same. No cross-private-repo dependency. |
| `skills/cloudflare/` partially split | Keep `SKILL.md` in VibesOS, move `worker/` to infra. Update `SKILL.md` to remove worker deployment instructions. |
| vibes-dev-tools needs its own dependencies | Create a `scripts/package.json` in dev-tools with eval-specific deps extracted from the current scripts `package.json`. |

## Notes

### Gitignored files and directories
`.netlify-deploy/`, `dist/`, `.git-backup/`, `.vibes-tmp/`, `.worktrees/`, `superpowers/`, `scripts/coverage/`, `test-vibes/`, `scripts/test-app/` are local artifacts and do not appear in any manifest. They are not tracked in git and do not migrate.

**Important:** Some files in the manifests are gitignored and untracked (`.env`, `.env.backup`, `.connect`, `wrangler.jsonc.bak`, `eval-results-playground.html`, `eval-test.html`). `git filter-repo` only operates on tracked history, so these paths will silently produce nothing. They must be **manually copied** from the current working directory to the new repo after filter-repo runs. The filter-repo commands include them for documentation purposes (to capture any historical commits where they were briefly tracked).

### Per-developer state
`.claude/settings.local.json`, `.claude/agent-memory/`, `.claude/worktrees/` are per-developer and do not migrate. Each repo starts fresh.

### OpenRouter API key
All OpenRouter usage goes through the `ai-worker/` proxy (vibes-infra). Users do not configure API keys client-side. The `.env.example` removal from VibesOS is correct.
