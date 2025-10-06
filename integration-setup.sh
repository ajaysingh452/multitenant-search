#!/bin/bash
# Quick integration setup script for APIM projects

set -e

echo "🔧 APIM Search Platform Integration Setup"
echo "========================================"

# Check if we're in the right directory
if [ ! -f "demo.js" ]; then
    echo "❌ Please run this script from the Search-0.1 directory"
    exit 1
fi

# Create integration directories
echo "📁 Creating integration structure..."
mkdir -p integration/{client,middleware,sync,examples}

# Create search client library
echo "📦 Creating search client library..."
cat > integration/client/search-client.js << 'EOF'
/**
 * Search Platform Client Library for APIM Integration
 * Provides a simple interface to interact with the multi-tenant search platform
 */
class SearchClient {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || 'http://localhost:3000';
    this.defaultTenantId = options.tenantId;
    this.timeout = options.timeout || 5000;
    this.apiKey = options.apiKey; // For future auth
  }

  /**
   * Execute a search query
   * @param {Object} query - Search query object
   * @param {string} tenantId - Tenant ID (optional, uses default if not provided)
   * @returns {Promise<Object>} Search results
   */
  async search(query, tenantId = this.defaultTenantId) {
    if (!tenantId) {
      throw new Error('Tenant ID is required for search operations');
    }

    const response = await this._makeRequest('/search', 'POST', query, tenantId);
    return response;
  }

  /**
   * Get autocomplete suggestions
   * @param {string} prefix - Search prefix
   * @param {string} tenantId - Tenant ID
   * @param {number} limit - Maximum suggestions to return
   * @returns {Promise<Object>} Suggestions
   */
  async suggest(prefix, tenantId = this.defaultTenantId, limit = 10) {
    const response = await this._makeRequest('/suggest', 'POST', { prefix, limit }, tenantId);
    return response;
  }

  /**
   * Explain query execution plan
   * @param {Object} query - Query to explain
   * @param {string} tenantId - Tenant ID
   * @returns {Promise<Object>} Query explanation
   */
  async explain(query, tenantId = this.defaultTenantId) {
    const response = await this._makeRequest('/explain', 'POST', query, tenantId);
    return response;
  }

  /**
   * Check search platform health
   * @returns {Promise<Object>} Health status
   */
  async health() {
    const response = await this._makeRequest('/health', 'GET');
    return response;
  }

  /**
   * Get performance metrics
   * @returns {Promise<Object>} Metrics data
   */
  async metrics() {
    const response = await this._makeRequest('/metrics', 'GET');
    return response;
  }

  /**
   * Make HTTP request to search platform
   * @private
   */
  async _makeRequest(path, method, body = null, tenantId = null) {
    const url = `${this.baseUrl}${path}`;
    const headers = {
      'Content-Type': 'application/json'
    };

    if (tenantId) {
      headers['X-Tenant-ID'] = tenantId;
    }

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const options = {
      method,
      headers,
      timeout: this.timeout
    };

    if (body && method !== 'GET') {
      options.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(url, options);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Search API error (${response.status}): ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error(`Search request timeout after ${this.timeout}ms`);
      }
      throw error;
    }
  }
}

module.exports = SearchClient;
EOF

# Create integration README
echo "📚 Creating integration documentation..."
cat > integration/README.md << 'EOF'
# Search Platform Integration Library

This library provides easy integration with the Multi-Tenant Search Platform for your APIM projects.

## Quick Start

### 1. Install Dependencies
```bash
cd integration/
npm install
```

### 2. Basic Usage

```javascript
const SearchClient = require('./client/search-client');

const searchClient = new SearchClient({
  baseUrl: 'http://localhost:3000',
  tenantId: 'your-tenant-id'
});

// Search
const results = await searchClient.search({
  q: 'search query',
  filters: { status: 'active' }
});

// Autocomplete
const suggestions = await searchClient.suggest('prefix', 'tenant-id', 5);
```

## Components

### SearchClient
- `search(query, tenantId)` - Execute search queries
- `suggest(prefix, tenantId, limit)` - Get autocomplete suggestions
- `explain(query, tenantId)` - Get query execution plan
- `health()` - Check search platform health

## Configuration

Set environment variables:
```bash
SEARCH_SERVICE_URL=http://localhost:3000
NODE_ENV=production
```
EOF

echo ""
echo "✅ Integration setup complete!"
echo ""
echo "📁 Created integration structure:"
echo "   integration/"
echo "   ├── client/search-client.js         # Search API client"
echo "   └── README.md                       # Documentation"
echo ""
echo "🚀 Next steps:"
echo "   1. cd integration/"
echo "   2. Review client/search-client.js"
echo "   3. Integrate into your APIM services"
echo ""
echo "📚 Integration guide: INTEGRATION_GUIDE.md"