# Spec: Lobby Game

## Seed Prompt
A game with a lobby where the host starts the game and players join

## Expected Data Model
### Tables
- `users` — keyed by email: `{ name, ready, role }`

### Values
- `gamePhase` — one of "lobby", "playing", "ended"
- `hostEmail` — email of the host (first user to join)

### Key Pattern
First user to join becomes host (stored in `hostEmail` Value). Per-user readiness stored in users table (`ready` cell per row). Only the host can transition `gamePhase`. All phase and host state is shared via Values; readiness is per-user via rows.

## Interaction Script
1. Alice: open app (becomes host, hostEmail = Alice's email)
2. Bob: open app in second tab
3. Wait 2s for sync
4. Alice: verify Bob appears in the lobby user list
5. Bob: verify Alice appears and is marked as host
6. Bob: click "Ready"
7. Wait 2s for sync
8. Alice: verify Bob is marked ready
9. Alice: click "Ready"
10. Alice: click "Start Game" button
11. Wait 2s for sync
12. Bob: verify gamePhase is now "playing"
13. Bob: attempt to click "Start Game" (should be disabled or hidden — only host can start)

## Hard Assertions

### Basic (score 3 requires all basic to pass)
1. **Shared phase sync:** Alice starts game → Bob sees gamePhase change to "playing"
2. **Per-user ready isolation:** Bob marks ready → Alice's ready status unchanged
3. **Both users visible:** Each user sees the other in the lobby list

### Edge (score 4 requires all basic + edge to pass)
4. **Only host can start:** Start button disabled or absent for non-host users
5. **Role assignment correct:** hostEmail Value matches the first user who joined
6. **Phase transitions shared:** All phase transitions visible to all users via Values

## Static Analysis Expectations
- C1 (useApp): should pass
- C2 (imports): should pass
- W1 (hooks in loops): should pass
