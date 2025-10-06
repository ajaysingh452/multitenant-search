import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { SearchRequest, SearchResponse, SuggestRequest, ExplainResponse } from './types/api.js';
import { QueryClassifier } from './services/query-classifier.js';
import { CacheService } from './services/cache.js';
import { SimpleSearchEngine } from './services/simple-search.js';
import { ComplexSearchEngine } from './services/complex-search.js';
import { TenantService } from './services/tenant.js';
import { MetricsService } from './services/metrics.js';
import { logger } from './utils/logger.js';
import { createHash } from 'crypto';

export class SearchRouter {
  private queryClassifier: QueryClassifier;
  private cacheService: CacheService;
  private simpleEngine: SimpleSearchEngine;
  private complexEngine: ComplexSearchEngine;
  private tenantService: TenantService;
  private metricsService: MetricsService;

  constructor(
    queryClassifier: QueryClassifier,
    cacheService: CacheService,
    simpleEngine: SimpleSearchEngine,
    complexEngine: ComplexSearchEngine,
    tenantService: TenantService,
    metricsService: MetricsService
  ) {
    this.queryClassifier = queryClassifier;
    this.cacheService = cacheService;
    this.simpleEngine = simpleEngine;
    this.complexEngine = complexEngine;
    this.tenantService = tenantService;
    this.metricsService = metricsService;
  }

  public async registerRoutes(fastify: FastifyInstance): Promise<void> {
    // Unified search endpoint
    fastify.post<{ Body: SearchRequest }>('/search', {
      schema: {
        body: {
          type: 'object',
          properties: {
            q: { type: ['string', 'null'] },
            filters: { type: 'object' },
            sort: { type: 'array' },
            select: { type: 'array', items: { type: 'string' } },
            page: {
              type: 'object',
              properties: {
                size: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
                cursor: { type: ['string', 'null'] }
              }
            },
            options: {
              type: 'object',
              properties: {
                highlight: { type: 'boolean', default: false },
                suggest: { type: 'boolean', default: false },
                timeout_ms: { type: 'integer', minimum: 50, maximum: 2000, default: 700 },
                strict: { type: 'boolean', default: false }
              }
            }
          }
        }
      }
    }, this.handleSearch.bind(this));

    // Typeahead suggestions
    fastify.post<{ Body: SuggestRequest }>('/suggest', {
      schema: {
        body: {
          type: 'object',
          required: ['prefix'],
          properties: {
            prefix: { type: 'string', minLength: 1, maxLength: 50 },
            entity: { type: 'array', items: { type: 'string' } },
            limit: { type: 'integer', minimum: 1, maximum: 20, default: 10 }
          }
        }
      }
    }, this.handleSuggest.bind(this));

    // Query explanation
    fastify.post<{ Body: SearchRequest }>('/explain', {
      schema: {
        body: {
          type: 'object',
          properties: {
            q: { type: ['string', 'null'] },
            filters: { type: 'object' },
            sort: { type: 'array' }
          }
        }
      }
    }, this.handleExplain.bind(this));
  }

  private async handleSearch(
    request: FastifyRequest<{ Body: SearchRequest }>,
    reply: FastifyReply
  ): Promise<SearchResponse> {
    const startTime = Date.now();
    const tenantId = this.extractTenantId(request);
    const searchRequest = { ...request.body, tenant_id: tenantId };
    
    try {
      // Generate cache key
      const cacheKey = this.generateCacheKey(tenantId, searchRequest);
      
      // Check L1 cache first
      const cachedResult = await this.cacheService.get(cacheKey);
      if (cachedResult) {
        this.metricsService.recordCacheHit(tenantId, 'search');
        logger.debug({ tenantId, cacheKey }, 'Cache hit for search query');
        
        return {
          ...cachedResult,
          performance: {
            ...cachedResult.performance,
            took_ms: Date.now() - startTime,
            cached: true
          }
        };
      }

      // Classify query
      const classification = await this.queryClassifier.classify(searchRequest);
      logger.debug({ tenantId, classification }, 'Query classified');

      // Apply tenant-specific ACL filters
      const authorizedRequest = await this.tenantService.applyAuthzFilters(
        searchRequest,
        request.headers.authorization
      );

      // Route to appropriate engine
      let result: SearchResponse;
      const timeoutMs = searchRequest.options?.timeout_ms || 700;

      try {
        switch (classification.type) {
          case 'simple':
            result = await Promise.race([
              this.simpleEngine.search(authorizedRequest),
              this.createTimeoutPromise(timeoutMs, 'simple')
            ]);
            break;
          
          case 'complex':
            result = await Promise.race([
              this.complexEngine.search(authorizedRequest),
              this.createTimeoutPromise(timeoutMs, 'complex')
            ]);
            break;
          
          case 'hybrid':
            result = await Promise.race([
              this.executeHybridSearch(authorizedRequest),
              this.createTimeoutPromise(timeoutMs, 'hybrid')
            ]);
            break;
          
          default:
            throw new Error(`Unknown classification type: ${classification.type}`);
        }

        // Cache successful results
        const cacheTtlSeconds = this.calculateCacheTtl(classification, result);
        await this.cacheService.set(cacheKey, result, cacheTtlSeconds);
        
      } catch (error) {
        if (error instanceof Error && error.message.includes('timeout')) {
          // Return partial results on timeout
          logger.warn({ tenantId, timeoutMs }, 'Query timeout, returning partial results');
          
          result = await this.getPartialResults(authorizedRequest, classification);
          result.performance.partial = true;
        } else {
          throw error;
        }
      }

      // Record metrics
      const duration = Date.now() - startTime;
      this.metricsService.recordSearchLatency(tenantId, classification.type, duration);
      this.metricsService.recordSearchResults(tenantId, result.total.value);

      // Add performance metadata
      result.performance = {
        took_ms: duration,
        engine: classification.type,
        cached: false,
        partial: result.performance?.partial || false
      };

      result.debug = {
        query_classification: classification.type,
        cache_key: cacheKey,
        tenant_routing: await this.tenantService.getRoutingStrategy(tenantId)
      };

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      this.metricsService.recordSearchError(tenantId, error);
      
      logger.error({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        tenantId, 
        duration 
      }, 'Search request failed');
      
      reply.code(500);
      return {
        hits: [],
        total: { value: 0, relation: 'eq' },
        page: { size: searchRequest.page?.size || 20, has_more: false },
        performance: {
          took_ms: duration,
          engine: 'error',
          cached: false,
          partial: false
        },
        error: {
          code: 'SEARCH_ERROR',
          message: error instanceof Error ? error.message : 'Internal search error'
        }
      } as any;
    }
  }

  private async handleSuggest(
    request: FastifyRequest<{ Body: SuggestRequest }>,
    reply: FastifyReply
  ): Promise<any> {
    const startTime = Date.now();
    const tenantId = this.extractTenantId(request);
    
    try {
      const cacheKey = `suggest:${tenantId}:${createHash('md5')
        .update(JSON.stringify(request.body))
        .digest('hex')}`;
      
      const cachedResult = await this.cacheService.get(cacheKey);
      if (cachedResult) {
        this.metricsService.recordCacheHit(tenantId, 'suggest');
        return {
          ...cachedResult,
          performance: {
            took_ms: Date.now() - startTime,
            cached: true
          }
        };
      }

      // Use simple engine for suggestions (fast prefix search)
      const result = await this.simpleEngine.suggest({
        ...request.body,
        tenant_id: tenantId
      });

      // Cache suggestions for 5 minutes
      await this.cacheService.set(cacheKey, result, 300);

      return {
        ...result,
        performance: {
          took_ms: Date.now() - startTime,
          cached: false
        }
      };

    } catch (error) {
      logger.error({ error, tenantId }, 'Suggest request failed');
      reply.code(500);
      return {
        suggestions: [],
        performance: {
          took_ms: Date.now() - startTime,
          cached: false
        }
      };
    }
  }

  private async handleExplain(
    request: FastifyRequest<{ Body: SearchRequest }>,
    reply: FastifyReply
  ): Promise<ExplainResponse> {
    const tenantId = this.extractTenantId(request);
    const searchRequest = { ...request.body, tenant_id: tenantId };

    try {
      const classification = await this.queryClassifier.classify(searchRequest);
      const routingStrategy = await this.tenantService.getRoutingStrategy(tenantId);
      
      return {
        classification: classification.type,
        routing: {
          engine: classification.type === 'simple' ? 'typesense' : 'opensearch',
          index: routingStrategy.indexName,
          reason: classification.reason
        },
        estimated_cost: {
          complexity_score: classification.complexityScore,
          expected_latency_ms: this.estimateLatency(classification)
        },
        cache_strategy: {
          cacheable: classification.cacheable,
          key: this.generateCacheKey(tenantId, searchRequest),
          ttl_seconds: this.calculateCacheTtl(classification, null)
        }
      };

    } catch (error) {
      logger.error({ error, tenantId }, 'Explain request failed');
      reply.code(500);
      return {
        classification: 'error',
        routing: { engine: 'none', index: 'none', reason: 'Error occurred' },
        estimated_cost: { complexity_score: 0, expected_latency_ms: 0 },
        cache_strategy: { cacheable: false, key: '', ttl_seconds: 0 }
      };
    }
  }

  private extractTenantId(request: FastifyRequest): string {
    // Extract tenant ID from JWT token (set by gateway)
    const token = request.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      throw new Error('Missing authorization token');
    }
    
    // In production, this would decode JWT and extract tenant_id
    // For now, assume it's in a custom header
    const tenantId = request.headers['x-tenant-id'] as string;
    if (!tenantId) {
      throw new Error('Missing tenant ID in request');
    }
    
    return tenantId;
  }

  private generateCacheKey(tenantId: string, request: SearchRequest): string {
    const normalized = {
      q: request.q,
      filters: request.filters,
      sort: request.sort,
      select: request.select,
      page: request.page
    };
    
    const hash = createHash('md5')
      .update(JSON.stringify(normalized))
      .digest('hex');
    
    return `search:${tenantId}:${hash}`;
  }

  private async executeHybridSearch(request: SearchRequest): Promise<SearchResponse> {
    // Hybrid approach: Use complex engine for full-text, then filter/boost with simple engine
    // This is useful when we have text query + exact filters
    
    const complexResult = await this.complexEngine.search({
      ...request,
      page: { size: (request.page?.size || 20) * 3 } // Get more results for filtering
    });

    // If we have exact filters that can be applied efficiently by simple engine
    if (this.shouldUseSimpleEngineFiltering(request)) {
      const docIds = complexResult.hits.map(hit => hit.id);
      const simpleResult = await this.simpleEngine.filterByIds(request, docIds);
      
      // Merge results, preserving text relevance scores
      return this.mergeHybridResults(complexResult, simpleResult, request.page?.size || 20);
    }

    return complexResult;
  }

  private shouldUseSimpleEngineFiltering(request: SearchRequest): boolean {
    // Use simple engine filtering if we have exact match filters on indexed fields
    const filters = request.filters || {};
    const exactFilters = ['entity', 'status', 'facets.region', 'facets.category'];
    
    return exactFilters.some(field => filters[field]);
  }

  private mergeHybridResults(
    complexResult: SearchResponse,
    simpleResult: SearchResponse,
    pageSize: number
  ): SearchResponse {
    // Create a map of simple results for fast lookup
    const simpleHits = new Map(simpleResult.hits.map(hit => [hit.id, hit]));
    
    // Filter complex results to only include those that passed simple filtering
    const mergedHits = complexResult.hits
      .filter(hit => simpleHits.has(hit.id))
      .slice(0, pageSize);
    
    return {
      ...complexResult,
      hits: mergedHits,
      total: { value: mergedHits.length, relation: 'eq' }
    };
  }

  private async getPartialResults(
    request: SearchRequest,
    classification: any
  ): Promise<SearchResponse> {
    // Return cached results or fallback to simple engine for partial results
    const fallbackRequest = {
      ...request,
      q: null, // Remove full-text for faster execution
      page: { size: Math.min(request.page?.size || 20, 10) }, // Smaller page
      options: { ...request.options, timeout_ms: 200 } // Aggressive timeout
    };

    try {
      return await this.simpleEngine.search(fallbackRequest);
    } catch {
      // Last resort: return empty results
      return {
        hits: [],
        total: { value: 0, relation: 'gte' },
        page: { size: request.page?.size || 20, has_more: false },
        performance: { took_ms: 0, engine: 'fallback', cached: false, partial: true }
      };
    }
  }

  private createTimeoutPromise(timeoutMs: number, engine: string): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Query timeout after ${timeoutMs}ms on ${engine} engine`));
      }, timeoutMs);
    });
  }

  private calculateCacheTtl(classification: any, result: SearchResponse | null): number {
    // Dynamic TTL based on query type and result characteristics
    if (classification.type === 'simple') {
      return 300; // 5 minutes for simple queries
    }
    
    if (result && result.total.value < 100) {
      return 600; // 10 minutes for small result sets
    }
    
    return 120; // 2 minutes for complex/large results
  }

  private estimateLatency(classification: any): number {
    const baseLatency = {
      simple: 50,
      complex: 200,
      hybrid: 150
    };
    
    return baseLatency[classification.type] * (1 + classification.complexityScore / 10);
  }
}