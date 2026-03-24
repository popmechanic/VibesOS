# Eval Napkin — Failure Log

> Entries are never reverted. Failed experiments still produce useful failure data.
> The napkin grows monotonically.

## Resolved Patterns

(Summarized entries from earlier iterations — kept for context)

## Active Entries

### Failure: Hooks called inside array iteration methods (iteration 1)
- **Apps:** 03-kanban, 05-collaborative-list, 06-dashboard
- **Prompt categories:** Kanban, Collaborative List, Dashboard
- **What happened:** React error #310 ("Rendered fewer hooks than expected") when list length changes. Apps crash on first user interaction that adds/removes rows.
- **Root cause:** Generated code calls `useCell()` inside `.filter()`, `.map()`, or `.forEach()` on row ID arrays. When the array length changes between renders, the number of hook calls changes, violating React's Rules of Hooks.
- **Pattern:** hooks-in-loop
- **Concrete examples:**
  - Kanban `Column`: `allIds.filter(id => { const status = useCell('tasks', id, 'status'); ... })`
  - Collaborative List `ShoppingItem`: `checkoffIds.filter(cid => { const itemId = useCell('checkoffs', cid, 'itemId'); ... })`
  - Dashboard `MetricCards`: `entryIds.forEach(id => { const cat = useCell('entries', id, 'category'); ... })`
- **SKILL.md section that should have prevented this:** "Patterns That Prevent Bugs" — mentions `useCell` in child components, but doesn't explicitly warn against hooks in loops/callbacks
- **What was missing from SKILL.md:** An explicit rule: "Never call TinyBase hooks inside `.map()`, `.filter()`, `.forEach()`, or any loop/callback. Hooks must be at the top level of a component. To read data for multiple rows, render a child component per row and call hooks inside each child." Need a concrete bad-vs-good code example showing the pattern and its fix.
- **Fix pattern:** Instead of filtering with hooks inline, either (a) use `useTable` to read all data at once then filter plain objects, or (b) render a child component per row that calls hooks at top level and conditionally renders.
