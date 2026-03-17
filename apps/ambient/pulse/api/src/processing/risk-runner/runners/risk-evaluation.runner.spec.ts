/**
 * Unit tests for RiskEvaluationRunner (Pulse processing engine)
 *
 * Tests:
 * - runEvaluationBatch() skips when already running (concurrency guard)
 * - runEvaluationBatch() processes all three evaluation windows (7d, 30d, 90d)
 * - runEvaluationBatch() creates system-triggered EC via createSystemTriggeredContext
 * - runEvaluationBatch() counts accurate/inaccurate and queues learnings
 * - evaluateScore() returns null when composite score is not found
 */

import { ConfigService } from '@nestjs/config';
import { RiskEvaluationRunner } from './risk-evaluation.runner';
import { ScopeRepository } from '../repositories/scope.repository';
import { SubjectRepository } from '../repositories/subject.repository';
import { CompositeScoreRepository } from '../repositories/composite-score.repository';
import { RiskEvaluationService, EvaluationResult } from '../services/risk-evaluation.service';

jest.mock('../../../automation-context/automation-context', () => ({
  createSystemTriggeredContext: jest.fn().mockReturnValue({
    orgSlug: 'test-org',
    userId: '00000000-0000-0000-0000-000000000000',
    conversationId: '00000000-0000-0000-0000-000000000000',
    agentSlug: 'investment-risk-agent',
    agentType: 'system',
    provider: 'openai',
    model: 'gpt-4o',
  }),
}));

import { createSystemTriggeredContext } from '../../../automation-context/automation-context';

describe('RiskEvaluationRunner', () => {
  let runner: RiskEvaluationRunner;
  let mockScopeRepo: jest.Mocked<Pick<ScopeRepository, 'findById'>>;
  let mockSubjectRepo: jest.Mocked<Pick<SubjectRepository, 'findById'>>;
  let mockCompositeScoreRepo: jest.Mocked<Pick<CompositeScoreRepository, 'findById'>>;
  let mockEvaluationService: jest.Mocked<Pick<
    RiskEvaluationService,
    'findScoresToEvaluate' | 'evaluateScore' | 'queueLearning'
  >>;
  let mockConfigService: jest.Mocked<Pick<ConfigService, 'get' | 'getOrThrow'>>;

  const scope = {
    id: 'scope-1',
    organization_slug: 'acme',
    agent_slug: 'investment-risk-agent',
  };

  const subject = {
    id: 'subj-1',
    identifier: 'AAPL',
    scope_id: 'scope-1',
    subject_type: 'stock',
  };

  const compositeScore = {
    id: 'score-1',
    subject_id: 'subj-1',
    overall_score: 72,
    created_at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(), // 8 days old
  };

  beforeEach(() => {
    mockScopeRepo = {
      findById: jest.fn().mockResolvedValue(scope),
    };

    mockSubjectRepo = {
      findById: jest.fn().mockResolvedValue(subject),
    };

    mockCompositeScoreRepo = {
      findById: jest.fn().mockResolvedValue(compositeScore),
    };

    const mockEvaluationResult: EvaluationResult = {
      evaluation: {} as unknown as import('../interfaces/evaluation.interface').RiskEvaluation,
      wasCalibrated: true,
      scoreAccuracy: 0.85,
      suggestedLearnings: [
        {
          type: 'weight_adjustment',
          scopeLevel: 'scope',
          title: 'Refine volatility weighting',
          description: 'Adjust the weight given to volatility in composite scores',
          config: {},
          confidence: 0.75,
          sourceEvaluationId: 'eval-1',
          reason: 'Score was significantly off on volatile stocks',
        },
      ],
    };

    mockEvaluationService = {
      findScoresToEvaluate: jest.fn().mockResolvedValue([{ score: compositeScore, subject }]),
      evaluateScore: jest.fn().mockResolvedValue(mockEvaluationResult),
      queueLearning: jest.fn().mockResolvedValue(undefined),
    };

    mockConfigService = {
      get: jest.fn(),
      getOrThrow: jest.fn().mockImplementation((key: string) => {
        if (key === 'DEFAULT_LLM_PROVIDER') return 'openai';
        if (key === 'DEFAULT_LLM_MODEL') return 'gpt-4o';
        throw new Error(`Unknown config: ${key}`);
      }),
    };

    runner = new RiskEvaluationRunner(
      mockScopeRepo as unknown as ScopeRepository,
      mockSubjectRepo as unknown as SubjectRepository,
      mockCompositeScoreRepo as unknown as CompositeScoreRepository,
      mockEvaluationService as unknown as RiskEvaluationService,
      mockConfigService as unknown as ConfigService,
    );
  });

  // ─── Concurrency guard ──────────────────────────────────────────────────

  it('skips batch when already running and returns zero counts', async () => {
    // isRunning is set synchronously at batch start — make findScoresToEvaluate hang
    // so we can sneak in the second call while the first is still waiting
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let unblock!: (v: any) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const blocker = new Promise<any>((res) => { unblock = res; });
    (mockEvaluationService.findScoresToEvaluate as jest.Mock).mockReturnValueOnce(blocker);

    const runPromise = runner.runEvaluationBatch();

    // Second call immediately sees isRunning=true and returns zeros
    const secondResult = await runner.runEvaluationBatch();
    expect(secondResult.evaluated).toBe(0);

    unblock([]);
    await runPromise;
  });

  // ─── Evaluation windows ─────────────────────────────────────────────────

  it('processes all three evaluation windows (7d, 30d, 90d)', async () => {
    await runner.runEvaluationBatch();

    expect(mockEvaluationService.findScoresToEvaluate).toHaveBeenCalledWith('7d', 100);
    expect(mockEvaluationService.findScoresToEvaluate).toHaveBeenCalledWith('30d', 100);
    expect(mockEvaluationService.findScoresToEvaluate).toHaveBeenCalledWith('90d', 100);
    expect(mockEvaluationService.findScoresToEvaluate).toHaveBeenCalledTimes(3);
  });

  // ─── Accuracy tracking ──────────────────────────────────────────────────

  it('counts accurate evaluations correctly', async () => {
    const result = await runner.runEvaluationBatch();

    // One score per window (3 windows) → evaluated = 3, accurate = 3
    expect(result.evaluated).toBe(3);
    expect(result.accurate).toBe(3);
    expect(result.inaccurate).toBe(0);
  });

  it('queues learnings when evaluationService suggests them', async () => {
    const result = await runner.runEvaluationBatch();

    // 1 learning per score × 3 windows = 3 queued
    expect(mockEvaluationService.queueLearning).toHaveBeenCalledTimes(3);
    expect(result.learningsSuggested).toBe(3);
  });

  // ─── ExecutionContext via createSystemTriggeredContext ───────────────────

  it('creates system-triggered EC using scope org and agent slugs', async () => {
    await runner.runEvaluationBatch();

    expect(createSystemTriggeredContext).toHaveBeenCalledWith({
      orgSlug: 'acme',
      agentSlug: 'investment-risk-agent',
      provider: 'openai',
      model: 'gpt-4o',
    });
  });

  it('EC passed to evaluateScore has agentType "system"', async () => {
    await runner.runEvaluationBatch();

    const callArg = mockEvaluationService.evaluateScore.mock.calls[0]![0];
    expect(callArg.context.agentType).toBe('system');
    expect(callArg.context.userId).toBe('00000000-0000-0000-0000-000000000000');
  });

  // ─── evaluateScore() single-score method ────────────────────────────────

  it('evaluateScore() returns null when composite score not found', async () => {
    mockCompositeScoreRepo.findById.mockResolvedValue(null);

    const result = await runner.evaluateScore('missing-score', '7d');

    expect(result).toBeNull();
  });
});
