/**
 * Express.js Integration Example
 * Shows how to integrate search into an existing Express API
 */
const express = require('express');
const SearchClient = require('../client/search-client');

const app = express();
app.use(express.json());

// Initialize search client
const searchClient = new SearchClient({
  baseUrl: process.env.SEARCH_SERVICE_URL || 'http://localhost:3000',
  timeout: 5000
});

// Mock authentication middleware (replace with your auth)
const authenticate = (req, res, next) => {
  // Extract tenant from JWT or session
  req.user = {
    id: 'user-123',
    tenantId: req.headers['x-tenant-id'] || 'tenant-123'
  };
  next();
};

// Search endpoint for your APIM
app.post('/api/search', authenticate, async (req, res) => {
  try {
    const results = await searchClient.search(req.body, req.user.tenantId);
    
    // Transform results to match your API format
    const response = {
      success: true,
      data: results.hits.map(hit => hit.source),
      pagination: {
        total: results.total.value,
        size: results.page.size,
        has_more: results.page.has_more
      },
      meta: {
        took_ms: results.performance.took_ms,
        cached: results.performance.cached,
        query_type: results.debug?.query_classification
      }
    };

    res.json(response);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({
      success: false,
      error: 'Search service unavailable',
      details: error.message
    });
  }
});

// Autocomplete endpoint
app.get('/api/autocomplete', authenticate, async (req, res) => {
  try {
    const { q, limit = 5 } = req.query;
    
    if (!q || q.length < 2) {
      return res.json({ suggestions: [] });
    }

    const results = await searchClient.suggest(q, req.user.tenantId, parseInt(limit));
    
    res.json({
      success: true,
      suggestions: results.suggestions.map(s => ({
        text: s.text,
        score: s.score,
        context: s.context
      }))
    });
  } catch (error) {
    console.error('Autocomplete error:', error);
    res.status(500).json({
      success: false,
      error: 'Autocomplete service unavailable'
    });
  }
});

// Advanced search with query explanation
app.post('/api/search/advanced', authenticate, async (req, res) => {
  try {
    const { explain = false, ...query } = req.body;
    
    if (explain) {
      // Get query explanation
      const explanation = await searchClient.explain(query, req.user.tenantId);
      const results = await searchClient.search(query, req.user.tenantId);
      
      res.json({
        success: true,
        data: results.hits.map(hit => hit.source),
        explanation: {
          classification: explanation.classification,
          routing: explanation.routing,
          cost: explanation.estimated_cost,
          cache_strategy: explanation.cache_strategy
        },
        performance: results.performance
      });
    } else {
      const results = await searchClient.search(query, req.user.tenantId);
      res.json({
        success: true,
        data: results.hits.map(hit => hit.source),
        performance: results.performance
      });
    }
  } catch (error) {
    console.error('Advanced search error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Health check that includes search platform status
app.get('/health', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      api: { status: 'healthy' }
    }
  };

  try {
    const searchHealth = await searchClient.health();
    health.services.search = searchHealth;
  } catch (error) {
    health.services.search = { 
      status: 'unhealthy', 
      error: error.message 
    };
    health.status = 'degraded';
  }

  const statusCode = health.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(health);
});

// Example: Search within specific entity types
app.get('/api/:entity/search', authenticate, async (req, res) => {
  try {
    const { entity } = req.params;
    const { q, limit = 20 } = req.query;

    const query = {
      q,
      filters: {
        entity: [entity]
      },
      page: { size: limit }
    };

    const results = await searchClient.search(query, req.user.tenantId);
    
    res.json({
      success: true,
      entity,
      data: results.hits.map(hit => hit.source),
      total: results.total.value,
      performance: results.performance
    });
  } catch (error) {
    console.error(`${req.params.entity} search error:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

const PORT = process.env.PORT || 8080;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 APIM API with Search Integration running on port ${PORT}`);
    console.log(`🔍 Search platform: ${searchClient.baseUrl}`);
    console.log('');
    console.log('📋 Available endpoints:');
    console.log('   POST /api/search           - Unified search');
    console.log('   GET  /api/autocomplete     - Autocomplete suggestions');
    console.log('   POST /api/search/advanced  - Advanced search with explanation');
    console.log('   GET  /api/:entity/search   - Search within entity type');
    console.log('   GET  /health               - Health check with search status');
    console.log('');
    console.log('🧪 Test command:');
    console.log(`   curl -X POST http://localhost:${PORT}/api/search -H "Content-Type: application/json" -H "X-Tenant-ID: tenant-123" -d '{"q":"acme"}'`);
  });
}

module.exports = app;