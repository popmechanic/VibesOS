# Spec: Voting Poll

## Seed Prompt
A voting poll where users vote once per question and see live results

## Expected Data Model
### Tables
- `users` — keyed by email: `{ name, joinedAt }`
- `questions` — auto-ID rows: `{ text, options }`
- `votes` — auto-ID rows: `{ questionId, option, voter, timestamp }`

### Values
(none — tally derived from votes table, not stored as Values)

### Key Pattern
Per-user "has voted" tracked by checking if a row with voter=myEmail exists in the votes table for a given questionId. Tally computed by filtering votes for a question and counting by option — NOT stored as a single Value or cell.

## Interaction Script
1. Alice: add question "Favorite color?" with options "Red, Blue, Green"
2. Wait 2s for sync
3. Bob: verify question appears
4. Alice: vote for option "Blue"
5. Wait 2s for sync
6. Bob: verify tally shows 1 vote for Blue
7. Bob: vote for option "Red"
8. Wait 2s for sync
9. Alice: verify tally shows Blue=1, Red=1
10. Alice: attempt to vote again on same question
11. Verify Alice cannot submit a second vote (UI prevents or ignores it)

## Hard Assertions

### Basic (score 3 requires all basic to pass)
1. **Shared question sync:** Alice adds question → Bob sees it
2. **Per-user vote isolation:** Alice votes Blue, Bob votes Red — each vote exists as a separate row
3. **Vote tally correct:** After both vote, tally shows Blue=1, Red=1

### Edge (score 4 requires all basic + edge to pass)
4. **Double-vote prevention:** Alice cannot submit a second vote for the same question
5. **Tally uses row counting:** Tally computed by counting rows, NOT reading a single "count" cell or Value
6. **Vote attribution:** Each vote row contains the voter's email

## Static Analysis Expectations
- C1 (useApp): should pass
- C2 (imports): should pass
- W1 (hooks in loops): may warn if agent calls hooks inside question/option .map()
