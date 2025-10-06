import { LRUCache } from 'lru-cache';
import Redis from 'ioredis';
import { logger } from '../utils/logger.js';

interface CacheOptions {
  l1MaxSize?: number;
  l1TtlMs?: number;
  l2Enabled?: boolean;
  l2Config?: {
    host: string;
    port: number;
    password?: string;
    db?: number;
  };
}

export class CacheService {
  private l1Cache: LRUCache<string, any>;
  private l2Cache?: Redis;
  private l2Enabled: boolean;
  private stats: {
    l1Hits: number;
    l1Misses: number;
    l2Hits: number;
    l2Misses: number;
    errors: number;
  };

  constructor(options: CacheOptions = {}) {
    // L1 Cache - In-memory LRU
    this.l1Cache = new LRUCache({
      max: options.l1MaxSize || 10000, // 10k items max
      ttl: options.l1TtlMs || 5 * 60 * 1000, // 5 minutes default
      allowStale: true, // Serve stale data if Redis is down
      updateAgeOnGet: true,
      updateAgeOnHas: true
    });

    // L2 Cache - Redis (optional)
    this.l2Enabled = options.l2Enabled || false;
    if (this.l2Enabled && options.l2Config) {
      try {
        this.l2Cache = new Redis({
          host: options.l2Config.host,
          port: options.l2Config.port,
          password: options.l2Config.password,
          db: options.l2Config.db || 0,
          retryDelayOnFailover: 100,
          maxRetriesPerRequest: 2,
          lazyConnect: true,
          // Graceful handling of Redis failures
          reconnectOnError: (err) => {
            const targetError = 'READONLY';
            return err.message.includes(targetError);
          }
        });

        this.l2Cache.on('error', (error) => {
          this.stats.errors++;
          logger.warn({ error: error.message }, 'Redis L2 cache error');
        });

        this.l2Cache.on('connect', () => {
          logger.info('Connected to Redis L2 cache');
        });

      } catch (error) {
        logger.error({ error }, 'Failed to initialize Redis L2 cache');
        this.l2Enabled = false;
      }
    }

    // Statistics tracking
    this.stats = {
      l1Hits: 0,
      l1Misses: 0,
      l2Hits: 0,
      l2Misses: 0,
      errors: 0
    };

    logger.info({
      l1MaxSize: this.l1Cache.max,
      l1Ttl: options.l1TtlMs,
      l2Enabled: this.l2Enabled
    }, 'Cache service initialized');
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      // Try L1 cache first
      const l1Result = this.l1Cache.get(key);
      if (l1Result !== undefined) {
        this.stats.l1Hits++;
        logger.debug({ key, level: 'L1' }, 'Cache hit');
        return l1Result as T;
      }
      this.stats.l1Misses++;

      // Try L2 cache if enabled
      if (this.l2Enabled && this.l2Cache) {
        try {
          const l2Result = await this.l2Cache.get(key);
          if (l2Result) {
            this.stats.l2Hits++;
            const parsed = JSON.parse(l2Result) as T;
            
            // Populate L1 cache with L2 result
            this.l1Cache.set(key, parsed);
            
            logger.debug({ key, level: 'L2' }, 'Cache hit');
            return parsed;
          }
          this.stats.l2Misses++;
        } catch (redisError) {
          this.stats.errors++;
          logger.warn({ error: redisError, key }, 'L2 cache get error');
          // Continue without L2, don't fail the request
        }
      }

      logger.debug({ key }, 'Cache miss');
      return null;

    } catch (error) {
      this.stats.errors++;
      logger.error({ error, key }, 'Cache get error');
      return null; // Graceful degradation
    }
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    try {
      // Always set in L1 cache
      const ttlMs = ttlSeconds ? ttlSeconds * 1000 : undefined;
      this.l1Cache.set(key, value, { ttl: ttlMs });

      // Set in L2 cache if enabled
      if (this.l2Enabled && this.l2Cache) {
        try {
          const serialized = JSON.stringify(value);
          if (ttlSeconds) {
            await this.l2Cache.setex(key, ttlSeconds, serialized);
          } else {
            await this.l2Cache.set(key, serialized);
          }
        } catch (redisError) {
          this.stats.errors++;
          logger.warn({ error: redisError, key }, 'L2 cache set error');
          // Continue without L2, don't fail the request
        }
      }

      logger.debug({ key, ttlSeconds }, 'Cache set');

    } catch (error) {
      this.stats.errors++;
      logger.error({ error, key }, 'Cache set error');
      // Don't throw, allow request to continue
    }
  }

  async delete(key: string): Promise<void> {
    try {
      // Delete from L1
      this.l1Cache.delete(key);

      // Delete from L2 if enabled
      if (this.l2Enabled && this.l2Cache) {
        try {
          await this.l2Cache.del(key);
        } catch (redisError) {
          this.stats.errors++;
          logger.warn({ error: redisError, key }, 'L2 cache delete error');
        }
      }

      logger.debug({ key }, 'Cache delete');

    } catch (error) {
      this.stats.errors++;
      logger.error({ error, key }, 'Cache delete error');
    }
  }

  async clear(): Promise<void> {
    try {
      // Clear L1
      this.l1Cache.clear();

      // Clear L2 if enabled
      if (this.l2Enabled && this.l2Cache) {
        try {
          await this.l2Cache.flushdb();
        } catch (redisError) {
          this.stats.errors++;
          logger.warn({ error: redisError }, 'L2 cache clear error');
        }
      }

      logger.info('Cache cleared');

    } catch (error) {
      this.stats.errors++;
      logger.error({ error }, 'Cache clear error');
    }
  }

  // Bulk operations for efficiency
  async mget<T>(keys: string[]): Promise<Map<string, T>> {
    const results = new Map<string, T>();
    const l2Keys: string[] = [];

    // Check L1 cache for all keys
    for (const key of keys) {
      const l1Result = this.l1Cache.get(key);
      if (l1Result !== undefined) {
        results.set(key, l1Result as T);
        this.stats.l1Hits++;
      } else {
        l2Keys.push(key);
        this.stats.l1Misses++;
      }
    }

    // Check L2 cache for remaining keys
    if (this.l2Enabled && this.l2Cache && l2Keys.length > 0) {
      try {
        const l2Results = await this.l2Cache.mget(...l2Keys);
        
        for (let i = 0; i < l2Keys.length; i++) {
          const key = l2Keys[i];
          const value = l2Results[i];
          
          if (value) {
            const parsed = JSON.parse(value) as T;
            results.set(key, parsed);
            // Populate L1 cache
            this.l1Cache.set(key, parsed);
            this.stats.l2Hits++;
          } else {
            this.stats.l2Misses++;
          }
        }
      } catch (redisError) {
        this.stats.errors++;
        logger.warn({ error: redisError, keys: l2Keys }, 'L2 cache mget error');
      }
    }

    return results;
  }

  // Cache warming for predictable queries
  async warmup(tenantId: string, popularQueries: Array<{ key: string; value: any }>): Promise<void> {
    logger.info({ tenantId, queryCount: popularQueries.length }, 'Starting cache warmup');

    const warmupPromises = popularQueries.map(async ({ key, value }) => {
      try {
        await this.set(key, value, 3600); // 1 hour TTL for warmup
      } catch (error) {
        logger.warn({ error, key, tenantId }, 'Cache warmup error for key');
      }
    });

    await Promise.allSettled(warmupPromises);
    logger.info({ tenantId }, 'Cache warmup completed');
  }

  // Health check and statistics
  getStats() {
    return {
      ...this.stats,
      l1Size: this.l1Cache.size,
      l1MaxSize: this.l1Cache.max,
      l2Connected: this.l2Enabled && this.l2Cache?.status === 'ready',
      hitRate: {
        l1: this.stats.l1Hits / (this.stats.l1Hits + this.stats.l1Misses) || 0,
        l2: this.stats.l2Hits / (this.stats.l2Hits + this.stats.l2Misses) || 0,
        overall: (this.stats.l1Hits + this.stats.l2Hits) / 
                 (this.stats.l1Hits + this.stats.l1Misses + this.stats.l2Hits + this.stats.l2Misses) || 0
      }
    };
  }

  // Graceful shutdown
  async shutdown(): Promise<void> {
    logger.info('Shutting down cache service');
    
    if (this.l2Cache) {
      await this.l2Cache.quit();
    }
    
    this.l1Cache.clear();
    logger.info('Cache service shutdown complete');
  }
}