import { Global, Module } from '@nestjs/common';
import { ImprovementRequestsAdminController } from './improvement-requests.admin.controller';
import { QualityRepository } from './quality.repository';
import { TraceReviewService } from './trace-review.service';
import { TraceReviewsController } from './trace-reviews.controller';

/** Global: the invoke controller runs trace reviews and files improvement requests. */
@Global()
@Module({
  controllers: [TraceReviewsController, ImprovementRequestsAdminController],
  providers: [QualityRepository, TraceReviewService],
  exports: [TraceReviewService],
})
export class WorkflowQualityModule {}
