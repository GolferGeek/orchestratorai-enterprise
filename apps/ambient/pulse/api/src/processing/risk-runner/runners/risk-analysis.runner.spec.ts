/**
 * Unit tests for RiskAnalysisRunner (Pulse processing engine)
 *
 * Tests:
 * - runBatchAnalysis() skips when already running (concurrency guard)
 * - runBatchAnalysis() only processes scopes with Risk Radar enabled
 * - runBatchAnalysis() creates system-triggered EC via createSystemTriggeredContext
 * - runBatchAnalysis() tracks successful and failed subject analyses
 * - analyzeSubject() delegates to RiskAnalysisService with proper EC
 */

import { ConfigService } from '@nestjs/config';
import { RiskAnalysisRunner } from './risk-analysis.runner';
import { ScopeRepository } from '../repositories/scope.repository';
import { SubjectRepository } from '../repositories/subject.repository';
import { RiskAnalysisService, AnalysisResult } from '../services/risk-analysis.service';

// Mock automation-context to avoid NIL_UUID import issues and verify usage
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

describe('RiskAnalysisRunner', () => {
  let runner: RiskAnalysisRunner;
  let mockScopeRepo: jest.Mocked<Pick<ScopeRepository, 'findAllActive' | 'findByIdOrThrow'>>;
  let mockSubjectRepo: jest.Mocked<Pick<SubjectRepository, 'findByScope' | 'findByIdOrThrow'>>;
  let mockRiskAnalysisService: jest.Mocked<Pick<RiskAnalysisService, 'analyzeSubject'>>;
  let mockConfigService: jest.Mocked<Pick<ConfigService, 'get' | 'getOrThrow'>>;

  const enabledScope = {
    id: 'scope-1',
    name: 'US Equities',
    organization_slug: 'acme',
    agent_slug: 'investment-risk-agent',
    analysis_config: { riskRadar: { enabled: true } },
  };

  const disabledScope = {
    id: 'scope-2',
    name: 'Private Equity',
    organization_slug: 'acme',
    agent_slug: 'investment-risk-agent',
    analysis_config: { riskRadar: { enabled: false } },
  };

  const subject1 = { id: 'subj-1', identifier: 'AAPL', scope_id: 'scope-1', subject_type: 'stock' };
  const subject2 = { id: 'subj-2', identifier: 'GOOG', scope_id: 'scope-1', subject_type: 'stock' };

  beforeEach(() => {
    jest.clearAllMocks();

    mockScopeRepo = {
      findAllActive: jest.fn().mockResolvedValue([enabledScope, disabledScope]),
      findByIdOrThrow: jest.fn().mockResolvedValue(enabledScope),
    };

    mockSubjectRepo = {
      findByScope: jest.fn().mockResolvedValue([subject1, subject2]),
      findByIdOrThrow: jest.fn().mockResolvedValue(subject1),
    };

    mockRiskAnalysisService = {
      analyzeSubject: jest.fn().mockResolvedValue({
        subject: subject1,
        compositeScore: { id: 'score-1', subject_id: 'subj-1', scope_id: 'scope-1', overall_score: 50, risk_level: 'moderate', dimension_scores: {}, calculated_at: '', created_at: '' },
        assessmentCount: 1,
        debateTriggered: false,
      } as unknown as AnalysisResult),
    };

    mockConfigService = {
      get: jest.fn().mockReturnValue(undefined), // RISK_RADAR_ENABLED not set globally
      getOrThrow: jest.fn().mockImplementation((key: string) => {
        if (key === 'DEFAULT_LLM_PROVIDER') return 'openai';
        if (key === 'DEFAULT_LLM_MODEL') return 'gpt-4o';
        throw new Error(`Unknown config: ${key}`);
      }),
    };

    runner = new RiskAnalysisRunner(
      mockScopeRepo as unknown as ScopeRepository,
      mockSubjectRepo as unknown as SubjectRepository,
      mockRiskAnalysisService as unknown as RiskAnalysisService,
      mockConfigService as unknown as ConfigService,
    );
  });

  // ─── Concurrency guard ──────────────────────────────────────────────────

  it('skips batch when already running and returns zero counts', async () => {
    // Simulate a long-running first batch
    let resolveFirst!: () => void;
    const firstBatch = new Promise<void>((res) => { resolveFirst = res; });
    mockRiskAnalysisService.analyzeSubject.mockImplementation(() => firstBatch as unknown as Promise<AnalysisResult>);

    const runPromise = runner.runBatchAnalysis();

    // Second call should be skipped immediately
    const secondResult = await runner.runBatchAnalysis();
    expect(secondResult.analyzed).toBe(0);
    expect(secondResult.successful).toBe(0);
    expect(secondResult.scopesProcessed).toBe(0);

    resolveFirst();
    await runPromise;
  });

  // ─── Scope filtering ────────────────────────────────────────────────────

  it('only processes scopes with riskRadar.enabled = true', async () => {
    await runner.runBatchAnalysis();

    // findByScope should only be called for the enabled scope
    expect(mockSubjectRepo.findByScope).toHaveBeenCalledWith('scope-1');
    expect(mockSubjectRepo.findByScope).not.toHaveBeenCalledWith('scope-2');
    expect(runner['scopesProcessed' as keyof typeof runner] ?? undefined).toBe(undefined); // internal counter
  });

  it('returns correct scope and subject counts', async () => {
    const result = await runner.runBatchAnalysis();

    expect(result.scopesProcessed).toBe(1); // only enabled scope
    expect(result.analyzed).toBe(2); // both subjects in scope-1
    expect(result.successful).toBe(2);
    expect(result.failed).toBe(0);
  });

  // ─── ExecutionContext via createSystemTriggeredContext ───────────────────

  it('creates system-triggered EC for each subject analysis', async () => {
    await runner.runBatchAnalysis();

    expect(createSystemTriggeredContext).toHaveBeenCalledWith({
      orgSlug: 'acme',
      agentSlug: 'investment-risk-agent',
      provider: 'openai',
      model: 'gpt-4o',
    });
    // Called once per subject in enabled scope
    expect(createSystemTriggeredContext).toHaveBeenCalledTimes(2);
  });

  it('EC passed to analyzeSubject has agentType "system"', async () => {
    await runner.runBatchAnalysis();

    const [, , passedContext] = mockRiskAnalysisService.analyzeSubject.mock.calls[0]!;
    expect(passedContext.agentType).toBe('system');
    expect(passedContext.userId).toBe('00000000-0000-0000-0000-000000000000');
  });

  // ─── Error handling ─────────────────────────────────────────────────────

  it('counts failed subjects without throwing', async () => {
    mockRiskAnalysisService.analyzeSubject
      .mockResolvedValueOnce({
        subject: subject1,
        compositeScore: { id: 'score-1', subject_id: 'subj-1', scope_id: 'scope-1', overall_score: 50, risk_level: 'moderate', dimension_scores: {}, calculated_at: '', created_at: '' },
        assessmentCount: 1,
        debateTriggered: false,
      } as unknown as AnalysisResult) // subject1 succeeds
      .mockRejectedValueOnce(new Error('LLM timeout')); // subject2 fails

    const result = await runner.runBatchAnalysis();

    expect(result.successful).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.analyzed).toBe(2);
  });
});
