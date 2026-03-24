# Spec: Shared Timer

## Seed Prompt
A shared countdown timer that one user starts and all users see ticking down

## Expected Data Model
### Tables
- `users` — keyed by email: `{ name, joinedAt }`

### Values
- `timerRunning` — boolean (true/false)
- `timerEndTime` — Unix timestamp (ms) when timer expires
- `timerDuration` — duration in seconds (set when starting)

### Key Pattern
Start/stop/pause is shared state via Values. The visual countdown tick is computed locally from `timerEndTime - Date.now()` using local useState + setInterval — NOT stored in TinyBase. No "seconds" or "remaining" cell or Value should exist; only the absolute end time is synced.

## Interaction Script
1. Alice: set timer to 10 seconds
2. Alice: click "Start"
3. Wait 2s for sync
4. Bob: verify timer is running and showing approximately 8s remaining
5. Alice: click "Pause"
6. Wait 2s for sync
7. Bob: verify timer shows paused state (not ticking)
8. Alice: click "Resume"
9. Wait 2s for sync
10. Bob: verify timer resumes ticking from paused position

## Hard Assertions

### Basic (score 3 requires all basic to pass)
1. **Shared start state syncs:** Alice starts timer → Bob sees it running
2. **Timer tick renders locally:** Countdown display updates every second without syncing each tick
3. **Pause syncs to Bob:** Alice pauses → Bob's display stops ticking

### Edge (score 4 requires all basic + edge to pass)
4. **No "seconds" or "remaining" Value:** App does NOT store current countdown seconds in TinyBase
5. **End time approach:** Timer uses absolute `timerEndTime` Value, computes remaining locally
6. **Resume from correct position:** After pause+resume, remaining time is accurate (not reset)

## Static Analysis Expectations
- C1 (useApp): should pass
- C2 (imports): should pass
- W1 (hooks in loops): should pass
