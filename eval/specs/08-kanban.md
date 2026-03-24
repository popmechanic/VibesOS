# Spec: Kanban Board

## Seed Prompt
A shared task board with personal filters and status columns

## Expected Data Model
### Tables
- `tasks` — auto-ID rows: `{ title, status, createdBy, assignee }`
- `preferences` — keyed by email: `{ filterMyTasks }`

### Values
(none)

### Key Pattern
Shared tasks table visible to all users. Per-user filter preference stored in preferences table keyed by email. `filterMyTasks` is a boolean cell — when true, user sees only tasks where assignee=myEmail. Filter state is per-user and does NOT sync to affect the other user's view.

## Interaction Script
1. Alice: create task "Write tests" assigned to Alice, status "todo"
2. Wait 2s for sync
3. Bob: verify "Write tests" appears in his board
4. Alice: enable "Show my tasks only" filter
5. Wait 2s for sync
6. Bob: verify Bob's filter is still showing ALL tasks (not affected by Alice's preference)
7. Alice: move "Write tests" to "in progress" status
8. Wait 2s for sync
9. Bob: verify "Write tests" appears in "in progress" column
10. Bob: create task "Deploy app" assigned to Bob
11. Wait 2s for sync
12. Alice: with her filter on, verify "Deploy app" does NOT appear (not assigned to Alice)
13. Alice: verify "Write tests" still appears (assigned to Alice)

## Hard Assertions

### Basic (score 3 requires all basic to pass)
1. **Shared task sync:** Alice creates task → Bob sees it
2. **Per-user filter isolation:** Alice enables filter → Bob's view unchanged (still sees all tasks)
3. **Task status change syncs:** Alice moves task to "in progress" → Bob sees updated status

### Edge (score 4 requires all basic + edge to pass)
4. **Filter correctly shows/hides tasks:** When Alice's filter is on, only her assigned tasks appear
5. **Multiple tasks work:** Both users' tasks coexist in shared table without collision
6. **Filter preference persisted:** Alice's filterMyTasks preference stored in preferences table, not local state

## Static Analysis Expectations
- C1 (useApp): should pass
- C2 (imports): should pass
- W1 (hooks in loops): should pass
