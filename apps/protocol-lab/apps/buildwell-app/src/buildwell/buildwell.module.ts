import { Module } from '@nestjs/common';
import { BuildwellController } from './buildwell.controller';
import { BuildwellService } from './buildwell.service';

@Module({
  controllers: [BuildwellController],
  providers: [BuildwellService],
  exports: [BuildwellService],
})
export class BuildwellModule {}
