const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

async function testCustomPseudonyms() {
  try {
    console.log('🔐 Logging in...');
    const loginResponse = await axios.post('http://localhost:6100/auth/login', {
      email: 'demo.user@playground.com',
      password: 'demouser'
    });
    
    const token = loginResponse.data.accessToken;
    console.log('✅ Login successful\n');
    
    // Test messages containing our custom pseudonyms (dictionary-based)
    const testMessages = [
      'Hello Matt Weber, how are you today?',
      'GolferGeek is working on the project.',
      'We are using Orchestrator AI for this task.',
      'Matt Weber and GolferGeek are collaborating on Orchestrator AI development.'
    ];
    
    console.log('🧪 Testing custom pseudonym detection and replacement...\n');
    
    for (let i = 0; i < testMessages.length; i++) {
      const message = testMessages[i];
      console.log(`Test ${i + 1}: "${message}"`);
      
      try {
        const response = await axios.post('http://localhost:6100/agents/marketing/blog_post/tasks', {
          method: 'process',
          prompt: message,
          conversationId: uuidv4(),
          conversationHistory: [],
          llmSelection: {
            providerName: 'ollama',
            modelName: 'llama3.2:1b',
            temperature: 0.7
          },
          executionMode: 'immediate',
          taskId: uuidv4()
        }, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (response.data.success && response.data.response) {
          console.log('✅ Response received:');
          console.log(`   "${response.data.response.substring(0, 200)}..."`);
          
          // Check if original names are present (they SHOULD be after reversal)
          const originalText = response.data.response;
          const hasOriginalNames = originalText.includes('Matt Weber') || 
                                 originalText.includes('GolferGeek') || 
                                 originalText.includes('Orchestrator AI');
          
          // Check if pseudonyms are present (they SHOULDN'T be after reversal)
          const hasPseudonyms = originalText.includes('@person_matt') ||
                               originalText.includes('@user_golfer') ||
                               originalText.includes('@company_orchestrator');
          
          if (hasOriginalNames && !hasPseudonyms) {
            console.log('🎉 SUCCESS: Original names present, no pseudonyms - dictionary pseudonymization working correctly!');
          } else if (hasPseudonyms && !hasOriginalNames) {
            console.log('❌ ISSUE: Pseudonyms present instead of originals - reversal not working');
          } else if (hasOriginalNames && hasPseudonyms) {
            console.log('⚠️  MIXED: Both originals and pseudonyms present - partial reversal');
          } else {
            console.log('ℹ️  NEUTRAL: LLM response doesn\'t mention the names');
          }
          
          // Check for sanitization metadata
          if (response.data.sanitizationMetadata) {
            console.log('🔍 Sanitization metadata:', JSON.stringify(response.data.sanitizationMetadata, null, 2));
          }
          
        } else if (response.data.blocked) {
          console.log('🚫 Request was blocked:', response.data.reason || 'No reason provided');
        } else {
          console.log('❓ Unexpected response format:', JSON.stringify(response.data, null, 2));
        }
      } catch (error) {
        console.log('❌ Error:', error.response?.status, error.response?.statusText);
        if (error.response?.data) {
          console.log('   Error details:', JSON.stringify(error.response.data, null, 2));
        }
      }
      
      console.log(''); // Empty line between tests
    }
    
  } catch (error) {
    console.log('❌ Login Error:', error.response?.data || error.message);
  }
}

testCustomPseudonyms();
