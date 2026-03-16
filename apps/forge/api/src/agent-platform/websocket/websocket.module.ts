import { Module, Global } from '@nestjs/common';

// WebSocket module is deprecated - we now use SSE streaming via Agent2AgentController
// This module is kept as an empty stub to avoid breaking existing imports
@Global()
@Module({
  imports: [],
  providers: [],
  exports: [],
})
export class WebSocketModule {}
