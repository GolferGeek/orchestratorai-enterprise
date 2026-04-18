import { MemorySaver } from '@langchain/langgraph';
import { createDepositionPrepGraph } from './deposition-prep.graph';
import { LLMHttpClientService } from '../../../shared/services/llm-http-client.service';
import { ObservabilityService } from '../../../shared/services/observability.service';
import { PostgresCheckpointerService } from '../../../shared/persistence/postgres-checkpointer.service';
import { ExecutionContext } from '@orchestrator-ai/transport-types';
import type { DepositionPrepInput } from './deposition-prep.types';
import type { DepositionPrepState } from './deposition-prep.state';

const mockCtx: ExecutionContext = {
  orgSlug: 'test-org',
  userId: 'test-user',
  conversationId: 'conv-dep-123',
  agentSlug: 'legal-department',
  agentType: 'langgraph',
  provider: 'ollama',
  model: 'gemma4:e4b',
};

const mockInput: DepositionPrepInput = {
  mode: 'preparation-outline',
  caseFacts:
    'Plaintiff alleges breach of fiduciary duty related to a board vote on March 15.',
  witnessBackground: 'Jane Smith, CFO, has been with the company for 10 years.',
  depositionTopics: [
    'Board vote process',
    'Financial disclosures',
    'Prior communications',
  ],
  witnessType: 'corporate-officer',
  priorStatements: 'Witness stated in emails that the vote was unanimous.',
};

const mockCaseAnalysis = JSON.stringify({
  themes: [
    {
      id: 'theme-1',
      description: 'Board vote irregularities',
      relevance: 'Core breach claim',
    },
    {
      id: 'theme-2',
      description: 'Financial disclosure failures',
      relevance: 'Damages basis',
    },
  ],
  inconsistencies: ['Email says unanimous but minutes show abstention'],
  legalTheories: ['Breach of fiduciary duty', 'Securities fraud'],
  exhibitCandidates: ['Board minutes March 15', 'Financial statements Q1'],
});

function makeQuestionSet(themeId: string) {
  return JSON.stringify({
    themeId,
    openEnded: [
      {
        question: 'Describe the board meeting.',
        strategicPurpose: 'Establish foundation',
        expectedWitnessResponse: 'Witness will describe the meeting.',
      },
    ],
    followUp: [
      {
        question: 'Who else was present?',
        strategicPurpose: 'Pin down attendees',
        expectedWitnessResponse: 'List of attendees.',
      },
    ],
    confrontation: [
      {
        question:
          'Your email says unanimous but the minutes show an abstention — which is correct?',
        strategicPurpose: 'Expose inconsistency',
        expectedWitnessResponse: 'Witness will try to explain.',
      },
    ],
    trap: [
      {
        question: 'So you certify the minutes are accurate?',
        strategicPurpose: 'Box in the witness',
        expectedWitnessResponse: 'Any answer is useful.',
      },
    ],
  });
}

const mockStrategies = JSON.stringify({
  caseStrategies: [
    'Pin down the vote sequence',
    'Use financial exhibits early',
  ],
});

const mockEvasion = JSON.stringify({
  evasionTactics: [
    'Claims of poor memory',
    'Defers to counsel',
    'Requests to see documents',
  ],
});

const mockPreparationOutline = JSON.stringify({
  topics: [
    {
      title: 'Board Vote Process',
      questions: {
        themeId: 'theme-1',
        openEnded: [
          {
            question: 'Describe the board meeting.',
            strategicPurpose: 'Establish foundation',
            expectedWitnessResponse: 'General description.',
          },
        ],
        followUp: [],
        confrontation: [],
        trap: [],
      },
    },
  ],
  exhibitList: [
    {
      name: 'Board minutes March 15',
      timing: 'After foundation questions',
      suggestedFollowUp: 'Is this an accurate record?',
    },
  ],
  redFlags: [
    'Witness may claim attorney-client privilege for certain discussions',
  ],
  fallbackQuestions: ['What were your duties as CFO at the time?'],
});

function createMockLLMClient(
  responses: string[],
): jest.Mocked<LLMHttpClientService> {
  let callIndex = 0;
  return {
    callLLM: jest.fn().mockImplementation(() => {
      const text = responses[callIndex] ?? responses[responses.length - 1]!;
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

describe('createDepositionPrepGraph', () => {
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
    const mockLLMClient = createMockLLMClient([mockCaseAnalysis]);
    const graph = await createDepositionPrepGraph(
      mockLLMClient,
      mockObservability,
      mockCheckpointer,
    );
    expect(graph).toBeDefined();
  });

  it('should run all 4 nodes and produce preparationOutline for preparation-outline mode', async () => {
    // Responses in order:
    // 1. case_analysis (1 call)
    // 2. question_generation (1 call per theme = 2 calls)
    // 3. deposition_research (2 calls: strategies + evasion)
    // 4. deposition_synthesis (1 call)
    const mockLLMClient = createMockLLMClient([
      mockCaseAnalysis,
      makeQuestionSet('theme-1'),
      makeQuestionSet('theme-2'),
      mockStrategies,
      mockEvasion,
      mockPreparationOutline,
    ]);

    const graph = await createDepositionPrepGraph(
      mockLLMClient,
      mockObservability,
      mockCheckpointer,
    );

    const rawResult = await graph.invoke(
      {
        executionContext: mockCtx,
        mode: 'preparation-outline',
        input: mockInput,
      },
      { configurable: { thread_id: 'test-prep-outline' } },
    );
    const result = rawResult as DepositionPrepState;

    expect(result.status).toBe('completed');
    expect(result.preparationOutline).toBeDefined();
    expect(result.preparationOutline!.topics).toHaveLength(1);
    expect(result.preparationOutline!.exhibitList).toHaveLength(1);
    expect(result.preparationOutline!.redFlags).toHaveLength(1);
    expect(result.caseAnalysis).toBeDefined();
    expect(result.generatedQuestions).toHaveLength(2);
    expect(result.researchFindings).toBeDefined();
  });

  it('should fail gracefully when case analysis returns invalid JSON', async () => {
    const mockLLMClient = createMockLLMClient(['not valid json at all']);

    const graph = await createDepositionPrepGraph(
      mockLLMClient,
      mockObservability,
      mockCheckpointer,
    );

    const result = await graph.invoke(
      {
        executionContext: mockCtx,
        mode: 'preparation-outline',
        input: mockInput,
      },
      { configurable: { thread_id: 'test-bad-json' } },
    );

    expect(result.status).toBe('failed');
    expect(result.error).toContain('Failed to parse case analysis response');
  });

  it('should fail when question generation returns invalid JSON', async () => {
    const mockLLMClient = createMockLLMClient([
      mockCaseAnalysis,
      'invalid json for question set',
    ]);

    const graph = await createDepositionPrepGraph(
      mockLLMClient,
      mockObservability,
      mockCheckpointer,
    );

    const result = await graph.invoke(
      {
        executionContext: mockCtx,
        mode: 'preparation-outline',
        input: mockInput,
      },
      { configurable: { thread_id: 'test-bad-question-json' } },
    );

    expect(result.status).toBe('failed');
    expect(result.error).toContain(
      'Failed to parse question generation response',
    );
  });

  it('should include opposing counsel profile when opposingCounselName is set', async () => {
    const mockCounselStyle = JSON.stringify({
      opposingCounselStyle: 'Aggressive, document-heavy depositions',
    });
    const mockLLMClient = createMockLLMClient([
      mockCaseAnalysis,
      makeQuestionSet('theme-1'),
      makeQuestionSet('theme-2'),
      mockStrategies,
      mockEvasion,
      mockCounselStyle,
      mockPreparationOutline,
    ]);

    const graph = await createDepositionPrepGraph(
      mockLLMClient,
      mockObservability,
      mockCheckpointer,
    );

    const inputWithCounsel: DepositionPrepInput = {
      ...mockInput,
      opposingCounselName: 'John Doe, Esq.',
    };

    const rawResult = await graph.invoke(
      {
        executionContext: mockCtx,
        mode: 'preparation-outline',
        input: inputWithCounsel,
      },
      { configurable: { thread_id: 'test-with-counsel' } },
    );
    const result = rawResult as DepositionPrepState;

    expect(result.status).toBe('completed');
    expect(result.researchFindings!.opposingCounselStyle).toBe(
      'Aggressive, document-heavy depositions',
    );
  });

  it('should run opposing_perspective → cross_exam_generation → answer_coaching for predicted-cross-exam mode', async () => {
    const mockOpposingPerspective = JSON.stringify({
      depositionGoals: ['Establish knowledge', 'Pin down timeline'],
      availableDocuments: ['Board minutes', 'CFO emails'],
      witnessVulnerabilities: [
        'Prior inconsistent statement about vote',
        'Lack of documentation for key decision',
      ],
    });

    const mockPredictedQuestions = JSON.stringify([
      {
        category: 'opening',
        question: 'How long have you been CFO?',
        expectedFollowup:
          'And during that time were you responsible for disclosures?',
      },
      {
        category: 'core-substance',
        question: 'What was the vote count on March 15?',
        expectedFollowup: 'And you would have documented any abstention?',
      },
      {
        category: 'confrontation',
        question:
          'Your email says unanimous — but the minutes show an abstention. Which is accurate?',
        expectedFollowup:
          'So either your email was wrong or the minutes were wrong?',
      },
      {
        category: 'trap',
        question: 'You certify these minutes are accurate?',
        expectedFollowup: 'So you stand by every word?',
      },
    ]);

    const mockAnswerCoaching = JSON.stringify({
      '0': {
        answerFramework: 'State tenure factually, do not volunteer context',
        dangerZones: ['Volunteering scope of responsibility'],
        followupHandling: 'Confirm disclosure responsibility is documented',
        dontRecallAssessment: 'dangerous',
      },
      '1': {
        answerFramework: 'Reference the actual minutes document',
        dangerZones: ['Guessing the count from memory'],
        followupHandling: 'Offer to review the document',
        dontRecallAssessment: 'dangerous',
      },
      '2': {
        answerFramework:
          'Acknowledge the discrepancy and explain which is authoritative',
        dangerZones: ['Choosing one without explanation'],
        followupHandling: 'Explain that minutes are the official record',
        dontRecallAssessment: 'context-dependent',
      },
      '3': {
        answerFramework:
          'Qualify the certification — "to the best of my knowledge"',
        dangerZones: ['Unconditional agreement'],
        followupHandling: 'Maintain the qualified certification',
        dontRecallAssessment: 'safe',
      },
    });

    const mockLLMClient = createMockLLMClient([
      mockCaseAnalysis,
      mockOpposingPerspective,
      mockPredictedQuestions,
      mockAnswerCoaching,
    ]);

    const graph = await createDepositionPrepGraph(
      mockLLMClient,
      mockObservability,
      mockCheckpointer,
    );

    const crossExamInput: DepositionPrepInput = {
      ...mockInput,
      mode: 'predicted-cross-exam',
    };

    const rawResult = await graph.invoke(
      {
        executionContext: mockCtx,
        mode: 'predicted-cross-exam',
        input: crossExamInput,
      },
      { configurable: { thread_id: 'test-predicted-cross-exam' } },
    );
    const result = rawResult as DepositionPrepState;

    expect(result.status).toBe('completed');
    expect(result.opposingPerspective).toBeDefined();
    expect(result.opposingPerspective!.witnessVulnerabilities).toHaveLength(2);
    expect(result.predictedQuestions).toHaveLength(4);
    expect(result.predictedQuestions?.[0]?.category).toBe('opening');
    expect(result.predictedQuestions?.[2]?.category).toBe('confrontation');
    expect(result.answerCoaching).toBeDefined();
    expect(result.answerCoaching?.[0]).toBeDefined();
    expect(result.answerCoaching?.[0]?.dontRecallAssessment).toBe('dangerous');
    // preparation-outline fields should NOT be set in this mode
    expect(result.preparationOutline).toBeUndefined();
  });

  it('should emit progress events at each node', async () => {
    const mockLLMClient = createMockLLMClient([
      mockCaseAnalysis,
      makeQuestionSet('theme-1'),
      makeQuestionSet('theme-2'),
      mockStrategies,
      mockEvasion,
      mockPreparationOutline,
    ]);

    const graph = await createDepositionPrepGraph(
      mockLLMClient,
      mockObservability,
      mockCheckpointer,
    );

    await graph.invoke(
      {
        executionContext: mockCtx,
        mode: 'preparation-outline',
        input: mockInput,
      },
      { configurable: { thread_id: 'test-progress-events' } },
    );

    expect(mockObservability.emitStarted).toHaveBeenCalledTimes(1);
    expect(mockObservability.emitProgress).toHaveBeenCalled();
    expect(mockObservability.emitCompleted).toHaveBeenCalledTimes(1);
  });
});
