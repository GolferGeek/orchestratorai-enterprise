/**
 * Due Diligence — Specialist Registry.
 *
 * Financial specialists follow a config-driven pattern: each specialist
 * declares its role, specialty focus, output contract, and whether the
 * analyst gate must enforce a numeric quote on findings. Legal specialists
 * (contract, ip, employment, compliance, real_estate, privacy, corporate,
 * litigation) are NOT registered here — `runSingleSpecialist` falls back
 * to the generic legal template when the registry returns null.
 *
 * See: docs/efforts/current/dd-financial-analysis/prd.md §4.2.4
 */
import type { RiskCategory } from '../../due-diligence.types';
import { FINANCIAL_STATEMENTS_SPECIALIST } from './financial-statements.specialist';
import { REVENUE_CONCENTRATION_SPECIALIST } from './revenue-concentration.specialist';
import { WORKING_CAPITAL_SPECIALIST } from './working-capital.specialist';
import { CAP_TABLE_SPECIALIST } from './cap-table.specialist';
import { DEBT_SCHEDULE_SPECIALIST } from './debt-schedule.specialist';

/** Config for a registry-backed specialist (currently: the financial five). */
export interface SpecialistConfig {
  /** Dispatch key — must match the string used in DOC_TYPE_TO_SPECIALISTS. */
  key: string;
  /**
   * Category written onto every finding this specialist produces. Drives
   * the synthesis risk matrix (`RiskMatrix.cells[].category`).
   */
  findingCategory: RiskCategory;
  /** Opening line of the system prompt (who the analyst is, what they analyze). */
  role: string;
  /** 1–3 sentence specialty directive appended to role. */
  focus: string;
  /**
   * JSON schema text for the analyst's response. Must include the standard
   * overallRisk/riskFlags/keyFindings/summary shape; cap-table,
   * working-capital, and debt-schedule also include an optional `tabular`
   * field for the Financial Findings panel.
   */
  outputContract: string;
  /**
   * If true, findings without at least one numeric token (`$`, `%`, or a
   * digit sequence) are dropped at the analyst gate with an observability
   * log. See PRD §4.2.3 and R2.
   */
  requireNumericQuote: boolean;
}

export const SPECIALISTS: Record<string, SpecialistConfig> = {
  [FINANCIAL_STATEMENTS_SPECIALIST.key]: FINANCIAL_STATEMENTS_SPECIALIST,
  [REVENUE_CONCENTRATION_SPECIALIST.key]: REVENUE_CONCENTRATION_SPECIALIST,
  [WORKING_CAPITAL_SPECIALIST.key]: WORKING_CAPITAL_SPECIALIST,
  [CAP_TABLE_SPECIALIST.key]: CAP_TABLE_SPECIALIST,
  [DEBT_SCHEDULE_SPECIALIST.key]: DEBT_SCHEDULE_SPECIALIST,
};

/** Look up a registry config by specialist key. Returns null for unregistered (legal) keys. */
export function getSpecialistConfig(key: string): SpecialistConfig | null {
  return SPECIALISTS[key] ?? null;
}

/**
 * True if `text` contains at least one numeric anchor: a dollar sign, a
 * percent sign, or a digit. Used by the analyst gate to drop findings that
 * lack a quote from the source document.
 */
export function containsNumericQuote(text: string): boolean {
  return /[$%\d]/.test(text);
}
