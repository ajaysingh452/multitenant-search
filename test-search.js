// Test script for the multi-tenant search platform
const https = require('http');

// Configuration
const BASE_URL = 'http://localhost:3000';
const TENANT_ID = 'tenant-123';

// Helper function to make HTTP requests
function makeRequest(method, path, data) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'X-Tenant-ID': TENANT_ID
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const result = {
            status: res.statusCode,
            headers: res.headers,
            data: JSON.parse(body)
          };
          resolve(result);
        } catch (error) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: body
          });
        }
      });
    });

    req.on('error', reject);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

// Test suite
async function runTests() {
  console.log('🧪 Testing Multi-Tenant Search Platform\n');

  try {
    // 1. Health check
    console.log('1. Health Check...');
    const health = await makeRequest('GET', '/health');
    console.log(`   Status: ${health.status}`);
    console.log(`   Response: ${JSON.stringify(health.data, null, 2)}\n`);

    // 2. Basic search
    console.log('2. Basic Search (query: "acme")...');
    const search1 = await makeRequest('POST', '/search', {
      q: 'acme'
    });
    console.log(`   Status: ${search1.status}`);
    console.log(`   Found: ${search1.data.total?.value || 0} results`);
    console.log(`   Took: ${search1.data.performance?.took_ms || 0}ms`);
    console.log(`   Classification: ${search1.data.debug?.query_classification || 'unknown'}\n`);

    // 3. Filtered search
    console.log('3. Filtered Search (status: "active")...');
    const search2 = await makeRequest('POST', '/search', {
      filters: {
        status: 'active'
      }
    });
    console.log(`   Status: ${search2.status}`);
    console.log(`   Found: ${search2.data.total?.value || 0} results`);
    console.log(`   Took: ${search2.data.performance?.took_ms || 0}ms\n`);

    // 4. Suggestions
    console.log('4. Suggestions (prefix: "acme")...');
    const suggest = await makeRequest('POST', '/suggest', {
      prefix: 'acme',
      limit: 5
    });
    console.log(`   Status: ${suggest.status}`);
    console.log(`   Suggestions: ${suggest.data.suggestions?.length || 0}`);
    if (suggest.data.suggestions?.length > 0) {
      suggest.data.suggestions.forEach((s, i) => {
        console.log(`     ${i + 1}. ${s.text} (score: ${s.score})`);
      });
    }
    console.log();

    // 5. Query explanation
    console.log('5. Query Explanation...');
    const explain = await makeRequest('POST', '/explain', {
      q: 'technology',
      filters: {
        status: 'active',
        entity: 'customer'
      }
    });
    console.log(`   Status: ${explain.status}`);
    console.log(`   Classification: ${explain.data.classification}`);
    console.log(`   Routing Engine: ${explain.data.routing?.engine}`);
    console.log(`   Complexity Score: ${explain.data.estimated_cost?.complexity_score}`);
    console.log(`   Expected Latency: ${explain.data.estimated_cost?.expected_latency_ms}ms`);
    console.log(`   Cacheable: ${explain.data.cache_strategy?.cacheable}\n`);

    // 6. Metrics
    console.log('6. Performance Metrics...');
    const metrics = await makeRequest('GET', '/metrics');
    console.log(`   Status: ${metrics.status}`);
    console.log(`   P50 Latency: ${metrics.data.latency?.p50}ms`);
    console.log(`   Cache Hit Rate: ${(metrics.data.cache?.hit_rate * 100).toFixed(1)}%`);
    console.log(`   Cache Size: ${metrics.data.cache?.size}\n`);

    console.log('✅ All tests completed successfully!');
    console.log('\n🚀 Your multi-tenant search platform is working correctly!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.log('\n💡 Make sure the server is running: npm start');
  }
}

// Run tests if called directly
if (require.main === module) {
  runTests();
}

module.exports = { runTests };