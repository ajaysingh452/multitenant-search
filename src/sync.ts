/**
 * DataSyncService - Service for synchronizing data with the search platform
 */

export interface DataSyncConfig {
  enabled?: boolean;
  batchSize?: number;
  retryAttempts?: number;
  transformDocument?: (data: any, tenantId: string) => any;
}

export class DataSyncService {
  private enabled: boolean;
  private batchSize: number;
  private retryAttempts: number;
  private transformDocument: (data: any, tenantId: string) => any;

  constructor(config: DataSyncConfig = {}) {
    this.enabled = config.enabled !== false;
    this.batchSize = config.batchSize || 100;
    this.retryAttempts = config.retryAttempts || 3;
    this.transformDocument = config.transformDocument || this.defaultTransform;
  }

  /**
   * Sync a single document
   */
  async syncDocument(data: any, tenantId: string, operation: 'create' | 'update' | 'delete' = 'create'): Promise<void> {
    if (!this.enabled) return;

    await this.performSync([data], tenantId, operation);
  }

  /**
   * Sync multiple documents in batch
   */
  async syncDocuments(documents: any[], tenantId: string, operation: 'create' | 'update' | 'delete' = 'create'): Promise<void> {
    if (!this.enabled) return;

    // Process in batches
    for (let i = 0; i < documents.length; i += this.batchSize) {
      const batch = documents.slice(i, i + this.batchSize);
      await this.performSync(batch, tenantId, operation);
    }
  }

  /**
   * Sync all data for a tenant (full reindex)
   */
  async syncAllForTenant(tenantId: string, dataProvider: () => Promise<any[]>): Promise<void> {
    if (!this.enabled) return;

    console.log(`[DataSyncService] Starting full sync for tenant: ${tenantId}`);
    
    try {
      const allData = await dataProvider();
      await this.syncDocuments(allData, tenantId, 'create');
      
      console.log(`[DataSyncService] Completed sync for tenant ${tenantId}: ${allData.length} documents`);
    } catch (error) {
      console.error(`[DataSyncService] Failed to sync tenant ${tenantId}:`, error);
      throw error;
    }
  }

  private async performSync(documents: any[], tenantId: string, operation: string): Promise<void> {
    let attempts = 0;
    
    while (attempts < this.retryAttempts) {
      try {
        const transformedDocs = documents.map(doc => this.transformDocument(doc, tenantId));
        
        // Log the sync operation (future implementation would call search platform API)
        console.log(`[DataSyncService] ${operation.toUpperCase()} batch:`, {
          tenant_id: tenantId,
          count: transformedDocs.length,
          operation
        });

        // Simulate processing time
        await new Promise(resolve => setTimeout(resolve, 10));

        return; // Success
      } catch (error) {
        attempts++;
        console.error(`[DataSyncService] Sync attempt ${attempts} failed:`, (error as Error).message);
        
        if (attempts >= this.retryAttempts) {
          console.error(`[DataSyncService] Failed to sync after ${this.retryAttempts} attempts`);
          throw error;
        }
        
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempts) * 1000));
      }
    }
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
      updated_at: data.updated_at || data.updatedAt || new Date().toISOString(),
      keywords: data.tags || data.keywords || [],
      numeric: {
        amount: data.amount || data.value,
        priority: data.priority
      },
      facets: {
        category: data.category,
        department: data.department,
        region: data.region
      }
    };
  }
}