/**
 * Complete Integration Example
 * 
 * This example shows how to integrate @apim/multitenant-search 
 * into an existing Express.js application
 */

const express = require('express');
const { 
  SearchPlatform, 
  SearchClient, 
  SearchMiddleware,
  createProductionConfig 
} = require('./lib/package-index.js');

async function createCompleteSearchSolution() {
  console.log('🚀 Setting up complete search solution...\n');

  // 1. Create and start the search platform server
  console.log('📡 Starting search platform server...');
  const platform = new SearchPlatform(createProductionConfig());
  
  // Start the platform in the background
  setTimeout(async () => {
    try {
      await platform.start();
    } catch (error) {
      console.log('ℹ️  Search platform may already be running');
    }
  }, 100);

  // 2. Create the main Express application
  console.log('🌐 Setting up Express application...');
  const app = express();
  app.use(express.json());

  // 3. Add tenant extraction middleware
  app.use((req, res, next) => {
    // Extract tenant from header, token, or subdomain
    req.tenantId = req.headers['x-tenant-id'] || 'default-tenant';
    req.user = { tenantId: req.tenantId };
    next();
  });

  // 4. Set up search middleware
  const searchMiddleware = new SearchMiddleware({
    searchServiceUrl: 'http://localhost:3000',
    enabled: true
  });

  // 5. Add search endpoints
  app.get('/api/search', searchMiddleware.search());
  app.get('/api/autocomplete', searchMiddleware.autocomplete());

  // 6. Add CRUD endpoints with automatic search sync
  app.get('/api/users', (req, res) => {
    res.json({
      users: [
        { id: '1', name: 'John Doe', email: 'john@example.com', role: 'admin' },
        { id: '2', name: 'Jane Smith', email: 'jane@example.com', role: 'user' }
      ]
    });
  });

  app.post('/api/users', searchMiddleware.syncOnCreate(), (req, res) => {
    console.log(`🔄 Creating user and syncing to search: ${req.body.name}`);
    res.status(201).json({ 
      id: Date.now().toString(), 
      ...req.body,
      message: 'User created and synced to search'
    });
  });

  app.put('/api/users/:id', searchMiddleware.syncOnUpdate(), (req, res) => {
    console.log(`🔄 Updating user ${req.params.id} and syncing to search`);
    res.json({ 
      id: req.params.id, 
      ...req.body,
      message: 'User updated and synced to search'
    });
  });

  app.delete('/api/users/:id', searchMiddleware.syncOnDelete(), (req, res) => {
    console.log(`🔄 Deleting user ${req.params.id} and syncing to search`);
    res.json({ 
      message: `User ${req.params.id} deleted and removed from search`
    });
  });

  // 7. Add health check endpoint
  app.get('/health', async (req, res) => {
    try {
      const client = new SearchClient({ baseUrl: 'http://localhost:3000' });
      const health = await client.health();
      res.json({
        app: 'healthy',
        search: health
      });
    } catch (error) {
      res.status(503).json({
        app: 'healthy',
        search: { status: 'unavailable', error: error.message }
      });
    }
  });

  // 8. Start the main application
  const port = process.env.APP_PORT || 4000;
  app.listen(port, () => {
    console.log(`✅ Express application started on port ${port}`);
    console.log('\n📚 Available endpoints:');
    console.log(`   GET  http://localhost:${port}/api/search?q=john&tenant_id=acme`);
    console.log(`   GET  http://localhost:${port}/api/autocomplete?q=jo&tenant_id=acme`);
    console.log(`   GET  http://localhost:${port}/api/users`);
    console.log(`   POST http://localhost:${port}/api/users`);
    console.log(`   PUT  http://localhost:${port}/api/users/123`);
    console.log(`   DEL  http://localhost:${port}/api/users/123`);
    console.log(`   GET  http://localhost:${port}/health`);
    console.log('\n🎯 Try these commands:');
    console.log('   curl -X POST http://localhost:4000/api/users \\');
    console.log('     -H "Content-Type: application/json" \\');
    console.log('     -H "X-Tenant-ID: acme-corp" \\');
    console.log('     -d \'{"name":"Alice Johnson","email":"alice@acme.com","role":"manager"}\'');
    console.log('\n   curl "http://localhost:4000/api/search?q=alice&limit=10" \\');
    console.log('     -H "X-Tenant-ID: acme-corp"');
  });
}

// Run the complete integration example
createCompleteSearchSolution().catch(console.error);