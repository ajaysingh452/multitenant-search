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
      // Use node-fetch or built-in fetch
      const fetch = globalThis.fetch || require('node-fetch');
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