import { MemorySaver, Command, isInterrupted } from '@langchain/langgraph';
import { createCrossExamSimulationGraph } from './cross-exam-simulation.graph';
import { LLMHttpClientService } from '../../../shared/services/llm-http-client.service';
import { ObservabilityService } from '../../../shared/services/observability.service';
import { PostgresCheckpointerService } from '../../../shared/persistence/postgres-checkpointer.service';
import { ExecutionContext } from '@orchestrator-ai/transport-types';
import type { CrossExamSimulationInput } from './cross-exam-simulation.types';
import type { CrossExamSimulationState } from './cross-exam-simulation.state';

const mockCtx: ExecutionContext = {
  orgSlug: 'test-org',
  userId: 'test-user',
  conversationId: 'conv-sim-123',
  agentSlug: 'legal-department',
  agentType: 'langgraph',
  provider: 'ollama',
  model: 'gemma4:e4b',
};

const mockInput: CrossExamSimulationInput = {
  caseFacts:
    'Plaintiff alleges breach of fiduciary duty by CFO Smith re Q3 disclosures.',
  witnessBackground: 'John Smith, CFO, 15 years at company.',
  priorStatements: 'Smith stated in 2019 he did not review Q3 projections.',
  maxQuestions: 3,
};

const mockStrategy = JSON.stringify({
  topics: ['Q3 disclosures', 'Board communications', 'Prior review process'],
  documentConfrontationMap: {
    'Email-2019':
      'You wrote in 2019 that you did not review projections. Is that accurate?',
  },
  witnessVulnerabilities: [
    'Prior inconsistent statement about Q3 review',
    'Motive to minimize role',
  ],
});

const mockQuestion1 = JSON.stringify({
  question:
    'Mr. Smith, were you responsible for reviewing Q3 financial projections?',
  topic: 'Q3 disclosures',
  move: 'new-topic',
});

const mockQuestion2 = JSON.stringify({
  question:
    'You stated in 2019 that you did not review Q3 projections — is that correct?',
  topic: 'Q3 disclosures',
  move: 'impeach',
});

const mockQuestion3 = JSON.stringify({
  question: 'So you are saying your 2019 statement was false?',
  topic: 'Q3 disclosures',
  move: 'follow-up',
});

const mockScore = JSON.stringify({
  evasion: 6,
  consistency: 7,
  damage: 5,
  coachingNote: 'Witness hedged on key dates — be more specific.',
});

const mockDebrief = JSON.stringify({
  patterns: [
    'Habitual evasion on financial topics',
    'Over-explains when confronted',
  ],
  coachingRecommendations: [
    'Practice answering with specific dates',
    'Avoid volunteering context beyond the question',
    'Review the 2019 statement before deposition',
  ],
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

describe('createCrossExamSimulationGraph', () => {
  let mockObservability: jest.Mocked<ObservabilityService>;
  let mockCheckpointer: jest.Mocked<PostgresCheckpointerService>;
  const memorySaver = new MemorySaver();
  const threadId = 'test-sim-thread';

  beforeEach(() => {
    mockObservability = createMockObservability();
    mockCheckpointer = {
      getSaver: jest.fn().mockResolvedValue(memorySaver),
    } as unknown as jest.Mocked<PostgresCheckpointerService>;
  });

  it('should create the graph', async () => {
    const mockLLMClient = createMockLLMClient([mockStrategy]);
    const graph = await createCrossExamSimulationGraph(
      mockLLMClient,
      mockObservability,
      mockCheckpointer,
    );
    expect(graph).toBeDefined();
  });

  it('(a) should transition to awaiting_answer after first question interrupt', async () => {
    // Responses: setup (1 call) + question generator (1 call) = 2 calls before interrupt
    const mockLLMClient = createMockLLMClient([mockStrategy, mockQuestion1]);

    const graph = await createCrossExamSimulationGraph(
      mockLLMClient,
      mockObservability,
      mockCheckpointer,
    );

    const finalState = await graph.invoke(
      {
        executionContext: mockCtx,
        input: mockInput,
        status: 'processing',
        startedAt: Date.now(),
      },
      { configurable: { thread_id: `${threadId}-a` } },
    );

    expect(isInterrupted(finalState)).toBe(true);
    const interruptPayload = (
      finalState as unknown as { __interrupt__: Array<{ value: unknown }> }
    ).__interrupt__[0]?.value as Record<string, unknown>;
    expect(interruptPayload).toBeDefined();
    expect(interruptPayload['question']).toBeDefined();
    expect(interruptPayload['turn']).toBe(1);
  });

  it('(b) resuming with an answer should advance to next question', async () => {
    // First run: setup + question 1
    const mockLLMClient = createMockLLMClient([
      mockStrategy,
      mockQuestion1,
      mockScore, // answer scorer (after resume)
      mockQuestion2, // next question after move decision
    ]);

    const graph = await createCrossExamSimulationGraph(
      mockLLMClient,
      mockObservability,
      mockCheckpointer,
    );

    const uniqueThread = `${threadId}-b`;

    // Initial invoke — pauses at first question
    await graph.invoke(
      {
        executionContext: mockCtx,
        input: { ...mockInput, maxQuestions: 5 },
        status: 'processing',
        startedAt: Date.now(),
      },
      { configurable: { thread_id: uniqueThread } },
    );

    // Resume with answer — graph processes answer, scores it, decides next move, pauses again
    const answer1Entry = {
      turn: 1,
      answer: 'Yes, I was responsible for reviewing Q3 projections.',
      submittedAt: new Date().toISOString(),
    };

    const afterAnswer = await graph.invoke(
      new Command({ resume: answer1Entry }),
      { configurable: { thread_id: uniqueThread } },
    );

    // Should be interrupted again at second question
    expect(isInterrupted(afterAnswer)).toBe(true);
    const interruptPayload = (
      afterAnswer as unknown as { __interrupt__: Array<{ value: unknown }> }
    ).__interrupt__[0]?.value as Record<string, unknown>;
    expect(interruptPayload).toBeDefined();
    expect(interruptPayload['turn']).toBe(2);
  });

  it('(c) after maxQuestions answers, graph completes with debrief in state', async () => {
    // maxQuestions: 3 → 3 interrupt/resume cycles then debrief
    const mockLLMClient = createMockLLMClient([
      mockStrategy, // setup
      mockQuestion1, // Q1
      mockScore, // score A1
      // next_move_decider is pure logic (no LLM)
      mockQuestion2, // Q2
      mockScore, // score A2
      mockQuestion3, // Q3
      mockScore, // score A3
      // next_move_decider → debrief
      mockDebrief, // debrief
    ]);

    const graph = await createCrossExamSimulationGraph(
      mockLLMClient,
      mockObservability,
      mockCheckpointer,
    );

    const uniqueThread = `${threadId}-c`;
    const testInput = { ...mockInput, maxQuestions: 3 };

    // Initial run
    await graph.invoke(
      {
        executionContext: mockCtx,
        input: testInput,
        status: 'processing',
        startedAt: Date.now(),
      },
      { configurable: { thread_id: uniqueThread } },
    );

    // Submit 3 answers
    const answers = [
      'I reviewed the Q3 projections two weeks before the board meeting.',
      'My 2019 statement was taken out of context.',
      'I stand by my deposition testimony.',
    ];

    let finalState: CrossExamSimulationState | undefined;
    for (let i = 0; i < answers.length; i++) {
      const answerEntry = {
        turn: i + 1,
        answer: answers[i]!,
        submittedAt: new Date().toISOString(),
      };
      const state = await graph.invoke(new Command({ resume: answerEntry }), {
        configurable: { thread_id: uniqueThread },
      });
      if (!isInterrupted(state)) {
        finalState = state as CrossExamSimulationState;
        break;
      }
    }

    expect(finalState).toBeDefined();
    expect(finalState!.status).toBe('completed');
    expect(finalState!.debrief).toBeDefined();
    expect(finalState!.debrief!.transcript).toHaveLength(3);
    expect(finalState!.debrief!.weakestMoments.length).toBeGreaterThan(0);
    expect(finalState!.debrief!.patterns).toHaveLength(2);
    expect(finalState!.debrief!.coachingRecommendations.length).toBeGreaterThan(
      0,
    );
    expect(finalState!.debrief!.disclaimerText).toContain(
      'attorney work product',
    );
  });
});
