import { Global, Module } from '@nestjs/common';
import { HumanReviewService } from './human-review.service';
import { HumanReviewsRepository } from './human-reviews.repository';

/** Global: workflow nodes, the invoke controller and run reads all use it. */
@Global()
@Module({
  providers: [HumanReviewsRepository, HumanReviewService],
  exports: [HumanReviewService],
})
export class HumanReviewsModule {}
