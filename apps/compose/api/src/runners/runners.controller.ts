import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

/**
 * Runners Controller
 *
 * Returns the 5 runner types available in Compose.
 * These are the building blocks for composable agent pipelines.
 */
@ApiTags('Runners')
@Controller('runners')
export class RunnersController {
  @Get()
  @ApiOperation({ summary: 'List available runner types' })
  @ApiResponse({ status: 200, description: 'Available runner types' })
  getRunners() {
    return [
      {
        id: 'context',
        name: 'Context Runner',
        description: 'Conversational agent with system prompt + LLM call',
        type: 'context',
      },
      {
        id: 'rag',
        name: 'RAG Runner',
        description: 'Retrieval-augmented generation (vector search + LLM)',
        type: 'rag',
      },
      {
        id: 'api',
        name: 'API Runner',
        description: 'Calls external APIs and formats responses',
        type: 'api',
      },
      {
        id: 'external',
        name: 'External Runner',
        description: 'Integrates external tools and services',
        type: 'external',
      },
      {
        id: 'media',
        name: 'Media Runner',
        description: 'Image generation and media processing',
        type: 'media',
      },
    ];
  }
}
