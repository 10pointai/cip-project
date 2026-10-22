import 'dotenv/config';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { serverDb } from './server/db';
import { partiesRouter } from './server/routes/parties';
import { transactionsRouter } from './server/routes/transactions';
import { itemsRouter, categoriesRouter, unitsRouter, locationsRouter, stockAdjustmentsRouter } from './server/routes/items';
import { salesRouter } from './server/routes/sales';
import { purchasesRouter } from './server/routes/purchases';
import { productionRouter } from './server/routes/production';
import { logisticsRouter } from './server/routes/logistics';
import { employeesRouter } from './server/routes/employees';
import { settingsRouter } from './server/routes/settings';
import { analyticsRouter } from './server/routes/analytics';
import { backupRouter } from './server/routes/backup';
import { authRouter } from './server/routes/auth';
import { usersRouter } from './server/routes/users';
import { documentsRouter } from './server/routes/documents';
import { cloudRouter } from './server/routes/cloud';
import { accountsRouter, transfersRouter, adjustmentsRouter } from './server/routes/accounts';
import { countsRouter, legacyOrdersRouter } from './server/routes/overview';
import { getConnectionStatus, isMysqlConfigured, testMysqlConnection } from './server/mysql/connection';
import { runMysqlMigrations } from './server/mysql/migrations';
import { getStorageStatus } from './server/services/storage';
import { resolveTokenUser } from './server/middleware/auth';
import { startEmiScheduler } from './server/services/emiScheduler';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

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

// Health & System Info — collectionCounts reveal business volume (parties,
// transactions, users), so this is an authenticated endpoint now. The client
// reaches it via api.getHealth() (Bearer token attached); BackendStatusModal
// only opens for signed-in operators.
app.get('/api/health', (req, res) => {
  if (!resolveTokenUser(
    typeof req.headers.authorization === 'string' && req.headers.authorization.startsWith('Bearer ')
      ? req.headers.authorization.substring(7)
      : null
  )) {
    return res.status(401).json({ success: false, error: 'Authentication token required. Please sign in.' });
  }
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
// SECURITY — TIERED SNAPSHOT (the old handler was fully unauthenticated and
// returned the entire database including users with bcrypt hashes):
//  - Unauthenticated callers (the pre-login hydration the sign-in screen uses
//    for company branding) get ONLY `settings` — no users, no parties, no
//    transactions, no balances.
//  - Authenticated callers get the full snapshot with credential material
//    (passwordHash, activationCode) stripped from every user — passwords have
//    no business being client-side. `/api/users` (manage_users) remains the
//    only surface that exposes activation codes, since admins must share them.
app.get('/api/sync', async (req, res) => {
  try {
    const authHeader = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
    const tokenUser = resolveTokenUser(bearer);

    if (!tokenUser) {
      return res.json({
        success: true,
        timestamp: new Date().toISOString(),
        data: {
          settings: serverDb.getSettings(),
          users: [] as unknown[],
        },
      });
    }

    // ?fresh=true forces a full MySQL re-hydration — an authenticated-only
    // affordance. A previous revision ran initFromMysql() BEFORE resolving the
    // token, letting any unauthenticated caller trigger a full cloud-DB
    // re-read on demand; it now happens only after the caller proves they hold
    // a valid token.

    if (req.query.fresh === 'true' || req.query.refresh === 'true') {
      await serverDb.initFromMysql();
    }

    const refreshedSnapshot = serverDb.getFullSnapshot();
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      data: {
        ...refreshedSnapshot,
        users: refreshedSnapshot.users.map(({ passwordHash: _ph, activationCode: _ac, ...safeUser }) => safeUser),
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Mount domain routes
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/documents', documentsRouter);
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
app.use('/api/sales', salesRouter);
app.use('/api/purchases', purchasesRouter);
app.use('/api/batches', productionRouter);
app.use('/api/logistics', logisticsRouter);
app.use('/api/employees', employeesRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/counts', countsRouter);
app.use('/api/orders', legacyOrdersRouter);
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

  // Vehicle EMI auto-debit cron — daily check (hourly ticks, idempotent per
  // vehicle-month) after MySQL hydration settles.
  startEmiScheduler();
}

startServer();
