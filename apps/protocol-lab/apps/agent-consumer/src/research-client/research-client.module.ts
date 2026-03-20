import { Module } from '@nestjs/common';
import { ResearchClientService } from './research-client.service';

@Module({
  providers: [ResearchClientService],
  exports: [ResearchClientService],
})
export class ResearchClientModule {}
