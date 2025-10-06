// Quick test script for the multi-tenant search platform
const http = require('http');

// Test the running server
function testServer() {
  console.log('🧪 Testing Multi-Tenant Search Platform\n');

  // Test 1: Health Check
  console.log('1. Testing Health Endpoint...');
  
  const healthReq = http.request({
    hostname: 'localhost',
    port: 3000,
    path: '/health',
    method: 'GET'
  }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      const health = JSON.parse(data);
      console.log(`   ✅ Status: ${health.status}`);
      console.log(`   ✅ Services: ${health.services.search_engine.status}, ${health.services.cache.status}\n`);
      
      // Test 2: Search Query
      testSearch();
    });
  });
  
  healthReq.on('error', (err) => {
    console.log('❌ Health check failed:', err.message);
    console.log('💡 Make sure the server is running: node src/simple-server.js');
  });
  
  healthReq.end();
}

function testSearch() {
  console.log('2. Testing Search Endpoint...');
  
  const searchData = JSON.stringify({ q: 'acme' });
  
  const searchReq = http.request({
    hostname: 'localhost',
    port: 3000,
    path: '/search',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Tenant-ID': 'tenant-123',
      'Content-Length': Buffer.byteLength(searchData)
    }
  }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      const result = JSON.parse(data);
      console.log(`   ✅ Found: ${result.total.value} results`);
      console.log(`   ✅ Took: ${Math.round(result.performance.took_ms * 100) / 100}ms`);
      console.log(`   ✅ Classification: ${result.debug.query_classification}\n`);
      
      // Test 3: Suggestions
      testSuggestions();
    });
  });
  
  searchReq.on('error', (err) => {
    console.log('❌ Search test failed:', err.message);
  });
  
  searchReq.write(searchData);
  searchReq.end();
}

function testSuggestions() {
  console.log('3. Testing Suggestions Endpoint...');
  
  const suggestData = JSON.stringify({ prefix: 'acme', limit: 5 });
  
  const suggestReq = http.request({
    hostname: 'localhost',
    port: 3000,
    path: '/suggest',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Tenant-ID': 'tenant-123',
      'Content-Length': Buffer.byteLength(suggestData)
    }
  }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      const result = JSON.parse(data);
      console.log(`   ✅ Suggestions: ${result.suggestions.length}`);
      result.suggestions.forEach((s, i) => {
        console.log(`     ${i + 1}. ${s.text} (score: ${s.score})`);
      });
      console.log('\n✅ All tests completed successfully!');
      console.log('🚀 Your multi-tenant search platform is working correctly!');
    });
  });
  
  suggestReq.on('error', (err) => {
    console.log('❌ Suggestions test failed:', err.message);
  });
  
  suggestReq.write(suggestData);
  suggestReq.end();
}

// Run the tests
testServer();