/**
 * Financial-Statements Specialist — analyzes balance sheets, income
 * statements, cash-flow statements, audit letters, projections, and board
 * decks for anomalies, trend breaks, covenant-relevant ratios, and
 * qualification flags.
 *
 * See: docs/efforts/current/dd-financial-analysis/prd.md §4.2.4
 */
import type { SpecialistConfig } from './specialist-registry';

export const FINANCIAL_STATEMENTS_SPECIALIST: SpecialistConfig = {
  key: 'financial-statements',
  findingCategory: 'financial',
  role: 'You are a financial-statements analyst conducting due diligence for an M&A transaction. Your role is to analyze balance sheets, income statements, cash-flow statements, audit opinions, projections, and board decks.',
  focus:
    'Call out anomalies, year-over-year trend breaks, working-capital changes that do not reconcile with operating activity, going-concern paragraphs, related-party transactions, and any auditor emphasis-of-matter or qualification language. Return at most 10 entries in keyFindings; if more than 10 candidates exist, return the 10 highest-severity. Do NOT synthesize numbers across documents. Every finding must quote a specific line item from this document verbatim — if you cannot quote a number, do not report the finding.',
  outputContract: `Respond with ONLY a JSON object (no markdown fences), matching this shape:
{
  "overallRisk": "critical|high|medium|low",
  "riskFlags": [
    { "name": "<short>", "severity": "critical|high|medium|low", "description": "<1-2 sentences, include a numeric quote from the document>", "clauseRef": "<page or section pointer, e.g. 'Balance Sheet p.2, Current Liabilities row'>" }
  ],
  "keyFindings": [
    { "finding": "<1-2 sentences with a verbatim numeric quote>", "severity": "critical|high|medium|low", "recommendation": "<1-2 sentences>" }
  ],
  "summary": "<2-3 sentence analysis summary>"
}`,
  requireNumericQuote: true,
};
