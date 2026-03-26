export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // PUT /upload — upload a file (requires auth header)
    if (request.method === "PUT" && url.pathname === "/upload") {
      const auth = request.headers.get("X-Upload-Key");
      if (!auth || auth !== env.UPLOAD_KEY) {
        return new Response("Unauthorized", { status: 401 });
      }
      const filename = url.searchParams.get("filename") || "VibesOS.dmg";
      const contentType = detectContentType(filename);
      await env.DMG_BUCKET.put(filename, request.body, {
        httpMetadata: { contentType },
      });
      // Store "latest" pointer only for DMG files (not update artifacts)
      if (filename.endsWith(".dmg")) {
        await env.DMG_BUCKET.put("latest.txt", filename);
      }
      return new Response(`Uploaded ${filename}`, { status: 200 });
    }

    // GET /updates/* — serve update artifacts from R2
    if (url.pathname.startsWith("/updates/")) {
      const key = url.pathname.slice(1); // strip leading slash → "updates/..."
      const obj = await env.DMG_BUCKET.get(key);
      if (!obj) {
        return new Response("Not found", { status: 404 });
      }
      const contentType = detectContentType(key);
      return new Response(obj.body, {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=60",
        },
      });
    }

    // GET / — redirect to DMG download (browser) or serve install script (curl)
    const ua = (request.headers.get("User-Agent") || "").toLowerCase();
    const isCurl = ua.includes("curl") || ua.includes("wget");

    if (isCurl) {
      return Response.redirect(
        "https://raw.githubusercontent.com/popmechanic/VibesOS/main/scripts/install.sh",
        302
      );
    }

    const latestObj = await env.DMG_BUCKET.get("latest.txt");
    let filename = latestObj ? await latestObj.text() : "VibesOS.dmg";
    // Safety: if latest.txt was corrupted (e.g. points to a non-DMG file), fall back
    if (!filename.endsWith(".dmg")) {
      filename = "VibesOS.dmg";
    }
    const dmg = await env.DMG_BUCKET.get(filename);

    if (!dmg) {
      return new Response("DMG not found. Upload one first.", { status: 404 });
    }

    return new Response(dmg.body, {
      headers: {
        "Content-Type": "application/x-apple-diskimage",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "public, max-age=300",
      },
    });
  },
};

function detectContentType(filename) {
  if (filename.endsWith(".json")) return "application/json";
  if (filename.endsWith(".dmg")) return "application/x-apple-diskimage";
  // .tar.zst, .patch, and other binary artifacts
  return "application/octet-stream";
}
