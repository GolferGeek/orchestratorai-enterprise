import { Injectable, Logger } from '@nestjs/common';

/**
 * Detected signature block
 */
export interface SignatureBlock {
  /** Party name (signatory) */
  partyName?: string;
  /** Signer name */
  signerName?: string;
  /** Signer title */
  signerTitle?: string;
  /** Signature date */
  signatureDate?: string;
  /** Start position (character index) */
  startIndex: number;
  /** End position (character index) */
  endIndex: number;
  /** Block content */
  content: string;
  /** Confidence score (0-1) */
  confidence: number;
  /** Detection method used */
  detectionMethod: 'keyword' | 'pattern' | 'position';
}

/**
 * Signature detection result
 */
export interface SignatureDetectionResult {
  /** Detected signature blocks */
  signatures: SignatureBlock[];
  /** Overall confidence score */
  confidence: number;
  /** Number of parties detected */
  partyCount: number;
}

/**
 * Signature Detection Service
 *
 * Identifies signature blocks and signing parties using multiple detection strategies:
 * 1. Keyword detection (IN WITNESS WHEREOF, SIGNED, EXECUTED, etc.)
 * 2. Pattern matching (signature line patterns, date patterns)
 * 3. Position-based detection (last section of document)
 *
 * Detection Strategy:
 * - Phase 1: Find signature block markers (keywords, formatting)
 * - Phase 2: Extract signature lines (name, title, date patterns)
 * - Phase 3: Parse party information from signature blocks
 * - Phase 4: Validate and score confidence
 *
 * Signature Block Patterns:
 * - "SIGNED this ___ day of _____, 20__"
 * - "IN WITNESS WHEREOF, the parties have executed..."
 * - "By: _________________"
 * - "Name: _______________"
 * - "Title: ______________"
 * - "Date: _______________"
 *
 * Party Extraction:
 * - Company names above signature lines
 * - "By and on behalf of [Company]"
 * - Party labels (Buyer, Seller, Lessor, Lessee, etc.)
 *
 * @example
 * ```typescript
 * const result = await signatureDetection.detectSignatures(extractedText);
 * // result: {
 * //   signatures: [
 * //     { partyName: 'Acme Corp', signerName: 'John Doe', signerTitle: 'CEO', ... }
 * //   ],
 * //   confidence: 0.85,
 * //   partyCount: 2
 * // }
 * ```
 */
@Injectable()
export class SignatureDetectionService {
  private readonly logger = new Logger(SignatureDetectionService.name);

  /**
   * Detect signature blocks in a legal document
   *
   * @param text - Extracted document text
   * @returns SignatureDetectionResult with detected signatures
   */
  detectSignatures(text: string): SignatureDetectionResult {
    this.logger.log(
      `✍️ [SIGNATURE-DETECT] Detecting signatures (${text.length} chars)`,
    );

    // Phase 1: Find signature block region
    const signatureRegion = this.findSignatureRegion(text);

    // Phase 2: Extract individual signature blocks
    const signatures = this.extractSignatureBlocks(signatureRegion, text);

    // Phase 3: Parse signature details
    for (const signature of signatures) {
      this.parseSignatureDetails(signature);
    }

    // Calculate overall confidence
    const confidence = this.calculateConfidence(signatures, text.length);

    // Count unique parties
    const partyCount = new Set(
      signatures.map((s) => s.partyName).filter(Boolean),
    ).size;

    this.logger.log(
      `✍️ [SIGNATURE-DETECT] Detection complete: ${signatures.length} signatures, ${partyCount} parties, confidence=${confidence.toFixed(2)}`,
    );

    return { signatures, confidence, partyCount };
  }

  /**
   * Find the signature block region in the document
   */
  private findSignatureRegion(text: string): {
    start: number;
    end: number;
    content: string;
  } {
    // Method 1: Look for signature keywords
    const signatureKeywords = [
      /IN WITNESS WHEREOF/i,
      /SIGNED\s+this/i,
      /EXECUTED\s+(?:as\s+of|this)/i,
      /AGREED\s+AND\s+ACKNOWLEDGED/i,
      /THE\s+PARTIES\s+HAVE\s+EXECUTED/i,
    ];

    let earliestStart = text.length;

    for (const keyword of signatureKeywords) {
      const match = text.search(keyword);
      if (match !== -1 && match < earliestStart) {
        earliestStart = match;
      }
    }

    // If keywords found, use from there to end
    if (earliestStart < text.length) {
      return {
        start: earliestStart,
        end: text.length,
        content: text.substring(earliestStart),
      };
    }

    // Method 2: Use last 20% of document as fallback
    const fallbackStart = Math.floor(text.length * 0.8);
    return {
      start: fallbackStart,
      end: text.length,
      content: text.substring(fallbackStart),
    };
  }

  /**
   * Extract individual signature blocks from region
   */
  private extractSignatureBlocks(
    region: { start: number; end: number; content: string },
    fullText: string,
  ): SignatureBlock[] {
    const blocks: SignatureBlock[] = [];

    // Pattern 1: Party name followed by signature lines
    // Example:
    // ACME CORPORATION
    //
    // By: _________________
    // Name: John Doe
    // Title: CEO
    // Date: 01/15/2024

    const partyBlockPattern =
      /([A-Z][A-Z\s&,.']+(?:LLC|INC|CORP|LTD|LP)?)\s*\n\s*\n(?:\s*By:\s*[_\s]*\n)?/g;
    let match;

    while ((match = partyBlockPattern.exec(region.content)) !== null) {
      if (!match[1]) continue;

      const partyName = match[1].trim();
      const blockStart = region.start + match.index;

      // Find the end of this signature block (next party or end of region)
      const nextMatch = partyBlockPattern.exec(region.content);
      const blockEnd = nextMatch ? region.start + nextMatch.index : region.end;

      // Reset lastIndex for next iteration
      if (nextMatch) {
        partyBlockPattern.lastIndex = nextMatch.index;
      }

      const blockContent = fullText.substring(blockStart, blockEnd).trim();

      blocks.push({
        partyName,
        startIndex: blockStart,
        endIndex: blockEnd,
        content: blockContent,
        confidence: 0.7,
        detectionMethod: 'pattern',
      });
    }

    // Pattern 2: Look for "By:" lines without party name above
    const byLinePattern = /By:\s*[_\s]*\n/g;
    const byMatches = Array.from(region.content.matchAll(byLinePattern));

    for (const byMatch of byMatches) {
      const blockStart = region.start + (byMatch.index || 0);

      // Check if this "By:" is already part of a detected block
      const alreadyDetected = blocks.some(
        (b) => blockStart >= b.startIndex && blockStart <= b.endIndex,
      );

      if (!alreadyDetected) {
        // Find end (next "By:" or end of region)
        const nextBy = byMatches.find(
          (m) => (m.index || 0) > (byMatch.index || 0),
        );
        const blockEnd = nextBy
          ? region.start + (nextBy.index || 0)
          : region.end;

        const blockContent = fullText.substring(blockStart, blockEnd).trim();

        blocks.push({
          startIndex: blockStart,
          endIndex: blockEnd,
          content: blockContent,
          confidence: 0.5,
          detectionMethod: 'keyword',
        });
      }
    }

    // If no blocks found, create one generic block for entire signature region
    if (blocks.length === 0) {
      blocks.push({
        startIndex: region.start,
        endIndex: region.end,
        content: region.content.trim(),
        confidence: 0.3,
        detectionMethod: 'position',
      });
    }

    return blocks;
  }

  /**
   * Parse signature details from block content
   */
  private parseSignatureDetails(block: SignatureBlock): void {
    const content = block.content;

    // Extract signer name
    const namePatterns = [
      /Name:\s*([A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/,
      /By:\s*([A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/,
      /Signed:\s*([A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/,
    ];

    for (const pattern of namePatterns) {
      const match = content.match(pattern);
      if (match && match[1]) {
        block.signerName = match[1].trim();
        break;
      }
    }

    // Extract title
    const titlePattern = /Title:\s*([A-Za-z\s,&]+)/;
    const titleMatch = content.match(titlePattern);
    if (titleMatch && titleMatch[1]) {
      block.signerTitle = titleMatch[1].trim();
    }

    // Extract date
    const datePatterns = [
      /Date:\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/,
      /Date:\s*([A-Z][a-z]+\s+\d{1,2},?\s+\d{4})/,
      /this\s+(\d{1,2})(?:st|nd|rd|th)?\s+day\s+of\s+([A-Z][a-z]+),?\s+(\d{4})/,
    ];

    for (const pattern of datePatterns) {
      const match = content.match(pattern);
      if (match) {
        if (match.length === 4) {
          // Format: "this 15th day of January, 2024"
          block.signatureDate = `${match[2]} ${match[1]}, ${match[3]}`;
        } else {
          block.signatureDate = match[1];
        }
        break;
      }
    }

    // Update confidence based on what we found
    let confidenceBoost = 0;
    if (block.signerName) confidenceBoost += 0.15;
    if (block.signerTitle) confidenceBoost += 0.1;
    if (block.signatureDate) confidenceBoost += 0.1;

    block.confidence = Math.min(1.0, block.confidence + confidenceBoost);
  }

  /**
   * Calculate overall confidence based on signatures detected
   */
  private calculateConfidence(
    signatures: SignatureBlock[],
    _textLength: number,
  ): number {
    if (signatures.length === 0) return 0;

    // Average signature confidence
    const avgConfidence =
      signatures.reduce((sum, s) => sum + s.confidence, 0) / signatures.length;

    // Completeness factor (do signatures have required fields?)
    const completeSignatures = signatures.filter(
      (s) => s.partyName && s.signerName,
    ).length;
    const completeness = completeSignatures / signatures.length;

    // Combined score
    return avgConfidence * 0.6 + completeness * 0.4;
  }

  /**
   * Extract party labels from signature block
   * (e.g., "Buyer:", "Seller:", "Lessor:", "Lessee:")
   */
  private extractPartyLabel(content: string): string | undefined {
    const labelPattern =
      /^(Buyer|Seller|Lessor|Lessee|Landlord|Tenant|Licensor|Licensee|Party|Provider|Client|Customer):\s*/i;
    const match = content.match(labelPattern);
    return match ? match[1] : undefined;
  }
}
