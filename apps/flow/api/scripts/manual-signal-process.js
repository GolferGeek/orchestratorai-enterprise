/**
 * Manual Signal Processing Script
 *
 * This script manually triggers signal processing for testing purposes.
 * Run with: node apps/api/scripts/manual-signal-process.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });

const { NestFactory } = require('@nestjs/core');

async function bootstrap() {
  // Need to use the compiled dist
  const { AppModule } = require('../dist/app.module');
  const { BatchSignalProcessorRunner } = require('../dist/prediction-runner/runners/batch-signal-processor.runner');

  console.log('Creating NestJS application context...');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'error', 'warn'],
  });

  console.log('Getting BatchSignalProcessorRunner...');
  const runner = app.get(BatchSignalProcessorRunner);

  console.log('Running batch signal processing...\n');
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
