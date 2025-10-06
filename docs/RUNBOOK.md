# Search Platform Runbook

## Overview
This runbook covers operational procedures for the multi-tenant search platform, including scaling, reindexing, disaster recovery, and troubleshooting.

## Architecture Summary
- **Query Router**: Node.js service routing requests to optimal engines
- **Simple Engine**: Typesense for fast key-value lookups (≤100ms P50)
- **Complex Engine**: OpenSearch for full-text and faceted queries (≤300ms P50)
- **Caching**: L1 (in-memory) + L2 (Redis optional)
- **Data Sync**: Kafka CDC + periodic reconciliation

## 🚀 Scaling Operations

### Horizontal Scaling

#### Query Router
```bash
# Scale router pods based on load
kubectl scale deployment search-router --replicas=10 -n search-system

# Monitor HPA status
kubectl get hpa search-router-hpa -n search-system

# Check resource utilization
kubectl top pods -n search-system -l app=search-router
```

#### Search Engines
```bash
# Scale Typesense replicas
kubectl scale deployment typesense --replicas=4 -n search-system

# OpenSearch scaling requires StatefulSet update
kubectl patch statefulset opensearch-cluster -n search-system -p '{"spec":{"replicas":5}}'

# Verify cluster health after scaling
kubectl exec -it opensearch-cluster-0 -n search-system -- curl -s "localhost:9200/_cluster/health"
```

### Vertical Scaling

#### Update Resource Limits
```bash
# Edit deployment with new resource requests/limits
kubectl edit deployment search-router -n search-system

# Example resource update:
spec:
  template:
    spec:
      containers:
      - name: search-router
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "2Gi"
            cpu: "2000m"
```

### Auto-scaling Configuration

#### Tune HPA Parameters
```yaml
# search-router-hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: search-router-hpa
spec:
  minReplicas: 5        # Increase baseline
  maxReplicas: 50       # Increase ceiling
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 60  # Lower threshold for faster scaling
```

## 🔄 Reindexing Operations

### Full Reindex Process

#### 1. Pre-reindex Health Check
```bash
# Check cluster health
kubectl exec -it opensearch-cluster-0 -n search-system -- \
  curl -s "localhost:9200/_cluster/health?pretty"

# Check available disk space (should be >30% free)
kubectl exec -it opensearch-cluster-0 -n search-system -- df -h

# Check current index sizes
kubectl exec -it opensearch-cluster-0 -n search-system -- \
  curl -s "localhost:9200/_cat/indices?v&s=store.size:desc"
```

#### 2. Create New Index
```bash
# Create new index with timestamp
NEW_INDEX="search-docs-shared-$(date +%Y%m%d_%H%M%S)"

kubectl exec -it opensearch-cluster-0 -n search-system -- \
  curl -X PUT "localhost:9200/${NEW_INDEX}" \
  -H 'Content-Type: application/json' \
  -d @/path/to/opensearch-mapping.json
```

#### 3. Execute Reindex
```bash
# Trigger reindex via API
curl -X POST "${SEARCH_API_URL}/admin/reindex" \
  -H "Authorization: Bearer ${ADMIN_JWT}" \
  -H "Content-Type: application/json" \
  -d '{
    "full": true,
    "target_index": "'${NEW_INDEX}'"
  }'

# Monitor reindex progress
kubectl logs -f deployment/search-sync -n search-system
```

#### 4. Validate New Index
```bash
# Compare document counts
OLD_COUNT=$(kubectl exec -it opensearch-cluster-0 -n search-system -- \
  curl -s "localhost:9200/search-docs-shared/_count" | jq .count)

NEW_COUNT=$(kubectl exec -it opensearch-cluster-0 -n search-system -- \
  curl -s "localhost:9200/${NEW_INDEX}/_count" | jq .count)

echo "Old index: ${OLD_COUNT}, New index: ${NEW_COUNT}"

# Test search functionality
curl -X POST "${SEARCH_API_URL}/search" \
  -H "X-Tenant-ID: test-tenant" \
  -H "Content-Type: application/json" \
  -d '{"q": "test query", "page": {"size": 5}}'
```

#### 5. Switch Alias
```bash
# Update alias to point to new index
kubectl exec -it opensearch-cluster-0 -n search-system -- \
  curl -X POST "localhost:9200/_aliases" \
  -H 'Content-Type: application/json' \
  -d '{
    "actions": [
      {"remove": {"index": "search-docs-shared", "alias": "search-docs-active"}},
      {"add": {"index": "'${NEW_INDEX}'", "alias": "search-docs-active"}}
    ]
  }'

# Update application configuration to use new index
kubectl set env deployment/search-router INDEX_NAME=${NEW_INDEX} -n search-system
```

#### 6. Cleanup Old Index
```bash
# Wait 24 hours, then delete old index
kubectl exec -it opensearch-cluster-0 -n search-system -- \
  curl -X DELETE "localhost:9200/search-docs-shared"
```

### Incremental Reindex
```bash
# Reindex only specific tenants or date ranges
curl -X POST "${SEARCH_API_URL}/admin/reindex" \
  -H "Authorization: Bearer ${ADMIN_JWT}" \
  -d '{
    "full": false,
    "filters": {
      "tenant_ids": ["uuid1", "uuid2"],
      "date_range": {
        "field": "dates.updated_at",
        "gte": "2024-01-01"
      }
    }
  }'
```

## 🏥 Disaster Recovery

### Backup Procedures

#### OpenSearch Snapshots
```bash
# Register snapshot repository
kubectl exec -it opensearch-cluster-0 -n search-system -- \
  curl -X PUT "localhost:9200/_snapshot/backup_repo" \
  -H 'Content-Type: application/json' \
  -d '{
    "type": "s3",
    "settings": {
      "bucket": "search-backups",
      "region": "us-west-2",
      "base_path": "opensearch-snapshots"
    }
  }'

# Create snapshot
kubectl exec -it opensearch-cluster-0 -n search-system -- \
  curl -X PUT "localhost:9200/_snapshot/backup_repo/snapshot_$(date +%Y%m%d_%H%M%S)" \
  -H 'Content-Type: application/json' \
  -d '{
    "indices": "search-docs-*",
    "ignore_unavailable": true,
    "include_global_state": false
  }'
```

#### Database Backups
```bash
# Backup source database (example for PostgreSQL)
kubectl exec -it postgres-0 -n database -- \
  pg_dump -U postgres -d production > backup_$(date +%Y%m%d).sql

# Upload to S3
aws s3 cp backup_$(date +%Y%m%d).sql s3://search-backups/database/
```

### Recovery Procedures

#### Restore from Snapshot
```bash
# List available snapshots
kubectl exec -it opensearch-cluster-0 -n search-system -- \
  curl -s "localhost:9200/_snapshot/backup_repo/_all?pretty"

# Restore specific snapshot
SNAPSHOT_NAME="snapshot_20241201_120000"
kubectl exec -it opensearch-cluster-0 -n search-system -- \
  curl -X POST "localhost:9200/_snapshot/backup_repo/${SNAPSHOT_NAME}/_restore" \
  -H 'Content-Type: application/json' \
  -d '{
    "indices": "search-docs-*",
    "ignore_unavailable": true,
    "include_global_state": false,
    "rename_pattern": "search-docs-(.+)",
    "rename_replacement": "restored-search-docs-$1"
  }'
```

#### Cluster Recovery
```bash
# Check cluster status
kubectl exec -it opensearch-cluster-0 -n search-system -- \
  curl -s "localhost:9200/_cluster/health?pretty"

# Force cluster recovery if needed
kubectl exec -it opensearch-cluster-0 -n search-system -- \
  curl -X POST "localhost:9200/_cluster/reroute?pretty" \
  -H 'Content-Type: application/json' \
  -d '{
    "commands": [
      {
        "allocate_empty_primary": {
          "index": "search-docs-shared",
          "shard": 0,
          "node": "opensearch-cluster-0",
          "accept_data_loss": true
        }
      }
    ]
  }'
```

## 🔧 Troubleshooting

### High Latency Issues

#### 1. Check Query Performance
```bash
# Enable slow query logging
kubectl exec -it opensearch-cluster-0 -n search-system -- \
  curl -X PUT "localhost:9200/_cluster/settings" \
  -H 'Content-Type: application/json' \
  -d '{
    "transient": {
      "logger.org.opensearch.index.search.slowlog.query": "debug",
      "logger.org.opensearch.index.search.slowlog.fetch": "debug"
    }
  }'

# Check slow queries
kubectl logs opensearch-cluster-0 -n search-system | grep "took_millis"
```

#### 2. Analyze Cache Performance
```bash
# Check cache hit rates
curl -s "${SEARCH_API_URL}/metrics" | grep cache_hit_rate

# Monitor Redis performance
kubectl exec -it redis-0 -n search-system -- redis-cli info stats
```

#### 3. Resource Utilization
```bash
# Check CPU/Memory usage
kubectl top pods -n search-system

# Check JVM heap usage (OpenSearch)
kubectl exec -it opensearch-cluster-0 -n search-system -- \
  curl -s "localhost:9200/_nodes/stats/jvm?pretty"
```

### High Error Rates

#### 1. Check Application Logs
```bash
# Search router logs
kubectl logs -f deployment/search-router -n search-system

# OpenSearch logs
kubectl logs -f opensearch-cluster-0 -n search-system

# Typesense logs
kubectl logs -f deployment/typesense -n search-system
```

#### 2. Check Resource Limits
```bash
# Check for OOMKilled pods
kubectl get pods -n search-system -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.status.containerStatuses[0].lastState.terminated.reason}{"\n"}{end}'

# Check resource quotas
kubectl describe resourcequota -n search-system
```

### Data Sync Issues

#### 1. Monitor Kafka Consumer Lag
```bash
# Check consumer group lag
kubectl exec -it kafka-0 -n kafka -- \
  kafka-consumer-groups.sh --bootstrap-server localhost:9092 \
  --group search-sync --describe
```

#### 2. Check Sync Service Health
```bash
# Sync service logs
kubectl logs -f deployment/search-sync -n search-system

# Check CDC connector status
curl -s "http://kafka-connect:8083/connectors/search-cdc/status"
```

## 🔍 Monitoring and Alerts

### Key Metrics Dashboard
```bash
# Import Grafana dashboard
kubectl apply -f monitoring/grafana-dashboard.json

# Access Grafana
kubectl port-forward svc/grafana 3000:3000 -n monitoring-system
```

### Alert Rules
```yaml
# prometheus-alerts.yaml
groups:
- name: search-platform
  rules:
  - alert: SearchLatencyHigh
    expr: histogram_quantile(0.95, search_request_duration_seconds) > 0.8
    for: 5m
    labels:
      severity: warning
    annotations:
      summary: "Search P95 latency above SLO"
      
  - alert: SearchErrorRateHigh
    expr: rate(search_request_errors_total[5m]) > 0.05
    for: 2m
    labels:
      severity: critical
    annotations:
      summary: "Search error rate above 5%"
```

## 📋 Maintenance Checklist

### Weekly Tasks
- [ ] Review slow query logs
- [ ] Check cluster health and resource utilization
- [ ] Validate backup integrity
- [ ] Review capacity planning metrics
- [ ] Update dependency vulnerabilities

### Monthly Tasks
- [ ] Performance regression testing
- [ ] Review and tune cache strategies
- [ ] Analyze query patterns for optimization
- [ ] Update disaster recovery procedures
- [ ] Capacity planning review

### Quarterly Tasks
- [ ] Full disaster recovery drill
- [ ] Security vulnerability assessment
- [ ] Performance benchmark against SLOs
- [ ] Review and update scaling policies

## 🚨 Emergency Contacts

| Role | Contact | Escalation Path |
|------|---------|----------------|
| Platform Team Lead | platform-lead@company.com | CTO |
| Search Infrastructure | search-infra@company.com | VP Engineering |
| On-call Engineer | oncall@company.com | Platform Team Lead |
| Database Team | database@company.com | Platform Team Lead |

## 📚 Additional Resources

- [Search Platform Architecture](./docs/architecture.md)
- [API Documentation](./api/openapi.yaml)
- [Performance Tuning Guide](./docs/performance.md)
- [Multi-tenancy Best Practices](./docs/multi-tenancy.md)
- [Monitoring Playbook](./docs/monitoring.md)