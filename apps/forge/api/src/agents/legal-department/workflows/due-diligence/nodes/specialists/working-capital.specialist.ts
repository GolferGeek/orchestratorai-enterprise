/**
 * Working-Capital Specialist — evaluates AR/AP aging, DSO/DPO trends,
 * inventory turnover, and liquidity ratios from balance sheets,
 * cash-flow statements, and P&Ls.
 *
 * See: docs/efforts/current/dd-financial-analysis/prd.md §4.2.4
 */
import type { SpecialistConfig } from './specialist-registry';

export const WORKING_CAPITAL_SPECIALIST: SpecialistConfig = {
  key: 'working-capital',
  findingCategory: 'financial',
  role: 'You are a working-capital analyst conducting due diligence for an M&A transaction. Your role is to assess the target company’s liquidity, receivables collection, payable management, and working-capital trends.',
  focus:
    'Compute and report AR/AP aging buckets when present, DSO (Days Sales Outstanding) and DPO (Days Payables Outstanding) trends year-over-year, current ratio, quick ratio, and cash conversion cycle. Flag any deteriorating trend (e.g., DSO increasing by more than 15 days YoY) and any concentration of aging in the 90+ day bucket. If the document contains tabular aging data, populate the `tabular` field with columns and rows so downstream views can render it directly — if no tabular data is present in the document, OMIT the `tabular` field entirely (do NOT fabricate rows). Return at most 10 entries in keyFindings. Every finding must quote a verbatim number from this document.',
  outputContract: `Respond with ONLY a JSON object (no markdown fences). The \`tabular\` field is OPTIONAL and must be omitted when no tabular data is in the source document.
{
  "overallRisk": "critical|high|medium|low",
  "riskFlags": [
    { "name": "<short>", "severity": "critical|high|medium|low", "description": "<include the metric and the quoted value>", "clauseRef": "<pointer>" }
  ],
  "keyFindings": [
    { "finding": "<1-2 sentences with a verbatim numeric quote>", "severity": "critical|high|medium|low", "recommendation": "<1-2 sentences>" }
  ],
  "tabular": {
    "columns": ["<col name>", ...],
    "rows": [["<cell>", ...], ...]
  },
  "summary": "<2-3 sentence summary>"
}`,
  requireNumericQuote: true,
};
