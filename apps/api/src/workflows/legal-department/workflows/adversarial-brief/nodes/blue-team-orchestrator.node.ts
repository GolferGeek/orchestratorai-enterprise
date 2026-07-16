/**
 * Blue Team Orchestrator Node — coordinates 3 defending agents that argue
 * in favor of the brief.
 *
 * Agents:
 * 1. Argument Defender — defends the logical structure of each argument
 * 2. Authority Defender — defends cited authorities, rebuts counter-cases
 * 3. Facts Defender — defends factual assertions, identifies corroborating evidence
 *
 * Provider-aware: parallel for cloud, sequential for Ollama.
 */
import type { LLMHttpClientService } from '../../../../shared/services/llm-http-client.service';
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import { callLLMMaybeWithReasoning } from '../../../../shared/services/llm-maybe-reasoning.helper';
import { stripMarkdownFences } from '../../../nodes/specialist-utils';
import type {
  AdversarialBriefState,
  BlueTeamOutput,
  DefenseEntry,
} from '../adversarial-brief.state';

const SINGLE_STREAM_PROVIDERS = new Set(['ollama']);

const ARGUMENT_DEFENDER_PROMPT = `You are a senior litigator defending a legal brief. Your role is to defend the logical structure and legal reasoning of each argument in the brief.

You will receive:
- The brief's arguments (structured)
- Any attacks from the opposing Red Team (if not the first round)

For each argument that was attacked (or all arguments on round 1), provide a defense:
- Strengthen the logical chain
- Address any logical fallacies raised by the opposition
- Reinforce the legal reasoning

Respond with JSON:
{
  "defenses": [
    {
      "agentRole": "argument-defender",
      "targetId": "<argument id>",
      "defense": "<your defense>",
      "confidence": <0.0-1.0>
    }
  ]
}`;

const AUTHORITY_DEFENDER_PROMPT = `You are a legal research specialist defending the authorities cited in a legal brief. Your role is to defend the cited case law, statutes, and regulations.

You will receive:
- The brief's citations (structured)
- Any attacks from the opposing Red Team's distinguishing-cases agent (if not the first round)

For each citation that was attacked (or key citations on round 1), provide a defense:
- Explain why the authority is on point
- Distinguish any counter-cases raised by the opposition
- Identify additional supporting authority if possible

Respond with JSON:
{
  "defenses": [
    {
      "agentRole": "authority-defender",
      "targetId": "<citation id>",
      "defense": "<your defense>",
      "confidence": <0.0-1.0>,
      "supportingAuthority": ["<additional supporting cases if any>"]
    }
  ]
}`;

const FACTS_DEFENDER_PROMPT = `You are a fact-checking specialist defending the factual assertions in a legal brief. Your role is to defend every factual claim the brief relies on.

You will receive:
- The brief's factual assertions (structured)
- Any attacks from the opposing Red Team's factual-challenge agent (if not the first round)

For each assertion that was attacked (or all assertions on round 1), provide a defense:
- Identify corroborating evidence
- Address gaps raised by the opposition
- Strengthen the factual foundation

Respond with JSON:
{
  "defenses": [
    {
      "agentRole": "facts-defender",
      "targetId": "<assertion id>",
      "defense": "<your defense>",
      "confidence": <0.0-1.0>
    }
  ]
}`;

export function createBlueTeamOrchestratorNode(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
) {
  return async function blueTeamOrchestratorNode(
    state: AdversarialBriefState,
  ): Promise<Partial<AdversarialBriefState>> {
    const ctx = state.executionContext;
    const round = state.currentRound + 1;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `Blue Team defending (Round ${round})`,
      { step: 'blue_team', progress: 25 + round * 10, round },
    );

    const briefStructure = state.briefStructure;
    if (!briefStructure) {
      return {
        error: 'No brief structure available for Blue Team',
        status: 'failed',
      };
    }

    // Build context for Blue Team: brief structure + previous Red Team attacks
    const previousAttacks = state.redTeamOutput;
    const attackContext = previousAttacks
      ? `\n\nRed Team attacks from previous round:\n${JSON.stringify(previousAttacks.attacks, null, 2)}`
      : '\n\nThis is the first round. Provide initial defenses for all key elements.';

    const runAgent = async (
      systemPrompt: string,
      agentName: string,
      content: string,
    ): Promise<DefenseEntry[]> => {
      const response = await callLLMMaybeWithReasoning(llmClient, {
        context: ctx,
        systemMessage: systemPrompt,
        userMessage: content,
        temperature: 0.3,
        maxTokens: 3000,
        callerName: `adversarial-brief:blue-team:${agentName}`,
      });

      try {
        const parsed = JSON.parse(stripMarkdownFences(response.text)) as {
          defenses: DefenseEntry[];
        };
        return parsed.defenses;
      } catch {
        return [];
      }
    };

    const isSingleStream = SINGLE_STREAM_PROVIDERS.has(ctx.provider);

    const argumentContent = `Brief arguments:\n${JSON.stringify(briefStructure.arguments, null, 2)}${attackContext}`;
    const authorityContent = `Brief citations:\n${JSON.stringify(briefStructure.citations, null, 2)}${attackContext}`;
    const factsContent = `Brief factual assertions:\n${JSON.stringify(briefStructure.factualAssertions, null, 2)}${attackContext}`;

    let allDefenses: DefenseEntry[];

    if (isSingleStream) {
      // Sequential for Ollama
      const argDefenses = await runAgent(
        ARGUMENT_DEFENDER_PROMPT,
        'argument-defender',
        argumentContent,
      );
      const authDefenses = await runAgent(
        AUTHORITY_DEFENDER_PROMPT,
        'authority-defender',
        authorityContent,
      );
      const factDefenses = await runAgent(
        FACTS_DEFENDER_PROMPT,
        'facts-defender',
        factsContent,
      );
      allDefenses = [...argDefenses, ...authDefenses, ...factDefenses];
    } else {
      // Parallel for cloud providers
      const [argDefenses, authDefenses, factDefenses] = await Promise.all([
        runAgent(
          ARGUMENT_DEFENDER_PROMPT,
          'argument-defender',
          argumentContent,
        ),
        runAgent(
          AUTHORITY_DEFENDER_PROMPT,
          'authority-defender',
          authorityContent,
        ),
        runAgent(FACTS_DEFENDER_PROMPT, 'facts-defender', factsContent),
      ]);
      allDefenses = [...argDefenses, ...authDefenses, ...factDefenses];
    }

    const blueTeamOutput: BlueTeamOutput = {
      defenses: allDefenses,
      summary: `Blue Team produced ${allDefenses.length} defenses in round ${round}`,
    };

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `Blue Team complete: ${allDefenses.length} defenses (Round ${round})`,
      { step: 'blue_team_complete', progress: 35 + round * 10, round },
    );

    return {
      blueTeamOutput,
      currentRound: round,
    };
  };
}
