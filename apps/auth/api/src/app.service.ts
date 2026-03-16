import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'OrchestratorAI Auth API — Ready';
  }
}
