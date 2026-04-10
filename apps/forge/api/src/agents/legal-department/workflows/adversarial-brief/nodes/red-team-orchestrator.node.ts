/**
 * Red Team Orchestrator Node — coordinates 3 attacking agents that argue
 * against the brief from the opposing side's perspective.
 *
 * Agents:
 * 1. Counter-Argument — attacks logical structure, identifies fallacies
 * 2. Distinguishing-Cases — finds cases that undermine cited authorities
 * 3. Factual-Challenge — identifies unsupported assertions, missing evidence
 *
 * CRITICAL: The Distinguishing-Cases agent uses CitationGroundingService.
 * Any citation not verified via RAG is stripped before output.
 *
 * Provider-aware: parallel for cloud, sequential for Ollama.
 */
import type { LLMHttpClientService } from '../../../../shared/services/llm-http-client.service';
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import type { WorkflowRagService } from '../../../../shared/services/workflow-rag.service';
import { callLLMMaybeWithReasoning } from '../../../../shared/services/llm-maybe-reasoning.helper';
import { verifyBatch } from '../../../../shared/services/citation-grounding.service';
import type {
  AdversarialBriefState,
  RedTeamOutput,
  AttackEntry,
} from '../adversarial-brief.state';

const SINGLE_STREAM_PROVIDERS = new Set(['ollama']);
const RAG_COLLECTION = 'law-contracts-hybrid';

const COUNTER_ARGUMENT_PROMPT = `You are opposing counsel tasked with DESTROYING the legal arguments in a brief. You are adversarial — your goal is to find every weakness, fallacy, and gap in the reasoning.

You will receive:
- The brief's arguments (structured)
- The Blue Team's defenses of those arguments

For each argument, produce an attack:
- Identify logical fallacies or weak reasoning
- Find gaps in the argument chain
- Rate the severity of each weakness (1-10, where 10 is fatal to the argument)

Respond with JSON:
{
  "attacks": [
    {
      "id": "<unique id, e.g. atk-arg-1>",
      "agentRole": "counter-argument",
      "targetId": "<argument id being attacked>",
      "attack": "<your attack>",
      "severity": <1-10>,
      "category": "argument"
    }
  ]
}`;

const DISTINGUISHING_CASES_PROMPT = `You are a legal research specialist for opposing counsel. Your goal is to find cases and authorities that DISTINGUISH, LIMIT, or OVERRULE the cases cited in the brief.

You will receive:
- The brief's citations (structured)
- The Blue Team's defense of those citations

For each citation, find counter-authorities:
- Cases that distinguish the cited case on its facts
- More recent decisions that limit or overrule the cited authority
- Alternative interpretations of statutes cited
- Rate the severity of each weakness (1-10, where 10 means the citation is fatally undermined)

IMPORTANT: Only cite real cases you are certain exist. Include the full citation.

Respond with JSON:
{
  "attacks": [
    {
      "id": "<unique id, e.g. atk-cite-1>",
      "agentRole": "distinguishing-cases",
      "targetId": "<citation id being attacked>",
      "attack": "<your analysis of why this citation is weak>",
      "severity": <1-10>,
      "category": "citation",
      "counterAuthority": ["<case citations you are using as counter-authority>"]
    }
  ]
}`;

const FACTUAL_CHALLENGE_PROMPT = `You are a fact investigator for opposing counsel. Your goal is to find every unsupported factual assertion, missing evidence, and contradiction in the brief.

You will receive:
- The brief's factual assertions (structured)
- The Blue Team's defense of those assertions

For each assertion, challenge it:
- Identify assertions with insufficient evidentiary support
- Find contradictions between factual claims
- Note missing evidence that a competent opponent would demand
- Rate the severity of each gap (1-10, where 10 means the assertion is completely unsupported)

Respond with JSON:
{
  "attacks": [
    {
      "id": "<unique id, e.g. atk-fact-1>",
      "agentRole": "factual-challenge",
      "targetId": "<assertion id being attacked>",
      "attack": "<your challenge>",
      "severity": <1-10>,
      "category": "factual"
    }
  ]
}`;

export function createRedTeamOrchestratorNode(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
  workflowRag?: WorkflowRagService,
) {
  return async function redTeamOrchestratorNode(
    state: AdversarialBriefState,
  ): Promise<Partial<AdversarialBriefState>> {
    const ctx = state.executionContext;
    const round = state.currentRound;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `Red Team attacking (Round ${round})`,
      { step: 'red_team', progress: 40 + round * 10, round },
    );

    const briefStructure = state.briefStructure;
    if (!briefStructure) {
      return {
        error: 'No brief structure available for Red Team',
        status: 'failed',
      };
    }

    const blueDefenses = state.blueTeamOutput;
    const defenseContext = blueDefenses
      ? `\n\nBlue Team defenses:\n${JSON.stringify(blueDefenses.defenses, null, 2)}`
      : '';

    const runAgent = async (
      systemPrompt: string,
      agentName: string,
      content: string,
    ): Promise<AttackEntry[]> => {
      const response = await callLLMMaybeWithReasoning(llmClient, {
        context: ctx,
        systemMessage: systemPrompt,
        userMessage: content,
        temperature: 0.4,
        maxTokens: 3000,
        callerName: `adversarial-brief:red-team:${agentName}`,
      });

      try {
        const parsed = JSON.parse(response.text) as { attacks: AttackEntry[] };
        return parsed.attacks;
      } catch {
        return [];
      }
    };

    const isSingleStream = SINGLE_STREAM_PROVIDERS.has(ctx.provider);

    const argumentContent = `Brief arguments:\n${JSON.stringify(briefStructure.arguments, null, 2)}${defenseContext}`;
    const citationContent = `Brief citations:\n${JSON.stringify(briefStructure.citations, null, 2)}${defenseContext}`;
    const factsContent = `Brief factual assertions:\n${JSON.stringify(briefStructure.factualAssertions, null, 2)}${defenseContext}`;

    let counterArgAttacks: AttackEntry[];
    let distCasesAttacks: AttackEntry[];
    let factChallengeAttacks: AttackEntry[];

    if (isSingleStream) {
      counterArgAttacks = await runAgent(
        COUNTER_ARGUMENT_PROMPT,
        'counter-argument',
        argumentContent,
      );
      distCasesAttacks = await runAgent(
        DISTINGUISHING_CASES_PROMPT,
        'distinguishing-cases',
        citationContent,
      );
      factChallengeAttacks = await runAgent(
        FACTUAL_CHALLENGE_PROMPT,
        'factual-challenge',
        factsContent,
      );
    } else {
      [counterArgAttacks, distCasesAttacks, factChallengeAttacks] =
        await Promise.all([
          runAgent(
            COUNTER_ARGUMENT_PROMPT,
            'counter-argument',
            argumentContent,
          ),
          runAgent(
            DISTINGUISHING_CASES_PROMPT,
            'distinguishing-cases',
            citationContent,
          ),
          runAgent(FACTUAL_CHALLENGE_PROMPT, 'factual-challenge', factsContent),
        ]);
    }

    // Citation grounding: verify counter-authorities from distinguishing-cases agent
    if (workflowRag) {
      for (const attack of distCasesAttacks) {
        if (attack.counterAuthority && attack.counterAuthority.length > 0) {
          const { verified, stripped } = await verifyBatch(
            attack.counterAuthority,
            workflowRag,
            RAG_COLLECTION,
            ctx.orgSlug,
          );
          attack.counterAuthority = verified.map((v) => v.text);
          attack.strippedCitations = stripped.length > 0 ? stripped : undefined;
        }
      }
    }

    const allAttacks = [
      ...counterArgAttacks,
      ...distCasesAttacks,
      ...factChallengeAttacks,
    ];

    const redTeamOutput: RedTeamOutput = {
      attacks: allAttacks,
      summary: `Red Team produced ${allAttacks.length} attacks in round ${round}`,
    };

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `Red Team complete: ${allAttacks.length} attacks (Round ${round})`,
      { step: 'red_team_complete', progress: 50 + round * 10, round },
    );

    return { redTeamOutput };
  };
}
