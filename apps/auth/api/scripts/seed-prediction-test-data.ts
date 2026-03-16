/**
 * Seed Prediction Test Data Script
 *
 * Creates test data for the prediction system including:
 * - A test universe
 * - Test targets (stocks)
 * - A test source
 * - A test scenario with generated signals
 *
 * Run with: npx ts-node apps/api/scripts/seed-prediction-test-data.ts
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { UniverseRepository } from '../src/prediction-runner/repositories/universe.repository';
import { TargetRepository } from '../src/prediction-runner/repositories/target.repository';
import { SourceRepository } from '../src/prediction-runner/repositories/source.repository';
import { TestDataInjectorService } from '../src/prediction-runner/services/test-data-injector.service';
import { TestDataGeneratorService } from '../src/prediction-runner/services/test-data-generator.service';

const ORG_SLUG = 'finance';

async function bootstrap() {
  console.log('Creating NestJS application context...');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'error', 'warn'],
  });

  try {
    const universeRepo = app.get(UniverseRepository);
    const targetRepo = app.get(TargetRepository);
    const sourceRepo = app.get(SourceRepository);
    const testDataInjector = app.get(TestDataInjectorService);
    const testDataGenerator = app.get(TestDataGeneratorService);

    // Step 1: Find existing universe (don't create - requires valid agent_slug foreign key)
    console.log('\n=== Step 1: Finding Existing Universe ===');
    let universes = await universeRepo.findAll(ORG_SLUG);
    let universe = universes[0]; // Use first available universe

    if (!universe) {
      console.log('No universes found. Please create a universe via the Prediction Dashboard first.');
      console.log('The universe requires a valid agent_slug that exists in the agents table.');
      console.log('\nAlternatively, run: npm run dev and create a universe via the UI.');
      return;
    }
    console.log(`Using existing universe: ${universe.name} (${universe.id})`);
    console.log(`  Agent: ${universe.agent_slug}`);
    console.log(`  Domain: ${universe.domain}`);

    // Step 2: Create test targets (match universe domain)
    console.log('\n=== Step 2: Creating Test Targets ===');

    // Define targets based on universe domain
    type TargetSymbol = { symbol: string; name: string; type: 'stock' | 'crypto' };
    let targetSymbols: TargetSymbol[];

    if (universe.domain === 'crypto') {
      targetSymbols = [
        { symbol: 'BTC', name: 'Bitcoin', type: 'crypto' },
        { symbol: 'ETH', name: 'Ethereum', type: 'crypto' },
        { symbol: 'SOL', name: 'Solana', type: 'crypto' },
        { symbol: 'AVAX', name: 'Avalanche', type: 'crypto' },
        { symbol: 'LINK', name: 'Chainlink', type: 'crypto' },
      ];
    } else {
      targetSymbols = [
        { symbol: 'AAPL', name: 'Apple Inc.', type: 'stock' },
        { symbol: 'GOOGL', name: 'Alphabet Inc.', type: 'stock' },
        { symbol: 'MSFT', name: 'Microsoft Corporation', type: 'stock' },
        { symbol: 'TSLA', name: 'Tesla Inc.', type: 'stock' },
        { symbol: 'AMZN', name: 'Amazon.com Inc.', type: 'stock' },
      ];
    }

    const targets: Array<{ id: string; symbol: string }> = [];
    for (const { symbol, name, type } of targetSymbols) {
      let target = await targetRepo.findBySymbol(universe.id, symbol);
      if (!target) {
        console.log(`Creating target: ${symbol}...`);
        const context =
          type === 'crypto'
            ? `${name} (${symbol}) is a major cryptocurrency.`
            : `${name} is a major technology company traded on NASDAQ.`;
        target = await targetRepo.create({
          universe_id: universe.id,
          symbol,
          name,
          target_type: type,
          context,
          is_active: true,
        });
        console.log(`Created target: ${target.id}`);
      } else {
        console.log(`Found existing target: ${symbol} (${target.id})`);
      }
      targets.push({ id: target.id, symbol });
    }

    // Step 3: Create test source
    console.log('\n=== Step 3: Creating Test Source ===');
    let sources = await sourceRepo.findAll();
    let testSource = sources.find((s) => s.name === 'Test News Source');

    if (!testSource) {
      console.log('Creating new test source...');
      testSource = await sourceRepo.create({
        name: 'Test News Source',
        description: 'Source for test data generation',
        source_type: 'web',
        url: 'https://test-news.example.com',
        scope_level: 'universe',
        universe_id: universe.id,
        crawl_frequency_minutes: 60,
        is_active: true,
        is_test: true,
      });
      console.log(`Created source: ${testSource.id}`);
    } else {
      console.log(`Found existing source: ${testSource.id}`);
    }

    // Step 4: Create test scenario
    console.log('\n=== Step 4: Creating Test Scenario ===');
    const firstTarget = targets[0];
    if (!firstTarget) {
      throw new Error('No targets created - cannot create scenario');
    }
    const scenario = await testDataInjector.createScenario({
      name: `Test Scenario - ${new Date().toISOString().split('T')[0]}`,
      description: 'Auto-generated test scenario with mock signals',
      injection_points: ['signals', 'predictors', 'predictions'],
      target_id: firstTarget.id, // Use first target (AAPL)
      organization_slug: ORG_SLUG,
      config: {
        auto_run_tiers: false,
      },
    });
    console.log(`Created scenario: ${scenario.id}`);

    // Step 5: Generate test signals for each target
    console.log('\n=== Step 5: Generating Test Signals ===');
    let totalSignals = 0;

    for (const target of targets) {
      console.log(`Generating signals for ${target.symbol}...`);

      const signalConfig = {
        count: 10,
        target_id: target.id,
        source_id: testSource.id,
        distribution: {
          bullish: 0.4,
          bearish: 0.4,
          neutral: 0.2,
        },
        topic: target.symbol,
      };

      const signals = testDataGenerator.generateMockSignals(signalConfig);
      const injected = await testDataInjector.injectSignals(scenario.id, signals);

      console.log(`  Generated ${injected.length} signals for ${target.symbol}`);
      totalSignals += injected.length;
    }

    // Summary
    console.log('\n=== SEED DATA SUMMARY ===');
    console.log(`Universe: ${universe.name} (${universe.id})`);
    console.log(`Targets: ${targets.length}`);
    targets.forEach((t) => console.log(`  - ${t.symbol} (${t.id})`));
    console.log(`Source: ${testSource.name} (${testSource.id})`);
    console.log(`Scenario: ${scenario.name} (${scenario.id})`);
    console.log(`Total Signals Generated: ${totalSignals}`);

    // Get final counts
    const counts = await testDataInjector.getScenarioDataCounts(scenario.id);
    console.log('\nScenario Data Counts:');
    Object.entries(counts).forEach(([table, count]) => {
      if (count > 0) {
        console.log(`  ${table}: ${count}`);
      }
    });
  } catch (error) {
    console.error('Error seeding data:', error);
    throw error;
  } finally {
    await app.close();
    console.log('\nDone!');
  }
}

bootstrap().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
