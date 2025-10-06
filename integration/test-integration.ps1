# Test the integration example
Write-Host "🧪 Testing APIM Integration with Search Platform" -ForegroundColor Green
Write-Host ""

# Start the search platform first
Write-Host "🚀 Starting Search Platform..." -ForegroundColor Yellow
Start-Process -FilePath "node" -ArgumentList "demo.js" -WindowStyle Hidden

# Wait for search platform to start
Write-Host "⏳ Waiting for search platform to start..."
Start-Sleep -Seconds 3

try {
    # Test search platform health
    $healthResponse = Invoke-RestMethod -Uri "http://localhost:3000/health" -Method GET
    Write-Host "✅ Search Platform Status: $($healthResponse.status)" -ForegroundColor Green
    
    # Start the APIM integration example
    Write-Host "🚀 Starting APIM Integration Example..." -ForegroundColor Yellow
    Start-Process -FilePath "node" -ArgumentList "integration/examples/express-integration.js" -WindowStyle Hidden
    
    # Wait for APIM API to start
    Start-Sleep -Seconds 3
    
    # Test APIM health
    $apimHealth = Invoke-RestMethod -Uri "http://localhost:8080/health" -Method GET
    Write-Host "✅ APIM API Status: $($apimHealth.status)" -ForegroundColor Green
    Write-Host "✅ Search Integration: $($apimHealth.services.search.status)" -ForegroundColor Green
    
    Write-Host ""
    Write-Host "🎉 Integration Test Successful!" -ForegroundColor Green
    Write-Host ""
    Write-Host "📋 Available APIM Endpoints:" -ForegroundColor Cyan
    Write-Host "   POST http://localhost:8080/api/search           - Unified search"
    Write-Host "   GET  http://localhost:8080/api/autocomplete     - Autocomplete"
    Write-Host "   POST http://localhost:8080/api/search/advanced  - Advanced search"
    Write-Host "   GET  http://localhost:8080/health               - Health check"
    Write-Host ""
    Write-Host "🧪 Test Commands:" -ForegroundColor Cyan
    Write-Host "   # Search test:"
    Write-Host '   Invoke-RestMethod -Uri "http://localhost:8080/api/search" -Method POST -Headers @{"Content-Type"="application/json"; "X-Tenant-ID"="tenant-123"} -Body ''{"q":"acme"}'''
    Write-Host ""
    Write-Host "   # Autocomplete test:"
    Write-Host '   Invoke-RestMethod -Uri "http://localhost:8080/api/autocomplete?q=acme&limit=3" -Headers @{"X-Tenant-ID"="tenant-123"}'
    Write-Host ""
    Write-Host "💡 Both services are now running in the background!"
    
} catch {
    Write-Host "❌ Integration test failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "💡 Make sure no other services are using ports 3000 or 8080" -ForegroundColor Yellow
}