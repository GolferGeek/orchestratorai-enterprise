import { Module } from '@nestjs/common';
import { DepositionPrepService } from './deposition-prep.service';

@Module({
  providers: [DepositionPrepService],
  exports: [DepositionPrepService],
})
export class DepositionPrepModule {}
