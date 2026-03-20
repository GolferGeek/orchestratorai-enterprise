import { Module } from '@nestjs/common';
import { ApexOemController } from './apex-oem.controller';
import { ApexOemService } from './apex-oem.service';

@Module({
  controllers: [ApexOemController],
  providers: [ApexOemService],
  exports: [ApexOemService],
})
export class ApexOemModule {}
