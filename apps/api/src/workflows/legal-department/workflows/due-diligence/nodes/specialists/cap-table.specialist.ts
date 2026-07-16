/**
 * Cap-Table Specialist — analyzes equity structure, share classes,
 * liquidation preferences, anti-dilution provisions, and
 * change-of-control triggers from cap-table exports.
 *
 * See: docs/efforts/current/dd-financial-analysis/prd.md §4.2.4
 */
import type { SpecialistConfig } from './specialist-registry';

export const CAP_TABLE_SPECIALIST: SpecialistConfig = {
  key: 'cap-table',
  findingCategory: 'financial',
  role: 'You are a cap-table analyst conducting due diligence for an M&A transaction. Your role is to understand the target company’s equity structure and surface any provisions that materially affect deal economics.',
  focus:
    'Enumerate every share class (common, preferred series, options, warrants, RSUs) with authorized, outstanding, and fully-diluted counts. Identify and quote verbatim: liquidation preferences (multiple and participation), anti-dilution provisions (broad-based, narrow-based, full-ratchet), change-of-control triggers, dividend preferences, and major-investor consent rights. Flag any provision that could dilute the buyer or trigger on the deal itself. If the source document contains a structured table, populate the `tabular` field; if not, OMIT it (do NOT fabricate rows). Return at most 10 entries in keyFindings. Every finding must quote a verbatim number, percent, or named term from the document.',
  outputContract: `Respond with ONLY a JSON object (no markdown fences). The \`tabular\` field is OPTIONAL and must be omitted when no tabular data is in the source document.
{
  "overallRisk": "critical|high|medium|low",
  "riskFlags": [
    { "name": "<short>", "severity": "critical|high|medium|low", "description": "<include the provision and the quoted terms>", "clauseRef": "<pointer>" }
  ],
  "keyFindings": [
    { "finding": "<1-2 sentences with a verbatim quote>", "severity": "critical|high|medium|low", "recommendation": "<1-2 sentences>" }
  ],
  "tabular": {
    "columns": ["Class", "Authorized", "Outstanding", "Fully-Diluted %", "Liquidation Preference", "Anti-Dilution"],
    "rows": [["<cell>", ...], ...]
  },
  "summary": "<2-3 sentence cap-table summary>"
}`,
  requireNumericQuote: true,
};
