/**
 * Factory functions for creating search platform components
 */

import { SearchPlatform, SearchPlatformConfig } from './search-platform';
import { SearchClient, SearchClientConfig } from './client';

/**
 * Create a new SearchPlatform instance
 */
export function createSearchPlatform(config?: SearchPlatformConfig): SearchPlatform {
  return new SearchPlatform(config);
}

/**
 * Create a new SearchClient instance
 */
export function createSearchClient(config: SearchClientConfig): SearchClient {
  return new SearchClient(config);
}

/**
 * Create search platform with recommended production settings
 */
export function createProductionSearchPlatform(config: Partial<SearchPlatformConfig> = {}): SearchPlatform {
  const productionConfig: SearchPlatformConfig = {
    port: parseInt(process.env.PORT || '3000'),
    host: process.env.HOST || '0.0.0.0',
    corsOrigins: process.env.CORS_ORIGINS?.split(',') || ['*'],
    enableLogging: process.env.NODE_ENV !== 'test',
    enableMetrics: true,
    engines: {
      mock: process.env.NODE_ENV === 'development',
      opensearch: process.env.OPENSEARCH_URL ? {
        node: process.env.OPENSEARCH_URL,
        auth: process.env.OPENSEARCH_USERNAME ? {
          username: process.env.OPENSEARCH_USERNAME,
          password: process.env.OPENSEARCH_PASSWORD || ''
        } : undefined
      } : undefined,
      typesense: process.env.TYPESENSE_HOST ? {
        nodes: [{
          host: process.env.TYPESENSE_HOST,
          port: parseInt(process.env.TYPESENSE_PORT || '8108'),
          protocol: process.env.TYPESENSE_PROTOCOL || 'http'
        }],
        apiKey: process.env.TYPESENSE_API_KEY || ''
      } : undefined,
      redis: process.env.REDIS_HOST ? {
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD
      } : undefined
    },
    cache: {
      l1MaxSize: parseInt(process.env.CACHE_L1_MAX_SIZE || '10000'),
      l1TtlMs: parseInt(process.env.CACHE_L1_TTL_MS || '300000'),
      l2Enabled: process.env.CACHE_L2_ENABLED === 'true'
    },
    ...config
  };

  return new SearchPlatform(productionConfig);
}

/**
 * Create search client with environment-based configuration
 */
export function createEnvironmentSearchClient(overrides: Partial<SearchClientConfig> = {}): SearchClient {
  const config: SearchClientConfig = {
    baseUrl: process.env.SEARCH_SERVICE_URL || 'http://localhost:3000',
    timeout: parseInt(process.env.SEARCH_TIMEOUT || '5000'),
    apiKey: process.env.SEARCH_API_KEY,
    retryAttempts: parseInt(process.env.SEARCH_RETRY_ATTEMPTS || '3'),
    ...overrides
  };

  return new SearchClient(config);
}

/**
 * Create production configuration object
 */
export function createProductionConfig(): SearchPlatformConfig {
  return {
    port: parseInt(process.env.PORT || '3000'),
    host: process.env.HOST || '0.0.0.0',
    corsOrigins: process.env.CORS_ORIGINS?.split(',') || ['*'],
    enableLogging: process.env.NODE_ENV !== 'test',
    enableMetrics: true,
    engines: {
      mock: process.env.NODE_ENV === 'development',
      opensearch: process.env.OPENSEARCH_URL ? {
        node: process.env.OPENSEARCH_URL,
        auth: process.env.OPENSEARCH_USERNAME ? {
          username: process.env.OPENSEARCH_USERNAME,
          password: process.env.OPENSEARCH_PASSWORD || ''
        } : undefined
      } : undefined,
      typesense: process.env.TYPESENSE_HOST ? {
        nodes: [{
          host: process.env.TYPESENSE_HOST,
          port: parseInt(process.env.TYPESENSE_PORT || '8108'),
          protocol: process.env.TYPESENSE_PROTOCOL || 'http'
        }],
        apiKey: process.env.TYPESENSE_API_KEY || ''
      } : undefined,
      redis: process.env.REDIS_HOST ? {
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD
      } : undefined
    },
    cache: {
      l1MaxSize: parseInt(process.env.CACHE_L1_MAX_SIZE || '10000'),
      l1TtlMs: parseInt(process.env.CACHE_L1_TTL_MS || '300000'),
      l2Enabled: process.env.CACHE_L2_ENABLED === 'true'
    }
  };
}