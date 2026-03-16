/**
 * Debate Service
 *
 * Orchestrates the Red Team / Blue Team adversarial debate system.
 * Blue Agent defends the risk assessment, Red Agent challenges it,
 * and Arbiter Agent synthesizes a final verdict with potential score adjustment.
 */

import { Injectable, Inject, Logger, Optional } from '@nestjs/common';
import { LLM_SERVICE, LLMServiceProvider } from '@orchestratorai/planes/llm';
import { ExecutionContext } from '@orchestrator-ai/transport-types';
import { RiskSubject } from '../interfaces/subject.interface';
import { RiskCompositeScore } from '../interfaces/composite-score.interface';
import { RiskAssessment } from '../interfaces/assessment.interface';
import { RiskAnalysisConfig } from '../interfaces/scope.interface';
import {
  RiskDebate,
  BlueAssessment,
  RedChallenges,
  ArbiterSynthesis,
  DebateMessage,
  RiskDebateContext,
  RedTeamChallenge,
  AlternativeScenario,
} from '../interfaces/debate.interface';
import { DebateRepository } from '../repositories/debate.repository';
import { CompositeScoreRepository } from '../repositories/composite-score.repository';
import { ScoreAggregationService } from './score-aggregation.service';
import { ObservabilityEventsService } from '@/observability/observability-events.service';

export interface DebateInput {
  subject: RiskSubject;
  compositeScore: RiskCompositeScore;
  assessments: RiskAssessment[];
  scopeId: string;
  context: ExecutionContext;
}

export interface DebateResult {
  debate: RiskDebate;
  adjustedScore: number;
  adjustment: number;
}

@Injectable()
export class DebateService {
  private readonly logger = new Logger(DebateService.name);

  constructor(
    @Inject(LLM_SERVICE) private readonly llmService: LLMServiceProvider,
    private readonly debateRepo: DebateRepository,
    private readonly compositeScoreRepo: CompositeScoreRepository,
    private readonly scoreAggregation: ScoreAggregationService,
    @Optional()
    private readonly observabilityEvents?: ObservabilityEventsService,
  ) {}

  /**
   * Emit a progress event for real-time UI updates
   */
  private emitProgress(
    context: ExecutionContext,
    step: string,
    message: string,
    progress: number,
    metadata?: Record<string, unknown>,
  ): void {
    if (!this.observabilityEvents) return;

    void this.observabilityEvents.push({
      context,
      source_app: 'risk-debate',
      hook_event_type: 'risk.debate.progress',
      status: 'in_progress',
      message,
      progress,
      step,
      payload: {
        mode: 'debate',
        ...metadata,
      },
      timestamp: Date.now(),
    });
  }

  /**
   * Run a full debate cycle for a subject's risk assessment
   *
   * Flow:
   * 1. Create pending debate record
   * 2. Run Blue Agent (defender) to present the case
   * 3. Run Red Agent (challenger) to find blind spots
   * 4. Run Arbiter Agent to synthesize and determine adjustments
   * 5. Apply score adjustment to composite score
   */
  async runDebate(input: DebateInput): Promise<DebateResult> {
    const { subject, compositeScore, assessments, scopeId, context } = input;

    this.logger.log(
      `Starting debate for subject ${subject.identifier} with score ${compositeScore.overall_score}`,
    );

    // Emit: Debate starting
    this.emitProgress(
      context,
      'debate-starting',
      `Starting Red vs Blue debate for ${subject.identifier}`,
      0,
      {
        subjectId: subject.id,
        subjectIdentifier: subject.identifier,
        originalScore: compositeScore.overall_score,
      },
    );

    // 1. Create pending debate record
    const debate = await this.debateRepo.create({
      subject_id: subject.id,
      composite_score_id: compositeScore.id,
      task_id: context.conversationId,
      original_score: compositeScore.overall_score,
      status: 'pending',
      transcript: [],
    });

    try {
      // Update status to in_progress
      await this.debateRepo.update(debate.id, { status: 'in_progress' });

      // Emit: Loading contexts
      this.emitProgress(
        context,
        'loading-contexts',
        'Loading debate agent configurations...',
        10,
        {
          subjectIdentifier: subject.identifier,
        },
      );

      // Get debate contexts for each role
      const [blueContext, redContext, arbiterContext] = await Promise.all([
        this.debateRepo.findActiveContextByRole(scopeId, 'blue'),
        this.debateRepo.findActiveContextByRole(scopeId, 'red'),
        this.debateRepo.findActiveContextByRole(scopeId, 'arbiter'),
      ]);

      if (!blueContext || !redContext || !arbiterContext) {
        throw new Error(
          'Missing debate contexts. Please configure debate prompts for all roles (blue, red, arbiter).',
        );
      }

      const transcript: DebateMessage[] = [];

      // 2. Run Blue Agent (Defender)
      this.emitProgress(
        context,
        'running-blue-agent',
        'Blue Team defending the assessment...',
        20,
        {
          subjectIdentifier: subject.identifier,
          agentRole: 'blue',
        },
      );

      this.logger.debug(`Running Blue Agent for ${subject.identifier}`);
      const blueAssessment = await this.runBlueAgent(
        subject,
        compositeScore,
        assessments,
        blueContext,
        context,
      );
      transcript.push({
        role: 'blue',
        timestamp: new Date().toISOString(),
        content: JSON.stringify(blueAssessment),
      });

      // Emit: Blue complete
      this.emitProgress(
        context,
        'blue-complete',
        'Blue Team defense complete',
        40,
        {
          subjectIdentifier: subject.identifier,
          agentRole: 'blue',
          keyFindings: blueAssessment.key_findings?.length || 0,
        },
      );

      // 3. Run Red Agent (Challenger)
      this.emitProgress(
        context,
        'running-red-agent',
        'Red Team challenging the assessment...',
        45,
        {
          subjectIdentifier: subject.identifier,
          agentRole: 'red',
        },
      );

      this.logger.debug(`Running Red Agent for ${subject.identifier}`);
      const redChallenges = await this.runRedAgent(
        subject,
        compositeScore,
        assessments,
        blueAssessment,
        redContext,
        context,
      );
      transcript.push({
        role: 'red',
        timestamp: new Date().toISOString(),
        content: JSON.stringify(redChallenges),
      });

      // Emit: Red complete
      this.emitProgress(
        context,
        'red-complete',
        'Red Team challenges complete',
        65,
        {
          subjectIdentifier: subject.identifier,
          agentRole: 'red',
          challengeCount: redChallenges.challenges?.length || 0,
          blindSpotCount: redChallenges.blind_spots?.length || 0,
        },
      );

      // 4. Run Arbiter Agent (Synthesizer)
      this.emitProgress(
        context,
        'running-arbiter',
        'Arbiter synthesizing perspectives...',
        70,
        {
          subjectIdentifier: subject.identifier,
          agentRole: 'arbiter',
        },
      );

      this.logger.debug(`Running Arbiter Agent for ${subject.identifier}`);
      const arbiterSynthesis = await this.runArbiterAgent(
        subject,
        compositeScore,
        blueAssessment,
        redChallenges,
        arbiterContext,
        context,
      );
      transcript.push({
        role: 'arbiter',
        timestamp: new Date().toISOString(),
        content: JSON.stringify(arbiterSynthesis),
      });

      // Emit: Arbiter complete
      this.emitProgress(
        context,
        'arbiter-complete',
        'Arbiter verdict delivered',
        90,
        {
          subjectIdentifier: subject.identifier,
          agentRole: 'arbiter',
          recommendedAdjustment: arbiterSynthesis.recommended_adjustment,
        },
      );

      // 5. Calculate score adjustment
      const adjustment = this.calculateAdjustment(arbiterSynthesis);
      const finalScore = this.scoreAggregation.applyDebateAdjustment(
        compositeScore.overall_score,
        adjustment,
      );

      // 6. Update debate record with results
      const completedDebate = await this.debateRepo.update(debate.id, {
        blue_assessment: blueAssessment,
        red_challenges: redChallenges,
        arbiter_synthesis: arbiterSynthesis,
        final_score: finalScore,
        score_adjustment: adjustment,
        transcript,
        status: 'completed',
        completed_at: new Date().toISOString(),
      });

      // 7. Update composite score with debate adjustment
      await this.compositeScoreRepo.update(compositeScore.id, {
        debate_adjustment: adjustment,
        // If significant adjustment, mark as needing review
        ...(Math.abs(adjustment) >= 10 ? { status: 'active' } : {}),
      });

      this.logger.log(
        `Debate completed for ${subject.identifier}: ${compositeScore.overall_score} → ${finalScore} (${adjustment >= 0 ? '+' : ''}${adjustment})`,
      );

      // Emit: Debate complete
      this.emitProgress(
        context,
        'debate-complete',
        `Debate complete: score adjusted ${compositeScore.overall_score} → ${finalScore}`,
        100,
        {
          subjectId: subject.id,
          subjectIdentifier: subject.identifier,
          originalScore: compositeScore.overall_score,
          finalScore,
          adjustment,
          acceptedChallenges: arbiterSynthesis.accepted_challenges?.length || 0,
          rejectedChallenges: arbiterSynthesis.rejected_challenges?.length || 0,
        },
      );

      return {
        debate: completedDebate,
        adjustedScore: finalScore,
        adjustment,
      };
    } catch (error) {
      // Mark debate as failed
      await this.debateRepo.update(debate.id, {
        status: 'failed',
        completed_at: new Date().toISOString(),
      });

      // Emit: Debate failed
      this.emitProgress(
        context,
        'debate-failed',
        `Debate failed: ${error instanceof Error ? error.message : String(error)}`,
        0,
        {
          subjectIdentifier: subject.identifier,
          error: error instanceof Error ? error.message : String(error),
        },
      );

      this.logger.error(
        `Debate failed for ${subject.identifier}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Run Blue Agent - Defender of the risk assessment
   */
  private async runBlueAgent(
    subject: RiskSubject,
    compositeScore: RiskCompositeScore,
    assessments: RiskAssessment[],
    debateContext: RiskDebateContext,
    context: ExecutionContext,
  ): Promise<BlueAssessment> {
    const prompt = this.buildBluePrompt(subject, compositeScore, assessments);

    const response = await this.llmService.generateResponse(
      debateContext.system_prompt,
      prompt,
      {
        executionContext: context,
        callerType: 'api',
        callerName: 'debate-blue-agent',
      },
    );

    return this.parseBlueResponse(
      typeof response === 'string' ? response : response.content,
    );
  }

  /**
   * Run Red Agent - Challenger finding blind spots
   */
  private async runRedAgent(
    subject: RiskSubject,
    compositeScore: RiskCompositeScore,
    assessments: RiskAssessment[],
    blueAssessment: BlueAssessment,
    debateContext: RiskDebateContext,
    context: ExecutionContext,
  ): Promise<RedChallenges> {
    const prompt = this.buildRedPrompt(
      subject,
      compositeScore,
      assessments,
      blueAssessment,
    );

    const response = await this.llmService.generateResponse(
      debateContext.system_prompt,
      prompt,
      {
        executionContext: context,
        callerType: 'api',
        callerName: 'debate-red-agent',
        maxTokens: 8192, // Red Team needs more tokens for complex JSON structure
      },
    );

    const content = typeof response === 'string' ? response : response.content;

    // DEBUG: Log full response to understand parsing issues
    this.logger.debug(`[DEBUG] Red Agent response type: ${typeof response}`);
    this.logger.debug(`[DEBUG] Red Agent content type: ${typeof content}`);
    this.logger.debug(
      `[DEBUG] Red Agent content length: ${content?.length || 0}`,
    );
    this.logger.debug(`[DEBUG] Red Agent raw content:\n${content}`);

    return this.parseRedResponse(content);
  }

  /**
   * Run Arbiter Agent - Synthesizes both perspectives
   */
  private async runArbiterAgent(
    subject: RiskSubject,
    compositeScore: RiskCompositeScore,
    blueAssessment: BlueAssessment,
    redChallenges: RedChallenges,
    debateContext: RiskDebateContext,
    context: ExecutionContext,
  ): Promise<ArbiterSynthesis> {
    const prompt = this.buildArbiterPrompt(
      subject,
      compositeScore,
      blueAssessment,
      redChallenges,
    );

    const response = await this.llmService.generateResponse(
      debateContext.system_prompt,
      prompt,
      {
        executionContext: context,
        callerType: 'api',
        callerName: 'debate-arbiter-agent',
      },
    );

    return this.parseArbiterResponse(
      typeof response === 'string' ? response : response.content,
    );
  }

  /**
   * Build prompt for Blue Agent
   */
  private buildBluePrompt(
    subject: RiskSubject,
    compositeScore: RiskCompositeScore,
    assessments: RiskAssessment[],
  ): string {
    const dimensionSummary = assessments
      .map(
        (a) =>
          `- ${a.dimension_id}: Score ${a.score}, Confidence ${a.confidence}\n  Reasoning: ${a.reasoning}`,
      )
      .join('\n');

    return `You are the Blue Team agent defending the risk assessment for ${subject.identifier}.

Subject: ${subject.identifier} (${subject.name || 'Unknown'})
Subject Type: ${subject.subject_type}
Overall Risk Score: ${compositeScore.overall_score}/100
Composite Confidence: ${compositeScore.confidence}

Dimension Assessments:
${dimensionSummary}

Your task:
1. Present a compelling defense of the current risk assessment
2. Highlight the key findings that support this score
3. Cite specific evidence from the dimension analyses
4. Explain why the confidence level is appropriate

Respond in Markdown format with these exact headers:

## Summary
[Write a comprehensive defense narrative here]

## Key Findings
- [Finding 1]
- [Finding 2]
- [Add more as needed]

## Evidence Cited
- [Evidence 1]
- [Evidence 2]
- [Add more as needed]

## Confidence Explanation
[Explain why the confidence level is justified]`;
  }

  /**
   * Build prompt for Red Agent
   */
  private buildRedPrompt(
    subject: RiskSubject,
    compositeScore: RiskCompositeScore,
    assessments: RiskAssessment[],
    blueAssessment: BlueAssessment,
  ): string {
    const dimensionSummary = assessments
      .map(
        (a) =>
          `- ${a.dimension_id}: Score ${a.score}, Confidence ${a.confidence}\n  Reasoning: ${a.reasoning}`,
      )
      .join('\n');

    return `You are the Red Team agent challenging the risk assessment for ${subject.identifier}.

Subject: ${subject.identifier} (${subject.name || 'Unknown'})
Subject Type: ${subject.subject_type}
Overall Risk Score: ${compositeScore.overall_score}/100

Dimension Assessments:
${dimensionSummary}

Blue Team's Defense:
${blueAssessment.summary}

Key findings they cited: ${blueAssessment.key_findings.join('; ')}

Your task:
1. Challenge the assessment - what did they miss?
2. Identify blind spots in the analysis
3. Propose alternative scenarios that could change the risk picture
4. Highlight any overstated or understated risks
5. For each challenge, suggest a specific score adjustment

Respond in Markdown format with these exact headers:

## Challenges

### Challenge 1
- **Dimension:** [which dimension this affects]
- **Challenge:** [specific challenge to the assessment]
- **Evidence:** [supporting evidence]
- **Suggested Adjustment:** [number from -20 to +20]

### Challenge 2
[repeat format for each challenge]

## Blind Spots
- [Overlooked risk factor 1]
- [Overlooked risk factor 2]

## Alternative Scenarios

### Scenario 1
- **Name:** [scenario name]
- **Description:** [what could happen]
- **Probability:** [0.0-1.0]
- **Impact on Score:** [number from -30 to +30]

## Overstated Risks
- [Risk that may be exaggerated]

## Understated Risks
- [Risk that needs more attention]`;
  }

  /**
   * Build prompt for Arbiter Agent
   */
  private buildArbiterPrompt(
    subject: RiskSubject,
    compositeScore: RiskCompositeScore,
    blueAssessment: BlueAssessment,
    redChallenges: RedChallenges,
  ): string {
    // Format Blue Team summary for Arbiter
    const blueSummary = `Summary: ${blueAssessment.summary}
Key Findings: ${blueAssessment.key_findings.join('; ')}`;

    // Format Red Team challenges for Arbiter
    const redSummary = redChallenges.challenges
      .map(
        (c, i) =>
          `Challenge ${i + 1}: ${c.challenge} (Dimension: ${c.dimension}, Suggested: ${c.suggested_adjustment})`,
      )
      .join('\n');
    const blindSpots = redChallenges.blind_spots.join('; ');

    return `You are the Arbiter agent providing final synthesis for ${subject.identifier}.

Subject: ${subject.identifier} (${subject.name || 'Unknown'})
Subject Type: ${subject.subject_type}
Current Risk Score: ${compositeScore.overall_score}/100

Blue Team's Defense:
${blueSummary}

Red Team's Challenges:
${redSummary}

Red Team's Blind Spots: ${blindSpots}

Your task:
1. Review both perspectives objectively
2. Determine which challenges are valid and should adjust the score
3. Determine which challenges should be rejected and why
4. Provide a final score adjustment recommendation (-30 to +30)
5. Explain your reasoning

Respond in Markdown format with these exact headers:

## Final Assessment
[Balanced conclusion synthesizing both Blue and Red team views]

## Accepted Challenges
- [Challenge that is valid and should affect the score]
- [Another valid challenge]

## Rejected Challenges
- [Challenge that is invalid or should not affect the score]

## Adjustment Reasoning
[Explain why the score should be adjusted (or not)]

## Recommended Adjustment
[A single number from -30 to +30]

## Confidence Level
[A single number from 0.0 to 1.0]

## Key Takeaways
- [Important insight 1]
- [Important insight 2]`;
  }

  /**
   * Strip markdown code blocks from LLM response
   * LLMs often wrap JSON in ```json ... ``` blocks
   */
  private stripMarkdownCodeBlocks(content: string): string {
    // Remove ```json or ``` at start and ``` at end
    let cleaned = content.trim();

    // Match ```json, ```JSON, or just ``` at the start
    const startMatch = cleaned.match(/^```(?:json|JSON)?\s*\n?/);
    if (startMatch) {
      cleaned = cleaned.slice(startMatch[0].length);
    }

    // Remove trailing ```
    const endMatch = cleaned.match(/\n?```\s*$/);
    if (endMatch) {
      cleaned = cleaned.slice(0, -endMatch[0].length);
    }

    return cleaned.trim();
  }

  /**
   * Sanitize LLM JSON output to fix common issues
   * - Remove leading + signs on numbers (JSON doesn't allow +15, only -15)
   * - Fix malformed arrays like ["a"], ["b"] -> ["a", "b"]
   * - Fix trailing commas
   */
  private sanitizeJsonForParsing(content: string): string {
    let sanitized = content;

    // Remove leading + signs before numbers (e.g., +15 -> 15, +0.5 -> 0.5)
    // Match: colon, optional whitespace, plus sign, then number
    sanitized = sanitized.replace(/:\s*\+(\d+(?:\.\d+)?)/g, ': $1');

    // Fix malformed arrays: ], [ -> , (LLM sometimes outputs multiple arrays instead of one)
    // Pattern: ], followed by optional whitespace/newlines, then [
    sanitized = sanitized.replace(/\],\s*\[/g, ', ');

    // Remove trailing commas before closing brackets/braces
    sanitized = sanitized.replace(/,(\s*[}\]])/g, '$1');

    this.logger.debug(
      `[Sanitize] Applied sanitization, length: ${sanitized.length}`,
    );

    return sanitized;
  }

  /**
   * Parse Blue Agent Markdown response
   */
  private parseBlueResponse(content: string): BlueAssessment {
    this.logger.log(
      `[Blue Agent Parse] Parsing Markdown response, length: ${content?.length || 0}`,
    );

    const summary =
      this.extractMarkdownSection(content, 'Summary') || 'No summary provided';
    const keyFindings = this.extractMarkdownBullets(content, 'Key Findings');
    const evidenceCited = this.extractMarkdownBullets(
      content,
      'Evidence Cited',
    );
    const confidenceExplanation =
      this.extractMarkdownSection(content, 'Confidence Explanation') ||
      'No explanation provided';

    this.logger.log(
      `[Blue Agent Parse] Extracted: summary=${summary.length}chars, findings=${keyFindings.length}, evidence=${evidenceCited.length}`,
    );

    return {
      summary,
      key_findings: keyFindings,
      evidence_cited: evidenceCited,
      confidence_explanation: confidenceExplanation,
    };
  }

  /**
   * Parse Red Agent Markdown response
   */
  private parseRedResponse(content: string): RedChallenges {
    this.logger.log(
      `[Red Agent Parse] Parsing Markdown response, length: ${content?.length || 0}`,
    );

    if (!content || content.trim().length === 0) {
      this.logger.error('[Red Agent Parse] Empty content received');
      return this.buildRedParseError('Empty response from Red Team agent');
    }

    // Parse challenges from ### Challenge N sections
    const challenges = this.parseMarkdownChallenges(content);
    const blindSpots = this.extractMarkdownBullets(content, 'Blind Spots');
    const alternativeScenarios = this.parseMarkdownScenarios(content);
    const overstatedRisks = this.extractMarkdownBullets(
      content,
      'Overstated Risks',
    );
    const understatedRisks = this.extractMarkdownBullets(
      content,
      'Understated Risks',
    );

    this.logger.log(
      `[Red Agent Parse] Extracted: challenges=${challenges.length}, blindSpots=${blindSpots.length}, scenarios=${alternativeScenarios.length}`,
    );

    return {
      challenges,
      blind_spots: blindSpots,
      alternative_scenarios: alternativeScenarios,
      overstated_risks: overstatedRisks,
      understated_risks: understatedRisks,
    };
  }

  /**
   * Parse challenge blocks from Markdown (### Challenge N format)
   */
  private parseMarkdownChallenges(content: string): RedTeamChallenge[] {
    const challenges: RedTeamChallenge[] = [];

    // Find the Challenges section
    const challengesSection = this.extractMarkdownSection(
      content,
      'Challenges',
    );
    if (!challengesSection) {
      return challenges;
    }

    // Split by ### to get individual challenges
    const challengeBlocks = challengesSection
      .split(/###\s+Challenge\s+\d+/i)
      .filter((b) => b.trim());

    for (const block of challengeBlocks) {
      const dimension =
        this.extractMarkdownField(block, 'Dimension') || 'unknown';
      const challenge = this.extractMarkdownField(block, 'Challenge') || '';
      const evidence = this.extractMarkdownField(block, 'Evidence') || '';
      const adjustmentStr =
        this.extractMarkdownField(block, 'Suggested Adjustment') || '0';
      const adjustment = this.parseNumber(adjustmentStr);

      if (challenge) {
        challenges.push({
          dimension,
          challenge,
          evidence: evidence ? [evidence] : [],
          suggested_adjustment: this.clampAdjustment(adjustment),
        });
      }
    }

    return challenges;
  }

  /**
   * Parse scenario blocks from Markdown (### Scenario N format)
   */
  private parseMarkdownScenarios(content: string): AlternativeScenario[] {
    const scenarios: AlternativeScenario[] = [];

    // Find the Alternative Scenarios section
    const scenariosSection = this.extractMarkdownSection(
      content,
      'Alternative Scenarios',
    );
    if (!scenariosSection) {
      return scenarios;
    }

    // Split by ### to get individual scenarios
    const scenarioBlocks = scenariosSection
      .split(/###\s+Scenario\s+\d+/i)
      .filter((b) => b.trim());

    for (const block of scenarioBlocks) {
      const name =
        this.extractMarkdownField(block, 'Name') || 'Unknown scenario';
      const description = this.extractMarkdownField(block, 'Description') || '';
      const probabilityStr =
        this.extractMarkdownField(block, 'Probability') || '0.5';
      const impactStr =
        this.extractMarkdownField(block, 'Impact on Score') || '0';

      scenarios.push({
        name,
        description,
        probability: Math.max(0, Math.min(1, this.parseNumber(probabilityStr))),
        impact_on_score: this.clampAdjustment(this.parseNumber(impactStr)),
      });
    }

    return scenarios;
  }

  /**
   * Build error response for Red Team parsing failures
   */
  private buildRedParseError(message: string): RedChallenges {
    return {
      challenges: [],
      blind_spots: [message],
      alternative_scenarios: [],
      overstated_risks: [],
      understated_risks: [],
    };
  }

  /**
   * Parse Arbiter Agent Markdown response
   */
  private parseArbiterResponse(content: string): ArbiterSynthesis {
    this.logger.log(
      `[Arbiter Parse] Parsing Markdown response, length: ${content?.length || 0}`,
    );

    const finalAssessment =
      this.extractMarkdownSection(content, 'Final Assessment') ||
      'No assessment provided';
    const acceptedChallenges = this.extractMarkdownBullets(
      content,
      'Accepted Challenges',
    );
    const rejectedChallenges = this.extractMarkdownBullets(
      content,
      'Rejected Challenges',
    );
    const adjustmentReasoning =
      this.extractMarkdownSection(content, 'Adjustment Reasoning') ||
      'No reasoning provided';
    const recommendedAdjustmentStr =
      this.extractMarkdownSection(content, 'Recommended Adjustment') || '0';
    const confidenceLevelStr =
      this.extractMarkdownSection(content, 'Confidence Level') || '0.5';
    const keyTakeaways = this.extractMarkdownBullets(content, 'Key Takeaways');

    const recommendedAdjustment = this.parseNumber(recommendedAdjustmentStr);
    const confidenceLevel = this.parseNumber(confidenceLevelStr);

    this.logger.log(
      `[Arbiter Parse] Extracted: adjustment=${recommendedAdjustment}, confidence=${confidenceLevel}, takeaways=${keyTakeaways.length}`,
    );

    return {
      final_assessment: finalAssessment,
      accepted_challenges: acceptedChallenges,
      rejected_challenges: rejectedChallenges,
      adjustment_reasoning: adjustmentReasoning,
      confidence_level: Math.max(0, Math.min(1, confidenceLevel)),
      key_takeaways: keyTakeaways,
      recommended_adjustment: this.clampAdjustment(recommendedAdjustment),
    };
  }

  /**
   * Calculate final score adjustment from Arbiter synthesis
   */
  private calculateAdjustment(arbiterSynthesis: ArbiterSynthesis): number {
    // Use the arbiter's recommended adjustment, clamped to safe range
    const adjustment = arbiterSynthesis.recommended_adjustment ?? 0;
    return this.clampAdjustment(adjustment);
  }

  /**
   * Clamp adjustment to valid range (-30 to +30)
   */
  private clampAdjustment(adjustment: number): number {
    return Math.max(-30, Math.min(30, Math.round(adjustment)));
  }

  // ==========================================================================
  // MARKDOWN PARSING HELPERS
  // ==========================================================================

  /**
   * Extract content from a Markdown section (## Header format)
   * Returns the text between this header and the next ## header
   */
  private extractMarkdownSection(
    content: string,
    sectionName: string,
  ): string | null {
    // Match ## Section Name (case insensitive)
    const pattern = new RegExp(
      `##\\s*${sectionName}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`,
      'i',
    );
    const match = content.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
    return null;
  }

  /**
   * Extract bullet points from a Markdown section
   * Returns array of bullet content (strips the - or * prefix)
   */
  private extractMarkdownBullets(
    content: string,
    sectionName: string,
  ): string[] {
    const section = this.extractMarkdownSection(content, sectionName);
    if (!section) {
      return [];
    }

    const bullets: string[] = [];
    // Match lines starting with - or * (bullet points)
    const lines = section.split('\n');
    for (const line of lines) {
      const bulletMatch = line.match(/^\s*[-*]\s+(.+)$/);
      if (bulletMatch && bulletMatch[1]) {
        bullets.push(bulletMatch[1].trim());
      }
    }
    return bullets;
  }

  /**
   * Extract a field value from Markdown (- **Field:** value format)
   */
  private extractMarkdownField(
    content: string,
    fieldName: string,
  ): string | null {
    // Match - **Field Name:** value or **Field Name:** value
    const pattern = new RegExp(
      `[-*]?\\s*\\*\\*${fieldName}:\\*\\*\\s*(.+?)(?=\\n|$)`,
      'i',
    );
    const match = content.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
    return null;
  }

  /**
   * Parse a number from a string, handling +/- signs and text
   */
  private parseNumber(str: string): number {
    if (!str) return 0;
    // Extract the first number (including negative sign and decimals)
    const match = str.match(/[+-]?\d+\.?\d*/);
    if (match) {
      return parseFloat(match[0]);
    }
    return 0;
  }

  /**
   * Check if debate should be triggered based on scope config
   */
  shouldTriggerDebate(
    compositeScore: RiskCompositeScore,
    analysisConfig: RiskAnalysisConfig,
  ): boolean {
    const redTeamConfig = analysisConfig.redTeam;

    if (!redTeamConfig?.enabled) {
      return false;
    }

    // Check if score exceeds threshold
    const threshold = redTeamConfig.threshold ?? 50;
    if (compositeScore.overall_score >= threshold) {
      return true;
    }

    // Check if confidence is low (might need debate)
    const lowConfidenceThreshold = redTeamConfig.lowConfidenceThreshold ?? 0.5;
    if (compositeScore.confidence < lowConfidenceThreshold) {
      return true;
    }

    return false;
  }

  /**
   * Get the latest debate for a subject
   */
  async getLatestDebate(subjectId: string): Promise<RiskDebate | null> {
    return this.debateRepo.findLatestBySubject(subjectId);
  }

  /**
   * Get all debates for a subject
   */
  async getDebatesBySubject(subjectId: string): Promise<RiskDebate[]> {
    return this.debateRepo.findBySubject(subjectId);
  }

  /**
   * Get a specific debate by ID
   */
  async getDebateById(debateId: string): Promise<RiskDebate | null> {
    return this.debateRepo.findById(debateId);
  }
}
