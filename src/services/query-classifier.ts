import { SearchRequest } from '../types/api.js';
import { logger } from '../utils/logger.js';

export interface QueryClassification {
  type: 'simple' | 'complex' | 'hybrid';
  reason: string;
  complexityScore: number;
  cacheable: boolean;
  estimatedLatency: number;
}

export class QueryClassifier {
  private readonly SIMPLE_THRESHOLD = 3;
  private readonly COMPLEX_THRESHOLD = 7;

  async classify(request: SearchRequest): Promise<QueryClassification> {
    const score = this.calculateComplexityScore(request);
    const type = this.determineQueryType(score, request);
    
    const classification: QueryClassification = {
      type,
      reason: this.getClassificationReason(type, request),
      complexityScore: score,
      cacheable: this.isCacheable(request),
      estimatedLatency: this.estimateLatency(type, score)
    };

    logger.debug({ 
      query: request.q, 
      filters: Object.keys(request.filters || {}),
      classification 
    }, 'Query classified');

    return classification;
  }

  private calculateComplexityScore(request: SearchRequest): number {
    let score = 0;

    // Full-text query complexity
    if (request.q && request.q.trim()) {
      const queryLength = request.q.length;
      const wordCount = request.q.split(/\s+/).length;
      
      score += Math.min(wordCount * 0.5, 3); // Max 3 points for text complexity
      
      // Boost for phrase queries
      if (request.q.includes('"')) {
        score += 1;
      }
      
      // Boost for wildcard/fuzzy queries
      if (request.q.includes('*') || request.q.includes('~')) {
        score += 1;
      }
    }

    // Filter complexity
    const filters = request.filters || {};
    const filterCount = Object.keys(filters).length;
    score += Math.min(filterCount * 0.5, 2); // Max 2 points for filter count

    // Range queries are more expensive
    const rangeFilters = Object.values(filters).filter(filter => 
      typeof filter === 'object' && 
      filter !== null && 
      ('gte' in filter || 'lte' in filter || 'gt' in filter || 'lt' in filter)
    );
    score += rangeFilters.length;

    // Array filters (IN queries) add complexity
    const arrayFilters = Object.values(filters).filter(filter => Array.isArray(filter));
    score += arrayFilters.length * 0.3;

    // Sorting complexity
    if (request.sort && request.sort.length > 0) {
      score += request.sort.length * 0.5;
      
      // Text field sorting is expensive
      const textSorts = request.sort.filter(sort => 
        sort.field.includes('title') || sort.field.includes('body')
      );
      score += textSorts.length;
    }

    // Pagination depth
    const pageSize = request.page?.size || 20;
    if (pageSize > 50) {
      score += 1;
    }

    // Options complexity
    const options = request.options || {};
    if (options.highlight) score += 1;
    if (options.suggest) score += 0.5;

    // Field selection complexity
    if (request.select && request.select.length > 10) {
      score += 0.5;
    }

    return Math.round(score * 10) / 10; // Round to 1 decimal place
  }

  private determineQueryType(score: number, request: SearchRequest): 'simple' | 'complex' | 'hybrid' {
    // Simple queries: basic lookups with minimal complexity
    if (score <= this.SIMPLE_THRESHOLD) {
      // Additional simple query criteria
      const hasFullText = request.q && request.q.trim();
      const filterCount = Object.keys(request.filters || {}).length;
      const hasComplexFeatures = request.options?.highlight || request.options?.suggest;
      
      if (!hasFullText && filterCount <= 2 && !hasComplexFeatures) {
        return 'simple';
      }
    }

    // Complex queries: high complexity or specific features requiring full search engine
    if (score >= this.COMPLEX_THRESHOLD) {
      return 'complex';
    }

    // Check for features that require complex engine regardless of score
    const requiresComplexEngine = this.requiresComplexEngine(request);
    if (requiresComplexEngine) {
      return 'complex';
    }

    // Hybrid queries: moderate complexity with both text and structured filters
    const hasFullText = request.q && request.q.trim();
    const hasStructuredFilters = Object.keys(request.filters || {}).length > 0;
    
    if (hasFullText && hasStructuredFilters) {
      return 'hybrid';
    }

    // Default to simple for low complexity
    if (score <= 5) {
      return 'simple';
    }

    return 'complex';
  }

  private requiresComplexEngine(request: SearchRequest): boolean {
    const options = request.options || {};
    
    // Features that require OpenSearch/Elasticsearch
    if (options.highlight) return true;
    if (options.suggest) return true;
    
    // Complex text queries
    if (request.q) {
      const query = request.q.trim();
      if (query.includes('"')) return true; // Phrase queries
      if (query.includes('*') && query.length > 10) return true; // Complex wildcards
      if (query.includes('~')) return true; // Fuzzy queries
      if (query.split(/\s+/).length > 5) return true; // Long queries
    }

    // Complex aggregations (if we had them)
    const filters = request.filters || {};
    const hasNestedFilters = Object.keys(filters).some(key => 
      key.includes('.') && typeof filters[key] === 'object'
    );
    if (hasNestedFilters) return true;

    // Large result sets
    const pageSize = request.page?.size || 20;
    if (pageSize > 50) return true;

    return false;
  }

  private getClassificationReason(type: string, request: SearchRequest): string {
    switch (type) {
      case 'simple':
        return 'Basic lookup with equality/prefix filters, suitable for key-value store';
      
      case 'complex':
        const complexFeatures = [];
        if (request.q && request.q.length > 20) complexFeatures.push('long full-text query');
        if (request.options?.highlight) complexFeatures.push('highlighting');
        if (request.options?.suggest) complexFeatures.push('suggestions');
        if ((request.page?.size || 20) > 50) complexFeatures.push('large result set');
        
        return complexFeatures.length > 0 
          ? `Requires full search engine: ${complexFeatures.join(', ')}`
          : 'High complexity score requires full search engine';
      
      case 'hybrid':
        return 'Mixed text search and structured filters, using hybrid approach';
      
      default:
        return 'Unknown classification';
    }
  }

  private isCacheable(request: SearchRequest): boolean {
    // Don't cache queries with time-sensitive filters
    const filters = request.filters || {};
    const hasTimeFilter = Object.keys(filters).some(key => 
      key.includes('date') && typeof filters[key] === 'object'
    );
    
    // Don't cache very specific queries (likely one-time lookups)
    const isVerySpecific = request.q && request.q.length > 50;
    
    // Don't cache large page requests (usually export/batch operations)
    const isLargePage = (request.page?.size || 20) > 50;

    return !hasTimeFilter && !isVerySpecific && !isLargePage;
  }

  private estimateLatency(type: string, complexityScore: number): number {
    const baseLatencies = {
      simple: 50,   // Typesense/Redis latency
      complex: 200, // OpenSearch latency
      hybrid: 150   // Mixed approach
    };

    const base = baseLatencies[type] || 200;
    const complexityMultiplier = 1 + (complexityScore / 20); // Max 50% increase

    return Math.round(base * complexityMultiplier);
  }

  // Utility method for testing/debugging
  public explainClassification(request: SearchRequest): Record<string, any> {
    const score = this.calculateComplexityScore(request);
    const type = this.determineQueryType(score, request);
    
    return {
      complexityScore: score,
      queryType: type,
      factors: {
        hasFullText: !!(request.q && request.q.trim()),
        filterCount: Object.keys(request.filters || {}).length,
        sortCount: request.sort?.length || 0,
        pageSize: request.page?.size || 20,
        hasHighlight: request.options?.highlight || false,
        hasSuggestions: request.options?.suggest || false,
        textLength: request.q?.length || 0,
        wordCount: request.q?.split(/\s+/).length || 0
      },
      thresholds: {
        simple: this.SIMPLE_THRESHOLD,
        complex: this.COMPLEX_THRESHOLD
      }
    };
  }
}