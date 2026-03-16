import { Test, TestingModule } from '@nestjs/testing';
import { SnapshotService } from './snapshot.service';
import { SnapshotRepository } from '../repositories/snapshot.repository';
import {
  PredictionSnapshot,
  SnapshotBuildInput,
  PredictorSnapshot,
  RejectedSignalSnapshot,
  LlmEnsembleSnapshot,
  LearningSnapshot,
  ThresholdEvaluationSnapshot,
  TimelineEvent,
} from '../interfaces/snapshot.interface';

describe('SnapshotService', () => {
  let service: SnapshotService;
  let snapshotRepository: jest.Mocked<SnapshotRepository>;

  const mockPredictorSnapshot: PredictorSnapshot = {
    predictor_id: 'predictor-1',
    signal_content: 'Bullish sentiment from earnings report',
    direction: 'up',
    strength: 0.8,
    confidence: 0.75,
    analyst_slug: 'market-analyst',
    created_at: new Date().toISOString(),
  };

  const mockRejectedSignal: RejectedSignalSnapshot = {
    signal_id: 'signal-rejected-1',
    content: 'Weak signal from social media',
    rejection_reason: 'Low confidence score',
    confidence: 0.3,
    rejected_at: new Date().toISOString(),
  };

  const mockLlmEnsemble: LlmEnsembleSnapshot = {
    tiers_used: ['gold', 'silver'],
    tier_results: {
      gold: {
        direction: 'up',
        confidence: 0.85,
        model: 'claude-opus-4-20250514',
        provider: 'anthropic',
      },
      silver: {
        direction: 'up',
        confidence: 0.78,
        model: 'claude-sonnet-4-20250514',
        provider: 'anthropic',
      },
    },
    agreement_level: 0.9,
  };

  const mockThresholdEvaluation: ThresholdEvaluationSnapshot = {
    min_predictors: 3,
    actual_predictors: 5,
    min_combined_strength: 15,
    actual_combined_strength: 22,
    min_consensus: 0.6,
    actual_consensus: 0.8,
    passed: true,
  };

  const mockTimeline: TimelineEvent[] = [
    {
      timestamp: new Date().toISOString(),
      event_type: 'signal_received',
      details: { signal_id: 'signal-1' },
    },
    {
      timestamp: new Date().toISOString(),
      event_type: 'prediction_generated',
      details: { prediction_id: 'pred-123' },
    },
  ];

  const mockSnapshot: PredictionSnapshot = {
    id: 'snapshot-123',
    prediction_id: 'pred-123',
    captured_at: new Date().toISOString(),
    predictors: [mockPredictorSnapshot],
    rejected_signals: [mockRejectedSignal],
    analyst_assessments: [],
    llm_ensemble: mockLlmEnsemble,
    learnings_applied: [],
    threshold_evaluation: mockThresholdEvaluation,
    timeline: mockTimeline,
    created_at: new Date().toISOString(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SnapshotService,
        {
          provide: SnapshotRepository,
          useValue: {
            create: jest.fn(),
            findByPredictionId: jest.fn(),
          },
        },
      ],
    }).compile();

    module.useLogger(false);

    service = module.get<SnapshotService>(SnapshotService);
    snapshotRepository = module.get(SnapshotRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createSnapshot', () => {
    it('should create a snapshot with all required data', async () => {
      const createData = {
        prediction_id: 'pred-123',
        predictors: [mockPredictorSnapshot],
        rejected_signals: [mockRejectedSignal],
        analyst_assessments: [],
        llm_ensemble: mockLlmEnsemble,
        learnings_applied: [],
        threshold_evaluation: mockThresholdEvaluation,
        timeline: mockTimeline,
      };

      snapshotRepository.create.mockResolvedValue(mockSnapshot);

      const result = await service.createSnapshot(createData);

      expect(result).toEqual(mockSnapshot);
      expect(snapshotRepository.create).toHaveBeenCalledWith(createData);
    });

    it('should pass through repository errors', async () => {
      snapshotRepository.create.mockRejectedValue(new Error('Database error'));

      await expect(
        service.createSnapshot({
          prediction_id: 'pred-123',
          predictors: [],
          rejected_signals: [],
          analyst_assessments: [],
          llm_ensemble: mockLlmEnsemble,
          learnings_applied: [],
          threshold_evaluation: mockThresholdEvaluation,
          timeline: [],
        }),
      ).rejects.toThrow('Database error');
    });
  });

  describe('getSnapshot', () => {
    it('should return snapshot when found', async () => {
      snapshotRepository.findByPredictionId.mockResolvedValue(mockSnapshot);

      const result = await service.getSnapshot('pred-123');

      expect(result).toEqual(mockSnapshot);
      expect(snapshotRepository.findByPredictionId).toHaveBeenCalledWith(
        'pred-123',
      );
    });

    it('should return null when snapshot not found', async () => {
      snapshotRepository.findByPredictionId.mockResolvedValue(null);

      const result = await service.getSnapshot('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('buildSnapshotData', () => {
    it('should correctly map input to CreateSnapshotData', () => {
      const mockLearning: LearningSnapshot = {
        learning_id: 'learning-1',
        type: 'pattern',
        content: 'Earnings reports correlate with short-term gains',
        scope: 'target',
        applied_to: 'market-analyst',
      };

      const input: SnapshotBuildInput = {
        predictionId: 'pred-456',
        predictorSnapshots: [mockPredictorSnapshot],
        rejectedSignals: [mockRejectedSignal],
        analystAssessments: [],
        llmEnsemble: mockLlmEnsemble,
        learnings: [mockLearning],
        thresholdEval: mockThresholdEvaluation,
        timeline: mockTimeline,
      };

      const result = service.buildSnapshotData(input);

      expect(result.prediction_id).toBe('pred-456');
      expect(result.predictors).toEqual([mockPredictorSnapshot]);
      expect(result.rejected_signals).toEqual([mockRejectedSignal]);
      expect(result.analyst_assessments).toEqual([]);
      expect(result.llm_ensemble).toEqual(mockLlmEnsemble);
      expect(result.learnings_applied).toEqual([mockLearning]);
      expect(result.threshold_evaluation).toEqual(mockThresholdEvaluation);
      expect(result.timeline).toEqual(mockTimeline);
    });

    it('should handle empty arrays', () => {
      const input: SnapshotBuildInput = {
        predictionId: 'pred-789',
        predictorSnapshots: [],
        rejectedSignals: [],
        analystAssessments: [],
        llmEnsemble: mockLlmEnsemble,
        learnings: [],
        thresholdEval: mockThresholdEvaluation,
        timeline: [],
      };

      const result = service.buildSnapshotData(input);

      expect(result.predictors).toEqual([]);
      expect(result.rejected_signals).toEqual([]);
      expect(result.learnings_applied).toEqual([]);
      expect(result.timeline).toEqual([]);
    });

    it('should correctly transform field names from camelCase to snake_case', () => {
      const input: SnapshotBuildInput = {
        predictionId: 'pred-transform',
        predictorSnapshots: [mockPredictorSnapshot],
        rejectedSignals: [mockRejectedSignal],
        analystAssessments: [],
        llmEnsemble: mockLlmEnsemble,
        learnings: [],
        thresholdEval: mockThresholdEvaluation,
        timeline: mockTimeline,
      };

      const result = service.buildSnapshotData(input);

      // Verify snake_case field names
      expect(result).toHaveProperty('prediction_id');
      expect(result).toHaveProperty('rejected_signals');
      expect(result).toHaveProperty('analyst_assessments');
      expect(result).toHaveProperty('llm_ensemble');
      expect(result).toHaveProperty('learnings_applied');
      expect(result).toHaveProperty('threshold_evaluation');
    });
  });
});
