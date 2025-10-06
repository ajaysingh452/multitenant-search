/**
 * SearchPlatform - Main search platform server
 */

import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { SearchClient } from './client';

export interface SearchPlatformConfig {
  port?: number;
  host?: string;
  corsOrigins?: string[];
  enableLogging?: boolean;
  enableMetrics?: boolean;
  engines?: {
    mock?: boolean;
    opensearch?: {
      node: string;
      auth?: { username: string; password: string };
    };
    typesense?: {
      nodes: Array<{ host: string; port: number; protocol: string }>;
      apiKey: string;
    };
    redis?: {
      host: string;
      port: number;
      password?: string;
    };
  };
  cache?: {
    l1MaxSize?: number;
    l1TtlMs?: number;
    l2Enabled?: boolean;
  };
}

interface AuthenticatedRequest extends Request {
  tenantId?: string;
  user?: any;
}

export class SearchPlatform {
  private app: Express;
  private config: SearchPlatformConfig;
  private mockData: any[];
  private cache: Map<string, any>;

  constructor(config: SearchPlatformConfig = {}) {
    this.config = {
      port: 3000,
      host: '0.0.0.0',
      corsOrigins: ['*'],
      enableLogging: true,
      enableMetrics: true,
      engines: { mock: true },
      cache: {
        l1MaxSize: 10000,
        l1TtlMs: 300000,
        l2Enabled: false
      },
      ...config
    };

    this.app = express();
    this.cache = new Map();
    this.mockData = this.createMockData();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private createMockData() {
    return [
      {
        tenant_id: 'tenant-123',
        id: 'doc-1',
        entity: 'customer',
        title: 'Acme Corporation',
        body: 'Large enterprise customer in technology sector',
        status: 'active',
        created_at: new Date().toISOString()
      },
      {
        tenant_id: 'tenant-123',
        id: 'doc-2',
        entity: 'order',
        title: 'Order #12345 - Software License',
        body: 'Annual software license renewal for Acme Corp',
        status: 'open',
        created_at: new Date().toISOString()
      },
      {
        tenant_id: 'tenant-456',
        id: 'doc-3',
        entity: 'invoice',
        title: 'Invoice #INV-2024-001',
        body: 'Monthly subscription payment overdue',
        status: 'overdue',
        created_at: new Date().toISOString()
      }
    ];
  }

  private setupMiddleware() {
    // Security
    this.app.use(helmet());
    
    // CORS
    this.app.use(cors({
      origin: this.config.corsOrigins,
      credentials: true
    }));

    // Compression
    this.app.use(compression());

    // Logging
    if (this.config.enableLogging) {
      this.app.use(morgan('combined'));
    }

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));

    // Tenant extraction middleware
    this.app.use(this.extractTenant.bind(this));
  }

  private extractTenant(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    const tenantId = req.headers['x-tenant-id'] as string;
    
    if (!tenantId && (req.path.startsWith('/search') || req.path.startsWith('/suggest'))) {
      return res.status(400).json({
        error: {
          code: 'MISSING_TENANT_ID',
          message: 'X-Tenant-ID header is required'
        }
      });
    }

    req.tenantId = tenantId;
    next();
  }

  private setupRoutes() {
    // Health endpoints
    this.app.get('/health', this.handleHealth.bind(this));
    this.app.get('/ready', this.handleReady.bind(this));
    
    // Metrics
    if (this.config.enableMetrics) {
      this.app.get('/metrics', this.handleMetrics.bind(this));
    }

    // Search endpoints
    this.app.post('/search', this.handleSearch.bind(this));
    this.app.post('/suggest', this.handleSuggest.bind(this));
    this.app.post('/explain', this.handleExplain.bind(this));

    // Error handling
    this.app.use(this.errorHandler.bind(this));
  }

  private async handleHealth(req: Request, res: Response) {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        search_engine: { status: 'healthy', latency: 5 },
        cache: { status: 'healthy', latency: 2 }
      },
      version: '1.0.0'
    });
  }

  private async handleReady(req: Request, res: Response) {
    res.json({ status: 'ready' });
  }

  private async handleMetrics(req: Request, res: Response) {
    res.json({
      timestamp: new Date().toISOString(),
      latency: {
        p50: 45,
        p95: 120,
        p99: 250,
        count: 1000
      },
      cache: {
        hit_rate: 0.75,
        size: this.cache.size
      }
    });
  }

  private async handleSearch(req: AuthenticatedRequest, res: Response) {
    const startTime = Date.now();
    const tenantId = req.tenantId!;
    
    try {
      const query = req.body;
      const results = this.performSearch(query, tenantId);
      
      results.performance.took_ms = Date.now() - startTime;
      (results as any).debug = {
        query_classification: this.classifyQuery(query),
        cache_key: `search:${tenantId}:${JSON.stringify(query)}`,
        tenant_routing: 'shared'
      };

      res.json(results);
    } catch (error) {
      res.status(500).json({
        error: {
          code: 'SEARCH_ERROR',
          message: error instanceof Error ? error.message : 'Internal error'
        }
      });
    }
  }

  private async handleSuggest(req: AuthenticatedRequest, res: Response) {
    const startTime = Date.now();
    const tenantId = req.tenantId!;
    
    try {
      const { prefix, limit = 10 } = req.body;
      const results = this.performSuggest(prefix, tenantId, limit);
      
      results.performance.took_ms = Date.now() - startTime;
      res.json(results);
    } catch (error) {
      res.status(500).json({
        error: {
          code: 'SUGGEST_ERROR',
          message: error instanceof Error ? error.message : 'Internal error'
        }
      });
    }
  }

  private async handleExplain(req: AuthenticatedRequest, res: Response) {
    const tenantId = req.tenantId!;
    const query = req.body;
    
    const classification = this.classifyQuery(query);
    
    res.json({
      classification,
      routing: {
        engine: 'mock-engine',
        index: 'shared',
        reason: 'Mock implementation for demonstration'
      },
      estimated_cost: {
        complexity_score: this.calculateComplexity(query),
        expected_latency_ms: this.calculateComplexity(query) * 20 + 30
      },
      cache_strategy: {
        cacheable: classification !== 'complex',
        key: `search:${tenantId}:${JSON.stringify(query)}`,
        ttl_seconds: 300
      }
    });
  }

  private performSearch(query: any, tenantId: string) {
    const { q, filters = {}, page = { size: 20 } } = query;
    
    // Filter by tenant
    let results = this.mockData.filter(doc => doc.tenant_id === tenantId);
    
    // Apply text search
    if (q && q.trim()) {
      const searchQuery = q.trim().toLowerCase();
      results = results.filter(doc => 
        doc.title.toLowerCase().includes(searchQuery) || 
        doc.body.toLowerCase().includes(searchQuery)
      );
    }
    
    // Apply filters
    for (const [field, value] of Object.entries(filters)) {
      if (Array.isArray(value)) {
        results = results.filter(doc => value.includes((doc as any)[field]));
      } else {
        results = results.filter(doc => (doc as any)[field] === value);
      }
    }
    
    // Pagination
    const size = Math.min(page.size || 20, 100);
    const paginatedResults = results.slice(0, size);
    
    return {
      hits: paginatedResults.map(doc => ({
        id: doc.id,
        source: doc,
        score: 1.0
      })),
      total: {
        value: results.length,
        relation: 'eq'
      },
      page: {
        size: size,
        has_more: results.length > size
      },
      performance: {
        took_ms: 0, // Will be set by caller
        engine: 'mock',
        cached: false,
        partial: false
      }
    };
  }

  private performSuggest(prefix: string, tenantId: string, limit: number) {
    const query = prefix.toLowerCase();
    
    const suggestions = this.mockData
      .filter(doc => doc.tenant_id === tenantId)
      .filter(doc => doc.title.toLowerCase().startsWith(query))
      .slice(0, limit)
      .map(doc => ({
        text: doc.title,
        score: 0.9,
        context: {
          entity: doc.entity,
          id: doc.id
        }
      }));
    
    return {
      suggestions,
      performance: {
        took_ms: 0, // Will be set by caller
        cached: false
      }
    };
  }

  private classifyQuery(query: any): string {
    const hasFullText = query.q && query.q.trim();
    const filterCount = Object.keys(query.filters || {}).length;
    const hasComplexFeatures = query.options?.highlight || query.options?.suggest;
    
    if (hasFullText && filterCount > 2) {
      return 'hybrid';
    } else if (hasFullText || hasComplexFeatures) {
      return 'complex';
    }
    
    return 'simple';
  }

  private calculateComplexity(query: any): number {
    const hasFullText = query.q && query.q.trim();
    const filterCount = Object.keys(query.filters || {}).length;
    const hasComplexFeatures = query.options?.highlight || query.options?.suggest;
    
    return filterCount + (hasFullText ? 2 : 0) + (hasComplexFeatures ? 1 : 0);
  }

  private errorHandler(error: Error, req: Request, res: Response, next: NextFunction) {
    console.error('Search platform error:', error);
    
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred'
      }
    });
  }

  public async start(): Promise<void> {
    return new Promise((resolve) => {
      const server = this.app.listen(this.config.port || 3000, this.config.host || '0.0.0.0', () => {
        console.log(`🚀 Search Platform started on http://${this.config.host}:${this.config.port}`);
        resolve();
      });

      // Graceful shutdown
      process.on('SIGINT', () => {
        console.log('\n⚠️  Shutting down gracefully...');
        server.close(() => {
          console.log('✅ Server closed');
          process.exit(0);
        });
      });
    });
  }

  public getApp(): Express {
    return this.app;
  }
}