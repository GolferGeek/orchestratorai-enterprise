import { Module } from '@nestjs/common';
import { InvokeController } from './invoke.controller';

@Module({
  controllers: [InvokeController],
})
export class InvokeModule {}

