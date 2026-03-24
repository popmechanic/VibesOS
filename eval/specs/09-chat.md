# Spec: Chat Room

## Seed Prompt
A chat room with user status indicators

## Expected Data Model
### Tables
- `messages` — auto-ID rows: `{ text, sender, senderName, timestamp }`
- `users` — keyed by email: `{ name, status, lastActive }`

### Values
(none)

### Key Pattern
Shared messages table — all messages visible to all users. Per-user status stored in users table keyed by email. Each user writes only to their own row in users (keyed by myEmail). Setting status updates only the current user's row, leaving other users' rows unchanged.

## Interaction Script
1. Alice: send message "Hello from Alice"
2. Wait 2s for sync
3. Bob: verify "Hello from Alice" appears with Alice's name
4. Bob: send message "Hello from Bob"
5. Wait 2s for sync
6. Alice: verify "Hello from Bob" appears with Bob's name
7. Alice: set status to "brb"
8. Wait 2s for sync
9. Bob: verify Alice's status shows "brb"
10. Bob: set status to "available"
11. Wait 2s for sync
12. Alice: verify Bob's status shows "available"
13. Alice: verify her OWN status is still "brb" (not overwritten by Bob's update)

## Hard Assertions

### Basic (score 3 requires all basic to pass)
1. **Shared message sync:** Alice sends message → Bob sees it with correct sender attribution
2. **Per-user status isolation:** Alice sets status "brb" → Bob's status unchanged
3. **Message attribution:** Each message row contains sender email and senderName

### Edge (score 4 requires all basic + edge to pass)
4. **Both statuses coexist:** After both set status, Alice sees "brb" and Bob sees "available"
5. **Status update scoped to own row:** Status changes use myEmail as row key, not overwriting others
6. **Messages ordered by timestamp:** Messages display in chronological order

## Static Analysis Expectations
- C1 (useApp): should pass
- C2 (imports): should pass
- W1 (hooks in loops): should pass
