# Eval v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the autoresearch eval loop with subagent-based generation (sonnet), a harder 10-prompt battery, and static analysis pre-checks.

**Architecture:** The eval orchestrator reads SKILL.md reference files, inlines them into generator agent prompts, spawns sonnet subagents to produce app.jsx files, runs static analysis, then browser-tests survivors via Chrome DevTools MCP. Graded scoring (0-4) replaces binary pass/fail.

**Tech Stack:** Bun (scripts), Chrome DevTools MCP (browser testing), TinyBase (sync), Claude Agent tool (subagent generation)

**Spec:** `docs/superpowers/specs/2026-03-23-eval-v2-design.md`

---

### Task 1: Create static analysis checker

**Files:**
- Create: `scripts/eval-static-check.js`
- Test: `scripts/__tests__/unit/eval-static-check.test.js`

- [ ] **Step 1: Write failing tests for critical checks**

```javascript
// scripts/__tests__/unit/eval-static-check.test.js
import { describe, it, expect } from 'vitest';
import { evalStaticCheck } from '../../eval-static-check.js';

describe('evalStaticCheck', () => {
  describe('critical checks', () => {
    it('C1: fails when useApp() is missing', () => {
      const code = 'function App() {\n  return <div>Hello</div>;\n}';
      const result = evalStaticCheck(code);
      expect(result.critical).toContain('C1: Missing useApp() call — sync will never activate');
      expect(result.passed).toBe(false);
    });

    it('C1: passes when useApp() is present', () => {
      const code = 'function App() {\n  const { isReady } = useApp();\n  return <div>Hello</div>;\n}';
      const result = evalStaticCheck(code);
      expect(result.critical.find(c => c.startsWith('C1'))).toBeUndefined();
    });

    it('C2: fails on import statements', () => {
      const code = 'import React from "react";\nfunction App() {\n  const { isReady } = useApp();\n  return <div/>;\n}';
      const result = evalStaticCheck(code);
      expect(result.critical).toContain('C2: Import statement found — breaks React singleton');
      expect(result.passed).toBe(false);
    });

    it('C3: fails on createStore', () => {
      const code = 'const store = createMergeableStore();\nfunction App() {\n  const { isReady } = useApp();\n  return <div/>;\n}';
      const result = evalStaticCheck(code);
      expect(result.critical.find(c => c.startsWith('C3'))).toBeDefined();
      expect(result.passed).toBe(false);
    });

    it('C4: fails on new Store()', () => {
      const code = 'const s = new MergeableStore();\nfunction App() {\n  const { isReady } = useApp();\n  return <div/>;\n}';
      const result = evalStaticCheck(code);
      expect(result.critical.find(c => c.startsWith('C4'))).toBeDefined();
      expect(result.passed).toBe(false);
    });
  });

  describe('warning checks', () => {
    it('W1: warns on useCell inside .filter()', () => {
      const code = [
        'function App() {',
        '  const { isReady } = useApp();',
        '  const ids = useRowIds("tasks");',
        '  const filtered = ids.filter(id => {',
        '    const status = useCell("tasks", id, "status");',
        '    return status === "todo";',
        '  });',
        '  return <div/>;',
        '}',
      ].join('\n');
      const result = evalStaticCheck(code);
      expect(result.warnings.find(w => w.startsWith('W1'))).toBeDefined();
      expect(result.passed).toBe(true); // warnings don't fail
    });

    it('W2: warns on direct store.setCell', () => {
      const code = 'function App() {\n  const { isReady } = useApp();\n  store.setCell("t", "r", "c", 1);\n  return <div/>;\n}';
      const result = evalStaticCheck(code);
      expect(result.warnings.find(w => w.startsWith('W2'))).toBeDefined();
    });

    it('W3: warns on JSON.stringify near callback hook', () => {
      const code = 'function App() {\n  const { isReady } = useApp();\n  const add = useAddRowCallback("t", (d) => ({ data: JSON.stringify(d) }), []);\n  return <div/>;\n}';
      const result = evalStaticCheck(code);
      expect(result.warnings.find(w => w.startsWith('W3'))).toBeDefined();
    });

    it('W4: warns on sync status string', () => {
      const code = 'function App() {\n  const { isReady } = useApp();\n  return <div><span>"Connected"</span></div>;\n}';
      const result = evalStaticCheck(code);
      expect(result.warnings.find(w => w.startsWith('W4'))).toBeDefined();
    });

    it('W5: warns on optional chaining on email', () => {
      const code = 'function App() {\n  const { isReady } = useApp();\n  const e = oidcUser?.email;\n  return <div/>;\n}';
      const result = evalStaticCheck(code);
      expect(result.warnings.find(w => w.startsWith('W5'))).toBeDefined();
    });

    it('W6: warns on anonymous fallback', () => {
      const code = 'function App() {\n  const { isReady } = useApp();\n  const name = email || "anonymous";\n  return <div/>;\n}';
      const result = evalStaticCheck(code);
      expect(result.warnings.find(w => w.startsWith('W6'))).toBeDefined();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd scripts && npx vitest run __tests__/unit/eval-static-check.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement eval-static-check.js**

```javascript
// scripts/eval-static-check.js
import { readFileSync, existsSync } from 'fs';

/**
 * Static analysis pre-check for generated Vibes app code.
 * Uses regex matching — no AST parsing.
 *
 * @param {string} codeOrPath - JSX source code string, or path to a .jsx file
 * @returns {{ critical: string[], warnings: string[], passed: boolean }}
 */
export function evalStaticCheck(codeOrPath) {
  // Detect whether input is a file path or inline code.
  // Use existsSync to avoid misinterpreting single-line code strings as paths.
  const code = (!codeOrPath.includes('\n') && existsSync(codeOrPath))
    ? readFileSync(codeOrPath, 'utf8')
    : codeOrPath;
  const critical = [];
  const warnings = [];

  // C1: Missing useApp()
  if (!code.includes('useApp()')) {
    critical.push('C1: Missing useApp() call — sync will never activate');
  }

  // C2: Import statements
  if (/^\s*import\s/m.test(code)) {
    critical.push('C2: Import statement found — breaks React singleton');
  }

  // C3: Store creation
  if (/create(Mergeable)?Store\s*\(/.test(code)) {
    critical.push('C3: Store creation found — creates disconnected store');
  }

  // C4: Store constructor
  if (/new\s+(Mergeable)?Store\s*\(/.test(code)) {
    critical.push('C4: Store constructor found — creates disconnected store');
  }

  // W1: Hooks in loops — useCell/useRow/useHasRow after .filter(/.map(/.forEach(
  const iterMethods = /\.(filter|map|forEach)\s*\([^)]*=>\s*\{/g;
  let match;
  while ((match = iterMethods.exec(code)) !== null) {
    // Check next 500 chars for hook calls before closing
    const after = code.slice(match.index, match.index + 500);
    if (/use(Cell|Row|HasRow|HasCell|Value)\s*\(/.test(after)) {
      warnings.push(`W1: Hook call inside .${match[1]}() — will crash when list length changes (React #310)`);
      break; // one warning is enough
    }
  }

  // W2: Direct store writes
  if (/store\.(set|del)(Cell|Row|Table|Value|PartialRow)\s*\(/.test(code)) {
    warnings.push('W2: Direct store.set/del call — bypasses React reactivity');
  }

  // W3: JSON in cells
  if (/JSON\.stringify/.test(code) && /useAddRowCallback|useSetCellCallback|useSetRowCallback/.test(code)) {
    warnings.push('W3: JSON.stringify near callback hook — cells must be scalars');
  }

  // W4: Sync status UI
  if (/"(Connected|Online|LIVE|Syncing|Offline|CREW ONLINE)"/.test(code) ||
      /'(Connected|Online|LIVE|Syncing|Offline|CREW ONLINE)'/.test(code)) {
    warnings.push('W4: Sync status string found — template already renders SyncStatusDot');
  }

  // W5: Optional chaining on email
  if (/oidcUser\?\.email|email\?\.(split|toLowerCase)/.test(code)) {
    warnings.push('W5: Optional chaining on email — email is always present in private apps');
  }

  // W6: Anonymous fallback
  if (/\|\|\s*['"`](anonymous|unknown|guest)['"`]/i.test(code)) {
    warnings.push('W6: Anonymous fallback near email — breaks multi-user identity');
  }

  return {
    critical,
    warnings,
    passed: critical.length === 0,
  };
}

// CLI entry point: bun scripts/eval-static-check.js <path.jsx>
if (typeof Bun !== 'undefined' && import.meta.main) {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: bun scripts/eval-static-check.js <app.jsx>');
    process.exit(1);
  }
  const result = evalStaticCheck(filePath);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.passed ? 0 : 1);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd scripts && npx vitest run __tests__/unit/eval-static-check.test.js`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/eval-static-check.js scripts/__tests__/unit/eval-static-check.test.js
git commit -m "feat(eval): add static analysis pre-check for generated apps"
```

---

### Task 2: Rewrite eval/config.md with v2 prompt battery

**Files:**
- Modify: `eval/config.md`

- [ ] **Step 1: Replace config.md with v2 battery**

Rewrite `eval/config.md` with the 10-prompt battery from the spec (3 tiers). Keep the existing Test Users, Stopping Criteria, Human Checkpoints, Revert Mechanics, and Context Window Management sections. Update:
- Prompt table: 10 prompts with Tier, Seed Prompt, State Isolation Challenge, Key Failure Mode columns
- Stopping criteria: update "perfect score" to reference graded scoring (100% = all apps score 4)
- Add new section: Scoring Rubric (0-4 graded scale)
- Add new section: Static Analysis (run before browser tests, critical = auto-fail)
- Add new section: Subagent Generation (generator agent spawns per prompt, model: sonnet)
- Add new section: Sync Room Isolation (unique filenames, restart sync server between apps)

- [ ] **Step 2: Commit**

```bash
git add eval/config.md
git commit -m "feat(eval): rewrite config with v2 10-prompt battery and graded scoring"
```

---

### Task 3: Write v2 eval specs (10 prompts)

**Files:**
- Delete: `eval/specs/01-trivia-game.md` through `eval/specs/07-whiteboard.md`
- Create: `eval/specs/01-auction.md`
- Create: `eval/specs/02-voting-poll.md`
- Create: `eval/specs/03-lobby-game.md`
- Create: `eval/specs/04-inventory-trading.md`
- Create: `eval/specs/05-shared-timer.md`
- Create: `eval/specs/06-collaborative-ranking.md`
- Create: `eval/specs/07-reaction-game.md`
- Create: `eval/specs/08-kanban.md`
- Create: `eval/specs/09-chat.md`
- Create: `eval/specs/10-whiteboard.md`

- [ ] **Step 1: Delete old v1 specs**

```bash
rm eval/specs/0[1-7]-*.md
```

- [ ] **Step 2: Write all 10 specs following the spec format**

Each spec follows this structure (from the design spec):
- Seed Prompt (one sentence)
- Expected Data Model (tables, Values, key patterns)
- Interaction Script (multi-step Alice/Bob sequence)
- Hard Assertions split into Basic and Edge tiers
- Static Analysis Expectations

**Reference implementation — use this as the template for all 10 specs:**

```markdown
# Spec: Auction App

## Seed Prompt
An auction app where users bid on items and the highest bid wins

## Expected Data Model
### Tables
- `users` — keyed by email: `{ name, joinedAt }`
- `items` — auto-ID rows: `{ name, description, startingPrice, createdBy, createdAt }`
- `bids` — auto-ID rows: `{ itemId, amount, bidder, bidderName, timestamp }`

### Values
(none — highest bid is derived from `bids` table, not stored as a Value)

### Key Pattern
Per-user state: each bid row has `bidder: myEmail`. Shared state: all bids
are visible to all users. "Highest bid" is computed by filtering bids for
an item and finding the max amount — NOT stored as a single Value.

## Interaction Script
1. Alice: click "Load Demo Items" button (or add an item "Vintage Watch" with starting price 50)
2. Wait 2s for sync
3. Bob: verify "Vintage Watch" appears in his item list
4. Alice: place a bid of 100 on "Vintage Watch"
5. Wait 2s for sync
6. Bob: verify bid of 100 from Alice is visible
7. Bob: place a bid of 150 on "Vintage Watch"
8. Wait 2s for sync
9. Alice: verify "Vintage Watch" shows highest bid = 150 from Bob
10. Alice: place a bid of 200
11. Wait 2s for sync
12. Bob: verify highest bid = 200 from Alice
13. Bob: verify his OWN bid history still shows 150 (not overwritten)

## Hard Assertions

### Basic (score 3 requires all basic to pass)
1. **Shared item sync:** Alice adds item → Bob sees it
2. **Shared bid sync:** Alice bids → Bob sees the bid with correct amount and bidder
3. **Per-user bid isolation:** Alice bids 200 → Bob's bid of 150 is NOT overwritten or changed

### Edge (score 4 requires all basic + edge to pass)
4. **Derived highest bid correct:** After both bid, highest bid shows 200 (not 150, not sum)
5. **Bid history preserved:** Both users' individual bids exist in the bids table (not just the latest)
6. **No "highest bid" Value:** The app should NOT use `useValueState('highestBid')` — bids should be rows, highest derived by computation

## Static Analysis Expectations
- C1 (useApp): should pass
- C2 (imports): should pass
- W1 (hooks in loops): may warn if agent computes highest bid with hooks inside .map()
```

Use this exact format and level of detail for all 10 specs. Key design choices per spec:

**01-auction:** Interaction script has Alice bid 100, Bob bid 150, Alice bid 200. Assertions check that bids are per-user rows (not overwriting a shared Value), that "highest bid" is correctly derived, and that both users see the same current-highest.

**02-voting-poll:** Alice votes option A, Bob votes option B. Assertions check that Alice can't vote twice, that tally is accurate, and that each user's "has voted" flag is independent.

**03-lobby-game:** Alice creates game (becomes host), Bob joins. Alice marks ready, Bob marks ready, Alice starts game. Assertions check role isolation (only host can start), per-user ready state, shared phase transitions.

**04-inventory-trading:** Both users start with demo items. Alice proposes trade (her item → Bob). Assertions check ownership transfer updates both inventories, and that each user only sees their own items in their inventory view.

**05-shared-timer:** Alice starts a 10-second timer. Assertions check Bob sees the timer running (shared start state), but that the visual countdown is local useState (not synced TinyBase). Edge assertion: Alice pauses, Bob should see pause.

**06-collaborative-ranking:** Both users rank 3 items. Assertions check that rankings are per-user (stored by email), that averaged result is computed correctly, and that changing Alice's ranking doesn't change Bob's ranking.

**07-reaction-game:** A "Click NOW!" prompt appears. Alice clicks first. Assertions check winner is correctly determined by timestamp, Alice's reaction time is per-user, and shared "round winner" syncs to Bob.

**08-kanban (regression):** Same as v1 spec 03 but with interaction script. Tests hooks-in-loop fix.

**09-chat (regression):** Same as v1 spec 04 but with interaction script.

**10-whiteboard (negative control):** Same as v1 spec 07 but with interaction script. Verify no per-user state tables besides `users`.

- [ ] **Step 3: Commit**

```bash
git add eval/specs/
git commit -m "feat(eval): write v2 specs for 10-prompt battery with interaction scripts"
```

---

### Task 4: Rewrite eval SKILL.md with v2 protocol

**Files:**
- Modify: `autoresearch-vibes/skills/eval/SKILL.md`

- [ ] **Step 1: Rewrite SKILL.md with v2 eval loop**

The new SKILL.md replaces the v1 protocol with:

**Prerequisites Check:** Same as v1 plus verify `scripts/eval-static-check.js` exists.

**Phase 1: Read Current State** — Same as v1 (read scoreboard, napkin).

**Phase 2: Improve SKILL.md** — Same as v1 (skip on iteration 1).

**Phase 3: Generate Apps via Subagents** — NEW. For each prompt:
1. Read all 4 reference files from `skills/vibes/references/`
2. Build the generator prompt by inlining reference content + seed prompt
3. Spawn generator agent: `Agent` tool with `model: "sonnet"`, prompt = generator prompt template from spec
4. Extract JSX from agent response, save to `eval/generated/iter-NN/NN-name.jsx`
5. 120-second timeout per agent; on timeout, score 0 and skip

**Phase 4: Static Analysis** — NEW. For each generated .jsx:
1. Run `bun scripts/eval-static-check.js <path>`
2. If critical failures: score 0, log to napkin, skip browser test
3. If warnings only: log to napkin, continue

**Phase 5: Assemble and Test** — Updated from v1:
1. Assemble with `--eval-mode`
2. Copy to unique filename (sync room isolation):
   ```bash
   cp eval/generated/iter-NN/01-auction.html ./eval-01-auction.html
   ```
3. Restart sync server between apps to prevent cross-app data bleed:
   ```bash
   lsof -ti:3334 | xargs kill 2>/dev/null
   bun scripts/server/sync-server.ts &
   sleep 2
   ```
4. Open Alice + Bob tabs in isolated browser contexts
5. Run multi-step interaction script from spec
6. Check assertions (basic tier first, then edge tier)
7. Record graded score (0-4)

**Phase 6: Score and Decide** — Updated:
1. Compute aggregate: `sum(scores) / (num_apps * 4) * 100`
2. Update scoreboard with per-app graded scores
3. Revert/commit logic same as v1 but using aggregate percentage

**Napkin format for static analysis failures:** The SKILL.md should specify that static analysis failures log to napkin in this format:
```
## Static Fail: [check ID] — [app name] (iteration [N])
- **Check:** [check description]
- **Code pattern found:** [the matching code snippet]
- **SKILL.md section that should prevent this:** [section name]
```

**Stopping criteria:** Same as v1 but "perfect score" = 100% (all apps score 4), plateau detection uses aggregate percentage.

- [ ] **Step 2: Commit**

```bash
git add autoresearch-vibes/skills/eval/SKILL.md
git commit -m "feat(eval): rewrite eval skill with v2 protocol — subagent generation, static analysis, graded scoring"
```

---

### Task 5: Reset scoreboard for v2

**Files:**
- Modify: `eval/scoreboard.md`

- [ ] **Step 1: Reset scoreboard with v2 format**

```markdown
# Eval Scoreboard (v2)

## Iteration Results

| Iteration | Aggregate | 01 | 02 | 03 | 04 | 05 | 06 | 07 | 08 | 09 | 10 | SKILL.md Change |
|-----------|-----------|----|----|----|----|----|----|----|----|----|----|-----------------|
| (no iterations yet) | | | | | | | | | | | | |

## Scoring Key

- 0 = Crash (static check fail or React error)
- 1 = Renders (sync broken — data stays local)
- 2 = Partial sync (shared data syncs, per-user state leaks)
- 3 = Isolation correct (basic assertions pass, edge fails)
- 4 = Full pass (all assertions pass)
- Aggregate = sum / (10 * 4) * 100%

## v1 Final Results (preserved for reference)

| Iteration | Score | Note |
|-----------|-------|------|
| 1 | 4/7 (57%) | Baseline — hooks-in-loop caused 3 failures |
| 2 | 7/7 (100%) | Added hooks-in-loop rule to bug-prevention.md |
```

- [ ] **Step 2: Commit**

```bash
git add eval/scoreboard.md
git commit -m "feat(eval): reset scoreboard for v2 with graded scoring format"
```

---

### Task 6: Update autoresearch-vibes CLAUDE.md

**Files:**
- Modify: `autoresearch-vibes/CLAUDE.md`

- [ ] **Step 1: Update CLAUDE.md to reflect v2 changes**

Update the description to mention:
- 10 app categories (up from 7)
- Subagent generation with sonnet model
- Static analysis pre-check phase
- Graded scoring (0-4)
- Reference to the design spec

- [ ] **Step 2: Commit**

```bash
git add autoresearch-vibes/CLAUDE.md
git commit -m "docs: update autoresearch-vibes CLAUDE.md for eval v2"
```

---

### Task 7: Integration smoke test

**Files:** (no new files — tests existing infrastructure)

- [ ] **Step 1: Run static analysis unit tests**

Run: `cd scripts && npx vitest run __tests__/unit/eval-static-check.test.js`
Expected: All PASS

- [ ] **Step 2: Test static analysis on a v1 generated app (known good)**

```bash
bun -e "
import { evalStaticCheck } from './scripts/eval-static-check.js';
const result = evalStaticCheck('eval/generated/iter-02/03-kanban.jsx');
console.log(JSON.stringify(result, null, 2));
"
```
Expected: `passed: true`, no critical failures, possibly some warnings

- [ ] **Step 3: Test static analysis on a v1 generated app (known bad — iter-01 kanban)**

```bash
bun -e "
import { evalStaticCheck } from './scripts/eval-static-check.js';
const result = evalStaticCheck('eval/generated/iter-01/03-kanban.jsx');
console.log(JSON.stringify(result, null, 2));
"
```
Expected: W1 warning (hooks in loops)

- [ ] **Step 4: Verify eval skill loads**

```bash
claude --plugin ./autoresearch-vibes --print "list skills"
```
Expected: `autoresearch-vibes:eval` appears in the list

- [ ] **Step 5: Commit (no changes — verification only)**

No commit needed. If all tests pass, v2 infrastructure is ready for the first eval run.
