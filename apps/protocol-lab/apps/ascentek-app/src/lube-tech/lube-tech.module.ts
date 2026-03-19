import { Module } from '@nestjs/common';
import { LubeTechController } from './lube-tech.controller';
import { LubeTechService } from './lube-tech.service';

@Module({
  controllers: [LubeTechController],
  providers: [LubeTechService],
  exports: [LubeTechService],
})
export class LubeTechModule {}
