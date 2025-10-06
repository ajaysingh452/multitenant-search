/**
 * @apim/multitenant-search
 * 
 * Production-grade multi-tenant search platform package
 * Main entry point for the search platform
 */

export { SearchPlatform } from './search-platform';
export { SearchClient } from './client';
export { SearchMiddleware } from './middleware';
export { DataSyncService } from './sync';

// Utility exports
export { createSearchPlatform, createSearchClient, createProductionConfig } from './factory';

// Default export for convenience
export { SearchPlatform as default } from './search-platform';