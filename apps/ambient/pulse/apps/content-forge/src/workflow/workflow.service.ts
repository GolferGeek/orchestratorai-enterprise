import { Injectable, BadRequestException } from '@nestjs/common';
import { DraftsService, Draft } from '../drafts/drafts.service';

export interface PipelineStep {
  step: number;
  agentId: string;
  action: string;
  duration: number;
  result: string;
}

export interface PipelineExecution {
  id: string;
  topic: string;
  steps: PipelineStep[];
  draft: Draft;
  totalDuration: number;
  executedAt: string;
}

@Injectable()
export class WorkflowService {
  private executions: PipelineExecution[] = [];
  private nextId = 1;

  constructor(private readonly draftsService: DraftsService) {}

  executeContentPipeline(topic: string): PipelineExecution {
    if (!topic) {
      throw new BadRequestException('topic is required');
    }

    const steps: PipelineStep[] = [
      {
        step: 1,
        agentId: 'research-hub',
        action: 'query-narrative',
        duration: 1250,
        result: `Retrieved narrative analysis on "${topic}" from ResearchHub. Found 3 related articles and 2 emerging signals. Personality lens: pragmatist perspective emphasizing practical implications and adoption readiness.`,
      },
      {
        step: 2,
        agentId: 'market-pulse',
        action: 'query-trending',
        duration: 890,
        result: `Retrieved market trends for "${topic}" from MarketPulse. Sentiment: 72% positive. Trend velocity: accelerating. Key metrics: 34% YoY growth in related infrastructure spending, 2.5x enterprise adoption rate increase.`,
      },
      {
        step: 3,
        agentId: 'content-forge',
        action: 'synthesize-draft',
        duration: 2100,
        result: `Synthesized research narrative and market data into a comprehensive draft. Combined insights from 3 research articles, 2 market trends, and 1 sentiment analysis. Draft includes executive summary, key findings, and forward-looking analysis.`,
      },
    ];

    const draft = this.draftsService.generateDraft(topic);
    const totalDuration = steps.reduce((sum, s) => sum + s.duration, 0);

    const execution: PipelineExecution = {
      id: `exec-${String(this.nextId++).padStart(3, '0')}`,
      topic,
      steps,
      draft,
      totalDuration,
      executedAt: new Date().toISOString(),
    };

    this.executions.push(execution);
    return execution;
  }

  getHistory(): Omit<PipelineExecution, 'draft'>[] {
    return this.executions.map(({ draft, ...rest }) => rest);
  }
}
