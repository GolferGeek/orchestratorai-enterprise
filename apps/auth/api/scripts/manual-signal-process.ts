/**
 * Manual Signal Processing Script
 *
 * This script manually triggers signal processing for testing purposes.
 * Run with: npx ts-node apps/api/scripts/manual-signal-process.ts
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { BatchSignalProcessorRunner } from '../src/prediction-runner/runners/batch-signal-processor.runner';

async function bootstrap() {
  console.log('Creating NestJS application context...');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'error', 'warn'],
  });

  console.log('Getting BatchSignalProcessorRunner...');
  const runner = app.get(BatchSignalProcessorRunner);

  console.log('Running batch signal processing...');
  const result = await runner.runBatchProcessing();

  console.log('\n=== SIGNAL PROCESSING RESULTS ===');
  console.log('Processed:', result.processed);
  console.log('Predictors Created:', result.predictorsCreated);
  console.log('Rejected:', result.rejected);
  console.log('Fast Path Triggered:', result.fastPathTriggered);
  console.log('Errors:', result.errors);

  await app.close();
  console.log('\nDone!');
}

bootstrap().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
