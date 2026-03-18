// vibes-desktop/src/bun/plugin-installer.ts
//
// Installs plugin files into ~/.vibes/plugins/vibes/{version}/.
// Does NOT touch ~/.claude/plugins/ — avoids corrupting the user's
// existing Claude plugin registry.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import { createHash } from "crypto";

export interface PluginInstallResult {
	installed: boolean;
	pluginRoot: string;
	version: string;
	skipped?: boolean; // true if content hash matches (code is identical)
}

/**
 * Compute a content fingerprint of all runtime code files.
 * Walks key directories and hashes every .ts, .js, .html, .css, and .json file,
 * skipping node_modules, build artifacts, and env files.
 */
function computePluginFingerprint(pluginRoot: string): string {
	const hash = createHash("sha256");

	// Hash plugin.json (version + metadata)
	const pluginJson = join(pluginRoot, ".claude-plugin", "plugin.json");
	if (existsSync(pluginJson)) hash.update(readFileSync(pluginJson));

	// Walk key directories that contain runtime code
	const keyDirs = ["scripts", "skills", "bundles", "source-templates", "components"];
	const codeExts = new Set([".ts", ".js", ".html", ".css", ".json", ".txt", ".md"]);
	const skipDirs = new Set(["node_modules", ".wrangler", "build", "artifacts"]);

	for (const dir of keyDirs) {
		const dirPath = join(pluginRoot, dir);
		if (!existsSync(dirPath)) continue;
		walkDir(dirPath, pluginRoot, hash, codeExts, skipDirs);
	}

	return hash.digest("hex").slice(0, 16);
}

function walkDir(
	dir: string,
	root: string,
	hash: ReturnType<typeof createHash>,
	exts: Set<string>,
	skipDirs: Set<string>,
): void {
	let entries;
	try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
	for (const entry of entries) {
		if (entry.name.startsWith(".")) continue;
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (!skipDirs.has(entry.name)) walkDir(full, root, hash, exts, skipDirs);
		} else {
			const ext = entry.name.slice(entry.name.lastIndexOf("."));
			if (exts.has(ext)) {
				const rel = full.slice(root.length + 1);
				hash.update(rel);
				hash.update(readFileSync(full));
			}
		}
	}
}

/**
 * Copy plugin files from the .app bundle into ~/.vibes/plugins/vibes/{version}/.
 *
 * This is a self-contained copy — no shared state is modified. The desktop app's
 * plugin-discovery.ts reads from this directory directly.
 *
 * Skips installation only if the installed copy has an identical content fingerprint
 * (not just version match — same version can have different code between builds).
 */
export async function installPlugin(bundledPluginPath: string): Promise<PluginInstallResult> {
	// Read version from bundled plugin.json
	const pluginJsonPath = join(bundledPluginPath, ".claude-plugin", "plugin.json");
	if (!existsSync(pluginJsonPath)) {
		throw new Error(`Bundled plugin.json not found at ${pluginJsonPath}`);
	}
	const pluginJson = JSON.parse(readFileSync(pluginJsonPath, "utf-8"));
	const version: string = pluginJson.version;

	const h = homedir();
	const vibesPluginsDir = join(h, ".vibes", "plugins", "vibes");
	const cacheDir = join(vibesPluginsDir, version);

	// Check if already installed with identical content
	if (existsSync(join(cacheDir, ".claude-plugin", "plugin.json"))) {
		try {
			const bundledHash = computePluginFingerprint(bundledPluginPath);
			const installedHash = computePluginFingerprint(cacheDir);
			if (bundledHash === installedHash) {
				return { installed: true, pluginRoot: cacheDir, version, skipped: true };
			}
			console.log(`[plugin-installer] Content changed (${installedHash} → ${bundledHash}), reinstalling v${version}`);
		} catch {}
	}

	// Clean up old version directories before installing new one
	if (existsSync(vibesPluginsDir)) {
		try {
			const oldVersions = readdirSync(vibesPluginsDir).filter(v => !v.startsWith(".") && v !== version);
			for (const oldVersion of oldVersions) {
				rmSync(join(vibesPluginsDir, oldVersion), { recursive: true, force: true });
			}
		} catch {}
	}

	// Copy plugin files via rsync (preserves structure, fast delta)
	mkdirSync(dirname(cacheDir), { recursive: true });
	const rsync = Bun.spawnSync([
		"rsync", "-a", "--delete",
		"--exclude=.env", "--exclude=.env.*",
		"--exclude=.connect", "--exclude=.wrangler",
		bundledPluginPath + "/",
		cacheDir + "/",
	], { timeout: 30_000 });

	if (rsync.exitCode !== 0) {
		throw new Error(`rsync failed: ${rsync.stderr.toString()}`);
	}

	return { installed: true, pluginRoot: cacheDir, version };
}
