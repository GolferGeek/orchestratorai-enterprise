import { Injectable, Inject } from '@nestjs/common';
import { LLM_SERVICE, LLMServiceProvider } from '@/planes/llm/llm.interface';

@Injectable()
export class AppService {
  constructor(
    @Inject(LLM_SERVICE) private readonly llmService: LLMServiceProvider,
  ) {}

  getHello(): string {
    return 'Forge API — Complex Agent Dashboards — Ready!';
  }
}
