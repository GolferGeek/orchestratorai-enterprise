import { MemorySaver, isInterrupted } from '@langchain/langgraph';
import { createAdversarialBriefGraph } from './adversarial-brief.graph';
import { LLMHttpClientService } from '../../../shared/services/llm-http-client.service';
import { ObservabilityService } from '../../../shared/services/observability.service';
import { PostgresCheckpointerService } from '../../../shared/persistence/postgres-checkpointer.service';
import { ExecutionContext } from '@orchestrator-ai/transport-types';
import type { AdversarialBriefState } from './adversarial-brief.state';

const mockCtx: ExecutionContext = {
  orgSlug: 'test-org',
  userId: 'test-user',
  conversationId: 'conv-adv-123',
  agentSlug: 'legal-department',
  agentType: 'langgraph',
  provider: 'anthropic',
  model: 'claude-sonnet-4-20250514',
};

const mockBriefStructure = JSON.stringify({
  arguments: [
    {
      id: 'arg-1',
      claim: 'Defendant violated Section 301',
      support: 'Evidence shows discharge of pollutants',
      citations: ['cite-1'],
    },
  ],
  citations: [
    {
      id: 'cite-1',
      text: 'Clean Water Act § 301(a)',
      source: 'CWA',
      verified: false,
    },
  ],
  factualAssertions: [
    {
      id: 'fact-1',
      assertion: 'Defendant discharged pollutants on March 15',
      support: 'EPA inspection report',
    },
  ],
});

const mockBlueTeamResponse = JSON.stringify({
  defenses: [
    {
      agentRole: 'argument-defender',
      targetId: 'arg-1',
      defense: 'The argument is well-supported by the evidence',
      confidence: 0.9,
    },
  ],
});

function makeRedTeamResponse(severity: number) {
  return JSON.stringify({
    attacks: [
      {
        id: 'atk-1',
        agentRole: 'counter-argument',
        targetId: 'arg-1',
        attack: 'The evidence is circumstantial',
        severity,
        category: 'argument',
      },
    ],
  });
}

const mockSynthesisResponse = JSON.stringify({
  attacks: [
    {
      id: 'atk-1',
      severity: 5,
      category: 'argument',
      description: 'Weak logical chain',
      briefSection: 'Section I',
      redTeamReasoning: 'Circumstantial evidence',
      blueTeamRebuttal: 'Supported by EPA report',
      judgeAssessment: 'Moderate weakness',
      recommendation: 'Add direct evidence',
    },
  ],
  weakCitations: [],
  factualGaps: [],
  summary: {
    totalRounds: 1,
    convergenceReason: 'Test convergence',
    overallStrength: 7,
    criticalWeaknesses: 0,
    moderateWeaknesses: 1,
    minorWeaknesses: 0,
  },
});

function makeJudgeResponse(severity: number) {
  return JSON.stringify({
    exchanges: [
      {
        argumentId: 'arg-1',
        positionAScore: {
          legalSoundness: 7,
          factualSupport: 6,
          citationQuality: 7,
          persuasiveness: 6,
        },
        positionBScore: {
          legalSoundness: 5,
          factualSupport: 4,
          citationQuality: 5,
          persuasiveness: 5,
        },
        overallSeverity: severity,
        assessment: 'Test assessment',
      },
    ],
    roundSummary: `Judge scored round with severity ${severity}`,
  });
}

function createMockLLMClient(
  responses: string[],
): jest.Mocked<LLMHttpClientService> {
  let callIndex = 0;
  return {
    callLLM: jest.fn().mockImplementation(() => {
      const text = responses[callIndex] || responses[responses.length - 1]!;
      callIndex++;
      return Promise.resolve({ text });
    }),
  } as unknown as jest.Mocked<LLMHttpClientService>;
}

function createMockObservability(): jest.Mocked<ObservabilityService> {
  return {
    emitProgress: jest.fn().mockResolvedValue(undefined),
    emitStarted: jest.fn().mockResolvedValue(undefined),
    emitCompleted: jest.fn().mockResolvedValue(undefined),
    emitFailed: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<ObservabilityService>;
}

describe('createAdversarialBriefGraph', () => {
  let mockLLMClient: jest.Mocked<LLMHttpClientService>;
  let mockObservability: jest.Mocked<ObservabilityService>;
  let mockCheckpointer: jest.Mocked<PostgresCheckpointerService>;
  const memorySaver = new MemorySaver();

  beforeEach(() => {
    mockObservability = createMockObservability();
    mockCheckpointer = {
      getSaver: jest.fn().mockResolvedValue(memorySaver),
    } as unknown as jest.Mocked<PostgresCheckpointerService>;
  });

  it('should create the graph', async () => {
    mockLLMClient = createMockLLMClient([mockBriefStructure]);
    const graph = await createAdversarialBriefGraph(
      mockLLMClient,
      mockObservability,
      mockCheckpointer,
    );
    expect(graph).toBeDefined();
  });

  it('should run single-round debate and pause at HITL after synthesis', async () => {
    // Brief analysis → Blue (3) → Red (3) → Judge (1) → convergence → synthesis (1) → HITL (pause)
    const lowSeverityRed = makeRedTeamResponse(3);
    const lowSeverityJudge = makeJudgeResponse(3);
    mockLLMClient = createMockLLMClient([
      mockBriefStructure,
      mockBlueTeamResponse,
      mockBlueTeamResponse,
      mockBlueTeamResponse,
      lowSeverityRed,
      lowSeverityRed,
      lowSeverityRed,
      lowSeverityJudge,
      mockSynthesisResponse, // synthesis LLM call
    ]);

    const graph = await createAdversarialBriefGraph(
      mockLLMClient,
      mockObservability,
      mockCheckpointer,
    );

    const result = await graph.invoke(
      {
        executionContext: mockCtx,
        userMessage: 'Stress-test this brief',
        documents: [
          {
            name: 'brief.txt',
            content: 'Defendant violated Section 301 of the Clean Water Act.',
          },
        ],
        maxRounds: 5,
        severityThreshold: 7,
      },
      { configurable: { thread_id: 'test-single-round' } },
    );

    // Graph should be interrupted at HITL
    expect(isInterrupted(result)).toBe(true);
    expect(result.converged).toBe(true);
    expect(result.rounds).toHaveLength(1);
    expect(result.convergenceReason).toContain('no attack above severity');
    expect(result.stressTestReport).toBeDefined();
  });

  it('should loop for multiple rounds when severity is high, then converge', async () => {
    const highSeverityRed = makeRedTeamResponse(9);
    const lowSeverityRed = makeRedTeamResponse(3);
    const highSeverityJudge = makeJudgeResponse(9);
    const lowSeverityJudge = makeJudgeResponse(3);
    mockLLMClient = createMockLLMClient([
      mockBriefStructure,
      // Round 1
      mockBlueTeamResponse,
      mockBlueTeamResponse,
      mockBlueTeamResponse,
      highSeverityRed,
      highSeverityRed,
      highSeverityRed,
      highSeverityJudge,
      // Round 2
      mockBlueTeamResponse,
      mockBlueTeamResponse,
      mockBlueTeamResponse,
      lowSeverityRed,
      lowSeverityRed,
      lowSeverityRed,
      lowSeverityJudge,
      mockSynthesisResponse, // synthesis
    ]);

    const graph = await createAdversarialBriefGraph(
      mockLLMClient,
      mockObservability,
      mockCheckpointer,
    );

    const result = await graph.invoke(
      {
        executionContext: mockCtx,
        userMessage: 'Stress-test this brief',
        documents: [{ name: 'brief.txt', content: 'Defendant is liable.' }],
        maxRounds: 5,
        severityThreshold: 7,
      },
      { configurable: { thread_id: 'test-multi-round' } },
    );

    expect(isInterrupted(result)).toBe(true);
    expect(result.converged).toBe(true);
    expect(result.rounds).toHaveLength(2);
  });

  it('should exit at hard round cap', async () => {
    const highSeverityRed = makeRedTeamResponse(9);
    const highSeverityJudge = makeJudgeResponse(9);
    mockLLMClient = createMockLLMClient([
      mockBriefStructure,
      // Round 1
      mockBlueTeamResponse,
      mockBlueTeamResponse,
      mockBlueTeamResponse,
      highSeverityRed,
      highSeverityRed,
      highSeverityRed,
      highSeverityJudge,
      // Round 2 (cap)
      mockBlueTeamResponse,
      mockBlueTeamResponse,
      mockBlueTeamResponse,
      highSeverityRed,
      highSeverityRed,
      highSeverityRed,
      highSeverityJudge,
      mockSynthesisResponse, // synthesis
    ]);

    const graph = await createAdversarialBriefGraph(
      mockLLMClient,
      mockObservability,
      mockCheckpointer,
    );

    const result = await graph.invoke(
      {
        executionContext: mockCtx,
        userMessage: 'Stress-test this brief',
        documents: [{ name: 'brief.txt', content: 'Defendant is liable.' }],
        maxRounds: 2,
        severityThreshold: 7,
      },
      { configurable: { thread_id: 'test-round-cap' } },
    );

    expect(isInterrupted(result)).toBe(true);
    expect(result.converged).toBe(true);
    expect(result.rounds).toHaveLength(2);
    expect(result.convergenceReason).toContain('Hard round cap');
  });

  it('should fail gracefully when brief analysis returns invalid JSON', async () => {
    mockLLMClient = createMockLLMClient(['not valid json']);

    const graph = await createAdversarialBriefGraph(
      mockLLMClient,
      mockObservability,
      mockCheckpointer,
    );

    const result = await graph.invoke(
      {
        executionContext: mockCtx,
        userMessage: 'Stress-test this brief',
        documents: [{ name: 'brief.txt', content: 'Some brief content.' }],
      },
      { configurable: { thread_id: 'test-bad-json' } },
    );

    expect(result.status).toBe('failed');
    expect(result.error).toContain('Failed to parse brief analysis');
  });

  it('should include judge scores in debate rounds', async () => {
    const lowSeverityRed = makeRedTeamResponse(3);
    const lowSeverityJudge = makeJudgeResponse(3);
    mockLLMClient = createMockLLMClient([
      mockBriefStructure,
      mockBlueTeamResponse,
      mockBlueTeamResponse,
      mockBlueTeamResponse,
      lowSeverityRed,
      lowSeverityRed,
      lowSeverityRed,
      lowSeverityJudge,
      mockSynthesisResponse,
    ]);

    const graph = await createAdversarialBriefGraph(
      mockLLMClient,
      mockObservability,
      mockCheckpointer,
    );

    const result = (await graph.invoke(
      {
        executionContext: mockCtx,
        userMessage: 'Stress-test this brief',
        documents: [{ name: 'brief.txt', content: 'Defendant is liable.' }],
        maxRounds: 5,
        severityThreshold: 7,
      },
      { configurable: { thread_id: 'test-judge-scores' } },
    )) as AdversarialBriefState;

    expect(isInterrupted(result)).toBe(true);
    expect(result.rounds).toHaveLength(1);
    // Judge output should be set on state
    expect(result.judgeOutput).toBeDefined();
    expect(result.judgeOutput!.exchanges).toHaveLength(1);
    expect(result.judgeOutput!.exchanges[0]!.overallSeverity).toBe(3);
    // Position order should be recorded
    expect(['blue-first', 'red-first']).toContain(
      result.judgeOutput!.positionOrder,
    );
  });

  it('should converge based on judge severity, not red team self-report', async () => {
    const highSelfReportRed = makeRedTeamResponse(9);
    const lowJudgeSeverity = makeJudgeResponse(3);
    mockLLMClient = createMockLLMClient([
      mockBriefStructure,
      mockBlueTeamResponse,
      mockBlueTeamResponse,
      mockBlueTeamResponse,
      highSelfReportRed,
      highSelfReportRed,
      highSelfReportRed,
      lowJudgeSeverity,
      mockSynthesisResponse,
    ]);

    const graph = await createAdversarialBriefGraph(
      mockLLMClient,
      mockObservability,
      mockCheckpointer,
    );

    const result = await graph.invoke(
      {
        executionContext: mockCtx,
        userMessage: 'Stress-test this brief',
        documents: [{ name: 'brief.txt', content: 'Defendant is liable.' }],
        maxRounds: 5,
        severityThreshold: 7,
      },
      { configurable: { thread_id: 'test-judge-overrides' } },
    );

    // Should converge in 1 round because judge severity is below threshold
    expect(isInterrupted(result)).toBe(true);
    expect(result.converged).toBe(true);
    expect(result.rounds).toHaveLength(1);
    expect(result.convergenceReason).toContain('no attack above severity');
  });

  it('should fail when no documents are provided', async () => {
    mockLLMClient = createMockLLMClient([]);

    const graph = await createAdversarialBriefGraph(
      mockLLMClient,
      mockObservability,
      mockCheckpointer,
    );

    const result = await graph.invoke(
      {
        executionContext: mockCtx,
        userMessage: 'Stress-test this brief',
        documents: [],
      },
      { configurable: { thread_id: 'test-no-docs' } },
    );

    expect(result.status).toBe('failed');
    expect(result.error).toContain('No brief content');
  });
});
