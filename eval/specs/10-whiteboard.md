# Spec: Collaborative Whiteboard

## Seed Prompt
A collaborative whiteboard where everyone draws on the same canvas

## Expected Data Model
### Tables
- `shapes` — auto-ID rows: `{ type, x, y, color, size, createdBy }`
- `users` — keyed by email: `{ name, joinedAt }`

### Values
(none)

### Key Pattern
ALL shape state is shared — no per-user shape tables. Tool selection (circle, square, color picker) is local React useState and is NOT synced. Both users contribute to the same `shapes` table and see each other's shapes immediately. The users table is per-user (keyed by email) for presence, but shapes are fully shared.

## Interaction Script
1. Alice: select "Circle" tool and click canvas to add a circle at position (100, 100)
2. Wait 2s for sync
3. Bob: verify Alice's circle appears on his canvas
4. Bob: select "Square" tool and add a square at position (200, 200)
5. Wait 2s for sync
6. Alice: verify Bob's square appears on her canvas
7. Alice: verify her circle is still present (not overwritten)
8. Bob: change tool to "Triangle", verify Alice's tool selection is unaffected (she still sees her last tool)
9. Alice: add another circle at (300, 100)
10. Wait 2s for sync
11. Bob: verify both of Alice's circles and his square are all visible (3 shapes total)

## Hard Assertions

### Basic (score 3 requires all basic to pass)
1. **Shared shape sync Alice→Bob:** Alice adds circle → Bob sees it
2. **Shared shape sync Bob→Alice:** Bob adds square → Alice sees it
3. **Both shapes coexist:** After both add shapes, all shapes visible to both users simultaneously

### Edge (score 4 requires all basic + edge to pass)
4. **No per-user preference tables:** No synced table for tool selection, color preference, or cursor position
5. **Tool selection is local useState:** Changing tool updates local state only, not TinyBase
6. **createdBy attribution:** Each shape row stores the creator's email in `createdBy` cell

## Static Analysis Expectations
- C1 (useApp): should pass
- C2 (imports): should pass
- W1 (hooks in loops): should pass
