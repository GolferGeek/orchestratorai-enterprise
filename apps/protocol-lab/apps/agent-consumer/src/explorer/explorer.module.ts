import { Module } from '@nestjs/common';
import { ExplorerController } from './explorer.controller';
import { ResearchClientModule } from '../research-client/research-client.module';

@Module({
  imports: [ResearchClientModule],
  controllers: [ExplorerController],
})
export class ExplorerModule {}
