import { describe, it, expect } from 'vitest';
import {
  findMutationMarkers,
  findSections,
  createAblatedVersion,
} from '../../eval-parallel.ts';

// ---------------------------------------------------------------------------
// findMutationMarkers
// ---------------------------------------------------------------------------

describe('findMutationMarkers', () => {
  it('finds markers', () => {
    const md = [
      'Some preamble text.',
      '',
      '<!-- AUTORESEARCH-MUTATION-START: hooks-warning -->',
      'Never call hooks in loops.',
      '<!-- AUTORESEARCH-MUTATION-END: hooks-warning -->',
      '',
      'Some trailing text.',
    ].join('\n');

    const markers = findMutationMarkers(md);
    expect(markers).toHaveLength(1);
    expect(markers[0].name).toBe('hooks-warning');
    expect(markers[0].content).toContain('Never call hooks in loops.');
    expect(markers[0].content).toContain('AUTORESEARCH-MUTATION-START');
    expect(markers[0].content).toContain('AUTORESEARCH-MUTATION-END');
  });

  it('finds multiple markers', () => {
    const md = [
      '<!-- AUTORESEARCH-MUTATION-START: fix-a -->',
      'Fix A content.',
      '<!-- AUTORESEARCH-MUTATION-END: fix-a -->',
      '',
      '<!-- AUTORESEARCH-MUTATION-START: fix-b -->',
      'Fix B content.',
      '<!-- AUTORESEARCH-MUTATION-END: fix-b -->',
    ].join('\n');

    const markers = findMutationMarkers(md);
    expect(markers).toHaveLength(2);
    expect(markers[0].name).toBe('fix-a');
    expect(markers[1].name).toBe('fix-b');
  });

  it('returns empty for no markers', () => {
    const md = '# Just a heading\n\nSome normal content.\n';
    const markers = findMutationMarkers(md);
    expect(markers).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// findSections
// ---------------------------------------------------------------------------

describe('findSections', () => {
  it('finds ## heading sections', () => {
    const md = [
      '# Top-level heading',
      '',
      '## Section One',
      'Content of section one.',
      '',
      '## Section Two',
      'Content of section two.',
      'More content.',
    ].join('\n');

    const sections = findSections(md);
    expect(sections).toHaveLength(2);
    expect(sections[0].heading).toBe('Section One');
    expect(sections[0].content).toContain('Content of section one.');
    expect(sections[1].heading).toBe('Section Two');
    expect(sections[1].content).toContain('Content of section two.');
    expect(sections[1].content).toContain('More content.');
  });

  it('handles single section', () => {
    const md = '## Only Section\nSome content.\n';
    const sections = findSections(md);
    expect(sections).toHaveLength(1);
    expect(sections[0].heading).toBe('Only Section');
  });

  it('returns empty for no sections', () => {
    const md = '# Just a top-level heading\nNo ## sections here.\n';
    const sections = findSections(md);
    expect(sections).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// createAblatedVersion
// ---------------------------------------------------------------------------

describe('createAblatedVersion', () => {
  it('reverts a marked mutation', () => {
    const current = [
      'Preamble.',
      '<!-- AUTORESEARCH-MUTATION-START: hooks-warning -->',
      'NEW: Never call hooks in loops or callbacks.',
      '<!-- AUTORESEARCH-MUTATION-END: hooks-warning -->',
      'Trailing.',
    ].join('\n');

    const previous = [
      'Preamble.',
      '<!-- AUTORESEARCH-MUTATION-START: hooks-warning -->',
      'OLD: Hooks should be at top level.',
      '<!-- AUTORESEARCH-MUTATION-END: hooks-warning -->',
      'Trailing.',
    ].join('\n');

    const ablated = createAblatedVersion(current, previous, 'hooks-warning');
    expect(ablated).toContain('OLD: Hooks should be at top level.');
    expect(ablated).not.toContain('NEW: Never call hooks in loops');
    expect(ablated).toContain('Preamble.');
    expect(ablated).toContain('Trailing.');
  });

  it('removes mutation if not in previous', () => {
    const current = [
      'Preamble.',
      '<!-- AUTORESEARCH-MUTATION-START: new-section -->',
      'This section was added in the current gen.',
      '<!-- AUTORESEARCH-MUTATION-END: new-section -->',
      'Trailing.',
    ].join('\n');

    const previous = 'Preamble.\nTrailing.';

    const ablated = createAblatedVersion(current, previous, 'new-section');
    expect(ablated).not.toContain('This section was added');
    expect(ablated).not.toContain('AUTORESEARCH-MUTATION-START');
    expect(ablated).toContain('Preamble.');
    expect(ablated).toContain('Trailing.');
  });

  it('falls back to section-based ablation', () => {
    const current = [
      '## Introduction',
      'Intro content.',
      '',
      '## Bug Prevention',
      'NEW: Updated bug prevention rules.',
      '',
      '## Conclusion',
      'Conclusion content.',
    ].join('\n');

    const previous = [
      '## Introduction',
      'Intro content.',
      '',
      '## Bug Prevention',
      'OLD: Original bug prevention rules.',
      '',
      '## Conclusion',
      'Conclusion content.',
    ].join('\n');

    const ablated = createAblatedVersion(current, previous, 'Bug Prevention');
    expect(ablated).toContain('OLD: Original bug prevention rules.');
    expect(ablated).not.toContain('NEW: Updated bug prevention rules.');
  });

  it('returns unchanged if target not found', () => {
    const current = '## Section A\nContent A.\n';
    const previous = '## Section A\nContent A.\n';

    const ablated = createAblatedVersion(current, previous, 'nonexistent-target');
    expect(ablated).toBe(current);
  });
});
