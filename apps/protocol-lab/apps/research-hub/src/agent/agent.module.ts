import { Module } from '@nestjs/common';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { CategoriesModule } from '../categories/categories.module';
import { NarrativesModule } from '../narratives/narratives.module';
import { ArticlesModule } from '../articles/articles.module';
import { ScoutModule } from '../scout/scout.module';

@Module({
  imports: [CategoriesModule, NarrativesModule, ArticlesModule, ScoutModule],
  controllers: [AgentController],
  providers: [AgentService],
})
export class AgentModule {}
