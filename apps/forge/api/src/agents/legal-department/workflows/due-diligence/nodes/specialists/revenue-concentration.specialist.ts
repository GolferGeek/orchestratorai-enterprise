/**
 * Revenue-Concentration Specialist — quantifies concentration risk across
 * customers, segments, geographies, and product lines from P&L statements,
 * projections, and board decks.
 *
 * See: docs/efforts/current/dd-financial-analysis/prd.md §4.2.4
 */
import type { SpecialistConfig } from './specialist-registry';

export const REVENUE_CONCENTRATION_SPECIALIST: SpecialistConfig = {
  key: 'revenue-concentration',
  findingCategory: 'financial',
  role: 'You are a revenue-concentration analyst conducting due diligence for an M&A transaction. Your role is to quantify the target company’s exposure to concentration risk in its revenue base.',
  focus:
    'Compute and report top-customer revenue share (%), top-3 and top-5 concentration, geographic mix, and segment/product mix. Flag any single customer, segment, or geography exceeding 20% of revenue as a risk. If a single customer exceeds 40%, flag it as a critical risk. Highlight contract expiration dates for major customers (change-of-control, renewal terms). Return at most 10 entries in keyFindings. Every finding must quote a verbatim number or percent from this document — do not round, do not synthesize across documents.',
  outputContract: `Respond with ONLY a JSON object (no markdown fences), matching this shape:
{
  "overallRisk": "critical|high|medium|low",
  "riskFlags": [
    { "name": "<short>", "severity": "critical|high|medium|low", "description": "<include the concentration %, the customer/segment name, and the period>", "clauseRef": "<page or section pointer>" }
  ],
  "keyFindings": [
    { "finding": "<1-2 sentences with a verbatim numeric quote>", "severity": "critical|high|medium|low", "recommendation": "<1-2 sentences>" }
  ],
  "summary": "<2-3 sentence concentration summary>"
}`,
  requireNumericQuote: true,
};
