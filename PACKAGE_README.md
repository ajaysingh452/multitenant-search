# @apim/multitenant-search

Production-grade multi-tenant search platform for APIM projects. A lightweight, scalable search solution that integrates seamlessly with existing Express.js applications.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://typescriptlang.org/)

## Features

🚀 **Multi-Tenant Architecture** - Complete tenant isolation with intelligent query routing  
⚡ **Lightning Fast** - Built-in L1/L2 caching with configurable cache strategies  
🔧 **Easy Integration** - Express middleware for automatic search synchronization  
🛠️ **Production Ready** - Built with TypeScript, comprehensive error handling, and monitoring  
🔍 **Flexible Search** - Support for simple queries (Typesense) and complex queries (OpenSearch)  
📊 **Analytics Ready** - Built-in metrics, performance monitoring, and debugging tools  
🐳 **Docker Ready** - Complete containerization with Docker Compose setup  

## Quick Start

### Installation

```bash
npm install @apim/multitenant-search
```

### Basic Usage

```typescript
import { SearchPlatform, SearchClient, createProductionConfig } from '@apim/multitenant-search';

// 1. Start the search platform server
const platform = new SearchPlatform(createProductionConfig());
await platform.start();

// 2. Create a client to communicate with the platform
const client = new SearchClient({
  baseUrl: 'http://localhost:3000',
  timeout: 5000
});

// 3. Perform searches
const results = await client.search({
  query: 'user management',
  tenant_id: 'acme-corp',
  limit: 10
});

console.log(`Found ${results.total.value} results`);
```

### Express Middleware Integration

Automatically sync your API operations with the search platform:

```typescript
import express from 'express';
import { SearchMiddleware } from '@apim/multitenant-search';

const app = express();
const searchMiddleware = new SearchMiddleware({
  searchServiceUrl: 'http://localhost:3000'
});

// Auto-sync on CRUD operations
app.post('/api/users', searchMiddleware.syncOnCreate(), (req, res) => {
  // Your existing user creation logic
  res.json({ success: true });
});

app.put('/api/users/:id', searchMiddleware.syncOnUpdate(), (req, res) => {
  // Your existing user update logic
  res.json({ success: true });
});

app.delete('/api/users/:id', searchMiddleware.syncOnDelete(), (req, res) => {
  // Your existing user deletion logic
  res.json({ success: true });
});

// Add search endpoints
app.get('/api/search', searchMiddleware.search());
app.get('/api/autocomplete', searchMiddleware.autocomplete());
```

## API Reference

### SearchPlatform

The main search server that handles multi-tenant search requests.

```typescript
import { SearchPlatform } from '@apim/multitenant-search';

const platform = new SearchPlatform({
  port: 3000,
  host: '0.0.0.0',
  corsOrigins: ['http://localhost:3000'],
  enableLogging: true,
  enableMetrics: true,
  engines: {
    mock: true // Use mock engine for development
  }
});

await platform.start();
```

#### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `port` | number | 3000 | Server port |
| `host` | string | '0.0.0.0' | Server host |
| `corsOrigins` | string[] | ['*'] | CORS allowed origins |
| `enableLogging` | boolean | true | Enable request logging |
| `enableMetrics` | boolean | true | Enable performance metrics |
| `engines.mock` | boolean | false | Use mock search engine |
| `engines.opensearch` | object | undefined | OpenSearch configuration |
| `engines.typesense` | object | undefined | Typesense configuration |
| `engines.redis` | object | undefined | Redis cache configuration |

### SearchClient

Client for communicating with the search platform.

```typescript
import { SearchClient } from '@apim/multitenant-search';

const client = new SearchClient({
  baseUrl: 'http://localhost:3000',
  timeout: 5000,
  apiKey: 'your-api-key', // optional
  retryAttempts: 3
});

// Search documents
const searchResults = await client.search({
  query: 'nodejs typescript',
  tenant_id: 'my-tenant',
  limit: 20,
  filters: {
    category: 'development',
    status: 'active'
  }
});

// Get suggestions
const suggestions = await client.suggest({
  query: 'node',
  tenant_id: 'my-tenant',
  limit: 5
});

// Explain query (debugging)
const explanation = await client.explain({
  query: 'complex search query',
  tenant_id: 'my-tenant'
});

// Health check
const health = await client.health();
console.log(`Search service is ${health.status}`);
```

### SearchMiddleware

Express middleware for automatic search synchronization.

```typescript
import { SearchMiddleware } from '@apim/multitenant-search';

const middleware = new SearchMiddleware({
  searchServiceUrl: 'http://localhost:3000',
  enabled: true,
  retryAttempts: 3,
  transformData: (data, tenantId) => ({
    ...data,
    searchable_content: data.title + ' ' + data.description
  })
});

// Sync middleware methods
app.post('/users', middleware.syncOnCreate());     // Sync on HTTP 201
app.put('/users/:id', middleware.syncOnUpdate());  // Sync on HTTP 200
app.delete('/users/:id', middleware.syncOnDelete()); // Sync on HTTP 200/204

// Search endpoints
app.get('/search', middleware.search());           // Handle search requests
app.get('/autocomplete', middleware.autocomplete()); // Handle autocomplete
```

### DataSyncService

Service for batch synchronization and data management.

```typescript
import { DataSyncService } from '@apim/multitenant-search';

const syncService = new DataSyncService({
  batchSize: 100,
  retryAttempts: 3,
  transformDocument: (data, tenantId) => ({
    tenant_id: tenantId,
    title: data.name,
    body: data.description,
    status: 'active'
  })
});

// Sync single document
await syncService.syncDocument(userData, 'tenant-123', 'create');

// Sync batch of documents
await syncService.syncDocuments(userList, 'tenant-123', 'create');

// Full tenant reindex
await syncService.syncAllForTenant('tenant-123', async () => {
  return await fetchAllUserData();
});
```

## Factory Functions

Convenient factory functions for common configurations:

```typescript
import { 
  createSearchPlatform, 
  createSearchClient, 
  createProductionConfig 
} from '@apim/multitenant-search';

// Create platform with production settings
const platform = createSearchPlatform(createProductionConfig());

// Create client with environment-based config
const client = createSearchClient({
  baseUrl: process.env.SEARCH_SERVICE_URL || 'http://localhost:3000'
});
```

## Environment Variables

The package supports configuration via environment variables:

```bash
# Server Configuration
PORT=3000
HOST=0.0.0.0
CORS_ORIGINS=http://localhost:3000,https://app.example.com

# Search Engines
OPENSEARCH_URL=https://opensearch.example.com:9200
OPENSEARCH_USERNAME=admin
OPENSEARCH_PASSWORD=admin123

TYPESENSE_HOST=typesense.example.com
TYPESENSE_PORT=8108
TYPESENSE_PROTOCOL=https
TYPESENSE_API_KEY=your-api-key

# Cache Configuration
REDIS_HOST=redis.example.com
REDIS_PORT=6379
REDIS_PASSWORD=redis123

CACHE_L1_MAX_SIZE=10000
CACHE_L1_TTL_MS=300000
CACHE_L2_ENABLED=true

# Client Configuration
SEARCH_SERVICE_URL=http://localhost:3000
SEARCH_API_KEY=your-api-key
SEARCH_TIMEOUT=5000
SEARCH_RETRY_ATTEMPTS=3
```

## Search Query Format

```typescript
interface SearchQuery {
  query: string;                    // Search text
  tenant_id: string;               // Tenant identifier
  limit?: number;                  // Results limit (default: 10)
  offset?: number;                 // Results offset (default: 0)
  filters?: {                      // Optional filters
    [key: string]: any;
  };
  sort?: Array<{                   // Sort options
    field: string;
    direction: 'asc' | 'desc';
  }>;
  facets?: string[];              // Facet fields to aggregate
  highlight?: {                   // Highlighting options
    fields: string[];
    fragment_size?: number;
  };
}
```

## Search Response Format

```typescript
interface SearchResponse {
  hits: Array<{
    id: string;
    source: any;                   // Original document
    score: number;                 // Relevance score
    highlight?: any;               // Highlighted snippets
  }>;
  total: {
    value: number;                 // Total matching documents
    relation: 'eq' | 'gte';       // Exact or approximate
  };
  page: {
    size: number;                  // Current page size
    has_more: boolean;             // More results available
  };
  facets?: {                       // Facet aggregations
    [key: string]: any;
  };
  performance: {
    took_ms: number;               // Query execution time
    engine: string;                // Search engine used
    cached: boolean;               // Was result cached
    partial: boolean;              // Partial results
  };
}
```

## Integration Examples

### With Next.js API Routes

```typescript
// pages/api/search.ts
import { SearchClient } from '@apim/multitenant-search';

const searchClient = new SearchClient({
  baseUrl: process.env.SEARCH_SERVICE_URL!
});

export default async function handler(req, res) {
  try {
    const results = await searchClient.search({
      query: req.query.q,
      tenant_id: req.user.tenantId,
      limit: 20
    });
    
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: 'Search failed' });
  }
}
```

### With Existing Express App

```typescript
// app.ts
import express from 'express';
import { SearchMiddleware } from '@apim/multitenant-search';

const app = express();
const search = new SearchMiddleware({
  searchServiceUrl: process.env.SEARCH_SERVICE_URL!
});

// Add tenant extraction middleware
app.use((req, res, next) => {
  req.tenantId = req.headers['x-tenant-id'] || req.user?.tenantId;
  next();
});

// Add search endpoints
app.get('/api/search', search.search());
app.get('/api/autocomplete', search.autocomplete());

// Add auto-sync to existing routes
app.post('/api/documents', search.syncOnCreate(), createDocument);
app.put('/api/documents/:id', search.syncOnUpdate(), updateDocument);
app.delete('/api/documents/:id', search.syncOnDelete(), deleteDocument);
```

## Monitoring and Debugging

### Health Checks

```typescript
const health = await client.health();
console.log(health);
// {
//   status: 'healthy',
//   uptime: 3600,
//   version: '1.0.0',
//   engines: { mock: 'available', opensearch: 'unavailable' }
// }
```

### Performance Metrics

```typescript
const metrics = await client.metrics();
console.log(metrics);
// {
//   queries_total: 1543,
//   queries_per_minute: 23.5,
//   avg_response_time_ms: 45,
//   cache_hit_rate: 0.78,
//   errors_total: 12
// }
```

### Query Explanation

```typescript
const explanation = await client.explain({
  query: 'user management system',
  tenant_id: 'acme-corp'
});

console.log(explanation);
// {
//   classification: { type: 'simple', confidence: 0.85 },
//   engine_selected: 'typesense',
//   query_rewrite: 'user AND management AND system',
//   estimated_results: 156,
//   estimated_time_ms: 23
// }
```

## Production Deployment

### Docker Deployment

```yaml
# docker-compose.yml
version: '3.8'
services:
  search-platform:
    image: your-registry/search-platform:latest
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
      - OPENSEARCH_URL=http://opensearch:9200
      - TYPESENSE_HOST=typesense
      - REDIS_HOST=redis
    depends_on:
      - opensearch
      - typesense
      - redis
```

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: search-platform
spec:
  replicas: 3
  template:
    spec:
      containers:
      - name: search-platform
        image: your-registry/search-platform:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: OPENSEARCH_URL
          valueFrom:
            secretKeyRef:
              name: search-secrets
              key: opensearch-url
```

## Performance Tuning

### Cache Configuration

```typescript
const platform = new SearchPlatform({
  cache: {
    l1MaxSize: 50000,      // In-memory cache entries
    l1TtlMs: 300000,       // 5 minutes TTL
    l2Enabled: true,       // Enable Redis L2 cache
    l2TtlMs: 3600000      // 1 hour TTL for L2
  }
});
```

### Batch Operations

```typescript
// Efficient batch synchronization
const syncService = new DataSyncService({
  batchSize: 500,          // Larger batches for better throughput
  retryAttempts: 5
});

// Batch sync with progress tracking
await syncService.syncDocuments(documents, tenantId, 'create');
```

## Troubleshooting

### Common Issues

1. **Connection Errors**
   ```typescript
   // Add retry logic
   const client = new SearchClient({
     baseUrl: 'http://localhost:3000',
     retryAttempts: 5,
     timeout: 10000
   });
   ```

2. **Memory Issues**
   ```typescript
   // Reduce cache size
   const platform = new SearchPlatform({
     cache: { l1MaxSize: 1000 }
   });
   ```

3. **Slow Queries**
   ```typescript
   // Enable query explanation
   const explanation = await client.explain(query);
   console.log('Query analysis:', explanation);
   ```

### Debug Mode

```typescript
// Enable detailed logging
const platform = new SearchPlatform({
  enableLogging: true,
  logLevel: 'debug'
});
```

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## License

MIT © APIM Product Development

## Support

- 📧 Email: [support@apim.com](mailto:support@apim.com)
- 📖 Documentation: [docs.apim.com/search](https://docs.apim.com/search)
- 🐛 Issues: [GitHub Issues](https://github.com/your-org/multitenant-search/issues)
- 💬 Discussions: [GitHub Discussions](https://github.com/your-org/multitenant-search/discussions)