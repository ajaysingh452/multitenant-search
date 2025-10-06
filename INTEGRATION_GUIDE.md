# Multi-Tenant Search Platform Integration Guide

## 🎯 Integration Options for Your APIM Project

### Option 1: Microservice Integration (Recommended)
Deploy the search platform as a separate microservice and integrate via API calls.

### Option 2: Library Integration
Integrate search capabilities directly into your existing application as a library.

### Option 3: API Gateway Integration
Deploy behind your existing API gateway with routing rules.

---

## 🚀 Option 1: Microservice Integration

### 1.1 Containerized Deployment

#### Docker Compose Integration
Add to your existing `docker-compose.yml`:

```yaml
# Add to your existing docker-compose.yml
services:
  # Your existing services...
  
  # Multi-tenant Search Platform
  search-platform:
    build: ./search-platform
    container_name: search-platform
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - OPENSEARCH_URL=http://opensearch:9200
      - TYPESENSE_HOST=typesense
      - REDIS_HOST=redis
    depends_on:
      - opensearch
      - typesense
      - redis
    networks:
      - your-network

  opensearch:
    image: opensearchproject/opensearch:2.11.0
    container_name: opensearch
    environment:
      - discovery.type=single-node
      - "OPENSEARCH_JAVA_OPTS=-Xms1g -Xmx1g"
    ports:
      - "9200:9200"
    networks:
      - your-network

  typesense:
    image: typesense/typesense:0.25.2
    container_name: typesense
    environment:
      - TYPESENSE_API_KEY=xyz123
    ports:
      - "8108:8108"
    networks:
      - your-network

  redis:
    image: redis:7.2-alpine
    container_name: redis
    ports:
      - "6379:6379"
    networks:
      - your-network

networks:
  your-network:
    external: true
```

#### Environment Configuration
Create `.env.search` file:

```env
# Search Platform Configuration
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# Search Engines
OPENSEARCH_URL=http://opensearch:9200
TYPESENSE_HOST=typesense
TYPESENSE_PORT=8108
TYPESENSE_API_KEY=xyz123

# Cache
REDIS_HOST=redis
REDIS_PORT=6379

# Performance
CACHE_L1_MAX_SIZE=10000
CACHE_L1_TTL_MS=300000
CACHE_L2_ENABLED=true

# Monitoring
LOG_LEVEL=info
METRICS_ENABLED=true
```

### 1.2 Integration Client Library

Create a client library for your APIM services:

```javascript
// search-client.js
class SearchClient {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || 'http://search-platform:3000';
    this.defaultTenantId = options.tenantId;
    this.timeout = options.timeout || 5000;
  }

  async search(query, tenantId = this.defaultTenantId) {
    const response = await fetch(`${this.baseUrl}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Tenant-ID': tenantId
      },
      body: JSON.stringify(query),
      timeout: this.timeout
    });

    if (!response.ok) {
      throw new Error(`Search failed: ${response.statusText}`);
    }

    return response.json();
  }

  async suggest(prefix, tenantId = this.defaultTenantId, limit = 10) {
    const response = await fetch(`${this.baseUrl}/suggest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Tenant-ID': tenantId
      },
      body: JSON.stringify({ prefix, limit })
    });

    return response.json();
  }

  async health() {
    const response = await fetch(`${this.baseUrl}/health`);
    return response.json();
  }
}

module.exports = SearchClient;
```

### 1.3 Integration in Your APIM Services

Example integration in your existing API:

```javascript
// your-api-service.js
const SearchClient = require('./search-client');

class YourAPIService {
  constructor() {
    this.searchClient = new SearchClient({
      baseUrl: process.env.SEARCH_SERVICE_URL || 'http://search-platform:3000'
    });
  }

  async handleSearchRequest(req, res) {
    try {
      const tenantId = req.user.tenantId; // From your auth system
      const searchQuery = {
        q: req.query.q,
        filters: req.query.filters,
        page: { size: req.query.limit || 20 }
      };

      const results = await this.searchClient.search(searchQuery, tenantId);
      
      // Transform results to match your API format
      const transformedResults = {
        data: results.hits.map(hit => hit.source),
        total: results.total.value,
        page: results.page,
        performance: results.performance
      };

      res.json(transformedResults);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async handleAutocomplete(req, res) {
    try {
      const tenantId = req.user.tenantId;
      const suggestions = await this.searchClient.suggest(
        req.query.q, 
        tenantId, 
        req.query.limit || 5
      );

      res.json(suggestions);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}
```

---

## 🔗 Option 2: Library Integration

### 2.1 Extract Core Components

Create a reusable library from the search platform:

```javascript
// search-library/index.js
const QueryClassifier = require('./query-classifier');
const CacheService = require('./cache-service');
const SearchEngine = require('./search-engine');

class SearchLibrary {
  constructor(config) {
    this.classifier = new QueryClassifier();
    this.cache = new CacheService(config.cache);
    this.searchEngine = new SearchEngine(config.engines);
  }

  async search(request, tenantId) {
    const startTime = Date.now();
    
    // Add tenant context
    const searchRequest = { ...request, tenant_id: tenantId };
    
    // Check cache
    const cacheKey = this.generateCacheKey(searchRequest);
    const cached = await this.cache.get(cacheKey);
    
    if (cached) {
      return {
        ...cached,
        performance: { ...cached.performance, cached: true }
      };
    }
    
    // Classify and execute
    const classification = this.classifier.classify(searchRequest);
    const results = await this.searchEngine.search(searchRequest, classification);
    
    // Cache results
    if (classification.cacheable) {
      await this.cache.set(cacheKey, results, 300); // 5 minutes
    }
    
    results.performance.took_ms = Date.now() - startTime;
    return results;
  }

  generateCacheKey(request) {
    const crypto = require('crypto');
    return `search:${request.tenant_id}:${crypto.createHash('md5').update(JSON.stringify(request)).digest('hex')}`;
  }
}

module.exports = SearchLibrary;
```

### 2.2 Integration into Existing Services

```javascript
// your-existing-service.js
const SearchLibrary = require('./search-library');

class YourExistingService {
  constructor() {
    this.searchLib = new SearchLibrary({
      engines: {
        opensearch: { node: process.env.OPENSEARCH_URL },
        typesense: { 
          nodes: [{ host: 'localhost', port: 8108, protocol: 'http' }],
          apiKey: process.env.TYPESENSE_API_KEY 
        }
      },
      cache: {
        l1MaxSize: 10000,
        l1TtlMs: 300000
      }
    });
  }

  async search(query, userId) {
    const tenantId = await this.getTenantForUser(userId);
    return await this.searchLib.search(query, tenantId);
  }

  async getTenantForUser(userId) {
    // Your existing tenant resolution logic
    return 'tenant-123';
  }
}
```

---

## 🌐 Option 3: API Gateway Integration

### 3.1 Nginx/Kong/AWS API Gateway Configuration

#### Nginx Configuration
```nginx
# /etc/nginx/sites-available/your-api
server {
    listen 80;
    server_name your-api.com;

    # Your existing API routes
    location /api/v1/ {
        proxy_pass http://your-existing-api:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Search platform routes
    location /api/v1/search {
        proxy_pass http://search-platform:3000/search;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        
        # Add tenant from JWT or session
        proxy_set_header X-Tenant-ID $http_x_tenant_id;
        
        # Timeouts for search
        proxy_connect_timeout 5s;
        proxy_send_timeout 10s;
        proxy_read_timeout 10s;
    }

    location /api/v1/suggest {
        proxy_pass http://search-platform:3000/suggest;
        proxy_set_header Host $host;
        proxy_set_header X-Tenant-ID $http_x_tenant_id;
    }

    location /api/v1/search/explain {
        proxy_pass http://search-platform:3000/explain;
        proxy_set_header Host $host;
        proxy_set_header X-Tenant-ID $http_x_tenant_id;
    }
}
```

#### Kong Configuration
```yaml
# kong.yml
services:
  - name: search-service
    url: http://search-platform:3000
    plugins:
      - name: rate-limiting
        config:
          minute: 1000
          hour: 10000

routes:
  - name: search-route
    service: search-service
    paths:
      - /api/v1/search
    plugins:
      - name: request-transformer
        config:
          add:
            headers:
              - "X-Tenant-ID:$(headers.authorization | jwt_decode | .tenant_id)"
```

---

## 📊 Data Integration Strategies

### Option A: Real-time Data Sync

Create data sync middleware:

```javascript
// data-sync-middleware.js
class DataSyncMiddleware {
  constructor(searchClient) {
    this.searchClient = searchClient;
  }

  // Middleware for create operations
  async onCreate(req, res, next) {
    try {
      await next(); // Execute the original operation
      
      // If successful, sync to search
      if (res.statusCode === 201) {
        await this.syncDocument(req.body, req.user.tenantId, 'create');
      }
    } catch (error) {
      console.error('Data sync failed:', error);
      // Don't fail the main operation
    }
  }

  // Middleware for update operations
  async onUpdate(req, res, next) {
    try {
      await next();
      
      if (res.statusCode === 200) {
        await this.syncDocument(req.body, req.user.tenantId, 'update');
      }
    } catch (error) {
      console.error('Data sync failed:', error);
    }
  }

  async syncDocument(data, tenantId, operation) {
    const searchDoc = this.transformToSearchFormat(data, tenantId);
    
    // Send to search platform's index endpoint
    await fetch('http://search-platform:3000/admin/index', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Tenant-ID': tenantId
      },
      body: JSON.stringify({ documents: [searchDoc], operation })
    });
  }

  transformToSearchFormat(data, tenantId) {
    return {
      tenant_id: tenantId,
      id: data.id,
      entity: data.type || 'document',
      title: data.name || data.title,
      body: data.description || data.content,
      status: data.status,
      created_at: data.created_at,
      // Map your fields to search document format
    };
  }
}
```

### Option B: Batch Data Sync

```javascript
// batch-sync-job.js
class BatchSyncJob {
  constructor(searchClient, database) {
    this.searchClient = searchClient;
    this.database = database;
  }

  async syncAllTenants() {
    const tenants = await this.database.query('SELECT DISTINCT tenant_id FROM documents');
    
    for (const tenant of tenants) {
      await this.syncTenant(tenant.tenant_id);
    }
  }

  async syncTenant(tenantId) {
    console.log(`Syncing tenant: ${tenantId}`);
    
    const documents = await this.database.query(`
      SELECT * FROM documents 
      WHERE tenant_id = ? 
      AND updated_at > ?
    `, [tenantId, this.getLastSyncTime(tenantId)]);

    const searchDocs = documents.map(doc => ({
      tenant_id: tenantId,
      id: doc.id,
      entity: doc.type,
      title: doc.name,
      body: doc.description,
      status: doc.status,
      created_at: doc.created_at
    }));

    // Batch index
    await this.searchClient.batchIndex(searchDocs, tenantId);
    
    // Update sync timestamp
    this.updateLastSyncTime(tenantId, new Date());
  }
}

// Schedule with cron
const cron = require('node-cron');
const syncJob = new BatchSyncJob(searchClient, database);

// Run every 15 minutes
cron.schedule('*/15 * * * *', () => {
  syncJob.syncAllTenants();
});
```

---

## 🔧 Configuration Management

### Environment-based Configuration

```javascript
// config/search-config.js
module.exports = {
  development: {
    searchService: {
      baseUrl: 'http://localhost:3000',
      timeout: 5000
    },
    engines: {
      opensearch: 'http://localhost:9200',
      typesense: 'http://localhost:8108'
    }
  },
  production: {
    searchService: {
      baseUrl: process.env.SEARCH_SERVICE_URL,
      timeout: 10000
    },
    engines: {
      opensearch: process.env.OPENSEARCH_URL,
      typesense: process.env.TYPESENSE_URL
    }
  }
};
```

---

## 🚀 Deployment Scripts

Create deployment automation:

```bash
#!/bin/bash
# deploy-search-integration.sh

set -e

echo "🚀 Deploying Search Integration..."

# 1. Deploy search platform
cd search-platform
docker-compose up -d

# 2. Wait for services
echo "⏳ Waiting for search services..."
sleep 30

# 3. Initialize indices
echo "📊 Initializing search indices..."
curl -X PUT "http://localhost:9200/search-docs-shared" \
  -H 'Content-Type: application/json' \
  -d @schemas/opensearch-mapping.json

curl -X POST "http://localhost:8108/collections" \
  -H 'Content-Type: application/json' \
  -H "X-TYPESENSE-API-KEY: xyz123" \
  -d @schemas/typesense-schema.json

# 4. Deploy your updated services
cd ../your-api
docker-compose up -d --force-recreate

# 5. Run initial data sync
echo "🔄 Running initial data sync..."
node scripts/initial-sync.js

echo "✅ Search integration deployed successfully!"
```

---

## 📋 Next Steps

1. **Choose Integration Option**: Select the approach that best fits your architecture
2. **Set Up Infrastructure**: Deploy search engines (OpenSearch, Typesense, Redis)
3. **Implement Client**: Create search client for your services
4. **Data Sync**: Set up real-time or batch data synchronization
5. **Testing**: Validate search functionality with your data
6. **Monitoring**: Add health checks and metrics to your monitoring system
7. **Documentation**: Update your API documentation with search endpoints

## 🎯 Benefits of Integration

- **Unified Search**: Single search API across all your entities
- **Multi-tenant**: Secure data isolation for all tenants
- **Performance**: Sub-100ms search with intelligent caching
- **Scalable**: Horizontal scaling with load balancing
- **Observable**: Built-in metrics and health monitoring
- **Flexible**: Support for simple, complex, and hybrid queries

Choose the integration option that best fits your existing architecture and let me know if you need help implementing any specific approach!