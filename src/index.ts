import fastify, { FastifyInstance } from 'fastify';
import { QueryClassifier } from './services/query-classifier.js';
import { CacheService } from './services/cache.js';
import { SimpleSearchEngine } from './services/simple-search.js';
import { ComplexSearchEngine } from './services/complex-search.js';
import { TenantService } from './services/tenant.js';
import { MetricsService } from './services/metrics.js';
import { SearchRouter } from './routes/search-router.js';
import { logger } from './utils/logger.js';
import { HealthService } from './services/health.js';

interface AppConfig {
  port: number;
  host: string;
  opensearch: {
    node: string;
    auth?: { username: string; password: string };
  };
  typesense: {
    nodes: Array<{ host: string; port: number; protocol: string }>;
    apiKey: string;
  };
  redis?: {
    host: string;
    port: number;
    password?: string;
  };
  cache: {
    l1MaxSize: number;
    l1TtlMs: number;
    l2Enabled: boolean;
  };
}

class SearchApplication {
  private app: FastifyInstance;
  private config: AppConfig;
  private services: {
    queryClassifier: QueryClassifier;
    cacheService: CacheService;
    simpleEngine: SimpleSearchEngine;
    complexEngine: ComplexSearchEngine;
    tenantService: TenantService;
    metricsService: MetricsService;
    healthService: HealthService;
  };

  constructor(config: AppConfig) {
    this.config = config;
    this.app = fastify({
      logger: logger,
      requestIdLogLabel: 'correlationId',
      genReqId: () => Math.random().toString(36).substring(2, 15)
    });

    this.services = this.initializeServices();
  }

  private initializeServices() {
    // Initialize cache service
    const cacheService = new CacheService({
      l1MaxSize: this.config.cache.l1MaxSize,
      l1TtlMs: this.config.cache.l1TtlMs,
      l2Enabled: this.config.cache.l2Enabled,
      l2Config: this.config.redis
    });

    // Initialize search engines
    const simpleEngine = new SimpleSearchEngine(this.config.typesense);
    const complexEngine = new ComplexSearchEngine(this.config.opensearch);

    // Initialize other services
    const queryClassifier = new QueryClassifier();
    const tenantService = new TenantService();
    const metricsService = new MetricsService();
    const healthService = new HealthService({
      simpleEngine,
      complexEngine,
      cacheService
    });

    return {
      queryClassifier,
      cacheService,
      simpleEngine,
      complexEngine,
      tenantService,
      metricsService,
      healthService
    };
  }

  private async registerPlugins(): Promise<void> {
    // CORS support
    await this.app.register(import('@fastify/cors'), {
      origin: true,
      credentials: true
    });

    // Security headers
    await this.app.register(import('@fastify/helmet'), {
      contentSecurityPolicy: false
    });

    // Rate limiting
    await this.app.register(import('@fastify/rate-limit'), {
      max: 1000,
      timeWindow: '1 minute',
      keyGenerator: (request) => {
        return request.headers['x-tenant-id'] as string || request.ip;
      }
    });

    // Request/Response validation
    await this.app.register(import('@fastify/ajv-compiler'));
  }

  private async registerRoutes(): Promise<void> {
    // Health checks
    this.app.get('/health', async () => {
      const health = await this.services.healthService.getHealth();
      return health;
    });

    this.app.get('/ready', async (request, reply) => {
      const ready = await this.services.healthService.isReady();
      if (ready) {
        return { status: 'ready' };
      } else {
        reply.code(503);
        return { status: 'not ready' };
      }
    });

    // Metrics endpoint
    this.app.get('/metrics', async () => {
      return this.services.metricsService.getMetrics();
    });

    // Search routes
    const searchRouter = new SearchRouter(
      this.services.queryClassifier,
      this.services.cacheService,
      this.services.simpleEngine,
      this.services.complexEngine,
      this.services.tenantService,
      this.services.metricsService
    );

    await searchRouter.registerRoutes(this.app);
  }

  public async start(): Promise<void> {
    try {
      // Register plugins and routes
      await this.registerPlugins();
      await this.registerRoutes();

      // Start the server
      await this.app.listen({
        port: this.config.port,
        host: this.config.host
      });

      logger.info({
        port: this.config.port,
        host: this.config.host
      }, 'Search server started successfully');

      // Initialize search engines (create collections/indices if needed)
      await this.initializeSearchEngines();

    } catch (error) {
      logger.error(error, 'Failed to start search server');
      process.exit(1);
    }
  }

  private async initializeSearchEngines(): Promise<void> {
    try {
      // Wait for engines to be ready
      await this.waitForEngines();

      // Initialize Typesense collection
      try {
        await this.services.simpleEngine.initializeCollection();
        logger.info('Typesense collection initialized');
      } catch (error) {
        logger.warn(error, 'Failed to initialize Typesense collection');
      }

      // Initialize OpenSearch index
      try {
        await this.services.complexEngine.initializeIndex();
        logger.info('OpenSearch index initialized');
      } catch (error) {
        logger.warn(error, 'Failed to initialize OpenSearch index');
      }

    } catch (error) {
      logger.error(error, 'Failed to initialize search engines');
    }
  }

  private async waitForEngines(): Promise<void> {
    const maxRetries = 30;
    const retryDelay = 2000;

    for (let i = 0; i < maxRetries; i++) {
      try {
        const [simpleHealth, complexHealth] = await Promise.all([
          this.services.simpleEngine.healthCheck(),
          this.services.complexEngine.healthCheck()
        ]);

        if (simpleHealth && complexHealth) {
          logger.info('All search engines are ready');
          return;
        }

        logger.info(`Waiting for search engines... (${i + 1}/${maxRetries})`);
      } catch (error) {
        logger.debug(error, 'Engine health check failed');
      }

      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }

    throw new Error('Search engines failed to become ready within timeout');
  }

  public async shutdown(): Promise<void> {
    logger.info('Shutting down search server...');

    try {
      await this.services.cacheService.shutdown();
      await this.app.close();
      logger.info('Search server shutdown complete');
    } catch (error) {
      logger.error(error, 'Error during shutdown');
    }
  }
}

// Configuration from environment variables
const config: AppConfig = {
  port: parseInt(process.env.PORT || '3000'),
  host: process.env.HOST || '0.0.0.0',
  opensearch: {
    node: process.env.OPENSEARCH_URL || 'http://localhost:9200',
    auth: process.env.OPENSEARCH_USERNAME ? {
      username: process.env.OPENSEARCH_USERNAME,
      password: process.env.OPENSEARCH_PASSWORD || ''
    } : undefined
  },
  typesense: {
    nodes: [{
      host: process.env.TYPESENSE_HOST || 'localhost',
      port: parseInt(process.env.TYPESENSE_PORT || '8108'),
      protocol: process.env.TYPESENSE_PROTOCOL || 'http'
    }],
    apiKey: process.env.TYPESENSE_API_KEY || 'xyz123'
  },
  redis: process.env.REDIS_URL ? {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD
  } : undefined,
  cache: {
    l1MaxSize: parseInt(process.env.CACHE_L1_MAX_SIZE || '10000'),
    l1TtlMs: parseInt(process.env.CACHE_L1_TTL_MS || '300000'),
    l2Enabled: process.env.CACHE_L2_ENABLED === 'true'
  }
};

// Create and start the application
const app = new SearchApplication(config);

// Graceful shutdown handling
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully...');
  await app.shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  await app.shutdown();
  process.exit(0);
});

// Start the application
app.start().catch((error) => {
  logger.error(error, 'Failed to start application');
  process.exit(1);
});

export default app;