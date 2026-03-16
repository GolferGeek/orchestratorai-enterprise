import { Test, TestingModule } from '@nestjs/testing';
import { OutcomeTrackingService } from './outcome-tracking.service';
import { PredictionRepository } from '../repositories/prediction.repository';
import { Prediction } from '../interfaces/prediction.interface';

describe('OutcomeTrackingService', () => {
  let service: OutcomeTrackingService;
  let predictionRepository: jest.Mocked<PredictionRepository>;

  const mockPrediction: Prediction = {
    id: 'pred-123',
    target_id: 'target-789',
    task_id: 'task-456',
    direction: 'up',
    confidence: 0.75,
    magnitude: 'medium',
    reasoning: 'Test reasoning for prediction',
    timeframe_hours: 24,
    predicted_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 86400000).toISOString(), // 1 day from now
    entry_price: 100,
    target_price: 110,
    stop_loss: 95,
    analyst_ensemble: { test: 'data' },
    llm_ensemble: { test: 'data' },
    status: 'active',
    outcome_value: null,
    outcome_captured_at: null,
    resolution_notes: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OutcomeTrackingService,
        {
          provide: PredictionRepository,
          useValue: {
            update: jest.fn(),
            resolve: jest.fn(),
            findPendingResolution: jest.fn(),
            expirePastDueActivePredictions: jest.fn(),
          },
        },
      ],
    }).compile();

    module.useLogger(false);

    service = module.get<OutcomeTrackingService>(OutcomeTrackingService);
    predictionRepository = module.get(PredictionRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('captureOutcome', () => {
    it('should capture outcome value for a prediction', async () => {
      const outcomeValue = 105;
      const updatedPrediction = {
        ...mockPrediction,
        outcome_value: outcomeValue,
        outcome_captured_at: expect.any(String),
      };

      predictionRepository.update.mockResolvedValue(updatedPrediction);

      const result = await service.captureOutcome('pred-123', outcomeValue);

      expect(result.outcome_value).toBe(outcomeValue);
      expect(predictionRepository.update).toHaveBeenCalledWith('pred-123', {
        outcome_value: outcomeValue,
        outcome_captured_at: expect.any(String),
      });
    });

    it('should use custom capture timestamp when provided', async () => {
      const outcomeValue = 110;
      const customDate = new Date('2026-01-15T10:00:00Z');
      const updatedPrediction = {
        ...mockPrediction,
        outcome_value: outcomeValue,
        outcome_captured_at: customDate.toISOString(),
      };

      predictionRepository.update.mockResolvedValue(updatedPrediction);

      const result = await service.captureOutcome(
        'pred-123',
        outcomeValue,
        customDate,
      );

      expect(result).toEqual(updatedPrediction);
      expect(predictionRepository.update).toHaveBeenCalledWith('pred-123', {
        outcome_value: outcomeValue,
        outcome_captured_at: customDate.toISOString(),
      });
    });

    it('should handle negative outcome values', async () => {
      const outcomeValue = -5;
      const updatedPrediction = {
        ...mockPrediction,
        outcome_value: outcomeValue,
      };

      predictionRepository.update.mockResolvedValue(updatedPrediction);

      const result = await service.captureOutcome('pred-123', outcomeValue);

      expect(result.outcome_value).toBe(outcomeValue);
    });

    it('should handle zero outcome value', async () => {
      const outcomeValue = 0;
      const updatedPrediction = {
        ...mockPrediction,
        outcome_value: outcomeValue,
      };

      predictionRepository.update.mockResolvedValue(updatedPrediction);

      const result = await service.captureOutcome('pred-123', outcomeValue);

      expect(result.outcome_value).toBe(0);
    });
  });

  describe('resolvePrediction', () => {
    it('should resolve a prediction with outcome value', async () => {
      const outcomeValue = 108;
      const resolvedPrediction: Prediction = {
        ...mockPrediction,
        status: 'resolved',
        outcome_value: outcomeValue,
        outcome_captured_at: new Date().toISOString(),
      };

      predictionRepository.resolve.mockResolvedValue(resolvedPrediction);

      const result = await service.resolvePrediction('pred-123', outcomeValue);

      expect(result.status).toBe('resolved');
      expect(result.outcome_value).toBe(outcomeValue);
      expect(predictionRepository.resolve).toHaveBeenCalledWith(
        'pred-123',
        outcomeValue,
      );
    });

    it('should pass through repository errors', async () => {
      predictionRepository.resolve.mockRejectedValue(
        new Error('Prediction not found'),
      );

      await expect(
        service.resolvePrediction('non-existent', 100),
      ).rejects.toThrow('Prediction not found');
    });
  });

  describe('expirePredictions', () => {
    it('should expire all pending predictions past their timeframe', async () => {
      const expiredPredictions: Prediction[] = [
        {
          ...mockPrediction,
          id: 'pred-1',
          status: 'expired',
        },
        {
          ...mockPrediction,
          id: 'pred-2',
          status: 'expired',
        },
      ];
      predictionRepository.expirePastDueActivePredictions.mockResolvedValue(
        expiredPredictions,
      );

      const result = await service.expirePredictions();

      expect(result).toHaveLength(2);
      expect(result[0]!.status).toBe('expired');
      expect(result[1]!.status).toBe('expired');
      expect(
        predictionRepository.expirePastDueActivePredictions,
      ).toHaveBeenCalledTimes(1);
    });

    it('should return empty array when no predictions to expire', async () => {
      predictionRepository.expirePastDueActivePredictions.mockResolvedValue([]);

      const result = await service.expirePredictions();

      expect(result).toHaveLength(0);
      expect(
        predictionRepository.expirePastDueActivePredictions,
      ).toHaveBeenCalledTimes(1);
    });

    it('should handle partial failures gracefully', async () => {
      predictionRepository.expirePastDueActivePredictions.mockRejectedValue(
        new Error('Update failed'),
      );

      await expect(service.expirePredictions()).rejects.toThrow(
        'Update failed',
      );
    });
  });

  describe('getPendingResolutionPredictions', () => {
    it('should return all predictions pending resolution', async () => {
      const pendingPredictions: Prediction[] = [
        {
          ...mockPrediction,
          id: 'pred-1',
          expires_at: new Date(Date.now() - 3600000).toISOString(),
        },
        {
          ...mockPrediction,
          id: 'pred-2',
          expires_at: new Date(Date.now() - 1800000).toISOString(),
        },
        {
          ...mockPrediction,
          id: 'pred-3',
          expires_at: new Date(Date.now() - 600000).toISOString(),
        },
      ];

      predictionRepository.findPendingResolution.mockResolvedValue(
        pendingPredictions,
      );

      const result = await service.getPendingResolutionPredictions();

      expect(result).toHaveLength(3);
      expect(predictionRepository.findPendingResolution).toHaveBeenCalled();
    });

    it('should return empty array when no pending predictions', async () => {
      predictionRepository.findPendingResolution.mockResolvedValue([]);

      const result = await service.getPendingResolutionPredictions();

      expect(result).toHaveLength(0);
    });

    it('should propagate repository errors', async () => {
      predictionRepository.findPendingResolution.mockRejectedValue(
        new Error('Database connection failed'),
      );

      await expect(service.getPendingResolutionPredictions()).rejects.toThrow(
        'Database connection failed',
      );
    });
  });
});
