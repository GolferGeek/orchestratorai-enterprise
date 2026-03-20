import { Injectable, Inject } from '@nestjs/common';
import { LLM_SERVICE, LLMServiceProvider } from '@orchestratorai/planes/llm';

@Injectable()
export class AppService {
  constructor(
    @Inject(LLM_SERVICE) private readonly llmService: LLMServiceProvider,
  ) {}

  getHello(): string {
    return 'Forge API — Complex Agent Dashboards — Ready!';
  }
}
