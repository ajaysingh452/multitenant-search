# @apim/multitenant-search

Production-grade multi-tenant search platform for APIM projects. Add lightning-fast search to your Express.js applications with minimal configuration.

[![npm version](https://badge.fury.io/js/@apim%2Fmultitenant-search.svg)](https://www.npmjs.com/package/@apim/multitenant-search)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen.svg)](https://nodejs.org/)

## Features
- **Intelligent Query Routing**: Automatically classifies queries and routes to optimal engines
- **Multi-Tenant Isolation**: Secure tenant data separation with header-based routing  
- **Performance Optimized**: Sub-100ms latency with multi-level caching
- **Production Ready**: Health checks, metrics, error handling

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Server
```bash
npm start
```

The server will start on http://localhost:3000

### 3. Test the API
```bash
npm test
```

Or test manually:
```bash
# Basic search
curl -X POST http://localhost:3000/search \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: tenant-123" \
  -d '{"q":"acme"}'

# Filtered search  
curl -X POST http://localhost:3000/search \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: tenant-123" \
  -d '{"filters":{"status":"active"}}'

# Suggestions
curl -X POST http://localhost:3000/suggest \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: tenant-123" \
  -d '{"prefix":"acme","limit":5}'
                    │                          │
         ┌─────────────────────────────────────────────────┐
         │              Data Sync Layer                    │
         │  ┌─────────────┐  ┌─────────────┐  ┌──────────┐ │
         │  │ CDC Stream  │  │ Bulk Loader │  │ Reconcile│ │
         │  │ (Kafka)     │  │             │  │ Jobs     │ │
         │  └─────────────┘  └─────────────┘  └──────────┘ │
         └─────────────────────────────────────────────────┘
                              ▲
                    ┌─────────┴──────────┐
                    │   OLTP Database    │
                    │  (Postgres/MySQL)  │
                    └────────────────────┘
```

## Technology Stack & Justifications

### Core Components

**Query Router**: Node.js/TypeScript
- Justification: Excellent async I/O performance, mature ecosystem, fast development
- Alternatives: Go (better CPU performance), Java/Spring (JVM ecosystem)

**Simple Engine**: Typesense
- Justification: Sub-50ms queries, typo tolerance, easy ops, open-source
- Alternatives: Meilisearch (Rust-based), PostgreSQL with GIN indexes

**Complex Engine**: OpenSearch
- Justification: Full ES compatibility, Apache 2.0 license, strong faceting
- Alternatives: Elasticsearch (licensing concerns), Solr (complex ops)

**Caching**: Node.js LRU + Optional Redis
- Justification: Minimize network hops, graceful Redis failures
- Alternatives: Memcached (simpler), Hazelcast (distributed)

**Data Sync**: Kafka + Debezium CDC
- Justification: Reliable change capture, exactly-once semantics
- Alternatives: Database triggers, polling-based sync

## Implementation Plan (10-Step, 6-8 weeks)

1. **Project Setup & Core Router** (S - 3 days)
2. **Query Classification Logic** (M - 5 days)  
3. **Typesense Integration & Simple Queries** (M - 5 days)
4. **OpenSearch Integration & Complex Queries** (L - 8 days)
5. **Multi-tenant Index Strategy** (M - 5 days)
6. **Caching Layer (L1 + L2)** (M - 4 days)
7. **Data Sync Pipeline (CDC + Bulk)** (L - 10 days)
8. **Kubernetes Deployment & IaC** (M - 6 days)
9. **Observability & Monitoring** (M - 4 days)
10. **Load Testing & Performance Tuning** (L - 7 days)

**Total Effort**: ~57 person-days (8-9 weeks with 1 engineer, 6-7 weeks with 1.5 engineers)