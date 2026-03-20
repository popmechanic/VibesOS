# useAI Redesign — Clean OpenRouter Passthrough

**Date:** 2026-03-20
**Status:** Draft

## Problem

The current `useAI` hook has several bugs that cause generated AI-powered apps to silently fail:

1. **`callAI` uses `...options` spread** — dumps the entire options object (including `messages`, `model`) as duplicate keys in the request body. Any non-API property the caller passes also leaks into the request.
2. **`callAI` throws on errors** — but generated apps don't wrap calls in try/catch. When the call fails, the thrown error is unhandled and the UI's manual `"..."` loading placeholder is never cleared. The user sees a frozen ellipsis with no console errors.
3. **`ask` manages singleton `answer` state** — only supports one streaming response per component. Can't build multi-panel UIs or concurrent requests.
4. **Inconsistent error handling** — `callAI` throws, `ask` silently sets error state. Different patterns for the same hook.
5. **SKILL.md and ai-instructions.ts teach the broken patterns** — generated code copies the buggy examples directly.
6. **`useAICompat` is dead code** — duplicate implementation with the same `...options` bug, plus a stale closure bug on line 227 (`!error` references the outer state instead of `!err.code`).
7. **`callAI` returns raw OpenRouter response** — apps must navigate `response.choices[0].message.content` to get text, adding fragile boilerplate that the generator often gets wrong.

## Design

### API Surface

```jsx
const { callAI, streamAI, loading, error, clearError } = useAI();
```

Two functions, consistent shape, shared state.

### `callAI(options)` — Non-streaming, async

```jsx
const text = await callAI({
  messages: [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: userMessage }
  ],
  model: "anthropic/claude-sonnet-4",    // optional, defaults to claude-sonnet-4
  temperature: 0.7,                       // optional OpenRouter param
  max_tokens: 1000,                       // optional OpenRouter param
});
// text is a string, or null on error
```

- Async function — must be awaited
- Returns `string` (extracted from `choices[0].message.content`) on success
- Returns `null` on error (never throws — `error` state is set automatically)
- For advanced use cases (tool calls, usage stats, finish reason): pass `raw: true` to get the full OpenRouter response object instead of extracted text

### `streamAI(options)` — Streaming, synchronous call returning async iterator

```jsx
const stream = streamAI({
  messages: [...],
  model: "anthropic/claude-sonnet-4",
});
if (!stream) return; // error state set

let accumulated = "";
for await (const chunk of stream) {
  accumulated += chunk;
  setResponse(accumulated);
}
```

- **Synchronous function** (no `await`) — returns immediately with either an `AsyncGenerator<string>` or `null`
- Pre-flight checks (proxy configured, token present) happen synchronously — if they fail, returns `null` and sets `error` state
- The async generator handles the actual fetch and SSE parsing internally
- If an error occurs mid-stream (network drop, API error), the generator sets `error` state and stops yielding (does not throw)
- `stream: true` added to the request body automatically — caller never sets it
- App owns its state — no internal `answer` singleton

### Options Handling

Reserved properties (consumed by the hook, not sent to OpenRouter):
- `messages` — extracted and placed in body explicitly
- `model` — extracted, defaulted, placed in body explicitly
- `raw` — controls `callAI` return type (`callAI` only)

Everything else passes through to OpenRouter verbatim:

```javascript
const { messages, model, raw, ...apiParams } = options;
const body = {
  model: model || "anthropic/claude-sonnet-4",
  messages,
  ...apiParams,
};
```

No reserved properties leak into `apiParams`. OpenRouter uses the `provider/model` format (e.g. `"anthropic/claude-sonnet-4"`, `"openai/gpt-4o"`) — any model from the [OpenRouter catalog](https://openrouter.ai/models) works.

This means `temperature`, `max_tokens`, `tools`, `response_format`, `provider`, `stop`, `top_p`, and any future OpenRouter parameters work without updating our code.

### Error Handling

Neither function throws. Both return `null` and set `error` state:

```jsx
const text = await callAI({ messages: [...] });
if (!text) return; // error state already set, UI reacts
```

Error codes:

| Code | Meaning | When |
|------|---------|------|
| `NOT_CONFIGURED` | Proxy URL missing | App not assembled correctly |
| `AUTH_REQUIRED` | No OIDC token | User not signed in |
| `UNAUTHORIZED` | 401 from proxy | Token expired |
| `RATE_LIMITED` | 429 from proxy | Too many requests |
| `API_ERROR` | Other non-OK response | Model error, bad params |
| `NETWORK_ERROR` | Fetch failed | Offline, DNS, timeout |

### Default Model

Both functions default to `"anthropic/claude-sonnet-4"` when `model` is omitted. The current implementation uses `"anthropic/claude-sonnet-4.6"` — this is intentionally changed to the shorter alias which OpenRouter resolves to the latest Sonnet version.

### Concurrency

`loading` and `error` are shared state within a single `useAI()` hook instance. For concurrent requests (e.g. two AI panels side-by-side), use separate `useAI()` instances — one per independent request. This is the standard React pattern for independent state.

## Files Changed

### `bundles/vibes-ai.js` — Rewrite (~120 lines)

Replace the entire `useAI` implementation:

- New `useAI()` returns `{ callAI, streamAI, loading, error, clearError }`
- `callAI`: destructures reserved props, spreads API params, fetches non-streaming, extracts text (or returns full response with `raw: true`), returns `null` on error
- `streamAI`: same options handling, adds `stream: true`, returns async generator over SSE chunks, returns `null` on error
- SSE parser (`parseSSEStream`) stays — used internally by `streamAI`
- Remove `ask`, `answer` (replaced by `streamAI`)
- Remove `useAICompat` (dead code with bugs)
- Remove `window.useAICompat` assignment

Estimated size: similar or smaller than current (~120 lines vs ~240 lines).

### `skills/vibes/SKILL.md` — Update useAI section (~40 lines changed)

Replace the "useAI API" section (lines 512–533):

- Show `callAI` returning text directly
- Show `streamAI` with app-controlled state
- Show null-check error handling pattern
- Update error code table: replace `LIMIT_EXCEEDED` with `RATE_LIMITED`, add `NOT_CONFIGURED`, `AUTH_REQUIRED`, `UNAUTHORIZED`
- Move `temperature`/`max_tokens` to an "OpenRouter params" subsection (not in the basic example, so generated apps don't include them by default)
- Document `raw: true` for tool calls / advanced usage
- Keep the "Detecting AI Requirements" and "Deployment with AI" sections unchanged

### `scripts/server/ai-instructions.ts` — Update both prompts (~30 lines changed)

`AI_INSTRUCTIONS_GENERATE` (full context for new apps):
- Update examples to use `callAI` returning text and `streamAI` with iterator
- Show null-check error handling
- Update rules list

`AI_INSTRUCTIONS_CHAT` (compact context for edits):
- Same updates, condensed form

### `ai-worker/src/index.ts` — No changes

The proxy is already a clean passthrough. It takes the request body as-is and forwards to OpenRouter. This is correct behavior and requires no modification.

### Files NOT changed

- `source-templates/` — `useAI` is loaded from the bundle, no template changes
- `deploy-api/` — not involved in the AI call chain
- `scripts/server/router.ts`, `handlers/` — server logic unchanged, only instruction strings update

## Migration

All existing deployed AI apps will break when `vibes-ai.js` changes. Breaking changes:

- `ask`/`answer` removed — replaced by `streamAI` returning an async iterator
- `callAI` returns text string instead of raw response object — code using `response.choices[0].message.content` breaks
- `callAI` returns `null` on error instead of throwing
- Error code `LIMIT_EXCEEDED` renamed to `RATE_LIMITED`
- `useAICompat` removed

However, these apps are generated code — users regenerate them through the editor, which uses the updated ai-instructions.ts. No manual migration path needed.

## Testing

- Unit test: `callAI` returns text string on success, `null` on error
- Unit test: `streamAI` yields chunks on success, returns `null` on error
- Unit test: reserved props (`messages`, `raw`) don't leak into request body
- Unit test: all OpenRouter params pass through correctly
- Integration test: generate an AI app via the editor, verify it works end-to-end
- Verify `raw: true` returns full response object
