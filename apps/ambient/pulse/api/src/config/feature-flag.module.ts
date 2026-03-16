import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FeatureFlagService } from './feature-flag.service';
import { FeatureFlagController } from './feature-flag.controller';

@Module({
  imports: [ConfigModule],
  providers: [FeatureFlagService],
  controllers: [FeatureFlagController],
  exports: [FeatureFlagService],
})
export class FeatureFlagModule {}
