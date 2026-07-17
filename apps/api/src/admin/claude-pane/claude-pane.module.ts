import { Module } from '@nestjs/common';
import { ClaudePaneController } from './claude-pane.controller';
import { ClaudePaneService } from './claude-pane.service';

@Module({
  controllers: [ClaudePaneController],
  providers: [ClaudePaneService],
  exports: [ClaudePaneService],
})
export class ClaudePaneModule {}
