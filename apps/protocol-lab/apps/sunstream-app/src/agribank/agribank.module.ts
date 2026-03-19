import { Module } from '@nestjs/common';
import { AgribankController } from './agribank.controller';
import { AgribankService } from './agribank.service';

@Module({
  controllers: [AgribankController],
  providers: [AgribankService],
  exports: [AgribankService],
})
export class AgribankModule {}
