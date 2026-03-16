/**
 * Cleanup Test Scenarios
 *
 * Removes duplicate test scenarios and auto-generated test scenarios,
 * then populates the remaining scenarios with realistic test data.
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const CORE_SCENARIOS = [
  'Bull Market Tech Rally',
  'Q4 Earnings Season',
  'Crypto Volatility Event',
  'Mixed Signal Analysis'
];

async function cleanupDuplicates() {
  console.log('Step 1: Cleaning up duplicate scenarios...\n');

  // Get all scenarios
  const { data: scenarios, error } = await supabase
    .schema('prediction')
    .from('test_scenarios')
    .select('id, name, created_at')
    .order('name')
    .order('created_at');

  if (error) {
    console.error('Failed to fetch scenarios:', error.message);
    return {};
  }

  // Group by name and keep oldest
  const keepers = {};
  const toDelete = [];

  scenarios.forEach(s => {
    if (!keepers[s.name]) {
      keepers[s.name] = s.id;
    } else {
      toDelete.push(s.id);
    }
  });

  console.log('Keeper scenarios (oldest of each):');
  CORE_SCENARIOS.forEach(name => {
    if (keepers[name]) {
      console.log(`  ${name}: ${keepers[name]}`);
    }
  });

  // Also mark auto-generated scenarios for deletion
  scenarios.forEach(s => {
    if (s.name.includes('Test Scenario') ||
        s.name.startsWith('Cleanup Test') ||
        s.name.startsWith('E2E Test') ||
        s.name.startsWith('Pipeline Test') ||
        s.name.startsWith('Run Test') ||
        s.name.startsWith('Variation Source')) {
      if (!toDelete.includes(s.id)) {
        toDelete.push(s.id);
        delete keepers[s.name];
      }
    }
  });

  console.log(`\nScenarios to delete: ${toDelete.length}`);

  // Delete duplicates and auto-generated
  if (toDelete.length > 0) {
    const { error: deleteError } = await supabase
      .schema('prediction')
      .from('test_scenarios')
      .delete()
      .in('id', toDelete);

    if (deleteError) {
      console.error('Delete error:', deleteError.message);
    } else {
      console.log(`Deleted ${toDelete.length} scenarios`);
    }
  }

  return keepers;
}

async function updateScenarioDescriptions(keepers) {
  console.log('\nStep 2: Updating scenario descriptions...\n');

  const updates = [
    {
      name: 'Bull Market Tech Rally',
      description: 'A bullish market scenario simulating strong tech sector momentum with positive earnings surprises, increased institutional buying, and favorable macro conditions. Tests prediction accuracy during upward trending markets.',
      config: {
        market_condition: 'bullish',
        sector_focus: 'technology',
        volatility_level: 'low',
        duration_days: 30,
        expected_move: '+15%',
        key_catalysts: ['earnings_beats', 'ai_expansion', 'rate_cuts']
      }
    },
    {
      name: 'Q4 Earnings Season',
      description: 'Tests prediction system during Q4 earnings season when companies report quarterly results. High signal volume with mixed sentiment as some companies beat and others miss estimates.',
      config: {
        market_condition: 'mixed',
        sector_focus: 'diversified',
        volatility_level: 'medium',
        duration_days: 45,
        expected_move: 'varied',
        key_catalysts: ['earnings_reports', 'guidance_updates', 'analyst_revisions']
      }
    },
    {
      name: 'Crypto Volatility Event',
      description: 'High volatility crypto scenario simulating major market events like ETF approvals, regulatory news, or whale movements. Tests system resilience and prediction accuracy during rapid price swings.',
      config: {
        market_condition: 'volatile',
        sector_focus: 'cryptocurrency',
        volatility_level: 'extreme',
        duration_days: 14,
        expected_move: '+/-30%',
        key_catalysts: ['etf_news', 'regulatory_action', 'whale_activity', 'exchange_events']
      }
    },
    {
      name: 'Mixed Signal Analysis',
      description: 'Challenging scenario with conflicting signals from different sources. Tests how well the prediction system handles uncertainty and mixed analyst opinions.',
      config: {
        market_condition: 'uncertain',
        sector_focus: 'cross_sector',
        volatility_level: 'medium',
        duration_days: 21,
        expected_move: 'unclear',
        key_catalysts: ['conflicting_data', 'sector_rotation', 'macro_uncertainty']
      }
    }
  ];

  for (const update of updates) {
    if (keepers[update.name]) {
      const { error } = await supabase
        .schema('prediction')
        .from('test_scenarios')
        .update({
          description: update.description,
          config: update.config
        })
        .eq('id', keepers[update.name]);

      if (error) {
        console.error(`Failed to update ${update.name}:`, error.message);
      } else {
        console.log(`Updated: ${update.name}`);
      }
    }
  }
}

async function createTestArticles(keepers) {
  console.log('\nStep 3: Creating test articles...\n');

  // Clear existing test articles for these scenarios
  const scenarioIds = Object.values(keepers).filter(id => id);
  if (scenarioIds.length > 0) {
    await supabase
      .schema('prediction')
      .from('test_articles')
      .delete()
      .in('scenario_id', scenarioIds);
  }

  const articles = [];
  const now = new Date();

  // Column mapping: title, content, source_name, target_symbols (array), sentiment_expected, strength_expected, is_synthetic

  // Bull Market Tech Rally Articles
  if (keepers['Bull Market Tech Rally']) {
    const scenarioId = keepers['Bull Market Tech Rally'];
    articles.push(
      {
        scenario_id: scenarioId,
        organization_slug: 'finance',
        target_symbols: ['T_AAPL'],
        title: 'Apple Reports Record iPhone Sales Amid AI Integration Push',
        content: 'Apple Inc. reported record-breaking iPhone sales for the quarter, driven by strong demand for AI-enhanced features in the iPhone 16 lineup. The company\'s AI strategy is showing early signs of success with Vision Pro sales exceeding expectations.',
        sentiment_expected: 'positive',
        strength_expected: 0.8,
        source_name: 'Bloomberg',
        published_at: new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString(),
        is_synthetic: true,
        synthetic_marker: 'TEST_DATA'
      },
      {
        scenario_id: scenarioId,
        organization_slug: 'finance',
        target_symbols: ['T_NVDA'],
        title: 'NVIDIA H200 Demand Outpaces Supply as AI Spending Accelerates',
        content: 'NVIDIA Corporation continues to see unprecedented demand for its H200 GPU chips as major cloud providers race to build AI infrastructure. The company has secured multi-billion dollar orders from Microsoft, Google, and Amazon.',
        sentiment_expected: 'positive',
        strength_expected: 0.9,
        source_name: 'Reuters',
        published_at: new Date(now - 4 * 24 * 60 * 60 * 1000).toISOString(),
        is_synthetic: true,
        synthetic_marker: 'TEST_DATA'
      },
      {
        scenario_id: scenarioId,
        organization_slug: 'finance',
        target_symbols: ['T_MSFT'],
        title: 'Microsoft Azure AI Revenue Grows 50% as Enterprise Adoption Soars',
        content: 'Microsoft\'s cloud computing division reported 50% year-over-year growth in AI-related revenue as enterprises accelerate digital transformation initiatives. Azure\'s AI services now account for 15% of total cloud revenue.',
        sentiment_expected: 'positive',
        strength_expected: 0.85,
        source_name: 'CNBC',
        published_at: new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString(),
        is_synthetic: true,
        synthetic_marker: 'TEST_DATA'
      }
    );
  }

  // Q4 Earnings Season Articles
  if (keepers['Q4 Earnings Season']) {
    const scenarioId = keepers['Q4 Earnings Season'];
    articles.push(
      {
        scenario_id: scenarioId,
        organization_slug: 'finance',
        target_symbols: ['T_AAPL'],
        title: 'Apple Q4 Earnings Beat Expectations, China Sales Show Recovery',
        content: 'Apple Inc. reported Q4 earnings per share of $2.18, beating analyst estimates of $2.10. Revenue came in at $94.9 billion, above the $94.3 billion consensus. Services revenue hit a new record.',
        sentiment_expected: 'positive',
        strength_expected: 0.75,
        source_name: 'Bloomberg',
        published_at: new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString(),
        is_synthetic: true,
        synthetic_marker: 'TEST_DATA'
      },
      {
        scenario_id: scenarioId,
        organization_slug: 'finance',
        target_symbols: ['T_TSLA'],
        title: 'Tesla Misses Q4 Delivery Estimates, Margin Pressure Continues',
        content: 'Tesla Inc. delivered 484,500 vehicles in Q4, below the 500,000 estimate. Automotive gross margins fell to 17.5% from 19.8% in the prior quarter due to price cuts and incentives.',
        sentiment_expected: 'negative',
        strength_expected: 0.7,
        source_name: 'CNBC',
        published_at: new Date(now - 8 * 24 * 60 * 60 * 1000).toISOString(),
        is_synthetic: true,
        synthetic_marker: 'TEST_DATA'
      },
      {
        scenario_id: scenarioId,
        organization_slug: 'finance',
        target_symbols: ['T_AMZN'],
        title: 'Amazon Q4 Results Mixed: AWS Beats, Retail Margins Compress',
        content: 'Amazon reported mixed Q4 results with AWS revenue growing 18% year-over-year but retail margins coming under pressure from increased competition.',
        sentiment_expected: null,
        strength_expected: 0.5,
        source_name: 'Reuters',
        published_at: new Date(now - 9 * 24 * 60 * 60 * 1000).toISOString(),
        is_synthetic: true,
        synthetic_marker: 'TEST_DATA'
      }
    );
  }

  // Crypto Volatility Event Articles
  if (keepers['Crypto Volatility Event']) {
    const scenarioId = keepers['Crypto Volatility Event'];
    articles.push(
      {
        scenario_id: scenarioId,
        organization_slug: 'finance',
        target_symbols: ['T_BTC'],
        title: 'Bitcoin Surges Past $100K After BlackRock ETF Sees Record Inflows',
        content: 'Bitcoin soared past $100,000 for the first time as BlackRock\'s iShares Bitcoin Trust recorded $1.2 billion in daily inflows, the largest single-day inflow for any Bitcoin ETF.',
        sentiment_expected: 'positive',
        strength_expected: 0.95,
        source_name: 'CoinDesk',
        published_at: new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString(),
        is_synthetic: true,
        synthetic_marker: 'TEST_DATA'
      },
      {
        scenario_id: scenarioId,
        organization_slug: 'finance',
        target_symbols: ['T_BTC'],
        title: 'Massive Bitcoin Whale Moves 15,000 BTC to Exchange Sparking Sell-Off Fears',
        content: 'On-chain data shows a dormant whale address transferring 15,000 BTC worth approximately $1.5 billion to Coinbase, triggering concerns of an impending sell-off.',
        sentiment_expected: 'negative',
        strength_expected: 0.8,
        source_name: 'The Block',
        published_at: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
        is_synthetic: true,
        synthetic_marker: 'TEST_DATA'
      },
      {
        scenario_id: scenarioId,
        organization_slug: 'finance',
        target_symbols: ['T_ETH'],
        title: 'Ethereum Staking Withdrawals Spike as Validators Lock in Profits',
        content: 'Ethereum saw its largest weekly staking withdrawals in six months as validators moved to lock in gains from the recent rally. The ETH/BTC ratio weakened to 0.045.',
        sentiment_expected: null,
        strength_expected: 0.6,
        source_name: 'Decrypt',
        published_at: new Date(now - 1 * 24 * 60 * 60 * 1000).toISOString(),
        is_synthetic: true,
        synthetic_marker: 'TEST_DATA'
      }
    );
  }

  // Mixed Signal Analysis Articles
  if (keepers['Mixed Signal Analysis']) {
    const scenarioId = keepers['Mixed Signal Analysis'];
    articles.push(
      {
        scenario_id: scenarioId,
        organization_slug: 'finance',
        target_symbols: ['T_AAPL'],
        title: 'Analysts Split on Apple: Bulls See AI Opportunity, Bears Cite iPhone Saturation',
        content: 'Wall Street remains divided on Apple with Morgan Stanley raising its target to $250 citing AI monetization potential while Goldman Sachs downgraded to Sell.',
        sentiment_expected: null,
        strength_expected: 0.5,
        source_name: 'MarketWatch',
        published_at: new Date(now - 4 * 24 * 60 * 60 * 1000).toISOString(),
        is_synthetic: true,
        synthetic_marker: 'TEST_DATA'
      },
      {
        scenario_id: scenarioId,
        organization_slug: 'finance',
        target_symbols: ['T_NVDA'],
        title: 'NVIDIA: Export Restrictions vs Domestic Demand Creates Uncertainty',
        content: 'NVIDIA faces a complex outlook as new U.S. export restrictions to China could reduce revenue by $3B annually while domestic AI demand continues to surge.',
        sentiment_expected: null,
        strength_expected: 0.55,
        source_name: 'Barron\'s',
        published_at: new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString(),
        is_synthetic: true,
        synthetic_marker: 'TEST_DATA'
      },
      {
        scenario_id: scenarioId,
        organization_slug: 'finance',
        target_symbols: ['T_GOOGL'],
        title: 'Google\'s AI Lead Questioned as ChatGPT Maintains Search Momentum',
        content: 'Alphabet faces an uncertain competitive position as OpenAI\'s ChatGPT continues to gain ground in search queries.',
        sentiment_expected: null,
        strength_expected: 0.45,
        source_name: 'The Information',
        published_at: new Date(now - 1 * 24 * 60 * 60 * 1000).toISOString(),
        is_synthetic: true,
        synthetic_marker: 'TEST_DATA'
      }
    );
  }

  if (articles.length > 0) {
    const { error } = await supabase
      .schema('prediction')
      .from('test_articles')
      .insert(articles);

    if (error) {
      console.error('Failed to insert articles:', error.message);
    } else {
      console.log(`Created ${articles.length} test articles`);
    }
  }
}

async function createTestPriceData(keepers) {
  console.log('\nStep 4: Creating test price data...\n');

  // Column names: organization_slug, scenario_id, symbol, price_timestamp, open, high, low, close, volume, metadata

  // Clear existing price data for these scenarios
  const scenarioIds = Object.values(keepers).filter(id => id);
  if (scenarioIds.length > 0) {
    await supabase
      .schema('prediction')
      .from('test_price_data')
      .delete()
      .in('scenario_id', scenarioIds);
  }

  const priceData = [];
  const now = new Date();
  const DAY_MS = 24 * 60 * 60 * 1000;

  // Each scenario will use non-overlapping date ranges to avoid unique constraint violations
  // Bull Market: 90-60 days ago
  // Q4 Earnings: 150-105 days ago
  // Crypto: 30-16 days ago
  // Mixed Signal: 60-39 days ago

  // Bull Market Tech Rally - Trending up (90-60 days ago)
  if (keepers['Bull Market Tech Rally']) {
    const scenarioId = keepers['Bull Market Tech Rally'];

    // AAPL: Rising from $175 to ~$200
    for (let day = 0; day <= 30; day++) {
      const basePrice = 175 + (day * 0.85) + (Math.random() * 2 - 1);
      priceData.push({
        scenario_id: scenarioId,
        organization_slug: 'finance',
        symbol: 'T_AAPL',
        price_timestamp: new Date(now - (90 - day) * DAY_MS).toISOString(),
        open: basePrice - 1,
        high: basePrice + 2,
        low: basePrice - 2,
        close: basePrice,
        volume: 45000000 + Math.floor(Math.random() * 10000000)
      });
    }

    // NVDA: Rising from $480 to ~$600
    for (let day = 0; day <= 30; day++) {
      const basePrice = 480 + (day * 4.0) + (Math.random() * 5 - 2.5);
      priceData.push({
        scenario_id: scenarioId,
        organization_slug: 'finance',
        symbol: 'T_NVDA',
        price_timestamp: new Date(now - (90 - day) * DAY_MS).toISOString(),
        open: basePrice - 3,
        high: basePrice + 5,
        low: basePrice - 4,
        close: basePrice,
        volume: 30000000 + Math.floor(Math.random() * 15000000)
      });
    }
  }

  // Crypto Volatility - Wild swings (30-16 days ago)
  if (keepers['Crypto Volatility Event']) {
    const scenarioId = keepers['Crypto Volatility Event'];

    // BTC: Pump to 102K then dump
    for (let day = 0; day <= 14; day++) {
      let basePrice;
      if (day < 5) {
        basePrice = 85000 + (day * 3500) + (Math.random() * 2000 - 1000);
      } else if (day === 5) {
        basePrice = 102000 + (Math.random() * 1000);
      } else if (day < 8) {
        basePrice = 102000 - ((day - 5) * 4000) + (Math.random() * 2000 - 1000);
      } else {
        basePrice = 90000 + (Math.random() * 3000 - 1500);
      }
      priceData.push({
        scenario_id: scenarioId,
        organization_slug: 'finance',
        symbol: 'T_BTC',
        price_timestamp: new Date(now - (30 - day) * DAY_MS).toISOString(),
        open: basePrice - 1500,
        high: basePrice + 2000,
        low: basePrice - 2500,
        close: basePrice,
        volume: 25000000000 + Math.floor(Math.random() * 10000000000)
      });
    }
  }

  // Mixed Signal Analysis - Choppy, no trend (60-39 days ago)
  if (keepers['Mixed Signal Analysis']) {
    const scenarioId = keepers['Mixed Signal Analysis'];

    // T_GOOGL instead of T_AAPL to avoid symbol conflicts
    for (let day = 0; day <= 21; day++) {
      const basePrice = 185 + (Math.sin(day * 0.5) * 5) + (Math.random() * 4 - 2);
      priceData.push({
        scenario_id: scenarioId,
        organization_slug: 'finance',
        symbol: 'T_GOOGL',
        price_timestamp: new Date(now - (60 - day) * DAY_MS).toISOString(),
        open: basePrice - 1.5,
        high: basePrice + 2,
        low: basePrice - 2,
        close: basePrice,
        volume: 40000000 + Math.floor(Math.random() * 15000000)
      });
    }
  }

  // Q4 Earnings Season - Earnings reactions (150-105 days ago)
  if (keepers['Q4 Earnings Season']) {
    const scenarioId = keepers['Q4 Earnings Season'];

    // T_MSFT instead of T_AAPL to avoid symbol conflicts
    for (let day = 0; day <= 45; day++) {
      let basePrice;
      if (day < 20) {
        basePrice = 420 + (Math.random() * 4 - 2);
      } else if (day === 20) {
        basePrice = 432; // Earnings beat gap up
      } else {
        basePrice = 432 + (Math.random() * 3 - 1.5);
      }
      priceData.push({
        scenario_id: scenarioId,
        organization_slug: 'finance',
        symbol: 'T_MSFT',
        price_timestamp: new Date(now - (150 - day) * DAY_MS).toISOString(),
        open: basePrice - 1,
        high: basePrice + 2,
        low: basePrice - 2,
        close: basePrice,
        volume: 55000000 + Math.floor(Math.random() * 20000000)
      });
    }

    // TSLA: Gap down on earnings miss day 15
    for (let day = 0; day <= 45; day++) {
      let basePrice;
      if (day < 15) {
        basePrice = 260 + (Math.random() * 6 - 3);
      } else if (day === 15) {
        basePrice = 240; // Earnings miss gap down
      } else {
        basePrice = 240 + (day - 15) * 0.3 + (Math.random() * 4 - 2);
      }
      priceData.push({
        scenario_id: scenarioId,
        organization_slug: 'finance',
        symbol: 'T_TSLA',
        price_timestamp: new Date(now - (150 - day) * DAY_MS).toISOString(),
        open: basePrice - 3,
        high: basePrice + 4,
        low: basePrice - 5,
        close: basePrice,
        volume: 85000000 + Math.floor(Math.random() * 30000000)
      });
    }
  }

  // Insert in batches
  const batchSize = 100;
  let successCount = 0;
  for (let i = 0; i < priceData.length; i += batchSize) {
    const batch = priceData.slice(i, i + batchSize);
    const { error } = await supabase
      .schema('prediction')
      .from('test_price_data')
      .insert(batch);

    if (error) {
      console.error(`Failed to insert price data batch ${i}:`, error.message);
    } else {
      successCount += batch.length;
    }
  }

  console.log(`Created ${successCount} price data points`);
}

async function verify() {
  console.log('\n========== VERIFICATION ==========\n');

  const { data: scenarios } = await supabase
    .schema('prediction')
    .from('test_scenarios')
    .select('id, name, status');

  const { data: articles } = await supabase
    .schema('prediction')
    .from('test_articles')
    .select('id, scenario_id')
    .eq('is_synthetic', true);

  const { data: priceData } = await supabase
    .schema('prediction')
    .from('test_price_data')
    .select('id, scenario_id');

  // Filter to our scenarios
  const scenarioIds = scenarios?.map(s => s.id) || [];
  const ourArticles = articles?.filter(a => scenarioIds.includes(a.scenario_id)) || [];
  const ourPriceData = priceData?.filter(p => scenarioIds.includes(p.scenario_id)) || [];

  console.log(`Total scenarios: ${scenarios?.length || 0}`);
  scenarios?.forEach(s => console.log(`  - ${s.name} (${s.status})`));
  console.log(`Total test articles: ${ourArticles.length}`);
  console.log(`Total price data points: ${ourPriceData.length}`);
  console.log('\n===================================');
}

async function main() {
  console.log('=== Test Scenario Cleanup Script ===\n');

  const keepers = await cleanupDuplicates();
  await updateScenarioDescriptions(keepers);
  await createTestArticles(keepers);
  await createTestPriceData(keepers);
  await verify();

  console.log('\nDone!');
}

main().catch(console.error);
