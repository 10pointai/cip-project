import { Router, Request, Response } from 'express';
import { serverDb } from '../db';
import { authenticateToken, requirePermission } from '../middleware/auth';

export const backupRouter = Router();

backupRouter.use(authenticateToken);

// GET /api/backup/export
backupRouter.get('/export', requirePermission('manage_settings'), (req: Request, res: Response) => {
  try {
    const snapshot = serverDb.getFullSnapshot();
    res.setHeader('Content-Disposition', `attachment; filename=ops_backup_${Date.now()}.json`);
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(snapshot, null, 2));
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/backup/restore
backupRouter.post('/restore', requirePermission('manage_settings'), (req: Request, res: Response) => {
  try {
    const payload = req.body;
    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ success: false, error: 'Valid JSON backup object required' });
    }
    const success = serverDb.restoreSnapshot(payload);
    if (success) {
      res.json({ success: true, message: 'Database successfully restored from snapshot' });
    } else {
      res.status(400).json({ success: false, error: 'Failed to restore snapshot' });
    }
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/backup/reset
backupRouter.post('/reset', requirePermission('manage_settings'), (req: Request, res: Response) => {
  try {
    serverDb.resetToDefaults();
    res.json({ success: true, message: 'Database reset to clean production baseline.' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/backup/purge-demo
backupRouter.post('/purge-demo', requirePermission('manage_settings'), (req: Request, res: Response) => {
  try {
    serverDb.resetToDefaults();
    res.json({ success: true, message: 'All demo data has been purged. Database is now in a clean, production-ready state.' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});
