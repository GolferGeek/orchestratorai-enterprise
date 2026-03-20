import { Module } from '@nestjs/common';
import { AlloytechController } from './alloytech.controller';
import { AlloytechService } from './alloytech.service';

@Module({
  controllers: [AlloytechController],
  providers: [AlloytechService],
  exports: [AlloytechService],
})
export class AlloytechModule {}
