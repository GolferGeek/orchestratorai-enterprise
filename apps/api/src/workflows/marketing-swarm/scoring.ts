/**
 * The marketing swarm's arithmetic. Models only answer facet questions (Jev)
 * and write; every score, gate and standing is computed here.
 */

export interface SwarmFacet {
  key: string;
  label: string;
  source: 'jev' | 'length';
  rubric: string | null;
  question: string | null;
  /** Rubric input name -> 'draft' | 'brief' | 'evidence'. */
  inputs: Record<string, 'draft' | 'brief' | 'evidence'> | null;
  polarity: 'positive' | 'negative';
  evaluatorOnly: boolean;
}

export interface ContentTypeLimits {
  minWords: number;
  maxWords: number;
  maxChars: number | null;
}

/** A draft's score on one facet (0-1) and why. */
export interface FacetScore {
  score: number;
  reason: string;
}

export type Weights = Record<string, number>;

/** A Jev probability as the facet's score: "true" is good unless the question asks about a fault. */
export function facetScore(facet: SwarmFacet, probability: number): number {
  if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
    throw new Error(`Facet ${facet.key}: Jev returned ${probability}, not a probability`);
  }
  return facet.polarity === 'positive' ? probability : 1 - probability;
}

export function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

/**
 * Length against the content type: 1 inside the limits, falling to 0 as the
 * draft goes further outside (0 at half again past a limit).
 */
export function lengthScore(text: string, limits: ContentTypeLimits): FacetScore {
  const words = countWords(text);
  const chars = text.trim().length;
  const misses: number[] = [];
  if (words < limits.minWords) misses.push((limits.minWords - words) / Math.max(limits.minWords, 1));
  if (words > limits.maxWords) misses.push((words - limits.maxWords) / limits.maxWords);
  if (limits.maxChars !== null && chars > limits.maxChars) misses.push((chars - limits.maxChars) / limits.maxChars);
  const worst = misses.length ? Math.max(...misses) : 0;
  const score = Math.max(0, 1 - 2 * worst);
  const limit = `${limits.minWords}-${limits.maxWords} words${limits.maxChars !== null ? `, at most ${limits.maxChars} characters` : ''}`;
  return { score: round(score), reason: `${words} words, ${chars} characters (limit ${limit})` };
}

/**
 * The weighted mean of the facets someone weights (weight > 0). Missing
 * scores for a weighted facet are an error: a gate never passes on a facet
 * that was not checked.
 */
export function composite(weights: Weights, scores: Record<string, FacetScore>): number {
  let total = 0;
  let weightSum = 0;
  for (const [key, weight] of Object.entries(weights)) {
    if (weight <= 0) continue;
    const s = scores[key];
    if (!s) throw new Error(`No score for facet ${key}`);
    total += weight * s.score;
    weightSum += weight;
  }
  if (weightSum === 0) throw new Error('No facet has a weight');
  return round(total / weightSum);
}

/** Where a draft falls short for one editor: the weighted facets, worst first by weight x shortfall. */
export function shortfalls(weights: Weights, scores: Record<string, FacetScore>, labels: Record<string, string>) {
  return Object.entries(weights)
    .filter(([, w]) => w > 0)
    .map(([key, weight]) => ({ facet: labels[key] ?? key, weight, score: scores[key]!.score, reason: scores[key]!.reason, cost: weight * (1 - scores[key]!.score) }))
    .filter((s) => s.score < 0.7)
    .sort((a, b) => b.cost - a.cost)
    .map(({ cost: _cost, ...rest }) => rest);
}

export interface Standing {
  writer: string;
  /** Per evaluator: composite and place (1 = best). */
  byEvaluator: Record<string, { score: number; place: number }>;
  averagePlace: number;
  averageScore: number;
  place: number;
}

/**
 * Standings: each evaluator ranks the drafts by its composite; overall is the
 * mean place across evaluators, ties broken by the mean score, then by the
 * order the writers were chosen in.
 */
export function standings(
  drafts: Array<{ writer: string; scores: Record<string, FacetScore> }>,
  evaluators: Array<{ slug: string; weights: Weights }>,
): Standing[] {
  if (!drafts.length) throw new Error('No drafts to rank');
  if (!evaluators.length) throw new Error('No evaluators to rank with');
  const rows: Standing[] = drafts.map((d) => ({ writer: d.writer, byEvaluator: {}, averagePlace: 0, averageScore: 0, place: 0 }));
  for (const evaluator of evaluators) {
    const scored = drafts.map((d, i) => ({ i, score: composite(evaluator.weights, d.scores) }));
    const ordered = [...scored].sort((a, b) => b.score - a.score || a.i - b.i);
    ordered.forEach((s, position) => {
      // Equal scores share a place.
      const place = position > 0 && s.score === ordered[position - 1]!.score ? rows[ordered[position - 1]!.i]!.byEvaluator[evaluator.slug]!.place : position + 1;
      rows[s.i]!.byEvaluator[evaluator.slug] = { score: s.score, place };
    });
  }
  for (const row of rows) {
    const cells = Object.values(row.byEvaluator);
    row.averagePlace = round(cells.reduce((sum, c) => sum + c.place, 0) / cells.length);
    row.averageScore = round(cells.reduce((sum, c) => sum + c.score, 0) / cells.length);
  }
  const overall = rows.map((r, i) => ({ r, i })).sort((a, b) => a.r.averagePlace - b.r.averagePlace || b.r.averageScore - a.r.averageScore || a.i - b.i);
  overall.forEach(({ r }, position) => (r.place = position + 1));
  return overall.map(({ r }) => r);
}

const round = (n: number) => Math.round(n * 1000) / 1000;
