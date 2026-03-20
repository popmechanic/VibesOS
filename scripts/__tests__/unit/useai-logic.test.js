import { describe, it, expect } from 'vitest';
import { buildRequestBody, extractContent, mapErrorResponse } from '../../../bundles/vibes-ai.js';

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
