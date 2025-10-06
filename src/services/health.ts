import { SimpleSearchEngine } from './simple-search.js';
import { ComplexSearchEngine } from './complex-search.js';
import { CacheService } from './cache.js';
import { logger } from '../utils/logger.js';

interface HealthCheckResult {
  status: 'healthy' | 'unhealthy' | 'degraded';
  latency?: number;
  error?: string;
}

interface SystemHealth {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  services: {
    simple_engine: HealthCheckResult;
    complex_engine: HealthCheckResult;
    cache: HealthCheckResult;
  };
  version: string;
}

export class HealthService {
  private simpleEngine: SimpleSearchEngine;
  private complexEngine: ComplexSearchEngine;
  private cacheService: CacheService;
  private lastHealthCheck?: SystemHealth;
  private healthCheckInterval: any | null = null;

  constructor(services: {
    simpleEngine: SimpleSearchEngine;
    complexEngine: ComplexSearchEngine;
    cacheService: CacheService;
  }) {
    this.simpleEngine = services.simpleEngine;
    this.complexEngine = services.complexEngine;
    this.cacheService = services.cacheService;
    
    // Start periodic health checks
    this.startHealthChecks();
  }

  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.performHealthCheck();
      } catch (error) {
        logger.error(error, 'Health check failed');
      }
    }, 30000); // Every 30 seconds
  }

  private async performHealthCheck(): Promise<SystemHealth> {
    const startTime = Date.now();
    
    try {
      const [simpleHealth, complexHealth, cacheHealth] = await Promise.allSettled([
        this.checkSimpleEngine(),
        this.checkComplexEngine(),
        this.checkCache()
      ]);

      const services = {
        simple_engine: simpleHealth.status === 'fulfilled' 
          ? simpleHealth.value 
          : { status: 'unhealthy' as const, error: 'Check failed' },
        complex_engine: complexHealth.status === 'fulfilled' 
          ? complexHealth.value 
          : { status: 'unhealthy' as const, error: 'Check failed' },
        cache: cacheHealth.status === 'fulfilled' 
          ? cacheHealth.value 
          : { status: 'unhealthy' as const, error: 'Check failed' }
      };

      // Determine overall status
      const serviceStatuses = Object.values(services).map(s => s.status);
      let overallStatus: 'healthy' | 'unhealthy' | 'degraded';
      
      if (serviceStatuses.every(s => s === 'healthy')) {
        overallStatus = 'healthy';
      } else if (serviceStatuses.some(s => s === 'healthy')) {
        overallStatus = 'degraded';
      } else {
        overallStatus = 'unhealthy';
      }

      this.lastHealthCheck = {
        status: overallStatus,
        timestamp: new Date().toISOString(),
        services,
        version: '1.0.0'
      };

      return this.lastHealthCheck;
    } catch (error) {
      logger.error(error, 'Health check error');
      
      this.lastHealthCheck = {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        services: {
          simple_engine: { status: 'unhealthy', error: 'Health check failed' },
          complex_engine: { status: 'unhealthy', error: 'Health check failed' },
          cache: { status: 'unhealthy', error: 'Health check failed' }
        },
        version: '1.0.0'
      };
      
      return this.lastHealthCheck;
    }
  }

  private async checkSimpleEngine(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      const isHealthy = await this.simpleEngine.healthCheck();
      const latency = Date.now() - startTime;
      
      return {
        status: isHealthy ? 'healthy' : 'unhealthy',
        latency
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        latency: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async checkComplexEngine(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      const isHealthy = await this.complexEngine.healthCheck();
      const latency = Date.now() - startTime;
      
      return {
        status: isHealthy ? 'healthy' : 'unhealthy',
        latency
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        latency: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async checkCache(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      // Test cache with a simple set/get operation
      const testKey = 'health-check-' + Date.now();
      const testValue = { test: true };
      
      await this.cacheService.set(testKey, testValue, 5);
      const result = await this.cacheService.get(testKey);
      await this.cacheService.delete(testKey);
      
      const latency = Date.now() - startTime;
      
      return {
        status: result ? 'healthy' : 'degraded',
        latency
      };
    } catch (error) {
      return {
        status: 'degraded', // Cache is optional
        latency: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async getHealth(): Promise<SystemHealth> {
    if (!this.lastHealthCheck) {
      return await this.performHealthCheck();
    }
    
    return this.lastHealthCheck;
  }

  async isReady(): Promise<boolean> {
    const health = await this.getHealth();
    return health.status === 'healthy' || health.status === 'degraded';
  }

  shutdown(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }
}