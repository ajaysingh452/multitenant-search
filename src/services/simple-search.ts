import Typesense from 'typesense';
import { SearchRequest, SearchResponse, SuggestRequest, SuggestResponse } from '../types/api.js';
import { logger } from '../utils/logger.js';

export class SimpleSearchEngine {
  private client: Typesense.Client;
  private collectionName: string;

  constructor(config: any) {
    this.client = new Typesense.Client({
      nodes: config.nodes,
      apiKey: config.apiKey,
      connectionTimeoutSeconds: config.connectionTimeoutSeconds || 5
    });
    this.collectionName = 'search-docs';
  }

  async search(request: SearchRequest): Promise<SearchResponse> {
    const startTime = Date.now();
    
    try {
      // Build Typesense query
      const searchParameters = this.buildTypesenseQuery(request);
      
      logger.debug({ 
        tenantId: request.tenant_id, 
        searchParameters 
      }, 'Executing simple search');

      const result = await this.client
        .collections<any>(this.collectionName)
        .documents()
        .search(searchParameters);

      // Transform Typesense response to our API format
      const response = this.transformTypesenseResponse(result, request);
      
      logger.debug({
        tenantId: request.tenant_id,
        duration: Date.now() - startTime,
        hitCount: response.hits.length
      }, 'Simple search completed');

      return response;

    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        tenantId: request.tenant_id,
        duration: Date.now() - startTime
      }, 'Simple search failed');
      
      throw error;
    }
  }

  async suggest(request: SuggestRequest): Promise<SuggestResponse> {
    try {
      const searchParameters = {
        q: request.prefix,
        query_by: 'title,joins_denorm.customer_name',
        filter_by: this.buildFilterString({ 
          tenant_id: request.tenant_id,
          ...(request.entity && { entity: request.entity })
        }),
        per_page: request.limit || 10,
        typo_tokens_threshold: 0, // Exact prefix matching
        prefix: true,
        highlight_full_fields: 'title'
      };

      const result = await this.client
        .collections<any>(this.collectionName)
        .documents()
        .search(searchParameters);

      const suggestions = result.hits?.map((hit: any) => ({
        text: hit.document.title,
        score: hit.text_match_info?.score || 0,
        context: {
          entity: hit.document.entity,
          id: hit.document.id
        }
      })) || [];

      return {
        suggestions,
        performance: {
          took_ms: 0, // Will be set by router
          engine: 'simple',
          cached: false,
          partial: false
        }
      };

    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        tenantId: request.tenant_id
      }, 'Suggest request failed');
      
      return {
        suggestions: [],
        performance: {
          took_ms: 0,
          engine: 'simple',
          cached: false,
          partial: false
        }
      };
    }
  }

  async filterByIds(request: SearchRequest, docIds: string[]): Promise<SearchResponse> {
    // Filter documents by IDs for hybrid queries
    const searchParameters = {
      q: '*',
      filter_by: `tenant_id:${request.tenant_id} && id:[${docIds.map(id => `"${id}"`).join(',')}]`,
      per_page: request.page?.size || 20,
      sort_by: request.sort?.map(s => `${s.field}:${s.order}`).join(',') || 'dates.created_at:desc'
    };

    try {
      const result = await this.client
        .collections<any>(this.collectionName)
        .documents()
        .search(searchParameters);

      return this.transformTypesenseResponse(result, request);

    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        tenantId: request.tenant_id,
        docIds: docIds.length
      }, 'Filter by IDs failed');
      
      throw error;
    }
  }

  private buildTypesenseQuery(request: SearchRequest): any {
    const searchParameters: any = {
      per_page: request.page?.size || 20,
      page: 1 // Typesense uses 1-based pagination
    };

    // Handle cursor-based pagination
    if (request.page?.cursor) {
      // Decode cursor to page number (simplified)
      try {
        const pageInfo = JSON.parse(Buffer.from(request.page.cursor, 'base64').toString());
        searchParameters.page = pageInfo.page || 1;
      } catch {
        searchParameters.page = 1;
      }
    }

    // Text query
    if (request.q && request.q.trim()) {
      searchParameters.q = request.q;
      searchParameters.query_by = 'title,body,keywords,joins_denorm.customer_name';
      searchParameters.prefix = true;
      searchParameters.typo_tokens_threshold = 1;
    } else {
      searchParameters.q = '*';
    }

    // Filters
    const filters = this.buildFilterString({
      tenant_id: request.tenant_id,
      ...request.filters
    });
    if (filters) {
      searchParameters.filter_by = filters;
    }

    // Sorting
    if (request.sort && request.sort.length > 0) {
      searchParameters.sort_by = request.sort
        .map(sort => `${sort.field}:${sort.order}`)
        .join(',');
    } else {
      searchParameters.sort_by = 'dates.created_at:desc';
    }

    // Field selection
    if (request.select && request.select.length > 0) {
      searchParameters.include_fields = request.select.join(',');
    }

    // Facets
    if (request.filters) {
      const facetFields = Object.keys(request.filters).filter(key => 
        key.startsWith('facets.') || ['entity', 'status', 'tags'].includes(key)
      );
      if (facetFields.length > 0) {
        searchParameters.facet_by = facetFields.join(',');
      }
    }

    return searchParameters;
  }

  private buildFilterString(filters: Record<string, any>): string {
    const filterParts: string[] = [];

    for (const [field, value] of Object.entries(filters)) {
      if (value === undefined || value === null) continue;

      if (Array.isArray(value)) {
        // Array values: field:[val1,val2]
        const values = value.map(v => `"${v}"`).join(',');
        filterParts.push(`${field}:[${values}]`);
      } else if (typeof value === 'object' && value !== null) {
        // Range queries: field:>value or field:<value
        if (value.gte !== undefined) {
          filterParts.push(`${field}:>=${value.gte}`);
        }
        if (value.lte !== undefined) {
          filterParts.push(`${field}:<=${value.lte}`);
        }
        if (value.gt !== undefined) {
          filterParts.push(`${field}:>${value.gt}`);
        }
        if (value.lt !== undefined) {
          filterParts.push(`${field}:<${value.lt}`);
        }
      } else {
        // Simple equality: field:value
        filterParts.push(`${field}:"${value}"`);
      }
    }

    return filterParts.join(' && ');
  }

  private transformTypesenseResponse(result: any, request: SearchRequest): SearchResponse {
    const hits = result.hits?.map((hit: any) => ({
      id: hit.document.id,
      source: this.selectFields(hit.document, request.select),
      score: hit.text_match_info?.score || null,
      highlight: this.extractHighlights(hit.highlights)
    })) || [];

    const facets = this.transformFacets(result.facet_counts);

    // Generate next page cursor
    const hasMore = result.found > (result.page * result.per_page);
    const nextCursor = hasMore ? 
      Buffer.from(JSON.stringify({ page: result.page + 1 })).toString('base64') : 
      null;

    return {
      hits,
      total: {
        value: result.found || 0,
        relation: 'eq'
      },
      page: {
        size: request.page?.size || 20,
        cursor: nextCursor,
        has_more: hasMore
      },
      facets,
      performance: {
        took_ms: result.search_time_ms || 0,
        engine: 'simple',
        cached: false,
        partial: false
      }
    };
  }

  private selectFields(document: any, selectFields?: string[]): any {
    if (!selectFields || selectFields.length === 0) {
      return document;
    }

    const selected: any = {};
    for (const field of selectFields) {
      if (field.includes('.')) {
        // Handle nested fields
        const parts = field.split('.');
        let source = document;
        let target = selected;
        
        for (let i = 0; i < parts.length - 1; i++) {
          const part = parts[i];
          if (!target[part]) target[part] = {};
          source = source?.[part];
          target = target[part];
        }
        
        const lastPart = parts[parts.length - 1];
        if (source && source[lastPart] !== undefined) {
          target[lastPart] = source[lastPart];
        }
      } else {
        if (document[field] !== undefined) {
          selected[field] = document[field];
        }
      }
    }

    return selected;
  }

  private extractHighlights(highlights: any[]): Record<string, string[]> | undefined {
    if (!highlights || highlights.length === 0) return undefined;

    const result: Record<string, string[]> = {};
    
    for (const highlight of highlights) {
      if (highlight.field && highlight.matched_tokens) {
        result[highlight.field] = highlight.matched_tokens;
      }
    }

    return Object.keys(result).length > 0 ? result : undefined;
  }

  private transformFacets(facetCounts: any[]): Record<string, any> | undefined {
    if (!facetCounts || facetCounts.length === 0) return undefined;

    const facets: Record<string, any> = {};

    for (const facet of facetCounts) {
      if (facet.field_name && facet.counts) {
        facets[facet.field_name] = {
          buckets: facet.counts.map((count: any) => ({
            key: count.value,
            count: count.count
          }))
        };
      }
    }

    return facets;
  }

  // Initialize collection
  async initializeCollection(): Promise<void> {
    try {
      // Check if collection exists
      const collections = await this.client.collections().retrieve();
      const existingCollection = collections.find((c: any) => c.name === this.collectionName);
      
      if (!existingCollection) {
        // Create collection from schema
        const schema = {
          name: this.collectionName,
          fields: [
            { name: 'tenant_id', type: 'string', facet: true, index: true },
            { name: 'id', type: 'string', facet: false, index: false },
            { name: 'entity', type: 'string', facet: true, index: true },
            { name: 'title', type: 'string', facet: false, index: true, sort: true },
            { name: 'body', type: 'string', facet: false, index: true, sort: false },
            { name: 'keywords', type: 'string[]', facet: true, index: true },
            { name: 'status', type: 'string', facet: true, index: true },
            { name: 'tags', type: 'string[]', facet: true, index: true },
            { name: 'numeric_amount', type: 'float', facet: true, index: true, sort: true, optional: true },
            { name: 'numeric_score', type: 'float', facet: true, index: true, sort: true, optional: true },
            { name: 'created_at', type: 'int64', facet: true, index: true, sort: true },
            { name: 'updated_at', type: 'int64', facet: true, index: true, sort: true },
            { name: 'region', type: 'string', facet: true, index: true, optional: true },
            { name: 'category', type: 'string', facet: true, index: true, optional: true },
            { name: 'customer_name', type: 'string', facet: false, index: true, sort: true, optional: true }
          ],
          default_sorting_field: 'created_at'
        };
        
        await this.client.collections().create(schema);
        logger.info({ collectionName: this.collectionName }, 'Typesense collection created');
      } else {
        logger.info({ collectionName: this.collectionName }, 'Typesense collection already exists');
      }
    } catch (error) {
      logger.error({ error, collectionName: this.collectionName }, 'Failed to initialize Typesense collection');
      throw error;
    }
  }

  // Health check
  async healthCheck(): Promise<boolean> {
    try {
      await this.client.collections().retrieve();
      return true;
    } catch {
      return false;
    }
  }
}