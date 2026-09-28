import { composite, countWords, facetScore, lengthScore, shortfalls, standings, type SwarmFacet } from '../scoring';

const facet = (over: Partial<SwarmFacet> = {}): SwarmFacet => ({
  key: 'hook', label: 'Hook', source: 'jev', rubric: 'copy-hook', question: 'meets', inputs: { draft: 'draft', brief: 'brief' }, polarity: 'positive', evaluatorOnly: false, ...over,
});
const s = (score: number) => ({ score, reason: 'r' });

describe('facet scores', () => {
  it('takes the probability as is, or its complement for a question about a fault', () => {
    expect(facetScore(facet(), 0.8)).toBe(0.8);
    expect(facetScore(facet({ polarity: 'negative' }), 0.8)).toBeCloseTo(0.2);
    expect(() => facetScore(facet(), 1.2)).toThrow(/not a probability/);
  });

  it('scores length 1 inside the limits and less the further outside', () => {
    const limits = { minWords: 10, maxWords: 20, maxChars: null };
    expect(countWords('  one two\nthree ')).toBe(3);
    expect(lengthScore(Array(15).fill('w').join(' '), limits).score).toBe(1);
    expect(lengthScore(Array(25).fill('w').join(' '), limits).score).toBe(0.5);
    expect(lengthScore(Array(5).fill('w').join(' '), limits).score).toBe(0);
    expect(lengthScore('x'.repeat(300), { minWords: 1, maxWords: 50, maxChars: 280 }).reason).toContain('at most 280 characters');
    expect(lengthScore('x'.repeat(300), { minWords: 1, maxWords: 50, maxChars: 280 }).score).toBeCloseTo(0.857, 3);
  });
});

describe('composite', () => {
  it('is the weighted mean of the weighted facets, and never skips one that was not scored', () => {
    expect(composite({ hook: 3, cta: 1, seo: 0 }, { hook: s(1), cta: s(0) })).toBe(0.75);
    expect(() => composite({ hook: 1 }, {})).toThrow(/No score for facet hook/);
    expect(() => composite({ hook: 0 }, { hook: s(1) })).toThrow(/No facet has a weight/);
  });

  it('lists shortfalls by what they cost this editor', () => {
    const out = shortfalls({ hook: 5, cta: 1, seo: 3 }, { hook: s(0.6), cta: s(0), seo: s(0.9) }, { hook: 'Hook', cta: 'Call to action' });
    expect(out.map((x) => x.facet)).toEqual(['Hook', 'Call to action']);
  });
});

describe('standings', () => {
  const drafts = [
    { writer: 'creative', scores: { hook: s(0.9), cta: s(0.2) } },
    { writer: 'persuasive', scores: { hook: s(0.5), cta: s(0.9) } },
    { writer: 'technical', scores: { hook: s(0.3), cta: s(0.4) } },
  ];

  it('ranks by each evaluator, then overall by the mean place', () => {
    const out = standings(drafts, [
      { slug: 'creativity', weights: { hook: 1 } },
      { slug: 'conversion', weights: { cta: 1 } },
    ]);
    // creativity: creative 1, persuasive 2, technical 3; conversion: persuasive 1, technical 2, creative 3.
    expect(out.map((r) => [r.writer, r.place, r.averagePlace])).toEqual([
      ['persuasive', 1, 1.5],
      ['creative', 2, 2],
      ['technical', 3, 2.5],
    ]);
    expect(out[1]!.byEvaluator).toEqual({ creativity: { score: 0.9, place: 1 }, conversion: { score: 0.2, place: 3 } });
  });

  it('breaks an equal mean place by the mean score', () => {
    const out = standings(drafts.slice(0, 2), [
      { slug: 'creativity', weights: { hook: 1 } },
      { slug: 'conversion', weights: { cta: 1 } },
    ]);
    // Both average place 1.5; persuasive's mean score (0.7) beats creative's (0.55).
    expect(out.map((r) => r.writer)).toEqual(['persuasive', 'creative']);
  });

  it('gives equal scores the same place', () => {
    const out = standings([{ writer: 'a', scores: { hook: s(0.5) } }, { writer: 'b', scores: { hook: s(0.5) } }], [{ slug: 'q', weights: { hook: 1 } }]);
    expect(out.map((r) => r.byEvaluator.q!.place)).toEqual([1, 1]);
  });
});
