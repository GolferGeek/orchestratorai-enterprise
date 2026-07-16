import { LegalDepartmentState } from '../legal-department.state';
import { ObservabilityService } from '../../shared/services/observability.service';

/**
 * Routing Decision Output Interface
 *
 * Output from the CLO routing node that determines which specialist(s)
 * should analyze the document.
 *
 * M3-M10: Single specialist routing (specialist field)
 * M11+: Multi-agent routing (specialists array)
 */
export interface RoutingDecision {
  /** Primary specialist to route to (M3-M10 single-agent mode) */
  specialist: SpecialistType;
  /** List of specialists to invoke (M11+ multi-agent mode) */
  specialists?: SpecialistType[];
  /** Confidence in routing decision (0-1) */
  confidence: number;
  /** Reasoning for the routing decision */
  reasoning: string;
  /** Alternative specialists that could handle this (for future multi-agent) */
  alternatives?: SpecialistType[];
  /** Document categories identified */
  categories: string[];
  /** Multi-agent mode enabled */
  multiAgent?: boolean;
  /**
   * Per-document type map (Phase 3). Maps document name → detected type
   * so the review modal can show per-document type attribution.
   */
  documentTypeMap?: Record<string, string>;
}

/**
 * Available specialist types
 * M3: Only 'contract' exists
 * M4-M10: Will add compliance, ip, privacy, employment, corporate, litigation, real_estate
 */
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

/**
 * CLO Routing Node - M3 Orchestration
 *
 * Purpose: Route incoming documents to the appropriate specialist agent(s).
 *
 * This orchestration node:
 * 1. Analyzes document type from legal metadata
 * 2. Examines user message for routing hints
 * 3. Applies keyword matching rules
 * 4. Determines which specialist(s) should handle the document
 *
 * M3 Architecture:
 * - Simple if/else routing based on documentType
 * - Keyword matching in user message
 * - Default to contract-agent (only specialist available)
 * - No LLM call needed for basic routing
 *
 * Future M11:
 * - Can return multiple specialists for complex documents
 * - LLM-assisted routing for ambiguous cases
 */
export function createCloRoutingNode(observability: ObservabilityService) {
  return async function cloRoutingNode(
    state: LegalDepartmentState,
  ): Promise<Partial<LegalDepartmentState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      'CLO: Analyzing document for routing',
      { step: 'clo_routing', progress: 20 },
    );

    try {
      // Phase 3: Union of document types across all documents.
      // Use the first metadata's type as the primary signal; combine all
      // document content for keyword analysis.
      const primaryDocumentType =
        state.documentsMetadata?.[0]?.documentType?.type;
      const userMessage = state.userMessage?.toLowerCase() || '';

      // Combined document text for keyword detection across all documents.
      const documentText = (state.documents ?? [])
        .map((d) => d.content)
        .join('\n\n');

      // Build a per-document type map for the RoutingDecision so the review
      // modal can show type attribution per file.
      const documentTypeMap: Record<string, string> = {};
      (state.documents ?? []).forEach((doc, i) => {
        const meta = state.documentsMetadata?.[i];
        if (meta?.documentType?.type) {
          documentTypeMap[doc.name] = meta.documentType.type;
        }
      });

      const routingDecision = determineRouting(
        primaryDocumentType,
        userMessage,
        documentText,
        documentTypeMap,
      );

      await observability.emitProgress(
        ctx,
        ctx.conversationId,
        `CLO: Routing to ${routingDecision.specialist} specialist`,
        {
          step: 'clo_routing_complete',
          progress: 25,
          specialist: routingDecision.specialist,
          confidence: routingDecision.confidence,
        },
      );

      return {
        routingDecision,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      await observability.emitFailed(
        ctx,
        ctx.conversationId,
        `CLO Routing failed: ${errorMessage}`,
        Date.now() - state.startedAt,
      );

      return {
        error: `CLO Routing: ${errorMessage}`,
        status: 'failed',
      };
    }
  };
}

/**
 * Determine routing based on document type and user message
 *
 * Routing Rules:
 * M3-M10: Single specialist routing
 * 1. Check document type from metadata
 * 2. Check keywords in user message
 * 3. Default to contract agent
 *
 * M11+: Multi-agent routing
 * 4. Analyze document content for multiple legal domains
 * 5. Return array of specialists if document touches multiple areas
 */
function determineRouting(
  documentType: string | undefined,
  userMessage: string,
  documentText: string = '',
  documentTypeMap: Record<string, string> = {},
): RoutingDecision {
  // Document type to specialist mapping
  const documentTypeMapping: Record<string, SpecialistType> = {
    // Contract types -> contract specialist
    contract: 'contract',
    agreement: 'contract',
    nda: 'contract',
    'non-disclosure': 'contract',
    msa: 'contract',
    'master service agreement': 'contract',
    sla: 'contract',
    'service level agreement': 'contract',
    license: 'contract',

    // Employment types -> employment specialist (M7)
    employment: 'employment',
    'offer letter': 'employment',
    'employment agreement': 'employment',
    'non-compete': 'employment',
    'non-solicitation': 'employment',

    // IP types -> ip specialist (M5)
    patent: 'ip',
    trademark: 'ip',
    copyright: 'ip',
    'ip assignment': 'ip',

    // Privacy types -> privacy specialist (M6)
    privacy: 'privacy',
    dpa: 'privacy',
    'data processing': 'privacy',
    gdpr: 'privacy',
    ccpa: 'privacy',

    // Compliance types -> compliance specialist (M4)
    policy: 'compliance',
    compliance: 'compliance',
    regulation: 'compliance',

    // Corporate types -> corporate specialist (M8)
    corporate: 'corporate',
    resolution: 'corporate',
    bylaws: 'corporate',
    'articles of incorporation': 'corporate',

    // Litigation types -> litigation specialist (M9)
    pleading: 'litigation',
    motion: 'litigation',
    brief: 'litigation',
    complaint: 'litigation',
    'court filing': 'litigation',

    // Real estate types -> real_estate specialist (M10)
    lease: 'real_estate',
    'real estate': 'real_estate',
    deed: 'real_estate',
    'title report': 'real_estate',
  };

  // Keyword patterns in user message
  const keywordPatterns: Array<{
    pattern: RegExp;
    specialist: SpecialistType;
    category: string;
  }> = [
    // Contract keywords
    {
      pattern: /\b(nda|non-disclosure)\b/i,
      specialist: 'contract',
      category: 'nda',
    },
    {
      pattern: /\b(contract|agreement)\b/i,
      specialist: 'contract',
      category: 'contract',
    },
    {
      pattern: /\b(msa|master service)\b/i,
      specialist: 'contract',
      category: 'msa',
    },
    {
      pattern: /\bterms\s+(and|&)\s+conditions\b/i,
      specialist: 'contract',
      category: 'terms',
    },

    // Employment keywords
    {
      pattern: /\b(employment|offer\s+letter|hire)\b/i,
      specialist: 'employment',
      category: 'employment',
    },
    {
      pattern: /\b(non-compete|non-solicitation)\b/i,
      specialist: 'employment',
      category: 'restrictive-covenant',
    },

    // IP keywords
    {
      pattern: /\b(ip|intellectual\s+property)\b/i,
      specialist: 'ip',
      category: 'ip',
    },
    {
      pattern: /\b(patent|trademark|copyright)\b/i,
      specialist: 'ip',
      category: 'ip-rights',
    },

    // Privacy keywords
    {
      pattern: /\b(privacy|gdpr|ccpa|data\s+protection)\b/i,
      specialist: 'privacy',
      category: 'privacy',
    },
    {
      pattern: /\b(dpa|data\s+processing)\b/i,
      specialist: 'privacy',
      category: 'dpa',
    },

    // Compliance keywords
    {
      pattern: /\b(compliance|policy|regulation)\b/i,
      specialist: 'compliance',
      category: 'compliance',
    },

    // Corporate keywords
    {
      pattern: /\b(corporate|governance|board|resolution)\b/i,
      specialist: 'corporate',
      category: 'corporate',
    },

    // Litigation keywords
    {
      pattern: /\b(litigation|lawsuit|court|pleading|motion)\b/i,
      specialist: 'litigation',
      category: 'litigation',
    },

    // Real estate keywords
    {
      pattern: /\b(lease|real\s+estate|property|title)\b/i,
      specialist: 'real_estate',
      category: 'real-estate',
    },
  ];

  // Track categories found
  const categories: string[] = [];
  let specialist: SpecialistType = 'contract';
  let confidence = 0.5;
  const reasons: string[] = [];

  // 1. Check document type from metadata (highest priority)
  if (documentType) {
    const normalizedType = documentType.toLowerCase().replace(/[_-]/g, ' ');
    const matchedSpecialist = documentTypeMapping[normalizedType];

    if (matchedSpecialist) {
      specialist = matchedSpecialist;
      confidence = 0.9;
      categories.push(`document-type:${normalizedType}`);
      reasons.push(
        `Document type "${documentType}" maps to ${specialist} specialist.`,
      );
    } else {
      // Check for partial matches
      for (const [key, value] of Object.entries(documentTypeMapping)) {
        if (normalizedType.includes(key) || key.includes(normalizedType)) {
          specialist = value;
          confidence = 0.7;
          categories.push(`document-type:${key}`);
          reasons.push(
            `Document type "${documentType}" partially matches ${key}, routing to ${specialist}.`,
          );
          break;
        }
      }
    }
  }

  // 2. Check keywords in user message
  for (const {
    pattern,
    specialist: keywordSpecialist,
    category,
  } of keywordPatterns) {
    if (pattern.test(userMessage)) {
      categories.push(`keyword:${category}`);

      // Keyword match can override or confirm
      if (confidence < 0.8) {
        specialist = keywordSpecialist;
        confidence = Math.max(confidence, 0.7);
        reasons.push(`User message contains keyword matching ${category}.`);
      } else if (specialist === keywordSpecialist) {
        confidence = Math.min(confidence + 0.05, 0.95);
        reasons.push(`User message confirms ${category} context.`);
      }
    }
  }

  // 3. If no routing determined, default to contract
  if (categories.length === 0) {
    categories.push('default');
    reasons.push(
      'No specific document type or keywords detected. Defaulting to contract specialist.',
    );
  }

  // M4-M10: All specialists are now available
  const availableSpecialists: SpecialistType[] = [
    'contract',
    'compliance',
    'ip',
    'privacy',
    'employment',
    'corporate',
    'litigation',
    'real_estate',
  ];
  if (!availableSpecialists.includes(specialist)) {
    const originalSpecialist = specialist;
    specialist = 'contract';
    reasons.push(
      `Note: ${originalSpecialist} specialist not recognized. ` +
        `Routing to contract specialist as fallback.`,
    );
  }

  // Determine alternatives for multi-agent (M11)
  const alternativeSpecialists = [
    ...new Set(
      keywordPatterns
        .filter(({ pattern }) => pattern.test(userMessage))
        .map(({ specialist: s }) => s)
        .filter((s) => s !== specialist && availableSpecialists.includes(s)),
    ),
  ];

  // M11: Detect if document requires multiple specialists
  // Check document content for multiple legal domains
  const detectedSpecialists = new Set<SpecialistType>();
  detectedSpecialists.add(specialist); // Always include primary

  // Analyze document text for multiple legal domains
  const docLower = documentText.toLowerCase();

  // Contract patterns (almost always present, but check for others too)
  if (docLower.includes('contract') || docLower.includes('agreement')) {
    detectedSpecialists.add('contract');
  }

  // IP patterns - look for licensing, copyright, patent, trademark
  if (
    docLower.includes('license') ||
    docLower.includes('intellectual property') ||
    docLower.includes('copyright') ||
    docLower.includes('patent') ||
    docLower.includes('trademark') ||
    docLower.includes('ip ') ||
    docLower.includes(' ip ')
  ) {
    detectedSpecialists.add('ip');
  }

  // Privacy patterns - data protection, GDPR, CCPA
  if (
    docLower.includes('data protection') ||
    docLower.includes('privacy') ||
    docLower.includes('gdpr') ||
    docLower.includes('ccpa') ||
    docLower.includes('personal data') ||
    docLower.includes('personal information')
  ) {
    detectedSpecialists.add('privacy');
  }

  // Compliance patterns
  if (
    docLower.includes('compliance') ||
    docLower.includes('regulatory') ||
    docLower.includes('policy')
  ) {
    detectedSpecialists.add('compliance');
  }

  // Employment patterns
  if (
    docLower.includes('employment') ||
    docLower.includes('employee') ||
    docLower.includes('non-compete') ||
    docLower.includes('non-solicitation')
  ) {
    detectedSpecialists.add('employment');
  }

  // Corporate patterns
  if (
    docLower.includes('board') ||
    docLower.includes('shareholder') ||
    docLower.includes('bylaws') ||
    docLower.includes('articles of incorporation')
  ) {
    detectedSpecialists.add('corporate');
  }

  // Filter to only available specialists
  const multiAgentSpecialists = Array.from(detectedSpecialists).filter((s) =>
    availableSpecialists.includes(s),
  );

  // M11: Multi-agent mode ENABLED
  // Documents touching multiple legal domains will invoke multiple specialists
  // Parallel execution implemented in orchestrator node
  const multiAgent = true;

  if (multiAgentSpecialists.length > 1) {
    reasons.push(
      `Multi-agent mode: Document touches ${multiAgentSpecialists.length} domains (${multiAgentSpecialists.join(', ')}). Invoking all specialists in parallel.`,
    );
  }

  return {
    specialist,
    specialists: multiAgent ? multiAgentSpecialists : undefined,
    confidence,
    reasoning: reasons.join(' '),
    alternatives:
      alternativeSpecialists.length > 0 ? alternativeSpecialists : undefined,
    categories,
    multiAgent,
    documentTypeMap:
      Object.keys(documentTypeMap).length > 0 ? documentTypeMap : undefined,
  };
}
