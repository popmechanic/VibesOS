import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildRequest, handleNotOk } from "../../../bundles/vibes-ai.js";

describe("buildRequest — factoryMode false (legacy)", () => {
  it("returns legacy URL and headers", () => {
    const env = {
      proxyUrl: "https://ai.vibesos.com",
      token: "tok-123",
      factoryMode: false,
    };
    const { url, headers } = buildRequest(env);
    expect(url).toBe("https://ai.vibesos.com/v1/chat/completions");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["Authorization"]).toBe("Bearer tok-123");
    expect(headers["X-Instance-Slug"]).toBeUndefined();
  });

  it("treats factoryMode undefined as legacy", () => {
    const env = { proxyUrl: "https://ai.vibesos.com", token: "tok" };
    const { url } = buildRequest(env);
    expect(url).toBe("https://ai.vibesos.com/v1/chat/completions");
  });
});

describe("buildRequest — factoryMode true", () => {
  let ownedWindow = false;

  beforeEach(() => {
    // vitest default env is node, so window is undefined — install a shim.
    if (typeof globalThis.window === "undefined") {
      globalThis.window = { location: { pathname: "/" } };
      ownedWindow = true;
    }
  });

  afterEach(() => {
    if (ownedWindow) {
      delete globalThis.window;
      ownedWindow = false;
    }
  });

  it("targets factory worker route", () => {
    window.location.pathname = "/tenant1";
    const env = {
      factoryMode: true,
      factoryBase: "https://factory-staging.vibesos.com",
      appName: "myapp",
      token: "tok-xyz",
    };
    const { url, headers } = buildRequest(env);
    expect(url).toBe("https://factory-staging.vibesos.com/ai/myapp/chat");
    expect(headers["Authorization"]).toBe("Bearer tok-xyz");
    expect(headers["X-Instance-Slug"]).toBe("tenant1");
  });

  it("extracts first path segment as slug", () => {
    window.location.pathname = "/tenant1/some/route";
    const env = { factoryMode: true, factoryBase: "https://x", appName: "a", token: "t" };
    const { headers } = buildRequest(env);
    expect(headers["X-Instance-Slug"]).toBe("tenant1");
  });

  it("omits X-Instance-Slug at apex /", () => {
    window.location.pathname = "/";
    const env = { factoryMode: true, factoryBase: "https://x", appName: "a", token: "t" };
    const { headers } = buildRequest(env);
    expect(headers["X-Instance-Slug"]).toBeUndefined();
  });

  it("omits X-Instance-Slug for empty pathname", () => {
    window.location.pathname = "";
    const env = { factoryMode: true, factoryBase: "https://x", appName: "a", token: "t" };
    const { headers } = buildRequest(env);
    expect(headers["X-Instance-Slug"]).toBeUndefined();
  });
});

describe("handleNotOk", () => {
  let ownedWindow = false;

  beforeEach(() => {
    if (typeof globalThis.window === "undefined") {
      globalThis.window = { location: { href: "" } };
      ownedWindow = true;
    } else {
      // ensure href is resettable
      globalThis.window.location = globalThis.window.location || { href: "" };
      globalThis.window.location.href = "";
    }
  });

  afterEach(() => {
    if (ownedWindow) {
      delete globalThis.window;
      ownedWindow = false;
    }
  });

  it("redirects to checkout on 403 in factoryMode", () => {
    const env = { factoryMode: true, factoryBase: "https://factory-staging.vibesos.com", appName: "myapp" };
    const response = { status: 403 };
    const handled = handleNotOk(response, env);
    expect(handled).toBe(true);
    expect(window.location.href).toBe("https://factory-staging.vibesos.com/checkout/myapp");
  });

  it("returns false on 403 when factoryMode disabled", () => {
    const env = { factoryMode: false };
    const response = { status: 403 };
    const handled = handleNotOk(response, env);
    expect(handled).toBe(false);
  });

  it("returns false on non-403 even in factoryMode", () => {
    const env = { factoryMode: true, factoryBase: "https://x", appName: "a" };
    expect(handleNotOk({ status: 401 }, env)).toBe(false);
    expect(handleNotOk({ status: 500 }, env)).toBe(false);
    expect(handleNotOk({ status: 502 }, env)).toBe(false);
  });
});
