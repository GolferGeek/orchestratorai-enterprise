import { Module } from '@nestjs/common';
import { RunnersController } from './runners.controller';

@Module({
  controllers: [RunnersController],
})
export class RunnersModule {}
