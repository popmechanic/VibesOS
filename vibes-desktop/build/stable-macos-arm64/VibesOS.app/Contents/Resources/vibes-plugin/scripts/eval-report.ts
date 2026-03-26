import { readFileSync, existsSync } from 'fs';
import type { GenerationSummary } from './eval-parallel.ts';

// ---------------------------------------------------------------------------
// Report generation
// ---------------------------------------------------------------------------

/**
 * Generate a markdown autoresearch final report from a summaries.json file.
 *
 * @param summariesPath - Absolute path to summaries.json
 * @returns Markdown string, or "No data found" / "No generations completed"
 */
export function generateReport(summariesPath: string): string {
  if (!existsSync(summariesPath)) {
    return 'No data found';
  }

  let summaries: GenerationSummary[];
  try {
    const raw = readFileSync(summariesPath, 'utf8');
    summaries = JSON.parse(raw) as GenerationSummary[];
  } catch {
    return 'No data found';
  }

  if (!Array.isArray(summaries) || summaries.length === 0) {
    return 'No generations completed';
  }

  const totalGenerations = summaries.length;
  const improvements = summaries.filter((s) => s.improved).length;
  const startingFitness = summaries[0].controlFitness;
  const finalFitness = summaries[summaries.length - 1].bestFitness;
  const percentImprovement =
    startingFitness > 0
      ? (((finalFitness - startingFitness) / startingFitness) * 100).toFixed(1)
      : 'N/A';

  const firstTimestamp = summaries[0].timestamp;
  const lastTimestamp = summaries[summaries.length - 1].timestamp;

  // Determine termination reason
  const lastSummary = summaries[summaries.length - 1];
  let terminationReason: string;
  if (lastSummary.plateauCount > 0) {
    terminationReason = `Plateau (${lastSummary.plateauCount} consecutive non-improving generations)`;
  } else {
    terminationReason = `Max generations reached (${totalGenerations})`;
  }

  // Build per-generation table rows
  const tableRows = summaries
    .map((s) => {
      const improved = s.improved ? 'Yes' : 'No';
      return `| ${s.generation} | ${s.bestFitness.toFixed(4)} | ${s.controlFitness.toFixed(4)} | ${improved} | ${s.bestVariant} | ${s.plateauCount} |`;
    })
    .join('\n');

  const report = `# Autoresearch Final Report

**Run start:** ${firstTimestamp}
**Run end:** ${lastTimestamp}
**Generations:** ${totalGenerations}
**Improvements:** ${improvements}/${totalGenerations}
**Starting fitness:** ${startingFitness.toFixed(4)}
**Final fitness:** ${finalFitness.toFixed(4)}
**Improvement:** ${percentImprovement}%

## Per-Generation Results

| Gen | Best Fitness | Control | Improved | Best Variant | Plateau |
|-----|-------------|---------|----------|-------------|---------|
${tableRows}

## Termination

**Reason:** ${terminationReason}
`;

  return report;
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

if (import.meta.main) {
  const args = process.argv.slice(2);
  const summariesPath = args[0];

  if (!summariesPath) {
    console.error('Usage: bun scripts/eval-report.ts <summaries.json>');
    process.exit(1);
  }

  console.log(generateReport(summariesPath));
}
