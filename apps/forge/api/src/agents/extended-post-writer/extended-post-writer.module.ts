import { Module } from '@nestjs/common';
import { ExtendedPostWriterController } from './extended-post-writer.controller';
import { ExtendedPostWriterService } from './extended-post-writer.service';

/**
 * ExtendedPostWriterModule
 *
 * Provides the Extended Post Writer agent with HITL support.
 * The agent:
 * - Generates blog posts, SEO descriptions, and social media content
 * - Pauses for human approval (HITL)
 * - Supports approve, edit, and reject decisions
 * - Finalizes approved content
 */
@Module({
  controllers: [ExtendedPostWriterController],
  providers: [ExtendedPostWriterService],
  exports: [ExtendedPostWriterService],
})
export class ExtendedPostWriterModule {}
