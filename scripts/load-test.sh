#!/bin/bash

# Load testing script for multi-tenant search
# Requirements: k6 (https://k6.io/), jq

set -e

# Configuration
SEARCH_ENDPOINT=${SEARCH_ENDPOINT:-"http://localhost:3000"}
TENANT_COUNT=${TENANT_COUNT:-10}
CONCURRENT_USERS=${CONCURRENT_USERS:-50}
TEST_DURATION=${TEST_DURATION:-"5m"}
RAMP_UP_DURATION=${RAMP_UP_DURATION:-"30s"}

# SLO thresholds
SIMPLE_P50_THRESHOLD=100  # ms
SIMPLE_P95_THRESHOLD=300  # ms
COMPLEX_P50_THRESHOLD=300 # ms
COMPLEX_P95_THRESHOLD=800 # ms

echo "🚀 Starting multi-tenant search load test"
echo "Endpoint: $SEARCH_ENDPOINT"
echo "Tenants: $TENANT_COUNT"
echo "Users: $CONCURRENT_USERS"
echo "Duration: $TEST_DURATION"

# Create test data directory
mkdir -p test-results
RESULTS_DIR="test-results/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$RESULTS_DIR"

# Generate tenant IDs
TENANT_IDS=()
for i in $(seq 1 $TENANT_COUNT); do
  TENANT_IDS+=("tenant-$(uuidgen | tr '[:upper:]' '[:lower:]')")
done

# Export tenant IDs for k6
printf '%s\n' "${TENANT_IDS[@]}" > "$RESULTS_DIR/tenant_ids.txt"

# Generate test queries
cat > "$RESULTS_DIR/test_queries.json" << 'EOF'
{
  "simple_queries": [
    {
      "name": "entity_filter",
      "request": {
        "filters": {
          "entity": ["customer"],
          "status": ["active"]
        },
        "page": {"size": 20},
        "sort": [{"field": "dates.created_at", "order": "desc"}]
      }
    },
    {
      "name": "prefix_search",
      "request": {
        "filters": {
          "entity": ["customer"]
        },
        "q": "Acme*",
        "page": {"size": 10}
      }
    },
    {
      "name": "date_range",
      "request": {
        "filters": {
          "entity": ["order"],
          "dates.created_at": {
            "gte": "2024-01-01",
            "lte": "2024-12-31"
          }
        },
        "page": {"size": 20}
      }
    }
  ],
  "complex_queries": [
    {
      "name": "fulltext_with_facets",
      "request": {
        "q": "overdue invoice payment",
        "filters": {
          "entity": ["order", "invoice"],
          "facets.region": ["APAC", "EMEA"],
          "numeric.amount": {"gte": 1000}
        },
        "sort": [{"field": "numeric.amount", "order": "desc"}],
        "page": {"size": 10},
        "options": {
          "highlight": true,
          "timeout_ms": 500
        }
      }
    },
    {
      "name": "complex_text_search",
      "request": {
        "q": "\"high priority\" customer support urgent",
        "filters": {
          "status": ["open", "in_progress"],
          "facets.tier": ["Gold", "Platinum"]
        },
        "sort": [{"field": "dates.created_at", "order": "desc"}],
        "page": {"size": 15},
        "options": {
          "highlight": true,
          "suggest": true,
          "timeout_ms": 700
        }
      }
    },
    {
      "name": "multi_field_search",
      "request": {
        "q": "refund request",
        "filters": {
          "entity": ["ticket", "order"],
          "dates.created_at": {"gte": "2024-06-01"},
          "numeric.amount": {"gte": 100, "lte": 10000}
        },
        "sort": [{"field": "dates.created_at", "order": "desc"}],
        "page": {"size": 25}
      }
    }
  ],
  "suggest_queries": [
    {
      "name": "customer_suggest",
      "request": {
        "prefix": "Acme",
        "entity": ["customer"],
        "limit": 10
      }
    },
    {
      "name": "product_suggest",
      "request": {
        "prefix": "Widget",
        "entity": ["product"],
        "limit": 5
      }
    }
  ]
}
EOF

# Create k6 test script
cat > "$RESULTS_DIR/load_test.js" << 'EOF'
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const searchLatency = new Trend('search_latency', true);
const searchErrors = new Rate('search_errors');
const cacheHitRate = new Rate('cache_hit_rate');

// Load test data
const tenantIds = open('./tenant_ids.txt').split('\n').filter(id => id.trim());
const testQueries = JSON.parse(open('./test_queries.json'));

// Test configuration
export let options = {
  stages: [
    { duration: __ENV.RAMP_UP_DURATION || '30s', target: __ENV.CONCURRENT_USERS || 50 },
    { duration: __ENV.TEST_DURATION || '5m', target: __ENV.CONCURRENT_USERS || 50 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    'http_req_duration{query_type:simple}': ['p(50)<100', 'p(95)<300'],
    'http_req_duration{query_type:complex}': ['p(50)<300', 'p(95)<800'],
    'http_req_duration{query_type:suggest}': ['p(50)<50', 'p(95)<150'],
    'search_errors': ['rate<0.01'], // Less than 1% error rate
    'http_req_failed': ['rate<0.05'], // Less than 5% HTTP failures
  },
};

export default function() {
  const tenantId = tenantIds[Math.floor(Math.random() * tenantIds.length)];
  const headers = {
    'Content-Type': 'application/json',
    'X-Tenant-ID': tenantId,
    'Authorization': `Bearer fake-jwt-token-${tenantId}`,
  };

  // Weighted distribution of query types (matches production traffic)
  const rand = Math.random();
  let queryType, queries, endpoint;
  
  if (rand < 0.6) {
    // 60% simple queries
    queryType = 'simple';
    queries = testQueries.simple_queries;
    endpoint = '/search';
  } else if (rand < 0.9) {
    // 30% complex queries  
    queryType = 'complex';
    queries = testQueries.complex_queries;
    endpoint = '/search';
  } else {
    // 10% suggest queries
    queryType = 'suggest';
    queries = testQueries.suggest_queries;
    endpoint = '/suggest';
  }

  const query = queries[Math.floor(Math.random() * queries.length)];
  const startTime = Date.now();

  const response = http.post(`${__ENV.SEARCH_ENDPOINT}${endpoint}`, 
    JSON.stringify(query.request), 
    { 
      headers,
      tags: { 
        query_type: queryType,
        query_name: query.name,
        tenant_id: tenantId
      }
    }
  );

  const duration = Date.now() - startTime;
  searchLatency.add(duration, { query_type: queryType });

  const success = check(response, {
    'status is 200': (r) => r.status === 200,
    'response time OK': (r) => r.timings.duration < (queryType === 'simple' ? 300 : 800),
    'has results': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.hits && Array.isArray(body.hits);
      } catch {
        return false;
      }
    }
  });

  if (!success) {
    searchErrors.add(1);
    console.error(`Query failed: ${query.name}, Status: ${response.status}, Body: ${response.body?.substring(0, 200)}`);
  } else {
    searchErrors.add(0);
    
    // Track cache hit rate
    try {
      const body = JSON.parse(response.body);
      cacheHitRate.add(body.performance?.cached ? 1 : 0);
    } catch {
      // Ignore JSON parse errors for cache tracking
    }
  }

  // Realistic think time between requests
  sleep(Math.random() * 2 + 0.5); // 0.5-2.5 seconds
}

export function handleSummary(data) {
  return {
    'summary.json': JSON.stringify(data),
    'summary.html': htmlReport(data),
  };
}

function htmlReport(data) {
  const simple_p50 = data.metrics['http_req_duration{query_type:simple}']?.values?.['p(50)'] || 0;
  const simple_p95 = data.metrics['http_req_duration{query_type:simple}']?.values?.['p(95)'] || 0;
  const complex_p50 = data.metrics['http_req_duration{query_type:complex}']?.values?.['p(50)'] || 0;
  const complex_p95 = data.metrics['http_req_duration{query_type:complex}']?.values?.['p(95)'] || 0;
  
  return `
<!DOCTYPE html>
<html>
<head>
  <title>Search Load Test Results</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; }
    .metric { margin: 10px 0; padding: 10px; border-left: 4px solid #007cba; }
    .pass { border-left-color: #28a745; }
    .fail { border-left-color: #dc3545; }
    .warn { border-left-color: #ffc107; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
    th { background-color: #f2f2f2; }
  </style>
</head>
<body>
  <h1>Multi-Tenant Search Load Test Results</h1>
  
  <h2>SLO Compliance</h2>
  <div class="metric ${simple_p50 <= 100 ? 'pass' : 'fail'}">
    Simple Query P50: ${simple_p50.toFixed(1)}ms (Target: ≤100ms)
  </div>
  <div class="metric ${simple_p95 <= 300 ? 'pass' : 'fail'}">
    Simple Query P95: ${simple_p95.toFixed(1)}ms (Target: ≤300ms)
  </div>
  <div class="metric ${complex_p50 <= 300 ? 'pass' : 'fail'}">
    Complex Query P50: ${complex_p50.toFixed(1)}ms (Target: ≤300ms)
  </div>
  <div class="metric ${complex_p95 <= 800 ? 'pass' : 'fail'}">
    Complex Query P95: ${complex_p95.toFixed(1)}ms (Target: ≤800ms)
  </div>
  
  <h2>Summary Metrics</h2>
  <table>
    <tr><th>Metric</th><th>Value</th></tr>
    <tr><td>Total Requests</td><td>${data.metrics.http_reqs?.values?.count || 0}</td></tr>
    <tr><td>Request Rate</td><td>${(data.metrics.http_reqs?.values?.rate || 0).toFixed(2)}/s</td></tr>
    <tr><td>Error Rate</td><td>${((data.metrics.http_req_failed?.values?.rate || 0) * 100).toFixed(2)}%</td></tr>
    <tr><td>Cache Hit Rate</td><td>${((data.metrics.cache_hit_rate?.values?.rate || 0) * 100).toFixed(2)}%</td></tr>
    <tr><td>Avg Response Time</td><td>${(data.metrics.http_req_duration?.values?.avg || 0).toFixed(1)}ms</td></tr>
  </table>
  
  <p><strong>Test completed at:</strong> ${new Date().toISOString()}</p>
</body>
</html>
  `;
}
EOF

# Run the load test
echo "📊 Running k6 load test..."
cd "$RESULTS_DIR"

SEARCH_ENDPOINT="$SEARCH_ENDPOINT" \
TENANT_COUNT="$TENANT_COUNT" \
CONCURRENT_USERS="$CONCURRENT_USERS" \
TEST_DURATION="$TEST_DURATION" \
RAMP_UP_DURATION="$RAMP_UP_DURATION" \
k6 run load_test.js

# Parse results and check SLOs
echo "📈 Analyzing results..."

if [ -f "summary.json" ]; then
  # Extract key metrics
  SIMPLE_P50=$(jq -r '.metrics."http_req_duration{query_type:simple}".values."p(50)" // 0' summary.json)
  SIMPLE_P95=$(jq -r '.metrics."http_req_duration{query_type:simple}".values."p(95)" // 0' summary.json)
  COMPLEX_P50=$(jq -r '.metrics."http_req_duration{query_type:complex}".values."p(50)" // 0' summary.json)
  COMPLEX_P95=$(jq -r '.metrics."http_req_duration{query_type:complex}".values."p(95)" // 0' summary.json)
  ERROR_RATE=$(jq -r '.metrics.http_req_failed.values.rate // 0' summary.json)
  
  echo "=================================="
  echo "🎯 SLO Compliance Check"
  echo "=================================="
  
  FAILED=0
  
  # Check simple query SLOs
  if (( $(echo "$SIMPLE_P50 > $SIMPLE_P50_THRESHOLD" | bc -l) )); then
    echo "❌ Simple P50: ${SIMPLE_P50}ms > ${SIMPLE_P50_THRESHOLD}ms"
    FAILED=1
  else
    echo "✅ Simple P50: ${SIMPLE_P50}ms ≤ ${SIMPLE_P50_THRESHOLD}ms"
  fi
  
  if (( $(echo "$SIMPLE_P95 > $SIMPLE_P95_THRESHOLD" | bc -l) )); then
    echo "❌ Simple P95: ${SIMPLE_P95}ms > ${SIMPLE_P95_THRESHOLD}ms"
    FAILED=1
  else
    echo "✅ Simple P95: ${SIMPLE_P95}ms ≤ ${SIMPLE_P95_THRESHOLD}ms"
  fi
  
  # Check complex query SLOs
  if (( $(echo "$COMPLEX_P50 > $COMPLEX_P50_THRESHOLD" | bc -l) )); then
    echo "❌ Complex P50: ${COMPLEX_P50}ms > ${COMPLEX_P50_THRESHOLD}ms"
    FAILED=1
  else
    echo "✅ Complex P50: ${COMPLEX_P50}ms ≤ ${COMPLEX_P50_THRESHOLD}ms"
  fi
  
  if (( $(echo "$COMPLEX_P95 > $COMPLEX_P95_THRESHOLD" | bc -l) )); then
    echo "❌ Complex P95: ${COMPLEX_P95}ms > ${COMPLEX_P95_THRESHOLD}ms"
    FAILED=1
  else
    echo "✅ Complex P95: ${COMPLEX_P95}ms ≤ ${COMPLEX_P95_THRESHOLD}ms"
  fi
  
  # Check error rate
  if (( $(echo "$ERROR_RATE > 0.05" | bc -l) )); then
    echo "❌ Error Rate: $(echo "$ERROR_RATE * 100" | bc -l)% > 5%"
    FAILED=1
  else
    echo "✅ Error Rate: $(echo "$ERROR_RATE * 100" | bc -l)% ≤ 5%"
  fi
  
  echo "=================================="
  
  if [ $FAILED -eq 0 ]; then
    echo "🎉 All SLOs passed!"
    exit 0
  else
    echo "💥 Some SLOs failed!"
    echo "📁 Detailed results: $RESULTS_DIR/summary.html"
    exit 1
  fi
else
  echo "❌ No results file found"
  exit 1
fi