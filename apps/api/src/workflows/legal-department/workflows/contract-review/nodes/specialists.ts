/**
 * Contract-review specialist nodes — one per legal domain.
 *
 * Each specialist receives the clause map from state, analyzes clauses
 * within its domain expertise, and returns ClauseAnnotation[] stored
 * under its specialist key. The factory pattern keeps all 8 specialists
 * in one file since they differ only in their domain prompt.
 *
 * These are contract-review-specific nodes. The document-onboarding
 * specialists live in ../../../nodes/ and are completely separate.
 */
import { LegalDepartmentState } from '../../../legal-department.state';
import type { ClauseAnnotation } from '../../../legal-department.types';
import { LLMHttpClientService } from '../../../../shared/services/llm-http-client.service';
import { ObservabilityService } from '../../../../shared/services/observability.service';
import { runContractReviewSpecialist } from '../../../nodes/specialist-utils';
import type { WorkflowRagService } from '../../../../shared/services/workflow-rag.service';

const AGENT_SLUG = 'legal-department';

/** Collection slugs per specialist — same mapping as document-onboarding. */
const SPECIALIST_COLLECTIONS: Record<string, string[]> = {
  contract: ['law-contracts-hybrid'],
  compliance: ['law-firm-policies-attributed'],
  ip: ['law-contracts-hybrid', 'law-firm-policies-attributed'],
  privacy: ['law-firm-policies-attributed', 'law-contracts-hybrid'],
  employment: ['law-contracts-hybrid'],
  corporate: ['law-firm-policies-attributed', 'law-estate-planning-attributed'],
  litigation: ['law-litigation-cross-reference'],
  realEstate: ['law-estate-planning-attributed'],
};

/** Domain prompt configuration for a single specialist. */
interface SpecialistConfig {
  /** Key in specialistOutputs (e.g. 'contract', 'compliance') */
  key: string;
  /** Human-readable label for observability events */
  label: string;
  /** Node name for callerName (e.g. 'contract-agent') */
  nodeName: string;
  /** Domain-specific system prompt preamble */
  domainPrompt: string;
}

const SPECIALIST_CONFIGS: SpecialistConfig[] = [
  {
    key: 'contract',
    label: 'Contract Specialist',
    nodeName: 'contract-agent',
    domainPrompt:
      'You are a Contract Analysis specialist. Analyze each clause for risks related to contract terms, obligations, indemnification, limitation of liability, termination rights, and governing law. Flag one-sided provisions, unusual terms, and missing protections.',
  },
  {
    key: 'compliance',
    label: 'Compliance Specialist',
    nodeName: 'compliance-agent',
    domainPrompt:
      'You are a Regulatory Compliance specialist. Analyze each clause for compliance risks related to regulatory requirements, reporting obligations, audit rights, and compliance representations. Flag clauses that may violate regulatory standards.',
  },
  {
    key: 'ip',
    label: 'IP Specialist',
    nodeName: 'ip-agent',
    domainPrompt:
      'You are an Intellectual Property specialist. Analyze each clause for IP risks related to ownership, assignment, licensing, work-for-hire, background IP, and IP indemnification. Flag overly broad IP assignments and missing IP protections.',
  },
  {
    key: 'privacy',
    label: 'Privacy Specialist',
    nodeName: 'privacy-agent',
    domainPrompt:
      'You are a Data Privacy specialist. Analyze each clause for privacy risks related to data collection, processing, storage, transfer, GDPR/CCPA compliance, data breach notification, and data subject rights. Flag missing privacy safeguards.',
  },
  {
    key: 'employment',
    label: 'Employment Specialist',
    nodeName: 'employment-agent',
    domainPrompt:
      'You are an Employment Law specialist. Analyze each clause for employment risks related to compensation, benefits, non-compete, non-solicitation, at-will provisions, and termination. Flag unfair employment terms and missing worker protections.',
  },
  {
    key: 'corporate',
    label: 'Corporate Specialist',
    nodeName: 'corporate-agent',
    domainPrompt:
      'You are a Corporate Governance specialist. Analyze each clause for corporate governance risks related to authority, representations, warranties, board approvals, and organizational matters. Flag unauthorized commitments and missing corporate protections.',
  },
  {
    key: 'litigation',
    label: 'Litigation Specialist',
    nodeName: 'litigation-agent',
    domainPrompt:
      'You are a Litigation Risk specialist. Analyze each clause for litigation risks related to dispute resolution, arbitration, jurisdiction, venue, waiver of jury trial, class action waivers, and statute of limitations. Flag provisions that increase litigation exposure.',
  },
  {
    key: 'realEstate',
    label: 'Real Estate Specialist',
    nodeName: 'real-estate-agent',
    domainPrompt:
      'You are a Real Estate specialist. Analyze each clause for real estate risks related to lease terms, rent escalation, maintenance obligations, property condition, use restrictions, and default remedies. Flag unfavorable real estate provisions.',
  },
];

/** Type for specialist node functions that return ClauseAnnotation[]. */
export type ContractReviewSpecialistNode = (
  state: LegalDepartmentState,
) => Promise<Partial<LegalDepartmentState>>;

/** Map of specialist key → node function. */
export type ContractReviewSpecialistMap = Record<
  string,
  ContractReviewSpecialistNode
>;

/**
 * Create all 8 contract-review specialist nodes.
 *
 * Each specialist produces ClauseAnnotation[] stored under its key in
 * specialistOutputs. The annotations are stored as unknown since the
 * specialistOutputs type union expects the document-onboarding output
 * types — the orchestrator and synthesis nodes in this workflow know
 * to treat the values as ClauseAnnotation[].
 */
export function createContractReviewSpecialists(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
  workflowRag?: WorkflowRagService,
): ContractReviewSpecialistMap {
  const map: ContractReviewSpecialistMap = {};

  for (const config of SPECIALIST_CONFIGS) {
    map[config.key] = createSpecialistNode(
      config,
      llmClient,
      observability,
      workflowRag,
    );
  }

  return map;
}

function createSpecialistNode(
  config: SpecialistConfig,
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
  workflowRag?: WorkflowRagService,
): ContractReviewSpecialistNode {
  return async function specialistNode(
    state: LegalDepartmentState,
  ): Promise<Partial<LegalDepartmentState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `${config.label}: Analyzing clauses`,
      { step: `${config.nodeName}_contract_review`, progress: 40 },
    );

    try {
      const annotations: ClauseAnnotation[] = await runContractReviewSpecialist(
        {
          llmClient,
          observability,
          state,
          domainPrompt: config.domainPrompt,
          callerName: `${AGENT_SLUG}:${config.nodeName}`,
          progressLabel: config.label,
          workflowRag,
          collectionSlugs: SPECIALIST_COLLECTIONS[config.key],
        },
      );

      return {
        specialistOutputs: {
          ...state.specialistOutputs,
          [config.key]: annotations as unknown,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      await observability.emitFailed(
        ctx,
        ctx.conversationId,
        `${config.label} failed: ${errorMessage}`,
        Date.now() - state.startedAt,
      );

      return {
        error: `${config.label}: ${errorMessage}`,
        status: 'failed',
      };
    }
  };
}

/** Export configs for testing. */
export { SPECIALIST_CONFIGS };
