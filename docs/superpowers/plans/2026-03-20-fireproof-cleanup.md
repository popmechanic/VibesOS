# Fireproof/Connect Cleanup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all remaining Fireproof and Connect references from the codebase so that the TinyBase migration is complete — no code path generates, processes, or references Fireproof patterns.

**Architecture:** Systematic file-by-file cleanup in priority order: (1) code that generates apps, (2) code that processes generated apps, (3) skill docs that teach patterns, (4) rules/docs/examples. Each task is one logical group of files.

**Tech Stack:** Text editing. No new dependencies. Run `cd scripts && npx vitest run` after each task.

---

## File Map

### Task 1 — Editor AI Prompts (CRITICAL: these tell Claude what to generate)

| File | Change |
|------|--------|
| `scripts/server/handlers/generate.ts:195-216` | Replace Fireproof DATABASE block with TinyBase patterns (2 occurrences) |
| `scripts/server/handlers/generate.ts:308-329` | Same — second prompt block |
| `scripts/server/handlers/chat.ts:166` | Replace "PRESERVE: all Fireproof hooks" with TinyBase equivalent |
| `scripts/server/handlers/chat.ts:216-218` | Replace useFireproofClerk instruction with TinyBase hooks |
| `scripts/server/ai-instructions.ts:74-166` | Rewrite AI_INSTRUCTIONS_CHAT and AI_INSTRUCTIONS_GENERATE — replace Fireproof examples with TinyBase |

### Task 2 — Post-Processing and Analysis (code that inspects generated apps)

| File | Change |
|------|--------|
| `scripts/server/post-process.ts:53-82` | Update stripRedeclaredGlobals to catch TinyBase fallback patterns instead of useFireproofClerk |
| `scripts/server/handlers/theme.ts:17-42` | Rewrite extractDataSchema to parse TinyBase patterns (useRowIds, useCell, useAddRowCallback) instead of useLiveQuery/database.put |

### Task 3 — Strip Code and Assembly Utilities

| File | Change |
|------|--------|
| `scripts/lib/strip-code.js:68-80` | Update comments — "window destructuring" is still needed, but the examples mention useFireproofClerk; update to reference TinyBase hooks |
| `scripts/assemble.js:46` | Update log message from "Connect URLs" to "App config" |
| `scripts/assemble-sell.js:162-225` | Update Connect references in log messages and comments |
| `scripts/lib/env-utils.js:4-43` | Update function/comment naming from "Connect config" to "App config" |

### Task 4 — Non-Vibes Skills

| File | Change |
|------|--------|
| `skills/sell/SKILL.md` | Replace all Fireproof references with TinyBase (useFireproofClerk → TinyBase hooks, useLiveQuery → useRowIds, etc.) |
| `skills/design/SKILL.md` | Replace Fireproof conversion instructions with TinyBase equivalents |
| `skills/launch/SKILL.md` | Update Fireproof Connect reference |
| `skills/launch/LAUNCH-REFERENCE.md` | Update useFireproofClerk references |
| `skills/test/SKILL.md` | Update fixture descriptions and diagnostic steps |

### Task 5 — Rules, Docs, Examples, README

| File | Change |
|------|--------|
| `.claude/rules/react-singleton.md` | Update example from @fireproof/core to TinyBase |
| `.claude/rules/sharing-architecture.md` | Add note that this is pre-TinyBase architecture, sharing will be redesigned |
| `README.md` | Replace Fireproof references with TinyBase |
| `docs/fireproof.txt` | Delete or rename to `docs/fireproof-legacy.txt` with deprecation header |
| `docs/pipeline.md` | Update Fireproof references |
| `CLAUDE.md` | Final sweep for remaining Fireproof/Connect refs |
| `examples/happy-plants/app.jsx` | Update to TinyBase hooks or delete |
| `examples/seq-beats/app.jsx` | Same |

### Task 6 — Tests

| File | Change |
|------|--------|
| `scripts/__tests__/unit/strip-code.test.js` | Update test cases to reference TinyBase patterns where applicable |
| `scripts/__tests__/integration/deploy-cloudflare-connect.test.js` | Update or remove Connect-specific assertions |
| `scripts/__tests__/fixtures/diagnostic-dashboard.jsx` | Update fixture to use TinyBase hooks |

### NOT changed (intentionally kept)

| File | Reason |
|------|--------|
| `bundles/fireproof-oidc-bridge.js` | Still provides OIDC auth components for private apps |
| `scripts/lib/deploy-files.js` | Bundles the OIDC bridge (still needed) |
| `scripts/server/router.ts` | Serves `/fireproof-oidc-bridge.js` (still needed) |
| `deploy-api/src/types.ts:22` | Comment mentioning bridge filename (accurate) |
| `docs/plans/*` | Historical plans — leave as archive |
| `docs/superpowers/plans/*` | Migration plans — leave as archive |

---

## Task 1: Editor AI Prompts

The editor server builds prompts inline that tell Claude how to generate/edit apps. These currently teach Fireproof patterns. This is why the editor generates broken apps.

**Files:**
- Modify: `scripts/server/handlers/generate.ts`
- Modify: `scripts/server/handlers/chat.ts`
- Modify: `scripts/server/ai-instructions.ts`

- [ ] **Step 1: Read all three files**

Read: `scripts/server/handlers/generate.ts`, `scripts/server/handlers/chat.ts`, `scripts/server/ai-instructions.ts`

- [ ] **Step 2: Update generate.ts — reference prompt (lines ~195-216)**

Find the block starting with `- useFireproofClerk("db-name")` in the reference/image prompt path. Replace the DATABASE section with:

```
DATABASE (TinyBase — all hooks are pre-existing globals, NO imports needed):
- useRowIds('tableName') returns array of row IDs — use for listing items
- useCell('tableName', rowId, 'cellName') returns a single cell value — use in child components
- useSortedRowIds('tableName', 'sortCell', descending, offset, limit) for paginated lists
- useRowCount('tableName') returns total count
- useAddRowCallback('tableName', (param) => ({ cell1: value1, cell2: value2, createdAt: Date.now() }), [deps])
- useSetCellCallback('tableName', rowId, 'cellName', (_e) => (current) => newValue) for updates
- useSetPartialRowCallback('tableName', rowId, (param) => ({ cell1: newValue })) for partial updates
- useDelRowCallback('tableName', rowId) for deletion
- useValue('key') / useSetValueCallback('key', () => value) for app-level settings
- useApp() returns { isReady, isSyncing, user } — isReady is always true (template gates rendering)
- NO import statements. NO createStore. NO direct store.* method calls. Use callback hooks only.${useAI ? AI_INSTRUCTIONS_GENERATE : ''}`;
```

- [ ] **Step 3: Update generate.ts — theme prompt (lines ~308-329)**

Find the identical DATABASE block in the normal theme generation path. Replace with the same TinyBase block from Step 2.

- [ ] **Step 4: Update chat.ts — preserve instruction (line ~166)**

Replace:
```
PRESERVE: all Fireproof hooks (useDocument, useLiveQuery), database.put/del calls, data models, all functional logic, and the user's actual data. Every piece of data and functionality must still work.
```

With:
```
PRESERVE: all TinyBase hooks (useRowIds, useCell, useAddRowCallback, useSetCellCallback, useSortedRowIds, useDelRowCallback), data tables/cells, all functional logic, and the user's actual data. Every piece of data and functionality must still work.
```

- [ ] **Step 5: Update chat.ts — database hook instruction (lines ~216-218)**

Replace:
```
- The database hook is useFireproofClerk("db-name") — it is a PRE-EXISTING GLOBAL. NEVER rename, redeclare, wrap, or alias it. Do NOT create useFireproof or any fallback. Just call useFireproofClerk() directly. It returns { database, useLiveQuery, useDocument, syncStatus }.
- Never use CSS unicode escapes ...
- Never change Fireproof document types or query filters
```

With:
```
- TinyBase hooks (useRowIds, useCell, useAddRowCallback, etc.) are PRE-EXISTING GLOBALS. NEVER import, redeclare, or alias them. Just call them directly.
- useApp() returns { isReady, isSyncing, user } — status and user info.
- Never use CSS unicode escapes ...
- Never rename table names or cell names in existing apps — users would lose data
```

- [ ] **Step 6: Update ai-instructions.ts — AI_INSTRUCTIONS_CHAT (lines ~60-77)**

Replace the Fireproof warning with TinyBase guidance:
```
Rules: useAI() at component top level. callAI() is async, returns text or null. streamAI() returns async iterator or null. Neither throws.
useAI() can safely coexist with TinyBase hooks in the same component — no separation needed.
Always show \`error.message\` to the user when callAI/streamAI returns null — never fail silently.
Use TinyBase to persist conversations (useAddRowCallback to save messages). Do NOT use fetch() for AI calls.`;
```

- [ ] **Step 7: Update ai-instructions.ts — AI_INSTRUCTIONS_GENERATE (lines ~79-166)**

Replace the entire `AI_INSTRUCTIONS_GENERATE` export with TinyBase-native examples:

```typescript
export const AI_INSTRUCTIONS_GENERATE = `
=== AI FEATURES ===

This app needs AI capabilities. Use the global \`useAI\` hook (available as window.useAI — NO import needed).

\`\`\`jsx
function AIButton({ onResult }) {
  const { callAI, loading, error } = useAI();

  const handleClick = async () => {
    const text = await callAI({
      model: "anthropic/claude-sonnet-4",
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Generate something" }
      ]
    });
    if (text) onResult(text);
  };

  return (
    <div>
      <button onClick={handleClick} disabled={loading}>
        {loading ? "Thinking..." : "Ask AI"}
      </button>
      {error && <p style={{ color: "red" }}>{error.message}</p>}
    </div>
  );
}

// Save AI results to TinyBase
function App() {
  const addResponse = useAddRowCallback(
    'ai-responses',
    (text) => ({ content: text, timestamp: Date.now() }),
  );

  return <AIButton onResult={addResponse} />;
}

// Streaming (for chat UIs):
function ChatStream({ messages, onDone }) {
  const { streamAI, loading, error } = useAI();
  const [response, setResponse] = React.useState("");

  const handleSend = async () => {
    const stream = streamAI({ model: "anthropic/claude-sonnet-4", messages });
    if (!stream) return;
    let accumulated = "";
    for await (const chunk of stream) { accumulated += chunk; setResponse(accumulated); }
    if (accumulated) onDone(accumulated);
  };

  return (
    <div>
      <button onClick={handleSend} disabled={loading}>Send</button>
      {loading && <p>{response || "Thinking..."}</p>}
      {error && <p style={{ color: "red" }}>{error.message}</p>}
    </div>
  );
}
\`\`\`

RULES for AI features:
- useAI() is a React hook — call it at the top of your component
- useAI() can coexist with TinyBase hooks in the same component — no separation required
- callAI() is async — returns text string on success, null on error. NEVER throws.
- streamAI() returns an async iterator on success, null on error.
- Always show \`error.message\` to the user when callAI/streamAI returns null
- Use TinyBase (useAddRowCallback) to persist AI conversations
- Do NOT use fetch() to call AI APIs directly — always use useAI()
`;
```

- [ ] **Step 8: Run tests**

Run: `cd scripts && npx vitest run`
Expected: All tests pass (these are prompt strings, not logic changes)

- [ ] **Step 9: Commit**

```bash
git add scripts/server/handlers/generate.ts scripts/server/handlers/chat.ts scripts/server/ai-instructions.ts
git commit -m "fix: replace Fireproof with TinyBase in editor AI prompts"
```

---

## Task 2: Post-Processing and Analysis

Code that inspects or sanitizes generated app.jsx — needs to understand TinyBase patterns instead of Fireproof.

**Files:**
- Modify: `scripts/server/post-process.ts`
- Modify: `scripts/server/handlers/theme.ts`

- [ ] **Step 1: Read both files**

- [ ] **Step 2: Update post-process.ts stripRedeclaredGlobals**

The current function strips `const { useFireproofClerk } = React.useMemo(...)` patterns. With TinyBase, the builder might create similar fallback patterns for TinyBase hooks. Update the function:

```typescript
/**
 * Strip redeclared globals that collide with template-provided identifiers.
 * Common builder mistake: subprocess creates fallback wrappers
 * that shadow the real globals from the template.
 */
export function stripRedeclaredGlobals(code) {
  let result = code;
  // Remove useFireproofClerk fallback (legacy — builder may still generate this)
  result = result.replace(/const\s*\{\s*useFireproofClerk\s*\}\s*=\s*React\.useMemo\(\s*\(\)\s*=>\s*\{[\s\S]*?\}\s*,\s*\[\s*\]\s*\);\s*\n?/g, '');
  // Remove any TinyBase hook re-declarations (e.g., const useCell = window.useCell)
  result = result.replace(/^const\s+(useCell|useRow|useTable|useRowIds|useSortedRowIds|useRowCount|useAddRowCallback|useSetCellCallback|useSetRowCallback|useSetPartialRowCallback|useDelRowCallback|useDelCellCallback|useSetValueCallback|useValue|useValues|useApp)\s*=\s*window\.\1\s*;?\s*$/gm, '');
  return result;
}
```

Update the log message at line ~79 to say "Stripped redeclared globals" instead of "Stripped redeclared useFireproofClerk fallback".

- [ ] **Step 3: Update theme.ts extractDataSchema**

Replace the function that parses `useLiveQuery`/`database.put` with one that parses TinyBase patterns:

```typescript
function extractDataSchema(appCode) {
  if (!appCode) return '';
  const schemas = [];

  // TinyBase table usage: useRowIds('tableName'), useCell('tableName', ...)
  const tableMatches = appCode.matchAll(/use(?:RowIds|SortedRowIds|RowCount|Table|AddRowCallback)\s*\(\s*['"]([^'"]+)['"]/g);
  for (const m of tableMatches) {
    schemas.push(`  - Table: "${m[1]}"`);
  }

  // TinyBase cell usage: useCell('table', id, 'cellName')
  const cellMatches = appCode.matchAll(/useCell\s*\(\s*['"]([^'"]+)['"]\s*,\s*\w+\s*,\s*['"]([^'"]+)['"]/g);
  for (const m of cellMatches) {
    schemas.push(`  - Table "${m[1]}" has cell: "${m[2]}"`);
  }

  // Value usage: useValue('key')
  const valueMatches = appCode.matchAll(/useValue\s*\(\s*['"]([^'"]+)['"]/g);
  for (const m of valueMatches) {
    schemas.push(`  - Value: "${m[1]}"`);
  }

  // Legacy Fireproof patterns (for existing apps not yet migrated)
  const queryMatches = appCode.matchAll(/useLiveQuery\s*\(\s*(['"`])([^'"`]*)\1/g);
  for (const m of queryMatches) {
    schemas.push(`  - Legacy useLiveQuery("${m[2]}")`);
  }

  const unique = [...new Set(schemas)];
  if (unique.length === 0) return '';
  return `\nDATA SCHEMA (these tables/cells have user data — do NOT rename them):\n${unique.join('\n')}\n`;
}
```

- [ ] **Step 4: Run tests**

Run: `cd scripts && npx vitest run`

- [ ] **Step 5: Commit**

```bash
git add scripts/server/post-process.ts scripts/server/handlers/theme.ts
git commit -m "fix: update post-processor and schema extractor for TinyBase patterns"
```

---

## Task 3: Strip Code and Assembly Utilities

Update comments and log messages in assembly/stripping code.

**Files:**
- Modify: `scripts/lib/strip-code.js`
- Modify: `scripts/assemble.js`
- Modify: `scripts/assemble-sell.js`
- Modify: `scripts/lib/env-utils.js`

- [ ] **Step 1: Read all four files**

- [ ] **Step 2: Update strip-code.js comments**

At lines ~68-80, update comments from "useFireproofClerk" references to generic "template-provided globals":

```javascript
/**
 * Remove window destructuring assignments (e.g., const { useApp } = window;)
 * These conflict with templates that already provide these via ES imports.
 */
```

Update the example in the inline comment at line ~75 from `useFireproofClerk` to `useApp`.

- [ ] **Step 3: Update assemble.js log message**

Change line ~46 from:
```javascript
console.log('Assembling (Connect URLs will be injected at deploy time)');
```
To:
```javascript
console.log('Assembling (app config will be injected at deploy time)');
```

- [ ] **Step 4: Update assemble-sell.js comments**

Read the file. Update log messages at lines ~162, ~166, ~224 from "Connect config" to "App config". The `populateConnectConfig` function call stays (it's been updated to handle TinyBase placeholders).

- [ ] **Step 5: Update env-utils.js comments**

Update the file header comment from "Connect config population" to "App config population". Update `populateConnectConfig` JSDoc from "Replace Connect config placeholders" to "Replace app config placeholders". Update `validateConnectUrl` JSDoc — this function validates legacy Connect URLs and may still be called; keep it but mark it as legacy.

- [ ] **Step 6: Run tests**

Run: `cd scripts && npx vitest run`

- [ ] **Step 7: Commit**

```bash
git add scripts/lib/strip-code.js scripts/assemble.js scripts/assemble-sell.js scripts/lib/env-utils.js
git commit -m "chore: update comments and logs from Fireproof/Connect to TinyBase"
```

---

## Task 4: Non-Vibes Skills

Update skill docs that teach Fireproof patterns.

**Files:**
- Modify: `skills/sell/SKILL.md`
- Modify: `skills/design/SKILL.md`
- Modify: `skills/launch/SKILL.md`
- Modify: `skills/launch/LAUNCH-REFERENCE.md`
- Modify: `skills/test/SKILL.md`

- [ ] **Step 1: Read each file and update Fireproof references**

For each file, search for `useFireproofClerk`, `useLiveQuery`, `useDocument`, `database.put`, `database.del`, `Fireproof`, `Connect`, and replace with TinyBase equivalents. Key mapping:

| Fireproof | TinyBase |
|-----------|----------|
| `useFireproofClerk("db-name")` | TinyBase hooks are globals (useRowIds, useCell, etc.) — no initialization needed |
| `useLiveQuery("type", {key: "item"})` | `useRowIds('items')` + `useCell('items', id, 'field')` in child |
| `useDocument({...})` | `useAddRowCallback('table', (param) => ({...}))` for new, `useSetPartialRowCallback` for update |
| `database.put({...})` | `useAddRowCallback` or `useSetCellCallback` |
| `database.del(doc)` | `useDelRowCallback('table', rowId)` |
| `{ docs, isLoading }` | `useRowIds('table')` returns array directly |
| `doc._id` | row ID (string, auto-generated by TinyBase) |
| `Fireproof Connect` | TinyBase sync (WebSocket + Durable Object) |

**sell/SKILL.md specific:** The sell template has multi-tenant patterns (`useTenant()`). For now, add a note at the top: "NOTE: The sell template's TinyBase migration is in progress. Data patterns below are partially updated." Update what's straightforward, leave complex multi-tenant patterns for a separate task.

**design/SKILL.md specific:** Replace the Fireproof conversion examples (lines ~97-104, ~226-253) with TinyBase equivalents.

**test/SKILL.md specific:** Update fixture descriptions — "fireproof-basic" should be renamed or described as "tinybase-basic". Update diagnostic steps that mention Fireproof errors.

- [ ] **Step 2: Commit**

```bash
git add skills/sell/SKILL.md skills/design/SKILL.md skills/launch/SKILL.md skills/launch/LAUNCH-REFERENCE.md skills/test/SKILL.md
git commit -m "fix: update sell, design, launch, test skills for TinyBase"
```

---

## Task 5: Rules, Docs, Examples, README

Update project-level documentation.

**Files:**
- Modify: `.claude/rules/react-singleton.md`
- Modify: `.claude/rules/sharing-architecture.md`
- Modify: `README.md`
- Modify: `docs/pipeline.md`
- Modify: `CLAUDE.md`
- Delete or deprecate: `docs/fireproof.txt`
- Delete or deprecate: `skills/vibes/fireproof-patterns.md`
- Modify: `examples/happy-plants/app.jsx`
- Modify: `examples/seq-beats/app.jsx`

- [ ] **Step 1: Update react-singleton.md**

Replace the `@fireproof/core` example with a TinyBase example:

```markdown
```json
"tinybase/ui-react": "https://esm.sh/tinybase@8/ui-react?external=react,react-dom"
```
```

Keep the explanation of why `?external=react,react-dom` is needed — it applies identically to TinyBase.

- [ ] **Step 2: Update sharing-architecture.md**

Add a deprecation header:

```markdown
> **NOTE:** This architecture describes the pre-TinyBase sharing system based on Fireproof ledgers. TinyBase uses room-based sync (one Durable Object per app). Sharing will be redesigned.
```

- [ ] **Step 3: Update README.md**

Replace "Fireproof" references with "TinyBase":
- "via [Fireproof](https://fireproof.storage)" → "via [TinyBase](https://tinybase.org)"
- "Fireproof database for local-first persistence" → "TinyBase for local-first reactive data"
- "Generate a React web app with Fireproof database" → "Generate a React web app with TinyBase"
- The data section describing useLiveQuery/useDocument → update with TinyBase hooks

- [ ] **Step 4: Deprecate docs/fireproof.txt**

Rename to `docs/fireproof-legacy.txt` and add deprecation header:

```
# DEPRECATED — Fireproof API Guide (replaced by TinyBase)
# See skills/vibes/SKILL.md for current TinyBase data patterns.
# This file is kept for historical reference only.
```

- [ ] **Step 5: Deprecate skills/vibes/fireproof-patterns.md**

Same treatment — rename to `fireproof-patterns-legacy.md` or delete. If any other file references it, update the reference.

- [ ] **Step 6: Update docs/pipeline.md**

Replace Fireproof references with TinyBase.

- [ ] **Step 7: Final CLAUDE.md sweep**

Read CLAUDE.md. Search for any remaining Fireproof/Connect references. Update.

- [ ] **Step 8: Update example apps**

Read `examples/happy-plants/app.jsx` and `examples/seq-beats/app.jsx`. If they're small, rewrite to use TinyBase hooks. If they're large, add a deprecation comment and skip (they're not critical path).

- [ ] **Step 9: Run tests**

Run: `cd scripts && npx vitest run`

- [ ] **Step 10: Commit**

```bash
git add .claude/rules/ README.md docs/ skills/vibes/fireproof-patterns.md examples/ CLAUDE.md
git commit -m "chore: update docs, rules, README, examples for TinyBase"
```

---

## Task 6: Tests

Update test files that assert Fireproof-specific patterns.

**Files:**
- Modify: `scripts/__tests__/unit/strip-code.test.js`
- Modify: `scripts/__tests__/integration/deploy-cloudflare-connect.test.js`
- Modify: `scripts/__tests__/fixtures/diagnostic-dashboard.jsx`

- [ ] **Step 1: Update strip-code.test.js**

Read the file. Tests that assert stripping of `useFireproofClerk` window destructuring should be updated to also test stripping of TinyBase hook destructuring (e.g., `const { useApp } = window;`). Keep existing tests that verify import stripping — that logic is unchanged.

- [ ] **Step 2: Update deploy-cloudflare-connect.test.js**

Read the file. If it tests Connect provisioning results (apiUrl, cloudUrl, connectProvisioned), update assertions to test the new shape (wsUrl, sync config). If tests are deeply tied to Connect infrastructure, rewrite them for TinyBase or skip with `it.skip` and a TODO comment.

- [ ] **Step 3: Update diagnostic-dashboard.jsx fixture**

Read the file. This is used by integration tests. Replace Fireproof hooks with TinyBase equivalents so the fixture assembles correctly with the new template. Key changes:
- `useFireproofClerk` → `useApp()` + TinyBase hooks
- `useLiveQuery` → `useRowIds` + `useCell`
- `database.put` → `useAddRowCallback`
- `database.del` → `useDelRowCallback`

- [ ] **Step 4: Rebuild templates and run full test suite**

```bash
bun scripts/merge-templates.js --force
cd scripts && npx vitest run
```

- [ ] **Step 5: Commit**

```bash
git add scripts/__tests__/
git commit -m "fix: update tests and fixtures for TinyBase patterns"
```

---

## Task 7: Final Verification

- [ ] **Step 1: Full Fireproof audit**

```bash
grep -rn "useFireproofClerk\|useLiveQuery\|useDocument\|database\.put\|database\.del" --include="*.ts" --include="*.js" --include="*.html" --include="*.jsx" scripts/ skills/ .claude/rules/ | grep -v node_modules | grep -v bundles/fireproof-oidc-bridge | grep -v fireproof-legacy | grep -v "__tests__/unit/tinybase-template"
```

Expected: Zero matches (or only the OIDC bridge serving route in router.ts)

- [ ] **Step 2: Full test suite**

```bash
cd scripts && npx vitest run
```

Expected: All tests pass

- [ ] **Step 3: Rebuild all templates**

```bash
bun scripts/build-components.js --force
bun scripts/build-design-tokens.js --force
bun scripts/merge-templates.js --force
```

- [ ] **Step 4: Test assembly**

```bash
bun scripts/assemble.js scripts/__tests__/fixtures/minimal.jsx /tmp/final-test.html
cat /tmp/final-test.html | grep -c "tinybase"
cat /tmp/final-test.html | grep -c "fireproof"
```

Expected: tinybase count > 0, fireproof count = 0 (or only the OIDC bridge reference)

- [ ] **Step 5: Commit if any loose changes**

```bash
git status
# Commit anything missed
```
