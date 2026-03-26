import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { evalStaticCheck } from './eval-static-check.js';
import { ssrSmokeTest } from './eval-ssr-check.ts';
import { analyzeDataModel, assertDataModel, type EvalSpec } from './eval-harness.ts';
import { scoreGeneration, type VariantScore } from './eval-scoring.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PAREConfig {
  variants: number;
  prompts: string[];
  runs: number;
  maxGenerations: number;
  plateauThreshold: number;
  consistencyPenalty: number;
  ablationFrequency: number;
  redTeamCeiling: number;
  sonnetCheckFrequency: number;
}

export interface GenerationSummary {
  generation: number;
  timestamp: string;
  variantScores: Record<number, { mean: number; stdDev: number; fitness: number }>;
  bestVariant: number;
  bestFitness: number;
  controlFitness: number;
  improved: boolean;
  plateauCount: number;
}

export interface MutationDirective {
  variantId: number;
  strategy: 'fix-targeted' | 'section-rewrite' | 'example-driven' | 'deletion' | 'structural' | 'adversarial' | 'cross-pollination';
  context: string;
}

export interface TransferCheckResult {
  generation: number;
  opusScore: number;
  sonnetScore: number;
  transferRatio: number;
  degraded: boolean;
}

export interface AppResult {
  variant: number;
  prompt: number;
  run: number;
  tier1: { passed: boolean; critical: string[]; warnings: string[] };
  tier15: { passed: boolean; error?: string };
  tier2: { passed: boolean; score: number; failures: string[] };
  finalScore: number;
}

// ---------------------------------------------------------------------------
// Config loading
// ---------------------------------------------------------------------------

function loadConfig(): PAREConfig {
  const args = process.argv.slice(2);

  function getArg(name: string): string | undefined {
    const prefix = `--${name}=`;
    const match = args.find((a) => a.startsWith(prefix));
    return match ? match.slice(prefix.length) : undefined;
  }

  function getInt(name: string, defaultVal: number): number {
    const raw = getArg(name);
    return raw !== undefined ? parseInt(raw, 10) : defaultVal;
  }

  function getFloat(name: string, defaultVal: number): number {
    const raw = getArg(name);
    return raw !== undefined ? parseFloat(raw) : defaultVal;
  }

  const prompts = loadPromptBattery();

  return {
    variants: getInt('variants', 10),
    prompts,
    runs: getInt('runs', 3),
    maxGenerations: getInt('generations', 30),
    plateauThreshold: getInt('plateau', 3),
    consistencyPenalty: getFloat('consistency-penalty', 0.5),
    ablationFrequency: getInt('ablation', 3),
    redTeamCeiling: getInt('red-team-ceiling', 300),
    sonnetCheckFrequency: getInt('sonnet-check', 5),
  };
}

// ---------------------------------------------------------------------------
// Prompt battery loading
// ---------------------------------------------------------------------------

function loadPromptBattery(): string[] {
  const specsDir = join(import.meta.dir, '..', 'eval', 'specs');
  if (!existsSync(specsDir)) {
    return [];
  }

  const files = readdirSync(specsDir)
    .filter((f) => f.endsWith('.md'))
    .sort();

  const prompts: string[] = [];

  for (const file of files) {
    const content = readFileSync(join(specsDir, file), 'utf8');
    const lines = content.split('\n');

    // Find the ## Seed Prompt section and grab the next non-empty line
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() === '## Seed Prompt') {
        // Find the next non-empty line after the header
        for (let j = i + 1; j < lines.length; j++) {
          const line = lines[j].trim();
          if (line.length > 0 && !line.startsWith('#')) {
            prompts.push(line);
            break;
          }
        }
        break;
      }
    }
  }

  return prompts;
}

// ---------------------------------------------------------------------------
// Eval spec loading
// ---------------------------------------------------------------------------

export function loadEvalSpec(specPath: string): EvalSpec {
  const content = readFileSync(specPath, 'utf8');
  const lines = content.split('\n');

  const tables: string[] = [];
  const perUserFields: Record<string, string[]> = {};
  const sharedTables: string[] = [];

  // Known per-user field names to detect heuristically
  const USER_IDENTITY_FIELDS = [
    'bidder', 'createdBy', 'email', 'sender', 'assignee', 'owner',
    'userId', 'user', 'author', 'reporter', 'submitter', 'player',
  ];

  // Parse ### Tables section
  let inTablesSection = false;
  let inKeyPatternSection = false;
  let keyPatternLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === '### Tables') {
      inTablesSection = true;
      inKeyPatternSection = false;
      continue;
    }

    if (trimmed === '### Key Pattern') {
      inTablesSection = false;
      inKeyPatternSection = true;
      continue;
    }

    // Any other ### or ## section ends the current section
    if (trimmed.startsWith('##')) {
      inTablesSection = false;
      inKeyPatternSection = false;
      continue;
    }

    if (inTablesSection) {
      // Lines like: - `tablename` — description
      const tableMatch = trimmed.match(/^-\s+`([^`]+)`/);
      if (tableMatch) {
        const tableName = tableMatch[1];
        tables.push(tableName);

        // Detect per-user fields from the inline description
        // e.g. `{ name, createdBy, bidder }` after the table name
        const descMatch = line.match(/\{([^}]+)\}/);
        if (descMatch) {
          const fields = descMatch[1].split(',').map((f) => f.trim());
          const userFields = fields.filter((f) => USER_IDENTITY_FIELDS.includes(f));
          if (userFields.length > 0) {
            perUserFields[tableName] = userFields;
          }
        }
      }
    }

    if (inKeyPatternSection && trimmed.length > 0) {
      keyPatternLines.push(trimmed);
    }
  }

  // Detect sharedTables from key pattern text
  // Tables mentioned alongside 'all' or 'shared' are shared
  const keyPatternText = keyPatternLines.join(' ').toLowerCase();
  for (const table of tables) {
    const tableNameLower = table.toLowerCase();
    // Look for patterns like "shared X table" or "all X visible to all"
    const sharedPatterns = [
      new RegExp(`shared\\s+${tableNameLower}`),
      new RegExp(`${tableNameLower}.*all\\s+users`),
      new RegExp(`all.*${tableNameLower}.*visible`),
      new RegExp(`shared.*${tableNameLower}.*table`),
    ];
    if (sharedPatterns.some((p) => p.test(keyPatternText))) {
      sharedTables.push(table);
    }
  }

  return { tables, perUserFields, sharedTables };
}

// ---------------------------------------------------------------------------
// Eval pipeline
// ---------------------------------------------------------------------------

export function evaluateApp(jsxPath: string, specPath: string): AppResult {
  const result: AppResult = {
    variant: 0,
    prompt: 0,
    run: 0,
    tier1: { passed: false, critical: [], warnings: [] },
    tier15: { passed: false },
    tier2: { passed: false, score: 0, failures: [] },
    finalScore: 0,
  };

  // Tier 1: Static check
  const staticResult = evalStaticCheck(jsxPath);
  result.tier1 = {
    passed: staticResult.passed,
    critical: staticResult.critical,
    warnings: staticResult.warnings,
  };

  if (!staticResult.passed) {
    result.finalScore = 0;
    return result;
  }

  // Tier 1.5: SSR smoke test
  const ssrResult = ssrSmokeTest(jsxPath);
  result.tier15 = {
    passed: ssrResult.passed,
    error: ssrResult.error,
  };

  if (!ssrResult.passed) {
    result.finalScore = 1;
    return result;
  }

  // Tier 2: Data model analysis + assertions
  const spec = loadEvalSpec(specPath);
  const analysis = analyzeDataModel(jsxPath);
  const assertion = assertDataModel(analysis, spec);

  result.tier2 = {
    passed: assertion.passed,
    score: assertion.score,
    failures: assertion.failures,
  };

  result.finalScore = assertion.score;
  return result;
}

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

export function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

export function getResultsDir(generation: number): string {
  return join(import.meta.dir, '..', 'eval', 'results', `gen-${generation}`);
}

// ---------------------------------------------------------------------------
// Task 3.2: Generation Summary + Artifact Cleanup
// ---------------------------------------------------------------------------

/**
 * Write summary.json for a single generation and append to summaries.json
 */
export function writeGenerationSummary(
  genDir: string,
  generation: number,
  variantScores: VariantScore[],
  bestVariant: number,
  bestFitness: number,
  controlFitness: number,
  plateauCount: number,
  bestSkillMdHash: string
): void {
  const variantScoresRecord: Record<number, { mean: number; stdDev: number; fitness: number }> = {};
  for (const vs of variantScores) {
    variantScoresRecord[vs.variant] = {
      mean: vs.mean,
      stdDev: vs.stdDev,
      fitness: vs.fitness,
    };
  }

  const summary: GenerationSummary = {
    generation,
    timestamp: new Date().toISOString(),
    variantScores: variantScoresRecord,
    bestVariant,
    bestFitness,
    controlFitness,
    improved: bestFitness > controlFitness,
    plateauCount,
  };

  // Write individual summary
  ensureDir(genDir);
  writeFileSync(join(genDir, 'summary.json'), JSON.stringify(summary, null, 2));

  // Append to summaries.json in the results directory
  const resultsDir = dirname(genDir);
  const summariesPath = join(resultsDir, 'summaries.json');
  let summaries: GenerationSummary[] = [];
  if (existsSync(summariesPath)) {
    try {
      summaries = JSON.parse(readFileSync(summariesPath, 'utf8'));
    } catch {
      summaries = [];
    }
  }
  // Replace existing entry for this generation if present
  summaries = summaries.filter((s) => s.generation !== generation);
  summaries.push(summary);
  summaries.sort((a, b) => a.generation - b.generation);
  writeFileSync(summariesPath, JSON.stringify(summaries, null, 2));
}

/**
 * Keep top N variants' dirs, delete the rest
 */
export function cleanupGeneration(genDir: string, keepVariants: number[]): void {
  const variantsDir = join(genDir, 'variants');
  if (!existsSync(variantsDir)) return;

  const dirs = readdirSync(variantsDir).filter((d) => d.match(/^variant-\d+$/));
  for (const dir of dirs) {
    const variantId = parseInt(dir.replace('variant-', ''), 10);
    if (!keepVariants.includes(variantId)) {
      rmSync(join(variantsDir, dir), { recursive: true, force: true });
    }
  }
}

/**
 * Check stopping criteria: plateau, max generations, oscillation, battery expansion
 */
export function shouldStop(
  generation: number,
  plateauCount: number,
  config: PAREConfig,
  summaries: GenerationSummary[]
): { stop: boolean; reason: string; expandBattery?: boolean } {
  // Max generations
  if (generation >= config.maxGenerations) {
    return { stop: true, reason: `Reached max generations (${config.maxGenerations})` };
  }

  // Plateau threshold
  if (plateauCount >= config.plateauThreshold) {
    return { stop: true, reason: `Plateau detected (${plateauCount} generations without improvement)` };
  }

  // Oscillation detection: if the best fitness has alternated up/down for 6+ consecutive gens
  if (summaries.length >= 6) {
    const recent = summaries.slice(-6);
    let oscillations = 0;
    for (let i = 1; i < recent.length; i++) {
      const prev = recent[i - 1].bestFitness;
      const curr = recent[i].bestFitness;
      const prevPrev = i >= 2 ? recent[i - 2].bestFitness : prev;
      if ((curr > prev && prev < prevPrev) || (curr < prev && prev > prevPrev)) {
        oscillations++;
      }
    }
    if (oscillations >= 4) {
      return { stop: true, reason: 'Oscillation detected (fitness alternating for 6+ generations)' };
    }
  }

  // Battery expansion: if best fitness >= 3.8, suggest expanding the prompt battery
  if (summaries.length > 0) {
    const latest = summaries[summaries.length - 1];
    if (latest.bestFitness >= 3.8) {
      return { stop: false, reason: 'High fitness reached — consider expanding prompt battery', expandBattery: true };
    }
  }

  return { stop: false, reason: '' };
}

// ---------------------------------------------------------------------------
// Task 4.1: Mutation Directive Generator
// ---------------------------------------------------------------------------

/**
 * Generate mutation directives with dynamic mix based on generation phase.
 * Early = fix-targeted, mid = structural + adversarial, late = deletion + cross-pollination.
 * Always puts adversarial in the last slot.
 */
export function generateDirectives(
  generation: number,
  numVariants: number,
  napkinPath: string,
  crossPollinationPath?: string
): MutationDirective[] {
  // Load napkin failures for context
  let napkinContent = '';
  if (existsSync(napkinPath)) {
    napkinContent = readFileSync(napkinPath, 'utf8');
  }

  let crossPollinationContent = '';
  if (crossPollinationPath && existsSync(crossPollinationPath)) {
    crossPollinationContent = readFileSync(crossPollinationPath, 'utf8');
  }

  // Parse failure patterns from napkin
  const failurePatterns = extractFailurePatterns(napkinContent);

  const directives: MutationDirective[] = [];

  // Determine strategy distribution based on generation phase
  // variant-0 is the control, so we generate directives for variants 1 through numVariants-1
  // Reserve last slot (numVariants-1) for adversarial
  const totalDirectives = numVariants - 1;
  const numRegular = totalDirectives - 1;

  for (let i = 0; i < numRegular; i++) {
    const strategy = pickStrategy(generation, i, numRegular, !!crossPollinationContent);
    const context = buildContext(strategy, failurePatterns, crossPollinationContent, i);
    directives.push({
      variantId: i + 1, // variant-0 is the control
      strategy,
      context,
    });
  }

  // Last slot is always adversarial
  directives.push({
    variantId: numVariants - 1,
    strategy: 'adversarial',
    context: 'Adversarial mutation: introduce edge cases, unusual data patterns, and stress tests that the SKILL.md should handle but might not.',
  });

  return directives;
}

function extractFailurePatterns(napkinContent: string): string[] {
  const patterns: string[] = [];
  const lines = napkinContent.split('\n');
  for (const line of lines) {
    const match = line.match(/^-\s+\*\*Pattern:\*\*\s+(.+)/);
    if (match) {
      patterns.push(match[1]);
    }
    // Also grab "### Failure:" headings
    const headingMatch = line.match(/^###\s+(?:Failure|Refined):\s+(.+)/);
    if (headingMatch) {
      patterns.push(headingMatch[1]);
    }
  }
  return patterns;
}

function pickStrategy(
  generation: number,
  index: number,
  total: number,
  hasCrossPollination: boolean
): MutationDirective['strategy'] {
  // Phase thresholds
  const isEarly = generation <= 3;
  const isLate = generation >= 15;
  // Mid phase is everything else

  if (isEarly) {
    // Early: mostly fix-targeted and example-driven
    const earlyStrategies: MutationDirective['strategy'][] = [
      'fix-targeted', 'fix-targeted', 'fix-targeted', 'fix-targeted',
      'example-driven', 'example-driven',
      'section-rewrite',
      'structural',
    ];
    return earlyStrategies[index % earlyStrategies.length];
  }

  if (isLate) {
    // Late: deletion, cross-pollination, structural
    const lateStrategies: MutationDirective['strategy'][] = [
      'deletion', 'deletion', 'deletion',
      'structural',
      'section-rewrite',
      ...(hasCrossPollination ? ['cross-pollination' as const, 'cross-pollination' as const] : ['structural' as const, 'example-driven' as const]),
      'fix-targeted',
    ];
    return lateStrategies[index % lateStrategies.length];
  }

  // Mid: balanced mix with structural and adversarial emphasis
  const midStrategies: MutationDirective['strategy'][] = [
    'fix-targeted', 'fix-targeted',
    'structural', 'structural',
    'section-rewrite',
    'example-driven',
    'deletion',
    ...(hasCrossPollination ? ['cross-pollination' as const] : ['example-driven' as const]),
  ];
  return midStrategies[index % midStrategies.length];
}

function buildContext(
  strategy: MutationDirective['strategy'],
  failurePatterns: string[],
  crossPollinationContent: string,
  index: number
): string {
  switch (strategy) {
    case 'fix-targeted':
      if (failurePatterns.length > 0) {
        const pattern = failurePatterns[index % failurePatterns.length];
        return `Fix the failure pattern: "${pattern}". Add or revise the SKILL.md section that should prevent this failure. Include a concrete bad-vs-good code example.`;
      }
      return 'Review the napkin for recurring failure patterns and add targeted fixes to SKILL.md sections.';

    case 'section-rewrite':
      return 'Identify the weakest section of SKILL.md (based on napkin failures) and rewrite it with clearer instructions, better examples, and more explicit constraints.';

    case 'example-driven':
      return 'Add concrete code examples (good and bad) for the most common failure patterns. Focus on copy-pasteable patterns that the LLM can follow directly.';

    case 'deletion':
      return 'Remove redundant, verbose, or low-value sections from SKILL.md. Shorter docs with higher signal-to-noise ratio often outperform longer ones. Preserve all critical rules.';

    case 'structural':
      return 'Reorganize SKILL.md structure: reorder sections for better flow, consolidate scattered rules, add section cross-references. Do not change the content, only the structure.';

    case 'adversarial':
      return 'Adversarial mutation: introduce edge cases, unusual data patterns, and stress tests that the SKILL.md should handle but might not.';

    case 'cross-pollination':
      if (crossPollinationContent) {
        return `Cross-pollination: incorporate successful patterns from other variants. Source material:\n${crossPollinationContent.slice(0, 2000)}`;
      }
      return 'Cross-pollination: look at successful patterns from the best-performing variant and incorporate their approaches.';
  }
}

/**
 * Write directive files to genDir/directives/
 */
export function writeDirectives(genDir: string, directives: MutationDirective[]): void {
  const directivesDir = join(genDir, 'directives');
  ensureDir(directivesDir);

  for (const directive of directives) {
    const filename = `variant-${directive.variantId}.json`;
    writeFileSync(
      join(directivesDir, filename),
      JSON.stringify(directive, null, 2)
    );
  }

  // Also write a combined directives.json
  writeFileSync(
    join(directivesDir, 'directives.json'),
    JSON.stringify(directives, null, 2)
  );
}

// ---------------------------------------------------------------------------
// Task 4.2: Sonnet Transfer Validation
// ---------------------------------------------------------------------------

/**
 * Compare Opus and Sonnet scores to detect transfer degradation.
 * Degraded if transferRatio < 0.8.
 */
export function computeTransferScore(
  opusScores: VariantScore[],
  sonnetScores: VariantScore[]
): TransferCheckResult {
  // Use the best variant's fitness from each model
  const opusBest = opusScores.length > 0
    ? Math.max(...opusScores.map((s) => s.fitness))
    : 0;
  const sonnetBest = sonnetScores.length > 0
    ? Math.max(...sonnetScores.map((s) => s.fitness))
    : 0;

  const transferRatio = opusBest > 0 ? sonnetBest / opusBest : 0;

  return {
    generation: 0, // caller should set this
    opusScore: opusBest,
    sonnetScore: sonnetBest,
    transferRatio,
    degraded: transferRatio < 0.8,
  };
}

// ---------------------------------------------------------------------------
// Task 5.1: Ablation Testing
// ---------------------------------------------------------------------------

/**
 * Find <!-- AUTORESEARCH-MUTATION-START: name --> ... <!-- AUTORESEARCH-MUTATION-END: name --> markers
 */
export function findMutationMarkers(
  skillMd: string
): { name: string; start: number; end: number; content: string }[] {
  const markers: { name: string; start: number; end: number; content: string }[] = [];
  const startPattern = /<!--\s*AUTORESEARCH-MUTATION-START:\s*([^\s>]+)\s*-->/g;

  let match;
  while ((match = startPattern.exec(skillMd)) !== null) {
    const name = match[1];
    const startIdx = match.index;

    const endPattern = new RegExp(
      `<!--\\s*AUTORESEARCH-MUTATION-END:\\s*${escapeRegex(name)}\\s*-->`,
      'g'
    );
    endPattern.lastIndex = startIdx + match[0].length;
    const endMatch = endPattern.exec(skillMd);

    if (endMatch) {
      const endIdx = endMatch.index + endMatch[0].length;
      markers.push({
        name,
        start: startIdx,
        end: endIdx,
        content: skillMd.slice(startIdx, endIdx),
      });
    }
  }

  return markers;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Find ## heading sections for fallback ablation
 */
export function findSections(
  skillMd: string
): { heading: string; start: number; end: number; content: string }[] {
  const sections: { heading: string; start: number; end: number; content: string }[] = [];
  const lines = skillMd.split('\n');

  let currentHeading: string | null = null;
  let currentStart = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headingMatch = line.match(/^##\s+(.+)/);

    if (headingMatch) {
      // Close previous section
      if (currentHeading !== null) {
        const lineOffset = lines.slice(0, i).join('\n').length;
        sections.push({
          heading: currentHeading,
          start: currentStart,
          end: lineOffset,
          content: skillMd.slice(currentStart, lineOffset),
        });
      }
      currentHeading = headingMatch[1].trim();
      currentStart = lines.slice(0, i).join('\n').length + (i > 0 ? 1 : 0);
    }
  }

  // Close last section
  if (currentHeading !== null) {
    sections.push({
      heading: currentHeading,
      start: currentStart,
      end: skillMd.length,
      content: skillMd.slice(currentStart),
    });
  }

  return sections;
}

/**
 * Revert a specific mutation to the previous version.
 * Marker-based first, section fallback.
 */
export function createAblatedVersion(
  currentSkillMd: string,
  previousSkillMd: string,
  targetMutation: string
): string {
  // Try marker-based ablation first
  const currentMarkers = findMutationMarkers(currentSkillMd);
  const targetMarker = currentMarkers.find((m) => m.name === targetMutation);

  if (targetMarker) {
    // Find the same marker in the previous version
    const prevMarkers = findMutationMarkers(previousSkillMd);
    const prevMarker = prevMarkers.find((m) => m.name === targetMutation);

    if (prevMarker) {
      // Replace current marker content with previous version
      return (
        currentSkillMd.slice(0, targetMarker.start) +
        prevMarker.content +
        currentSkillMd.slice(targetMarker.end)
      );
    } else {
      // Marker didn't exist in previous version — remove it entirely
      return (
        currentSkillMd.slice(0, targetMarker.start) +
        currentSkillMd.slice(targetMarker.end)
      );
    }
  }

  // Fallback: section-based ablation using ## headings
  const currentSections = findSections(currentSkillMd);
  const targetSection = currentSections.find((s) => s.heading === targetMutation);

  if (targetSection) {
    const prevSections = findSections(previousSkillMd);
    const prevSection = prevSections.find((s) => s.heading === targetMutation);

    if (prevSection) {
      return (
        currentSkillMd.slice(0, targetSection.start) +
        prevSection.content +
        currentSkillMd.slice(targetSection.end)
      );
    } else {
      // Section didn't exist before — remove it
      return (
        currentSkillMd.slice(0, targetSection.start) +
        currentSkillMd.slice(targetSection.end)
      );
    }
  }

  // Target not found — return unchanged
  return currentSkillMd;
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

if (import.meta.main) {
  const args = process.argv.slice(2);
  const mode = args.find((a) => a.startsWith('--mode='))?.slice('--mode='.length);

  if (mode === 'eval-only') {
    // Find file args (non-flag args)
    const fileArgs = args.filter((a) => !a.startsWith('--'));
    const jsxPath = fileArgs[0];
    const specPath = fileArgs[1];

    if (!jsxPath || !specPath) {
      console.error('Usage: bun eval-parallel.ts --mode=eval-only <file.jsx> <spec.md>');
      process.exit(1);
    }

    if (!existsSync(jsxPath)) {
      console.error(`Error: JSX file not found: ${jsxPath}`);
      process.exit(1);
    }

    if (!existsSync(specPath)) {
      console.error(`Error: Spec file not found: ${specPath}`);
      process.exit(1);
    }

    const result = evaluateApp(jsxPath, specPath);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.finalScore > 0 ? 0 : 1);
  } else if (mode === 'continuous') {
    const config = loadConfig();
    const resultsDir = join(import.meta.dir, '..', 'eval', 'results');
    ensureDir(resultsDir);

    // Check for resumability
    const summariesPath = join(resultsDir, 'summaries.json');
    let summaries: GenerationSummary[] = [];
    let startGen = 1;

    if (existsSync(summariesPath)) {
      try {
        summaries = JSON.parse(readFileSync(summariesPath, 'utf8'));
        if (summaries.length > 0) {
          startGen = summaries[summaries.length - 1].generation + 1;
          console.log(`Resuming from generation ${startGen} (${summaries.length} previous generations found)`);
        }
      } catch {
        summaries = [];
      }
    }

    const napkinPath = join(import.meta.dir, '..', 'eval', 'napkin.md');

    // Continuous loop
    let plateauCount = summaries.length > 0 ? summaries[summaries.length - 1].plateauCount : 0;

    for (let gen = startGen; gen <= config.maxGenerations; gen++) {
      const genDir = join(resultsDir, `gen-${gen}`);
      ensureDir(genDir);

      // Check stopping criteria
      const stopCheck = shouldStop(gen, plateauCount, config, summaries);
      if (stopCheck.stop) {
        console.log(`\nStopping: ${stopCheck.reason}`);
        break;
      }
      if (stopCheck.expandBattery) {
        console.log(`\nNote: ${stopCheck.reason}`);
      }

      // Copy control variant (variant-0 = current best SKILL.md)
      const variantsDir = join(genDir, 'variants', 'variant-0');
      ensureDir(variantsDir);
      const skillMdPath = join(import.meta.dir, '..', 'skills', 'vibes', 'SKILL.md');
      if (existsSync(skillMdPath)) {
        writeFileSync(
          join(variantsDir, 'SKILL.md'),
          readFileSync(skillMdPath, 'utf8')
        );
      }

      // Write directives for gen 2+
      if (gen >= 2) {
        const directives = generateDirectives(gen, config.variants, napkinPath);
        writeDirectives(genDir, directives);
        console.log(`\nGeneration ${gen}: wrote ${directives.length} directives to ${genDir}/directives/`);
      } else {
        console.log(`\nGeneration ${gen}: initial generation (no directives)`);
      }

      // Print instructions for agent dispatch
      console.log(`\n--- Generation ${gen} Ready ---`);
      console.log(`Results dir: ${genDir}`);
      console.log(`Variants: ${config.variants} (variant-0 is control)`);
      console.log(`Prompts: ${config.prompts.length}`);
      console.log(`Runs per variant: ${config.runs}`);
      console.log('');
      console.log('Agent dispatch: The orchestrator agent should now:');
      console.log(`  1. Generate ${config.variants - 1} mutated SKILL.md variants using directives`);
      console.log(`  2. Run eval on all variants (${config.variants} x ${config.prompts.length} prompts x ${config.runs} runs)`);
      console.log('  3. Score the generation and write summary');
      console.log('  4. Update plateauCount and continue to next generation');

      // In continuous mode, we set up the structure and exit
      // The actual agent dispatch happens via the orchestrator agent
      break;
    }

    // Generate final report summary
    if (summaries.length > 0) {
      console.log('\n=== Run Summary ===');
      console.log(`Generations completed: ${summaries.length}`);
      const best = summaries.reduce((a, b) => (a.bestFitness > b.bestFitness ? a : b));
      console.log(`Best fitness: ${best.bestFitness.toFixed(4)} (gen ${best.generation}, variant ${best.bestVariant})`);
      const lastControl = summaries[summaries.length - 1].controlFitness;
      console.log(`Latest control fitness: ${lastControl.toFixed(4)}`);
      const improved = summaries.filter((s) => s.improved).length;
      console.log(`Generations with improvement: ${improved}/${summaries.length}`);
    }

    process.exit(0);
  } else {
    // Default: print config + prompt count
    const config = loadConfig();

    console.log('PARE Orchestrator — eval-parallel.ts');
    console.log('=====================================');
    console.log(`Variants per generation : ${config.variants}`);
    console.log(`Runs per variant        : ${config.runs}`);
    console.log(`Max generations         : ${config.maxGenerations}`);
    console.log(`Plateau threshold       : ${config.plateauThreshold}`);
    console.log(`Consistency penalty     : ${config.consistencyPenalty}`);
    console.log(`Ablation frequency      : ${config.ablationFrequency}`);
    console.log(`Red team ceiling        : ${config.redTeamCeiling}`);
    console.log(`Sonnet check frequency  : ${config.sonnetCheckFrequency}`);
    console.log(`Prompt battery size     : ${config.prompts.length} prompts`);
    console.log('');
    console.log('Ready. Use --mode=eval-only <file.jsx> <spec.md> to evaluate a single app.');
    console.log('Use --mode=continuous to get instructions for the orchestrator agent.');
  }
}
