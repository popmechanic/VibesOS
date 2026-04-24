/**
 * Save current app theme as a reusable catalog theme.
 * Delegates the Claude subprocess run to `runOneShot` so we don't maintain
 * a third parallel stream-json loop alongside the persistent bridge and
 * the theme switcher.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { reloadThemes } from '../config.ts';
import type { ServerContext } from '../config.ts';
import { resolveAppJsxPath } from '../app-context.js';
import { runOneShot } from '../claude-bridge.ts';
import type { EventCallback } from '../claude-bridge.ts';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);
}

function uniqueThemeId(themeDir: string, base: string): string {
  if (!existsSync(join(themeDir, `${base}.txt`))) return base;
  let n = 2;
  while (existsSync(join(themeDir, `${base}-${n}.txt`))) n++;
  return `${base}-${n}`;
}

async function extractThemeFromAppJsx(
  projectRoot: string,
  appCode: string,
  themeId: string,
  themeName: string,
  model: string | undefined,
  onEvent: EventCallback,
): Promise<string> {
  const themeDir = join(projectRoot, 'skills/vibes/themes');
  const archivePath = join(themeDir, 'archive.txt');
  let formatRef = '';
  if (existsSync(archivePath)) {
    formatRef = readFileSync(archivePath, 'utf-8').slice(0, 2000);
  }

  const extractionPrompt = `You are saving the current app's visual design as a reusable theme for the Vibes design system.

Theme ID: ${themeId}
Theme Name: ${themeName}

Here is the current app.jsx:

\`\`\`jsx
${appCode.slice(0, 30000)}
\`\`\`

Here is an example of the theme file format (from archive.txt — use this EXACT structure):

---
${formatRef}
---

Tasks:
1. Analyze the app.jsx code above — study its :root CSS tokens, styles, layout patterns, color choices, surfaces, animations, and decorative elements.
2. Write the theme file to skills/vibes/themes/${themeId}.txt with ALL sections.
3. Append a catalog row to skills/vibes/themes/catalog.txt before "HOW TO CHOOSE".
   Format: | ${themeId} | ${themeName} | <mood> | <best-for summary> |

Use oklch() for ALL color values.`;

  console.log(`[SaveTheme] Running one-shot extraction for theme "${themeId}"...`);

  // Drop runOneShot's fine-grained progress/tool events — the caller drives
  // its own wall-clock `saving_theme` status timer because those stream
  // events don't map cleanly onto a single "extracting theme" UX stage.
  // Forward errors so the user still sees meaningful failure reasons.
  const filteredOnEvent: EventCallback = (event) => {
    if (event.type === 'error') onEvent(event);
  };

  const result = await runOneShot(
    extractionPrompt,
    {
      lockType: 'save_theme',
      skipChat: true,
      maxTurns: 10,
      tools: 'Edit,Read,Write',
      model,
      permissionMode: 'bypassPermissions',
      cwd: projectRoot,
    },
    filteredOnEvent,
    projectRoot,
  );

  if (result === null) {
    throw new Error('Theme save was cancelled');
  }

  console.log(`[SaveTheme] Theme "${themeId}" created successfully`);
  return result;
}

/**
 * Save the current app.jsx theme as a catalog theme.
 */
export async function handleSaveTheme(
  ctx: ServerContext,
  onEvent: EventCallback,
  themeName: string,
  model: string | undefined,
  appName: string | undefined = undefined,
): Promise<void> {
  const appJsxPath = resolveAppJsxPath(ctx, appName);
  if (!existsSync(appJsxPath)) {
    onEvent({ type: 'error', message: 'No app.jsx found — generate an app first.' });
    return;
  }

  const appCode = readFileSync(appJsxPath, 'utf-8');
  const themeId = uniqueThemeId(ctx.themeDir, slugify(themeName));

  try {
    onEvent({ type: 'status', status: 'saving_theme', stage: 'Analyzing app styles...', themeId, themeName, progress: 0, elapsed: 0 });
    console.log(`[SaveTheme] Saving theme "${themeId}" from current app.jsx...`);

    const startTime = Date.now();
    const expectedDuration = 45_000;
    const progressInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(90, Math.round((elapsed / expectedDuration) * 80));
      const stages = ['Analyzing app styles...', 'Extracting color tokens...', 'Writing design principles...', 'Creating theme file...'];
      const stageIdx = Math.min(stages.length - 1, Math.floor((elapsed / expectedDuration) * stages.length));
      const stage = elapsed > expectedDuration * 1.5
        ? 'Still processing... (this is taking longer than usual)'
        : stages[stageIdx];
      onEvent({ type: 'status', status: 'saving_theme', stage, themeId, themeName, progress, elapsed: Math.round(elapsed / 1000) });
    }, 2000);

    try {
      await extractThemeFromAppJsx(ctx.projectRoot, appCode, themeId, themeName, model, onEvent);
    } finally {
      clearInterval(progressInterval);
    }

    const themeFilePath = join(ctx.themeDir, `${themeId}.txt`);
    if (!existsSync(themeFilePath)) {
      throw new Error('Theme file was not created');
    }

    reloadThemes(ctx);

    onEvent({ type: 'theme_created', themeId, themeName });
    console.log(`[SaveTheme] Theme "${themeId}" (${themeName}) saved and loaded`);
  } catch (err: any) {
    console.error('[SaveTheme] Error:', err.message);
    onEvent({ type: 'error', message: `Theme save failed: ${err.message}` });
  }
}
