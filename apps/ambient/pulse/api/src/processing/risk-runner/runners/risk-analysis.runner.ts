import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExecutionContext } from '@orchestrator-ai/transport-types';
import { createSystemTriggeredContext } from '../../../automation-context/automation-context';
import { ScopeRepository } from '../repositories/scope.repository';
import { SubjectRepository } from '../repositories/subject.repository';
import {
  RiskAnalysisService,
  AnalysisResult,
} from '../services/risk-analysis.service';

export interface RunnerResult {
  analyzed: number;
  successful: number;
  failed: number;
  scopesProcessed: number;
  duration: number;
}

@Injectable()
export class RiskAnalysisRunner {
  private readonly logger = new Logger(RiskAnalysisRunner.name);
  private isRunning = false;
  private readonly globalRiskRadarEnabled: boolean;

  constructor(
    private readonly scopeRepo: ScopeRepository,
    private readonly subjectRepo: SubjectRepository,
    private readonly riskAnalysisService: RiskAnalysisService,
    private readonly configService: ConfigService,
  ) {
    // Check for global RISK_RADAR_ENABLED env var (fallback if scope config not set)
    this.globalRiskRadarEnabled =
      this.configService.get<string>('RISK_RADAR_ENABLED')?.toLowerCase() ===
      'true';
    if (this.globalRiskRadarEnabled) {
      this.logger.log(
        'Global RISK_RADAR_ENABLED=true - will process all active scopes',
      );
    }
  }

  /**
   * Manual trigger for batch analysis
   */
  async runBatchAnalysis(): Promise<RunnerResult> {
    if (this.isRunning) {
      this.logger.warn(
        'Skipping - previous risk analysis run still in progress',
      );
      return {
        analyzed: 0,
        successful: 0,
        failed: 0,
        scopesProcessed: 0,
        duration: 0,
      };
    }

    this.isRunning = true;
    const startTime = Date.now();
    let analyzed = 0;
    let successful = 0;
    let failed = 0;
    let scopesProcessed = 0;

    try {
      // Get all active scopes
      const scopes = await this.scopeRepo.findAllActive();
      this.logger.log(`Found ${scopes.length} active scopes to process`);

      for (const scope of scopes) {
        // Check if Risk Radar is enabled for this scope OR globally via env var
        const scopeEnabled = scope.analysis_config?.riskRadar?.enabled === true;
        const isEnabled = scopeEnabled || this.globalRiskRadarEnabled;

        if (!isEnabled) {
          this.logger.debug(
            `Skipping scope ${scope.name} - Risk Radar disabled (set scope.analysis_config.riskRadar.enabled=true or RISK_RADAR_ENABLED=true)`,
          );
          continue;
        }

        scopesProcessed++;

        // Get active subjects for this scope
        const subjects = await this.subjectRepo.findByScope(scope.id);
        this.logger.log(
          `Processing ${subjects.length} subjects in scope ${scope.name}`,
        );

        for (const subject of subjects) {
          analyzed++;

          try {
            // Create execution context for this analysis
            const ctx = this.createExecutionContext(
              scope.organization_slug,
              scope.agent_slug,
            );

            await this.riskAnalysisService.analyzeSubject(subject, scope, ctx);
            successful++;
          } catch (error) {
            failed++;
            this.logger.error(
              `Failed to analyze subject ${subject.identifier}: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }
      }

      const duration = Date.now() - startTime;
      this.logger.log(
        `Risk analysis batch complete: ${successful}/${analyzed} successful ` +
          `across ${scopesProcessed} scopes in ${duration}ms`,
      );

      return {
        analyzed,
        successful,
        failed,
        scopesProcessed,
        duration,
      };
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Analyze a single subject (for manual triggers from UI)
   */
  async analyzeSubject(subjectId: string): Promise<AnalysisResult> {
    const subject = await this.subjectRepo.findByIdOrThrow(subjectId);
    const scope = await this.scopeRepo.findByIdOrThrow(subject.scope_id);

    const context = this.createExecutionContext(
      scope.organization_slug,
      scope.agent_slug,
    );

    return this.riskAnalysisService.analyzeSubject(subject, scope, context);
  }

  /**
   * Create an execution context for background runner operations
   */
  private createExecutionContext(
    orgSlug: string,
    agentSlug: string,
  ): ExecutionContext {
    return createSystemTriggeredContext({
      orgSlug,
      agentSlug,
      provider: this.configService.getOrThrow<string>('DEFAULT_LLM_PROVIDER'),
      model: this.configService.getOrThrow<string>('DEFAULT_LLM_MODEL'),
    });
  }

  /**
   * Check if runner is currently processing
   */
  isProcessing(): boolean {
    return this.isRunning;
  }
}
