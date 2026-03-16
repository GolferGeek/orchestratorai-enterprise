/**
 * Frontend converter for PII metadata
 * Transforms legacy complex structure to simplified format
 */

export interface SimplifiedPIIMetadata {
  flags: Array<{
    value: string;
    dataType: string;
    severity: 'info' | 'warning' | 'showstopper';
    confidence: number;
    pattern: string;
  }>;
  pseudonyms: Array<{
    original: string;
    pseudonym: string;
    dataType: string;
  }>;
  flagCount: number;
  pseudonymCount: number;
  blocked?: boolean;
  blockingReason?: string;
}

// Interface for legacy PII metadata structure
interface LegacyPIIMatch {
  value: string;
  dataType: string;
  severity: string;
  confidence: number;
  pattern: string;
  pseudonym?: string;
}

interface LegacyPIIMetadata {
  detectionResults?: {
    flaggedMatches?: LegacyPIIMatch[];
  };
  pseudonymResults?: {
    processedMatches?: LegacyPIIMatch[];
  };
  showstopperDetected?: boolean;
  policyDecision?: {
    blocked?: boolean;
    blockingReason?: string;
  };
}

/**
 * Converts legacy PII metadata to simplified structure
 */
export function convertToSimplifiedPII(legacyMetadata: LegacyPIIMetadata): SimplifiedPIIMetadata | null {
  if (!legacyMetadata) {
    return null;
  }

  const simplified: SimplifiedPIIMetadata = {
    flags: [],
    pseudonyms: [],
    flagCount: 0,
    pseudonymCount: 0
  };

  // Extract flags from detectionResults.flaggedMatches
  if (legacyMetadata.detectionResults?.flaggedMatches) {
    simplified.flags = legacyMetadata.detectionResults.flaggedMatches.map((match: LegacyPIIMatch) => ({
      value: match.value,
      dataType: match.dataType,
      severity: match.severity as 'info' | 'warning' | 'showstopper',
      confidence: match.confidence,
      pattern: match.pattern
    }));
    simplified.flagCount = simplified.flags.length;
  }

  // Extract pseudonyms from pseudonymResults.processedMatches
  if (legacyMetadata.pseudonymResults?.processedMatches) {
    simplified.pseudonyms = legacyMetadata.pseudonymResults.processedMatches
      .filter((match: LegacyPIIMatch) => match.pseudonym)
      .map((match: LegacyPIIMatch) => ({
        original: match.value,
        pseudonym: match.pseudonym as string,
        dataType: match.dataType
      }));
    simplified.pseudonymCount = simplified.pseudonyms.length;
  }

  // Check if blocked
  if (legacyMetadata.showstopperDetected || legacyMetadata.policyDecision?.blocked) {
    simplified.blocked = true;
    simplified.blockingReason = legacyMetadata.policyDecision?.blockingReason || 'showstopper-pii';
  }

  return simplified;
}

/**
 * Helper to get badge counts from simplified metadata
 */
export function getPIIBadgeCounts(metadata: SimplifiedPIIMetadata | null): {
  flagCount: number;
  pseudonymCount: number;
} {
  if (!metadata) {
    return { flagCount: 0, pseudonymCount: 0 };
  }
  return {
    flagCount: metadata.flagCount,
    pseudonymCount: metadata.pseudonymCount
  };
}