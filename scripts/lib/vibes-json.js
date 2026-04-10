/**
 * vibes-json.js
 *
 * Read, write, and initialize vibes.json project configuration files.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, basename } from 'path';

const VIBES_JSON = 'vibes.json';

/**
 * Read vibes.json from a project directory.
 *
 * @param {string} projectDir - Absolute path to the project directory
 * @returns {object|null} Parsed object, or null if missing or invalid JSON
 */
export function readVibesJson(projectDir) {
  const filePath = join(projectDir, VIBES_JSON);
  if (!existsSync(filePath)) {
    return null;
  }
  try {
    const raw = readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Write or merge fields into vibes.json.
 * If vibes.json exists, shallow-merges new fields into it.
 * If it doesn't exist, creates it with the provided fields.
 *
 * @param {string} projectDir - Absolute path to the project directory
 * @param {object} fields - Fields to write or merge
 */
export function writeVibesJson(projectDir, fields) {
  const existing = readVibesJson(projectDir) ?? {};
  const merged = { ...existing, ...fields };
  // Deep merge known nested objects so partial updates don't clobber siblings
  if (fields.deploy && typeof fields.deploy === 'object' && existing.deploy && typeof existing.deploy === 'object') {
    merged.deploy = { ...existing.deploy, ...fields.deploy };
  }
  const filePath = join(projectDir, VIBES_JSON);
  writeFileSync(filePath, JSON.stringify(merged, null, 2) + '\n', 'utf-8');
}

/**
 * Slugify a folder name for use as a project name.
 * Lowercases, replaces non-alphanumeric chars with hyphens, trims hyphens, max 63 chars.
 *
 * @param {string} name - Raw folder name
 * @returns {string} Slugified name
 */
function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
}

/**
 * Initialize a project directory with vibes.json if it doesn't already exist.
 * Creates a .vibes/ subdirectory and derives the project name from the folder name.
 * Does NOT overwrite an existing vibes.json.
 *
 * @param {string} projectDir - Absolute path to the project directory
 */
export function initVibesJson(projectDir) {
  // Create .vibes subdirectory
  const vibesDir = join(projectDir, '.vibes');
  if (!existsSync(vibesDir)) {
    mkdirSync(vibesDir, { recursive: true });
  }

  // Do not overwrite existing vibes.json
  const filePath = join(projectDir, VIBES_JSON);
  if (existsSync(filePath)) {
    return;
  }

  const name = slugify(basename(projectDir));
  writeVibesJson(projectDir, { name });
}
