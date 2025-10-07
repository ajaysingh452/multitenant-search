# @ajay.inpis/multitenant-search

Production-grade multi-tenant search platform. Add lightning-fast search to your Express.js applications with minimal configuration.

[![npm version](https://badge.fury.io/js/@ajay.inpis%2Fmultitenant-search.svg)](https://www.npmjs.com/package/@ajay.inpis/multitenant-search)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen.svg)](https://nodejs.org/)

## Features

🚀 **Multi-Tenant Architecture** - Complete tenant isolation with intelligent query routing  
⚡ **Lightning Fast** - Built-in L1/L2 caching with sub-50ms response times  
🔧 **Easy Integration** - Express middleware for automatic search synchronization  
🛠️ **Production Ready** - Built with TypeScript, comprehensive error handling  
🔍 **Flexible Search** - Support for simple queries (Typesense) and complex queries (OpenSearch)  
📊 **Analytics Ready** - Built-in metrics, performance monitoring, and debugging tools  

## Quick Start

### Installation

```bash
npm install @ajay.inpis/multitenant-search
```

### Basic Usage

```javascript
const { SearchPlatform, SearchClient, SearchMiddleware } = require('@ajay.inpis/multitenant-search');

// 1. Start the search platform
const platform = new SearchPlatform({ port: 3000 });
await platform.start();

// 2. Add to your Express app
const app = require('express')();
const search = new SearchMiddleware({
  searchServiceUrl: 'http://localhost:3000'
});

// 3. Add search capabilities
app.get('/api/search', search.search());
app.post('/api/users', search.syncOnCreate(), createUser);
```

### Express Middleware Integration

```javascript
import express from 'express';
import { SearchMiddleware } from '@ajay.inpis/multitenant-search';

const app = express();
const searchMiddleware = new SearchMiddleware({
  searchServiceUrl: 'http://localhost:3000'
});

// Auto-sync on CRUD operations
app.post('/api/users', searchMiddleware.syncOnCreate(), (req, res) => {
  // Your existing logic - search sync happens automatically
  res.json({ success: true });
});

// Add search endpoints
app.get('/api/search', searchMiddleware.search());
app.get('/api/autocomplete', searchMiddleware.autocomplete());
```

## API Reference

### SearchPlatform

```javascript
const { SearchPlatform, createProductionConfig } = require('@ajay.inpis/multitenant-search');

const platform = new SearchPlatform(createProductionConfig());
await platform.start();
```

### SearchClient

```javascript
const { SearchClient } = require('@ajay.inpis/multitenant-search');

const client = new SearchClient({
  baseUrl: 'http://localhost:3000',
  timeout: 5000
});

const results = await client.search({
  query: 'nodejs typescript',
  tenant_id: 'my-tenant',
  limit: 20
});
```

### SearchMiddleware

```javascript
const { SearchMiddleware } = require('@ajay.inpis/multitenant-search');

const middleware = new SearchMiddleware({
  searchServiceUrl: 'http://localhost:3000'
});

// Sync middleware
app.post('/users', middleware.syncOnCreate());
app.put('/users/:id', middleware.syncOnUpdate());
app.delete('/users/:id', middleware.syncOnDelete());

// Search endpoints
app.get('/search', middleware.search());
app.get('/autocomplete', middleware.autocomplete());
```

## Configuration

### Environment Variables

```bash
# Server Configuration
PORT=3000
HOST=0.0.0.0

# Search Engines
OPENSEARCH_URL=https://search.example.com:9200
TYPESENSE_HOST=typesense.example.com
REDIS_HOST=redis.example.com

# Cache Settings
CACHE_L1_MAX_SIZE=10000
CACHE_L1_TTL_MS=300000
```

### Programmatic Configuration

```javascript
const config = {
  port: 3000,
  enableMetrics: true,
  engines: {
    mock: true, // For development
    opensearch: { node: 'https://search.company.com' },
    typesense: { nodes: [{ host: 'ts.company.com' }] }
  },
  cache: {
    l1MaxSize: 50000,
    l1TtlMs: 300000
  }
};
```

## Search Query Format

```javascript
const searchQuery = {
  query: 'search text',
  tenant_id: 'my-tenant',
  limit: 10,
  filters: { category: 'docs', status: 'active' },
  sort: [{ field: 'created_at', direction: 'desc' }]
};

const results = await client.search(searchQuery);
```

## Performance

- **Response Time**: < 50ms (cached), < 200ms (fresh)
- **Throughput**: 1000+ searches/second per instance
- **Memory Usage**: ~50MB base + configurable cache
- **Cache Hit Rate**: 70-85% in typical usage

## Integration Examples

### Next.js API Route

```javascript
// pages/api/search.js
import { SearchClient } from '@ajay.inpis/multitenant-search';

const client = new SearchClient({
  baseUrl: process.env.SEARCH_SERVICE_URL
});

export default async function handler(req, res) {
  const results = await client.search({
    query: req.query.q,
    tenant_id: req.user.tenantId,
    limit: 20
  });
  res.json(results);
}
```

### Docker Deployment

```yaml
version: '3.8'
services:
  search-platform:
    image: node:18-alpine
    command: npm start
    ports: ["3000:3000"]
    environment:
      - NODE_ENV=production
      - OPENSEARCH_URL=http://opensearch:9200
```

## Monitoring

```javascript
// Health check
const health = await client.health();
console.log(health.status); // 'healthy'

// Performance metrics
const metrics = await client.metrics();
console.log(metrics.queries_per_minute); // 23.5

// Query explanation (debugging)
const explanation = await client.explain({
  query: 'complex search',
  tenant_id: 'my-tenant'
});
```

## TypeScript Support

Full TypeScript definitions included:

```typescript
import { 
  SearchPlatform, 
  SearchClient, 
  SearchMiddleware,
  SearchQuery,
  SearchResponse 
} from '@ajay.inpis/multitenant-search';

const client: SearchClient = new SearchClient({
  baseUrl: 'http://localhost:3000'
});

const results: SearchResponse = await client.search({
  query: 'typescript',
  tenant_id: 'my-tenant'
});
```

## License

MIT

## Support

- 📖 [Full Documentation](https://github.com/ajaysingh452/multitenant-search)
- 🐛 [Issues](https://github.com/ajaysingh452/multitenant-search/issues)
- 💬 [Discussions](https://github.com/ajaysingh452/multitenant-search/discussions)