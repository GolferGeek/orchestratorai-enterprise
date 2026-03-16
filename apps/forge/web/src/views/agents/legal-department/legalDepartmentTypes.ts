/**
 * Legal Department AI Types
 *
 * Types for the legal document analysis system
 */

// =============================================================================
// Document Types
// =============================================================================

export type DocumentType = 'pdf' | 'docx' | 'image';

export interface UploadedDocument {
  id: string;
  name: string;
  type: DocumentType;
  size: number;
  uploadedAt: string;
  url?: string;
}

// =============================================================================
// Analysis Status Types
// =============================================================================

export type AnalysisPhase =
  | 'initializing'
  | 'uploading'
  | 'extracting'
  | 'analyzing'
  | 'identifying_risks'
  | 'generating_recommendations'
  | 'completed'
  | 'failed';

export type AnalysisStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface AnalysisProgress {
  phase: AnalysisPhase;
  status: AnalysisStatus;
  progress: {
    current: number;
    total: number;
    percentage: number;
  };
  currentStep?: string;
  error?: string;
}

// =============================================================================
// Legal Metadata Types (from Document Processing)
// =============================================================================

export type LegalDocumentType =
  | 'contract'
  | 'agreement'
  | 'amendment'
  | 'pleading'
  | 'motion'
  | 'brief'
  | 'memorandum'
  | 'correspondence'
  | 'notice'
  | 'disclosure'
  | 'policy'
  | 'regulation'
  | 'statute'
  | 'other';

export type SectionType =
  | 'preamble'
  | 'recitals'
  | 'definitions'
  | 'terms'
  | 'warranties'
  | 'covenants'
  | 'conditions'
  | 'termination'
  | 'dispute_resolution'
  | 'miscellaneous'
  | 'signature_block'
  | 'other';

export type PartyType =
  | 'individual'
  | 'corporation'
  | 'llc'
  | 'partnership'
  | 'trust'
  | 'government'
  | 'nonprofit'
  | 'other';

export type PartyRole =
  | 'buyer'
  | 'seller'
  | 'lessor'
  | 'lessee'
  | 'lender'
  | 'borrower'
  | 'employer'
  | 'employee'
  | 'contractor'
  | 'client'
  | 'vendor'
  | 'licensor'
  | 'licensee'
  | 'plaintiff'
  | 'defendant'
  | 'other';

export type DateType =
  | 'effective_date'
  | 'execution_date'
  | 'expiration_date'
  | 'termination_date'
  | 'renewal_date'
  | 'filing_date'
  | 'other';

export interface DocumentSection {
  title: string;
  type: SectionType;
  startIndex: number;
  endIndex: number;
  content: string;
  confidence: number;
  clauses?: DocumentClause[];
}

export interface DocumentClause {
  title?: string;
  startIndex: number;
  endIndex: number;
  content: string;
  confidence: number;
}

export interface SignatureBlock {
  partyName?: string;
  signerName?: string;
  signerTitle?: string;
  signatureDate?: string;
  startIndex: number;
  endIndex: number;
  content: string;
  confidence: number;
}

export interface ExtractedDate {
  originalText: string;
  normalizedDate: string;
  dateType: DateType;
  confidence: number;
  position: number;
  context?: string;
}

export interface ExtractedParty {
  name: string;
  type: PartyType;
  role?: PartyRole;
  position: number;
  context?: string;
  confidence: number;
  identifiers?: {
    address?: string;
    registrationNumber?: string;
    taxId?: string;
    [key: string]: unknown;
  };
}

export interface DocumentTypeClassification {
  type: LegalDocumentType;
  confidence: number;
  alternatives?: Array<{
    type: LegalDocumentType;
    confidence: number;
  }>;
  reasoning?: string;
}

export interface SectionDetectionResult {
  sections: DocumentSection[];
  confidence: number;
  structureType: 'formal' | 'informal' | 'mixed' | 'unstructured';
}

export interface SignatureDetectionResult {
  signatures: SignatureBlock[];
  confidence: number;
  partyCount: number;
}

export interface DateExtractionResult {
  dates: ExtractedDate[];
  primaryDate?: ExtractedDate;
  confidence: number;
}

export interface PartyExtractionResult {
  parties: ExtractedParty[];
  contractingParties?: [ExtractedParty, ExtractedParty];
  confidence: number;
}

export interface ConfidenceScore {
  overall: number;
  breakdown: {
    documentType?: number;
    sections?: number;
    signatures?: number;
    dates?: number;
    parties?: number;
  };
  factors: {
    textQuality: number;
    structureClarity: number;
    dataCompleteness: number;
  };
  warnings: string[];
}

export interface LegalDocumentMetadata {
  documentType: DocumentTypeClassification;
  sections: SectionDetectionResult;
  signatures: SignatureDetectionResult;
  dates: DateExtractionResult;
  parties: PartyExtractionResult;
  confidence: ConfidenceScore;
  extractedAt: string;
}

// =============================================================================
// Contract Analysis Types (M2 Specialist Output)
// =============================================================================

export interface ContractClauseTerm {
  duration: string;
  startDate?: string;
  endDate?: string;
  renewalTerms?: string;
}

export interface ContractClauseConfidentiality {
  period: string;
  scope: string;
  exceptions?: string[];
}

export interface ContractClauseGoverningLaw {
  jurisdiction: string;
  disputeResolution?: string;
}

export interface ContractClauseTermination {
  forCause: string;
  forConvenience?: string;
  noticePeriod?: string;
}

export interface ContractClauses {
  term?: ContractClauseTerm;
  confidentiality?: ContractClauseConfidentiality;
  governingLaw?: ContractClauseGoverningLaw;
  termination?: ContractClauseTermination;
  indemnification?: {
    scope: string;
    limitations?: string;
  };
  liabilityLimitation?: {
    cap?: string;
    exclusions?: string[];
  };
}

export interface ContractRiskFlag {
  flag: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  recommendation?: string;
}

export interface ContractTypeInfo {
  type: 'nda' | 'msa' | 'sla' | 'employment' | 'license' | 'other';
  subtype?: string;
  isMutual: boolean;
}

export interface ContractAnalysisOutput {
  clauses: ContractClauses;
  riskFlags: ContractRiskFlag[];
  contractType: ContractTypeInfo;
  confidence: number;
  summary: string;
}

// =============================================================================
// IP Analysis Types (M5 Specialist Output)
// =============================================================================

export interface IpAnalysisOutput {
  ownership: {
    owner: string;
    ownershipType: string;
    workForHire?: {
      isWorkForHire: boolean;
      details: string;
    };
    assignments?: string[];
    clear: boolean;
    details: string;
  };
  licensing?: {
    licenseType: string;
    scope: string;
    exclusive: boolean;
    territory?: string;
    term?: string;
    sublicensing?: string;
    details: string;
  };
  ipTypes: Array<{
    type: 'patent' | 'trademark' | 'copyright' | 'trade-secret' | 'other';
    description: string;
  }>;
  warranties?: {
    nonInfringement?: boolean;
    authority?: boolean;
    details: string;
  };
  riskFlags: Array<{
    flag: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    recommendation?: string;
  }>;
  confidence: number;
  summary: string;
}

// =============================================================================
// Privacy Analysis Types (M6 Specialist Output)
// =============================================================================

export interface PrivacyAnalysisOutput {
  dataHandling: {
    dataTypes: string[];
    purposes: string[];
    retentionPeriod?: string;
    dataLocation?: string;
    details: string;
  };
  gdprCompliance?: {
    applicable: boolean;
    legalBasis?: string;
    dataSubjectRights?: string[];
    crossBorderTransfers?: {
      applicable: boolean;
      mechanism?: string;
      details: string;
    };
    compliant: boolean;
    details: string;
  };
  ccpaCompliance?: {
    applicable: boolean;
    consumerRights?: string[];
    doNotSell?: boolean;
    compliant: boolean;
    details: string;
  };
  security?: {
    measures: string[];
    adequate: boolean;
    details: string;
  };
  riskFlags: Array<{
    flag: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    recommendation?: string;
  }>;
  confidence: number;
  summary: string;
}

// =============================================================================
// Employment Analysis Types (M7 Specialist Output)
// =============================================================================

export interface EmploymentAnalysisOutput {
  employmentTerms: {
    type: 'at-will' | 'fixed-term' | 'contractor' | 'other';
    position?: string;
    compensation?: {
      salary?: string;
      bonus?: string;
      equity?: string;
      benefits?: string[];
    };
    startDate?: string;
    duration?: string;
    details: string;
  };
  restrictiveCovenants?: {
    nonCompete?: {
      exists: boolean;
      duration?: string;
      territory?: string;
      enforceable: boolean;
      details: string;
    };
    nonSolicitation?: {
      exists: boolean;
      scope?: string;
      duration?: string;
      details: string;
    };
    confidentiality?: {
      exists: boolean;
      duration?: string;
      details: string;
    };
  };
  termination?: {
    forCause?: string;
    noticePeriod?: string;
    severance?: string;
    details: string;
  };
  riskFlags: Array<{
    flag: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    recommendation?: string;
  }>;
  confidence: number;
  summary: string;
}

// =============================================================================
// Corporate Analysis Types (M8 Specialist Output)
// =============================================================================

export interface CorporateAnalysisOutput {
  documentType: {
    type: 'resolution' | 'bylaws' | 'articles' | 'minutes' | 'filing' | 'other';
    purpose: string;
    details: string;
  };
  governance?: {
    action?: string;
    quorum?: {
      required: string;
      met: boolean;
      details: string;
    };
    votingResults?: {
      required: string;
      actual: string;
      passed: boolean;
    };
    authority?: string[];
  };
  compliance?: {
    filingDeadlines?: Array<{
      deadline: string;
      requirement: string;
      status: 'upcoming' | 'current' | 'overdue' | 'unknown';
    }>;
    requiredApprovals?: string[];
    regulatoryRequirements?: string[];
    details: string;
  };
  entityInfo?: {
    entityName?: string;
    entityType?: string;
    jurisdiction?: string;
    details: string;
  };
  riskFlags: Array<{
    flag: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    recommendation?: string;
  }>;
  confidence: number;
  summary: string;
}

// =============================================================================
// Litigation Analysis Types (M9 Specialist Output)
// =============================================================================

export interface LitigationAnalysisOutput {
  caseInfo: {
    caption?: string;
    court?: string;
    caseNumber?: string;
    filingDate?: string;
    details: string;
  };
  parties: {
    plaintiffs: string[];
    defendants: string[];
    otherParties?: string[];
  };
  claims: Array<{
    claim: string;
    description: string;
  }>;
  reliefSought?: {
    monetary?: string;
    injunctive?: string;
    other?: string[];
    details: string;
  };
  deadlines: Array<{
    deadline: string;
    description: string;
    calculatedDate?: string;
    daysRemaining?: number;
    rule?: string;
  }>;
  riskAssessment?: {
    overallRisk: 'low' | 'medium' | 'high' | 'critical';
    details: string;
  };
  riskFlags: Array<{
    flag: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    recommendation?: string;
  }>;
  confidence: number;
  summary: string;
}

// =============================================================================
// Real Estate Analysis Types (M10 Specialist Output)
// =============================================================================

export interface RealEstateAnalysisOutput {
  propertyInfo: {
    address?: string;
    description?: string;
    propertyType?: 'commercial' | 'residential' | 'industrial' | 'land' | 'mixed-use' | 'other';
    legalDescription?: string;
    details: string;
  };
  leaseTerms?: {
    landlord?: string;
    tenant?: string;
    term?: string;
    rent?: {
      baseRent: string;
      escalations?: string;
      additionalCharges?: string[];
    };
    permittedUse?: string;
    renewalOptions?: string;
    securityDeposit?: string;
    details: string;
  };
  titleIssues?: {
    exceptions: Array<{
      type: string;
      description: string;
      requiresAction: boolean;
    }>;
    encumbrances: Array<{
      type: string;
      description: string;
      amount?: string;
    }>;
    clearTitle: boolean;
    details: string;
  };
  warranties?: {
    propertyCondition?: string;
    environmentalCompliance?: string;
    zoningCompliance?: string;
    details: string;
  };
  riskFlags: Array<{
    flag: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    recommendation?: string;
  }>;
  confidence: number;
  summary: string;
}

// =============================================================================
// Compliance Analysis Types (M4 Specialist Output)
// =============================================================================

export interface ComplianceAnalysisOutput {
  policyChecks: {
    termLimit?: {
      compliant?: boolean;
      contractTerm: string;
      maxAllowedTerm: string;
      details: string;
      [key: string]: unknown;
    };
    jurisdiction?: {
      compliant?: boolean;
      contractJurisdiction: string;
      allowedJurisdictions: string[];
      details: string;
      [key: string]: unknown;
    };
    approvalAuthority?: {
      contractValue?: string;
      requiredApprover: string;
      details: string;
    };
  };
  regulatoryCompliance: {
    regulations: string[];
    status: 'compliant' | 'non-compliant' | 'review-required' | 'not-applicable';
    details: string;
  };
  regulatoryFrameworks?: Array<{
    framework: string;
    applicable: boolean;
    details: string;
  }>;
  complianceStatus?: {
    overall: 'compliant' | 'non-compliant' | 'partial' | 'unknown';
    details: string;
  };
  requirements?: Array<{
    requirement: string;
    status: 'met' | 'not-met' | 'partial' | 'unknown';
    details: string;
  }>;
  riskFlags: Array<{
    flag: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    recommendation?: string;
  }>;
  confidence: number;
  summary: string;
}

// =============================================================================
// Specialist Outputs (All M2-M10)
// =============================================================================

export interface SpecialistOutputs {
  contract?: ContractAnalysisOutput;
  compliance?: ComplianceAnalysisOutput;
  ip?: IpAnalysisOutput;
  privacy?: PrivacyAnalysisOutput;
  employment?: EmploymentAnalysisOutput;
  corporate?: CorporateAnalysisOutput;
  litigation?: LitigationAnalysisOutput;
  realEstate?: RealEstateAnalysisOutput;
}

// =============================================================================
// Analysis Results Types
// =============================================================================

export interface LegalFinding {
  id: string;
  type: 'clause' | 'obligation' | 'right' | 'term' | 'condition';
  category: string;
  summary: string;
  details: string;
  location: {
    page?: number;
    section?: string;
    paragraph?: string;
  };
  severity?: 'low' | 'medium' | 'high';
  confidence: number;
}

export interface LegalRisk {
  id: string;
  category: string;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  likelihood: 'low' | 'medium' | 'high';
  impact: string;
  mitigation: string;
  relatedFindings: string[];
  confidence: number;
}

export interface LegalRecommendation {
  id: string;
  category: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  rationale: string;
  suggestedAction: string;
  relatedRisks: string[];
  estimatedEffort?: string;
}

export interface AnalysisResults {
  taskId: string;
  documentId: string;
  documentName: string;
  summary: string;
  findings: LegalFinding[];
  risks: LegalRisk[];
  recommendations: LegalRecommendation[];
  metadata: {
    analyzedAt: string;
    processingTime?: number;
    model?: string;
    confidence: number;
  };
  legalMetadata?: LegalDocumentMetadata;
  specialistOutputs?: SpecialistOutputs;
}

// =============================================================================
// Request/Response DTOs
// =============================================================================

export interface CreateAnalysisRequest {
  documentId: string;
  documentName: string;
  documentType: DocumentType;
  analysisType?: 'contract' | 'compliance' | 'general';
  options?: {
    extractKeyTerms?: boolean;
    identifyRisks?: boolean;
    generateRecommendations?: boolean;
    compareWithTemplate?: boolean;
  };
}

export interface AnalysisTaskResponse {
  taskId: string;
  status: AnalysisStatus;
  phase?: AnalysisPhase;
  results?: AnalysisResults;
  error?: string;
  duration?: number;
}

// =============================================================================
// SSE Message Types
// =============================================================================

export type SSEMessageType =
  | 'phase_changed'
  | 'progress_updated'
  | 'finding_discovered'
  | 'risk_identified'
  | 'recommendation_generated'
  | 'error';

export interface SSEPhaseChangedMessage {
  type: 'phase_changed';
  taskId: string;
  phase: AnalysisPhase;
  progress: {
    current: number;
    total: number;
    percentage: number;
  };
}

export interface SSEProgressUpdatedMessage {
  type: 'progress_updated';
  taskId: string;
  currentStep: string;
  progress: {
    current: number;
    total: number;
    percentage: number;
  };
}

export interface SSEFindingDiscoveredMessage {
  type: 'finding_discovered';
  taskId: string;
  finding: LegalFinding;
}

export interface SSERiskIdentifiedMessage {
  type: 'risk_identified';
  taskId: string;
  risk: LegalRisk;
}

export interface SSERecommendationGeneratedMessage {
  type: 'recommendation_generated';
  taskId: string;
  recommendation: LegalRecommendation;
}

export interface SSEErrorMessage {
  type: 'error';
  taskId: string;
  message: string;
  recoverable: boolean;
}

export type SSEMessage =
  | SSEPhaseChangedMessage
  | SSEProgressUpdatedMessage
  | SSEFindingDiscoveredMessage
  | SSERiskIdentifiedMessage
  | SSERecommendationGeneratedMessage
  | SSEErrorMessage;

// =============================================================================
// Routing Types (from CLO Agent)
// =============================================================================

export type SpecialistType =
  | 'contract'
  | 'compliance'
  | 'ip'
  | 'privacy'
  | 'employment'
  | 'corporate'
  | 'litigation'
  | 'real_estate'
  | 'unknown';

export interface RoutingDecision {
  /** Primary specialist to route to */
  specialist: SpecialistType;
  /** List of specialists for multi-agent mode */
  specialists?: SpecialistType[];
  /** Confidence in routing decision (0-1) */
  confidence: number;
  /** Reasoning for the routing decision */
  reasoning: string;
  /** Alternative specialists */
  alternatives?: SpecialistType[];
  /** Document categories identified */
  categories: string[];
  /** Multi-agent mode enabled */
  multiAgent?: boolean;
}

export type SpecialistStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface SpecialistState {
  slug: SpecialistType;
  name: string;
  status: SpecialistStatus;
  progress?: number;
  error?: string;
}

// =============================================================================
// HITL Types
// =============================================================================

export type HITLAction = 'approve' | 'reject' | 'request_reanalysis';

export interface HITLDecision {
  action: HITLAction;
  comments?: string;
  specialist?: SpecialistType;
  timestamp: string;
  userId: string;
}

// =============================================================================
// Conversation State Types
// =============================================================================

export interface ConversationRequest {
  id: string;
  message: string;
  attachedDocument?: {
    file: File;
    name: string;
    size: number;
    type: string;
  };
  timestamp: string;
}

export interface ConversationState {
  /** Current request being processed */
  currentRequest?: ConversationRequest;
  /** Routing decision from CLO */
  routingDecision?: RoutingDecision;
  /** Status of each specialist */
  specialistStates: Map<SpecialistType, SpecialistState>;
  /** Analysis results */
  results?: AnalysisResults;
  /** Is analysis in progress */
  isProcessing: boolean;
  /** Error if any */
  error?: string;
}

// =============================================================================
// UI State Types
// =============================================================================

export interface LegalDepartmentUIState {
  currentView: 'upload' | 'analysis' | 'results';
  selectedDocumentId?: string;
  showDetailedFindings: boolean;
  showRiskMatrix: boolean;
  filterSeverity?: 'low' | 'medium' | 'high' | 'critical';
}
