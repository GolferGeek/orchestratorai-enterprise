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

// Prairie Ridge Credit org endpoints

export function fetchPrairieRidgeServices(): Promise<ServiceItem[]> {
  return request<ServiceItem[]>('GET', '/api/prairie-ridge/services');
}

export function fetchPrairieRidgeAssociations(): Promise<Association[]> {
  return request<Association[]>('GET', '/api/prairie-ridge/associations');
}

// AgriServ Financial org endpoints

export function fetchAgriservLoans(): Promise<LoanApplication[]> {
  return request<LoanApplication[]>('GET', '/api/fcs/loans');
}

export function fetchAgriservBorrowers(): Promise<BorrowerRecord[]> {
  return request<BorrowerRecord[]>('GET', '/api/fcs/borrowers');
}

export function fetchAgriservRates(): Promise<unknown> {
  return request<unknown>('GET', '/api/fcs/rates');
}

export function fetchAgriservCollateral(): Promise<CollateralItem[]> {
  return request<CollateralItem[]>('GET', '/api/fcs/collateral');
}

export function fetchAgriservPortfolio(): Promise<PortfolioSummary> {
  return request<PortfolioSummary>('GET', '/api/fcs/portfolio');
}

// Central Farm Bank org endpoints

export function fetchCentralFarmBankExaminationCriteria(): Promise<ExaminationCriteria[]> {
  return request<ExaminationCriteria[]>('GET', '/api/central-farm-bank/examination-criteria');
}

export function fetchCentralFarmBankCapitalRequirements(): Promise<CapitalRequirement[]> {
  return request<CapitalRequirement[]>('GET', '/api/central-farm-bank/capital-requirements');
}

export function fetchCentralFarmBankRatings(): Promise<AssociationRating[]> {
  return request<AssociationRating[]>('GET', '/api/central-farm-bank/ratings');
}

export function fetchCentralFarmBankRiskLimits(): Promise<RiskConcentrationLimit[]> {
  return request<RiskConcentrationLimit[]>('GET', '/api/central-farm-bank/risk-limits');
}

// Transaction endpoints (via DataController)

export function fetchAgriservTransactions(): Promise<unknown> {
  return request<unknown>('GET', '/api/data/transactions/agriserv');
}

export function fetchPrairieRidgeTransactions(): Promise<unknown> {
  return request<unknown>('GET', '/api/data/transactions/prairie-ridge');
}

export function fetchCentralFarmBankTransactions(): Promise<unknown> {
  return request<unknown>('GET', '/api/data/transactions/central-farm-bank');
}

// Org data file fetcher — maps org + file name to backend endpoint

export interface OrgDataFile {
  org: string;
  label: string;
  fetch: () => Promise<unknown>;
}

export const ORG_DATA_FILES: OrgDataFile[] = [
  { org: 'AgriServ Financial', label: 'Loan Applications', fetch: fetchAgriservLoans },
  { org: 'AgriServ Financial', label: 'Borrower Records', fetch: fetchAgriservBorrowers },
  { org: 'AgriServ Financial', label: 'Rate Sheet', fetch: fetchAgriservRates },
  { org: 'AgriServ Financial', label: 'Collateral Inventory', fetch: fetchAgriservCollateral },
  { org: 'AgriServ Financial', label: 'Portfolio Summary', fetch: fetchAgriservPortfolio },
  { org: 'AgriServ Financial', label: 'Transactions', fetch: fetchAgriservTransactions },
  { org: 'Prairie Ridge Credit', label: 'Service Catalog', fetch: fetchPrairieRidgeServices },
  { org: 'Prairie Ridge Credit', label: 'Associations', fetch: fetchPrairieRidgeAssociations },
  { org: 'Prairie Ridge Credit', label: 'Transactions', fetch: fetchPrairieRidgeTransactions },
  { org: 'Central Farm Bank', label: 'Examination Criteria', fetch: fetchCentralFarmBankExaminationCriteria },
  { org: 'Central Farm Bank', label: 'Capital Requirements', fetch: fetchCentralFarmBankCapitalRequirements },
  { org: 'Central Farm Bank', label: 'Association Ratings', fetch: fetchCentralFarmBankRatings },
  { org: 'Central Farm Bank', label: 'Risk Limits', fetch: fetchCentralFarmBankRiskLimits },
  { org: 'Central Farm Bank', label: 'Transactions', fetch: fetchCentralFarmBankTransactions },
];
