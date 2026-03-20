import { Module } from '@nestjs/common';
import { AgriservController } from './agriserv.controller';
import { AgriservService } from './agriserv.service';

@Module({
  controllers: [AgriservController],
  providers: [AgriservService],
  exports: [AgriservService],
})
export class AgriservModule {}
