import { Module } from '@nestjs/common';
import { AscentekController } from './ascentek.controller';
import { AscentekService } from './ascentek.service';

@Module({
  controllers: [AscentekController],
  providers: [AscentekService],
  exports: [AscentekService],
})
export class AscentekModule {}
