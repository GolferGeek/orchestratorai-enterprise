import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { TaskStatusService } from './task-status.service';
import { TaskMessageService } from './task-message.service';
import { AgentConversationsModule } from '@/agent2agent/conversations/agent-conversations.module';
import { EventEmitterModule } from '@nestjs/event-emitter';

@Module({
  imports: [AgentConversationsModule, EventEmitterModule],
  providers: [TasksService, TaskStatusService, TaskMessageService],
  controllers: [TasksController],
  exports: [TasksService, TaskStatusService, TaskMessageService],
})
export class TasksModule {}
