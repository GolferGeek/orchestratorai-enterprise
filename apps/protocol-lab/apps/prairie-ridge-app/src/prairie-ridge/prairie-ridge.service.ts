import { Injectable } from '@nestjs/common';
import { DataLoaderService } from '@agent-communication/shared-protocols';
import { join } from 'path';

interface ComplianceRule {
  id: string;
  ruleCode: string;
  title: string;
  description: string;
  category: string;
  threshold: number | null;
  requiredFields: string[];
  severity: string;
  [key: string]: unknown;
}

interface HelpdeskArticle {
  id: string;
  title: string;
  category: string;
  symptoms: string[];
  resolution: string;
  escalationPath: string;
  avgResolutionMinutes: number;
  [key: string]: unknown;
}

export interface Association {
  id: string;
  name: string;
  type: string;
  region: string;
  charterNumber: string;
  status: string;
  joinedDate: string;
  primaryContact: string;
  annualVolume: number;
  [key: string]: unknown;
}

export interface ServiceCatalogItem {
  id: string;
  name: string;
  description: string;
  category: string;
  slaHours: number;
  availableTo: string[];
  monthlyFee: number | null;
  [key: string]: unknown;
}

export interface ComplianceResult {
  approved: boolean;
  score: number;
  rulesChecked: number;
  rulesPassed: number;
  results: Array<{
    ruleCode: string;
    title: string;
    passed: boolean;
    reason: string;
    severity: string;
  }>;
  citations: Array<{
    rule: string;
    source: string;
  }>;
}

export interface HelpdeskTriageResult {
  matched: boolean;
  article: {
    id: string;
    title: string;
    resolution: string;
    escalationPath: string;
    avgResolutionMinutes: number;
  } | null;
  confidence: number;
}

export interface QuarterlyReportResult {
  quarter: string;
  associations: Association[];
  generatedAt: string;
}

@Injectable()
export class PrairieRidgeService {
  private readonly dataLoader: DataLoaderService;
  private static readonly ORG_ID = 'prairie-ridge';

  constructor() {
    this.dataLoader = new DataLoaderService({
      baseDir: join(process.cwd(), 'data'),
      watch: process.env.NODE_ENV !== 'production',
    });
  }

  validateLoanCompliance(loanData: Record<string, unknown>): ComplianceResult {
    const rulesFile = this.dataLoader.loadFile<ComplianceRule>(
      PrairieRidgeService.ORG_ID,
      'compliance-rules',
    );

    const results: ComplianceResult['results'] = [];
    const citations: ComplianceResult['citations'] = [];

    for (const rule of rulesFile.records) {
      let passed = true;
      let reason = `Meets requirements for ${rule.title}`;

      // Check required fields are present in loanData
      if (rule.requiredFields && rule.requiredFields.length > 0) {
        const missingFields = rule.requiredFields.filter(
          (field) => !(field in loanData) || loanData[field] === null || loanData[field] === undefined,
        );
        if (missingFields.length > 0) {
          passed = false;
          reason = `Missing required fields: ${missingFields.join(', ')}`;
        }
      }

      // Check threshold against amount if rule has a numeric threshold
      if (passed && rule.threshold !== null) {
        const amount = loanData['amount'];
        if (typeof amount === 'number' && rule.category === 'collateral' && amount > rule.threshold) {
          // Threshold-based rules: if amount exceeds threshold, required fields must be present
          // (already checked above, so if we're still passing here it's fine)
        } else if (typeof amount === 'number' && rule.category === 'credit') {
          const creditScore = loanData['creditScore'];
          if (typeof creditScore === 'number' && creditScore < rule.threshold) {
            const missingReviewFields = (rule.requiredFields ?? []).filter(
              (field) => !(field in loanData) || loanData[field] === null || loanData[field] === undefined,
            );
            if (missingReviewFields.length > 0) {
              passed = false;
              reason = `Credit score ${creditScore} below threshold ${rule.threshold}; missing: ${missingReviewFields.join(', ')}`;
            }
          }
        }
      }

      results.push({
        ruleCode: rule.ruleCode,
        title: rule.title,
        passed,
        reason,
        severity: rule.severity,
      });

      citations.push({
        rule: rule.ruleCode,
        source: `compliance-rules.json#${rule.id}`,
      });
    }

    const rulesPassed = results.filter((r) => r.passed).length;
    const rulesChecked = results.length;
    const criticalFailures = results.filter((r) => !r.passed && r.severity === 'critical').length;
    const approved = criticalFailures === 0 && rulesPassed === rulesChecked;
    const score = rulesChecked > 0 ? Math.round((rulesPassed / rulesChecked) * 100) : 0;

    return {
      approved,
      score,
      rulesChecked,
      rulesPassed,
      results,
      citations,
    };
  }

  triageHelpdeskTicket(ticketData: {
    category?: string;
    symptoms?: string[];
    description?: string;
  }): HelpdeskTriageResult {
    const kbFile = this.dataLoader.loadFile<HelpdeskArticle>(
      PrairieRidgeService.ORG_ID,
      'helpdesk-kb',
    );

    const incomingSymptoms: string[] = ticketData.symptoms ?? [];
    const description: string = ticketData.description ?? '';
    const category: string = ticketData.category ?? '';

    let bestMatch: HelpdeskArticle | null = null;
    let bestScore = 0;

    for (const article of kbFile.records) {
      let score = 0;

      // Category match
      if (category && article.category === category) {
        score += 20;
      }

      // Symptom matching via substring/includes
      for (const kbSymptom of article.symptoms) {
        const kbLower = kbSymptom.toLowerCase();

        // Match against incoming symptoms
        for (const incomingSymptom of incomingSymptoms) {
          const incomingLower = incomingSymptom.toLowerCase();
          if (kbLower.includes(incomingLower) || incomingLower.includes(kbLower)) {
            score += 30;
          }
        }

        // Match against description
        if (description && description.toLowerCase().includes(kbLower)) {
          score += 15;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = article;
      }
    }

    // Confidence is 0-1 based on score (max reasonable score ~100)
    const confidence = Math.min(bestScore / 100, 1);
    const matched = bestMatch !== null && confidence > 0;

    return {
      matched,
      article: matched && bestMatch
        ? {
            id: bestMatch.id,
            title: bestMatch.title,
            resolution: bestMatch.resolution,
            escalationPath: bestMatch.escalationPath,
            avgResolutionMinutes: bestMatch.avgResolutionMinutes,
          }
        : null,
      confidence,
    };
  }

  generateQuarterlyReport(params: {
    quarter: string;
    associationIds?: string[];
  }): QuarterlyReportResult {
    const assocFile = this.dataLoader.loadFile<Association>(
      PrairieRidgeService.ORG_ID,
      'associations',
    );

    let associations = assocFile.records;

    if (params.associationIds && params.associationIds.length > 0) {
      associations = associations.filter((a) =>
        params.associationIds!.includes(a.id),
      );
    }

    return {
      quarter: params.quarter,
      associations,
      generatedAt: new Date().toISOString(),
    };
  }

  getServiceCatalog(): ServiceCatalogItem[] {
    const catalogFile = this.dataLoader.loadFile<ServiceCatalogItem>(
      PrairieRidgeService.ORG_ID,
      'service-catalog',
    );
    return catalogFile.records;
  }

  getAssociations(): Association[] {
    const assocFile = this.dataLoader.loadFile<Association>(
      PrairieRidgeService.ORG_ID,
      'associations',
    );
    return assocFile.records;
  }
}
