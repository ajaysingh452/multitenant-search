@echo off
echo 🚀 Starting Multi-Tenant Search Platform on Windows...

REM Check if Docker is installed
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Docker is required but not installed. Please install Docker Desktop.
    pause
    exit /b 1
)

REM Check if Node.js is installed  
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js is required but not installed. Please install Node.js 18+
    pause
    exit /b 1
)

echo ✅ Prerequisites check passed

REM Install dependencies
echo 📦 Installing Node.js dependencies...
cd src
call npm install
cd ..

REM Create environment file
echo ⚙️ Creating environment configuration...
(
echo NODE_ENV=development
echo PORT=3000
echo HOST=0.0.0.0
echo OPENSEARCH_URL=http://localhost:9200
echo TYPESENSE_HOST=localhost
echo TYPESENSE_PORT=8108
echo TYPESENSE_API_KEY=xyz123
echo CACHE_L1_MAX_SIZE=10000
echo CACHE_L1_TTL_MS=300000
echo CACHE_L2_ENABLED=true
echo LOG_LEVEL=info
) > .env

echo ✅ Environment file created

REM Start Docker services
echo 🐳 Starting Docker infrastructure...
docker-compose up -d

echo ⏳ Waiting for services to be ready...
timeout /t 45 /nobreak > nul

REM Wait for OpenSearch
echo Checking OpenSearch...
:wait_opensearch
curl -s http://localhost:9200/_cluster/health > nul
if %errorlevel% neq 0 (
    echo   OpenSearch not ready yet...
    timeout /t 5 /nobreak > nul
    goto wait_opensearch
)
echo ✅ OpenSearch is ready

REM Wait for Typesense
echo Checking Typesense...
:wait_typesense
curl -s http://localhost:8108/health > nul
if %errorlevel% neq 0 (
    echo   Typesense not ready yet...
    timeout /t 5 /nobreak > nul
    goto wait_typesense
)
echo ✅ Typesense is ready

REM Initialize search engines
echo 📊 Setting up search indices...

curl -X PUT "http://localhost:9200/search-docs-shared" -H "Content-Type: application/json" -d @schemas/opensearch-mapping.json
curl -X POST "http://localhost:8108/collections" -H "Content-Type: application/json" -H "X-TYPESENSE-API-KEY: xyz123" -d @schemas/typesense-schema.json

REM Build and start search router
echo 🚀 Starting Search Router...
cd src
call npm run build
start /b npm start
cd ..

REM Wait for router
echo ⏳ Waiting for Search Router...
timeout /t 15 /nobreak > nul

:wait_router
curl -s http://localhost:3000/health > nul
if %errorlevel% neq 0 (
    echo   Search Router not ready yet...
    timeout /t 3 /nobreak > nul
    goto wait_router
)

echo ✅ Search Router is ready

REM Test the setup
echo 🧪 Testing the platform...
curl -s http://localhost:3000/health

echo.
echo 🎉 Multi-Tenant Search Platform is ready!
echo.
echo 📋 Service URLs:
echo   🔍 Search API:     http://localhost:3000
echo   📊 OpenSearch:     http://localhost:9200
echo   ⚡ Typesense:      http://localhost:8108
echo   📈 Grafana:        http://localhost:3001 (admin/admin123)
echo   🎯 Prometheus:     http://localhost:9090
echo.
echo 🧪 Test Command:
echo curl -X POST http://localhost:3000/search -H "Content-Type: application/json" -H "X-Tenant-ID: tenant-123" -d "{\"q\":\"test\"}"
echo.
echo 🛑 To stop all services: docker-compose down
echo.
pause