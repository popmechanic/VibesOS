import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  generateDirectives,
  writeDirectives,
  writeGenerationSummary,
  cleanupGeneration,
  shouldStop,
  computeTransferScore,
  type GenerationSummary,
  type MutationDirective,
} from '../../eval-parallel.ts';
import type { VariantScore } from '../../eval-scoring.ts';

// ---------------------------------------------------------------------------
// generateDirectives
// ---------------------------------------------------------------------------

describe('generateDirectives', () => {
  let tmpDir: string;
  let napkinPath: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `eval-directive-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    napkinPath = join(tmpDir, 'napkin.md');
    writeFileSync(
      napkinPath,
      [
        '# Eval Napkin',
        '',
        '## Active Entries',
        '',
        '### Failure: Hooks called inside array iteration methods',
        '- **Pattern:** hooks-in-loop',
        '',
        '### Failure: Host assignment race with useValueState',
        '- **Pattern:** value-init-race',
        '',
        '### Failure: Values sync race on initial CRDT merge',
        '- **Pattern:** value-null-delete-race',
      ].join('\n')
    );
  });

  afterEach(() => {
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('early generations favor fix-targeted', () => {
    const directives = generateDirectives(1, 10, napkinPath);
    const fixCount = directives.filter((d) => d.strategy === 'fix-targeted').length;
    expect(fixCount).toBeGreaterThanOrEqual(4);
  });

  it('always includes adversarial in last slot', () => {
    for (const gen of [1, 5, 20]) {
      const directives = generateDirectives(gen, 10, napkinPath);
      const last = directives[directives.length - 1];
      expect(last.strategy).toBe('adversarial');
    }
  });

  it('late generations favor deletion', () => {
    const directives = generateDirectives(20, 10, napkinPath);
    const deletionCount = directives.filter((d) => d.strategy === 'deletion').length;
    expect(deletionCount).toBeGreaterThanOrEqual(2);
  });

  it('produces numVariants directives', () => {
    const directives = generateDirectives(5, 10, napkinPath);
    // numVariants - 1 regular + 1 adversarial = numVariants - 1 total
    // (variant-0 is the control, not included in directives)
    expect(directives.length).toBe(9); // 10 - 1 control = 9
  });
});

// ---------------------------------------------------------------------------
// writeDirectives
// ---------------------------------------------------------------------------

describe('writeDirectives', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `eval-write-directive-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('writes individual and combined directive files', () => {
    const directives: MutationDirective[] = [
      { variantId: 1, strategy: 'fix-targeted', context: 'fix something' },
      { variantId: 2, strategy: 'adversarial', context: 'adversarial test' },
    ];
    writeDirectives(tmpDir, directives);

    expect(existsSync(join(tmpDir, 'directives', 'variant-1.json'))).toBe(true);
    expect(existsSync(join(tmpDir, 'directives', 'variant-2.json'))).toBe(true);
    expect(existsSync(join(tmpDir, 'directives', 'directives.json'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// writeGenerationSummary
// ---------------------------------------------------------------------------

describe('writeGenerationSummary', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `eval-summary-test-${Date.now()}`);
    mkdirSync(join(tmpDir, 'gen-1'), { recursive: true });
  });

  afterEach(() => {
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('writes summary.json and appends to summaries.json', () => {
    const genDir = join(tmpDir, 'gen-1');
    const variantScores: VariantScore[] = [
      { variant: 0, mean: 3.0, stdDev: 0.5, fitness: 2.75, promptAverages: {} },
      { variant: 1, mean: 3.5, stdDev: 0.3, fitness: 3.35, promptAverages: {} },
    ];

    writeGenerationSummary(genDir, 1, variantScores, 1, 3.35, 2.75, 0, 'abc123');

    expect(existsSync(join(genDir, 'summary.json'))).toBe(true);
    expect(existsSync(join(tmpDir, 'summaries.json'))).toBe(true);

    const summary = JSON.parse(
      require('fs').readFileSync(join(genDir, 'summary.json'), 'utf8')
    );
    expect(summary.generation).toBe(1);
    expect(summary.bestVariant).toBe(1);
    expect(summary.bestFitness).toBe(3.35);
    expect(summary.improved).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// cleanupGeneration
// ---------------------------------------------------------------------------

describe('cleanupGeneration', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `eval-cleanup-test-${Date.now()}`);
    const variantsDir = join(tmpDir, 'variants');
    for (let i = 0; i < 5; i++) {
      mkdirSync(join(variantsDir, `variant-${i}`), { recursive: true });
      writeFileSync(join(variantsDir, `variant-${i}`, 'SKILL.md'), `variant ${i}`);
    }
  });

  afterEach(() => {
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('keeps specified variants and deletes the rest', () => {
    cleanupGeneration(tmpDir, [0, 1, 3]);

    const variantsDir = join(tmpDir, 'variants');
    expect(existsSync(join(variantsDir, 'variant-0'))).toBe(true);
    expect(existsSync(join(variantsDir, 'variant-1'))).toBe(true);
    expect(existsSync(join(variantsDir, 'variant-2'))).toBe(false);
    expect(existsSync(join(variantsDir, 'variant-3'))).toBe(true);
    expect(existsSync(join(variantsDir, 'variant-4'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// shouldStop
// ---------------------------------------------------------------------------

describe('shouldStop', () => {
  const baseConfig = {
    variants: 10,
    prompts: [],
    runs: 3,
    maxGenerations: 30,
    plateauThreshold: 3,
    consistencyPenalty: 0.5,
    ablationFrequency: 3,
    redTeamCeiling: 300,
    sonnetCheckFrequency: 5,
  };

  it('stops at max generations', () => {
    const result = shouldStop(30, 0, baseConfig, []);
    expect(result.stop).toBe(true);
    expect(result.reason).toContain('max generations');
  });

  it('stops at plateau threshold', () => {
    const result = shouldStop(5, 3, baseConfig, []);
    expect(result.stop).toBe(true);
    expect(result.reason).toContain('Plateau');
  });

  it('suggests battery expansion at high fitness', () => {
    const summaries: GenerationSummary[] = [
      {
        generation: 1,
        timestamp: '',
        variantScores: {},
        bestVariant: 1,
        bestFitness: 3.9,
        controlFitness: 3.5,
        improved: true,
        plateauCount: 0,
      },
    ];
    const result = shouldStop(2, 0, baseConfig, summaries);
    expect(result.stop).toBe(false);
    expect(result.expandBattery).toBe(true);
  });

  it('does not stop under normal conditions', () => {
    const result = shouldStop(5, 1, baseConfig, []);
    expect(result.stop).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// computeTransferScore
// ---------------------------------------------------------------------------

describe('computeTransferScore', () => {
  it('computes transfer ratio correctly', () => {
    const opusScores: VariantScore[] = [
      { variant: 0, mean: 3.5, stdDev: 0.3, fitness: 3.35, promptAverages: {} },
    ];
    const sonnetScores: VariantScore[] = [
      { variant: 0, mean: 3.0, stdDev: 0.3, fitness: 2.85, promptAverages: {} },
    ];
    const result = computeTransferScore(opusScores, sonnetScores);
    expect(result.opusScore).toBe(3.35);
    expect(result.sonnetScore).toBe(2.85);
    expect(result.transferRatio).toBeCloseTo(2.85 / 3.35, 5);
    expect(result.degraded).toBe(false); // 0.851 > 0.8, so not degraded
  });

  it('marks as degraded when ratio < 0.8', () => {
    const opusScores: VariantScore[] = [
      { variant: 0, mean: 4.0, stdDev: 0.2, fitness: 3.9, promptAverages: {} },
    ];
    const sonnetScores: VariantScore[] = [
      { variant: 0, mean: 2.5, stdDev: 0.5, fitness: 2.25, promptAverages: {} },
    ];
    const result = computeTransferScore(opusScores, sonnetScores);
    expect(result.degraded).toBe(true);
    expect(result.transferRatio).toBeLessThan(0.8);
  });

  it('handles empty scores', () => {
    const result = computeTransferScore([], []);
    expect(result.opusScore).toBe(0);
    expect(result.sonnetScore).toBe(0);
    expect(result.transferRatio).toBe(0);
    expect(result.degraded).toBe(true);
  });
});
