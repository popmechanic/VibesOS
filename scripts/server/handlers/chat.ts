/**
 * Chat handler — iterative edits to app.jsx via Claude.
 */

import { runOneShot } from '../claude-bridge.ts';
import type { EventCallback } from '../claude-bridge.ts';
import { sanitizeAppJsx } from '../post-process.ts';
import type { ServerContext } from '../config.ts';
import { currentAppDir } from '../app-context.js';
import { buildChatPrompt } from '../prompt-builders.ts';

export async function handleChat(ctx: ServerContext, onEvent: EventCallback, message: string, effects: string[] = [], animationId: string | null = null, model: string | undefined, reference: any = null, skillId: string | null = null, appName: string | undefined = undefined) {
  console.log(`[Chat] reference received:`, reference ? { name: reference.name, type: reference.type, hasDataUrl: !!reference.dataUrl, dataUrlLen: reference.dataUrl?.length } : null);

  const prompt = buildChatPrompt(ctx, message, { effects, animationId, reference, skillId, appName });

  await runOneShot(prompt, { lockType: 'chat', model, cwd: currentAppDir(ctx, appName) || ctx.projectRoot, tools: 'Read,Edit,Write,Glob,Grep' }, onEvent, ctx.projectRoot);

  sanitizeAppJsx(currentAppDir(ctx, appName) || ctx.projectRoot);
}
