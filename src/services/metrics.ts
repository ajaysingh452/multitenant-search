import { logger } from '../utils/logger.js';

interface MetricData {
  name: string;
  value: number;
  tags: Record<string, string>;
  timestamp: Date;
}

export class MetricsService {
  private metrics: Map<string, MetricData[]> = new Map();
  private counters: Map<string, number> = new Map();

  recordSearchLatency(tenantId: string, queryType: string, duration: number): void {
    const metricKey = 'search_latency';
    const metrics = this.metrics.get(metricKey) || [];
    
    metrics.push({
      name: metricKey,
      value: duration,
      tags: { tenant_id: tenantId, query_type: queryType },
      timestamp: new Date()
    });
    
    // Keep only last 1000 metrics
    if (metrics.length > 1000) {
      metrics.shift();
    }
    
    this.metrics.set(metricKey, metrics);
  }

  recordSearchResults(tenantId: string, resultCount: number): void {
    const metricKey = 'search_results';
    const metrics = this.metrics.get(metricKey) || [];
    
    metrics.push({
      name: metricKey,
      value: resultCount,
      tags: { tenant_id: tenantId },
      timestamp: new Date()
    });
    
    this.metrics.set(metricKey, metrics);
  }

  recordSearchError(tenantId: string, error: any): void {
    const counterKey = `search_errors_${tenantId}`;
    const currentCount = this.counters.get(counterKey) || 0;
    this.counters.set(counterKey, currentCount + 1);
    
    logger.error({ tenantId, error: error.message }, 'Search error recorded');
  }

  recordCacheHit(tenantId: string, operation: string): void {
    const counterKey = `cache_hits_${tenantId}_${operation}`;
    const currentCount = this.counters.get(counterKey) || 0;
    this.counters.set(counterKey, currentCount + 1);
  }

  recordCacheMiss(tenantId: string, operation: string): void {
    const counterKey = `cache_misses_${tenantId}_${operation}`;
    const currentCount = this.counters.get(counterKey) || 0;
    this.counters.set(counterKey, currentCount + 1);
  }

  getMetrics(): any {
    const now = Date.now();
    const fiveMinutesAgo = now - (5 * 60 * 1000);
    
    // Calculate recent latency percentiles
    const recentLatencies = this.metrics.get('search_latency')
      ?.filter(m => m.timestamp.getTime() > fiveMinutesAgo)
      ?.map(m => m.value)
      ?.sort((a, b) => a - b) || [];
    
    const p50 = this.percentile(recentLatencies, 0.5);
    const p95 = this.percentile(recentLatencies, 0.95);
    const p99 = this.percentile(recentLatencies, 0.99);
    
    return {
      timestamp: new Date().toISOString(),
      latency: {
        p50: p50,
        p95: p95,
        p99: p99,
        count: recentLatencies.length
      },
      counters: Object.fromEntries(this.counters),
      cache: {
        hit_rate: this.calculateCacheHitRate()
      }
    };
  }

  private percentile(arr: number[], p: number): number {
    if (arr.length === 0) return 0;
    const index = Math.ceil(arr.length * p) - 1;
    return arr[Math.max(0, index)];
  }

  private calculateCacheHitRate(): number {
    let totalHits = 0;
    let totalMisses = 0;
    
    for (const [key, value] of this.counters) {
      if (key.includes('cache_hits')) totalHits += value;
      if (key.includes('cache_misses')) totalMisses += value;
    }
    
    const total = totalHits + totalMisses;
    return total > 0 ? totalHits / total : 0;
  }

  reset(): void {
    this.metrics.clear();
    this.counters.clear();
  }
}