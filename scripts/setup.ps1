#!/bin/bash

# Windows Setup Script for Multi-Tenant Search Platform
# Run this in PowerShell or Git Bash

echo "🚀 Setting up Multi-Tenant Search Platform on Windows..."

# Check prerequisites
where docker >nul 2>nul || (echo "❌ Docker is required but not installed. Please install Docker Desktop." && exit 1)
where docker-compose >nul 2>nul || (echo "❌ Docker Compose is required but not installed." && exit 1)
where node >nul 2>nul || (echo "❌ Node.js is required but not installed." && exit 1)
where npm >nul 2>nul || (echo "❌ npm is required but not installed." && exit 1)

echo "✅ Prerequisites check passed"

# Get current directory
$PROJECT_ROOT = Get-Location
Write-Host "📁 Project root: $PROJECT_ROOT"

# Install Node.js dependencies
Write-Host "📦 Installing Node.js dependencies..."
Set-Location src
npm install
Set-Location ..

# Create environment file
Write-Host "⚙️ Creating environment configuration..."
@"
# Search Platform Configuration
NODE_ENV=development
PORT=3000
HOST=0.0.0.0

# OpenSearch Configuration
OPENSEARCH_URL=http://localhost:9200
OPENSEARCH_USERNAME=
OPENSEARCH_PASSWORD=

# Typesense Configuration
TYPESENSE_HOST=localhost
TYPESENSE_PORT=8108
TYPESENSE_PROTOCOL=http
TYPESENSE_API_KEY=xyz123

# Redis Configuration (Optional)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Cache Configuration
CACHE_L1_MAX_SIZE=10000
CACHE_L1_TTL_MS=300000
CACHE_L2_ENABLED=true

# Monitoring
LOG_LEVEL=info
METRICS_ENABLED=true
"@ | Out-File -FilePath ".env" -Encoding utf8

Write-Host "✅ Environment file created"

# Create sample data (already exists)
Write-Host "📊 Sample data script ready"

# Start Docker infrastructure
Write-Host "🐳 Starting Docker infrastructure..."
docker-compose up -d

Write-Host "⏳ Waiting for services to be ready (this may take 2-3 minutes)..."
Start-Sleep -Seconds 30

# Function to wait for service
function Wait-ForService {
    param($Url, $ServiceName)
    $maxAttempts = 20
    $attempt = 0
    
    Write-Host "Waiting for $ServiceName..."
    do {
        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
            if ($response.StatusCode -eq 200) {
                Write-Host "✅ $ServiceName is ready"
                return $true
            }
        }
        catch {
            Write-Host "  $ServiceName not ready yet... (attempt $($attempt + 1)/$maxAttempts)"
        }
        Start-Sleep -Seconds 5
        $attempt++
    } while ($attempt -lt $maxAttempts)
    
    Write-Host "❌ $ServiceName failed to start within timeout"
    return $false
}

# Wait for services
$opensearchReady = Wait-ForService "http://localhost:9200/_cluster/health" "OpenSearch"
$typesenseReady = Wait-ForService "http://localhost:8108/health" "Typesense"

if (-not $opensearchReady -or -not $typesenseReady) {
    Write-Host "❌ Some services failed to start. Check logs with: docker-compose logs"
    exit 1
}

# Initialize search engines
Write-Host "📊 Setting up search indices..."

# Create OpenSearch index
try {
    $opensearchMapping = Get-Content "schemas/opensearch-mapping.json" -Raw
    Invoke-RestMethod -Uri "http://localhost:9200/search-docs-shared" `
        -Method PUT `
        -ContentType "application/json" `
        -Body $opensearchMapping
    Write-Host "✅ OpenSearch index created"
}
catch {
    Write-Host "⚠️ OpenSearch index creation failed: $_"
}

# Create Typesense collection
try {
    $typesenseSchema = Get-Content "schemas/typesense-schema.json" -Raw
    Invoke-RestMethod -Uri "http://localhost:8108/collections" `
        -Method POST `
        -ContentType "application/json" `
        -Headers @{"X-TYPESENSE-API-KEY" = "xyz123"} `
        -Body $typesenseSchema
    Write-Host "✅ Typesense collection created"
}
catch {
    Write-Host "⚠️ Typesense collection creation failed: $_"
}

# Build and start the search router
Write-Host "🚀 Building and starting Search Router..."
Set-Location src
npm run build

# Start the router in background
Start-Process -FilePath "npm" -ArgumentList "start" -WindowStyle Hidden
Start-Sleep -Seconds 10

# Wait for router to be ready
$routerReady = Wait-ForService "http://localhost:3000/health" "Search Router"

if (-not $routerReady) {
    Write-Host "❌ Search Router failed to start"
    Set-Location ..
    exit 1
}

Set-Location ..

# Test the setup
Write-Host "🧪 Running basic health checks..."

try {
    $healthResponse = Invoke-RestMethod -Uri "http://localhost:3000/health"
    Write-Host "✅ Health check passed: $($healthResponse.status)"
}
catch {
    Write-Host "❌ Health check failed: $_"
}

# Test search
try {
    $searchBody = @{
        q = "test"
        page = @{ size = 5 }
    } | ConvertTo-Json

    $searchResponse = Invoke-RestMethod -Uri "http://localhost:3000/search" `
        -Method POST `
        -ContentType "application/json" `
        -Headers @{"X-Tenant-ID" = "550e8400-e29b-41d4-a716-446655440001"} `
        -Body $searchBody
    
    Write-Host "✅ Search test passed: Found $($searchResponse.total.value) results"
}
catch {
    Write-Host "⚠️ Search test warning: $_"
}

Write-Host ""
Write-Host "🎉 Multi-Tenant Search Platform is ready!"
Write-Host ""
Write-Host "📋 Service URLs:"
Write-Host "  🔍 Search API:     http://localhost:3000"
Write-Host "  📊 OpenSearch:     http://localhost:9200"  
Write-Host "  ⚡ Typesense:      http://localhost:8108"
Write-Host "  🎯 Prometheus:     http://localhost:9090"
Write-Host "  📈 Grafana:        http://localhost:3001 (admin/admin123)"
Write-Host "  🔬 Jaeger:         http://localhost:16686"
Write-Host ""
Write-Host "🧪 Test in PowerShell:"
Write-Host '  $headers = @{"X-Tenant-ID" = "tenant-123"; "Content-Type" = "application/json"}'
Write-Host '  $body = @{q = "test"; page = @{size = 5}} | ConvertTo-Json'
Write-Host '  Invoke-RestMethod -Uri "http://localhost:3000/search" -Method POST -Headers $headers -Body $body'
Write-Host ""
Write-Host "🛑 To stop: docker-compose down"

Write-Host "Press any key to continue..."
$Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")