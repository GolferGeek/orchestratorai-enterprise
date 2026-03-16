/**
 * Forge Dashboard-Only Verification Tests
 *
 * Validates that after stripping runners from Forge:
 * 1. PredictorService only handles dashboard mode
 * 2. RiskRunnerService only handles dashboard mode
 * 3. Runner directories no longer exist in Forge
 * 4. Processing modules exist in Pulse
 */
import * as fs from 'fs';
import * as path from 'path';

// Resolve paths relative to the monorepo root
const MONOREPO_ROOT = path.resolve(__dirname, '../../../../../../');
const FORGE_AGENTS = path.join(MONOREPO_ROOT, 'apps/forge/api/src/agents');
const PULSE_PROCESSING = path.join(MONOREPO_ROOT, 'apps/ambient/pulse/api/src/processing');

describe('Forge Dashboard-Only Verification', () => {
  describe('PredictorService (Forge) — no runners', () => {
    let serviceSource: string;

    beforeAll(() => {
      serviceSource = fs.readFileSync(
        path.join(FORGE_AGENTS, 'predictor/predictor.service.ts'),
        'utf-8',
      );
    });

    it('PredictorService file should exist', () => {
      expect(
        fs.existsSync(path.join(FORGE_AGENTS, 'predictor/predictor.service.ts')),
      ).toBe(true);
    });

    it('should NOT import any runner classes', () => {
      expect(serviceSource).not.toContain('Runner');
      expect(serviceSource).not.toContain('from \'./runners');
    });

    it('should NOT have triggerRunner method', () => {
      expect(serviceSource).not.toContain('triggerRunner');
    });

    it('should reference PredictionDashboardRouter', () => {
      expect(serviceSource).toContain('PredictionDashboardRouter');
    });

    it('should mention Pulse in comments', () => {
      expect(serviceSource).toContain('Pulse');
    });
  });

  describe('RiskRunnerService (Forge) — no runners', () => {
    let serviceSource: string;

    beforeAll(() => {
      serviceSource = fs.readFileSync(
        path.join(FORGE_AGENTS, 'risk-runner/risk-runner.service.ts'),
        'utf-8',
      );
    });

    it('RiskRunnerService file should exist', () => {
      expect(
        fs.existsSync(path.join(FORGE_AGENTS, 'risk-runner/risk-runner.service.ts')),
      ).toBe(true);
    });

    it('should NOT import batch runner classes', () => {
      expect(serviceSource).not.toContain('RiskAnalysisRunner');
      expect(serviceSource).not.toContain('RiskEvaluationRunner');
      expect(serviceSource).not.toContain('RiskLearningRunner');
      expect(serviceSource).not.toContain('RiskAlertRunner');
      expect(serviceSource).not.toContain("from './runners");
    });

    it('should NOT have triggerRunner method', () => {
      expect(serviceSource).not.toContain('triggerRunner');
    });

    it('should reference RiskDashboardRouter', () => {
      expect(serviceSource).toContain('RiskDashboardRouter');
    });
  });

  describe('Runner directories removed from Forge', () => {
    it('predictor/runners/ directory should NOT exist', () => {
      expect(fs.existsSync(path.join(FORGE_AGENTS, 'predictor/runners'))).toBe(false);
    });

    it('risk-runner/runners/ directory should NOT exist', () => {
      expect(fs.existsSync(path.join(FORGE_AGENTS, 'risk-runner/runners'))).toBe(false);
    });
  });

  describe('Forge predictor module — no runner providers', () => {
    let moduleSource: string;

    beforeAll(() => {
      moduleSource = fs.readFileSync(
        path.join(FORGE_AGENTS, 'predictor/predictor.module.ts'),
        'utf-8',
      );
    });

    it('should NOT import from runners directory', () => {
      expect(moduleSource).not.toContain("from './runners");
    });

    it('should NOT have runners array', () => {
      expect(moduleSource).not.toMatch(/const\s+runners\s*=/);
    });

    it('should NOT spread runners in providers', () => {
      expect(moduleSource).not.toContain('...runners');
    });
  });

  describe('Forge risk-runner module — no runner providers', () => {
    let moduleSource: string;

    beforeAll(() => {
      moduleSource = fs.readFileSync(
        path.join(FORGE_AGENTS, 'risk-runner/risk-runner.module.ts'),
        'utf-8',
      );
    });

    it('should NOT import from runners directory', () => {
      expect(moduleSource).not.toContain("from './runners");
    });

    it('should NOT have runners array', () => {
      expect(moduleSource).not.toMatch(/const\s+runners\s*=/);
    });

    it('should NOT spread runners in providers', () => {
      expect(moduleSource).not.toContain('...runners');
    });
  });

  describe('Processing modules exist in Pulse', () => {
    it('predictor/ directory should exist in Pulse', () => {
      expect(fs.existsSync(path.join(PULSE_PROCESSING, 'predictor'))).toBe(true);
    });

    it('risk-runner/ directory should exist in Pulse', () => {
      expect(fs.existsSync(path.join(PULSE_PROCESSING, 'risk-runner'))).toBe(true);
    });

    it('predictor/predictor.module.ts should exist', () => {
      expect(fs.existsSync(path.join(PULSE_PROCESSING, 'predictor/predictor.module.ts'))).toBe(true);
    });

    it('risk-runner/risk-runner.module.ts should exist', () => {
      expect(fs.existsSync(path.join(PULSE_PROCESSING, 'risk-runner/risk-runner.module.ts'))).toBe(true);
    });

    it('predictor should have services/ directory', () => {
      expect(fs.existsSync(path.join(PULSE_PROCESSING, 'predictor/services'))).toBe(true);
    });

    it('predictor should have repositories/ directory', () => {
      expect(fs.existsSync(path.join(PULSE_PROCESSING, 'predictor/repositories'))).toBe(true);
    });

    it('risk-runner should have services/ directory', () => {
      expect(fs.existsSync(path.join(PULSE_PROCESSING, 'risk-runner/services'))).toBe(true);
    });

    it('risk-runner should have repositories/ directory', () => {
      expect(fs.existsSync(path.join(PULSE_PROCESSING, 'risk-runner/repositories'))).toBe(true);
    });
  });

  describe('Pulse trigger-executor routes locally', () => {
    let executorSource: string;

    beforeAll(() => {
      executorSource = fs.readFileSync(
        path.join(MONOREPO_ROOT, 'apps/ambient/pulse/api/src/services/trigger-executor.service.ts'),
        'utf-8',
      );
    });

    it('should import PredictorService from processing/', () => {
      expect(executorSource).toContain("from '../processing/predictor/predictor.service'");
    });

    it('should import RiskRunnerService from processing/', () => {
      expect(executorSource).toContain("from '../processing/risk-runner/risk-runner.service'");
    });

    it('should have localAgents set with predictor slugs', () => {
      expect(executorSource).toContain("'predictor'");
      expect(executorSource).toContain("'us-tech-stocks'");
    });

    it('should have localAgents set with risk-runner slugs', () => {
      expect(executorSource).toContain("'investment-risk-agent'");
      expect(executorSource).toContain("'risk-runner'");
    });

    it('should have executeLocal method', () => {
      expect(executorSource).toContain('executeLocal');
    });

    it('should have executeRemote method for fallback', () => {
      expect(executorSource).toContain('executeRemote');
    });
  });
});
