import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Compose API — simple composable agents (context, RAG, API, external, media)';
  }
}
