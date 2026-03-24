# Spec: Auction App

## Seed Prompt
An auction app where users bid on items and the highest bid wins

## Expected Data Model
### Tables
- `users` — keyed by email: `{ name, joinedAt }`
- `items` — auto-ID rows: `{ name, description, startingPrice, createdBy, createdAt }`
- `bids` — auto-ID rows: `{ itemId, amount, bidder, bidderName, timestamp }`

### Values
(none — highest bid is derived from bids table, not stored as a Value)

### Key Pattern
Per-user state: each bid row has `bidder: myEmail`. Shared state: all bids visible to all users. "Highest bid" computed by filtering bids for an item and finding max amount — NOT stored as a single Value.

## Interaction Script
1. Alice: click "Load Demo Items" button (or add item "Vintage Watch" starting price 50)
2. Wait 2s for sync
3. Bob: verify "Vintage Watch" appears in his item list
4. Alice: place bid of 100 on "Vintage Watch"
5. Wait 2s for sync
6. Bob: verify bid of 100 from Alice is visible
7. Bob: place bid of 150 on "Vintage Watch"
8. Wait 2s for sync
9. Alice: verify highest bid = 150 from Bob
10. Alice: place bid of 200
11. Wait 2s for sync
12. Bob: verify highest bid = 200 from Alice
13. Bob: verify his OWN bid of 150 still exists (not overwritten)

## Hard Assertions

### Basic (score 3 requires all basic to pass)
1. **Shared item sync:** Alice adds item → Bob sees it
2. **Shared bid sync:** Alice bids → Bob sees the bid with correct amount and bidder
3. **Per-user bid isolation:** Alice bids 200 → Bob's bid of 150 is NOT overwritten

### Edge (score 4 requires all basic + edge to pass)
4. **Derived highest bid correct:** After both bid, highest bid shows 200 (not 150, not sum)
5. **Bid history preserved:** Both users' individual bids exist in bids table
6. **No "highest bid" Value:** App should NOT use useValueState('highestBid')

## Static Analysis Expectations
- C1 (useApp): should pass
- C2 (imports): should pass
- W1 (hooks in loops): may warn if agent computes highest bid with hooks inside .map()
