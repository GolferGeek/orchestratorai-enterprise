import { Controller, Get, Query, BadRequestException, NotFoundException } from '@nestjs/common';
import { readSourceFile } from '@agent-communication/shared-protocols';
import { resolve } from 'path';

@Controller('api/source')
export class SourceCodeController {
  private readonly agentCommRoot = resolve(__dirname, '..', '..', '..', '..');

  @Get()
  async getSource(
    @Query('file') filePath: string,
    @Query('startLine') startLineStr?: string,
    @Query('endLine') endLineStr?: string,
  ) {
    try {
      return await readSourceFile(
        this.agentCommRoot,
        filePath,
        startLineStr ? parseInt(startLineStr, 10) : undefined,
        endLineStr ? parseInt(endLineStr, 10) : undefined,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) throw new NotFoundException(msg);
      throw new BadRequestException(msg);
    }
  }
}
