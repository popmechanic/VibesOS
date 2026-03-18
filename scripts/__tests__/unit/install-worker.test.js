import { describe, it, expect, vi, beforeEach } from "vitest";
import worker from "../../install-worker/worker.js";

function makeEnv(overrides = {}) {
  return {
    UPLOAD_KEY: "test-key",
    DMG_BUCKET: {
      put: vi.fn(async () => {}),
      get: vi.fn(async () => null),
    },
    ...overrides,
  };
}

describe("install worker", () => {
  describe("GET /updates/*", () => {
    it("serves update.json with application/json content-type", async () => {
      const body = JSON.stringify({ version: "0.2.0", hash: "abc123" });
      const env = makeEnv({
        DMG_BUCKET: {
          put: vi.fn(),
          get: vi.fn(async (key) => {
            if (key === "updates/stable-macos-arm64-update.json") {
              return { body, headers: new Headers() };
            }
            return null;
          }),
        },
      });

      const req = new Request("https://install.vibesos.com/updates/stable-macos-arm64-update.json");
      const res = await worker.fetch(req, env);
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("application/json");
    });

    it("serves .tar.zst with application/octet-stream content-type", async () => {
      const env = makeEnv({
        DMG_BUCKET: {
          put: vi.fn(),
          get: vi.fn(async (key) => {
            if (key === "updates/stable-macos-arm64-VibesOS.app.tar.zst") {
              return { body: new Uint8Array([1, 2, 3]), headers: new Headers() };
            }
            return null;
          }),
        },
      });

      const req = new Request("https://install.vibesos.com/updates/stable-macos-arm64-VibesOS.app.tar.zst");
      const res = await worker.fetch(req, env);
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("application/octet-stream");
    });

    it("serves .patch with application/octet-stream content-type", async () => {
      const env = makeEnv({
        DMG_BUCKET: {
          put: vi.fn(),
          get: vi.fn(async (key) => {
            if (key === "updates/abc-to-def.patch") {
              return { body: new Uint8Array([1, 2, 3]), headers: new Headers() };
            }
            return null;
          }),
        },
      });

      const req = new Request("https://install.vibesos.com/updates/abc-to-def.patch");
      const res = await worker.fetch(req, env);
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("application/octet-stream");
    });

    it("returns 404 for missing update files", async () => {
      const env = makeEnv();
      const req = new Request("https://install.vibesos.com/updates/nonexistent.json");
      const res = await worker.fetch(req, env);
      expect(res.status).toBe(404);
    });
  });

  describe("PUT /upload content-type detection", () => {
    it("sets application/json for .json uploads", async () => {
      const env = makeEnv();
      const req = new Request("https://install.vibesos.com/upload?filename=updates/stable-macos-arm64-update.json", {
        method: "PUT",
        headers: { "X-Upload-Key": "test-key" },
        body: "{}",
      });
      await worker.fetch(req, env);
      expect(env.DMG_BUCKET.put).toHaveBeenCalledWith(
        "updates/stable-macos-arm64-update.json",
        expect.anything(),
        expect.objectContaining({
          httpMetadata: { contentType: "application/json" },
        })
      );
    });

    it("sets application/octet-stream for .tar.zst uploads", async () => {
      const env = makeEnv();
      const req = new Request("https://install.vibesos.com/upload?filename=updates/app.tar.zst", {
        method: "PUT",
        headers: { "X-Upload-Key": "test-key" },
        body: new Uint8Array([1]),
      });
      await worker.fetch(req, env);
      expect(env.DMG_BUCKET.put).toHaveBeenCalledWith(
        "updates/app.tar.zst",
        expect.anything(),
        expect.objectContaining({
          httpMetadata: { contentType: "application/octet-stream" },
        })
      );
    });

    it("defaults to DMG content-type for .dmg uploads", async () => {
      const env = makeEnv();
      const req = new Request("https://install.vibesos.com/upload?filename=VibesOS-0.1.86.dmg", {
        method: "PUT",
        headers: { "X-Upload-Key": "test-key" },
        body: new Uint8Array([1]),
      });
      await worker.fetch(req, env);
      expect(env.DMG_BUCKET.put).toHaveBeenCalledWith(
        "VibesOS-0.1.86.dmg",
        expect.anything(),
        expect.objectContaining({
          httpMetadata: { contentType: "application/x-apple-diskimage" },
        })
      );
    });
  });
});
