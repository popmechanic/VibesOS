# Spec: Reaction Game

## Seed Prompt
A reaction speed game where everyone sees a prompt and the first to click wins

## Expected Data Model
### Tables
- `users` — keyed by email: `{ name, joinedAt }`
- `rounds` — auto-ID rows: `{ prompt, winner, winnerTime, startedAt }`

### Values
- `currentRoundId` — rowId of the active round (or empty string)
- `gamePhase` — one of "waiting", "ready", "go", "ended"

### Key Pattern
Shared round state via Values and rounds table. Each user's reaction is recorded by attempting to set the `winner` and `winnerTime` cells on the current round row — first write wins (subsequent writes ignored if winner already set). No separate per-user reaction table; winner is determined by earliest timestamp stored in the shared round row.

## Interaction Script
1. Alice: click "New Round" (sets gamePhase = "waiting", creates round row)
2. Wait 2s for sync
3. Bob: verify new round is visible
4. Alice: click "Start" (sets gamePhase = "go", records startedAt)
5. Wait 1s for sync
6. Bob: click the reaction button immediately
7. Alice: click the reaction button 200ms later
8. Wait 2s for sync
9. Both: verify winner shown is Bob (earlier timestamp)
10. Both: verify Alice's later click did NOT overwrite Bob's win
11. Alice: start another round, both click — verify winner logic works again

## Hard Assertions

### Basic (score 3 requires all basic to pass)
1. **Shared round sync:** Alice creates round → Bob sees it
2. **Per-user reaction recorded independently:** Both clicks attempt to write winner; only first persists
3. **Winner correctly determined:** Bob clicked first → Bob shown as winner

### Edge (score 4 requires all basic + edge to pass)
4. **Concurrent clicks don't corrupt:** After both click, round row has exactly one winner (not both, not neither)
5. **Winner set by earliest timestamp:** Implementation compares timestamps to determine winner, not write order alone
6. **Subsequent rounds work:** Second round correctly resets and determines a new winner

## Static Analysis Expectations
- C1 (useApp): should pass
- C2 (imports): should pass
- W1 (hooks in loops): should pass
