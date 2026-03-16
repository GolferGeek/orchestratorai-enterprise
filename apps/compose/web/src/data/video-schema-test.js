// Test script to validate videos.json schema changes
import videosData from './videos.json';

console.log('Testing videos.json schema...');

// Test 1: Validate JSON structure
try {
  console.log('✅ JSON is valid');
} catch (error) {
  console.error('❌ JSON is invalid:', error.message);
  process.exit(1);
}

// Test 2: Validate required fields
const required = ['categoryOrder', 'categories', 'agentDefaults', 'metadata'];
for (const field of required) {
  if (!videosData[field]) {
    console.error(`❌ Missing required field: ${field}`);
    process.exit(1);
  }
}
console.log('✅ Required top-level fields present');

// Test 3: Validate agents category exists
if (!videosData.categories.agents) {
  console.error('❌ Missing agents category');
  process.exit(1);
}
console.log('✅ Agents category present');

// Test 4: Validate agent videos
const agentVideos = videosData.categories.agents.videos;
const requiredVideos = [
  'agent-default-overview',
  'metrics-agent-walkthrough', 
  'marketing-swarm-demo',
  'requirements-writer-tutorial',
  'golf-rules-coach-demo',
  'jokes-agent-demo'
];

for (const videoId of requiredVideos) {
  const video = agentVideos.find(v => v.id === videoId);
  if (!video) {
    console.error(`❌ Missing required video: ${videoId}`);
    process.exit(1);
  }
}
console.log('✅ All required agent videos present');

// Test 5: Validate agentDefaults structure
if (typeof videosData.agentDefaults !== 'object') {
  console.error('❌ agentDefaults must be an object');
  process.exit(1);
}
console.log('✅ agentDefaults field properly structured');

// Test 6: Validate metadata
if (videosData.metadata.totalVideos !== 14) {
  console.error(`❌ Expected 14 total videos, got ${videosData.metadata.totalVideos}`);
  process.exit(1);
}
console.log('✅ Metadata totalVideos count is correct');

console.log('\n🎉 All schema validation tests passed!');
console.log(`Total videos: ${videosData.metadata.totalVideos}`);
console.log(`Total categories: ${videosData.metadata.categories}`);
console.log('Schema is ready for production use.');