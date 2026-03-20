/**
 * Shared prompt fragments for Claude prompts.
 *
 * Used by both chat.ts (iterative edits) and generate.ts (new app generation).
 */

/** Theme section marker instructions — shared between reference and normal generation paths. */
export const THEME_SECTION_MARKERS = `
=== THEME SECTION MARKERS ===

Organize ALL visual CSS into marked sections. This enables fast theme switching.

In your <style> tag, wrap CSS in comment markers:

\`\`\`css
/* @theme:tokens */
:root { --comp-bg: ...; --comp-text: ...; /* all color variables */ }
/* @theme:tokens:end */

/* @theme:typography */
@import url('...');  /* Google Fonts or other font imports */
/* @theme:typography:end */

/* @theme:surfaces */
.glass-card { backdrop-filter: ...; }
.nav-button { display: flex; gap: 0.5rem; background: var(--comp-accent); border: 2px solid var(--comp-border); }
/* @theme:surfaces:end */

/* @theme:motion */
@keyframes drift { ... } /* all @keyframes and animation definitions */
/* @theme:motion:end */

/* Pure-layout ONLY — no visual properties */
.grid-wrapper { display: grid; gap: 1rem; max-width: 800px; margin: 0 auto; }
\`\`\`

In your JSX, wrap decorative elements:

\`\`\`jsx
{/* @theme:decoration */}
<svg className="atmospheric-bg">...</svg>
<div className="scan-line" />
{/* @theme:decoration:end */}
\`\`\`

Rules:
- EVERY :root block must be inside @theme:tokens markers
- EVERY @import font URL must be inside @theme:typography markers
- EVERY @keyframes must be inside @theme:motion markers
- Decorative SVGs and atmospheric elements go in @theme:decoration
- ANY class with visual properties (color, background, border, box-shadow, font-family, font-size, font-weight, text-shadow, fill, stroke, opacity, gradients) MUST go inside @theme:surfaces — even if it also has layout properties
- ONLY pure-layout classes go outside markers: display, grid-template, gap, padding, margin, position, z-index, width, max-width, height, flex-*, align-items, justify-content, overflow, box-sizing`;

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
IMPORTANT: Put useAI() in a SEPARATE child component from Fireproof hooks (useDocument, useLiveQuery). AI loading/error state changes cause re-renders that can conflict with Fireproof's write queue.
Always show \`error.message\` to the user when callAI/streamAI returns null — never fail silently.
Use Fireproof to persist conversations. Do NOT use fetch() for AI calls. Do NOT simulate AI responses.`;

/** Detailed AI instructions for generation context (new apps). */
export const AI_INSTRUCTIONS_GENERATE = `
=== AI FEATURES ===

This app needs AI capabilities. Use the global \`useAI\` hook (available as window.useAI — NO import needed).

CRITICAL: Put useAI() in a SEPARATE child component from Fireproof hooks (useDocument, useLiveQuery).
AI loading/error state changes cause re-renders that conflict with Fireproof's write queue if they share a component.

\`\`\`jsx
// AI features go in a child component — NOT in the same component as useFireproofClerk/useDocument/useLiveQuery
function AIButton({ onResult }) {
  const { callAI, loading, error } = useAI();

  const handleClick = async () => {
    const text = await callAI({
      model: "anthropic/claude-sonnet-4",
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Generate something" }
      ]
    });
    if (text) onResult(text);
  };

  return (
    <div>
      <button onClick={handleClick} disabled={loading}>
        {loading ? "Thinking..." : "Ask AI"}
      </button>
      {error && <p style={{ color: "red" }}>{error.message}</p>}
    </div>
  );
}

// Main app uses Fireproof — AI state changes won't re-render this component
function App() {
  const { database } = useFireproofClerk("my-db");

  const handleAIResult = async (text) => {
    await database.put({ type: "ai-response", content: text, timestamp: Date.now() });
  };

  return <AIButton onResult={handleAIResult} />;
}

// Streaming (for chat UIs — shows tokens as they arrive):
function ChatStream({ messages, onDone }) {
  const { streamAI, loading, error } = useAI();
  const [response, setResponse] = React.useState("");

  const handleSend = async () => {
    const stream = streamAI({
      model: "anthropic/claude-sonnet-4",
      messages
    });
    if (!stream) return; // error state set, shown below

    let accumulated = "";
    for await (const chunk of stream) {
      accumulated += chunk;
      setResponse(accumulated);
    }
    if (accumulated) onDone(accumulated);
  };

  return (
    <div>
      <button onClick={handleSend} disabled={loading}>Send</button>
      {loading && <p>{response || "Thinking..."}</p>}
      {error && <p style={{ color: "red" }}>{error.message}</p>}
    </div>
  );
}
\`\`\`

RULES for AI features:
- useAI() is a React hook — call it at the top of your component (not inside callbacks)
- NEVER put useAI() in the same component as useFireproofClerk, useDocument, or useLiveQuery — use a child component and pass results up via callbacks
- callAI() is async — returns text string on success, null on error. NEVER throws.
- streamAI() returns an async iterator on success, null on error. Use for await...of to consume.
- Prefer streamAI for chat interfaces, callAI for one-shot operations
- Always show \`error.message\` to the user when callAI/streamAI returns null — never fail silently
- Show a loading indicator while \`loading\` is true
- Use Fireproof to persist AI conversations: save user messages and AI responses to the database
- Do NOT use fetch() to call AI APIs directly — always use useAI()
- Do NOT simulate or hardcode AI responses — use the real API via useAI()
`;
