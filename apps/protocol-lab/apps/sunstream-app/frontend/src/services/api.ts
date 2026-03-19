import type {
  ScenarioDefinition,
  ScenarioResult,
  LoanApplication,
  BorrowerRecord,
  CollateralItem,
  PortfolioSummary,
  ServiceItem,
  Association,
  ExaminationCriteria,
  CapitalRequirement,
  AssociationRating,
  RiskConcentrationLimit,
} from '@/types';
import { normalizePipelineTrace } from '@/types';

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const options: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };

  if (body !== undefined) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(path, options);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error ${response.status} ${response.statusText}: ${errorText}`);
  }

  const text = await response.text();
  if (!text) {
    return undefined as T;
  }

  return JSON.parse(text) as T;
}

// Scenario endpoints

export function fetchScenarios(): Promise<ScenarioDefinition[]> {
  return request<ScenarioDefinition[]>('GET', '/api/scenarios/list');
}

export async function runScenario(
  id: number,
  config?: Record<string, string>,
): Promise<ScenarioResult> {
  const raw = await request<Record<string, unknown>>(
    'POST',
    `/api/scenarios/run/${id}`,
    config ? { config } : undefined,
  );
  return {
    ...raw,
    pipelineTrace: normalizePipelineTrace((raw as Record<string, unknown>).pipelineTrace),
  } as ScenarioResult;
}

// SunStream org endpoints

export function fetchSunstreamServices(): Promise<ServiceItem[]> {
  return request<ServiceItem[]>('GET', '/api/sunstream/services');
}

export function fetchSunstreamAssociations(): Promise<Association[]> {
  return request<Association[]>('GET', '/api/sunstream/associations');
}

// FCS Financial org endpoints

export function fetchFcsLoans(): Promise<LoanApplication[]> {
  return request<LoanApplication[]>('GET', '/api/fcs/loans');
}

export function fetchFcsBorrowers(): Promise<BorrowerRecord[]> {
  return request<BorrowerRecord[]>('GET', '/api/fcs/borrowers');
}

export function fetchFcsRates(): Promise<unknown> {
  return request<unknown>('GET', '/api/fcs/rates');
}

export function fetchFcsCollateral(): Promise<CollateralItem[]> {
  return request<CollateralItem[]>('GET', '/api/fcs/collateral');
}

export function fetchFcsPortfolio(): Promise<PortfolioSummary> {
  return request<PortfolioSummary>('GET', '/api/fcs/portfolio');
}

// AgriBank org endpoints

export function fetchAgribankExaminationCriteria(): Promise<ExaminationCriteria[]> {
  return request<ExaminationCriteria[]>('GET', '/api/agribank/examination-criteria');
}

export function fetchAgribankCapitalRequirements(): Promise<CapitalRequirement[]> {
  return request<CapitalRequirement[]>('GET', '/api/agribank/capital-requirements');
}

export function fetchAgribankRatings(): Promise<AssociationRating[]> {
  return request<AssociationRating[]>('GET', '/api/agribank/ratings');
}

export function fetchAgribankRiskLimits(): Promise<RiskConcentrationLimit[]> {
  return request<RiskConcentrationLimit[]>('GET', '/api/agribank/risk-limits');
}

// Transaction endpoints (via DataController)

export function fetchFcsTransactions(): Promise<unknown> {
  return request<unknown>('GET', '/api/data/transactions/fcs-financial');
}

export function fetchSunstreamTransactions(): Promise<unknown> {
  return request<unknown>('GET', '/api/data/transactions/sunstream');
}

export function fetchAgribankTransactions(): Promise<unknown> {
  return request<unknown>('GET', '/api/data/transactions/agribank');
}

// Org data file fetcher — maps org + file name to backend endpoint

export interface OrgDataFile {
  org: string;
  label: string;
  fetch: () => Promise<unknown>;
}

export const ORG_DATA_FILES: OrgDataFile[] = [
  { org: 'FCS Financial', label: 'Loan Applications', fetch: fetchFcsLoans },
  { org: 'FCS Financial', label: 'Borrower Records', fetch: fetchFcsBorrowers },
  { org: 'FCS Financial', label: 'Rate Sheet', fetch: fetchFcsRates },
  { org: 'FCS Financial', label: 'Collateral Inventory', fetch: fetchFcsCollateral },
  { org: 'FCS Financial', label: 'Portfolio Summary', fetch: fetchFcsPortfolio },
  { org: 'FCS Financial', label: 'Transactions', fetch: fetchFcsTransactions },
  { org: 'SunStream', label: 'Service Catalog', fetch: fetchSunstreamServices },
  { org: 'SunStream', label: 'Associations', fetch: fetchSunstreamAssociations },
  { org: 'SunStream', label: 'Transactions', fetch: fetchSunstreamTransactions },
  { org: 'AgriBank', label: 'Examination Criteria', fetch: fetchAgribankExaminationCriteria },
  { org: 'AgriBank', label: 'Capital Requirements', fetch: fetchAgribankCapitalRequirements },
  { org: 'AgriBank', label: 'Association Ratings', fetch: fetchAgribankRatings },
  { org: 'AgriBank', label: 'Risk Limits', fetch: fetchAgribankRiskLimits },
  { org: 'AgriBank', label: 'Transactions', fetch: fetchAgribankTransactions },
];
