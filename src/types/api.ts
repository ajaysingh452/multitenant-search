// API Request/Response Types

export interface SearchRequest {
  tenant_id?: string; // Injected by router
  q?: string | null;
  filters?: Record<string, any>;
  sort?: SortField[];
  select?: string[];
  page?: PageRequest;
  options?: SearchOptions;
  authz?: AuthzContext;
}

export interface SortField {
  field: string;
  order: 'asc' | 'desc';
}

export interface PageRequest {
  size?: number;
  cursor?: string | null;
}

export interface SearchOptions {
  highlight?: boolean;
  suggest?: boolean;
  timeout_ms?: number;
  strict?: boolean;
}

export interface AuthzContext {
  user_id: string;
  roles: string[];
  scopes: string[];
}

export interface SearchResponse {
  hits: SearchHit[];
  total: {
    value: number;
    relation: 'eq' | 'gte';
  };
  page: {
    size: number;
    cursor?: string | null;
    has_more: boolean;
  };
  facets?: Record<string, FacetResult>;
  suggestions?: string[];
  performance: PerformanceInfo;
  debug?: DebugInfo;
  error?: ErrorInfo;
}

export interface SearchHit {
  id: string;
  source: Record<string, any>;
  score?: number | null;
  highlight?: Record<string, string[]>;
}

export interface FacetResult {
  buckets: FacetBucket[];
}

export interface FacetBucket {
  key: string;
  count: number;
}

export interface PerformanceInfo {
  took_ms: number;
  engine: string;
  cached: boolean;
  partial: boolean;
}

export interface DebugInfo {
  query_classification: string;
  cache_key: string;
  tenant_routing: string;
}

export interface ErrorInfo {
  code: string;
  message: string;
  details?: Record<string, any>;
}

export interface SuggestRequest {
  tenant_id?: string;
  prefix: string;
  entity?: string[];
  limit?: number;
}

export interface SuggestResponse {
  suggestions: SuggestionItem[];
  performance: PerformanceInfo;
}

export interface SuggestionItem {
  text: string;
  score: number;
  context?: {
    entity: string;
    id: string;
  };
}

export interface ExplainResponse {
  classification: string;
  routing: {
    engine: string;
    index: string;
    reason: string;
  };
  estimated_cost: {
    complexity_score: number;
    expected_latency_ms: number;
  };
  cache_strategy: {
    cacheable: boolean;
    key: string;
    ttl_seconds: number;
  };
}

export interface ReindexRequest {
  entities?: string[];
  full?: boolean;
}

export interface ReindexResponse {
  job_id: string;
  status: 'started' | 'queued';
  estimated_duration_minutes: number;
}

// Internal document structure
export interface SearchDocument {
  tenant_id: string;
  id: string;
  entity: string;
  title: string;
  body?: string;
  keywords?: string[];
  status: string;
  tags?: string[];
  numeric?: {
    amount?: number;
    score?: number;
    priority?: number;
  };
  dates: {
    created_at: string;
    updated_at: string;
    due_date?: string;
  };
  facets?: {
    region?: string;
    category?: string;
    department?: string;
    tier?: string;
  };
  joins_denorm?: {
    customer_name?: string;
    account_tier?: string;
    owner_email?: string;
    parent_account?: string;
  };
  _acl: {
    owner: string;
    roles: string[];
    groups?: string[];
  };
}

// Configuration types
export interface EngineConfig {
  opensearch: {
    node: string;
    auth?: {
      username: string;
      password: string;
    };
    ssl?: {
      rejectUnauthorized: boolean;
    };
  };
  typesense: {
    nodes: Array<{
      host: string;
      port: number;
      protocol: string;
    }>;
    apiKey: string;
    connectionTimeoutSeconds: number;
  };
  redis?: {
    host: string;
    port: number;
    password?: string;
    db: number;
  };
}

export interface TenantConfig {
  tenant_id: string;
  index_strategy: 'shared' | 'dedicated';
  shard_count?: number;
  replica_count?: number;
  refresh_interval?: string;
  max_result_window?: number;
}

// Metrics types
export interface SearchMetrics {
  tenant_id: string;
  query_type: string;
  latency_ms: number;
  result_count: number;
  cache_hit: boolean;
  timestamp: Date;
  error?: string;
}