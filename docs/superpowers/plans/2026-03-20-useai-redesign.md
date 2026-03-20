# useAI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the buggy `useAI` hook with a clean OpenRouter passthrough that returns text directly, never throws, and exposes full API capability.

**Architecture:** Rewrite `bundles/vibes-ai.js` as a thin auth/proxy wrapper with two functions (`callAI` for non-streaming, `streamAI` for streaming). Both return `null` on error instead of throwing. All OpenRouter params pass through via explicit destructuring. Update SKILL.md and ai-instructions.ts to teach the new patterns.

**Tech Stack:** Vanilla JS (ES module bundle), React hooks, OpenRouter API, SSE streaming, Vitest

**Spec:** `docs/superpowers/specs/2026-03-20-useai-redesign-design.md`

---

### Task 1: Write tests for the new useAI hook

The existing `vibes-ai.test.js` tests only cover the SSE parser (imported from `bundles/sse-parser.js`). We need tests for the hook's fetch logic — options handling, error codes, and return values. Since `useAI` is a React hook running in browsers, we test the extractable logic (request body construction, response extraction, error mapping) without React.

**Files:**
- Create: `scripts/__tests__/unit/useai-logic.test.js`
- Read: `bundles/vibes-ai.js` (current implementation, for understanding)
- Read: `docs/superpowers/specs/2026-03-20-useai-redesign-design.md` (spec)

- [ ] **Step 1: Write tests for `buildRequestBody` — options destructuring**

```javascript
import { describe, it, expect } from 'vitest';
import { buildRequestBody } from '../../../bundles/vibes-ai.js';

describe('buildRequestBody', () => {
  it('extracts messages and model, spreads API params', () => {
    const body = buildRequestBody({
      messages: [{ role: "user", content: "hi" }],
      model: "anthropic/claude-sonnet-4",
      temperature: 0.7,
      max_tokens: 1000,
    });
    expect(body).toEqual({
      model: "anthropic/claude-sonnet-4",
      messages: [{ role: "user", content: "hi" }],
      temperature: 0.7,
      max_tokens: 1000,
    });
  });

  it('defaults model to anthropic/claude-sonnet-4', () => {
    const body = buildRequestBody({
      messages: [{ role: "user", content: "hi" }],
    });
    expect(body.model).toBe("anthropic/claude-sonnet-4");
  });

  it('does not leak reserved props (raw) into body', () => {
    const body = buildRequestBody({
      messages: [{ role: "user", content: "hi" }],
      raw: true,
      temperature: 0.5,
    });
    expect(body).not.toHaveProperty("raw");
    expect(body.temperature).toBe(0.5);
  });

  it('passes through OpenRouter-specific params', () => {
    const body = buildRequestBody({
      messages: [{ role: "user", content: "hi" }],
      response_format: { type: "json_object" },
      tools: [{ type: "function", function: { name: "test" } }],
      provider: { order: ["Anthropic"] },
      stop: ["\n"],
    });
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.tools).toHaveLength(1);
    expect(body.provider).toEqual({ order: ["Anthropic"] });
    expect(body.stop).toEqual(["\n"]);
  });

  it('adds stream: true when streaming flag is set', () => {
    const body = buildRequestBody({
      messages: [{ role: "user", content: "hi" }],
    }, { stream: true });
    expect(body.stream).toBe(true);
  });
});
```

- [ ] **Step 2: Write tests for `extractContent` — response text extraction**

```javascript
import { extractContent } from '../../../bundles/vibes-ai.js';

describe('extractContent', () => {
  it('extracts text from standard OpenRouter response', () => {
    const response = {
      choices: [{ message: { content: "Hello world", role: "assistant" } }],
      model: "anthropic/claude-sonnet-4",
    };
    expect(extractContent(response)).toBe("Hello world");
  });

  it('returns null for empty choices', () => {
    expect(extractContent({ choices: [] })).toBeNull();
  });

  it('returns null for null content', () => {
    const response = { choices: [{ message: { content: null } }] };
    expect(extractContent(response)).toBeNull();
  });

  it('returns null for missing message', () => {
    const response = { choices: [{}] };
    expect(extractContent(response)).toBeNull();
  });
});
```

- [ ] **Step 3: Write tests for `mapErrorResponse` — HTTP status to error codes**

```javascript
import { mapErrorResponse } from '../../../bundles/vibes-ai.js';

describe('mapErrorResponse', () => {
  it('maps 401 to UNAUTHORIZED', () => {
    const err = mapErrorResponse(401, {});
    expect(err.code).toBe("UNAUTHORIZED");
  });

  it('maps 429 to RATE_LIMITED', () => {
    const err = mapErrorResponse(429, {});
    expect(err.code).toBe("RATE_LIMITED");
  });

  it('maps other errors to API_ERROR with message from body', () => {
    const err = mapErrorResponse(500, { error: { message: "Internal error" } });
    expect(err.code).toBe("API_ERROR");
    expect(err.message).toBe("Internal error");
  });

  it('falls back to status code message when body has no error', () => {
    const err = mapErrorResponse(503, {});
    expect(err.code).toBe("API_ERROR");
    expect(err.message).toContain("503");
  });

  it('does not produce [object Object] when error is an object without message', () => {
    const err = mapErrorResponse(500, { error: { code: 123 } });
    expect(err.message).not.toContain("[object Object]");
    expect(err.message).toContain("500");
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `cd scripts && npx vitest run __tests__/unit/useai-logic.test.js`
Expected: FAIL — the current `vibes-ai.js` is an IIFE with no exports, so the import will error. This is expected; the tests will pass once Task 2 rewrites the file.

- [ ] **Step 5: Commit test file**

```bash
git add scripts/__tests__/unit/useai-logic.test.js
git commit -m "test: add unit tests for useAI options handling, response extraction, error mapping"
```

---

### Task 2: Rewrite `bundles/vibes-ai.js`

Replace the entire implementation. The new version exports testable helper functions and exposes `useAI` on `window`.

**Files:**
- Modify: `bundles/vibes-ai.js` (full rewrite)
- Read: `bundles/sse-parser.js` (SSE parser — stays separate, used by existing tests)

**Important:** `vibes-ai.js` is loaded via `<script type="module">` in the browser template (`source-templates/base/template.html:648`). This means top-level `export` statements work natively. Drop the IIFE wrapper — use a module-level React check with early return via a guarded block. Testable helpers are exported normally; the React hook is assigned to `window.useAI` at module scope.

**Note:** The SSE parser is inlined in `vibes-ai.js` (not imported from `sse-parser.js`) because the template only loads one script. The `sse-parser.js` file remains as the source-of-truth for its own tests. If the two copies drift, sync them.

**Deliberate change:** Default model changes from `"anthropic/claude-sonnet-4.6"` to `"anthropic/claude-sonnet-4"` — the shorter alias which OpenRouter resolves to the latest Sonnet version. See spec "Default Model" section.

- [ ] **Step 1: Write the new `vibes-ai.js`**

```javascript
/**
 * Vibes AI Hook
 * Provides useAI() — a thin wrapper around the OpenRouter API.
 * Reads proxy URL from window.__VIBES_CONFIG__.aiProxyUrl.
 * Requires OIDC auth — token sourced from window.__VIBES_OIDC_TOKEN__.
 */

// --- Testable helpers (exported for unit tests) ---

/**
 * Build the OpenRouter request body from user options.
 * Destructures reserved props (messages, model, raw), spreads everything else.
 * @param {object} options - User-provided options
 * @param {object} [flags] - Internal flags (e.g. { stream: true })
 * @returns {object} Request body for OpenRouter
 */
export function buildRequestBody(options, flags) {
  const { messages, model, raw, ...apiParams } = options;
  return {
    model: model || "anthropic/claude-sonnet-4",
    messages,
    ...apiParams,
    ...(flags || {}),
  };
}

/**
 * Extract text content from an OpenRouter response.
 * @param {object} response - Parsed JSON response
 * @returns {string|null} The text content, or null if missing
 */
export function extractContent(response) {
  return response?.choices?.[0]?.message?.content ?? null;
}

/**
 * Map an HTTP error response to a structured error object.
 * @param {number} status - HTTP status code
 * @param {object} body - Parsed response body (may be empty)
 * @returns {{ code: string, message: string }}
 */
export function mapErrorResponse(status, body) {
  if (status === 401) {
    return { code: "UNAUTHORIZED", message: "Session expired — sign in again" };
  }
  if (status === 429) {
    return { code: "RATE_LIMITED", message: "Too many requests — try again shortly" };
  }
  const msg = body?.error?.message
    || (typeof body?.error === "string" ? body.error : null)
    || "AI service error: " + status;
  return { code: "API_ERROR", message: msg };
}

// --- SSE Parser (inlined from sse-parser.js for browser bundle) ---

async function* parseSSEStream(reader) {
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(":")) continue;
      if (trimmed === "data: [DONE]") return;
      if (trimmed.startsWith("data: ")) {
        try {
          const json = JSON.parse(trimmed.slice(6));
          const content = json.choices?.[0]?.delta?.content;
          if (content) yield content;
        } catch {
          // Skip malformed JSON chunks
        }
      }
    }
  }

  if (buffer.trim() && buffer.trim().startsWith("data: ") && buffer.trim() !== "data: [DONE]") {
    try {
      const json = JSON.parse(buffer.trim().slice(6));
      const content = json.choices?.[0]?.delta?.content;
      if (content) yield content;
    } catch {
      // Skip
    }
  }
}

// --- React Hook (module scope — no IIFE needed, loaded as type="module") ---

const React = window.React;

if (React) {
  /**
   * Pre-flight checks shared by callAI and streamAI.
   * Returns { proxyUrl, token } on success, or null (after setting error state).
   */
  function preflight(setError) {
    const config = window.__VIBES_CONFIG__ || {};
    const proxyUrl = config.aiProxyUrl;
    if (!proxyUrl) {
      setError({ code: "NOT_CONFIGURED", message: "AI proxy not configured" });
      return null;
    }
    const token = window.__VIBES_OIDC_TOKEN__;
    if (!token) {
      setError({ code: "AUTH_REQUIRED", message: "Sign in to use AI features" });
      return null;
    }
    return { proxyUrl, token };
  }

  function useAI() {
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState(null);

    const callAI = React.useCallback(async (options) => {
      const env = preflight(setError);
      if (!env) return null;

      setLoading(true);
      setError(null);

      try {
        const body = buildRequestBody(options);
        const response = await fetch(env.proxyUrl + "/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + env.token,
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          setError(mapErrorResponse(response.status, errData));
          return null;
        }

        const data = await response.json();
        return options.raw ? data : extractContent(data);
      } catch (err) {
        setError({ code: "NETWORK_ERROR", message: err.message || "Network error" });
        return null;
      } finally {
        setLoading(false);
      }
    }, []);

    const streamAI = React.useCallback((options) => {
      const env = preflight(setError);
      if (!env) return null;

      setLoading(true);
      setError(null);

      const body = buildRequestBody(options, { stream: true });

      async function* generate() {
        try {
          const response = await fetch(env.proxyUrl + "/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": "Bearer " + env.token,
            },
            body: JSON.stringify(body),
          });

          if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            setError(mapErrorResponse(response.status, errData));
            return;
          }

          const reader = response.body.getReader();
          for await (const chunk of parseSSEStream(reader)) {
            yield chunk;
          }
        } catch (err) {
          setError({ code: "NETWORK_ERROR", message: err.message || "Network error" });
        } finally {
          setLoading(false);
        }
      }

      return generate();
    }, []);

    const clearError = React.useCallback(function () { setError(null); }, []);

    return { callAI, streamAI, loading, error, clearError };
  }

  window.useAI = useAI;
} else {
  console.warn("[vibes-ai] React not found on window, useAI unavailable");
}
```

- [ ] **Step 2: Run the new tests to verify they pass**

Run: `cd scripts && npx vitest run __tests__/unit/useai-logic.test.js`
Expected: ALL PASS

- [ ] **Step 3: Run the existing SSE parser tests to verify no regression**

Run: `cd scripts && npx vitest run __tests__/unit/vibes-ai.test.js`
Expected: ALL PASS (these test `sse-parser.js` which is unchanged)

- [ ] **Step 4: Run all unit tests**

Run: `cd scripts && npm run test:unit`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add bundles/vibes-ai.js
git commit -m "feat: rewrite useAI hook — clean OpenRouter passthrough with callAI and streamAI"
```

---

### Task 3: Update SKILL.md — useAI documentation

Replace the "Using the useAI Hook" example and "useAI API" section with the new patterns.

**Files:**
- Modify: `skills/vibes/SKILL.md` — sections `### Using the useAI Hook` through `### useAI API` (inclusive)

- [ ] **Step 1: Replace the "Using the useAI Hook" example**

Replace from `### Using the useAI Hook` up to (but not including) `### useAI API` with:

```markdown
### Using the useAI Hook

The `useAI` hook is automatically included in the template when AI features are detected:

\`\`\`jsx
import React from "react";
import { useFireproofClerk } from "use-fireproof";

export default function App() {
  const { database, useLiveQuery, syncStatus } = useFireproofClerk("ai-chat-db");
  const { callAI, loading, error } = useAI();

  const handleSend = async (message) => {
    // Save user message
    await database.put({ role: "user", content: message, type: "message" });

    // Call AI — returns text directly, or null on error
    const aiText = await callAI({
      model: "anthropic/claude-sonnet-4",
      messages: [{ role: "user", content: message }]
    });
    if (!aiText) return; // error state is set automatically

    // Save AI response
    await database.put({ role: "assistant", content: aiText, type: "message" });
  };

  // Handle errors
  if (error) {
    return (
      <div className="p-4 bg-amber-100 text-amber-800 rounded">
        {error.message}
      </div>
    );
  }

  // ... rest of UI
}
\`\`\`
```

- [ ] **Step 2: Replace the "useAI API" section**

Replace from `### useAI API` up to (but not including) `### Deployment with AI` with:

````markdown
### useAI API

```jsx
const { callAI, streamAI, loading, error, clearError } = useAI();
```

**`callAI` — non-streaming (one-shot requests):**

```jsx
const text = await callAI({
  model: "anthropic/claude-sonnet-4",
  messages: [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: "Hello!" }
  ],
});
if (!text) return; // error state set automatically
```

Returns `string` on success, `null` on error (never throws).

**`streamAI` — streaming (chat UIs):**

```jsx
const stream = streamAI({
  model: "anthropic/claude-sonnet-4",
  messages: [{ role: "user", content: userMessage }],
});
if (!stream) return; // error state set

let accumulated = "";
for await (const chunk of stream) {
  accumulated += chunk;
  setResponse(accumulated);
}
```

Returns an async iterator on success, `null` on error. App controls its own state.

**OpenRouter parameters** — pass any [OpenRouter API param](https://openrouter.ai/docs/api/reference/overview) directly:

```jsx
const text = await callAI({
  messages: [...],
  temperature: 0.7,
  max_tokens: 1000,
  response_format: { type: "json_object" },
  tools: [...],
});
```

**`raw: true`** — for tool calls or usage stats, get the full OpenRouter response object:

```jsx
const response = await callAI({ messages: [...], raw: true });
const toolCalls = response.choices[0].message.tool_calls;
```

**Error codes:**

```
error = {
  code: "NOT_CONFIGURED" | "AUTH_REQUIRED" | "UNAUTHORIZED" | "RATE_LIMITED" | "API_ERROR" | "NETWORK_ERROR",
  message: "Human-readable error message"
}
```
````

- [ ] **Step 3: Update the Common Mistakes section**

In the `## Common Mistakes to Avoid` section, change:
```
- **DON'T** use `call-ai` directly - use `useAI` hook instead (it handles proxying and limits)
```
to:
```
- **DON'T** use `fetch()` to call AI APIs directly — use `useAI` hook instead (it handles auth and proxying)
```

- [ ] **Step 4: Commit**

```bash
git add skills/vibes/SKILL.md
git commit -m "docs: update SKILL.md useAI section for new callAI/streamAI API"
```

---

### Task 4: Update ai-instructions.ts — generation prompts

Update both prompt fragments so the AI generator produces correct code with the new API.

**Files:**
- Modify: `scripts/server/ai-instructions.ts` — the `AI_INSTRUCTIONS_CHAT` and `AI_INSTRUCTIONS_GENERATE` exports

- [ ] **Step 1: Replace `AI_INSTRUCTIONS_CHAT`**

Replace from the `/** Compact AI instructions...` comment through the closing backtick-semicolon of `AI_INSTRUCTIONS_CHAT`:

```typescript
/** Compact AI instructions for chat context (appended to edit prompts). */
export const AI_INSTRUCTIONS_CHAT = `\n\nAI FEATURES — the useAI hook is available as a global (NO import needed):

\`\`\`jsx
const { callAI, streamAI, loading, error } = useAI();

// Non-streaming:
const text = await callAI({
  model: "anthropic/claude-sonnet-4",
  messages: [{ role: "user", content: userMessage }]
});
if (!text) return; // error state set automatically

// Streaming (for chat UIs):
const stream = streamAI({ model: "anthropic/claude-sonnet-4", messages: [...] });
if (!stream) return;
let result = "";
for await (const chunk of stream) { result += chunk; setResponse(result); }
\`\`\`

Rules: useAI() at component top level. callAI() is async, returns text or null. streamAI() returns async iterator or null. Neither throws.
Use Fireproof to persist conversations. Show loading state. Handle errors via null checks.
Do NOT use fetch() for AI calls — always useAI(). Do NOT simulate AI responses.`;
```

- [ ] **Step 2: Replace `AI_INSTRUCTIONS_GENERATE`**

Replace from the `/** Detailed AI instructions...` comment through the closing backtick-semicolon of `AI_INSTRUCTIONS_GENERATE`:

```typescript
/** Detailed AI instructions for generation context (new apps). */
export const AI_INSTRUCTIONS_GENERATE = `
=== AI FEATURES ===

This app needs AI capabilities. Use the global \`useAI\` hook (available as window.useAI — NO import needed).

\`\`\`jsx
const { callAI, streamAI, loading, error } = useAI();

// Non-streaming (simple request/response):
const text = await callAI({
  model: "anthropic/claude-sonnet-4",
  messages: [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: userMessage }
  ]
});
if (!text) return; // error state set automatically
// text is a string — use it directly

// Streaming (for chat UIs — shows tokens as they arrive):
const stream = streamAI({
  model: "anthropic/claude-sonnet-4",
  messages: [{ role: "user", content: userMessage }]
});
if (!stream) return; // error state set

let accumulated = "";
for await (const chunk of stream) {
  accumulated += chunk;
  setResponse(accumulated); // update UI as tokens arrive
}

// Error handling:
if (error) {
  // error.code: "RATE_LIMITED" | "API_ERROR" | "NETWORK_ERROR" | "AUTH_REQUIRED"
  // error.message: human-readable string
}
\`\`\`

RULES for AI features:
- useAI() is a React hook — call it at the top of your component (not inside callbacks)
- callAI() is async — returns text string on success, null on error. NEVER throws.
- streamAI() returns an async iterator on success, null on error. Use for await...of to consume.
- Prefer streamAI for chat interfaces, callAI for one-shot operations
- Use Fireproof to persist AI conversations: save user messages and AI responses to the database
- Show a loading indicator while \`loading\` is true
- Handle errors via null checks — callAI and streamAI return null when something goes wrong
- Do NOT use fetch() to call AI APIs directly — always use useAI()
- Do NOT simulate or hardcode AI responses — use the real API via useAI()
`;
```

- [ ] **Step 3: Run all tests to verify nothing broke**

Run: `cd scripts && npm run test:unit`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add scripts/server/ai-instructions.ts
git commit -m "docs: update AI generation prompts for new callAI/streamAI API"
```

---

### Task 5: Integration verification

Verify the full chain works end-to-end: generation prompts → generated app → useAI hook → proxy → OpenRouter.

**Files:**
- Read: `scripts/__tests__/fixtures/ai-proxy.jsx` (existing fixture, may need update)

- [ ] **Step 1: Run fixture tests**

Run: `cd scripts && npm run test:fixtures`
Expected: ALL PASS

- [ ] **Step 2: Run full test suite**

Run: `cd scripts && npm test`
Expected: ALL PASS

- [ ] **Step 3: Manual smoke test — generate an AI app**

Start the dev server and generate an AI-powered app to verify the generation prompt produces working code:

```bash
VIBES_ROOT="$(pwd)"
bun "$VIBES_ROOT/scripts/server.ts" --mode=editor &
```

Open `http://localhost:3333`, create a new app with prompt "a chat app that talks to AI". Verify:
- Generated code uses `callAI` or `streamAI` (not `ask`/`answer`)
- Generated code uses null-check pattern (not try/catch)
- Generated code does NOT reference `response.choices[0].message.content`
- Loading state works
- If signed in with valid OIDC, the AI call actually returns text

- [ ] **Step 4: Commit any fixture updates needed**

If fixture files were updated:

```bash
git add scripts/__tests__/fixtures/ai-proxy.jsx
git commit -m "test: update fixtures for new useAI API"
```
