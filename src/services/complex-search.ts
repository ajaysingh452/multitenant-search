import { SearchRequest, SearchResponse } from '../types/api.js';
import { Client } from '@opensearch-project/opensearch';
import { logger } from '../utils/logger.js';

export class ComplexSearchEngine {
  private client: Client;
  private indexPrefix: string;

  constructor(config: any) {
    this.client = new Client({
      node: config.node,
      auth: config.auth,
      ssl: config.ssl || { rejectUnauthorized: false },
      requestTimeout: config.requestTimeout || 10000,
      maxRetries: config.maxRetries || 2
    });
    this.indexPrefix = 'search-docs';
  }

  async search(request: SearchRequest): Promise<SearchResponse> {
    const startTime = Date.now();
    
    try {
      const indexName = this.getIndexName(request.tenant_id!);
      const query = this.buildOpenSearchQuery(request);
      
      logger.debug({
        tenantId: request.tenant_id,
        indexName,
        query: JSON.stringify(query, null, 2)
      }, 'Executing complex search');

      const response = await this.client.search({
        index: indexName,
        body: query,
        timeout: `${request.options?.timeout_ms || 5000}ms`
      });

      const searchResponse = this.transformOpenSearchResponse(response.body, request);
      
      logger.debug({
        tenantId: request.tenant_id,
        duration: Date.now() - startTime,
        hitCount: searchResponse.hits.length,
        totalHits: searchResponse.total.value
      }, 'Complex search completed');

      return searchResponse;

    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        tenantId: request.tenant_id,
        duration: Date.now() - startTime
      }, 'Complex search failed');
      
      throw error;
    }
  }

  private getIndexName(tenantId: string): string {
    // In production, determine index strategy based on tenant size
    // For now, use shared index with routing
    return `${this.indexPrefix}-shared`;
  }

  private buildOpenSearchQuery(request: SearchRequest): any {
    const query: any = {
      size: request.page?.size || 20,
      from: 0, // Handle pagination
      track_total_hits: true
    };

    // Handle cursor-based pagination
    if (request.page?.cursor) {
      try {
        const pageInfo = JSON.parse(Buffer.from(request.page.cursor, 'base64').toString());
        query.from = pageInfo.from || 0;
      } catch {
        query.from = 0;
      }
    }

    // Build the main query
    query.query = this.buildQueryClause(request);

    // Add tenant routing and ACL filters
    query.query = {
      bool: {
        must: [query.query],
        filter: [
          { term: { tenant_id: request.tenant_id } },
          ...this.buildACLFilters(request)
        ]
      }
    };

    // Field selection
    if (request.select && request.select.length > 0) {
      query._source = {
        includes: request.select
      };
    }

    // Sorting
    if (request.sort && request.sort.length > 0) {
      query.sort = request.sort.map(sort => ({
        [sort.field]: { order: sort.order }
      }));
    } else {
      query.sort = [{ 'dates.created_at': { order: 'desc' } }];
    }

    // Highlighting
    if (request.options?.highlight && request.q) {
      query.highlight = {
        fields: {
          title: { fragment_size: 150, number_of_fragments: 3 },
          body: { fragment_size: 150, number_of_fragments: 3 }
        },
        pre_tags: ['<mark>'],
        post_tags: ['</mark>']
      };
    }

    // Aggregations for facets
    query.aggs = this.buildAggregations(request);

    return query;
  }

  private buildQueryClause(request: SearchRequest): any {
    if (!request.q || !request.q.trim()) {
      // No text query, use match_all with filters
      return { match_all: {} };
    }

    const textQuery = request.q.trim();

    // Check for phrase queries
    if (textQuery.includes('"')) {
      return {
        multi_match: {
          query: textQuery,
          fields: [
            'title^3',
            'body^1',
            'joins_denorm.customer_name^2',
            'keywords^2'
          ],
          type: 'phrase'
        }
      };
    }

    // Check for prefix queries
    if (textQuery.endsWith('*')) {
      return {
        multi_match: {
          query: textQuery.slice(0, -1),
          fields: [
            'title.exact^3',
            'joins_denorm.customer_name.exact^2'
          ],
          type: 'phrase_prefix'
        }
      };
    }

    // Default full-text search with boosting
    return {
      bool: {
        should: [
          // Exact phrase match (highest boost)
          {
            multi_match: {
              query: textQuery,
              fields: ['title^5', 'joins_denorm.customer_name^3'],
              type: 'phrase',
              boost: 3
            }
          },
          // Best fields match
          {
            multi_match: {
              query: textQuery,
              fields: [
                'title^3',
                'body^1',
                'joins_denorm.customer_name^2',
                'keywords^2'
              ],
              type: 'best_fields',
              fuzziness: 'AUTO',
              boost: 2
            }
          },
          // Cross fields match
          {
            multi_match: {
              query: textQuery,
              fields: [
                'title',
                'body',
                'joins_denorm.customer_name'
              ],
              type: 'cross_fields',
              boost: 1
            }
          }
        ],
        minimum_should_match: 1
      }
    };
  }

  private buildACLFilters(request: SearchRequest): any[] {
    const filters: any[] = [];

    // Add field-based filters
    if (request.filters) {
      for (const [field, value] of Object.entries(request.filters)) {
        if (value === undefined || value === null) continue;

        if (Array.isArray(value)) {
          // Terms query for arrays
          filters.push({ terms: { [field]: value } });
        } else if (typeof value === 'object' && value !== null) {
          // Range query
          const rangeQuery: any = {};
          if (value.gte !== undefined) rangeQuery.gte = value.gte;
          if (value.lte !== undefined) rangeQuery.lte = value.lte;
          if (value.gt !== undefined) rangeQuery.gt = value.gt;
          if (value.lt !== undefined) rangeQuery.lt = value.lt;
          
          if (Object.keys(rangeQuery).length > 0) {
            filters.push({ range: { [field]: rangeQuery } });
          }
        } else {
          // Term query for exact matches
          filters.push({ term: { [field]: value } });
        }
      }
    }

    return filters;
  }

  private buildAggregations(request: SearchRequest): any {
    const aggs: any = {};

    // Common facet fields
    const facetFields = [
      'entity',
      'status',
      'facets.region',
      'facets.category',
      'facets.tier'
    ];

    for (const field of facetFields) {
      // Only add aggregation if field is not already filtered
      if (!request.filters?.[field]) {
        aggs[field] = {
          terms: {
            field: field,
            size: 20,
            order: { _count: 'desc' }
          }
        };
      }
    }

    // Date histogram for time-based facets
    aggs.date_histogram = {
      date_histogram: {
        field: 'dates.created_at',
        calendar_interval: 'month',
        format: 'yyyy-MM',
        min_doc_count: 1
      }
    };

    // Numeric range aggregations
    aggs.amount_ranges = {
      range: {
        field: 'numeric.amount',
        ranges: [
          { to: 100 },
          { from: 100, to: 1000 },
          { from: 1000, to: 10000 },
          { from: 10000 }
        ]
      }
    };

    return aggs;
  }

  private transformOpenSearchResponse(response: any, request: SearchRequest): SearchResponse {
    const hits = response.hits?.hits?.map((hit: any) => ({
      id: hit._source.id,
      source: hit._source,
      score: hit._score,
      highlight: hit.highlight
    })) || [];

    const total = {
      value: response.hits?.total?.value || 0,
      relation: response.hits?.total?.relation || 'eq'
    };

    // Generate pagination cursor
    const currentFrom = request.page?.cursor ? 
      JSON.parse(Buffer.from(request.page.cursor, 'base64').toString()).from || 0 : 0;
    const pageSize = request.page?.size || 20;
    const nextFrom = currentFrom + pageSize;
    const hasMore = nextFrom < total.value;
    
    const nextCursor = hasMore ?
      Buffer.from(JSON.stringify({ from: nextFrom })).toString('base64') : null;

    // Transform aggregations to facets
    const facets = this.transformAggregations(response.aggregations);

    return {
      hits,
      total: total as { value: number; relation: 'eq' | 'gte' },
      page: {
        size: pageSize,
        cursor: nextCursor,
        has_more: hasMore
      },
      facets,
      performance: {
        took_ms: response.took || 0,
        engine: 'complex',
        cached: false,
        partial: false
      }
    };
  }

  private transformAggregations(aggs: any): Record<string, any> | undefined {
    if (!aggs) return undefined;

    const facets: Record<string, any> = {};

    for (const [key, agg] of Object.entries(aggs)) {
      if (agg && typeof agg === 'object' && 'buckets' in agg) {
        facets[key] = {
          buckets: (agg as any).buckets.map((bucket: any) => ({
            key: bucket.key,
            count: bucket.doc_count
          }))
        };
      }
    }

    return Object.keys(facets).length > 0 ? facets : undefined;
  }

  // Index management
  async createIndex(tenantId: string, mapping: any): Promise<void> {
    const indexName = this.getIndexName(tenantId);
    
    try {
      const exists = await this.client.indices.exists({ index: indexName });
      
      if (!exists.body) {
        await this.client.indices.create({
          index: indexName,
          body: mapping
        });
        logger.info({ indexName, tenantId }, 'Created search index');
      }
    } catch (error) {
      logger.error({ error, indexName, tenantId }, 'Failed to create index');
      throw error;
    }
  }

  async bulkIndex(documents: any[]): Promise<void> {
    if (documents.length === 0) return;

    const body = documents.flatMap(doc => [
      {
        index: {
          _index: doc.index || this.getIndexName(doc.tenant_id),
          _id: doc.id,
          routing: doc.tenant_id
        }
      },
      doc
    ]);

    try {
      const response = await this.client.bulk({
        body,
        refresh: 'wait_for'
      });

      if (response.body.errors) {
        const errors = response.body.items
          .filter((item: any) => item.index?.error)
          .map((item: any) => item.index.error);
        
        logger.warn({ errors: errors.slice(0, 5) }, 'Bulk index had errors');
      }

      logger.debug({ 
        indexed: documents.length,
        took: response.body.took 
      }, 'Bulk index completed');

    } catch (error) {
      logger.error({ error, documentCount: documents.length }, 'Bulk index failed');
      throw error;
    }
  }

  // Initialize index
  async initializeIndex(): Promise<void> {
    const indexName = 'search-docs-shared';
    
    try {
      const exists = await this.client.indices.exists({ index: indexName });
      
      if (!exists.body) {
        const mapping = {
          settings: {
            number_of_shards: 3,
            number_of_replicas: 1,
            refresh_interval: '2s'
          },
          mappings: {
            properties: {
              tenant_id: { type: 'keyword' },
              id: { type: 'keyword' },
              entity: { type: 'keyword' },
              title: { 
                type: 'text',
                fields: {
                  exact: { type: 'keyword' }
                }
              },
              body: { type: 'text' },
              keywords: { type: 'keyword' },
              status: { type: 'keyword' },
              tags: { type: 'keyword' },
              'numeric.amount': { type: 'double' },
              'numeric.score': { type: 'float' },
              'dates.created_at': { type: 'date' },
              'dates.updated_at': { type: 'date' },
              'facets.region': { type: 'keyword' },
              'facets.category': { type: 'keyword' },
              'joins_denorm.customer_name': {
                type: 'text',
                fields: {
                  exact: { type: 'keyword' }
                }
              },
              '_acl.owner': { type: 'keyword' },
              '_acl.roles': { type: 'keyword' }
            }
          }
        };
        
        await this.client.indices.create({
          index: indexName,
          body: mapping
        });
        
        logger.info({ indexName }, 'OpenSearch index created');
      } else {
        logger.info({ indexName }, 'OpenSearch index already exists');
      }
    } catch (error) {
      logger.error({ error, indexName }, 'Failed to initialize OpenSearch index');
      throw error;
    }
  }

  // Health check
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.cluster.health({ timeout: '5s' });
      return response.body.status !== 'red';
    } catch {
      return false;
    }
  }
}