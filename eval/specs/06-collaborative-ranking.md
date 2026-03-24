# Spec: Collaborative Ranking

## Seed Prompt
A collaborative ranking app where users each rank items and see the averaged result

## Expected Data Model
### Tables
- `users` — keyed by email: `{ name, joinedAt }`
- `items` — auto-ID rows: `{ name }`
- `rankings` — composite key `email::itemId`: `{ rank, rankerEmail, itemId }`

### Values
(none — average computed from rankings table)

### Key Pattern
Per-user rankings keyed by `email::itemId` (composite). Each user sets their own ranking row. Average rank computed by reading all ranking rows for an item and averaging the `rank` cell values. Cells are scalar numbers — NOT arrays or JSON strings. Changing one user's ranking does not affect another's row.

## Interaction Script
1. Alice: load demo items (or add "Pizza", "Tacos", "Sushi")
2. Wait 2s for sync
3. Bob: verify all 3 items appear
4. Alice: rank Pizza=1, Tacos=2, Sushi=3
5. Wait 2s for sync
6. Bob: rank Pizza=3, Tacos=1, Sushi=2
7. Wait 2s for sync
8. Alice: verify averaged rankings: Pizza=2, Tacos=1.5, Sushi=2.5
9. Alice: change her Pizza ranking to 2
10. Wait 2s for sync
11. Bob: verify Bob's Pizza ranking is still 3 (unchanged)
12. Both: verify new average Pizza rank = 2.5

## Hard Assertions

### Basic (score 3 requires all basic to pass)
1. **Shared items sync:** Alice adds items → Bob sees them
2. **Per-user ranking isolation:** Alice changes her rank → Bob's rank row unchanged
3. **Average correctly computed:** After both rank, averages reflect both users' inputs

### Edge (score 4 requires all basic + edge to pass)
4. **No array/JSON cell values:** rank cells are plain numbers, not arrays or JSON strings
5. **Composite key pattern used:** ranking rows keyed by email::itemId (or equivalent per-user-per-item key)
6. **Changing one user's rank updates average:** New average computed correctly after Alice's change

## Static Analysis Expectations
- C1 (useApp): should pass
- C2 (imports): should pass
- W1 (hooks in loops): may warn if agent reads rankings with hooks inside items .map()
