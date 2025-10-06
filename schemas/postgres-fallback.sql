-- PostgreSQL schema for fallback simple queries (when Typesense unavailable)
-- Optimized for fast equality/prefix lookups with covering indexes

CREATE SCHEMA IF NOT EXISTS search_fallback;

-- Main document table with denormalized fields for fast access
CREATE TABLE search_fallback.documents (
  tenant_id UUID NOT NULL,
  id VARCHAR(255) NOT NULL,
  entity VARCHAR(50) NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  keywords TEXT[], -- Array of keywords
  status VARCHAR(50) NOT NULL,
  tags TEXT[], -- Array of tags
  
  -- Numeric fields stored as JSONB for flexibility
  numeric_amount DECIMAL(12,2),
  numeric_score REAL,
  numeric_priority INTEGER,
  
  -- Date fields
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  due_date TIMESTAMPTZ,
  
  -- Facet fields
  region VARCHAR(50),
  category VARCHAR(50),
  department VARCHAR(50),
  tier VARCHAR(50),
  
  -- Denormalized join fields for hot queries
  customer_name TEXT,
  account_tier VARCHAR(50),
  parent_account VARCHAR(255),
  
  -- ACL fields
  owner_id VARCHAR(255),
  acl_roles TEXT[],
  acl_groups TEXT[],
  
  -- Metadata
  indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  PRIMARY KEY (tenant_id, id)
);

-- Partition by tenant_id for large datasets
-- ALTER TABLE search_fallback.documents PARTITION BY HASH (tenant_id);

-- Indexes for common simple query patterns
-- Covering index for entity + status queries
CREATE INDEX CONCURRENTLY idx_docs_tenant_entity_status_covering 
ON search_fallback.documents (tenant_id, entity, status) 
INCLUDE (id, title, customer_name, created_at, updated_at);

-- Title prefix search with GIN
CREATE INDEX CONCURRENTLY idx_docs_title_gin 
ON search_fallback.documents USING gin (tenant_id, title gin_trgm_ops);

-- Fast customer name lookups
CREATE INDEX CONCURRENTLY idx_docs_customer_name 
ON search_fallback.documents (tenant_id, customer_name) 
WHERE customer_name IS NOT NULL;

-- Date range queries
CREATE INDEX CONCURRENTLY idx_docs_created_at 
ON search_fallback.documents (tenant_id, created_at DESC);

-- Composite index for common filter combinations
CREATE INDEX CONCURRENTLY idx_docs_entity_status_region 
ON search_fallback.documents (tenant_id, entity, status, region) 
INCLUDE (id, title, created_at);

-- Amount range queries
CREATE INDEX CONCURRENTLY idx_docs_amount_range 
ON search_fallback.documents (tenant_id, numeric_amount) 
WHERE numeric_amount IS NOT NULL;

-- ACL owner queries
CREATE INDEX CONCURRENTLY idx_docs_acl_owner 
ON search_fallback.documents (tenant_id, owner_id) 
WHERE owner_id IS NOT NULL;

-- Tags array search using GIN
CREATE INDEX CONCURRENTLY idx_docs_tags_gin 
ON search_fallback.documents USING gin (tenant_id, tags);

-- Keywords array search using GIN  
CREATE INDEX CONCURRENTLY idx_docs_keywords_gin 
ON search_fallback.documents USING gin (tenant_id, keywords);

-- Enable pg_trgm extension for fuzzy text search
-- CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Statistics table for query optimization
CREATE TABLE search_fallback.query_stats (
  tenant_id UUID NOT NULL,
  query_pattern VARCHAR(500) NOT NULL,
  execution_count BIGINT NOT NULL DEFAULT 1,
  avg_duration_ms REAL NOT NULL,
  last_executed TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, query_pattern)
);

-- Index on query stats for hot query identification
CREATE INDEX idx_query_stats_hot 
ON search_fallback.query_stats (tenant_id, execution_count DESC, avg_duration_ms);

-- Tenant metadata for index strategy decisions
CREATE TABLE search_fallback.tenant_metadata (
  tenant_id UUID PRIMARY KEY,
  document_count BIGINT NOT NULL DEFAULT 0,
  index_strategy VARCHAR(20) NOT NULL DEFAULT 'shared', -- 'shared' or 'dedicated'
  qps_avg REAL DEFAULT 0,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- View for simple query performance monitoring
CREATE VIEW search_fallback.v_tenant_performance AS
SELECT 
  tm.tenant_id,
  tm.document_count,
  tm.index_strategy,
  tm.qps_avg,
  COUNT(qs.query_pattern) as unique_query_patterns,
  AVG(qs.avg_duration_ms) as avg_query_duration_ms,
  SUM(qs.execution_count) as total_queries
FROM search_fallback.tenant_metadata tm
LEFT JOIN search_fallback.query_stats qs ON tm.tenant_id = qs.tenant_id
GROUP BY tm.tenant_id, tm.document_count, tm.index_strategy, tm.qps_avg;

-- Function to update tenant document count
CREATE OR REPLACE FUNCTION search_fallback.update_tenant_doc_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO search_fallback.tenant_metadata (tenant_id, document_count)
    VALUES (NEW.tenant_id, 1)
    ON CONFLICT (tenant_id) 
    DO UPDATE SET 
      document_count = tenant_metadata.document_count + 1,
      last_updated = NOW();
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE search_fallback.tenant_metadata
    SET document_count = GREATEST(0, document_count - 1),
        last_updated = NOW()
    WHERE tenant_id = OLD.tenant_id;
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger to maintain document counts
CREATE TRIGGER trigger_update_tenant_doc_count
  AFTER INSERT OR DELETE ON search_fallback.documents
  FOR EACH ROW EXECUTE FUNCTION search_fallback.update_tenant_doc_count();

-- Example queries for testing performance
/*
-- Simple entity + status lookup (should use covering index)
EXPLAIN (ANALYZE, BUFFERS) 
SELECT id, title, customer_name, created_at 
FROM search_fallback.documents 
WHERE tenant_id = 'tenant-uuid' 
  AND entity = 'customer' 
  AND status = 'active'
ORDER BY created_at DESC 
LIMIT 20;

-- Title prefix search (should use GIN trigram)
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, title, entity, created_at 
FROM search_fallback.documents 
WHERE tenant_id = 'tenant-uuid' 
  AND title ILIKE 'Acme Corp%'
ORDER BY created_at DESC 
LIMIT 10;

-- Customer name exact match
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, title, entity, status 
FROM search_fallback.documents 
WHERE tenant_id = 'tenant-uuid' 
  AND customer_name = 'Acme Corporation'
ORDER BY created_at DESC;
*/