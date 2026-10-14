import { Router, Request, Response } from 'express';
import { authenticateToken, requirePermission } from '../middleware/auth';
import { getConnectionStatus, testMysqlConnection } from '../mysql/connection';
import { runMysqlMigrations, seedMysqlFromSnapshot } from '../mysql/migrations';
import { getStorageStatus, generatePresignedUploadUrl, testS3Connection } from '../services/storage';
import { runConcurrencyStressTest } from '../mysql/azureTransactions';

export const cloudRouter = Router();

cloudRouter.use(authenticateToken);

// GET /api/cloud/status - Status of Azure Database for MySQL & AWS S3 Storage
cloudRouter.get('/status', (req: Request, res: Response) => {
  try {
    const dbStatus = getConnectionStatus();
    const storageStatus = getStorageStatus();
    res.json({
      success: true,
      data: {
        database: {
          engine: 'Azure Database for MySQL Flexible Server',
          ...dbStatus,
        },
        storage: {
          service: 'Amazon Simple Storage Service (AWS S3)',
          ...storageStatus,
        },
        concurrencyLimit: '100+ concurrent operators',
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/cloud/test-connection - Test Azure MySQL Flexible Server connection
cloudRouter.post('/test-connection', requirePermission('manage_settings'), async (req: Request, res: Response) => {
  try {
    const result = await testMysqlConnection();
    res.json({ success: result.ok, message: result.message });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/cloud/test-storage - Test AWS S3 bucket connectivity and credentials
cloudRouter.post('/test-storage', requirePermission('manage_settings'), async (req: Request, res: Response) => {
  try {
    const result = await testS3Connection();
    res.json({ success: result.ok, message: result.message });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/cloud/run-migrations - Run DDL table creation on Azure MySQL Flexible Server
cloudRouter.post('/run-migrations', requirePermission('manage_settings'), async (req: Request, res: Response) => {
  try {
    const result = await runMysqlMigrations();
    res.json({ success: result.success, message: result.message });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/cloud/seed-from-local - Transfer snapshot to Azure MySQL Flexible Server
cloudRouter.post('/seed-from-local', requirePermission('manage_settings'), async (req: Request, res: Response) => {
  try {
    const result = await seedMysqlFromSnapshot();
    res.json({ success: result.success, message: result.message });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/cloud/storage/presigned-url - Generate AWS S3 pre-signed upload URL for evidence
cloudRouter.post('/storage/presigned-url', requirePermission('manage_evidence'), async (req: Request, res: Response) => {
  try {
    const { filePath, contentType } = req.body;
    if (!filePath || !contentType) {
      return res.status(400).json({ success: false, error: 'filePath and contentType are required' });
    }

    const result = await generatePresignedUploadUrl(filePath, contentType);
    if (!result) {
      return res.json({
        success: false,
        fallbackMode: true,
        message: 'AWS S3 is not configured. Storing documents in local evidence vault.',
      });
    }

    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/cloud/test-transactions - Validate multi-table ACID transactions under concurrency
cloudRouter.post('/test-transactions', requirePermission('manage_settings'), async (req: Request, res: Response) => {
  try {
    const workersCount = Math.min(Math.max(parseInt(req.body.workersCount || '10', 10), 1), 50);
    const result = await runConcurrencyStressTest(workersCount);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

