import { Module } from '@nestjs/common';
import { PrairieRidgeController } from './prairie-ridge.controller';
import { PrairieRidgeService } from './prairie-ridge.service';

@Module({
  controllers: [PrairieRidgeController],
  providers: [PrairieRidgeService],
  exports: [PrairieRidgeService],
})
export class PrairieRidgeModule {}
