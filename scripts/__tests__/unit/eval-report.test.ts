import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { generateReport } from '../../eval-report.ts';
import type { GenerationSummary } from '../../eval-parallel.ts';

describe('eval-report', () => {
  it('generates report from summaries', () => {
    const tmpDir = join('/tmp', `eval-report-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });

    const summaries: GenerationSummary[] = [
      {
        generation: 1,
        timestamp: '2026-03-25T10:00:00.000Z',
        variantScores: {
          0: { mean: 3.0, stdDev: 0.5, fitness: 2.75 },
          1: { mean: 3.2, stdDev: 0.4, fitness: 3.0 },
        },
        bestVariant: 1,
        bestFitness: 3.0,
        controlFitness: 2.75,
        improved: false,
        plateauCount: 0,
      },
      {
        generation: 2,
        timestamp: '2026-03-25T11:00:00.000Z',
        variantScores: {
          0: { mean: 3.2, stdDev: 0.3, fitness: 3.05 },
          1: { mean: 3.8, stdDev: 0.2, fitness: 3.7 },
        },
        bestVariant: 1,
        bestFitness: 3.7,
        controlFitness: 3.05,
        improved: true,
        plateauCount: 0,
      },
    ];

    const summariesPath = join(tmpDir, 'summaries.json');
    writeFileSync(summariesPath, JSON.stringify(summaries, null, 2), 'utf8');

    const report = generateReport(summariesPath);

    expect(report).toContain('Autoresearch Final Report');
    expect(report).toContain('Generations:** 2');
    expect(report).toContain('Improvements:** 1/2');
    expect(report).toContain('3.7');

    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('handles missing file', () => {
    const report = generateReport('/tmp/nonexistent-eval-report-file.json');
    expect(report).toBe('No data found');
  });
});
