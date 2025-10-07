# Visual Architecture Diagrams

## 🎯 High-Level System Overview

```
                         @ajay.inpis/multitenant-search Architecture
    ┌─────────────────────────────────────────────────────────────────────────────────┐
    │                              CLIENT LAYER                                       │
    │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐   │
    │  │   Web App   │  │   Mobile    │  │ API Gateway │  │   Microservices     │   │
    │  │  (React)    │  │   (React    │  │   (Kong)    │  │   (Express.js)      │   │
    │  │             │  │   Native)   │  │             │  │                     │   │
    │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────────┘   │
    └─────────────────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
    ┌─────────────────────────────────────────────────────────────────────────────────┐
    │                          NPM PACKAGE LAYER                                     │
    │  ┌─────────────────────────┐              ┌─────────────────────────────────┐   │
    │  │   SearchMiddleware      │              │         SearchClient            │   │
    │  │  ┌─────────────────────┐│              │ ┌─────────────────────────────┐ │   │
    │  │  │ • syncOnCreate()    ││              │ │ • search()                  │ │   │
    │  │  │ • syncOnUpdate()    ││              │ │ • suggest()                 │ │   │
    │  │  │ • syncOnDelete()    ││              │ │ • health()                  │ │   │
    │  │  │ • search()          ││              │ │ • explain()                 │ │   │
    │  │  │ • autocomplete()    ││              │ │ • metrics()                 │ │   │
    │  │  └─────────────────────┘│              │ └─────────────────────────────┘ │   │
    │  └─────────────────────────┘              └─────────────────────────────────┘   │
    └─────────────────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
    ┌─────────────────────────────────────────────────────────────────────────────────┐
    │                         SEARCH PLATFORM CORE                                   │
    │                          (Express Server :3000)                                │
    │  ┌─────────────────────────────────────────────────────────────────────────┐   │
    │  │                    TENANT ROUTER                                        │   │
    │  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │   │
    │  │  │   Tenant A  │  │   Tenant B  │  │   Tenant C  │  │     ...     │    │   │
    │  │  │   (acme)    │  │   (beta)    │  │  (gamma)    │  │             │    │   │
    │  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │   │
    │  └─────────────────────────────────────────────────────────────────────────┘   │
    │  ┌─────────────────────────────────────────────────────────────────────────┐   │
    │  │                    QUERY CLASSIFIER                                     │   │
    │  │         ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐           │   │
    │  │         │   Simple    │  │   Complex   │  │     Hybrid      │           │   │
    │  │         │  (keywords) │  │  (filters)  │  │   (combined)    │           │   │
    │  │         └─────────────┘  └─────────────┘  └─────────────────┘           │   │
    │  └─────────────────────────────────────────────────────────────────────────┘   │
    └─────────────────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
    ┌─────────────────────────────────────────────────────────────────────────────────┐
    │                            CACHING LAYER                                       │
    │  ┌─────────────────────────────────────────────────────────────────────────┐   │
    │  │  L1 CACHE (In-Memory)                L2 CACHE (Redis)                   │   │
    │  │  ┌─────────────────────┐              ┌─────────────────────────────┐    │   │
    │  │  │ • Node Cache (LRU)  │              │ • Redis Cluster            │    │   │
    │  │  │ • 10K entries       │───hit────────│ • 1M+ entries              │    │   │
    │  │  │ • 5min TTL          │              │ • 1hr TTL                  │    │   │
    │  │  │ • <1ms response     │              │ • 1-10ms response          │    │   │
    │  │  │ • 50MB memory       │              │ • Persistent storage       │    │   │
    │  │  └─────────────────────┘              └─────────────────────────────┘    │   │
    │  └─────────────────────────────────────────────────────────────────────────┘   │
    └─────────────────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
    ┌─────────────────────────────────────────────────────────────────────────────────┐
    │                          SEARCH ENGINES                                        │
    │  ┌─────────────────────────────────────────────────────────────────────────┐   │
    │  │  ┌─────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐  │   │
    │  │  │    Mock     │  │   Typesense     │  │       OpenSearch            │  │   │
    │  │  │  Engine     │  │   (Simple)      │  │       (Complex)             │  │   │
    │  │  │             │  │                 │  │                             │  │   │
    │  │  │• Development│  │• Fast keyword   │  │• Advanced filters           │  │   │
    │  │  │• Testing    │  │• Auto-complete  │  │• Aggregations               │  │   │
    │  │  │• Demo mode  │  │• Real-time      │  │• Analytics                  │  │   │
    │  │  │• JSON data  │  │• <50ms response │  │• 50-200ms response          │  │   │
    │  │  └─────────────┘  └─────────────────┘  └─────────────────────────────┘  │   │
    │  └─────────────────────────────────────────────────────────────────────────┘   │
    └─────────────────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
    ┌─────────────────────────────────────────────────────────────────────────────────┐
    │                           DATA LAYER                                           │
    │  ┌─────────────────────────────────────────────────────────────────────────┐   │
    │  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │   │
    │  │  │ PostgreSQL  │  │   MongoDB   │  │    MySQL    │  │    External     │  │   │
    │  │  │             │  │             │  │             │  │      APIs       │  │   │
    │  │  │• Users      │  │• Documents  │  │• Products   │  │• Third-party    │  │   │
    │  │  │• Accounts   │  │• Content    │  │• Orders     │  │• Integrations   │  │   │
    │  │  │• Metadata   │  │• Files      │  │• Inventory  │  │• Legacy Systems │  │   │
    │  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────┘  │   │
    │  └─────────────────────────────────────────────────────────────────────────┘   │
    └─────────────────────────────────────────────────────────────────────────────────┘
```

## 🔄 Request Processing Flow

```
    CLIENT REQUEST                           PLATFORM PROCESSING                    RESPONSE
    ┌─────────────┐                          ┌─────────────────────┐                ┌─────────────┐
    │             │                          │                     │                │             │
    │   Search    │   1. HTTP Request        │   Request Router    │                │   JSON      │
    │   Query     │─────────────────────────▶│   • Extract Tenant  │                │  Response   │
    │             │   POST /search           │   • Validate Auth   │                │             │
    └─────────────┘   {                      │   • Rate Limiting   │                └─────────────┘
                        "q": "nodejs",       └─────────────────────┘                        ▲
                        "tenant_id": "acme",          │                                      │
                        "limit": 10                   │                                      │
                      }                               ▼                                      │
                                             ┌─────────────────────┐                        │
                                             │   Cache Manager     │                        │
                                             │   • Generate Key    │                        │
    ┌─────────────┐                          │   • Check L1 Cache  │                        │
    │             │   2. Cache Hit           │   • Check L2 Cache  │                        │
    │  L1 Cache   │◀─────────────────────────│                     │                        │
    │   (Memory)  │                          └─────────────────────┘                        │
    │             │   ✓ Found                         │                                     │
    └─────────────┘   Return in <5ms                  │ Cache Miss                          │
                                                      ▼                                      │
    ┌─────────────┐                          ┌─────────────────────┐                        │
    │             │   3. Cache Hit           │  Query Classifier   │                        │
    │  L2 Cache   │◀─────────────────────────│  • Analyze Query    │                        │
    │   (Redis)   │                          │  • Route to Engine  │                        │
    │             │   ✓ Found                │  • Simple/Complex   │                        │
    └─────────────┘   Return in <15ms        └─────────────────────┘                        │
                                                      │                                      │
                                             Cache Miss │                                   │
                                                      ▼                                      │
    ┌─────────────┐                          ┌─────────────────────┐                        │
    │             │   4a. Simple Query       │   Search Engine     │                        │
    │ Typesense   │◀─────────────────────────│   • Execute Query   │                        │
    │   Engine    │                          │   • Process Results │                        │
    │             │   Fast results           │   • Score & Rank    │                        │
    └─────────────┘   <50ms                  └─────────────────────┘                        │
                                                      │                                      │
    ┌─────────────┐                                   │                                      │
    │             │   4b. Complex Query               │                                      │
    │ OpenSearch  │◀──────────────────────────────────┤                                      │
    │   Engine    │                                   │                                      │
    │             │   Advanced results                │                                      │
    └─────────────┘   <200ms                          ▼                                      │
                                             ┌─────────────────────┐                        │
                                             │  Result Processor   │                        │
                                             │  • Format Response  │                        │
                                             │  • Add Metadata     │                        │
                                             │  • Cache Results    │────────────────────────┘
                                             │  • Update Metrics   │
                                             └─────────────────────┘
```

## 🏗️ Integration Architecture

### Middleware Integration Pattern
```
    YOUR APPLICATION                    SEARCH MIDDLEWARE                SEARCH PLATFORM
    ┌─────────────────┐                ┌─────────────────────┐           ┌─────────────────┐
    │                 │                │                     │           │                 │
    │  ┌─────────────┐│                │  ┌─────────────────┐│           │ ┌─────────────┐ │
    │  │   Routes    ││                │  │  Auto Sync      ││           │ │   Queue     │ │
    │  │             ││   Middleware   │  │                 ││  HTTP     │ │  Manager    │ │
    │  │ POST /users ││──────────────▶ │  │ • Extract Data  ││──────────▶│ │             │ │
    │  │ PUT  /users ││                │  │ • Add Tenant    ││           │ │ • Batch     │ │
    │  │ DEL  /users ││                │  │ • Transform     ││           │ │ • Retry     │ │
    │  └─────────────┘│                │  │ • Fire & Forget ││           │ │ • Async     │ │
    │                 │                │  └─────────────────┘│           │ └─────────────┘ │
    │  ┌─────────────┐│                │  ┌─────────────────┐│           │ ┌─────────────┐ │
    │  │   Search    ││                │  │  Search Proxy   ││           │ │   Search    │ │
    │  │             ││   Proxy        │  │                 ││  HTTP     │ │   Engine    │ │
    │  │ GET /search ││──────────────▶ │  │ • Route Query   ││──────────▶│ │             │ │
    │  │ GET /suggest││                │  │ • Add Tenant    ││           │ │ • Execute   │ │
    │  │             ││                │  │ • Pass Through  ││           │ │ • Cache     │ │
    │  └─────────────┘│                │  └─────────────────┘│           │ └─────────────┘ │
    │                 │                │                     │           │                 │
    │ No Code Changes!│                │   Zero Config       │           │  Plug & Play   │
    └─────────────────┘                └─────────────────────┘           └─────────────────┘
```

### Client Integration Pattern
```
    YOUR APPLICATION                       SEARCH CLIENT                  SEARCH PLATFORM
    ┌─────────────────┐                   ┌─────────────────┐             ┌─────────────────┐
    │                 │                   │                 │             │                 │
    │ ┌─────────────┐ │                   │┌─────────────────┐│            │ ┌─────────────┐ │
    │ │ API Routes  │ │                   ││  HTTP Client     ││            │ │ REST API    │ │
    │ │             │ │    Direct Call    ││                 ││   HTTP     │ │             │ │
    │ │/api/search  │ │─────────────────▶ ││ • search()      ││───────────▶│ │POST /search │ │
    │ │/api/suggest │ │                   ││ • suggest()     ││            │ │POST /suggest│ │
    │ │/api/health  │ │                   ││ • health()      ││            │ │GET  /health │ │
    │ └─────────────┘ │                   ││ • explain()     ││            │ └─────────────┘ │
    │                 │                   │└─────────────────┘│            │                 │
    │ ┌─────────────┐ │                   │┌─────────────────┐│            │ ┌─────────────┐ │
    │ │Sync Service │ │                   ││  Sync Methods    ││            │ │Data Ingestion│ │
    │ │             │ │    Manual Sync    ││                 ││   HTTP     │ │             │ │
    │ │ onCreate()  │ │─────────────────▶ ││ • syncDocument()││───────────▶│ │POST /sync   │ │
    │ │ onUpdate()  │ │                   ││ • syncBatch()   ││            │ │POST /batch  │ │
    │ │ onDelete()  │ │                   ││ • syncAll()     ││            │ │POST /reindex│ │
    │ └─────────────┘ │                   │└─────────────────┘│            │ └─────────────┘ │
    │                 │                   │                 │             │                 │
    │  Manual Control │                   │ Full Featured   │             │ Complete API    │
    └─────────────────┘                   └─────────────────┘             └─────────────────┘
```

## 🔐 Security & Tenant Isolation

```
    ┌─────────────────────────────────────────────────────────────────────────────────┐
    │                           SECURITY LAYERS                                       │
    └─────────────────────────────────────────────────────────────────────────────────┘
    
    Request Level Security                 Data Level Security                Platform Security
    ┌─────────────────┐                   ┌─────────────────┐                ┌─────────────────┐
    │                 │                   │                 │                │                 │
    │ ┌─────────────┐ │                   │ ┌─────────────┐ │                │ ┌─────────────┐ │
    │ │   Headers   │ │                   │ │  Tenant     │ │                │ │    CORS     │ │
    │ │             │ │                   │ │ Filtering   │ │                │ │   Policy    │ │
    │ │X-Tenant-ID  │ │                   │ │             │ │                │ │             │ │
    │ │X-API-Key    │ │                   │ │tenant_id IN │ │                │ │ Origin      │ │
    │ │Authorization│ │                   │ │(acme, beta) │ │                │ │ Methods     │ │
    │ └─────────────┘ │                   │ └─────────────┘ │                │ │ Headers     │ │
    │                 │                   │                 │                │ └─────────────┘ │
    │ ┌─────────────┐ │                   │ ┌─────────────┐ │                │                 │
    │ │  JWT/Token  │ │                   │ │ Cache Keys  │ │                │ ┌─────────────┐ │
    │ │ Validation  │ │                   │ │ Isolation   │ │                │ │  Helmet     │ │
    │ │             │ │                   │ │             │ │                │ │ Security    │ │
    │ │ • Verify    │ │                   │ │search:acme: │ │                │ │             │ │
    │ │ • Extract   │ │                   │ │search:beta: │ │                │ │ • XSS       │ │
    │ │ • Tenant    │ │                   │ │search:gamma│ │                │ │ • CSRF      │ │
    │ └─────────────┘ │                   │ └─────────────┘ │                │ │ • Clickjack │ │
    │                 │                   │                 │                │ └─────────────┘ │
    │ ┌─────────────┐ │                   │ ┌─────────────┐ │                │                 │
    │ │Rate Limiting│ │                   │ │Index        │ │                │ ┌─────────────┐ │
    │ │             │ │                   │ │Separation   │ │                │ │ Compression │ │
    │ │ • Per Tenant│ │                   │ │             │ │                │ │   & SSL     │ │
    │ │ • Per User  │ │                   │ │ tenant_a_*  │ │                │ │             │ │
    │ │ • Per IP    │ │                   │ │ tenant_b_*  │ │                │ │ • gzip      │ │
    │ │ • Global    │ │                   │ │ tenant_c_*  │ │                │ │ • HTTPS     │ │
    │ └─────────────┘ │                   │ └─────────────┘ │                │ │ • TLS 1.3   │ │
    └─────────────────┘                   └─────────────────┘                │ └─────────────┘ │
                                                                              └─────────────────┘
```

This comprehensive architecture shows how your npm package provides enterprise-grade search capabilities with minimal integration effort while maintaining high performance, security, and scalability.