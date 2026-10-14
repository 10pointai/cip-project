import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { serverDb } from './server/db';
import { partiesRouter } from './server/routes/parties';
import { transactionsRouter } from './server/routes/transactions';
import { itemsRouter, categoriesRouter, unitsRouter, locationsRouter, stockAdjustmentsRouter } from './server/routes/items';
import { ordersRouter } from './server/routes/orders';
import { productionRouter } from './server/routes/production';
import { logisticsRouter } from './server/routes/logistics';
import { employeesRouter } from './server/routes/employees';
import { settingsRouter } from './server/routes/settings';
import { analyticsRouter } from './server/routes/analytics';
import { backupRouter } from './server/routes/backup';
import { authRouter } from './server/routes/auth';
import { usersRouter } from './server/routes/users';
import { cloudRouter } from './server/routes/cloud';
import { accountsRouter, transfersRouter, adjustmentsRouter } from './server/routes/accounts';
import { getConnectionStatus, isMysqlConfigured, testMysqlConnection } from './server/mysql/connection';
import { runMysqlMigrations } from './server/mysql/migrations';
import { getStorageStatus } from './server/services/storage';

const app = express();
const PORT = 3000;

// Body Parsers & Request Logging
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Request Logger
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (req.path.startsWith('/api')) {
      console.log(`[API] ${req.method} ${req.path} -> ${res.statusCode} (${duration}ms)`);
    }
  });
  next();
});

// ==========================================
// REST API ROUTES
// ==========================================

// Health & System Info
app.get('/api/health', (req, res) => {
  const stats = serverDb.getStats();
  const dbStatus = getConnectionStatus();
  const storageStatus = getStorageStatus();
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    database: {
      architecture: 'cloud_first_single_authoritative_source',
      localStorageDecommissioned: true,
      singleSourceOfTruth: dbStatus.isConnected ? 'Azure Database for MySQL Flexible Server' : 'In-Memory Development Sandbox',
      type: dbStatus.isConnected ? 'mysql_cloud' : 'in_memory_sandbox',
      storageEngine: dbStatus.isConnected ? 'Azure MySQL Flexible Server (30 Connections Pool)' : 'In-Memory Cache (Development Sandbox)',
      filePath: 'decommissioned (cloud-authoritative)',
      fileSizeKb: 0,
      lastUpdated: stats.lastUpdated,
      collectionCounts: stats.counts,
      mysql: dbStatus,
    },
    cloudStorage: {
      provider: storageStatus.provider === 'aws_s3' ? 'Amazon S3' : 'Local / Cloud Storage',
      ...storageStatus,
    },
    system: {
      nodeVersion: process.version,
      platform: process.platform,
      memoryMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      concurrencyCapacity: '100+ concurrent operators',
    },
  });
});

// Full Database Sync Endpoint for Frontend Hydration
app.get('/api/sync', async (req, res) => {
  try {
    if (req.query.fresh === 'true' || req.query.refresh === 'true') {
      await serverDb.initFromMysql();
    }
    const fullSnapshot = serverDb.getFullSnapshot();
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      data: fullSnapshot,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Mount domain routes
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/parties', partiesRouter);
app.use('/api/transactions', transactionsRouter);
app.use('/api/items', itemsRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/units', unitsRouter);
app.use('/api/locations', locationsRouter);
app.use('/api/accounts', accountsRouter);
app.use('/api/transfers', transfersRouter);
app.use('/api/adjustments', adjustmentsRouter);
app.use('/api/stock-adjustments', stockAdjustmentsRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/batches', productionRouter);
app.use('/api/logistics', logisticsRouter);
app.use('/api/employees', employeesRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/backup', backupRouter);
app.use('/api/cloud', cloudRouter);

// 404 handler for API routes
app.all('/api/*', (req, res) => {
  res.status(404).json({ success: false, error: `API endpoint not found: ${req.method} ${req.path}` });
});

// ==========================================
// VITE / STATIC SERVING
// ==========================================
async function startServer() {
  // Check and initialize Azure Database for MySQL Flexible Server
  try {
    if (isMysqlConfigured()) {
      console.log('[Server] Connecting to Azure Database for MySQL Flexible Server...');
      const test = await testMysqlConnection();
      if (test.ok) {
        console.log('[Azure MySQL] Connection established successfully:', test.message);
        await runMysqlMigrations();
        const hydrated = await serverDb.initFromMysql();
        if (hydrated) {
          console.log('[Azure MySQL] Operations Management System initialized directly from Cloud DB.');
        }
      } else {
        console.warn('[Azure MySQL] Warning during startup:', test.message);
      }
    }
  } catch (err: any) {
    console.error('[Azure MySQL] Non-fatal initialization note:', err.message);
  }

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n======================================================`);
    console.log(`  OPERATIONS MANAGEMENT SYSTEM`);
    console.log(`  Azure Database for MySQL Flexible Server + REST API Online`);
    console.log(`  Port: ${PORT} (host: 0.0.0.0)`);
    console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`======================================================\n`);
  });
}

startServer();
