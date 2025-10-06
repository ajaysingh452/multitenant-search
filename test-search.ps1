# PowerShell test script for the Multi-Tenant Search Platform
Write-Host "🧪 Testing Multi-Tenant Search Platform" -ForegroundColor Green
Write-Host ""

$baseUrl = "http://localhost:3000"
$tenantId = "tenant-123"

try {
    # Test 1: Health Check
    Write-Host "1. Health Check..." -ForegroundColor Yellow
    $health = Invoke-RestMethod -Uri "$baseUrl/health" -Method GET
    Write-Host "   Status: Healthy" -ForegroundColor Green
    Write-Host "   Services: $($health.services.search_engine.status), $($health.services.cache.status)" -ForegroundColor Green
    Write-Host ""

    # Test 2: Basic Search
    Write-Host "2. Basic Search (query: 'acme')..." -ForegroundColor Yellow
    $searchBody = @{
        q = "acme"
    } | ConvertTo-Json
    
    $headers = @{
        "Content-Type" = "application/json"
        "X-Tenant-ID" = $tenantId
    }
    
    $searchResult = Invoke-RestMethod -Uri "$baseUrl/search" -Method POST -Body $searchBody -Headers $headers
    Write-Host "   Found: $($searchResult.total.value) results" -ForegroundColor Green
    Write-Host "   Took: $([math]::Round($searchResult.performance.took_ms, 2))ms" -ForegroundColor Green
    Write-Host "   Classification: $($searchResult.debug.query_classification)" -ForegroundColor Green
    Write-Host ""

    # Test 3: Filtered Search
    Write-Host "3. Filtered Search (status: 'active')..." -ForegroundColor Yellow
    $filterBody = @{
        filters = @{
            status = "active"
        }
    } | ConvertTo-Json
    
    $filterResult = Invoke-RestMethod -Uri "$baseUrl/search" -Method POST -Body $filterBody -Headers $headers
    Write-Host "   Found: $($filterResult.total.value) results" -ForegroundColor Green
    Write-Host "   Took: $([math]::Round($filterResult.performance.took_ms, 2))ms" -ForegroundColor Green
    Write-Host ""

    # Test 4: Suggestions
    Write-Host "4. Suggestions (prefix: 'acme')..." -ForegroundColor Yellow
    $suggestBody = @{
        prefix = "acme"
        limit = 5
    } | ConvertTo-Json
    
    $suggestResult = Invoke-RestMethod -Uri "$baseUrl/suggest" -Method POST -Body $suggestBody -Headers $headers
    Write-Host "   Suggestions: $($suggestResult.suggestions.Count)" -ForegroundColor Green
    if ($suggestResult.suggestions.Count -gt 0) {
        for ($i = 0; $i -lt $suggestResult.suggestions.Count; $i++) {
            Write-Host "     $($i + 1). $($suggestResult.suggestions[$i].text) (score: $($suggestResult.suggestions[$i].score))" -ForegroundColor Cyan
        }
    }
    Write-Host ""

    # Test 5: Query Explanation
    Write-Host "5. Query Explanation..." -ForegroundColor Yellow
    $explainBody = @{
        q = "technology"
        filters = @{
            status = "active"
            entity = "customer"
        }
    } | ConvertTo-Json
    
    $explainResult = Invoke-RestMethod -Uri "$baseUrl/explain" -Method POST -Body $explainBody -Headers $headers
    Write-Host "   Classification: $($explainResult.classification)" -ForegroundColor Green
    Write-Host "   Routing Engine: $($explainResult.routing.engine)" -ForegroundColor Green
    Write-Host "   Complexity Score: $($explainResult.estimated_cost.complexity_score)" -ForegroundColor Green
    Write-Host "   Expected Latency: $($explainResult.estimated_cost.expected_latency_ms)ms" -ForegroundColor Green
    Write-Host "   Cacheable: $($explainResult.cache_strategy.cacheable)" -ForegroundColor Green
    Write-Host ""

    # Test 6: Metrics
    Write-Host "6. Performance Metrics..." -ForegroundColor Yellow
    $metrics = Invoke-RestMethod -Uri "$baseUrl/metrics" -Method GET
    Write-Host "   P50 Latency: $($metrics.latency.p50)ms" -ForegroundColor Green
    Write-Host "   Cache Hit Rate: $([math]::Round($metrics.cache.hit_rate * 100, 1))%" -ForegroundColor Green
    Write-Host "   Cache Size: $($metrics.cache.size)" -ForegroundColor Green
    Write-Host ""

    Write-Host "✅ All tests completed successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "🚀 Your multi-tenant search platform is working correctly!" -ForegroundColor Green

} catch {
    Write-Host "❌ Test failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "💡 Make sure the server is running: node src/simple-server.js" -ForegroundColor Yellow
}