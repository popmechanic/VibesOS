# Spec: Inventory Trading

## Seed Prompt
An inventory app where users have personal collections and can trade items with each other

## Expected Data Model
### Tables
- `users` — keyed by email: `{ name, joinedAt }`
- `items` — auto-ID rows: `{ name, owner, createdAt }`

### Values
(none)

### Key Pattern
Items have an `owner` cell containing the owner's email. Each user's "inventory" is computed by filtering items where owner=myEmail. Transfer = update the `owner` cell on the item row to the recipient's email. Both users share the same items table — no separate per-user tables.

## Interaction Script
1. Alice: click "Load Demo Items" (or add item "Magic Sword" owned by Alice)
2. Wait 2s for sync
3. Bob: verify "Magic Sword" appears in Alice's inventory (shared table visible)
4. Alice: verify "Magic Sword" appears in her own inventory filter
5. Bob: verify "Magic Sword" does NOT appear in his inventory filter
6. Alice: transfer "Magic Sword" to Bob
7. Wait 2s for sync
8. Alice: verify "Magic Sword" no longer in her inventory
9. Bob: verify "Magic Sword" now in his inventory

## Hard Assertions

### Basic (score 3 requires all basic to pass)
1. **Per-user inventory view:** Alice's view shows only items where owner=Alice's email
2. **Shared item table syncs:** Alice adds item → Bob sees it in the shared table
3. **Transfer removes from sender:** After transfer, item disappears from Alice's filtered view

### Edge (score 4 requires all basic + edge to pass)
4. **Ownership transfer updates both views:** Bob's inventory gains item, Alice's loses it
5. **Single items table:** No separate per-user item tables — one shared `items` table with `owner` cell
6. **Transfer updates owner cell:** Implementation uses store.setCell or setRow to change owner, not delete+recreate

## Static Analysis Expectations
- C1 (useApp): should pass
- C2 (imports): should pass
- W1 (hooks in loops): should pass
