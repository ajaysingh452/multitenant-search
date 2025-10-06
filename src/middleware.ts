/**
 * SearchMiddleware - Express.js middleware for automatic search integration
 */

import { Request, Response, NextFunction } from 'express';
import { SearchClient, SearchClientConfig } from './client';

export interface SearchMiddlewareConfig {
  searchServiceUrl?: string;
  searchClient?: SearchClientConfig;
  enabled?: boolean;
  asyncSync?: boolean;
  retryAttempts?: number;
  transformDocument?: (data: any, tenantId: string) => any;
}

interface AuthenticatedRequest extends Request {
  tenantId?: string;
  user?: { tenantId: string; [key: string]: any };
}

export class SearchMiddleware {
  private searchClient: SearchClient;
  private enabled: boolean;
  private asyncSync: boolean;
  private retryAttempts: number;
  private transformDocument: (data: any, tenantId: string) => any;

  constructor(config: SearchMiddlewareConfig) {
    const clientConfig = config.searchClient || {
      baseUrl: config.searchServiceUrl || 'http://localhost:3000',
      timeout: 5000
    };
    this.searchClient = new SearchClient(clientConfig);
    this.enabled = config.enabled !== false;
    this.asyncSync = config.asyncSync !== false;
    this.retryAttempts = config.retryAttempts || 3;
    this.transformDocument = config.transformDocument || this.defaultTransform;
  }

  /**
   * Express middleware for create operations
   */
  syncOnCreate() {
    return this.createSyncMiddleware('create', 201);
  }

  /**
   * Express middleware for update operations
   */
  syncOnUpdate() {
    return this.createSyncMiddleware('update', 200);
  }

  /**
   * Express middleware for delete operations
   */
  syncOnDelete() {
    return this.createSyncMiddleware('delete', 200);
  }

  /**
   * Search integration middleware
   */
  search() {
    return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const tenantId = this.extractTenantId(req);
        const results = await this.searchClient.search(req.body, tenantId);
        
        res.json({
          success: true,
          data: results.hits.map(hit => hit.source),
          pagination: {
            total: results.total.value,
            size: results.page.size,
            has_more: results.page.has_more
          },
          meta: {
            took_ms: results.performance.took_ms,
            cached: results.performance.cached,
            query_type: results.debug?.query_classification
          }
        });
      } catch (error) {
        next(error);
      }
    };
  }

  /**
   * Autocomplete middleware
   */
  autocomplete() {
    return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const tenantId = this.extractTenantId(req);
        const { q, limit = 5 } = req.query;
        
        if (!q || (q as string).length < 2) {
          return res.json({ suggestions: [] });
        }

        const results = await this.searchClient.suggest(
          q as string, 
          tenantId, 
          parseInt(limit as string) || 5
        );
        
        res.json({
          success: true,
          suggestions: results.suggestions
        });
      } catch (error) {
        next(error);
      }
    };
  }

  /**
   * Health check middleware that includes search platform status
   */
  healthCheck() {
    return async (req: Request, res: Response, next: NextFunction) => {
      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
          api: { status: 'healthy' }
        }
      };

      try {
        const searchHealth = await this.searchClient.health();
        (health.services as any).search = searchHealth;
      } catch (error) {
        (health.services as any).search = { 
          status: 'unhealthy', 
          error: (error as Error).message 
        };
        (health as any).status = 'degraded';
      }

      const statusCode = health.status === 'healthy' ? 200 : 503;
      res.status(statusCode).json(health);
    };
  }

  /**
   * Manual sync method for batch operations
   */
  async syncDocuments(documents: any[], tenantId: string, operation: string = 'create'): Promise<void> {
    if (!this.enabled) return;

    for (const doc of documents) {
      await this.syncDocument(doc, tenantId, operation);
    }
  }

  private createSyncMiddleware(operation: string, successStatusCode: number) {
    const self = this;
    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!self.enabled) return next();

      const originalSend = res.send;
      res.send = function(this: Response, data: any) {
        // Call original send first
        originalSend.call(this, data);

        // Then sync to search if successful
        if (this.statusCode === successStatusCode) {
          const tenantId = req.user?.tenantId || req.tenantId;
          if (tenantId) {
            const syncData = operation === 'delete' 
              ? { id: req.params?.id } 
              : req.body;
            
            // Fire and forget sync
            setImmediate(() => {
              self.syncDocument(syncData, tenantId, operation).catch((error: any) => {
                console.error(`[SearchMiddleware] Sync failed:`, error);
              });
            });
          }
        }

        return data;
      };

      next();
    };
  }

  private async syncDocument(data: any, tenantId: string, operation: string): Promise<void> {
    if (this.asyncSync) {
      setImmediate(() => this.performSync(data, tenantId, operation));
    } else {
      await this.performSync(data, tenantId, operation);
    }
  }

  private async performSync(data: any, tenantId: string, operation: string): Promise<void> {
    let attempts = 0;
    
    while (attempts < this.retryAttempts) {
      try {
        const searchDoc = this.transformDocument(data, tenantId);
        
        // Log the sync operation (future implementation would index to search platform)
        console.log(`[SearchMiddleware] ${operation.toUpperCase()} document:`, {
          tenant_id: tenantId,
          id: searchDoc.id,
          entity: searchDoc.entity
        });

        return; // Success
      } catch (error) {
        attempts++;
        console.error(`[SearchMiddleware] Sync attempt ${attempts} failed:`, (error as Error).message);
        
        if (attempts >= this.retryAttempts) {
          console.error(`[SearchMiddleware] Failed to sync after ${this.retryAttempts} attempts`);
          return;
        }
        
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempts) * 1000));
      }
    }
  }

  private extractTenantId(req: AuthenticatedRequest): string {
    const tenantId = req.user?.tenantId || req.tenantId || req.headers['x-tenant-id'] as string;
    
    if (!tenantId) {
      throw new Error('Tenant ID is required but not found in request');
    }
    
    return tenantId;
  }

  private defaultTransform(data: any, tenantId: string): any {
    return {
      tenant_id: tenantId,
      id: data.id || data._id,
      entity: data.type || data.entity || 'document',
      title: data.name || data.title || data.subject,
      body: data.description || data.content || data.body,
      status: data.status || 'active',
      created_at: data.created_at || data.createdAt || new Date().toISOString(),
      updated_at: data.updated_at || data.updatedAt || new Date().toISOString()
    };
  }
}