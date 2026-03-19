import { Module } from '@nestjs/common';
import { AsyncPatternsController } from './async-patterns.controller';
import { AsyncPatternsService } from './async-patterns.service';
import { MessagesModule } from '../messages/messages.module';

@Module({
  imports: [MessagesModule],
  controllers: [AsyncPatternsController],
  providers: [AsyncPatternsService],
})
export class AsyncPatternsModule {}
