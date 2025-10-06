const express = require('express');
const cors = require('cors');
const { createHash } = require('crypto');

// Simple in-memory cache for demo
const cache = new Map();

// Mock data for demonstration
const mockData = [
  {
    tenant_id: 'tenant-123',
    id: 'doc-1',
    entity: 'customer',
    title: 'Acme Corporation',
    body: 'Large enterprise customer in technology sector',
    status: 'active',
    created_at: new Date().toISOString()
  },
  {
    tenant_id: 'tenant-123', 
    id: 'doc-2',
    entity: 'order',
    title: 'Order #12345 - Software License',
    body: 'Annual software license renewal for Acme Corp',
    status: 'open',
    created_at: new Date().toISOString()
  },
  {
    tenant_id: 'tenant-456',
    id: 'doc-3', 
    entity: 'invoice',
    title: 'Invoice #INV-2024-001',
    body: 'Monthly subscription payment overdue',
    status: 'overdue',
    created_at: new Date().toISOString()
  }
];

class QueryClassifier {
  classify(request) {
    const hasFullText = request.q && request.q.trim();
    const filterCount = Object.keys(request.filters || {}).length;
    const hasComplexFeatures = request.options?.highlight || request.options?.suggest;
    
    let type = 'simple';
    let reason = 'Basic lookup with minimal filters';
    
    if (hasFullText && filterCount > 2) {
      type = 'hybrid';
      reason = 'Mixed text search and structured filters';
    } else if (hasFullText || hasComplexFeatures) {
      type = 'complex';
      reason = 'Full-text search or advanced features required';
    }
    
    return {
      type,
      reason,
      complexityScore: filterCount + (hasFullText ? 2 : 0) + (hasComplexFeatures ? 1 : 0),
      cacheable: !hasComplexFeatures && filterCount < 5
    };
  }
}

class SearchEngine {
  search(request) {
    const { tenant_id, q, filters = {}, page = { size: 20 } } = request;
    
    // Filter by tenant
    let results = mockData.filter(doc => doc.tenant_id === tenant_id);
    
    // Apply text search
    if (q && q.trim()) {
      const query = q.trim().toLowerCase();
      results = results.filter(doc => 
        doc.title.toLowerCase().includes(query) || 
        doc.body.toLowerCase().includes(query)
      );
    }
    
    // Apply filters
    for (const [field, value] of Object.entries(filters)) {
      if (Array.isArray(value)) {
        results = results.filter(doc => value.includes(doc[field]));
      } else {
        results = results.filter(doc => doc[field] === value);
      }
    }
    
    // Pagination
    const size = Math.min(page.size || 20, 100);
    const paginatedResults = results.slice(0, size);
    
    return {
      hits: paginatedResults.map(doc => ({
        id: doc.id,
        source: doc,
        score: 1.0
      })),
      total: {
        value: results.length,
        relation: 'eq'
      },
      page: {
        size: size,
        has_more: results.length > size
      },
      performance: {
        took_ms: Math.random() * 50 + 10, // Simulate latency
        engine: 'mock',
        cached: false,
        partial: false
      }
    };
  }
  
  suggest(request) {
    const { tenant_id, prefix, limit = 10 } = request;
    const query = prefix.toLowerCase();
    
    const suggestions = mockData
      .filter(doc => doc.tenant_id === tenant_id)
      .filter(doc => doc.title.toLowerCase().startsWith(query))
      .slice(0, limit)
      .map(doc => ({
        text: doc.title,
        score: 0.9,
        context: {
          entity: doc.entity,
          id: doc.id
        }
      }));
    
    return {
      suggestions,
      performance: {
        took_ms: Math.random() * 20 + 5,
        cached: false
      }
    };
  }
}

// Initialize services
const app = express();
const classifier = new QueryClassifier();
const searchEngine = new SearchEngine();

// Middleware
app.use(cors());
app.use(express.json());

// Middleware to extract tenant ID
app.use((req, res, next) => {
  const tenantId = req.headers['x-tenant-id'];
  if (!tenantId && (req.path.startsWith('/search') || req.path.startsWith('/suggest'))) {
    return res.status(400).json({
      error: {
        code: 'MISSING_TENANT_ID',
        message: 'X-Tenant-ID header is required'
      }
    });
  }
  req.tenantId = tenantId;
  next();
});

// Health endpoints
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      search_engine: { status: 'healthy', latency: 5 },
      cache: { status: 'healthy', latency: 2 }
    },
    version: '1.0.0'
  });
});

app.get('/ready', (req, res) => {
  res.json({ status: 'ready' });
});

// Metrics endpoint  
app.get('/metrics', (req, res) => {
  res.json({
    timestamp: new Date().toISOString(),
    latency: {
      p50: 45,
      p95: 120,
      p99: 250,
      count: 1000
    },
    cache: {
      hit_rate: 0.75,
      size: cache.size
    }
  });
});

// Search endpoint
app.post('/search', async (req, res) => {
  const startTime = Date.now();
  const tenantId = req.tenantId;
  
  try {
    // Add tenant_id to request
    const searchRequest = { ...req.body, tenant_id: tenantId };
    
    // Generate cache key
    const cacheKey = `search:${tenantId}:${createHash('md5').update(JSON.stringify(req.body)).digest('hex')}`;
    
    // Check cache
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json({
        ...cached,
        performance: {
          ...cached.performance,
          took_ms: Date.now() - startTime,
          cached: true
        }
      });
    }
    
    // Classify query
    const classification = classifier.classify(searchRequest);
    
    // Execute search
    const result = searchEngine.search(searchRequest);
    
    // Add metadata
    result.performance.took_ms = Date.now() - startTime;
    result.debug = {
      query_classification: classification.type,
      cache_key: cacheKey,
      tenant_routing: 'shared'
    };
    
    // Cache result if cacheable
    if (classification.cacheable) {
      cache.set(cacheKey, result);
      // Expire after 5 minutes
      setTimeout(() => cache.delete(cacheKey), 5 * 60 * 1000);
    }
    
    res.json(result);
    
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({
      error: {
        code: 'SEARCH_ERROR',
        message: error instanceof Error ? error.message : 'Internal error'
      }
    });
  }
});

// Suggest endpoint
app.post('/suggest', async (req, res) => {
  const startTime = Date.now();
  const tenantId = req.tenantId;
  
  try {
    const suggestRequest = { ...req.body, tenant_id: tenantId };
    const result = searchEngine.suggest(suggestRequest);
    
    result.performance.took_ms = Date.now() - startTime;
    
    res.json(result);
    
  } catch (error) {
    console.error('Suggest error:', error);
    res.status(500).json({
      error: {
        code: 'SUGGEST_ERROR', 
        message: error instanceof Error ? error.message : 'Internal error'
      }
    });
  }
});

// Explain endpoint
app.post('/explain', (req, res) => {
  const tenantId = req.tenantId;
  const searchRequest = { ...req.body, tenant_id: tenantId };
  
  const classification = classifier.classify(searchRequest);
  
  res.json({
    classification: classification.type,
    routing: {
      engine: 'mock-engine',
      index: 'shared',
      reason: classification.reason
    },
    estimated_cost: {
      complexity_score: classification.complexityScore,
      expected_latency_ms: classification.complexityScore * 20 + 30
    },
    cache_strategy: {
      cacheable: classification.cacheable,
      key: `search:${tenantId}:${createHash('md5').update(JSON.stringify(req.body)).digest('hex')}`,
      ttl_seconds: 300
    }
  });
});

// Start server
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost'; // Changed to localhost for Windows compatibility

const server = app.listen(PORT, HOST, () => {
  console.log(`🚀 Multi-Tenant Search Platform started on http://${HOST}:${PORT}`);
  console.log('📋 Available endpoints:');
  console.log('  GET  /health     - Health check');
  console.log('  GET  /ready      - Readiness check');
  console.log('  GET  /metrics    - Performance metrics'); 
  console.log('  POST /search     - Unified search');
  console.log('  POST /suggest    - Typeahead suggestions');
  console.log('  POST /explain    - Query explanation');
  console.log('');
  console.log('🧪 Test command:');
  console.log(`curl -X POST http://localhost:${PORT}/search -H "Content-Type: application/json" -H "X-Tenant-ID: tenant-123" -d '{"q":"acme"}'`);
});

server.on('error', (err) => {
  console.error('❌ Server error:', err);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n⚠️  Received SIGINT, shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

module.exports = app;