/**
 * SearchClient - Client library for connecting to the search platform
 */

export interface SearchClientConfig {
  baseUrl: string;
  timeout?: number;
  apiKey?: string;
  defaultTenantId?: string;
  retryAttempts?: number;
}

export interface SearchQuery {
  q?: string;
  filters?: Record<string, any>;
  sort?: Array<{ field: string; order: 'asc' | 'desc' }>;
  page?: { size?: number; cursor?: string };
  options?: {
    highlight?: boolean;
    suggest?: boolean;
    timeout_ms?: number;
    strict?: boolean;
  };
}

export interface SearchResponse {
  hits: Array<{
    id: string;
    source: any;
    score?: number;
    highlight?: Record<string, string[]>;
  }>;
  total: {
    value: number;
    relation: string;
  };
  page: {
    size: number;
    has_more: boolean;
    cursor?: string;
  };
  performance: {
    took_ms: number;
    cached: boolean;
    engine: string;
  };
  debug?: {
    query_classification: string;
    cache_key: string;
    tenant_routing: string;
  };
}

export class SearchClient {
  private baseUrl: string;
  private timeout: number;
  private apiKey?: string;
  private defaultTenantId?: string;
  private retryAttempts: number;

  constructor(config: SearchClientConfig) {
    this.baseUrl = config.baseUrl;
    this.timeout = config.timeout || 5000;
    this.apiKey = config.apiKey;
    this.defaultTenantId = config.defaultTenantId;
    this.retryAttempts = config.retryAttempts || 3;
  }

  async search(query: SearchQuery, tenantId?: string): Promise<SearchResponse> {
    const tenant = tenantId || this.defaultTenantId;
    if (!tenant) {
      throw new Error('Tenant ID is required for search operations');
    }

    return this.makeRequest('/search', 'POST', query, tenant);
  }

  async suggest(prefix: string, tenantId?: string, limit: number = 10): Promise<any> {
    const tenant = tenantId || this.defaultTenantId;
    if (!tenant) {
      throw new Error('Tenant ID is required for suggest operations');
    }

    return this.makeRequest('/suggest', 'POST', { prefix, limit }, tenant);
  }

  async explain(query: SearchQuery, tenantId?: string): Promise<any> {
    const tenant = tenantId || this.defaultTenantId;
    if (!tenant) {
      throw new Error('Tenant ID is required for explain operations');
    }

    return this.makeRequest('/explain', 'POST', query, tenant);
  }

  async health(): Promise<any> {
    return this.makeRequest('/health', 'GET');
  }

  async metrics(): Promise<any> {
    return this.makeRequest('/metrics', 'GET');
  }

  private async makeRequest(
    path: string, 
    method: string, 
    body?: any, 
    tenantId?: string
  ): Promise<any> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (tenantId) {
      headers['X-Tenant-ID'] = tenantId;
    }

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    let lastError: Error;
    
    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        const response = await fetch(url, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Search API error (${response.status}): ${errorText}`);
        }

        return await response.json();
      } catch (error) {
        lastError = error as Error;
        
        if (attempt === this.retryAttempts) {
          break;
        }
        
        // Exponential backoff
        await new Promise(resolve => 
          setTimeout(resolve, Math.pow(2, attempt) * 1000)
        );
      }
    }

    throw lastError!;
  }
}