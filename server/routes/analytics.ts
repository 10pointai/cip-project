import { Router, Request, Response } from 'express';
import { serverDb } from '../db';
import { authenticateToken } from '../middleware/auth';

export const analyticsRouter = Router();

analyticsRouter.use(authenticateToken);

// GET /api/analytics/summary
analyticsRouter.get('/summary', (req: Request, res: Response) => {
  try {
    const summary = serverDb.getAnalytics();
    res.json({ success: true, data: summary });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/analytics/audit-logs
analyticsRouter.get('/audit-logs', (req: Request, res: Response) => {
  try {
    const snapshot = serverDb.getFullSnapshot();
    res.json({ success: true, count: snapshot.auditLogs?.length || 0, data: snapshot.auditLogs || [] });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});
