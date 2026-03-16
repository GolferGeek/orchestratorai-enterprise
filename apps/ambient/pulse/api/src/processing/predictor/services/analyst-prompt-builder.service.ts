import { Injectable, Logger } from '@nestjs/common';
import {
  ActiveAnalyst,
  LlmTier,
  ContextProvider,
  PersonalityAnalyst,
} from '../interfaces/analyst.interface';
import { ActiveLearning } from '../interfaces/learning.interface';
import { Target } from '../interfaces/target.interface';

/**
 * Context for building analyst prompt
 */
export interface PromptContext {
  analyst: ActiveAnalyst;
  tier: LlmTier;
  target: Target;
  learnings: ActiveLearning[];
  input: {
    content: string;
    direction?: string;
    metadata?: Record<string, unknown>;
  };
  /** Performance context markdown for agent fork (optional) */
  performanceContext?: string;
}

/**
 * Context for building composed prompt with personality analyst + context providers
 */
export interface ComposedPromptContext {
  personalityAnalyst: PersonalityAnalyst;
  contextProviders: ContextProvider[];
  tier: LlmTier;
  target: Target;
  learnings: ActiveLearning[];
  input: {
    content: string;
    direction?: string;
    metadata?: Record<string, unknown>;
  };
  /** Performance context markdown for agent fork (optional) */
  performanceContext?: string;
}

/**
 * Built prompt with system and user components
 */
export interface BuiltPrompt {
  systemPrompt: string;
  userPrompt: string;
  learningIds: string[]; // IDs of learnings that were injected
}

@Injectable()
export class AnalystPromptBuilderService {
  private readonly logger = new Logger(AnalystPromptBuilderService.name);

  /**
   * Build prompt for analyst assessment of a signal
   */
  buildPrompt(context: PromptContext): BuiltPrompt {
    const { analyst, tier, target, learnings, input, performanceContext } =
      context;

    this.logger.log(
      `Building prompt for analyst: ${analyst.slug}, tier: ${tier}, target: ${target.symbol}`,
    );

    // Get tier-specific instructions
    const tierInstructions =
      analyst.tier_instructions[tier] || analyst.tier_instructions.silver || '';

    // Build learnings section
    const learningIds: string[] = [];
    let learningsSection = '';
    if (learnings.length > 0) {
      learningsSection = '\n\n## Applied Learnings\n';
      for (const learning of learnings) {
        learningIds.push(learning.learning_id);
        learningsSection += `\n### ${learning.title}\n${learning.description}\n`;
        if (learning.config) {
          learningsSection += `Config: ${JSON.stringify(learning.config)}\n`;
        }
      }
      this.logger.log(`Applied ${learnings.length} learnings to prompt`);
    }

    // Build performance context section for agent fork
    const performanceSection = performanceContext
      ? `\n\n${performanceContext}`
      : '';

    // Build system prompt
    const systemPrompt = `You are ${analyst.name}, a ${analyst.perspective}.

## Your Role
${analyst.perspective}

${tierInstructions ? `## Analysis Instructions\n${tierInstructions}` : ''}

## Target Information
- Symbol: ${target.symbol}
- Name: ${target.name}
- Type: ${target.target_type}
${target.context ? `- Context: ${target.context}` : ''}
${learningsSection}${performanceSection}

## Direction Decision Guidelines
- Choose "bullish" if your analysis leans even slightly toward upside — even if conviction is moderate, take a position.
- Choose "bearish" if your analysis leans even slightly toward downside — even if conviction is moderate, take a position.
- Choose "neutral" ONLY when evidence is genuinely contradictory with equal weight on both sides. This should be rare (~10-15% of assessments). When in doubt between neutral and a direction, choose the direction with lower confidence rather than neutral.

Use confidence to reflect your conviction:
- 0.8-1.0: Strong evidence, high conviction
- 0.6-0.8: Moderate evidence, reasonable conviction
- 0.4-0.6: Lean in one direction but evidence is thin
- Below 0.4: Very weak lean — still choose a direction if you can

## Output Format
You must provide your analysis in the following JSON format:
{
  "direction": "bullish" | "bearish" | "neutral",
  "confidence": 0.0-1.0,
  "reasoning": "Your detailed analysis...",
  "key_factors": ["factor1", "factor2", ...],
  "risks": ["risk1", "risk2", ...]
}`;

    // Build user prompt - no suggested direction to avoid anchoring bias
    const userPrompt = `Analyze the following signal:

${input.content}
${input.metadata ? `\nMetadata: ${JSON.stringify(input.metadata)}` : ''}

Provide your independent assessment based on your perspective as ${analyst.name}.`;

    return {
      systemPrompt,
      userPrompt,
      learningIds,
    };
  }

  /**
   * Build composed prompt for personality analyst with context provider layers
   * This composes the personality analyst's perspective with domain/universe/target knowledge
   */
  buildComposedPrompt(context: ComposedPromptContext): BuiltPrompt {
    const {
      personalityAnalyst,
      contextProviders,
      tier,
      target,
      learnings,
      input,
      performanceContext,
    } = context;

    this.logger.log(
      `Building composed prompt for ${personalityAnalyst.name} with ${contextProviders.length} context providers, target: ${target.symbol}`,
    );

    // Get tier-specific instructions from personality analyst
    const analystTierInstructions =
      personalityAnalyst.tier_instructions[tier] ||
      personalityAnalyst.tier_instructions.silver ||
      '';

    // Build context providers section
    let contextSection = '';
    for (const provider of contextProviders) {
      const providerTierInstructions =
        provider.tier_instructions[tier] ||
        provider.tier_instructions.silver ||
        '';

      // Label based on scope level
      const scopeLabel = this.getScopeLabel(provider.scope_level, target);

      contextSection += `\n## ${scopeLabel}\n`;
      contextSection += `${provider.perspective}\n`;
      if (providerTierInstructions) {
        contextSection += `\n${providerTierInstructions}\n`;
      }
    }

    // Build learnings section
    const learningIds: string[] = [];
    let learningsSection = '';
    if (learnings.length > 0) {
      learningsSection = '\n\n## Applied Learnings\n';
      for (const learning of learnings) {
        learningIds.push(learning.learning_id);
        learningsSection += `\n### ${learning.title}\n${learning.description}\n`;
        if (learning.config) {
          learningsSection += `Config: ${JSON.stringify(learning.config)}\n`;
        }
      }
      this.logger.log(
        `Applied ${learnings.length} learnings to composed prompt`,
      );
    }

    // Build performance context section for agent fork
    const performanceSection = performanceContext
      ? `\n\n${performanceContext}`
      : '';

    // Build system prompt with composed structure
    const systemPrompt = `# You are ${personalityAnalyst.name}

## Your Core Perspective
${personalityAnalyst.perspective}

${analystTierInstructions ? `## Your Analysis Approach\n${analystTierInstructions}\n` : ''}
${contextSection}
## Target Information
- Symbol: ${target.symbol}
- Name: ${target.name}
- Type: ${target.target_type}
${target.context ? `- Context: ${target.context}` : ''}
${learningsSection}${performanceSection}

## Direction Decision Guidelines
- Choose "bullish" if your analysis leans even slightly toward upside — even if conviction is moderate, take a position.
- Choose "bearish" if your analysis leans even slightly toward downside — even if conviction is moderate, take a position.
- Choose "neutral" ONLY when evidence is genuinely contradictory with equal weight on both sides. This should be rare (~10-15% of assessments). When in doubt between neutral and a direction, choose the direction with lower confidence rather than neutral.

Use confidence to reflect your conviction:
- 0.8-1.0: Strong evidence, high conviction
- 0.6-0.8: Moderate evidence, reasonable conviction
- 0.4-0.6: Lean in one direction but evidence is thin
- Below 0.4: Very weak lean — still choose a direction if you can

## Output Format
You must provide your analysis in the following JSON format:
{
  "direction": "bullish" | "bearish" | "neutral",
  "confidence": 0.0-1.0,
  "reasoning": "Your detailed analysis...",
  "key_factors": ["factor1", "factor2", ...],
  "risks": ["risk1", "risk2", ...]
}`;

    // Build user prompt - no suggested direction to avoid anchoring bias
    const userPrompt = `Analyze the following signal:

${input.content}
${input.metadata ? `\nMetadata: ${JSON.stringify(input.metadata)}` : ''}

Provide your independent assessment based on your perspective as ${personalityAnalyst.name}, incorporating the domain and context knowledge provided.`;

    return {
      systemPrompt,
      userPrompt,
      learningIds,
    };
  }

  /**
   * Get human-readable label for scope level
   */
  private getScopeLabel(scopeLevel: string, target: Target): string {
    switch (scopeLevel) {
      case 'runner':
        return 'General Knowledge';
      case 'domain':
        return `Domain Knowledge (${target.target_type})`;
      case 'universe':
        return 'Sector/Universe Knowledge';
      case 'target':
        return `Instrument Knowledge (${target.symbol})`;
      default:
        return 'Additional Context';
    }
  }

  /**
   * Build prompt for prediction generation (aggregating predictors)
   */
  buildPredictionPrompt(params: {
    target: Target;
    predictors: Array<{
      direction: string;
      strength: number;
      confidence: number;
      reasoning: string;
      analyst_slug: string;
    }>;
    learnings: ActiveLearning[];
  }): BuiltPrompt {
    const { target, predictors, learnings } = params;

    this.logger.log(
      `Building prediction prompt for target: ${target.symbol} with ${predictors.length} predictors`,
    );

    // Build predictors summary
    let predictorsSection = '\n## Active Predictors\n';
    for (const p of predictors) {
      predictorsSection += `\n### ${p.analyst_slug} (Strength: ${p.strength}, Confidence: ${p.confidence})\n`;
      predictorsSection += `Direction: ${p.direction}\n`;
      predictorsSection += `Reasoning: ${p.reasoning}\n`;
    }

    // Build learnings section
    const learningIds: string[] = [];
    let learningsSection = '';
    if (learnings.length > 0) {
      learningsSection = '\n\n## Applied Learnings\n';
      for (const learning of learnings) {
        learningIds.push(learning.learning_id);
        learningsSection += `\n### ${learning.title}\n${learning.description}\n`;
      }
      this.logger.log(
        `Applied ${learnings.length} learnings to prediction prompt`,
      );
    }

    const systemPrompt = `You are a prediction synthesis engine that combines multiple analyst assessments into a final prediction.

## Target Information
- Symbol: ${target.symbol}
- Name: ${target.name}
- Type: ${target.target_type}
${target.context ? `- Context: ${target.context}` : ''}
${predictorsSection}
${learningsSection}

## Output Format
Synthesize the analyst assessments and provide a prediction in JSON format:
{
  "direction": "up" | "down" | "flat",
  "confidence": 0.0-1.0,
  "magnitude": "small" | "medium" | "large",
  "timeframe_hours": number,
  "reasoning": "Your synthesis of the analyst assessments...",
  "consensus_strength": 0.0-1.0
}`;

    const userPrompt = `Based on the ${predictors.length} active predictors above, synthesize a final prediction for ${target.symbol}.

Consider:
1. Weight each predictor by strength and confidence
2. Look for consensus or divergence among analysts
3. Factor in any applicable learnings
4. Provide a clear direction and confidence level`;

    return {
      systemPrompt,
      userPrompt,
      learningIds,
    };
  }

  /**
   * Build prompt for re-evaluation of a prediction
   */
  buildReEvaluationPrompt(params: {
    analyst: ActiveAnalyst;
    tier: LlmTier;
    target: Target;
    originalPrediction: {
      direction: string;
      confidence: number;
      reasoning: string;
    };
    actualOutcome: string;
    learnings: ActiveLearning[];
  }): BuiltPrompt {
    const {
      analyst,
      tier,
      target,
      originalPrediction,
      actualOutcome,
      learnings,
    } = params;

    this.logger.log(
      `Building re-evaluation prompt for analyst: ${analyst.slug}, target: ${target.symbol}`,
    );

    // Get tier-specific instructions
    const tierInstructions =
      analyst.tier_instructions[tier] || analyst.tier_instructions.silver || '';

    // Build learnings section
    const learningIds: string[] = [];
    let learningsSection = '';
    if (learnings.length > 0) {
      learningsSection = '\n\n## Applied Learnings\n';
      for (const learning of learnings) {
        learningIds.push(learning.learning_id);
        learningsSection += `\n### ${learning.title}\n${learning.description}\n`;
      }
    }

    const systemPrompt = `You are ${analyst.name}, a ${analyst.perspective}.

## Your Role
${analyst.perspective}

${tierInstructions ? `## Analysis Instructions\n${tierInstructions}` : ''}

## Target Information
- Symbol: ${target.symbol}
- Name: ${target.name}
- Type: ${target.target_type}
${target.context ? `- Context: ${target.context}` : ''}
${learningsSection}

## Re-Evaluation Task
Your previous prediction was:
- Direction: ${originalPrediction.direction}
- Confidence: ${originalPrediction.confidence}
- Reasoning: ${originalPrediction.reasoning}

The actual outcome was: ${actualOutcome}

## Output Format
Provide your re-evaluation in JSON format:
{
  "was_correct": true | false,
  "confidence_was_appropriate": true | false,
  "what_was_missed": "Analysis of what you missed...",
  "what_worked": "Analysis of what you got right...",
  "suggested_learning": {
    "title": "Brief title",
    "description": "What should be learned from this",
    "type": "rule" | "pattern" | "avoid"
  }
}`;

    const userPrompt = `Re-evaluate your previous prediction in light of the actual outcome.

Focus on:
1. What factors did you correctly identify?
2. What factors did you miss or misweight?
3. Was your confidence level appropriate?
4. What pattern or learning should be extracted?`;

    return {
      systemPrompt,
      userPrompt,
      learningIds,
    };
  }
}
