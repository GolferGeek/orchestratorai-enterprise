const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

async function testMetadata() {
  try {
    console.log('🔐 Logging in...');
    const loginResponse = await axios.post('http://localhost:6100/auth/login', {
      email: 'demo.user@playground.com',
      password: 'demouser'
    });
    
    const token = loginResponse.data.accessToken;
    console.log('✅ Login successful\n');
    
    console.log('🧪 Testing metadata generation with dictionary pseudonymization...');
    
    const response = await axios.post('http://localhost:6100/agents/marketing/blog_post/tasks', {
      method: 'process',
      prompt: 'Write a blog post about Matt Weber and GolferGeek working together at Orchestrator AI. They are building amazing AI tools.',
      conversationId: uuidv4(),
      conversationHistory: [],
      executionMode: 'immediate',
      taskId: uuidv4()
    }, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('📊 METADATA ANALYSIS:');
    console.log('='.repeat(50));
    
    if (response.data.metadata) {
      const metadata = response.data.metadata;
      
      console.log('\n🎯 PII/Pseudonymization Metadata:');
      console.log('  dataSanitizationApplied:', metadata.dataSanitizationApplied);
      console.log('  sanitizationLevel:', metadata.sanitizationLevel);
      console.log('  piiDetected:', metadata.piiDetected);
      console.log('  piiTypes:', metadata.piiTypes);
      console.log('  pseudonymsUsed:', metadata.pseudonymsUsed);
      console.log('  pseudonymTypes:', metadata.pseudonymTypes);
      
      console.log('\n⏱️ Performance Metadata:');
      console.log('  sanitizationTimeMs:', metadata.sanitizationTimeMs);
      console.log('  reversalContextSize:', metadata.reversalContextSize);
      
      console.log('\n🛡️ Compliance Metadata:');
      console.log('  complianceFlags:', JSON.stringify(metadata.complianceFlags, null, 2));
      
      // Check if we have the specific pseudonym mappings
      if (metadata.pseudonymMappings) {
        console.log('\n🎭 Pseudonym Mappings (what users should see):');
        metadata.pseudonymMappings.forEach(mapping => {
          console.log(`  "${mapping.originalValue}" → "${mapping.pseudonym}" (${mapping.dataType}/${mapping.category})`);
        });
      } else {
        console.log('\n❌ No pseudonymMappings found in metadata!');
      }
      
      console.log('\n📋 Full Metadata Structure:');
      console.log(JSON.stringify(metadata, null, 2));
      
    } else {
      console.log('❌ No metadata found in response!');
    }
    
    console.log('\n📝 Response Preview:');
    console.log(response.data.response.substring(0, 200) + '...');
    
  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

testMetadata();
