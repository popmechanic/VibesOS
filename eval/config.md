# Autoresearch Eval Configuration

## Prompt Battery

| # | Category | Seed Prompt | State Isolation Challenge |
|---|----------|-------------|--------------------------|
| 1 | Game | A trivia game where players compete | Per-player scores and answers vs shared questions |
| 2 | Team Selection | A game where players pick teams before playing | Per-player team choice vs shared game state |
| 3 | Kanban | A shared task board with personal filters | Shared tasks vs per-user view preferences |
| 4 | Chat | A chat room with user status indicators | Shared messages vs per-user typing/online status |
| 5 | Collaborative List | A shared shopping list with personal checkoffs | Shared items vs per-user "I bought this" state |
| 6 | Dashboard | A shared dashboard where each user customizes their view | Shared data vs per-user layout preferences |
| 7 | Shared-Only (negative control) | A collaborative whiteboard where everyone draws on the same canvas | Has NO per-user state — verifies SKILL.md doesn't overcorrect |

## Test Users

- Alice: `?testUser=alice@test.com`
- Bob: `?testUser=bob@test.com`

## Stopping Criteria

- **Score plateau:** 3 consecutive iterations with no improvement
- **Perfect score:** All prompts pass — add new prompts from napkin discoveries, continue
- **Oscillation:** Fixing one prompt breaks another on 2+ consecutive iterations — surface to human
- **Hard cap:** 30 iterations max before requiring human review

## Human Checkpoints

After every 10 iterations (or on perfect score), pause and produce a summary.

## Spec Caching

Specs are generated on iteration 1 and reused. Regenerate only after a human checkpoint (treated as baseline reset — no revert logic applies).

## Revert Mechanics

- Score improved: `git commit` SKILL.md + eval artifacts
- Score worse: `git checkout <last-good-sha> -- skills/vibes/SKILL.md`, commit eval artifacts separately
- Same score, same prompts pass: true stagnation, revert and try different approach
- Same score, different prompts pass/fail: lateral movement, analyze napkin before deciding

## Context Window Management

Summarize napkin entries older than 5 iterations into a "resolved patterns" section. Skim specs for currently-passing prompts.

## Test Timeouts

60 seconds per individual app test. Log timeout to napkin, continue to next prompt.
