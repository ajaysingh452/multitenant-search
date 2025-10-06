#!/bin/bash

# Quick Setup Script for Multi-Tenant Search Platform
# This script sets up a complete development environment using Docker Compose

set -e

echo "🚀 Setting up Multi-Tenant Search Platform..."

# Check prerequisites
command -v docker >/dev/null 2>&1 || { echo "❌ Docker is required but not installed. Aborting." >&2; exit 1; }
command -v docker-compose >/dev/null 2>&1 || { echo "❌ Docker Compose is required but not installed. Aborting." >&2; exit 1; }
command -v node >/dev/null 2>&1 || { echo "❌ Node.js is required but not installed. Aborting." >&2; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "❌ npm is required but not installed. Aborting." >&2; exit 1; }

echo "✅ Prerequisites check passed"

# Set up directory structure
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "📁 Project root: $PROJECT_ROOT"

# Install Node.js dependencies
echo "📦 Installing Node.js dependencies..."
cd src
npm install
cd ..

# Create environment file
echo "⚙️ Creating environment configuration..."
cat > .env << EOF
# Search Platform Configuration
NODE_ENV=development
PORT=3000
HOST=0.0.0.0

# OpenSearch Configuration
OPENSEARCH_URL=http://localhost:9200
OPENSEARCH_USERNAME=
OPENSEARCH_PASSWORD=

# Typesense Configuration
TYPESENSE_HOST=localhost
TYPESENSE_PORT=8108
TYPESENSE_PROTOCOL=http
TYPESENSE_API_KEY=xyz123

# Redis Configuration (Optional)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Cache Configuration
CACHE_L1_MAX_SIZE=10000
CACHE_L1_TTL_MS=300000
CACHE_L2_ENABLED=true

# Monitoring
LOG_LEVEL=info
METRICS_ENABLED=true
EOF

echo "✅ Environment file created"

# Create sample data script
echo "📊 Creating sample data..."
cat > scripts/sample-data.sql << 'EOF'
-- Sample data for testing the search platform
INSERT INTO search_fallback.documents (
  tenant_id, id, entity, title, body, keywords, status, tags, 
  numeric_amount, numeric_score, numeric_priority,
  created_at, updated_at,
  region, category, tier,
  customer_name, account_tier, owner_id
) VALUES 
-- Tenant 1 data
('550e8400-e29b-41d4-a716-446655440001', 'doc-1', 'customer', 'Acme Corporation', 'Large enterprise customer in technology sector', ARRAY['enterprise', 'technology'], 'active', ARRAY['vip', 'enterprise'], 
 50000.00, 0.95, 1, NOW(), NOW(), 'APAC', 'Gold', 'Enterprise', 'Acme Corporation', 'Enterprise', 'user-123'),

('550e8400-e29b-41d4-a716-446655440001', 'doc-2', 'order', 'Order #12345 - Software License', 'Annual software license renewal for Acme Corp', ARRAY['software', 'license', 'annual'], 'open', ARRAY['recurring'], 
 25000.00, 0.85, 2, NOW() - INTERVAL '1 day', NOW(), 'APAC', 'Gold', 'Enterprise', 'Acme Corporation', 'Enterprise', 'user-123'),

('550e8400-e29b-41d4-a716-446655440001', 'doc-3', 'ticket', 'Support Request - Integration Issues', 'Customer reporting API integration problems with authentication', ARRAY['support', 'api', 'integration'], 'open', ARRAY['urgent'], 
 0, 0.75, 1, NOW() - INTERVAL '2 hours', NOW(), 'APAC', 'Support', 'Enterprise', 'Acme Corporation', 'Enterprise', 'user-456'),

-- Tenant 2 data  
('550e8400-e29b-41d4-a716-446655440002', 'doc-4', 'customer', 'Beta Technologies', 'Mid-size startup in fintech space', ARRAY['startup', 'fintech'], 'active', ARRAY['growth'], 
 15000.00, 0.78, 2, NOW(), NOW(), 'EMEA', 'Silver', 'Growth', 'Beta Technologies', 'Growth', 'user-789'),

('550e8400-e29b-41d4-a716-446655440002', 'doc-5', 'invoice', 'Invoice #INV-2024-001', 'Monthly subscription payment overdue', ARRAY['subscription', 'overdue', 'payment'], 'overdue', ARRAY['billing'], 
 2500.00, 0.45, 3, NOW() - INTERVAL '15 days', NOW(), 'EMEA', 'Silver', 'Growth', 'Beta Technologies', 'Growth', 'user-789'),

-- Tenant 3 data
('550e8400-e29b-41d4-a716-446655440003', 'doc-6', 'product', 'Widget Pro Max', 'Advanced widget with AI capabilities', ARRAY['ai', 'widget', 'premium'], 'active', ARRAY['bestseller'], 
 199.99, 0.92, 1, NOW(), NOW(), 'NA', 'Platinum', 'Premium', 'Global Widgets Inc', 'Premium', 'user-101'),

('550e8400-e29b-41d4-a716-446655440003', 'doc-7', 'order', 'Bulk Order - 500 Units', 'Large bulk order for Widget Pro Max units', ARRAY['bulk', 'widget', 'wholesale'], 'processing', ARRAY['wholesale'], 
 99995.00, 0.98, 1, NOW() - INTERVAL '3 hours', NOW(), 'NA', 'Platinum', 'Premium', 'Global Widgets Inc', 'Premium', 'user-101');

-- Update tenant metadata
INSERT INTO search_fallback.tenant_metadata (tenant_id, document_count, index_strategy, qps_avg) VALUES
('550e8400-e29b-41d4-a716-446655440001', 3, 'shared', 25.5),
('550e8400-e29b-41d4-a716-446655440002', 2, 'shared', 12.3),
('550e8400-e29b-41d4-a716-446655440003', 2, 'shared', 8.7)
ON CONFLICT (tenant_id) DO UPDATE SET
  document_count = EXCLUDED.document_count,
  qps_avg = EXCLUDED.qps_avg,
  last_updated = NOW();
EOF

# Create monitoring configuration
mkdir -p monitoring
cat > monitoring/prometheus.yml << 'EOF'
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'search-router'
    static_configs:
      - targets: ['search-router:9090']
    scrape_interval: 5s
    metrics_path: /metrics

  - job_name: 'opensearch'
    static_configs:
      - targets: ['opensearch:9200']
    scrape_interval: 30s
    metrics_path: /_prometheus/metrics

  - job_name: 'redis'
    static_configs:
      - targets: ['redis:6379']
    scrape_interval: 30s
EOF

mkdir -p monitoring/grafana/dashboards
cat > monitoring/grafana/dashboards/search-dashboard.json << 'EOF'
{
  "dashboard": {
    "id": null,
    "title": "Search Platform Dashboard",
    "tags": ["search", "multi-tenant"],
    "timezone": "browser",
    "panels": [
      {
        "id": 1,
        "title": "Search Request Rate",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(search_requests_total[5m])",
            "legendFormat": "{{tenant_id}} - {{query_type}}"
          }
        ]
      },
      {
        "id": 2,
        "title": "Search Latency",
        "type": "graph",
        "targets": [
          {
            "expr": "histogram_quantile(0.50, search_latency_bucket)",
            "legendFormat": "P50"
          },
          {
            "expr": "histogram_quantile(0.95, search_latency_bucket)",
            "legendFormat": "P95"
          }
        ]
      }
    ],
    "time": {
      "from": "now-1h",
      "to": "now"
    },
    "refresh": "5s"
  }
}
EOF

mkdir -p monitoring/grafana/provisioning/dashboards
cat > monitoring/grafana/provisioning/dashboards/dashboard.yml << 'EOF'
apiVersion: 1

providers:
  - name: 'search-dashboards'
    orgId: 1
    folder: ''
    type: file
    disableDeletion: false
    updateIntervalSeconds: 10
    allowUiUpdates: true
    options:
      path: /var/lib/grafana/dashboards
EOF

mkdir -p monitoring/grafana/provisioning/datasources
cat > monitoring/grafana/provisioning/datasources/prometheus.yml << 'EOF'
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
EOF

# Start the infrastructure
echo "🐳 Starting Docker infrastructure..."
docker-compose up -d

echo "⏳ Waiting for services to be ready..."
sleep 30

# Check service health
echo "🔍 Checking service health..."

# Wait for OpenSearch
echo "Waiting for OpenSearch..."
until curl -s http://localhost:9200/_cluster/health > /dev/null; do
  echo "  OpenSearch not ready yet..."
  sleep 5
done
echo "✅ OpenSearch is ready"

# Wait for Typesense
echo "Waiting for Typesense..."
until curl -s http://localhost:8108/health > /dev/null; do
  echo "  Typesense not ready yet..."
  sleep 5
done
echo "✅ Typesense is ready"

# Create OpenSearch index
echo "📊 Setting up OpenSearch index..."
curl -X PUT "http://localhost:9200/search-docs-shared" \
  -H 'Content-Type: application/json' \
  -d @schemas/opensearch-mapping.json

# Create Typesense collection
echo "📊 Setting up Typesense collection..."
curl -X POST "http://localhost:8108/collections" \
  -H 'Content-Type: application/json' \
  -H "X-TYPESENSE-API-KEY: xyz123" \
  -d @schemas/typesense-schema.json

# Start the search router
echo "🚀 Starting Search Router..."
cd src
npm run build
npm start &
ROUTER_PID=$!
cd ..

# Wait for router to be ready
echo "⏳ Waiting for Search Router to be ready..."
sleep 10

until curl -s http://localhost:3000/health > /dev/null; do
  echo "  Search Router not ready yet..."
  sleep 3
done

echo "✅ Search Router is ready"

# Test the setup
echo "🧪 Running basic health checks..."

# Test health endpoint
echo "Testing health endpoint..."
HEALTH_RESPONSE=$(curl -s http://localhost:3000/health)
echo "Health check response: $HEALTH_RESPONSE"

# Test search endpoint
echo "Testing search endpoint..."
SEARCH_RESPONSE=$(curl -s -X POST http://localhost:3000/search \
  -H 'Content-Type: application/json' \
  -H 'X-Tenant-ID: 550e8400-e29b-41d4-a716-446655440001' \
  -d '{
    "q": "test",
    "page": {"size": 5}
  }')
echo "Search test response: $SEARCH_RESPONSE"

# Test suggest endpoint  
echo "Testing suggest endpoint..."
SUGGEST_RESPONSE=$(curl -s -X POST http://localhost:3000/suggest \
  -H 'Content-Type: application/json' \
  -H 'X-Tenant-ID: 550e8400-e29b-41d4-a716-446655440001' \
  -d '{
    "prefix": "acme",
    "limit": 5
  }')
echo "Suggest test response: $SUGGEST_RESPONSE"

echo ""
echo "🎉 Multi-Tenant Search Platform is ready!"
echo ""
echo "📋 Service URLs:"
echo "  🔍 Search API:     http://localhost:3000"
echo "  📊 OpenSearch:     http://localhost:9200"
echo "  ⚡ Typesense:      http://localhost:8108"
echo "  🎯 Prometheus:     http://localhost:9090"
echo "  📈 Grafana:        http://localhost:3001 (admin/admin123)"
echo "  🔬 Jaeger:         http://localhost:16686"
echo ""
echo "🧪 Test Commands:"
echo "  Health Check:      curl http://localhost:3000/health"
echo "  Simple Search:     curl -X POST http://localhost:3000/search -H 'Content-Type: application/json' -H 'X-Tenant-ID: 550e8400-e29b-41d4-a716-446655440001' -d '{\"q\":\"test\"}'"
echo "  Load Test:         ./scripts/load-test.sh"
echo ""
echo "📚 Documentation:"
echo "  API Docs:          ./api/openapi.yaml"
echo "  Runbook:           ./docs/RUNBOOK.md"
echo "  Architecture:      ./IMPLEMENTATION_SUMMARY.md"
echo ""
echo "🛑 To stop all services: docker-compose down"
echo "🔄 To restart:           docker-compose restart"