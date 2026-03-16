import { Injectable } from '@nestjs/common';
import { DataLoaderService } from '@agent-communication/shared-protocols';
import { join } from 'path';

export interface Formulation {
  id: string;
  name: string;
  productCode: string;
  category: string;
  viscosityGrade: string;
  baseOil: string;
  additivePackage: string;
  specifications: string[];
  costPerGallon: number;
  minimumOrderGallons: number;
  leadTimeDays: number;
  [key: string]: unknown;
}

export interface OemSpecification {
  id: string;
  oemName: string;
  specCode: string;
  description: string;
  requiredTests: string[];
  viscosityRange: { min: number; max: number };
  qualifyingFormulations: string[];
  approvalDate: string;
  expiryDate: string;
  [key: string]: unknown;
}

interface OnboardingStep {
  id: string;
  stepNumber: number;
  title: string;
  description: string;
  requiredDocuments: string[];
  responsibleParty: string;
  estimatedDays: number;
  dependsOn: string[];
  [key: string]: unknown;
}

export interface PricingTier {
  id: string;
  productId: string;
  productCode: string;
  tierName: string;
  minVolumeGallons: number;
  maxVolumeGallons: number;
  pricePerGallon: number;
  discountPct: number;
  contractRequired: boolean;
  paymentTermsDays: number;
  [key: string]: unknown;
}

export interface Partner {
  id: string;
  companyName: string;
  partnerCode: string;
  status: string;
  tierLevel: string;
  primaryContact: string;
  email: string;
  annualVolumeGallons: number;
  contractExpiry: string | null;
  qualifiedProducts: string[];
  [key: string]: unknown;
}

export interface FormulationLookupResult {
  formulations: Formulation[];
  qualifyingSpecifications: OemSpecification[];
}

export interface SpecValidationResult {
  valid: boolean;
  specCode: string;
  productId: string;
  specFound: boolean;
  productFound: boolean;
  meetsSpec: boolean;
  specification: OemSpecification | null;
  formulation: Formulation | null;
  reason: string;
}

export interface OnboardingResult {
  companyName: string;
  partnerCode: string;
  steps: OnboardingStep[];
  totalEstimatedDays: number;
  initiatedAt: string;
}

@Injectable()
export class AscentekService {
  private readonly dataLoader: DataLoaderService;
  private static readonly ORG_ID = 'ascentek';

  constructor() {
    this.dataLoader = new DataLoaderService({
      baseDir: join(process.cwd(), 'data'),
      watch: process.env.NODE_ENV !== 'production',
    });
  }

  lookupFormulation(query: {
    category?: string;
    viscosityGrade?: string;
    specCode?: string;
  }): FormulationLookupResult {
    const catalogFile = this.dataLoader.loadFile<Formulation>(
      AscentekService.ORG_ID,
      'formulation-catalog',
    );

    let formulations = catalogFile.records;

    if (query.category) {
      formulations = formulations.filter((f) => f.category === query.category);
    }

    if (query.viscosityGrade) {
      formulations = formulations.filter(
        (f) => f.viscosityGrade === query.viscosityGrade,
      );
    }

    let qualifyingSpecifications: OemSpecification[] = [];

    if (query.specCode) {
      const specsFile = this.dataLoader.loadFile<OemSpecification>(
        AscentekService.ORG_ID,
        'oem-specifications',
      );

      const matchingSpec = specsFile.records.find(
        (s) => s.specCode === query.specCode,
      );

      if (matchingSpec) {
        qualifyingSpecifications = [matchingSpec];
        const qualifyingIds = new Set(matchingSpec.qualifyingFormulations);
        formulations = formulations.filter((f) => qualifyingIds.has(f.id));
      } else {
        formulations = [];
      }
    }

    return { formulations, qualifyingSpecifications };
  }

  validateSpec(params: {
    specCode: string;
    productId: string;
  }): SpecValidationResult {
    const specsFile = this.dataLoader.loadFile<OemSpecification>(
      AscentekService.ORG_ID,
      'oem-specifications',
    );

    const catalogFile = this.dataLoader.loadFile<Formulation>(
      AscentekService.ORG_ID,
      'formulation-catalog',
    );

    const specification =
      specsFile.records.find((s) => s.specCode === params.specCode) ?? null;
    const formulation =
      catalogFile.records.find((f) => f.id === params.productId) ?? null;

    const specFound = specification !== null;
    const productFound = formulation !== null;

    if (!specFound) {
      return {
        valid: false,
        specCode: params.specCode,
        productId: params.productId,
        specFound,
        productFound,
        meetsSpec: false,
        specification,
        formulation,
        reason: `OEM specification "${params.specCode}" not found in specification registry`,
      };
    }

    if (!productFound) {
      return {
        valid: false,
        specCode: params.specCode,
        productId: params.productId,
        specFound,
        productFound,
        meetsSpec: false,
        specification,
        formulation,
        reason: `Product "${params.productId}" not found in formulation catalog`,
      };
    }

    const meetsSpec = specification.qualifyingFormulations.includes(
      params.productId,
    );

    const reason = meetsSpec
      ? `Product ${formulation.name} (${formulation.productCode}) is qualified for ${specification.oemName} spec ${specification.specCode}`
      : `Product ${formulation.name} (${formulation.productCode}) does not meet ${specification.oemName} spec ${specification.specCode}`;

    return {
      valid: meetsSpec,
      specCode: params.specCode,
      productId: params.productId,
      specFound,
      productFound,
      meetsSpec,
      specification,
      formulation,
      reason,
    };
  }

  startOnboarding(params: {
    companyName: string;
    partnerCode: string;
  }): OnboardingResult {
    const checklistFile = this.dataLoader.loadFile<OnboardingStep>(
      AscentekService.ORG_ID,
      'onboarding-checklist',
    );

    const steps = checklistFile.records;
    const totalEstimatedDays = steps.reduce(
      (sum, step) => sum + step.estimatedDays,
      0,
    );

    return {
      companyName: params.companyName,
      partnerCode: params.partnerCode,
      steps,
      totalEstimatedDays,
      initiatedAt: new Date().toISOString(),
    };
  }

  getFormulationCatalog(): Formulation[] {
    const catalogFile = this.dataLoader.loadFile<Formulation>(
      AscentekService.ORG_ID,
      'formulation-catalog',
    );
    return catalogFile.records;
  }

  getOemSpecifications(): OemSpecification[] {
    const specsFile = this.dataLoader.loadFile<OemSpecification>(
      AscentekService.ORG_ID,
      'oem-specifications',
    );
    return specsFile.records;
  }

  getPricingTiers(productId?: string): PricingTier[] {
    const pricingFile = this.dataLoader.loadFile<PricingTier>(
      AscentekService.ORG_ID,
      'pricing-tiers',
    );

    if (productId) {
      return pricingFile.records.filter((p) => p.productId === productId);
    }

    return pricingFile.records;
  }

  getPartnerRegistry(): Partner[] {
    const partnersFile = this.dataLoader.loadFile<Partner>(
      AscentekService.ORG_ID,
      'partner-registry',
    );
    return partnersFile.records;
  }
}
